/*
 * E9 · THE AUDIT SWEEP — reduced motion, print, the flat fallback, and one perf table.
 *
 * §5 gives E9 four jobs: "quality ladder, reduced-motion audit, print/SVG fallback audit, full perf sweep",
 * with the completion criterion "every environment degrades to a readable flat surface. Nothing is unusable
 * without WebGL."
 *
 * ── WHY THIS IS GENERATED AND NOT WRITTEN ────────────────────────────────────────────
 * An audit written by hand is a claim about a moment. Every README in this programme has now been caught
 * carrying a sentence that was true when typed and false when read: E8 said it was "not wired into the
 * sign-in route yet" for weeks after it shipped, E1 rendered E0's frame time as a number belonging to a
 * different programme, E2's to-do list re-requested work documented as finished forty lines above it, and
 * E3's own axis fix was recorded as a fix while all three of its ticks sat behind a wall.
 *
 * So docs/3d/e9/README.md is OUTPUT. It is regenerated from a live sweep, it carries the date of the sweep,
 * and if it disagrees with the code the fix is to run it again rather than to edit it.
 *
 * ── THE THREE AUDITS ARE TESTS, NOT OBSERVATIONS ─────────────────────────────────────
 * Each one loads a real page and asserts on the DOM:
 *
 *   · REDUCED MOTION — every environment is loaded with `prefers-reduced-motion: reduce` and must reach
 *     READY and present a frame. Rule 3 says reduced motion resolves to the FINAL frame; since no
 *     environment animates, the honest finding is that the rule is satisfied vacuously — and that had never
 *     been captured. A vacuous pass is still a fact, and it is worth recording as vacuous rather than as
 *     compliant, because the day one of them animates the distinction is the whole audit.
 *   · PRINT — the page is switched to print media and the flat fallback must be VISIBLE while the JSON
 *     diagnostic block is hidden. That is the one configuration a reader reaches without an error, so a
 *     fallback that only appears on failure fails print silently.
 *   · NO-WEBGL — taken via `?refuse=1`, which calls the same `die` a failed shader compile calls. The
 *     fallback must be visible and must NAME the refusal.
 */
import { chromium } from '@playwright/test';
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs/3d');
const FONTS = join(ROOT, 'apps/web/public/fonts');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css' };

const envs = readdirSync(DOCS)
  .filter((d) => /^e\d+$/.test(d) && existsSync(join(DOCS, d, 'live.html')))
  .sort();

if (envs.length === 0) {
  console.error('  REFUSED: no built environments found. Run each build.mjs first.');
  console.error('  An audit that finds nothing to audit must not report success.');
  process.exit(1);
}

/* One server per environment directory, because each harness's live.html references its own bundle. Fonts
   are routed out to apps/web/public/fonts — they 404'd for the whole programme before this, so every capture
   was shot with substituted system metrics. */
