// DOES IT DRAW? — a WKWebView that loads a real page, waits for it to paint, and snapshots
// ITS OWN VIEW. No screen grab, no window server capture, no macOS permission of any kind.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────
//
// Two instruments were tried first and both failed, in ways worth recording because each
// looked authoritative:
//
//   `screencapture` returns "could not create image from display". That is TCC — Screen
//     Recording is an owner-granted permission this process does not hold, and there is no
//     code path around it. It is not a statement about the app.
//   The System Events window enumeration returned 0 windows for the app under test. It also
//     returned 0 for Finder and 0 for Claude while returning 4 for Brave. An enumeration
//     that misses two known-visible applications cannot convict a third.
//
// `WKWebView.takeSnapshot` is a different category of thing. It asks the web view to render
// its own content into a bitmap inside this process. Nothing is read off the display, so no
// display permission is involved, and the answer is about the page rather than about what
// happens to be in front of it.
//
// ── WHAT A SNAPSHOT PROVES, AND WHAT IT CANNOT ──────────────────────────────────────
//
// A snapshot of a view that never painted looks exactly like a snapshot of a surface that
// refused: both are a rectangle of one colour. So the snapshot alone is worth nothing. What
// makes it evidence is the pair of controls the caller is REQUIRED to run around it —
// a page whose exact pixel pattern is authored here and must come back, and a blank page
// whose statistics must collapse. `verify-app-renders.mjs` runs both before it will report
// anything about the app, and this file is built to make both cheap.
//
// It proves the frontend renders in WKWebView on this machine. It does NOT prove the
// packaged .app presents a window: a Tauri window is Tauri's own Rust code creating an
// NSWindow and a wry WebView, and this bypasses all of it. Both statements belong in any
// report that quotes these numbers.
//
// ── STATISTICS ──────────────────────────────────────────────────────────────────────
//
// Mean luminance, population standard deviation, and the count of distinct 8-bit RGB
// triples — the same three the rest of this repository measures captures with, computed
// with the same Rec.709 coefficients, so the numbers are comparable to every other capture
// in the programme. They are computed from the SAME buffer the PNG is written from, so a
// reader who re-measures the PNG with PIL must get the same answer; `verify-app-renders.mjs`
// does exactly that as an instrument check.
//
// ── USAGE ───────────────────────────────────────────────────────────────────────────
//
//   webview-render-probe --url <URL> --out <png> [--width N] [--height N]
//                        [--ready-js <expr>] [--settle-ms N] [--timeout-s N]
//                        [--probe x,y] ... [--dom-js <expr>]
//
// One JSON object on stdout. Exit 0 = a snapshot was produced (it says nothing about
// whether the snapshot is any good — that is the caller's job); 2 = could not run; 3 =
// timed out before the page was ready.

import Cocoa
import WebKit

// ── ARGUMENTS ───────────────────────────────────────────────────────────────────────

func argValue(_ name: String) -> String? {
  let a = CommandLine.arguments
  guard let i = a.firstIndex(of: name), i + 1 < a.count else { return nil }
  return a[i + 1]
}
func argValues(_ name: String) -> [String] {
  var out: [String] = []
  let a = CommandLine.arguments
  for (i, v) in a.enumerated() where v == name && i + 1 < a.count { out.append(a[i + 1]) }
  return out
}
func fail(_ msg: String, _ code: Int32) -> Never {
  FileHandle.standardError.write(("PROBE-CANNOT-RUN: " + msg + "\n").data(using: .utf8)!)
  exit(code)
}

guard let urlArg = argValue("--url") else { fail("--url is required", 2) }
guard let outArg = argValue("--out") else { fail("--out is required", 2) }
let width = Int(argValue("--width") ?? "1440") ?? 1440
let height = Int(argValue("--height") ?? "900") ?? 900
let readyJS = argValue("--ready-js")
let domJS = argValue("--dom-js")
// Injected at documentStart, in the page's own world, BEFORE any application script runs.
// This is the hook that lets the caller reproduce something the container provides — the
// Tauri v2 webview injects its internals object before app code evaluates, and a frontend
// that branches on that object will otherwise take the browser path here and render a
// different surface than the app shows. What gets injected is chosen and documented by the
// caller, not hard-coded here, so this file cannot go stale when the marker changes.
let injectJS = argValue("--inject-js")
let settleMs = Int(argValue("--settle-ms") ?? "600") ?? 600
let timeoutS = Double(argValue("--timeout-s") ?? "45") ?? 45
// Each `--probe x,y` samples one pixel of the snapshot in CSS points and reports its exact
// colour. This is what turns the positive control from "the picture is busy" into "the
// square I authored at (120,80) is #E11D48" — a spatial claim, which a flat fill cannot
// accidentally satisfy.
let probePoints: [(Int, Int)] = argValues("--probe").compactMap { s in
  let p = s.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
  return p.count == 2 ? (p[0], p[1]) : nil
}

