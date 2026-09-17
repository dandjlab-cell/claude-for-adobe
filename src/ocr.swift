// What macOS itself can see in a frame, so the panel never guesses. One binary; with no flag it runs EVERY
// detector on the frame in one pass and prints one line with all of it (the owner, 2026-09-16 01:50: "why are
// we limiting Apple Vision at all"): text, faces, hands, the subject's extent, the person's extent. A flag
// narrows it to one section (the older callers) and is the only way a mask PNG is written.
//   bin/ocr <image...>           everything: {"file":"...","items":[...],"faces":[...],"hands":[...],
//                                            "subject":{"coverage":..,"box":[..]},"person":{"coverage":..,"box":[..]}}
//   bin/ocr --text <image...>    text: {"file":"...","items":[{"text":"Codex","conf":0.98,"box":[x0,y0,x1,y1]}]}
//   bin/ocr --hands <image...>   hands: {"file":"...","hands":[{"box":[..],"chirality":"left|right|unknown","confidence":0..1}]}
//                                Vision's hand pose (21 joints a hand); the box is the joints' extent. Skin work
//                                keys the skin colour range inside these boxes, so an oak table never counts as a hand.
//   bin/ocr --person <image...>  person: {"file":"...","mask":"<image>.person.png","coverage":0..1,"box":[..]}
//                                Vision's person segmentation (people, clothes included) as an 8-bit mask image.
//   bin/ocr --sounds <audio>     sounds: one line per window {"t0":s,"t1":s,"labels":[["laughter",0.71],...]} using Apple's
//                                303-class sound classifier (laughter, applause, cheering, sigh, gasp, speech, music, silence...)
//   bin/ocr --faces <image...>   faces: {"file":"...","faces":[{"box":[..],"yaw":deg,"pitch":deg,"roll":deg,
//                                        "quality":0..1,"eyes":ratio,"mouth":ratio,"facing":0..,"tilt":0..1}]}
//   bin/ocr --grade <image...>   what a colour read needs in one pass: {"file":"...","faces":[..],"hands":[..],
//                                "subject":{"mask":"<image>.mask.png","coverage":..,"box":[..]}} - no text
//                                recognition, no person segmentation, and the subject segmented once.
//   bin/ocr --subject <image...> subject: {"file":"...","mask":"<image>.mask.png","coverage":0..1,"box":[x0,y0,x1,y1]}
//                                Vision's foreground-instance mask: whatever the subject is (a face, hands, a product),
//                                as an 8-bit mask image the same size as the frame, white where the subject is. This
//                                is what colour work measures - the subject, not the room - with no special-casing.
// Boxes are fractions of the image, origin top-left. yaw/pitch are Vision's head pose in degrees: both near zero
// means the head faces the lens. quality is Apple's own face capture quality (sharpness, lighting, expression).
// eyes and mouth are opening ratios from the landmarks (height / width), so a blink and a closed mouth are visible.
// facing and tilt are measured from the landmarks because Vision's own yaw is quantised to 45 degree steps:
// facing is the nose's offset from the midpoint of the eyes over the distance between them (0 = square to the
// lens), tilt is the nose's height between the eye line and the mouth (about 0.5 level, lower = head dropped).
// Nothing here reads emotion; it reports geometry and image quality only.
// Build: swiftc -O -o bin/ocr src/ocr.swift -framework Vision -framework AppKit; codesign -s - bin/ocr
import AppKit
import Foundation
import Vision

func json(_ s: String) -> String {
  let d = try! JSONSerialization.data(withJSONObject: [s])
  let arr = String(data: d, encoding: .utf8)!
  return String(arr.dropFirst().dropLast())
}

// Opening ratio of a landmark region: its height divided by its width, 0 when Vision gave no points.
func openness(_ region: VNFaceLandmarkRegion2D?) -> Double {
  guard let pts = region?.normalizedPoints, pts.count > 1 else { return 0 }
  let xs = pts.map { Double($0.x) }, ys = pts.map { Double($0.y) }
  let w = (xs.max()! - xs.min()!), h = (ys.max()! - ys.min()!)
  return w > 0 ? h / w : 0
}

