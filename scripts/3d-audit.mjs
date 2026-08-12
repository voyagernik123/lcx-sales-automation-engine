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
 * ── THE AUDITS ARE TESTS, NOT OBSERVATIONS ───────────────────────────────────────────
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
 *   · CONTEXT LOSS — the only one of the four that happens to a page which has ALREADY SUCCEEDED. Provoked
 *     with the real `WEBGL_lose_context` extension after READY. The table must come back and the refusal
 *     must be named. This was missing while the file's own headline said all nine environments degrade to a
 *     readable flat surface: that claim was being made about three configurations out of four, and the one
 *     it left out was the one the recovery code had been written for.
 */
import { chromium } from '@playwright/test';
import { readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveHarness } from '../docs/3d/_shared/serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs/3d');
const FONTS = join(ROOT, 'apps/web/public/fonts');

const envs = readdirSync(DOCS)
  .filter((d) => /^e\d+$/.test(d) && existsSync(join(DOCS, d, 'live.html')))
  .sort();

if (envs.length === 0) {
  console.error('  REFUSED: no built environments found. Run each build.mjs first.');
  console.error('  An audit that finds nothing to audit must not report success.');
  process.exit(1);
}

/* One server per environment directory, because each harness's live.html references its own bundle. The
   handler itself now lives in docs/3d/_shared/serve.mjs — it was copied into this file and into eleven
   capture.mjs files, and every copy could be killed outright by a single `GET /fonts/`. The reason is
   documented where the fix is. A dead server here kills the sweep mid-run and leaves the generated README
   unwritten, which is the worst way for an audit to fail: silently, with the old file still on disk. */
const serve = (dir) => serveHarness({ root: join(DOCS, dir), fonts: FONTS });

const readFallback = () => {
  const el = document.getElementById('lcx-fallback');
  if (!el) return null;
  const log = document.getElementById('log');
  /*
   * VISIBLE IS MEASURED AS GEOMETRY, NOT AS `display`, and the change is not cosmetic.
   *
   * The success path used to be `display: none`, so `display !== 'none'` was a fair proxy for "the reader
   * sees it". `display: none` also pruned the table out of the accessibility tree, which is the opposite of
   * what the fallback is for, so it is now clipped to a 1×1 box instead: still rendered, still in the AX
   * tree and the print snapshot, still occupying no visual space. Under the old proxy that clipped element
   * reads as VISIBLE and every environment would have failed "fallback still visible although a frame was
   * drawn" — a check measuring the wrong thing, reporting the wrong verdict, about a fix.
   *
   * So the question asked here is the one the audit actually means: does this element take up room on the
   * screen? A 1×1 clip does not. Print media un-clips it and the height goes to hundreds of pixels; a
   * refusal un-clips it the same way.
   */
  const box = el.getBoundingClientRect();
  return {
    present: true,
    rows: el.querySelectorAll('tbody tr').length,
    svgs: el.querySelectorAll('svg').length,
    absentCells: el.querySelectorAll('td.absent').length,
    visible: getComputedStyle(el).display !== 'none' && box.height > 4 && box.width > 4,
    boxHeight: Math.round(box.height),
    /* Rendered at all — the property the accessibility tree and the print snapshot actually depend on.
       A `display: none` subtree is in neither, whatever the DOM says. */
    rendered: getComputedStyle(el).display !== 'none',
    columnHeaders: el.querySelectorAll('th[scope="col"]').length,
    refusal: el.querySelector('.refusal')?.textContent?.trim().slice(0, 70) ?? null,
    logHidden: log ? getComputedStyle(log).display === 'none' : null,
  };
};