function serve(dir) {
  const HERE = join(DOCS, dir);
  const s = createServer((q, r) => {
    const rel = normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const f = rel.startsWith('/fonts/') ? join(FONTS, rel.slice('/fonts/'.length))
      : join(HERE, rel === '/' ? 'live.html' : rel);
    if ((!f.startsWith(HERE) && !f.startsWith(FONTS)) || !existsSync(f)) { r.writeHead(404).end(); return; }
    r.writeHead(200, { 'content-type': MIME[f.slice(f.lastIndexOf('.'))] ?? 'application/octet-stream' });
    r.end(readFileSync(f));
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}

const readFallback = () => {
  const el = document.getElementById('lcx-fallback');
  if (!el) return null;
  const log = document.getElementById('log');
  return {
    present: true,
    rows: el.querySelectorAll('tbody tr').length,
    svgs: el.querySelectorAll('svg').length,
    absentCells: el.querySelectorAll('td.absent').length,
    visible: getComputedStyle(el).display !== 'none',
    refusal: el.querySelector('.refusal')?.textContent?.trim().slice(0, 70) ?? null,
    logHidden: log ? getComputedStyle(log).display === 'none' : null,
  };
};

const rows = [];
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

for (const dir of envs) {
  const server = await serve(dir);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/live.html`;
  const row = { id: dir.toUpperCase(), problems: [] };

  // ── 1 · REDUCED MOTION, and the perf/report read in the same pass ───────────────────
  {
    const p = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
    await p.emulateMedia({ reducedMotion: 'reduce' });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${base}?frames=6`);
    try {
      await p.waitForFunction(() => document.title === 'READY', { timeout: 90000 });
    } catch {
      row.problems.push('did not reach READY under prefers-reduced-motion: reduce');
    }
    const rep = await p.evaluate(() => {
      const k = Object.keys(globalThis).find((n) => /^E\d+$/.test(n));
      return k ? globalThis[k] : null;
    });
    /* Rule 2 is asserted on the live page rather than by grepping source: a scheduler installed by a
       bundled dependency would not show up in a grep of entry.ts. */
    const animates = await p.evaluate(() => {
      let scheduled = 0;
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = (cb) => { scheduled++; return raf(cb); };
      return new Promise((ok) => setTimeout(() => ok(scheduled), 400));
    });
    const fb = await p.evaluate(readFallback);
    row.reducedMotionReady = !row.problems.length;
    row.rafAfterReady = animates;
    row.msPerFrame = rep?.msPerFrame ?? null;
    row.rendererClass = rep?.rendererClass ?? (rep?.renderer && /swiftshader/i.test(rep.renderer) ? 'software' : null);
    row.headroom = rep?.headroom ?? null;
    row.headroomRefusal = rep?.headroomRefusal ?? null;
    row.triangles = rep?.triangles ?? null;
    row.glError = rep?.glError ?? null;
    row.brandFidelity = Array.isArray(rep?.brandFidelity) ? rep.brandFidelity.length : null;
    row.fallbackRows = fb ? fb.rows : 0;
    row.fallbackSvgs = fb ? fb.svgs : 0;
    row.fallbackPresent = !!fb?.present;
    row.fallbackHiddenOnSuccess = fb ? !fb.visible : null;
    if (animates > 0) row.problems.push(`scheduled ${animates} animation frames after READY (§6 rule 2)`);
    if (!fb) row.problems.push('no flat fallback in the DOM (§6 rule 1)');
    else if (fb.visible) row.problems.push('fallback still visible although a frame was drawn');
    if (row.brandFidelity === null) row.problems.push('report carries no brandFidelity (§6 rule 5)');
    else if (row.brandFidelity > 0) row.problems.push(`${row.brandFidelity} brand hex round-trip failures`);
    if (errs.length) row.problems.push(`page errors: ${errs.slice(0, 2).join(' | ')}`);
    await p.close();
  }

  // ── 2 · PRINT ──────────────────────────────────────────────────────────────────────
  {
    const p = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
    await p.goto(`${base}?frames=2`);
    try { await p.waitForFunction(() => document.title === 'READY', { timeout: 90000 }); } catch { /* reported above */ }
    await p.emulateMedia({ media: 'print' });
    const fb = await p.evaluate(readFallback);
    row.printFallbackVisible = fb ? fb.visible : false;
    row.printLogHidden = fb ? fb.logHidden : null;
    if (!fb?.visible) row.problems.push('the flat fallback does NOT appear when printing (§6 rule 1)');
    if (fb && fb.logHidden === false) row.problems.push('the JSON diagnostic block prints alongside the frame');
    await p.close();
  }

  // ── 3 · NO-WEBGL, via the real refusal path ────────────────────────────────────────
  {
    const p = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${base}?frames=2&refuse=1`);
    try {
      await p.waitForFunction(() => document.title === 'REFUSED', { timeout: 60000 });
    } catch {
      row.problems.push('?refuse=1 did not take the refusal path — rule 1 has no capture');
    }
    const fb = await p.evaluate(readFallback);
    row.refusalFallbackVisible = fb ? fb.visible : false;
    row.refusalNamed = !!fb?.refusal;
    row.canvasesDrawing = await p.evaluate(() => Array.from(document.querySelectorAll('canvas'))
      .filter((c) => getComputedStyle(c).display !== 'none').length);
    if (!fb?.visible) row.problems.push('fallback stayed hidden through a refusal');
    if (!fb?.refusal) row.problems.push('a refusal was not named to the reader');
    if (row.canvasesDrawing > 0) row.problems.push('a dead canvas is still occupying the viewport on refusal');
    await p.close();
  }

  server.close();
  rows.push(row);
  const bad = row.problems.length;
  console.log(`  ${bad === 0 ? '✓' : '✗'} ${row.id}  ${row.msPerFrame ?? '?'} ms  `
    + `fallback ${row.fallbackRows || row.fallbackSvgs ? 'yes' : 'NO'}  `
    + `print ${row.printFallbackVisible ? 'yes' : 'NO'}  refusal ${row.refusalFallbackVisible ? 'yes' : 'NO'}`
    + (bad ? `  — ${bad} problem${bad > 1 ? 's' : ''}` : ''));
  for (const pr of row.problems) console.log(`      · ${pr}`);
}

await browser.close();

// ── The generated report ─────────────────────────────────────────────────────────────
const stamp = process.env.AUDIT_DATE ?? new Date().toISOString().slice(0, 10);
const failing = rows.filter((r) => r.problems.length > 0);
const t = (v, s = '—') => (v === null || v === undefined ? s : String(v));

mkdirSync(join(DOCS, 'e9'), { recursive: true });
writeFileSync(join(DOCS, 'e9', 'README.md'), `# E9 · THE AUDIT — status: **${failing.length === 0
  ? `all ${rows.length} environments degrade to a readable flat surface`
  : `${failing.length} of ${rows.length} environments have findings`}**

<!-- GENERATED by scripts/3d-audit.mjs. Do not edit: run \`npm run audit-3d\`. -->

Swept ${stamp}. **This file is output, not prose.** Every README in this programme has been caught carrying a
sentence that was true when typed and false when read — E8 claimed for weeks that it was "not wired into the
sign-in route yet" after it had shipped there; E1 rendered E0's frame time as a number belonging to a
different programme; E2's to-do list re-requested work it documents as finished forty lines above; E3
recorded its own axis fix as a fix while all three ticks sat behind a wall. So this one is regenerated from
a live sweep. If it disagrees with the code, run it again rather than editing it.

## The sweep

| env | ms/frame | renderer | 60 Hz headroom | triangles | glError | brand | flat fallback | hidden on success |
|---|---|---|---|---|---|---|---|---|
${rows.map((r) => `| **${r.id}** | ${t(r.msPerFrame)} | ${t(r.rendererClass)} | ${r.headroom === null
  ? `refused · \`${t(r.headroomRefusal, 'n/a')}\`` : t(r.headroom)} | ${t(r.triangles)} | ${t(r.glError)} | ${
  r.brandFidelity === 0 ? 'exact' : t(r.brandFidelity)} | ${r.fallbackSvgs
    ? `${r.fallbackSvgs} svg` : `${r.fallbackRows} rows`} | ${r.fallbackHiddenOnSuccess ? 'yes' : 'NO'} |`).join('\n')}

Every frame time here is measured under **SwiftShader**, a CPU rasteriser, by the trailing-\`readPixels\`
instrument. The 60 Hz headroom column **refuses** rather than reporting a figure, because the ratio between a
software rasteriser and real hardware is not a constant — E0 measured 1.305 ms on an M1 for a scene
SwiftShader labours over. Real-hardware timing for E1–E7 is **unmeasured**: E0's and E8's M1 figures came
from manual browser sessions, and these harnesses have only ever run headless.

## Audit 1 · Reduced motion (§6 rule 3)

| env | reaches READY under \`reduce\` | animation frames scheduled after READY |
|---|---|---|
${rows.map((r) => `| **${r.id}** | ${r.reducedMotionReady ? 'yes' : 'NO'} | ${t(r.rafAfterReady)} |`).join('\n')}

**The rule is satisfied VACUOUSLY, and that is the honest finding.** Rule 3 says reduced motion resolves to
the final frame rather than a faster animation. No environment animates at all — each renders N frames for
timing, then one, then stops — so there is no animation for the preference to resolve. Recorded as vacuous
rather than as compliant, because the day one of them animates that distinction is the entire audit.

What this sweep *does* prove is stronger than a source grep: \`requestAnimationFrame\` is **wrapped on the
live page** and counted for 400 ms after READY, so a scheduler installed by a bundled dependency would be
caught where a grep of \`entry.ts\` would miss it.

The one place reduced motion is genuinely implemented is product code, not a harness:
\`apps/web/src/components/brand/ForgeBackdrop.tsx\` renders its final frame once and returns without ever
scheduling a frame, and \`apps/web/e2e/smoke.spec.ts\` holds a reduced-motion pixel baseline for it.

## Audit 2 · Print (§6 rule 1)

| env | fallback visible when printing | JSON block hidden |
|---|---|---|
${rows.map((r) => `| **${r.id}** | ${r.printFallbackVisible ? 'yes' : 'NO'} | ${r.printLogHidden === null ? '—' : r.printLogHidden ? 'yes' : 'NO'} |`).join('\n')}

Print is the configuration a reader reaches **without an error**, which is why the fallback is built before
the stage and hidden by CSS rather than constructed in a catch block: there is no exception to catch when
someone presses Cmd-P, and a print-only tree built at print time is not in the snapshot.

## Audit 3 · No WebGL (§6 rule 1)

| env | fallback visible on refusal | refusal named to the reader | dead canvases still shown |
|---|---|---|---|
${rows.map((r) => `| **${r.id}** | ${r.refusalFallbackVisible ? 'yes' : 'NO'} | ${r.refusalNamed ? 'yes' : 'NO'} | ${t(r.canvasesDrawing)} |`).join('\n')}

Taken through \`?refuse=1\`, which calls the same \`die\` a failed shader compile calls — not a mock. You
cannot switch off WebGL from inside the page, which is why this claim had never been captured anywhere in the
programme until now. The first such capture immediately found a defect no code review had: the fallback was
correctly present *and* correctly visible while the reader still saw 720 px of blank canvas filling the
viewport with the data below the fold. A canvas that will never be drawn into is not a placeholder, it is an
obstruction.

## Audit 4 · The quality ladder

\`packages/gl/src/env/quality.ts\`. §8 hedged that the ladder "becomes mandatory rather than optional" if the
AO and DOF estimates were 2× out. **E0 measured, and it is mandatory:** 11.328 ms at 2× with depth of field
against a 16.6 ms budget is 5.3 ms of headroom on an M1 — the fastest machine this will run on.

| tier | dpr | AO | DOF | shadow map | taps | particles | volume steps |
|---|---|---|---|---|---|---|---|
| **full** | 2× | yes | yes | 1536 | 9 | 4096 | 128 |
| **reduced** | 2× | yes | **no** | 1024 | 9 | 2048 | 96 |
| **minimum** | 1× | no | no | 512 | 1 | 512 | 48 |

Three decisions worth defending:

- **Depth of field goes before resolution**, which is the opposite of the usual instinct. Type and edges live
  in the resolution; E1 *measured* the lens as costing four of five readable panels. The most expensive pass
  is also the one whose loss costs the reader least — a happy accident, and worth saying out loud because it
  will not be true of the next effect.
- **The minimum tier keeps a shadow**, at one tap. A scene with no shadow loses contact between object and
  ground, and an object that does not sit on a surface reads as a *mistake* rather than as a cheaper render.
- **It refuses rather than guessing.** A tier is never chosen from a software rasteriser (the ratio to real
  hardware is not a constant) nor from a zero or NaN probe (which would imply an infinitely fast machine on a
  machine that hung). When even \`minimum\` will not fit, it returns \`minimum\` *and says the budget is
  unreachable*, pointing at the flat fallback rather than inventing a fourth tier.

**Not wired into the environments.** The ladder is built, tested and budgeted; every harness still renders at
a fixed configuration with its own \`?ao=0\`/\`?dof=0\` switches. Naming that rather than implying otherwise.

## What this audit does NOT establish

**§7(b) is untimed on all ${rows.length} environments.** The gate is "(a) a stranger stops scrolling; (b) an
operator still gets their answer at least as fast as the flat version", and (b) is measured with a task, a
stopwatch and both surfaces side by side. Nobody has been put in front of either. Every §7(b) argument in
this programme — including E4's measured crossing count and E7's stated integration limit, which are the two
strongest — is a *reason to expect* a good result. That is not a result.

**Real-hardware frame times.** Every number above is SwiftShader.

${failing.length === 0 ? '' : `## Findings\n\n${failing.map((r) => `**${r.id}**\n${r.problems.map((p) => `- ${p}`).join('\n')}`).join('\n\n')}\n`}
## Reproduce

\`\`\`bash
npm run audit-3d
\`\`\`
`);

console.log(`\n  wrote docs/3d/e9/README.md — ${rows.length} environments, ${failing.length} with findings`);
process.exit(failing.length > 0 ? 1 : 0);
