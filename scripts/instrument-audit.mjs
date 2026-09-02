#!/usr/bin/env node
/**
 * THE INSTRUMENT AUDIT — S0 of INSTRUMENT_100X_PLAN.md: the ruler, built before the work.
 *
 * `scripts/3d-audit-app.mjs` measures the SEVEN routes that carry a GL environment, with a frozen clock, a
 * seeded operator and per-route network fixtures. This file measures ALL EIGHTY, in both themes, for the six
 * numbers the plan is judged by — and it inherits the sweep's discipline rather than its scope:
 *
 *   · every matcher is validated against a positive AND a negative control before it counts anything, so an
 *     empty census can never be mistaken for a clean codebase;
 *   · the clock is frozen and randomness seeded before the app's first byte runs;
 *   · the network floor is "no API" — every `/v1/**` call is refused — so what is measured is the shell and
 *     the route's own structure, never a lucky fetch. Data-dependent metrics say so;
 *   · nothing is scored that could not be captured in BOTH themes.
 *
 * THE SIX NUMBERS, and which pass owns each:
 *
 *   1  motion       STATIC   ambient `animate-*` occurrences vs files wiring the feel layer, per route closure
 *                   RUNTIME  CSS animations still running after the page has settled ("motion at rest") — sampled
 *                            BEFORE the continuity navigation (close-out fix: the first version probed 500 ms after
 *                            navigate-and-back, and read every entrance fade of the re-mounted route as motion at rest)
 *   2  clocks       STATIC   `setInterval` / `requestAnimationFrame` / `Date.now()` / `new Date()` call sites
 *                   RUNTIME  live intervals + rAF loops observed in a one-second window at rest
 *   3  continuity   STATIC   `startViewTransition` / `view-transition-name` occurrences
 *                   RUNTIME  `document.startViewTransition` calls during one client-side navigation
 *   4  material     STATIC   ΔE2000 between every DOM scenery token and the GL scenery colour it should equal,
 *                            both themes (`tokens.css` vs `look/theme.ts` AUTHORED_HEX); plus hex literals
 *                            authored outside the token system, per route closure
 *   5  density      RUNTIME  numeric figures visible in the first viewport (elements whose text carries a digit)
 *   6  GL reach     STATIC   routes whose closure includes an environment; RUNTIME GL contexts created
 *
 * OUTPUT  docs/instrument/audit/BASELINE.json (machine) and BASELINE.md (human), both stamped with HEAD and
 *         the instant. Viewport captures land in docs/instrument/audit/shots/ (gitignored — 160 PNGs are
 *         evidence for a reader, not a diff for the repo).
 *
 * RUN     node scripts/instrument-audit.mjs            (starts vite on 5189, ~10 min)
 *         INSTRUMENT_STATIC_ONLY=1 node scripts/instrument-audit.mjs   (no browser, seconds)
 *         INSTRUMENT_ROUTES=/gps,/command-deck node …   (subset, for iteration)
 *         INSTRUMENT_ANIM_TRACE=1 node …                (diagnostic: running animations sampled every 500 ms, +1.5→+5 s)
 */

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESK_ROUTES, allDeskFixtures } from './instrument-fixtures.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps/web');
const SRC = join(WEB, 'src');
const OUT_DIR = process.env.INSTRUMENT_OUT_DIR ?? join(ROOT, 'docs/instrument/audit');
const SHOTS = join(OUT_DIR, 'shots');
const PORT = Number(process.env.INSTRUMENT_PORT ?? 5189);
const BASE = `http://127.0.0.1:${PORT}`;
const STATIC_ONLY = process.env.INSTRUMENT_STATIC_ONLY === '1';
const ROUTE_FILTER = process.env.INSTRUMENT_ROUTES ? process.env.INSTRUMENT_ROUTES.split(',') : null;
/* S6: answer the eight desk landings' own endpoints with deterministic fixtures (see instrument-fixtures.mjs), so
   "figures in the first viewport" reads a POPULATED desk. Off by default — the no-API floor is the baseline. */
const FIXTURES = process.env.INSTRUMENT_FIXTURES === '1';

const HEAD = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
const RUN_AT = new Date().toISOString();

/* ── THE FROZEN ENVIRONMENT — the sweep's own, copied in principle ──────────────────────
 * A proxy, not a subclass: `Date()` without `new` must still answer a string, and `Date.parse` must stay pure
 * because the app parses fixtures through it. `Math.random` and the two crypto taps are seeded (mulberry32). */