const t = (v, s = '—') => (v === null || v === undefined ? s : String(v));
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
    row.fallbackRenderedOnSuccess = fb ? fb.rendered : null;
    if (animates > 0) row.problems.push(`scheduled ${animates} animation frames after READY (§6 rule 2)`);
    if (!fb) row.problems.push('no flat fallback in the DOM (§6 rule 1)');
    else if (fb.visible) row.problems.push('fallback still visible although a frame was drawn');
    /*
     * IN THE DOM IS NOT IN THE ACCESSIBILITY TREE. Both checks above passed for the whole programme while
     * the success path was `display: none`, which prunes the subtree — so the table was present, hidden,
     * and unreachable by a screen reader on the one configuration a reader is actually in. §6 rule 4 says
     * the DOM text IS the accessibility tree and the print path; that only holds if it is rendered.
     */
    else if (!fb.rendered) {
      row.problems.push('the fallback is display:none on success — in neither the accessibility tree nor '
        + 'the print snapshot (§6 rules 1 and 4)');
    }
    if (row.brandFidelity === null) row.problems.push('report carries no brandFidelity (§6 rule 5)');
    else if (row.brandFidelity > 0) row.problems.push(`${row.brandFidelity} brand hex round-trip failures`);
    if (errs.length) row.problems.push(`page errors: ${errs.slice(0, 2).join(' | ')}`);
    await p.close();
  }

  // ── 1b · THE LADDER, MEASURED BY ALTERNATING MEDIANS ───────────────────────────────
  {
    /*
     * ALTERNATING A/B/A/B, MEDIAN OF EACH — and the previous method is why.
     *
     * The first version measured `full` once, then `minimum` once, then `full` again and used the spread of
     * the two `full` runs as a noise floor. It reported E8's minimum tier as 38% SLOWER, "beyond this run's
     * own 2.1% noise". An alternating probe of the same build returned -3.6%.
     *
     * The flaw is that two consecutive same-tier loads share whatever the machine was doing at that moment,
     * so their agreement measures short-term stability and not the variance BETWEEN the two things being
     * compared. A noise floor estimated more tightly than the comparison it guards will call ordinary drift
     * a defect — which is exactly what it did, and I nearly went looking for a shadow-path bug on the
     * strength of it.
     *
     * Interleaving makes load order cancel instead of accumulate, and a median discards the one slow run a
     * mean would carry. Six loads per environment rather than three. That is the price of a number that
     * means something.
     */
    const median = (xs) => { const v = xs.filter((x) => typeof x === 'number').sort((x, y) => x - y);
      return v.length ? v[Math.floor(v.length / 2)] : null; };
    const measure = async (tier) => {
      const p = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
      await p.goto(`${base}?frames=6&tier=${tier}`);
      try { await p.waitForFunction(() => document.title === 'READY', { timeout: 90000 }); } catch { /* below */ }
      const rep = await p.evaluate(() => {
        const k = Object.keys(globalThis).find((n) => /^E\d+$/.test(n));
        return k ? globalThis[k] : null;
      });
      await p.close();
      return rep;
    };

    const fulls = [];
    const mins = [];
    let lastMin = null;
    for (let i = 0; i < 3; i++) {
      const f = await measure('full');
      if (f?.msPerFrame) fulls.push(f.msPerFrame);
      const m = await measure('minimum');
      if (m?.msPerFrame) mins.push(m.msPerFrame);
      lastMin = m ?? lastMin;
    }

    row.tierFull = median(fulls);
    row.tierMinimum = median(mins);
    row.tierReported = lastMin?.tier ?? null;
    /* Spread of the `full` runs across the WHOLE interleaved sequence — the same span the comparison is
       drawn over, which is what makes it a fair floor. */
    row.noisePct = (fulls.length > 1 && row.tierFull)
      ? Number((100 * (Math.max(...fulls) - Math.min(...fulls)) / row.tierFull).toFixed(1)) : null;
    row.tierSaving = (row.tierFull && row.tierMinimum)
      ? Number((100 * (1 - row.tierMinimum / row.tierFull)).toFixed(1)) : null;

    /*
     * WHAT THE TIER CAN ACTUALLY TOUCH IN THIS SCENE. E0, E2 and E8 never reported `ao`/`dof`, so for them
     * the tier drives only the shadow map — and a near-zero saving there is the correct result, not a
     * broken ladder. Reported so a small number is explained rather than suspicious.
     */
    row.tierAffects = [
      lastMin?.ao !== undefined ? 'ao' : null,
      lastMin?.dof !== undefined ? 'dof' : null,
      lastMin?.tierShadowMapSize !== undefined ? 'shadow' : null,
    ].filter(Boolean).join('+') || 'shadow only';

    if (row.tierReported !== 'minimum') {
      row.problems.push(`?tier=minimum reported tier "${t(row.tierReported)}" — the tier is not wired`);
    }
    if (row.tierSaving !== null && row.noisePct !== null && row.tierSaving < -row.noisePct) {
      row.problems.push(`minimum is ${-row.tierSaving}% slower than full, beyond the ${row.noisePct}% spread `
        + 'of the interleaved full runs');
    }
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

  // ── 4 · CONTEXT LOSS, the one runtime failure rule 1 exists for ─────────────────────
  {
    /*
     * WHY THIS AUDIT EXISTS. The three audits above cover reduced motion, print and no-WebGL. None of them
     * covers the failure that happens to a page that has ALREADY SUCCEEDED: the GPU takes the context away
     * mid-session. Measured on a built E0 before it was handled — `gl.isContextLost()` true, `document.title`
     * still READY, the fallback still hidden, and the canvas a blank white rectangle on a #04060b page, its
     * element screenshot down from 101,420 to 5,140 bytes. `showRefusal` had always carried the comment "a
     * context loss mid-session is exactly the case where the reader needs the data back" and nothing was
     * listening, so the branch was unreachable. The headline of this file claims all N environments degrade
     * to a readable flat surface; that claim was being made about three configurations out of four.
     *
     * Taken through the real `WEBGL_lose_context` extension, which is how Chrome itself simulates the event —
     * not by dispatching a synthetic one, which would prove only that a listener exists.
     *
     * A STALE BUNDLE FAILS THIS. The listener lives in docs/3d/_shared/flatFallback.ts, so an environment
     * whose bundle.js predates it will report both problems below. Rebuild the harness before diagnosing.
     */
    const p = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
    await p.goto(`${base}?frames=2`);
    try { await p.waitForFunction(() => document.title === 'READY', { timeout: 90000 }); } catch { /* reported above */ }
    const provoked = await p.evaluate(() => {
      for (const c of Array.from(document.querySelectorAll('canvas'))) {
        for (const api of ['webgl2', 'webgl']) {
          const gl = c.getContext(api);
          if (!gl) continue;
          const ext = gl.getExtension('WEBGL_lose_context');
          if (ext) { ext.loseContext(); return true; }
        }
      }
      return false;
    });
    await p.waitForTimeout(400);
    const fb = await p.evaluate(readFallback);
    row.contextLossProvoked = provoked;
    row.contextLossFallbackVisible = fb ? fb.visible : false;
    row.contextLossNamed = !!fb?.refusal;
    row.contextLossCanvasesShown = await p.evaluate(() => Array.from(document.querySelectorAll('canvas'))
      .filter((c) => getComputedStyle(c).display !== 'none').length);
    if (!provoked) {
      /* Not a pass. An audit that could not stage its own failure has measured nothing, and saying so is the
         only honest result — this is the same rule as refusing an empty environment list at the top. */
      row.problems.push('could not provoke a context loss (no WEBGL_lose_context) — this audit proved nothing');
    } else {
      if (!fb?.visible) row.problems.push('a lost WebGL context left the data hidden behind a dead canvas (§6 rule 1)');
      if (!fb?.refusal) row.problems.push('a lost WebGL context was never named to the reader');
      if (row.contextLossCanvasesShown > 0) row.problems.push('a dead canvas is still occupying the viewport after a context loss');
    }
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

mkdirSync(join(DOCS, 'e9'), { recursive: true });
/* The headline NAMES ITS SCOPE. "All N degrade to a readable flat surface" was being asserted by a sweep that
   covered three configurations, and the one it left out — a context loss on a page that had already drawn —
   was the one where the data was measurably unreachable. An unqualified claim is only as good as its widest
   untested configuration, so the headline now lists what was actually loaded. */
writeFileSync(join(DOCS, 'e9', 'README.md'), `# E9 · THE AUDIT — status: **${failing.length === 0
  ? `all ${rows.length} environments degrade to a readable flat surface — print, no-WebGL and a lost context`
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

## Audit 4 · The quality ladder — measured, not assumed

| env | tier reported | tier drives | full (median of 3) | spread | minimum (median of 3) | saving |
|---|---|---|---|---|---|---|
${rows.map((r) => `| **${r.id}** | ${t(r.tierReported)} | ${t(r.tierAffects)} | ${t(r.tierFull)} ms | ±${t(r.noisePct)}% | ${t(r.tierMinimum)} ms | ${r.tierSaving === null ? '\u2014' : r.tierSaving + '%'} |`).join('\n')}

The tier table is monotonic by construction — \`env.test.ts\` asserts every axis descends together, because a
ladder with one axis going the wrong way makes a lower tier *slower* on some machines, so the fallback for a
slow machine is the thing that breaks it. But whether dropping ambient occlusion and shrinking the shadow map
actually makes a given scene faster is a fact about that scene, not about the table. So both ends are rendered
and compared above.

**The method matters more than the numbers.** Each tier is rendered THREE times, ALTERNATING full/minimum,
and each column is a median. The first version measured full once, minimum once, full again, and used the two
full runs as a noise floor — it reported E8's minimum tier as **38% slower "beyond this run's own 2.1%
noise"**, and an alternating probe of the same build returned **-3.6%**. Two consecutive same-tier loads share
whatever the machine was doing at that moment, so their agreement measures short-term stability rather than the
variance between the two things being compared; a floor estimated more tightly than the comparison it guards
will call ordinary drift a defect. It did, and I nearly went looking for a shadow-path bug on the strength of
it. Interleaving makes load order cancel instead of accumulate, and a median discards the one slow run a mean
would carry. The \`tier drives\` column exists for the same reason${(() => {
  /*
   * DERIVED FROM THE ROWS, BECAUSE THE HARDCODED VERSION WAS FALSE. This sentence used to read "E2 has no
   * ambient occlusion and no depth of field, so `minimum` changes only its shadow map" while the table ten
   * lines above it — generated by this same script, from the same sweep — recorded E2's tier as driving
   * `ao+dof+shadow`, and docs/3d/e2/entry.ts creates both passes. Naming an environment in prose that the
   * generator did not compute is how a generated file goes stale, which is the one thing it cannot do.
   */
  const shadowOnly = rows.filter((r) => r.tierAffects && !r.tierAffects.includes('ao') && !r.tierAffects.includes('dof'));
  return shadowOnly.length === 0
    ? ': where a scene has no ambient occlusion and no depth of field for the ladder to compose with, '
      + '`minimum` changes only its shadow map and a near-zero saving is the correct result rather than a '
      + 'broken ladder. On this sweep that case did not arise — every environment reports at least one of '
      + '`ao` or `dof`.'
    : `: ${shadowOnly.map((r) => `**${r.id}** (\`${r.tierAffects}\`)`).join(', ')} `
      + `${shadowOnly.length === 1 ? 'has' : 'have'} no ambient occlusion and no depth of field for the ladder `
      + `to compose with, so \`minimum\` changes only the shadow map and a near-zero saving there is the `
      + `correct result rather than a broken ladder.`;
})()}

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

