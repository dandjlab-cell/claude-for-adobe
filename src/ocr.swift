// What macOS itself can see in a frame, so the panel never guesses. Two modes, one binary:
//   bin/ocr <image...>           text: {"file":"...","items":[{"text":"Codex","conf":0.98,"box":[x0,y0,x1,y1]}]}
//   bin/ocr --faces <image...>   faces: {"file":"...","faces":[{"box":[..],"yaw":deg,"pitch":deg,"roll":deg,
//                                        "quality":0..1,"eyes":ratio,"mouth":ratio,"facing":0..,"tilt":0..1}]}
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

func faces(_ cg: CGImage, _ file: String) {
  let landmarks = VNDetectFaceLandmarksRequest()
  // Head pose (yaw, and pitch on macOS 13+) only comes from revision 3; the default revision returns zeros.
  if VNDetectFaceLandmarksRequest.supportedRevisions.contains(VNDetectFaceLandmarksRequestRevision3) {
    landmarks.revision = VNDetectFaceLandmarksRequestRevision3
  }
  let quality = VNDetectFaceCaptureQualityRequest()
  let handler = VNImageRequestHandler(cgImage: cg, options: [:])
  do { try handler.perform([landmarks, quality]) } catch {
    print("{\"file\":\(json(file)),\"error\":\(json(String(describing: error)))}"); return
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
  print("{\"file\":\(json(file)),\"faces\":[\(out.joined(separator: ","))]}")
}

var args = Array(CommandLine.arguments.dropFirst())
let wantFaces = args.first == "--faces"
if wantFaces { args = Array(args.dropFirst()) }

for file in args {
  guard let img = NSImage(contentsOfFile: file), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("{\"file\":\(json(file)),\"error\":\"unreadable\"}"); continue
  }
  if wantFaces { faces(cg, file); continue }
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false
  let handler = VNImageRequestHandler(cgImage: cg, options: [:])
  do { try handler.perform([req]) } catch { print("{\"file\":\(json(file)),\"error\":\(json(String(describing: error)))}"); continue }
  var items: [String] = []
  for obs in req.results ?? [] {
    guard let c = obs.topCandidates(1).first else { continue }
    let b = obs.boundingBox
    items.append("{\"text\":\(json(c.string)),\"conf\":\(c.confidence),\"box\":[\(b.minX),\(1 - b.maxY),\(b.maxX),\(1 - b.minY)]}")
  }
  print("{\"file\":\(json(file)),\"items\":[\(items.joined(separator: ","))]}")
}
