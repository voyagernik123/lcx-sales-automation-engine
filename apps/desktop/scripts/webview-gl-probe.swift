// THE ONE QUESTION THE DESKTOP CHANNEL COULD NOT ANSWER, MADE RUNNABLE.
//
// DELIVERY.md §4.2 sat open for a day on this: does the WKWebView the app ships inside
// give `canvas.getContext('webgl2')` a context? The whole 3-D programme — eight relief
// surfaces, ~163 KB of lazy GLSL — is invisible on a desk if the answer is no, and the
// repo could not answer it, for a reason worth restating: `packages/gl/src/stage.ts:158-167`
// returns `stageRefusal('NO_WEBGL2')` as a VALUE. It does not throw, does not warn, does
// not log. No GL path calls `diagnostics_append`. The flat charts swap to SVG silently.
// So the call had already run thousands of times on this desk (0.2.6 ships
// `useFlatChart.ts`'s `await import('@lcx/gl')`) and NOTHING anywhere recorded the result.
//
// ── WHY THIS PROGRAM AND NOT `npm run dev -w @lcx/desktop` ──────────────────────────
//
// The dev window is still the way to see whether the reliefs LOOK right (DELIVERY §4.6),
// and it is not replaced by this. But it answers the capability question only by eye, it
// needs the whole toolchain running, and it produces no artefact anyone can paste. This
// asks the capability question directly, in 25 seconds, and prints JSON.
//
// It is honest about being a proxy in exactly one way, and that way is checkable:
//
//   otool -L <this binary>                        → /System/Library/Frameworks/WebKit.framework/…
//   otool -L /Applications/LCXOS.app/Contents/MacOS/lcx-terminal → the SAME path, same version
//
// Both link Apple's system WebKit — not a bundled engine, not Playwright's WebKit build
// (which is Playwright's own fork and would have produced a number about the wrong engine;
// DELIVERY §4.2.3 names that trap). And `WKWebViewConfiguration()` below is stock, which
// matches the app: wry 0.55.1 sets six things on the config/preferences —
// `allowsPictureInPictureMediaPlayback`, `fullScreenEnabled`, `tabFocusesLinks`,
// `developerExtrasEnabled`, `drawsBackground`, `allowsInlineMediaPlayback` — and
// `~/.cargo/registry/src/*/wry-0.55.1/src/wkwebview/mod.rs` has no WebGL-related key at
// all. `apps/desktop/src-tauri` adds nothing: there is no `WebviewWindowBuilder`, no
// `additional_browser_args`, and Cargo features are `["macos-private-api", "tray-icon"]`.
// So there is no repo-side switch that could make the app's answer differ from this one.
//
// ── WHAT IT MEASURES, AND WHY EACH LINE IS THERE ────────────────────────────────────
//
//   webgl2                        the question itself — `stage.ts` NO_WEBGL2 or not
//   EXT_color_buffer_float        absent ⇒ the HDR path SILENTLY renders 8-bit and clips
//                                 specular flat white, with nothing told to the reader
//                                 (DELIVERY §4.4.1 — the front door is E8)
//   OES_texture_float_linear      absent ⇒ E7 THE STORM refuses (env/volume.ts:389-391)
//   WEBGL_debug_renderer_info     unreadable ⇒ `useQualityTier.ts:123` calls the machine a
//                                 software rasteriser and pins the frame it ships with
//   MAX_3D_TEXTURE_SIZE           E7 allocates an R32F TEXTURE_3D (volume.ts:399)
//   compile + link + draw + read  A CONTEXT IS NOT A FRAME. Capability queries can all pass
//                                 on a stack that then fails to compile GLSL ES 3.00 or
//                                 never reaches the GPU process. So it compiles the smallest
//                                 real #version 300 es program, draws one point, and reads
//                                 the pixel back. `drew_green` false with `webgl2` true is
//                                 the interesting failure, and it is the one a capability-
//                                 only probe would have reported as success.
//   rgba16f_framebuffer_complete  the exact target `target3d.ts:66-70` allocates
//
// ── WHAT IT DOES NOT ESTABLISH, SO NOBODY OVERREADS THE JSON ────────────────────────
//
//  · THE FLEET. This is one machine's WebKit. `tauri.conf.json:51` sets a macOS 11 floor
//    and the engine is the operator's, not shipped with the app, so every answer here is
//    about the WebKit that produced it. Run it on the machine in question, or land the
//    one-call `logDiagnostic` change in DELIVERY §4.2.2 to get the fleet answer for free.
//  · THAT THE RELIEFS LOOK RIGHT. It compiles a two-line shader, not `lit.ts`. Frame time,
//    shadow bias, tone mapping and the anisotropic look are not touched. §4.6 still owns that.
//
// ── USAGE ───────────────────────────────────────────────────────────────────────────
//
//   swiftc -O -o /tmp/webview-gl-probe apps/desktop/scripts/webview-gl-probe.swift \
//     -framework Cocoa -framework WebKit && /tmp/webview-gl-probe
//
// Needs the Xcode command line tools (`xcode-select --install`) and a logged-in GUI
// session — a WKWebView with no window server has no GPU process to talk to.
// Prints one line of JSON. Exit 0 = the probe ran (read `webgl2` for the answer),
// 2 = the page failed to load, 3 = timed out.