${(() => {
  /*
   * THIS PARAGRAPH USED TO BE A FIXED SENTENCE SAYING THE LADDER WAS "not wired into the environments",
   * fifty lines below the Audit 4 table in which all nine environments report the tier they were asked for.
   * It was true when typed and false when read — the exact failure this file's own lede is about — and
   * because it was baked into the generator, re-running the audit could not clear it. The sweep already
   * decides this question at `row.tierReported` (and raises a finding when it is not `minimum`), so the
   * statement is now read off the same data as the table it sits under.
   */
  const wired = rows.filter((r) => r.tierReported === 'minimum');
  const not = rows.filter((r) => r.tierReported !== 'minimum');
  if (not.length === 0) {
    return `**Wired into all ${rows.length} environments.** Every one loaded with \`?tier=minimum\` reported `
      + `\`minimum\` back, and the \`tier drives\` column above is what each scene changed in response. `
      + `Measured, not read off the source.`;
  }
  if (wired.length === 0) {
    return `**Not wired into any of the ${rows.length} environments.** Every one was loaded with `
      + `\`?tier=minimum\` and none reported \`minimum\` back, so the ladder is built, tested and budgeted `
      + `and no harness consults it.`;
  }
  return `**Wired into ${wired.length} of ${rows.length} environments.** `
    + `${not.map((r) => `**${r.id}** reported \`${t(r.tierReported)}\``).join(', ')} when asked for `
    + `\`minimum\`, so ${not.length === 1 ? 'that harness' : 'those harnesses'} still `
    + `${not.length === 1 ? 'renders' : 'render'} at a fixed configuration.`;
})()}