guard let url = URL(string: urlArg) else { fail("could not parse --url \(urlArg)", 2) }

// ── JSON EMIT ───────────────────────────────────────────────────────────────────────
// Hand-rolled rather than Codable: the payload is a handful of scalars and building a
// type hierarchy for it would obscure what is being reported.

func jstr(_ s: String) -> String {
  var o = "\""
  for c in s.unicodeScalars {
    switch c {
    case "\"": o += "\\\""
    case "\\": o += "\\\\"
    case "\n": o += "\\n"
    case "\r": o += "\\r"
    case "\t": o += "\\t"
    default:
      if c.value < 0x20 { o += String(format: "\\u%04x", c.value) } else { o.unicodeScalars.append(c) }
    }
  }
  return o + "\""
}
func jnum(_ d: Double) -> String { d.isFinite ? String(format: "%.6f", d) : "null" }

var report: [String] = []
func put(_ k: String, _ v: String) { report.append("\(jstr(k)):\(v)") }
func emitAndExit(_ code: Int32) -> Never {
  print("{" + report.joined(separator: ",") + "}")
  exit(code)
}

put("url", jstr(urlArg))
put("requestedWidth", "\(width)")
put("requestedHeight", "\(height)")

// ── PIXEL STATISTICS ────────────────────────────────────────────────────────────────
//
// The snapshot arrives as an NSImage whose backing may be Retina-scaled. Everything below
// works on a bitmap WE allocate — a straight 8-bit sRGB RGBA buffer — so the numbers do not
// depend on whatever internal representation WebKit chose, and so the PNG written to disk is
// byte-for-byte the buffer that produced the statistics.

struct Stats {
  var pixelWidth = 0, pixelHeight = 0
  var meanLuminance = 0.0, sdLuminance = 0.0
  var minLuminance = 0.0, maxLuminance = 0.0
  var distinctColors = 0
  var png: Data? = nil
  var probes: [(Int, Int, String)] = []
}

func measure(_ image: NSImage, scale: CGFloat) -> Stats? {
  var rect = CGRect(x: 0, y: 0, width: image.size.width, height: image.size.height)
  guard let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { return nil }

  let w = cg.width, h = cg.height
  guard w > 0, h > 0 else { return nil }
  let bytesPerRow = w * 4
  var buf = [UInt8](repeating: 0, count: bytesPerRow * h)
  guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
  // noneSkipLast: opaque RGB in the low three bytes, no premultiplication to undo. A
  // premultiplied buffer would make every statistic below a function of alpha as well as
  // colour, which is not what any other capture in this repo measures.
  guard let ctx = buf.withUnsafeMutableBytes({ raw in
    CGContext(data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8,
              bytesPerRow: bytesPerRow, space: space,
              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
  }) else { return nil }
  ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))

  var s = Stats()
  s.pixelWidth = w
  s.pixelHeight = h

  var sum = 0.0
  var lo = Double.infinity, hi = -Double.infinity
  var seen = Set<UInt32>()
  seen.reserveCapacity(1 << 16)
  var lum = [Double](repeating: 0, count: w * h)
  for y in 0..<h {
    let row = y * bytesPerRow
    for x in 0..<w {
      let i = row + x * 4
      let r = Double(buf[i]), g = Double(buf[i + 1]), b = Double(buf[i + 2])
      // Rec.709 luminance — the same coefficients used by every other capture measurement
      // in this repository, so the numbers can be set beside them.
      let l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      lum[y * w + x] = l
      sum += l
      if l < lo { lo = l }
      if l > hi { hi = l }
      seen.insert(UInt32(buf[i]) << 16 | UInt32(buf[i + 1]) << 8 | UInt32(buf[i + 2]))
    }
  }
  let n = Double(w * h)
  let mean = sum / n
  s.meanLuminance = mean
  // Population standard deviation (ddof=0) — numpy's `.std()` default, which is what the
  // Python recipe elsewhere in this repo uses.
  //
  // TWO PASSES, DELIBERATELY. The one-pass E[x²]−E[x]² form is algebraically identical and
  // numerically is not: on a flat white page it returned 0.000004 instead of 0, because the
  // two large sums cancel. The negative control's whole job is to show the variance
  // COLLAPSE, and a control that reports a small non-zero number where zero is correct is
  // exactly the kind of instrument this programme has been misled by. A second pass over
  // five million doubles costs milliseconds.
  var acc = 0.0
  for l in lum { let d = l - mean; acc += d * d }
  s.sdLuminance = (acc / n).squareRoot()
  s.minLuminance = lo.isFinite ? lo : 0
  s.maxLuminance = hi.isFinite ? hi : 0
  s.distinctColors = seen.count

  for (px, py) in probePoints {
    // Probe coordinates are given in CSS points; the buffer may be Retina. Convert, then
    // clamp, and report the sampled pixel so a caller can see if it was clamped.
    let bx = min(max(Int(Double(px) * Double(scale)), 0), w - 1)
    let by = min(max(Int(Double(py) * Double(scale)), 0), h - 1)
    let i = by * bytesPerRow + bx * 4
    s.probes.append((px, py, String(format: "#%02X%02X%02X", buf[i], buf[i + 1], buf[i + 2])))
  }

  if let outCG = ctx.makeImage() {
    let rep = NSBitmapImageRep(cgImage: outCG)
    s.png = rep.representation(using: .png, properties: [:])
  }
  return s
}