import Cocoa
import WebKit

let app = NSApplication.shared
// `.accessory` so this never takes focus or shows a Dock tile. A probe that steals the
// owner's keyboard mid-release is a probe they will stop running.
app.setActivationPolicy(.accessory)

let html = """
<!doctype html><html><body><canvas id="c" width="64" height="64"></canvas><script>
window.__probe = (function () {
  const out = { ok: false };
  try {
    const c = document.getElementById('c');
    const gl = c.getContext('webgl2', { alpha: false, antialias: false });
    out.webgl2 = !!gl;
    if (!gl) { out.ok = true; return out; }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    out.version  = gl.getParameter(gl.VERSION);
    out.glsl     = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
    out.vendor   = gl.getParameter(gl.VENDOR);
    out.renderer = gl.getParameter(gl.RENDERER);
    out.debug_renderer_info = !!dbg;
    out.unmasked_renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null;
    out.unmasked_vendor   = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null;
    out.EXT_color_buffer_float         = !!gl.getExtension('EXT_color_buffer_float');
    out.OES_texture_float_linear       = !!gl.getExtension('OES_texture_float_linear');
    out.EXT_float_blend                = !!gl.getExtension('EXT_float_blend');
    out.EXT_texture_filter_anisotropic = !!gl.getExtension('EXT_texture_filter_anisotropic');
    out.KHR_parallel_shader_compile    = !!gl.getExtension('KHR_parallel_shader_compile');
    out.MAX_TEXTURE_SIZE    = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    out.MAX_SAMPLES         = gl.getParameter(gl.MAX_SAMPLES);
    out.MAX_3D_TEXTURE_SIZE = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
    out.extension_count     = (gl.getSupportedExtensions() || []).length;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, '#version 300 es\\nvoid main(){gl_Position=vec4(0.,0.,0.,1.);gl_PointSize=64.;}');
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, '#version 300 es\\nprecision highp float;out vec4 o;void main(){o=vec4(0.,1.,0.,1.);}');
    gl.compileShader(fs);
    out.vs_compiled = gl.getShaderParameter(vs, gl.COMPILE_STATUS);
    out.fs_compiled = gl.getShaderParameter(fs, gl.COMPILE_STATUS);
    out.vs_log = gl.getShaderInfoLog(vs);
    out.fs_log = gl.getShaderInfoLog(fs);
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    out.linked = gl.getProgramParameter(p, gl.LINK_STATUS);
    out.link_log = gl.getProgramInfoLog(p);
    if (out.linked) {
      gl.useProgram(p);
      gl.viewport(0, 0, 64, 64);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, 1);
      const px = new Uint8Array(4);
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      out.pixel = Array.from(px);
      out.drew_green = px[1] > 200 && px[0] < 60;
    }

    if (out.EXT_color_buffer_float) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 64, 64, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      out.rgba16f_framebuffer_complete =
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    out.gl_error = gl.getError();
    out.ok = true;
  } catch (e) {
    out.threw = String(e && e.message ? e.message : e);
  }
  return out;
})();
</script></body></html>
"""

final class ProbeDelegate: NSObject, WKNavigationDelegate {
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    webView.evaluateJavaScript("JSON.stringify(window.__probe)") { value, error in
      if let error = error {
        print("EVAL-ERROR \(error)")
        exit(2)
      }
      print((value as? String) ?? "EVAL-NIL")
      exit(0)
    }
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    print("NAV-FAIL \(error)")
    exit(2)
  }
}

let delegate = ProbeDelegate()
let webView = WKWebView(
  frame: NSRect(x: 0, y: 0, width: 800, height: 600),
  configuration: WKWebViewConfiguration())
webView.navigationDelegate = delegate

// IN A REAL NSWindow ON PURPOSE, AND THIS IS THE LINE MOST LIKELY TO BE DELETED AS
// POINTLESS. An unparented, never-displayed WKWebView is exactly the configuration in
// which a GL context can legitimately be refused, and a `webgl2:false` from that setup
// would be a FALSE NEGATIVE about an app whose webview is the content view of a window.
// Positioned off every display and only ever `orderBack`, so it is in the window server
// without being visible or key.
let window = NSWindow(
  contentRect: NSRect(x: -2400, y: -2400, width: 800, height: 600),
  styleMask: [.borderless], backing: .buffered, defer: false)
window.contentView = webView
window.orderBack(nil)

webView.loadHTMLString(html, baseURL: URL(string: "http://localhost/"))

// Bounded. The failure this prevents is a probe that hangs in someone's release checklist
// with no output at all — which reads as "the answer is bad" when it means "nothing ran".
DispatchQueue.main.asyncAfter(deadline: .now() + 25) {
  print("TIMEOUT")
  exit(3)
}
app.run()