func num(_ v: Double) -> String { return String(format: "%.4f", v) }

// Mean point of a landmark region, in the face box's own 0-1 space.
func centre(_ r: VNFaceLandmarkRegion2D?) -> (x: Double, y: Double)? {
  guard let pts = r?.normalizedPoints, !pts.isEmpty else { return nil }
  let n = Double(pts.count)
  return (pts.reduce(0.0) { $0 + Double($1.x) } / n, pts.reduce(0.0) { $0 + Double($1.y) } / n)
}

func faces(_ cg: CGImage, _ file: String) -> String {
  let landmarks = VNDetectFaceLandmarksRequest()
  // Head pose (yaw, and pitch on macOS 13+) only comes from revision 3; the default revision returns zeros.
  if VNDetectFaceLandmarksRequest.supportedRevisions.contains(VNDetectFaceLandmarksRequestRevision3) {
    landmarks.revision = VNDetectFaceLandmarksRequestRevision3
  }
  let quality = VNDetectFaceCaptureQualityRequest()
  let handler = VNImageRequestHandler(cgImage: cg, options: [:])
  do { try handler.perform([landmarks, quality]) } catch {
    return "\"faces\":null,\"facesError\":\(json(String(describing: error)))"
  }
  let quals = quality.results ?? []
  var out: [String] = []
  for obs in landmarks.results ?? [] {
    let b = obs.boundingBox
    // Match this face to its quality observation by box overlap: both requests see the same faces.
    var q = -1.0
    for qo in quals where abs(qo.boundingBox.midX - b.midX) < 0.05 && abs(qo.boundingBox.midY - b.midY) < 0.05 {
      if let v = qo.faceCaptureQuality { q = Double(v) }
    }
    let yaw = obs.yaw.map { Double(truncating: $0) * 180 / Double.pi } ?? Double.nan
    let pitch = obs.pitch.map { Double(truncating: $0) * 180 / Double.pi } ?? Double.nan
    let roll = obs.roll.map { Double(truncating: $0) * 180 / Double.pi } ?? Double.nan
    let lm = obs.landmarks
    // Vision's yaw is quantised to 45 degree steps, too coarse for "is he looking at the lens", so measure it
    // from the landmarks instead. facing: how far the nose sits from the midpoint between the eyes, as a
    // fraction of the distance between them. 0 = square to the lens, 0.5 = well turned away. tilt: where the
    // nose sits between the eye line and the mouth, 0.5 is level, lower means the head is dropped (reading).
    var facing = Double.nan, tilt = Double.nan
    if let le = centre(lm?.leftEye), let re = centre(lm?.rightEye), let no = centre(lm?.nose) {
      let span = abs(re.x - le.x)
      if span > 0.01 { facing = abs(no.x - (le.x + re.x) / 2) / span }
      if let mo = centre(lm?.outerLips) {
        let drop = (le.y + re.y) / 2 - mo.y
        if abs(drop) > 0.01 { tilt = ((le.y + re.y) / 2 - no.y) / drop }
      }
    }
    let eyes = (openness(lm?.leftEye) + openness(lm?.rightEye)) / 2
    let mouth = openness(lm?.innerLips) > 0 ? openness(lm?.innerLips) : openness(lm?.outerLips)
    func opt(_ v: Double) -> String { return v.isNaN ? "null" : num(v) }
    out.append("{\"box\":[\(num(Double(b.minX))),\(num(1 - Double(b.maxY))),\(num(Double(b.maxX))),\(num(1 - Double(b.minY)))],"
      + "\"yaw\":\(opt(yaw)),\"pitch\":\(opt(pitch)),\"roll\":\(opt(roll)),"
      + "\"quality\":\(q < 0 ? "null" : num(q)),\"eyes\":\(num(eyes)),\"mouth\":\(num(mouth)),"
      + "\"facing\":\(opt(facing)),\"tilt\":\(opt(tilt))}")
  }
  return "\"faces\":[\(out.joined(separator: ","))]"
}