## Audit 5b · §7(a) — a decision sheet, because it is not measurable

\`docs/3d/e9/gate-a.html\`. Clause (a) is *"a stranger stops scrolling"*, and it **has no instrument and cannot
have one**: attention in the wild is not measurable at a desk by the people who built the thing, and a five-point
scale would only be a number with nothing behind it — which is the exact failure this programme has already
committed twice, with a 0.45 ms frame time and a 60 Hz headroom both produced by instruments that could not
measure them.

So the sheet does not measure (a). It makes the judgement cheap and even-handed, which is the honest maximum:

- **Both panels are the same data.** The relief panel is the environment; the flat panel is that environment's
  own fallback, reached through its real refusal path. Not a mock-up, not a different dataset.
- **Both at the surface's real proportions**, because §5 says a capture at the wrong aspect ratio is as
  misleading as no capture.
- **The environment's own verdict** is printed beside it, read from its README's first line, so a decision
  cannot be made against a claim the environment does not make.
- **Which panel is which is hidden until you choose**, shuffled *per row* rather than once — a single global
  order lets a reader learn by the second row that the left panel is always the environment, and every
  judgement after that is made knowing the answer. Labels reveal only for the row just decided.

The output is tagged \`JUDGEMENT_NOT_MEASUREMENT\` and carries a judge count. That distinction is the point, and
it should survive being quoted.

## Audit 5 · §7(b) — the instrument exists; the reading does not

\`docs/3d/e9/task.html\`. The gate's second clause is *"an operator still gets their answer at least as fast as
the flat version"*, and the plan says how to settle it: a task, a stopwatch, both surfaces. **Nothing in this
programme has measured it.** Every §7(b) claim made so far — including E4's measured crossing count and E7's
stated integration limit, the two strongest — is a reason to *expect* a good result, which is not a result.

So the instrument is built. Four things would each invalidate it, and each is handled rather than hoped about:

- **Both surfaces show the same data, by construction.** Each pair is the SAME harness page: \`live.html\`
  renders the environment, \`live.html?refuse=1\` takes the real refusal path and renders that environment's
  flat fallback from the identical dataset. Not a re-implementation that could drift — one branch apart.
- **Order is counterbalanced**, or the second surface benefits from having just seen the question and the
  result measures learning rather than legibility.
- **Each question is asked once per operator.** Every environment carries a matched PAIR, and which member
  goes to which surface flips with the counterbalance, so nobody answers the same question twice.
- **The clock starts when the surface actually appears**, not when the trial begins. A harness takes a second
  or two to compile shaders; charging that to reading time would make the environment look slower by exactly
  the time it takes to exist — and \`?refuse=1\` settles almost immediately, so the bias would be
  one-directional. A trial whose startup could not be confirmed is flagged and excluded.

And it **refuses rather than reporting a meaningless comparison**: too few trials, unequal accuracy, or no
correct answers on a surface each produce a coded refusal instead of a time. A faster WRONG reading is a worse
surface, so a time advantage is only reported when accuracy is at least equal.

Verified mechanically — 8 trials, counterbalance alternating, zero duplicate questions, every trial timed,
startup excluded in all 8 — by clicking through it with deliberately wrong answers, which correctly produced
\`REFUSED · NO_CORRECT_ANSWERS_ON_ONE_SURFACE\`. An instrument that declines to draw a conclusion from garbage
is the only kind worth having.

**It cannot be run by whoever built these surfaces.** The file is its own answer key, and a self-administered
result would be worse than none. §7(b) is therefore still open, and now it is open in the way a measurement is
open rather than in the way an argument is.

## Audit 6 · A lost WebGL context (§6 rule 1, on a page that already succeeded)

| env | loss provoked | fallback returns | refusal named | dead canvases still shown |
|---|---|---|---|---|
${rows.map((r) => `| **${r.id}** | ${r.contextLossProvoked ? 'yes' : 'NO'} | ${r.contextLossFallbackVisible ? 'yes' : 'NO'} | ${r.contextLossNamed ? 'yes' : 'NO'} | ${t(r.contextLossCanvasesShown)} |`).join('\n')}

Audits 1–3 cover reduced motion, print and no-WebGL. All three are configurations a page is in from the
start. This one is the failure that happens to a page that has **already succeeded**: the GPU takes the
context away mid-session, \`markRendered()\` has already run, and the table is off the screen. Measured before
it was handled — \`gl.isContextLost()\` true, \`document.title\` still READY, the fallback still hidden, the
canvas a blank white rectangle on a #04060b page. The recovery path existed and named this exact case in a
comment; nothing was listening, so it was unreachable.

Provoked through the real \`WEBGL_lose_context\` extension rather than a synthetic event, which would prove
only that a listener exists. The listener itself is in \`docs/3d/_shared/flatFallback.ts\` rather than in nine
harnesses, for the same reason the table is built there: a harness can forget. **A bundle older than that
listener fails this audit** — rebuild the harness before diagnosing it.

## What this audit does NOT establish

**§7(b) is untimed on all ${rows.length} environments.** The instrument is now built and verified (Audit 5) and
no operator has run it. Until one does, every §7(b) claim here remains a reason to expect a good result.

**And it never will establish (a).** "A stranger stops scrolling" is not measurable at a desk with two people,
and dressing it up with a Likert scale would be the same category error as reporting a 60 Hz headroom measured
under SwiftShader.

**Real-hardware frame times.** Every number above is SwiftShader.

${failing.length === 0 ? '' : `## Findings — open, not explained away

