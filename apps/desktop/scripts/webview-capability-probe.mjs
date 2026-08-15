#!/usr/bin/env node
// WHAT WKWEBVIEW CAN ACTUALLY DO, DERIVED FROM THE SOURCE RATHER THAN REMEMBERED.
//
// ── WHY THIS EXISTS WHEN `webview-gl-probe.swift` ALREADY DID ───────────────────────
//
// `webview-gl-probe.swift` answered the first question correctly: does the WKWebView the
// desktop app ships inside give us a WebGL2 context at all. It does. But its capability
// list is HAND-WRITTEN, and a hand-written list has exactly one failure mode: it cannot
// fail on the item nobody thought of. Checked against the source, that list is wrong in
// both directions at once —
//
//   PROBES WHAT NOTHING NEEDS.  `EXT_float_blend`, `EXT_texture_filter_anisotropic` and
//     `KHR_parallel_shader_compile` appear in ZERO `getExtension` calls in shipping
//     source. Three of its eight extension rows are about nothing.
//   MISSES WHAT SOMETHING NEEDS.  It never queries MAX_DRAW_BUFFERS, though
//     `env/particles.ts:438` binds two colour attachments; never checks that RGBA32F is
//     renderable, though `env/particles.ts:408` allocates one; and never checks that a
//     DEPTH_COMPONENT24 *texture* completes a framebuffer, though `env/target3d.ts:81`
//     and `:161` attach one on every surface that casts a shadow.
//
// So this script does not carry a list. It reads the requirement set out of the source
// each time it runs, generates the probe from what it found, and runs that. When someone
// adds a `getExtension` call, this notices without being edited.
//
// ── THE SECOND THING IT FIXES: PRESENCE IS NOT BEHAVIOUR ────────────────────────────
//
// `!!gl.getExtension('OES_texture_float_linear')` proves a string is in a list. It does
// not prove a float sampler3D interpolates. That distinction is the whole argument in
// `env/volume.ts:383-391`: without real linear filtering the density grid drops to
// NEAREST and renders as axis-aligned blocks that look like a deliberate voxel aesthetic
// and would ship as one. A probe that reports the extension present, on a stack where the
// filter silently degrades, produces precisely the false clearance that file was written
// to prevent. So the float path is MEASURED: a 2x1x1 R32F TEXTURE_3D holding [0.0, 1.0]
// is sampled at three points and the bytes are read back.
//
//   u=0.25 -> texel 0 centre  -> must read ~0    | these two are the INSTRUMENT CHECK.
//   u=0.75 -> texel 1 centre  -> must read ~255  | if they fail the upload failed and the
//                                                | middle sample means nothing at all.
//   u=0.50 -> exactly between -> ~128 is LINEAR, 0 or 255 is NEAREST.
//
// The two endpoint samples are not decoration. Without them a failed texture upload reads
// zero everywhere, and zero at the midpoint is indistinguishable from NEAREST — the probe
// would report a real defect that is actually its own broken setup.
//
// ── HOW IT COULD DIFFER FROM THE REAL APP, STATED PLAINLY ───────────────────────────
//
// This is a PROXY, and the proxy is: a standalone WKWebView in this process, not the
// WKWebView inside a running LCXOS.app. It is defensible because both link the same
// system WebKit — `otool -L` on this probe's binary and on the app's binary resolve to
// the same /System/Library/Frameworks/WebKit.framework — and because wry sets no
// WebGL-related configuration key, so there is no repo-side switch that could make the
// app's answer differ. It is still a proxy in three ways that a reader should hold:
//
//   1. ONE MACHINE, ONE ENGINE VERSION. WebKit here is the operator's OS, not shipped
//      with the app. Every number below describes the Mac that produced it.
//   2. NOT UNDER MEMORY PRESSURE. A real app with the full bundle resident can be
//      refused resources this empty page gets.
//   3. NOT THE REAL SHADERS. This compiles a handful of tiny programs, not `lit.ts`.
//      It answers "would the surface refuse", not "does the surface look right".
//
// ── USAGE ───────────────────────────────────────────────────────────────────────────
//
//   node apps/desktop/scripts/webview-capability-probe.mjs          # table
//   node apps/desktop/scripts/webview-capability-probe.mjs --json   # machine-readable
//
// Needs Xcode command line tools (`swiftc`) and a logged-in GUI session: a WKWebView with
// no window server has no GPU process to talk to. Exit 0 = probe ran and every shipping
// surface is clear; 1 = a surface would refuse or silently degrade; 2 = the probe could
// not run (say so, do not infer the answer).