// Hands, from Vision's hand pose: the joints' extent as a box, which hand it is, and the joints' mean confidence.
func hands(_ cg: CGImage, _ file: String) -> String {
  let req = VNDetectHumanHandPoseRequest()
  req.maximumHandCount = 6
  let handler = VNImageRequestHandler(cgImage: cg, options: [:])
  do { try handler.perform([req]) } catch { return "\"hands\":null,\"handsError\":\(json(String(describing: error)))" }
  var out: [String] = []
  for obs in req.results ?? [] {
    guard let pts = try? obs.recognizedPoints(.all) else { continue }
    let good = pts.values.filter { $0.confidence > 0.3 }
    guard good.count >= 5 else { continue }
    let xs = good.map { Double($0.location.x) }, ys = good.map { Double($0.location.y) }
    let conf = good.reduce(0.0) { $0 + Double($1.confidence) } / Double(good.count)
    var side = "unknown"
    if #available(macOS 12.0, *) { side = obs.chirality == .left ? "left" : obs.chirality == .right ? "right" : "unknown" }
    out.append("{\"box\":[\(num(xs.min()!)),\(num(1 - ys.max()!)),\(num(xs.max()!)),\(num(1 - ys.min()!))],\"chirality\":\(json(side)),\"confidence\":\(num(conf)),\"joints\":\(good.count)}")
  }
  return "\"hands\":[\(out.joined(separator: ","))]"
}

// A mask (Float32 or 8-bit, one channel) to coverage, extent and, when asked, an 8-bit PNG at the frame's
// size (`scaleTo`): person segmentation comes back at Vision's own 512x384, and the panel lines masks up
// with the frame pixel for pixel.
func maskStats(_ buffer: CVPixelBuffer, writeTo maskPath: String?, scaleTo: (Int, Int)? = nil) -> (coverage: Double, box: String, error: String?) {
  CVPixelBufferLockBaseAddress(buffer, .readOnly); defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
  let w = CVPixelBufferGetWidth(buffer), h = CVPixelBufferGetHeight(buffer), stride = CVPixelBufferGetBytesPerRow(buffer)
  let isFloat = CVPixelBufferGetPixelFormatType(buffer) == kCVPixelFormatType_OneComponent32Float
  guard let base = CVPixelBufferGetBaseAddress(buffer) else { return (0, "null", "empty mask") }
  var grey = [UInt8](repeating: 0, count: w * h)
  var on = 0, x0 = w, y0 = h, x1 = -1, y1 = -1
  for y in 0..<h {
    for x in 0..<w {
      let v: Float = isFloat ? base.advanced(by: y * stride).assumingMemoryBound(to: Float.self)[x] : Float(base.advanced(by: y * stride).assumingMemoryBound(to: UInt8.self)[x]) / 255
      grey[y * w + x] = UInt8(max(0, min(255, v * 255)))
      if v >= 0.5 { on += 1; if x < x0 { x0 = x }; if x > x1 { x1 = x }; if y < y0 { y0 = y }; if y > y1 { y1 = y } }
    }
  }
  if let maskPath = maskPath {
    let cs = CGColorSpaceCreateDeviceGray()
    guard let ctx = CGContext(data: &grey, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: cs, bitmapInfo: CGImageAlphaInfo.none.rawValue),
          var out = ctx.makeImage(),
          let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: maskPath) as CFURL, "public.png" as CFString, 1, nil) else { return (0, "null", "could not write mask") }
    if let (tw, th) = scaleTo, tw != w || th != h {
      guard let sctx = CGContext(data: nil, width: tw, height: th, bitsPerComponent: 8, bytesPerRow: tw, space: cs, bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return (0, "null", "could not scale mask") }
      sctx.interpolationQuality = .high
      sctx.draw(out, in: CGRect(x: 0, y: 0, width: tw, height: th))
      guard let scaled = sctx.makeImage() else { return (0, "null", "could not scale mask") }
      out = scaled
    }
    CGImageDestinationAddImage(dest, out, nil)
    guard CGImageDestinationFinalize(dest) else { return (0, "null", "could not finalize mask") }
  }
  let coverage = Double(on) / Double(w * h)
  let box = on > 0 ? "[\(num(Double(x0) / Double(w))),\(num(Double(y0) / Double(h))),\(num(Double(x1 + 1) / Double(w))),\(num(Double(y1 + 1) / Double(h)))]" : "null"
  return (coverage, box, nil)
}