A finding here is a measurement that survived the instrument's own noise floor. None of them has been
diagnosed; the threshold has deliberately NOT been loosened to make this section empty, because a check tuned
until it passes is not a check.
${(() => {
  /*
   * WHAT WAS HERE, AND WHY IT HAD TO GO. This preamble was fixed prose asserting "**E8's minimum tier
   * measures ~38% SLOWER than full, against 2.1% noise on the same run**" and that "for E2 and E8 the tier
   * drives only the shadow-map size". Both halves were retracted by this script's own later work — the
   * interleaved method above reports E8 SAVING ~78%, and the generated table gives both E2 and E8
   * `ao+dof+shadow` — and the block was gated only on SOME environment having SOME problem. So a print-CSS
   * regression on E3 would have republished a disproven number about E8 as "the largest" finding, above the
   * real ones. Reproduced exactly that way with one synthetic E3 finding and E8 not in the sweep at all.
   *
   * A generated findings section must contain no environment name and no number the generator did not
   * compute. So the headline is now the slowest-at-minimum environment IF the sweep found one, and silence
   * otherwise.
   */
  const slower = rows
    .filter((r) => r.tierSaving !== null && r.noisePct !== null && r.tierSaving < -r.noisePct)
    .sort((a, b) => a.tierSaving - b.tierSaving);
  const worst = slower[0];
  if (!worst) return '';
  return `\nWorth stating plainly: **${worst.id}'s minimum tier measures ~${-worst.tierSaving}% SLOWER than `
    + `full, against ${worst.noisePct}% spread across the interleaved full runs**, with the tier driving `
    + `\`${t(worst.tierAffects)}\` in that scene. That is not a mechanism this sweep can account for, and `
    + `saying so is more useful than a plausible guess.\n`;
})()}
${failing.map((r) => `**${r.id}**\n${r.problems.map((p) => `- ${p}`).join('\n')}`).join('\n\n')}\n`}
## Reproduce

\`\`\`bash
npm run audit-3d
\`\`\`
`);

console.log(`\n  wrote docs/3d/e9/README.md — ${rows.length} environments, ${failing.length} with findings`);
process.exit(failing.length > 0 ? 1 : 0);
