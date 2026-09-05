// Text on screen, using macOS's built-in recognizer (Vision). One JSON line per image:
// {"file":"...","items":[{"text":"Codex","conf":0.98,"box":[x0,y0,x1,y1]}]} with the box as fractions of the
// image, origin top-left. Build: swiftc -O -o bin/ocr src/ocr.swift -framework Vision -framework AppKit; codesign -s - bin/ocr
import AppKit
import Foundation
import Vision

func json(_ s: String) -> String {
  let d = try! JSONSerialization.data(withJSONObject: [s])
  let arr = String(data: d, encoding: .utf8)!
  return String(arr.dropFirst().dropLast())
}

for file in CommandLine.arguments.dropFirst() {
  guard let img = NSImage(contentsOfFile: file), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("{\"file\":\(json(file)),\"error\":\"unreadable\"}"); continue
  }
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