// People (clothes included), from Vision's person segmentation (macOS 12+).
func person(_ cg: CGImage, _ file: String, writeMask: Bool) -> String {
  guard #available(macOS 12.0, *) else { return "\"person\":null" }
  let req = VNGeneratePersonSegmentationRequest()
  req.qualityLevel = .balanced
  req.outputPixelFormat = kCVPixelFormatType_OneComponent8
  let handler = VNImageRequestHandler(cgImage: cg, options: [:])
  do { try handler.perform([req]) } catch { return "\"person\":null,\"personError\":\(json(String(describing: error)))" }
  guard let obs = req.results?.first else { return "\"person\":null" }
  let path = writeMask ? file + ".person.png" : nil
  let r = maskStats(obs.pixelBuffer, writeTo: path, scaleTo: (cg.width, cg.height))
  if let e = r.error { return "\"person\":null,\"personError\":\(json(e))" }
  return "\"person\":{\"mask\":\(path.map { json($0) } ?? "null"),\"coverage\":\(num(r.coverage)),\"box\":\(r.box)}"
}

// The foreground subject as a mask, from Vision's instance segmentation (macOS 14+). All instances are merged:
// "the subject" for a grade is everything in front, and the panel measures pixels, not identities.
func subject(_ cg: CGImage, _ file: String, writeMask: Bool) -> String {
  guard #available(macOS 14.0, *) else { return "\"subject\":null,\"subjectError\":\"macOS 14 or later needed for subject masks\"" }
  let req = VNGenerateForegroundInstanceMaskRequest()
  let handler = VNImageRequestHandler(cgImage: cg, options: [:])
  do { try handler.perform([req]) } catch { return "\"subject\":null,\"subjectError\":\(json(String(describing: error)))" }
  guard let obs = req.results?.first, !obs.allInstances.isEmpty else { return "\"subject\":{\"mask\":null,\"coverage\":0,\"box\":null}" }
  let buffer: CVPixelBuffer
  do { buffer = try obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler) } catch { return "\"subject\":null,\"subjectError\":\(json(String(describing: error)))" }
  let path = writeMask ? file + ".mask.png" : nil
  let r = maskStats(buffer, writeTo: path)
  if let e = r.error { return "\"subject\":null,\"subjectError\":\(json(e))" }
  return "\"subject\":{\"mask\":\(path.map { json($0) } ?? "null"),\"coverage\":\(num(r.coverage)),\"box\":\(r.box)}"
}

import SoundAnalysis

// Apple's built-in sound classifier over an audio file, one JSON line per one-second window (half-second hop),
// listing every label at or above 0.1 confidence. The panel turns windows into segments.
final class SoundSink: NSObject, SNResultsObserving {
  func request(_ request: SNRequest, didProduce result: SNResult) {
    guard let r = result as? SNClassificationResult else { return }
    let t0 = r.timeRange.start.seconds, t1 = t0 + r.timeRange.duration.seconds
    let labels = r.classifications.filter { $0.confidence >= 0.1 }.prefix(6).map { "[\(json($0.identifier)),\(num(Double($0.confidence)))]" }
    print("{\"t0\":\(num(t0)),\"t1\":\(num(t1)),\"labels\":[\(labels.joined(separator: ","))]}")
  }
  func request(_ request: SNRequest, didFailWithError error: Error) { print("{\"error\":\(json(String(describing: error)))}") }
  func requestDidComplete(_ request: SNRequest) {}
}