import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const GL_SRC = join(ROOT, 'packages', 'gl', 'src');
const WEB_SRC = join(ROOT, 'apps', 'web', 'src');
const JSON_OUT = process.argv.includes('--json');

/* ── 0 · SOURCE WALK ────────────────────────────────────────────────────────────────
 * Tests are excluded deliberately: `flat/sharedCost.test.ts:114` stubs `getExtension` to
 * return `{}` for every name, so a walk that included tests would derive requirements
 * from mocks and report extensions nothing ships. */
const isShipping = (p) =>
  /\.(ts|tsx)$/.test(p) && !/\.test\.[tj]sx?$/.test(p) && !p.includes('__tests__');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (isShipping(p)) out.push(p);
  }
  return out;
}

const files = [...walk(GL_SRC), ...walk(WEB_SRC)];
const rel = (p) => relative(ROOT, p);
const text = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

/* ── 1 · DERIVE THE EXTENSION REQUIREMENTS ──────────────────────────────────────────
 * Each call site is classified by what the code DOES when the extension is missing, and
 * that classification is read from the source, not assumed. The distinction decides
 * whether a missing extension is loud or silent, which is the entire finding:
 *
 *   REFUSES  — the site returns `stageRefusal(...)`. The reader is told.
 *   DEGRADES — the site feeds a ternary or an `if` with no refusal. Nobody is told.
 *
 * `stage.ts:292` is the dangerous shape and the reason this classification is derived
 * rather than eyeballed: `const fmt = float ? gl.RGBA16F : gl.RGBA8` is a SILENT drop
 * from HDR to 8-bit on every surface in the programme. */
const extSites = [];
for (const f of files) {
  const src = text.get(f);
  const lines = src.split('\n');
  const re = /getExtension\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    // Look ahead a short window for the disposition of the guard.
    const window = lines.slice(line - 1, line + 6).join('\n');
    const refuses = /stageRefusal\(/.test(window);
    extSites.push({ ext: m[1], file: rel(f), line, refuses });
  }
}

/* ── 2 · DERIVE THE FORMAT AND LIMIT REQUIREMENTS ───────────────────────────────────
 * An extension list alone under-describes the requirement. `EXT_color_buffer_float`
 * present does not mean RGBA32F is renderable — the extension's guarantee is about
 * half-float; 32-bit float colour buffers are a separate capability on several stacks.
 * So the formats actually allocated are derived too, with their texture target, and each
 * becomes a real framebuffer-completeness test below. */
const fmtSites = [];
for (const f of files) {
  const src = text.get(f);
  const re = /gl\.(RGBA32F|RGBA16F|R32F|R16F|DEPTH_COMPONENT24|DEPTH_COMPONENT16)\b/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    const ctx = src.slice(Math.max(0, m.index - 400), m.index + 200);
    const target = /TEXTURE_3D|texStorage3D/.test(ctx) ? 'TEXTURE_3D' : 'TEXTURE_2D';
    const linear = /TEXTURE_(?:MIN|MAG)_FILTER,\s*gl\.LINEAR/.test(
      src.slice(m.index, m.index + 700));
    fmtSites.push({ fmt: m[1], target, linear, file: rel(f), line });
  }
}

/* Draw-buffer arity, derived from the widest `drawBuffers([...])` actually written. */
let maxAttachments = 1;
for (const f of files) {
  const re = /drawBuffers\(\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(text.get(f)))) {
    maxAttachments = Math.max(maxAttachments, m[1].split(',').filter((s) => s.trim()).length);
  }
}