// ── THE HARNESS ─────────────────────────────────────────────────────────────────────

let app = NSApplication.shared
app.setActivationPolicy(.accessory)   // no Dock icon, never steals focus

final class Driver: NSObject, WKNavigationDelegate {
  var didFinish = false
  var navError: String? = nil
  var httpStatus: Int = -1
  var readyWaitedMs = 0
  var consoleErrors: [String] = []

  func webView(_ w: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
               decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
    if let http = navigationResponse.response as? HTTPURLResponse, httpStatus < 0 {
      httpStatus = http.statusCode
    }
    decisionHandler(.allow)
  }
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) { didFinish = true }
  func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) {
    navError = "didFail: \(e.localizedDescription)"
  }
  func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) {
    // The one that fires when App Transport Security refuses a plain-http origin, or the
    // server is not listening. Distinguishing it from didFail matters: a provisional
    // failure means nothing was ever loaded, so a blank snapshot is about the LOAD.
    navError = "didFailProvisionalNavigation: \(e.localizedDescription)"
  }
  func webViewWebContentProcessDidTerminate(_ w: WKWebView) {
    navError = "web content process terminated"
  }
}

let driver = Driver()
let config = WKWebViewConfiguration()

/*
 * AN EPHEMERAL DATA STORE, AND IT IS NOT HYGIENE — IT IS A BUG FIX.
 *
 * WKWebView's default store is PERSISTENT and shared by every process that uses it, so
 * localStorage written by one run of this probe is still there for the next one. That was
 * measured, not anticipated: a run that seeded a signed-in operator to reach the shell left
 * the seed on disk, and the FOLLOWING run's "browser branch" surface — which is supposed to
 * land on the public page — came back as the signed-in shell instead, 410 elements and all.
 * Three surfaces reported identical statistics and the script called all three a pass.
 *
 * That is the exact failure this whole file exists to avoid: an instrument returning a
 * confident number about the wrong thing. It also went unseen on the first run of a session,
 * because the store starts empty — so the bug only appears the SECOND time anyone runs it,
 * which is the worst possible shape for a verification script.
 *
 * A non-persistent store gives every run the same empty starting state. Worth stating as a
 * difference from the app: LCXOS itself uses a persistent store — the operator's theme and
 * session survive a relaunch — so this harness deliberately does NOT reproduce that, and
 * cannot be used to ask questions about persistence across launches.
 */
config.websiteDataStore = WKWebsiteDataStore.nonPersistent()
// Match the shipping app's webview in the one respect that changes what a page may do:
// wry enables JavaScript and allows file access for the app bundle. Nothing here is a
// capability the app does not have.
config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
config.defaultWebpagePreferences.allowsContentJavaScript = true
if let inject = injectJS {
  config.userContentController.addUserScript(
    WKUserScript(source: inject, injectionTime: .atDocumentStart, forMainFrameOnly: true))
}

let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: height), configuration: config)
wv.navigationDelegate = driver

// An unparented WKWebView can be refused a GPU process, and a view with no window may never
// be asked to paint at all — either would be a false negative about an app whose web view IS
// a window's content view. So it gets a real NSWindow, positioned far off any display and
// only ever ordered BACK: it joins the window server without becoming visible or key, and
// without disturbing whoever is at the machine.
let win = NSWindow(contentRect: NSRect(x: -8000, y: -8000, width: width, height: height),
                   styleMask: [.borderless], backing: .buffered, defer: false)
win.contentView = wv
win.orderBack(nil)