func sounds(_ file: String) {
  guard let analyzer = try? SNAudioFileAnalyzer(url: URL(fileURLWithPath: file)) else { print("{\"error\":\"unreadable audio\"}"); return }
  guard let req = try? SNClassifySoundRequest(classifierIdentifier: .version1) else { print("{\"error\":\"no classifier\"}"); return }
  req.windowDuration = CMTimeMakeWithSeconds(1.0, preferredTimescale: 48000)
  req.overlapFactor = 0.5
  let sink = SoundSink()
  do { try analyzer.add(req, withObserver: sink) } catch { print("{\"error\":\(json(String(describing: error)))}"); return }
  analyzer.analyze()
}

func text(_ cg: CGImage, _ file: String) -> String {
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false
  let handler = VNImageRequestHandler(cgImage: cg, options: [:])
  do { try handler.perform([req]) } catch { return "\"items\":null,\"textError\":\(json(String(describing: error)))" }
  var items: [String] = []
  for obs in req.results ?? [] {
    guard let c = obs.topCandidates(1).first else { continue }
    let b = obs.boundingBox
    items.append("{\"text\":\(json(c.string)),\"conf\":\(c.confidence),\"box\":[\(b.minX),\(1 - b.maxY),\(b.maxX),\(1 - b.minY)]}")
  }
  return "\"items\":[\(items.joined(separator: ","))]"
}

// "subject":{...} -> the object's own fields; "subject":null,"subjectError":... -> "error":...
func flat(_ fragment: String, _ key: String) -> String {
  if fragment.hasPrefix("\"\(key)\":{") { return String(fragment.dropFirst(key.count + 4).dropLast()) }
  if let r = fragment.range(of: "\"\(key)Error\":") { return "\"error\":" + fragment[r.upperBound...] }
  return "\"mask\":null,\"coverage\":0"
}

var args = Array(CommandLine.arguments.dropFirst())
var mode = "all"
if let f = args.first, f.hasPrefix("--") { mode = String(f.dropFirst(2)); args = Array(args.dropFirst()) }
if mode == "sounds" { for f in args { sounds(f) }; exit(0) }

for file in args {
  guard let img = NSImage(contentsOfFile: file), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("{\"file\":\(json(file)),\"error\":\"unreadable\"}"); continue
  }
  var parts: [String] = []
  switch mode {
  case "faces": parts.append(faces(cg, file))
  // The mask modes keep their flat shape ({"file","mask","coverage","box"}): the panel's subject reads parse it.
  case "subject": let f = subject(cg, file, writeMask: true); print("{\"file\":\(json(file)),\(flat(f, "subject"))}"); continue
  case "person": let f = person(cg, file, writeMask: true); print("{\"file\":\(json(file)),\(flat(f, "person"))}"); continue
  case "hands": parts.append(hands(cg, file))
  case "text": parts.append(text(cg, file))
  // What a colour read needs and nothing else. The default mode costs 522ms on a 1536x864 frame and a
  // grade calls it once per rendered frame: of that, text recognition (~90ms) and person segmentation
  // (~25ms) are never looked at by the colour path, and its subject pass runs the instance segmentation
  // and throws the mask away - so the panel had to call --subject straight after and segment AGAIN
  // (~170ms). One call, ~300ms, same three answers the grade reads (measured 2026-09-17 13:33).
  case "grade": parts = [faces(cg, file), hands(cg, file), subject(cg, file, writeMask: true)]
  default: parts = [text(cg, file), faces(cg, file), hands(cg, file), subject(cg, file, writeMask: false), person(cg, file, writeMask: false)]
  }
  print("{\"file\":\(json(file)),\(parts.joined(separator: ","))}")
}