const FROZEN_AT = Date.parse(process.env.INSTRUMENT_CLOCK ?? '2026-09-21T07:18:41.000Z');
const FROZEN_SEED = 0x5CE7A1;
const FREEZE_ENV = (f) => {
  const w = /** @type {any} */ (globalThis);
  const RealDate = w.Date;
  w.Date = new Proxy(RealDate, {
    apply: () => new RealDate(f.at).toString(),
    construct: (t, args, nt) => Reflect.construct(t, args.length === 0 ? [f.at] : args, nt),
    get: (t, p, r) => (p === 'now' ? () => f.at : Reflect.get(t, p, r)),
  });
  let s = f.seed >>> 0;
  const rnd = () => {
    s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = rnd;
  try {
    if (w.crypto) {
      w.crypto.getRandomValues = (arr) => { for (let i = 0; i < arr.length; i += 1) arr[i] = Math.floor(rnd() * 256); return arr; };
    }
  } catch { /* reported by the census, not fatal */ }
};

/* ── THE PROBE — counts what the page does at rest, installed before the app runs ──────
 * Timers and animation frames are counted by patching the constructors, not by sampling the DOM: a `setInterval`
 * the operator never sees is still a clock. `startViewTransition` is wrapped so a client-side navigation
 * reports whether continuity was even attempted. GL contexts are counted at creation. */
const PROBE = () => {
  const w = /** @type {any} */ (globalThis);
  const audit = { intervals: new Set(), intervalSites: {}, rafCalls: 0, rafLoops: 0, vt: 0, gl: 0, errors: [] };
  w.__instrument = audit;
  const si = w.setInterval.bind(w), ci = w.clearInterval.bind(w);
  // EVERY LIVE INTERVAL IS ATTRIBUTED to the source file that created it, so "2 intervals" can
  // never be left as a number: the after-S1 run counted two on every route, including the
  // shell-less sign-in screen, and the difference between "the app owns two clocks" and "the dev
  // server's HMR client owns one" is the difference between a defect and a measurement artefact.
  w.setInterval = (fn, ms, ...rest) => {
    const id = si(fn, ms, ...rest);
    audit.intervals.add(id);
    const site = (new Error().stack || '').split('\n').slice(2).find((l) => !/instrument|setInterval/.test(l)) || 'unknown';
    audit.intervalSites[id] = site.trim().replace(/^at\s+/, '').replace(/\?[^:)]*/g, '').slice(0, 140);
    return id;
  };
  w.clearInterval = (id) => { audit.intervals.delete(id); delete audit.intervalSites[id]; return ci(id); };
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) => raf((t) => { audit.rafCalls += 1; cb(t); });
  if (w.document && typeof w.document.startViewTransition === 'function') {
    const svt = w.document.startViewTransition.bind(w.document);
    w.document.startViewTransition = (...a) => { audit.vt += 1; return svt(...a); };
  } else if (w.document) {
    // The API is absent in this browser build: record that the app CALLED for it anyway.
    Object.defineProperty(w.document, 'startViewTransition', {
      configurable: true, writable: true,
      value: (cb) => { audit.vt += 1; if (typeof cb === 'function') cb(); return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition() {} }; },
    });
  }
  const gc = w.HTMLCanvasElement.prototype.getContext;
  w.HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    const ctx = gc.call(this, kind, ...rest);
    if (ctx && /webgl/.test(String(kind))) audit.gl += 1;
    return ctx;
  };
  w.addEventListener('error', (e) => audit.errors.push(String(e.message).slice(0, 120)));
};

/* ── THE SEAT — the persisted session, written in the order the app requires ──────────── */
const SEAT = {
  email: 'nik@lcx.com',
  operator: { id: 'nik', name: 'Nik', email: 'nik@lcx.com', role: 'approver', initials: 'N', colorVar: 'var(--chart-1)' },
};
const seatInit = (s) => {
  localStorage.setItem('lcx_operator_email', s.email);
  localStorage.setItem('lcx_desk_passcode', 'audit-no-api');
  localStorage.setItem(`lcx-os:${s.email}:operator:v1`, JSON.stringify({ state: { operator: s.operator }, version: 3 }));
};
/* S6 fixture mode: the six kept reliefs default ON (reliefPreference.ts, cafb955), so under fixtures a desk
   would mount its GL view and the DOM figures the density claim is about would leave the viewport. Seed the
   operator's remembered choice OFF for all seven, in the app's own scoped-key form (`lcx-os:${email}:relief:${s}:v1`). */
const reliefsOffInit = (s) => {
  for (const r of ['deck', 'globe', 'pipeline', 'orrery', 'surface', 'vault', 'storm']) {
    localStorage.setItem(`lcx-os:${s.email}:relief:${r}:v1`, JSON.stringify(false));
  }
};
const themeSeed = (a) => {
  const env = JSON.stringify({ state: { sidebarCollapsed: false, darkMode: a.dark, evidenceDocked: false }, version: 0 });
  localStorage.setItem(`lcx-os:${a.scope}:ui:v1`, env);
  localStorage.setItem('lcx-os:ui:v1', env);
};