var finished = false

func snapshotAndReport() {
  let cfg = WKSnapshotConfiguration()
  cfg.rect = CGRect(x: 0, y: 0, width: width, height: height)
  wv.takeSnapshot(with: cfg) { image, error in
    if finished { return }
    finished = true
    put("didFinishNavigation", driver.didFinish ? "true" : "false")
    put("httpStatus", "\(driver.httpStatus)")
    put("navError", driver.navError.map { jstr($0) } ?? "null")
    put("readyWaitedMs", "\(driver.readyWaitedMs)")
    if let e = error {
      put("snapshotError", jstr(e.localizedDescription))
      emitAndExit(2)
    }
    guard let img = image else { put("snapshotError", jstr("nil image, nil error")); emitAndExit(2) }
    let scale = win.backingScaleFactor
    guard let s = measure(img, scale: scale) else {
      put("snapshotError", jstr("could not rasterise the snapshot"))
      emitAndExit(2)
    }
    do {
      try s.png?.write(to: URL(fileURLWithPath: outArg))
    } catch {
      put("snapshotError", jstr("could not write \(outArg): \(error)"))
      emitAndExit(2)
    }
    put("out", jstr(outArg))
    put("backingScaleFactor", jnum(Double(scale)))
    put("pixelWidth", "\(s.pixelWidth)")
    put("pixelHeight", "\(s.pixelHeight)")
    put("meanLuminance", jnum(s.meanLuminance))
    put("sdLuminance", jnum(s.sdLuminance))
    put("minLuminance", jnum(s.minLuminance))
    put("maxLuminance", jnum(s.maxLuminance))
    put("distinctColors", "\(s.distinctColors)")
    put("probes", "[" + s.probes.map { "{\"x\":\($0.0),\"y\":\($0.1),\"hex\":\(jstr($0.2))}" }
      .joined(separator: ",") + "]")
    emitAndExit(0)
  }
}

// After the load finishes, poll `--ready-js` until it answers true. Polling rather than a
// fixed sleep for the same reason a capture must not be timed by hope: a fixed sleep is how
// you photograph a canvas that has not drawn yet and call it a render.
var elapsedMs = 0
func waitForReady() {
  guard let expr = readyJS else {
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(settleMs)) { collectDomThenShoot() }
    return
  }
  wv.evaluateJavaScript("(function(){try{return JSON.stringify(!!(\(expr)))}catch(e){return 'ERR:'+e}})()") { v, _ in
    let s = (v as? String) ?? ""
    if s == "true" {
      driver.readyWaitedMs = elapsedMs
      // The settle window is for what happens AFTER the readiness condition: fonts
      // swapping, a first animation frame, a lazy chunk's own paint.
      DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(settleMs)) { collectDomThenShoot() }
      return
    }
    if elapsedMs > Int(timeoutS * 1000) {
      put("didFinishNavigation", driver.didFinish ? "true" : "false")
      put("navError", driver.navError.map { jstr($0) } ?? "null")
      put("readyTimeout", jstr("--ready-js never became true in \(timeoutS)s; last value \(s)"))
      emitAndExit(3)
    }
    elapsedMs += 100
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(100)) { waitForReady() }
  }
}

func collectDomThenShoot() {
  guard let expr = domJS else { snapshotAndReport(); return }
  wv.evaluateJavaScript("(function(){try{return JSON.stringify(\(expr))}catch(e){return JSON.stringify({domError:String(e)})}})()") { v, _ in
    put("dom", (v as? String) ?? "null")
    snapshotAndReport()
  }
}

// didFinish is not a paint. Waiting for it and then immediately snapshotting is the same
// class of mistake as waiting on a heading and photographing a canvas — so the readiness
// poll starts at didFinish and the snapshot happens only after it, plus the settle window.
func afterLoad() {
  if driver.didFinish || driver.navError != nil {
    if driver.navError != nil && !driver.didFinish {
      // Nothing loaded. Snapshot anyway and let the caller see the collapsed statistics
      // alongside the navigation error, rather than exiting with prose.
      snapshotAndReport()
      return
    }
    waitForReady()
    return
  }
  if elapsedMs > Int(timeoutS * 1000) {
    put("navError", jstr("navigation never finished in \(timeoutS)s"))
    emitAndExit(3)
  }
  elapsedMs += 100
  DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(100)) { afterLoad() }
}

wv.load(URLRequest(url: url))
DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(100)) { afterLoad() }
DispatchQueue.main.asyncAfter(deadline: .now() + timeoutS + 15) {
  put("navError", jstr("hard timeout"))
  emitAndExit(3)
}
app.run()