/* ── 3 · REACHABILITY, BECAUSE A REQUIREMENT NOTHING REACHES IS NOT A REQUIREMENT ────
 * Rule: trace the branch before asserting an effect is live. The programme has already
 * been burned by this once — commit 621363d found E7 shipping as code and unreachable as
 * a surface. `env/particles.ts` is the same shape: it is exported from `index.ts:112`,
 * it raises a MISSING_EXTENSION refusal, and it is imported by NO shipping surface. Its
 * requirements are real for `docs/3d/e3` and irrelevant to the desktop app, and a probe
 * that reported "EXT_color_buffer_float missing => a surface refuses" would be naming a
 * surface that does not exist.
 *
 * The map is built by symbol, not by hand: every symbol each gl module exports, against
 * every symbol each surface imports from '@lcx/gl'. */
const surfaceFiles = files.filter((f) => /components\/.*Gl\.tsx$/.test(f));

const moduleExports = new Map(); // gl file -> Set of exported symbols
for (const f of files.filter((f) => f.startsWith(GL_SRC))) {
  const names = new Set();
  const re = /export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(text.get(f)))) names.add(m[1]);
  moduleExports.set(f, names);
}

const surfaceImports = new Map(); // surface -> Set of symbols from @lcx/gl
for (const f of surfaceFiles) {
  const names = new Set();
  const re = /import\s*(?:type\s*)?\{([\s\S]*?)\}\s*from\s*['"]@lcx\/gl['"]/g;
  let m;
  while ((m = re.exec(text.get(f)))) {
    for (const part of m[1].split(',')) {
      const id = part.trim().split(/\s+as\s+/)[0].trim();
      if (id) names.add(id);
    }
  }
  surfaceImports.set(f, names);
}

/* A gl module is reached by a surface if the surface imports any symbol it exports.
 * `stage.ts` is reached by all of them via `createStage`, and that falls out of the data
 * rather than being asserted. */
function surfacesReaching(glRelPath) {
  const abs = join(ROOT, glRelPath);
  const exports = moduleExports.get(abs);
  if (!exports) return surfaceFiles.map((f) => basename(f, '.tsx')); // web-side site: all
  const hit = [];
  for (const s of surfaceFiles) {
    for (const sym of surfaceImports.get(s)) {
      if (exports.has(sym)) { hit.push(basename(s, '.tsx')); break; }
    }
  }
  return hit;
}

const requirements = [];
for (const site of extSites) {
  requirements.push({ ...site, kind: 'extension', reachedBy: surfacesReaching(site.file) });
}

const neededExts = [...new Set(extSites.map((s) => s.ext))].sort();

/* ── 4 · GENERATE THE PROBE ─────────────────────────────────────────────────────────
 * The extension list is injected from the derivation above. The negative control is a
 * name that cannot exist: if the harness reports it PRESENT, `getExtension` is being
 * stubbed or the bridge is lying, and every other row is worthless. That check runs
 * before any verdict is formed. */
const NEG_CONTROL = 'WEBGL_probe_negative_control_must_be_absent';
const probeJs = `
window.__probe = (function () {
  const out = { ok: false, extensions: {}, params: {}, behaviour: {} };
  try {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 32;
    const gl = c.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    out.webgl2 = !!gl;
    if (!gl) { out.ok = true; return out; }

    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    out.version = gl.getParameter(gl.VERSION);
    out.glsl = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
    out.unmasked_renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null;
    out.unmasked_vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null;

    for (const name of ${JSON.stringify([...neededExts, NEG_CONTROL])}) {
      out.extensions[name] = !!gl.getExtension(name);
    }
    out.negative_control_absent = out.extensions[${JSON.stringify(NEG_CONTROL)}] === false;

    for (const p of ['MAX_TEXTURE_SIZE','MAX_3D_TEXTURE_SIZE','MAX_DRAW_BUFFERS',
                     'MAX_COLOR_ATTACHMENTS','MAX_SAMPLES','MAX_RENDERBUFFER_SIZE',
                     'MAX_TEXTURE_IMAGE_UNITS','MAX_VERTEX_UNIFORM_VECTORS']) {
      out.params[p] = gl.getParameter(gl[p]);
    }

    const compile = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s);
      gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
        throw new Error('compile: ' + gl.getShaderInfoLog(sh)); return sh; };
    const link = (v, f) => { const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, v));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, f));
      gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw new Error('link: ' + gl.getProgramInfoLog(p)); return p; };

    /* POSITIVE CONTROL. Before any negative result is trusted, prove this harness can
       capture something that DID render. A context, a clean extension list and a linked
       program can all be present on a stack that never reaches the GPU process, and a
       capability-only probe reports that as success. */
    const quadV = '#version 300 es\\nconst vec2 P[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));\\nvoid main(){gl_Position=vec4(P[gl_VertexID],0.,1.);}';
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.viewport(0, 0, 96, 32);
    const green = link(quadV, '#version 300 es\\nprecision highp float;out vec4 o;void main(){o=vec4(0.,1.,0.,1.);}');
    gl.useProgram(green);
    gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(4);
    gl.readPixels(48, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    out.behaviour.positive_control_drew = px[1] > 200 && px[0] < 60;
    out.behaviour.positive_control_pixel = Array.from(px);

    /* FRAMEBUFFER COMPLETENESS, per format actually allocated in source. */
    const fbTest = (internal, fmt, type) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl[internal], 32, 32, 0, gl[fmt], gl[type], null);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      const att = internal.indexOf('DEPTH') === 0 ? gl.DEPTH_ATTACHMENT : gl.COLOR_ATTACHMENT0;
      gl.framebufferTexture2D(gl.FRAMEBUFFER, att, gl.TEXTURE_2D, t, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb); gl.deleteTexture(t);
      return ok;
    };
    out.behaviour.rgba16f_renderable = fbTest('RGBA16F', 'RGBA', 'HALF_FLOAT');
    out.behaviour.rgba32f_renderable = fbTest('RGBA32F', 'RGBA', 'FLOAT');
    out.behaviour.depth24_texture_renderable =
      fbTest('DEPTH_COMPONENT24', 'DEPTH_COMPONENT', 'UNSIGNED_INT');

    /* TWO COLOUR ATTACHMENTS, the shape env/particles.ts:437-438 binds. */
    (function () {
      const mk = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 16, 16, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t; };
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mk(), 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, mk(), 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      out.behaviour.mrt2_rgba32f_complete =
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    })();

    /* ── THE ONE THAT MATTERS: DOES R32F ACTUALLY FILTER, OR ONLY CLAIM TO ──────────
       env/volume.ts:399 allocates exactly this — texStorage3D(R32F) with LINEAR on both
       filters. A 2x1x1 grid holding [0.0, 1.0] is sampled at both texel centres and at
       the midpoint. The endpoints are the instrument check; the midpoint is the answer. */
    (function () {
      gl.getExtension('OES_texture_float_linear'); // must be enabled before use
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, t);
      gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R32F, 2, 1, 1);
      gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, 2, 1, 1, gl.RED, gl.FLOAT,
                       new Float32Array([0.0, 1.0]));
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      for (const ax of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
        gl.texParameteri(gl.TEXTURE_3D, ax, gl.CLAMP_TO_EDGE);
      }
      /* u is chosen from gl_FragCoord so all three samples come from ONE draw: left third
         u=0.25 (texel 0), middle u=0.50 (between), right third u=0.75 (texel 1). */
      const p = link(quadV,
        '#version 300 es\\nprecision highp float;precision highp sampler3D;' +
        'uniform sampler3D T;out vec4 o;void main(){' +
        'float u = gl_FragCoord.x < 32. ? 0.25 : (gl_FragCoord.x < 64. ? 0.5 : 0.75);' +
        'float v = texture(T, vec3(u, 0.5, 0.5)).r;' +
        'o = vec4(v, v, v, 1.);}');
      gl.useProgram(p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_3D, t);
      gl.uniform1i(gl.getUniformLocation(p, 'T'), 0);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const read = (x) => { const b = new Uint8Array(4);
        gl.readPixels(x, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return b[0]; };
      const lo = read(16), mid = read(48), hi = read(80);
      out.behaviour.r32f_3d_texel0 = lo;
      out.behaviour.r32f_3d_texel1 = hi;
      out.behaviour.r32f_3d_midpoint = mid;
      // Instrument check: the grid must actually contain 0 and 1 before the midpoint means anything.
      out.behaviour.r32f_3d_upload_valid = lo < 24 && hi > 231;
      out.behaviour.r32f_3d_filters_linear =
        out.behaviour.r32f_3d_upload_valid && mid > 96 && mid < 160;
    })();

    out.gl_error = gl.getError();
    out.ok = true;
  } catch (e) {
    out.threw = String((e && e.message) || e);
  }
  return out;
})();
`;

const swift = `import Cocoa
import WebKit
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let html = ${JSON.stringify(`<!doctype html><html><body><script>${probeJs}</script></body></html>`)}
final class D: NSObject, WKNavigationDelegate {
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
    w.evaluateJavaScript("JSON.stringify(window.__probe)") { v, e in
      if let e = e { print("EVAL-ERROR \\(e)"); exit(2) }
      print((v as? String) ?? "EVAL-NIL"); exit(0)
    }
  }
  func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) {
    print("NAV-FAIL \\(e)"); exit(2)
  }
}
let d = D()
let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600),
                   configuration: WKWebViewConfiguration())
wv.navigationDelegate = d
// An unparented WKWebView can legitimately be refused a GL context, and that refusal would
// be a false negative about an app whose webview IS a window's content view. Off-screen and
// only ever orderBack, so it joins the window server without becoming visible or key.
let win = NSWindow(contentRect: NSRect(x: -2400, y: -2400, width: 800, height: 600),
                   styleMask: [.borderless], backing: .buffered, defer: false)
win.contentView = wv
win.orderBack(nil)
wv.loadHTMLString(html, baseURL: URL(string: "http://localhost/"))
DispatchQueue.main.asyncAfter(deadline: .now() + 25) { print("TIMEOUT"); exit(3) }
app.run()
`;

/* ── 5 · BUILD AND RUN ──────────────────────────────────────────────────────────────
 * If this cannot run, it says so and exits 2. It never infers the answer. */
const tmp = mkdtempSync(join(tmpdir(), 'lcx-cap-'));
const swiftPath = join(tmp, 'probe.swift');
const binPath = join(tmp, 'probe');
writeFileSync(swiftPath, swift);

let raw;
try {
  execFileSync('swiftc', ['-O', '-o', binPath, swiftPath,
    '-framework', 'Cocoa', '-framework', 'WebKit'], { stdio: 'pipe' });
} catch (e) {
  console.error('CANNOT RUN: swiftc failed. Xcode command line tools required.\n' +
    String(e.stderr || e));
  process.exit(2);
}
try {
  raw = execFileSync(binPath, { encoding: 'utf8', timeout: 60000 }).trim();
} catch (e) {
  console.error('CANNOT RUN: the probe binary did not complete (needs a logged-in GUI ' +
    'session; a WKWebView with no window server has no GPU process).\n' + String(e.stdout || e));
  process.exit(2);
}

let r;
try { r = JSON.parse(raw); } catch {
  console.error('CANNOT RUN: probe produced no JSON. Raw output:\n' + raw);
  process.exit(2);
}

/* ── 6 · VERDICT ────────────────────────────────────────────────────────────────────
 * Per surface, derived: for every requirement site the surface reaches, is the capability
 * present, and does the site refuse or degrade without it. */
const verdicts = surfaceFiles.map((f) => {
  const name = basename(f, '.tsx');
  const issues = [];
  for (const req of requirements) {
    if (!req.reachedBy.includes(name)) continue;
    if (r.extensions[req.ext] === false) {
      issues.push({ ext: req.ext, at: `${req.file}:${req.line}`,
        effect: req.refuses ? 'REFUSES' : 'SILENTLY DEGRADES' });
    }
  }
  // Storm's grid is bounded by MAX_3D_TEXTURE_SIZE; the volume path is the only 3-D texture.
  if (!r.webgl2) issues.unshift({ ext: 'webgl2', at: 'packages/gl/src/stage.ts:290',
    effect: 'REFUSES (NO_WEBGL2)' });
  const reachesVolume = requirements.some((q) =>
    q.file.endsWith('env/volume.ts') && q.reachedBy.includes(name));
  if (reachesVolume && r.behaviour.r32f_3d_filters_linear === false) {
    issues.push({ ext: 'R32F 3-D linear filtering (measured, not queried)',
      at: 'packages/gl/src/env/volume.ts:399',
      effect: 'SILENTLY DEGRADES to voxel blocks' });
  }
  return { name, issues, verdict: issues.length === 0 ? 'RENDERS'
    : issues.some((i) => i.effect.startsWith('REFUSES')) ? 'REFUSES' : 'DEGRADES' };
});

const instrumentOk = r.ok && r.negative_control_absent &&
  r.behaviour.positive_control_drew === true;

if (JSON_OUT) {
  console.log(JSON.stringify({ instrumentOk, probe: r, requirements, verdicts,
    derived: { extensions: neededExts, formats: fmtSites, maxAttachments } }, null, 2));
} else {
  const B = (v) => (v === true ? 'yes' : v === false ? 'NO' : String(v));
  console.log('\nWKWEBVIEW CAPABILITY PROBE — apps/desktop');
  console.log('='.repeat(78));
  console.log(`engine      ${r.version || '?'} / ${r.glsl || '?'}`);
  console.log(`renderer    ${r.unmasked_renderer || '?'} (${r.unmasked_vendor || '?'})`);
  console.log('\nINSTRUMENT VALIDATION (before any result is trusted)');
  console.log(`  positive control — drew and read back a green pixel   ${B(r.behaviour.positive_control_drew)}`);
  console.log(`  negative control — fake extension reported absent     ${B(r.negative_control_absent)}`);
  console.log(`  R32F upload check — texel0~0 and texel1~255           ${B(r.behaviour.r32f_3d_upload_valid)}`);
  if (!instrumentOk) console.log('  >> INSTRUMENT NOT VALID — results below are not evidence.');

  console.log('\nEXTENSIONS REQUIRED (derived from getExtension call sites in shipping source)');
  for (const ext of neededExts) {
    const sites = extSites.filter((s) => s.ext === ext);
    console.log(`  ${B(r.extensions[ext]).padEnd(4)} ${ext}`);
    for (const s of sites) {
      const reach = surfacesReaching(s.file);
      console.log(`         ${s.file}:${s.line}  ${s.refuses ? 'refuses' : 'DEGRADES SILENTLY'}` +
        `  reached by: ${reach.length ? reach.join(', ') : 'NO SHIPPING SURFACE'}`);
    }
  }

  console.log('\nLIMITS');
  for (const [k, v] of Object.entries(r.params || {})) console.log(`  ${String(v).padEnd(6)} ${k}`);
  console.log(`  needs MAX_DRAW_BUFFERS >= ${maxAttachments} (widest drawBuffers([...]) in source)`);

  console.log('\nBEHAVIOUR (measured, not queried)');
  console.log(`  ${B(r.behaviour.rgba16f_renderable).padEnd(4)} RGBA16F renderable      stage.ts:294, target3d.ts:69, dof.ts:152`);
  console.log(`  ${B(r.behaviour.rgba32f_renderable).padEnd(4)} RGBA32F renderable      particles.ts:408`);
  console.log(`  ${B(r.behaviour.depth24_texture_renderable).padEnd(4)} DEPTH24 tex complete    target3d.ts:81,161`);
  console.log(`  ${B(r.behaviour.mrt2_rgba32f_complete).padEnd(4)} 2 colour attachments    particles.ts:437-438`);
  console.log(`  ${B(r.behaviour.r32f_3d_filters_linear).padEnd(4)} R32F 3-D FILTERS LINEAR volume.ts:399  ` +
    `[texel0=${r.behaviour.r32f_3d_texel0} mid=${r.behaviour.r32f_3d_midpoint} texel1=${r.behaviour.r32f_3d_texel1}; ` +
    `~128 linear, 0/255 nearest]`);

  console.log('\nVERDICT — the seven shipping surfaces');
  for (const v of verdicts) {
    console.log(`  ${v.verdict.padEnd(8)} ${v.name}`);
    for (const i of v.issues) console.log(`           ${i.effect}: ${i.ext} at ${i.at}`);
  }
  console.log('');
}

process.exit(!instrumentOk ? 2 : verdicts.some((v) => v.verdict !== 'RENDERS') ? 1 : 0);