/* ── COLOUR MATHS, validated against Sharma et al. (2005) before use ─────────────────── */
const HEX_RGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const S2L = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function labOfRgb([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => S2L(v / 255));
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) / 1.0;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (a, b) => { if (a === 0 && b === 0) return 0; const t = Math.atan2(b, a) * deg; return t < 0 ? t + 360 : t; };
  const h1 = h(a1p, b1), h2 = h(a2p, b2);
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = h1 + h2;
  if (C1p * C2p !== 0) { if (Math.abs(h1 - h2) > 180) hb += hb < 360 ? 360 : -360; hb /= 2; }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.20 * Math.cos((4 * hb - 63) * rad);
  const SL = 1 + (0.015 * Math.pow(Lb - 50, 2)) / Math.sqrt(20 + Math.pow(Lb - 50, 2));
  const SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
  const RT = -2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7))) * Math.sin(60 * Math.exp(-Math.pow((hb - 275) / 25, 2)) * rad);
  return Math.sqrt(Math.pow(dL / SL, 2) + Math.pow(dC / SC, 2) + Math.pow(dH / SH, 2) + RT * (dC / SC) * (dH / SH));
}
function validateColourMaths() {
  // Sharma, Wu & Dalal (2005) test pairs 1 and 3: published ΔE00 2.0425 and 2.8615.
  const cases = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  ];
  for (const [p, q, want] of cases) {
    const got = deltaE2000(p, q);
    if (Math.abs(got - want) > 0.001) refuse(`ΔE2000 failed its Sharma control: got ${got.toFixed(4)}, want ${want}`);
  }
}
const dE = (hexA, hexB) => deltaE2000(labOfRgb(HEX_RGB(hexA)), labOfRgb(HEX_RGB(hexB)));

function refuse(why) { console.error(`  REFUSED: ${why}\n  Nothing written.`); process.exit(1); }

/* ── STATIC MATCHERS, each with its controls ─────────────────────────────────────────── */
const AMBIENT = /\banimate-(?:spin|pulse-beacon|pulse|slide-in|fade|bounce|ping)\b/g;
const FEEL_IMPORT = /from '@\/lib\/(?:juice|feedback|gpsFeel)'/;
const TIMER = /\b(?:setInterval|requestAnimationFrame)\s*\(/g;
const CLOCK_READ = /(?:Date\.now\(\)|new Date\(\s*\))/g;
const CONTINUITY = /startViewTransition|view-transition-name|viewTransitionName/g;
const HEX_LITERAL = /#[0-9a-fA-F]{6}\b/g;
const GL_MARK = /@lcx\/gl|Gl\.tsx'|Relief|Backdrop/;
function validateMatchers() {
  const controls = [
    [AMBIENT, 'className="animate-pulse"', 'className="transition-all"'],
    [FEEL_IMPORT, "import { announce } from '@/lib/juice';", "import { x } from '@/lib/motion';"],
    [TIMER, 'const iv = setInterval(() => tick(), 1000);', 'clearInterval(iv);'],
    [CLOCK_READ, 'const now = Date.now();', 'Date.parse(iso)'],
    [CONTINUITY, 'document.startViewTransition(() => go());', 'document.startElement()'],
    [HEX_LITERAL, "fill='#2C6BFF'", "fill='currentColor'"],
    [GL_MARK, "import { createStage } from '@lcx/gl';", "import { Button } from '@/components/ui';"],
  ];
  for (const [re, yes, no] of controls) {
    re.lastIndex = 0; const y = re.test(yes); re.lastIndex = 0; const n = re.test(no); re.lastIndex = 0;
    if (!y || n) refuse(`matcher ${re} failed its own controls (yes=${y}, no=${n})`);
  }
}
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
const count = (re, s) => { re.lastIndex = 0; let n = 0; while (re.exec(s)) n += 1; re.lastIndex = 0; return n; };

/* ── ROUTES ← router.tsx, and each route's module closure ───────────────────────────── */
function readRoutes() {
  const src = readFileSync(join(SRC, 'router.tsx'), 'utf8');
  const imports = new Map();
  for (const m of src.matchAll(/const (\w+) = lazy\(\(\) => import\('@\/pages\/([^']+)'\)/g)) imports.set(m[1], `pages/${m[2]}`);
  for (const m of src.matchAll(/import \{ (\w+) \} from '@\/pages\/([^']+)'/g)) imports.set(m[1], `pages/${m[2]}`);
  const routes = [];
  for (const m of src.matchAll(/\{ path: '([^']+)', element: <(\w+)/g)) {
    const raw = m[1];
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    const probe = path.replace(/:[A-Za-z]+/g, 'probe');
    routes.push({ path, probe, component: m[2], module: imports.get(m[2]) ?? null, seated: !['/lcxos', '/portal', '/select'].includes(path) });
  }
  if (routes.length < 60) refuse(`router parse found only ${routes.length} routes — the regex has drifted from router.tsx`);
  return routes;
}
function resolveLocal(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(join(SRC, fromFile)), spec);
  else return null;
  for (const ext of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const p = base + ext;
    if (existsSync(p) && !p.endsWith('/')) { try { readFileSync(p); return p.slice(SRC.length + 1); } catch { /* dir */ } }
  }
  return null;
}
function closureOf(entry, hops = 2) {
  const seen = new Set();
  let frontier = [entry];
  for (let h = 0; h <= hops && frontier.length; h += 1) {
    const next = [];
    for (const f of frontier) {
      if (seen.has(f) || !f) continue;
      seen.add(f);
      let src = ''; try { src = readFileSync(join(SRC, f), 'utf8'); } catch { continue; }
      for (const m of src.matchAll(/from '([^']+)'/g)) { const r = resolveLocal(f, m[1]); if (r && !seen.has(r) && !/__tests__|\.test\./.test(r)) next.push(r); }
    }
    frontier = next;
  }
  return [...seen];
}
const SHELL_ENTRY = 'components/layout/AppLayout.tsx';

function staticCensus(files) {
  const out = { files: files.length, ambient: 0, ambientBy: {}, feelFiles: 0, timers: 0, clockReads: 0, continuity: 0, hexLiterals: 0, gl: false, glFiles: [] };
  for (const rel of files) {
    let src = ''; try { src = readFileSync(join(SRC, rel), 'utf8'); } catch { continue; }
    const code = stripComments(src);
    AMBIENT.lastIndex = 0;
    for (const m of code.matchAll(AMBIENT)) { out.ambient += 1; out.ambientBy[m[0]] = (out.ambientBy[m[0]] ?? 0) + 1; }
    if (FEEL_IMPORT.test(code)) out.feelFiles += 1;
    out.timers += count(TIMER, code);
    out.clockReads += count(CLOCK_READ, code);
    out.continuity += count(CONTINUITY, code);
    if (!rel.startsWith('styles/')) out.hexLiterals += count(HEX_LITERAL, code);
    if (GL_MARK.test(rel) || /@lcx\/gl/.test(code)) { out.gl = true; out.glFiles.push(rel); }
  }
  return out;
}

/* ── MATERIAL: the DOM's scenery tokens against the GL rig's, both themes ────────────── */
function materialSeam() {
  const css = readFileSync(join(SRC, 'styles/tokens.css'), 'utf8');
  const theme = readFileSync(join(ROOT, 'packages/gl/src/look/theme.ts'), 'utf8');
  const block = (re) => { const m = re.exec(css); return m ? m[1] : ''; };
  const rootBlock = block(/:root\s*\{([\s\S]*?)\n\}/);
  const darkBlock = block(/\.dark\s*\{([\s\S]*?)\n\}/);
  const token = (blk, name) => {
    const m = new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`).exec(blk);
    return m ? '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('') : null;
  };
  const authored = (t, field) => { const m = new RegExp(`${t}: Object\\.freeze\\(\\{[\\s\\S]*?${field}: '(#[0-9A-Fa-f]{6})'`).exec(theme); return m ? m[1] : null; };
  /* THE TWIN OF EACH DOM TOKEN. `page-bg ↔ page` since S2 gave the rig a page role: the baseline
     paired the page with the GROUND and measured 2.78 / 3.09 — a real seam, but the derivation it
     implied ran backwards (the ground is the page deepened, by the rig's own comment). The ground
     row is kept as the by-design offset so the two readings stay comparable across runs. */
  const pairs = [['page-bg', 'page'], ['card', 'plate'], ['line', 'rule']];
  /* Reported, never scored: the page-to-ground offset is the rig's design (the floor a scene stands
     on is deeper than the page it is drawn on), so it is carried as a reading for comparison with the
     baseline and excluded from the seam maximum the S2 target is judged by. */
  const designed = [['page-bg', 'ground']];
  const rows = [];
  for (const th of ['light', 'dark']) {
    const blk = th === 'light' ? rootBlock : darkBlock;
    for (const [tok, field, isDesigned] of [...pairs.map((p) => [...p, false]), ...designed.map((p) => [...p, true])]) {
      const dom = token(blk, tok), gl = authored(th, field);
      if (!dom || !gl) { rows.push({ theme: th, token: `--${tok}`, dom, glField: field, gl, deltaE: null, designed: isDesigned, note: 'unparsed' }); continue; }
      rows.push({ theme: th, token: `--${tok}`, dom: dom.toUpperCase(), glField: field, gl: gl.toUpperCase(), deltaE: Number(dE(dom, gl).toFixed(2)), designed: isDesigned });
    }
  }
  if (rows.every((r) => r.deltaE === null)) refuse('material seam parsed nothing — tokens.css or theme.ts shape drifted');
  return rows;
}

/* ── RUNTIME ────────────────────────────────────────────────────────────────────────── */
function startDevServer() {
  const bin = join(ROOT, 'node_modules/.bin/vite');
  if (!existsSync(bin)) refuse(`no vite binary at ${bin}`);
  const child = spawn(bin, ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: WEB, env: { ...process.env, VITE_API_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  return { child, log };
}
async function waitForServer(log) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  refuse(`dev server never answered on ${BASE}\n${log.join('').split('\n').slice(-10).join('\n')}`);
}

const READ_PAGE = () => {
  const a = /** @type {any} */ (globalThis).__instrument;
  const vw = innerWidth, vh = innerHeight;
  let figures = 0, textNodes = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seenEl = new Set();
  let n;
  while ((n = walker.nextNode())) {
    const t = n.textContent?.trim() ?? '';
    if (!t) continue;
    const el = n.parentElement; if (!el || seenEl.has(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw || r.width === 0) continue;
    seenEl.add(el); textNodes += 1;
    if (/\d/.test(t)) figures += 1;
  }
  const running = document.getAnimations ? document.getAnimations().filter((x) => x.playState === 'running') : null;
  const anims = running ? running.length : -1;
  // ATTRIBUTION (close-out): a count says "74"; the operator needs to know 74 of WHAT. Key = kind : name : target class.
  const animationsBy = {};
  for (const x of running ?? []) {
    const t = x.effect && x.effect.target;
    const cls = t && typeof t.className === 'string' ? t.className.split(/\s+/).slice(0, 3).join(' ') : (t && t.tagName) || '?';
    const iter = x.effect && x.effect.getTiming ? x.effect.getTiming().iterations : '?';
    const k = `${x.constructor.name}:${x.animationName || x.transitionProperty || 'web-animation'}:${cls}:iter=${iter}:t=${Math.round(Number(x.currentTime) || 0)}ms`.slice(0, 140);
    animationsBy[k] = (animationsBy[k] || 0) + 1;
  }
  return {
    animationsBy,
    dark: document.documentElement.classList.contains('dark'),
    intervals: a ? a.intervals.size : -1,
    intervalSites: a ? [...a.intervals].map((id) => a.intervalSites[id] ?? 'unknown') : [],
    rafCalls: a ? a.rafCalls : -1,
    gl: a ? a.gl : -1,
    vt: a ? a.vt : -1,
    errors: a ? a.errors.slice(0, 5) : [],
    animations: anims,
    figures, textNodes,
    canvases: document.querySelectorAll('canvas').length,
    title: document.title,
  };
};

async function captureRoute(browser, route, theme) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1, timezoneId: 'UTC', locale: 'en-GB',
    colorScheme: theme, reducedMotion: 'no-preference', contrast: 'no-preference', forcedColors: 'none',
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
  try {
    await page.addInitScript(FREEZE_ENV, { at: FROZEN_AT, seed: FROZEN_SEED });
    if (route.seated) await page.addInitScript(seatInit, SEAT);
    if (FIXTURES && route.seated) await page.addInitScript(reliefsOffInit, SEAT);
    await page.addInitScript(themeSeed, { dark: theme === 'dark', scope: route.seated ? SEAT.email : 'anon' });
    await page.addInitScript(PROBE);
    await page.route('**/v1/**', (r) => r.abort('connectionrefused'));
    if (FIXTURES && DESK_ROUTES.has(route.path)) {
      // Registered AFTER the abort: Playwright gives later handlers priority, so the floor stays the floor.
      for (const [glob, body] of allDeskFixtures(new Date(FROZEN_AT).toISOString())) await page.route(glob, (r) => r.fulfill(body()));
    }
    await page.goto(BASE + route.probe, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    // The shell's own anchor for seated routes; the sign-in heading for /select; body otherwise.
    const anchor = route.seated ? page.getByText(/NOT LEGAL ADVICE/i).first() : page.locator('body');
    let reached = 'REACHED';
    try { await anchor.waitFor({ state: 'visible', timeout: 20_000 }); } catch { reached = 'SHELL_NEVER_MOUNTED'; }
    await page.waitForTimeout(1500);
    if (process.env.INSTRUMENT_ANIM_TRACE === '1') {
      // DIAGNOSTIC TRACE (close-out): sample the running animations every 500 ms for 4 s — a one-shot entrance
      // finishes (count falls to 0); a remount loop shows the count holding with currentTime cycling.
      for (let i = 0; i < 8; i++) {
        const smp = await page.evaluate(() => {
          const r = document.getAnimations().filter((x) => x.playState === 'running');
          const ts = r.map((x) => Math.round(Number(x.currentTime) || 0));
          return { n: r.length, min: Math.min(...ts), max: Math.max(...ts), nodes: document.querySelectorAll('.react-flow__node').length };
        });
        console.log(`    trace ${route.path} ${theme} +${1500 + i * 500}ms: running ${smp.n} (t ${smp.n ? smp.min + '–' + smp.max : '—'} ms) · react-flow nodes ${smp.nodes}`);
        await page.waitForTimeout(500);
      }
    }
    // Clocks at rest: rAF callbacks in exactly one second after settle.
    const raf0 = await page.evaluate(() => globalThis.__instrument?.rafCalls ?? 0);
    await page.waitForTimeout(1000);
    const raf1 = await page.evaluate(() => globalThis.__instrument?.rafCalls ?? 0);
    // MOTION AT REST is read HERE — 2.5 s after load, before anything below touches the page. The runtime probe
    // after the continuity click ran on a route that had just re-mounted (navigate → back), so a 0.4 s entrance
    // fade on 74 ontology nodes read as 74 animations "at rest" 300 ms into their re-entry. Same attribution key.
    const atRest = await page.evaluate(() => {
      const running = document.getAnimations ? document.getAnimations().filter((x) => x.playState === 'running') : [];
      const by = {};
      for (const x of running) {
        const t = x.effect && x.effect.target;
        const cls = t && typeof t.className === 'string' ? t.className.split(/\s+/).slice(0, 3).join(' ') : (t && t.tagName) || '?';
        const iter = x.effect && x.effect.getTiming ? x.effect.getTiming().iterations : '?';
        const k = `${x.constructor.name}:${x.animationName || x.transitionProperty || 'web-animation'}:${cls}:iter=${iter}`.slice(0, 120);
        by[k] = (by[k] || 0) + 1;
      }
      return { animations: running.length, animationsBy: by };
    });
    // Continuity: one client-side navigation and back, THROUGH THE APP'S OWN LINKS. The first version
    // faked it with pushState + a synthetic popstate, which React Router serves from its history
    // listener — never through `router.navigate`, which is where S3 defaults the view transition. A
    // probe that measured that path would have reported S3 as zero while every real click transitioned.
    // So: click the first in-app link that leaves this route, then go back.
    // WHAT WAS CLICKED IS RECORDED, so "vt = 0" can never mean "the probe never navigated": the first
    // version matched a hidden sidebar entry, the click silently failed, and zero transitions read as
    // a finding about the app. Only a VISIBLE link counts, and its href and the outcome travel with
    // the row.
    let nav = { linkCount: 0, clicked: null, error: null, urlAfterClick: null };
    if (route.seated && reached === 'REACHED') {
      const links = page.locator(`a[href^="/"]:not([href="${route.probe}"]):not([href^="/lcxos"]):not([target]):visible`);
      nav.linkCount = await links.count().catch(() => 0);
      if (nav.linkCount > 0) {
        const link = links.first();
        nav.clicked = await link.getAttribute('href').catch(() => null);
        try {
          await link.click({ timeout: 5_000 });
          await page.waitForTimeout(700);
          nav.urlAfterClick = new URL(page.url()).pathname;
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10_000 });
          await page.waitForTimeout(500);
        } catch (e) { nav.error = String(e).slice(0, 120); }
      }
    }
    const read = await page.evaluate(READ_PAGE);
    mkdirSync(SHOTS, { recursive: true });
    const stem = `${route.probe.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}-${theme}`;
    let shot = null;
    try { const png = await page.screenshot({ timeout: 15_000 }); writeFileSync(join(SHOTS, `${stem}.png`), png); shot = `${stem}.png`; } catch { /* a missing shot is reported as such */ }
    // `animations` = at rest (before the navigation); the post-return count travels beside it, never as the finding.
    return { theme, reached, rafPerSecond: raf1 - raf0, ...read, animations: atRest.animations, animationsBy: atRest.animationsBy, animationsAfterReturn: read.animations, nav, pageErrors: errs.slice(0, 5), shot };
  } catch (e) {
    return { theme, reached: 'CAPTURE_FAILED', detail: String(e).slice(0, 160), pageErrors: errs.slice(0, 5) };
  } finally { await page.close(); }
}

/* ── MAIN ───────────────────────────────────────────────────────────────────────────── */
async function main() {
  validateColourMaths();
  validateMatchers();
  let routes = readRoutes();
  if (ROUTE_FILTER) routes = routes.filter((r) => ROUTE_FILTER.includes(r.path));

  // STATIC
  const shellFiles = closureOf(SHELL_ENTRY, 2);
  const shell = staticCensus(shellFiles);
  const union = new Set(shellFiles);
  for (const r of routes) {
    r.closure = r.module ? closureOf(`${r.module}.tsx`, 2).filter((f) => !shellFiles.includes(f)) : [];
    r.static = staticCensus(r.closure);
    for (const f of r.closure) union.add(f);
  }
  // Platform totals over the UNION of files, so a shared component is counted once, not once per route.
  const platform = staticCensus([...union]);
  const seam = materialSeam();

  // RUNTIME
  let server = null;
  const runtime = {};
  if (!STATIC_ONLY) {
    const { chromium } = await import('playwright');
    server = startDevServer();
    await waitForServer(server.log);
    const browser = await chromium.launch({ headless: true });
    try {
      let i = 0;
      for (const r of routes) {
        i += 1;
        process.stdout.write(`  [${i}/${routes.length}] ${r.probe}`);
        runtime[r.path] = {};
        for (const theme of ['dark', 'light']) {
          runtime[r.path][theme] = await captureRoute(browser, r, theme);
          process.stdout.write(` ${theme}:${runtime[r.path][theme].reached === 'REACHED' ? '✓' : '✗'}`);
        }
        process.stdout.write('\n');
      }
    } finally {
      await browser.close();
      server.child.kill('SIGTERM');
    }
  }

  // TOTALS
  const rt = Object.values(runtime);
  const reached = rt.filter((x) => x.dark?.reached === 'REACHED' && x.light?.reached === 'REACHED').length;
  const themeCorrect = rt.filter((x) => x.dark?.dark === true && x.light?.dark === false).length;
  const totals = {
    head: HEAD, runAt: RUN_AT, fixtures: FIXTURES, frozenAt: new Date(FROZEN_AT).toISOString(),
    routes: routes.length,
    glRoutes: routes.filter((r) => r.static.gl).length + (shell.gl ? 0 : 0),
    shellCarriesGl: shell.gl,
    ambient: platform.ambient, ambientBy: platform.ambientBy,
    feelFiles: platform.feelFiles,
    timerCallSites: platform.timers, clockReadCallSites: platform.clockReads,
    continuityCallSites: platform.continuity,
    hexLiteralsOutsideTokens: platform.hexLiterals,
    filesInUnion: union.size,
    seam,
    seamMaxDeltaE: Math.max(...seam.filter((s) => s.deltaE !== null && !s.designed).map((s) => s.deltaE)),
    runtime: STATIC_ONLY ? null : {
      captured: rt.length, reachedBothThemes: reached, themeAppliedCorrectly: themeCorrect,
      routesWithContinuity: rt.filter((x) => (x.dark?.vt ?? 0) > 0).length,
      routesWithMotionAtRest: rt.filter((x) => (x.dark?.animations ?? 0) > 0 || (x.light?.animations ?? 0) > 0).length,
      maxLiveIntervals: Math.max(0, ...rt.map((x) => x.dark?.intervals ?? 0)),
      routesWithRafLoop: rt.filter((x) => (x.dark?.rafPerSecond ?? 0) > 10).length,
      routesWithGlContext: rt.filter((x) => (x.dark?.gl ?? 0) > 0).length,
      medianFiguresInViewport: median(rt.map((x) => x.dark?.figures ?? 0)),
      routesWithPageErrors: rt.filter((x) => (x.dark?.pageErrors?.length ?? 0) > 0).length,
    },
  };

  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(join(OUT_DIR, 'BASELINE.json'), JSON.stringify({ totals, shell, routes: routes.map((r) => ({ path: r.path, probe: r.probe, module: r.module, seated: r.seated, static: r.static, runtime: runtime[r.path] ?? null })) }, null, 2));
  writeFileSync(join(OUT_DIR, 'BASELINE.md'), renderMd(totals, shell, routes, runtime));
  writeFileSync(join(SHOTS, '.gitignore'), '*\n!.gitignore\n');
  console.log(`\n  written: ${join(OUT_DIR, 'BASELINE.md')} (HEAD ${HEAD})`);
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function renderMd(t, shell, routes, runtime) {
  const rows = routes.map((r) => {
    const d = runtime[r.path]?.dark, l = runtime[r.path]?.light;
    const rt = d ? `${d.reached === 'REACHED' ? '✓' : '✗'}/${l?.reached === 'REACHED' ? '✓' : '✗'} · anim ${d.animations} · iv ${d.intervals} · raf/s ${d.rafPerSecond} · vt ${d.vt} · gl ${d.gl} · fig ${d.figures}` : '—';
    return `| \`${r.path}\` | ${r.static.gl ? 'GL' : ''} | ${r.static.ambient} | ${r.static.feelFiles} | ${r.static.timers} | ${r.static.clockReads} | ${r.static.continuity} | ${r.static.hexLiterals} | ${rt} |`;
  }).join('\n');
  const seam = t.seam.map((s) => `| ${s.theme} | \`${s.token}\` ${s.dom ?? '?'} | \`${s.glField}\` ${s.gl ?? '?'} | **${s.deltaE ?? 'unparsed'}**${s.designed ? ' _(designed offset — reported, not scored)_' : ''} |`).join('\n');
  const rtBlock = t.runtime ? `
## Runtime (both themes, ${t.fixtures ? 'DESK FIXTURES ON for the eight landings, relief preferences seeded OFF — density there is a property of the DOM LAYOUT, not the data; every other route no API' : 'no API'}, frozen clock ${t.frozenAt})

| | |
|---|---|
| routes captured | ${t.runtime.captured} |
| reached in BOTH themes | ${t.runtime.reachedBothThemes} |
| theme applied correctly in both | ${t.runtime.themeAppliedCorrectly} |
| routes attempting a view transition on client navigation | **${t.runtime.routesWithContinuity}** |
| routes with CSS motion still running at rest | **${t.runtime.routesWithMotionAtRest}** |
| max live \`setInterval\`s on one route | **${t.runtime.maxLiveIntervals}** |
| routes running a rAF loop at rest (> 10 frames/s) | **${t.runtime.routesWithRafLoop}** |
| routes that created a GL context | ${t.runtime.routesWithGlContext} |
| median numeric figures in the first viewport | ${t.runtime.medianFiguresInViewport} |${t.fixtures ? `\n\n**Desk figures in the first viewport (dark / light), fixtures on:** ${routes.filter((r) => DESK_ROUTES.has(r.path)).map((r) => `\`${r.path}\` ${runtime[r.path]?.dark?.figures ?? '—'} / ${runtime[r.path]?.light?.figures ?? '—'}`).join(' · ')}` : ''}
| routes with page errors | ${t.runtime.routesWithPageErrors} |
` : '\n## Runtime\n\n_static-only run — no captures._\n';
  return `# THE INSTRUMENT — baseline

> HEAD \`${t.head}\` · run ${t.runAt} · ${t.routes} routes · ${t.filesInUnion} source files in the union of route closures (+ shell)
> Generated by \`scripts/instrument-audit.mjs\`. Every matcher passed its controls; ΔE2000 passed its Sharma pairs.

## Platform totals (static, over the union of files — a shared component is counted once)

| Metric | Value |
|---|---|
| routes carrying a GL environment | **${t.glRoutes}** of ${t.routes}${t.shellCarriesGl ? ' (+ the shell itself)' : ''} |
| ambient \`animate-*\` occurrences | **${t.ambient}** — ${Object.entries(t.ambientBy).map(([k, v]) => `${k} ${v}`).join(' · ')} |
| files wiring the feel layer (juice / feedback / gpsFeel) | **${t.feelFiles}** |
| \`setInterval\` / \`requestAnimationFrame\` call sites | **${t.timerCallSites}** |
| \`Date.now()\` / \`new Date()\` call sites | **${t.clockReadCallSites}** |
| continuity call sites (\`startViewTransition\` / \`view-transition-name\`) | **${t.continuityCallSites}** |
| hex literals authored outside the token system | **${t.hexLiteralsOutsideTokens}** |

## Material seam — DOM scenery token vs GL scenery colour it should equal

| theme | DOM token | GL field | ΔE2000 |
|---|---|---|---|
${seam}

Max seam **${t.seamMaxDeltaE}** (S2 target: < 1.0 everywhere).
${rtBlock}
## Shell (AppLayout closure, counted once)

ambient ${shell.ambient} · feel files ${shell.feelFiles} · timers ${shell.timers} · clock reads ${shell.clockReads} · continuity ${shell.continuity} · GL ${shell.gl ? shell.glFiles.join(', ') : 'none'}

## Per route (static counts are the route's OWN closure, shell excluded; runtime = dark/light reached · animations at rest · live intervals · rAF per second · view transitions · GL contexts · figures in viewport)

| route | GL | ambient | feel | timers | clock reads | continuity | hex | runtime (dark) |
|---|---|---|---|---|---|---|---|---|
${rows}
`;
}

main().catch((e) => { console.error(e); process.exit(1); });
