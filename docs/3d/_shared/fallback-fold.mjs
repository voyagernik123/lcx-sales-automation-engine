/*
 * THE FLAT FALLBACK MUST BE IN THE FRAME THE OPERATOR IS GIVEN.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────
 * `docs/3d/e9/INSTRUMENT_CHECK.md` failed the §7(b) trial as an instrument, and one of its five findings
 * was not a wrong question or a leaked answer — it was a branch that painted nothing. E2's FLAT surface
 * put its first ink at y766 inside a 758 px frame: 0 of 37 visible text nodes above the fold, 2 distinct
 * colours, 0.43 % of pixels differing from the modal one. An operator was timed for that trial while
 * looking at an empty box, and a §7(b) comparison is a comparison AGAINST that branch.
 *
 * The cause was not in E2's data or E2's table, both of which were correct. `showRefusal` in
 * `flatFallback.ts` hides `canvas` elements on refusal — the fix a previous audit made after finding
 * "720 px of blank canvas filling the viewport with the data below the fold" — and E2's obstruction is one
 * element ABOVE the canvas: a `<div id="stage" style="…height:720px">` that `e2/build.mjs` writes into the
 * page shell and that survives a canvas-only sweep. `scripts/3d-audit.mjs` already asserts "a dead canvas
 * is still occupying the viewport on refusal" and counted zero, correctly, while the data sat 720 px down.
 *
 * So the check that was missing is not another check on canvases. It is a check on the OUTCOME: whatever
 * the page is made of, is the flat table in the frame? That is what this file measures, and it is why it
 * measures a y coordinate rather than a set of elements — the next host to reserve space will not be a
 * canvas either, and a check that enumerates the ways space can be reserved will keep being one behind.
 *
 * ── WHAT IT ASSERTS, PER ENVIRONMENT, ON BOTH REFUSAL PATHS ──────────────────────────
 *   1 · the refusal actually happened — on `refuse` the title reaches REFUSED; on `lost` a real context
 *       loss was provoked and the fallback came back un-clipped. (Waiting for the TITLE on the second
 *       path is a false failure this check made once and now documents at the line that made it:
 *       `die()` sets the title and a context loss does not go through `die()`.)
 *   2 · `#lcx-fallback` is present and takes up room on the screen;
 *   3 · its top is ABOVE the fold of the frame the trial hands the operator;
 *   4 · at least one of its own text nodes is visible above that fold — so a one-pixel sliver of section
 *       at the bottom of the frame does not pass as a readable fallback.
 *
 * Two paths, because they have different DOM at refusal time and only one of them was ever measured:
 *
 *   `refuse`  ·  `live.html?refuse=1`, the path `refused.png` and `scripts/3d-audit.mjs` take. `die()`
 *                runs during module evaluation, so nothing the harness builds at runtime exists yet and
 *                the only obstruction possible is the page shell's own markup. This is the path the §7(b)
 *                trial's flat branch is.
 *   `lost`     ·  a real `WEBGL_lose_context` after READY — the failure `flatFallback.ts` registers its
 *                listener for. By then every environment except E0 has built itself a
 *                `position:relative;overflow:hidden;width:1200px;height:720px` wrapper to clip its
 *                projected labels, so on this path EIGHT of the nine put the fallback below the fold
 *                before the fix that came with this file. It is the same defect; it was simply never
 *                looked at on the path where every environment has one.
 *
 * On the `lost` path the JSON diagnostic is hidden first, exactly as the trial's own `hideDiagnostic`
 * hides it (`e9/task.html:429`). Without that, what gets measured is the length of a 5,000-character
 * machine report that the trial never shows a reader — a property of the laboratory, not of the fallback.
 *
 * ── THE FRAME IS DERIVED FROM THE INSTRUMENT, NOT TYPED HERE ─────────────────────────
 * The fold is a property of `e9/task.html`: `iframe { width: 100%; height: 760px; border: 1px }` inside a
 * `main { max-width: 1320px; padding: 22px 24px }` at the 1240x780 window its own notes cite. So this file
 * loads task.html, inserts an `about:blank` iframe into the real `#frameWrap` and reads the box the
 * browser gives it. It never presses Begin. Typing 1194x758 would be one more number to go stale the next
 * time that stylesheet moves — and the trial's fold moving without this check moving with it is precisely
 * how a fallback ends up one pixel below it.
 *
 * ── A STALE BUNDLE IS NAMED, NOT SILENTLY MEASURED ──────────────────────────────────
 * Every `eN/bundle.js` is a committed artefact, and `flatFallback.ts` is bundled INTO it. A bundle older
 * than the shared source is the trap INSTRUMENT_CHECK.md hit ("the trial loads artefacts older than their
 * sources"), so each such environment is reported by name before the table, because the verdict below is
 * then about the old code and not about this repository's source.
 *
 * Run:  node docs/3d/_shared/fallback-fold.mjs
 *       node docs/3d/_shared/fallback-fold.mjs --root <tree> --modes refuse
 *
 * Exits 1 naming every environment, path, y coordinate and the elements holding the space open. Exits 0
 * with the measurement table, which is a record either way.
 */
import { chromium } from '@playwright/test';
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveHarness } from './serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const DOCS = resolve(arg('root', join(ROOT, 'docs/3d')));
const MODES = arg('modes', 'refuse,lost').split(',').map((m) => m.trim()).filter(Boolean);
const FONTS = join(ROOT, 'apps/web/public/fonts');
const TASK = join(ROOT, 'docs/3d/e9/task.html');
const SHARED = join(HERE, 'flatFallback.ts');

const envs = readdirSync(DOCS)
  .filter((d) => /^e\d+$/.test(d) && existsSync(join(DOCS, d, 'live.html')) && existsSync(join(DOCS, d, 'bundle.js')))
  .sort();

if (envs.length === 0) {
  console.error(`  REFUSED: no built environment under ${DOCS}. Run each build.mjs first.`);
  console.error('  A fold check with nothing to measure must not report success.');
  process.exit(1);
}
if (!existsSync(TASK)) {
  console.error(`  REFUSED: ${TASK} is missing, so the fold cannot be derived from the instrument.`);
  console.error('  There is deliberately no default frame size: a typed one is the defect this derives around.');
  process.exit(1);
}

/*
 * THE PROBE, RUN INSIDE THE PAGE. Visibility is geometry plus the two ways this programme takes something
 * off the screen without removing it: `clip-path: inset(50%)` (the rule-1 table on a success path) and an
 * ancestor's `overflow`. The second one matters here and a client rect does not know about it —
 * `getClientRects` reports a layout box whether or not any of it is painted, so an overlay label clipped
 * by its collapsed wrapper would otherwise be counted as ink. Every clipper in these pages is a
 * `position:relative` wrapper, i.e. the containing block of the absolutely-positioned overlay inside it,
 * so intersecting the text's rect with each non-visible-overflow ancestor is the right test here.
 */
const probe = (fold) => {
  const rendered = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0
          || s.clipPath === 'inset(50%)') return false;
    }
    return true;
  };
  const visibleText = (root) => {
    const hits = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = (n.nodeValue ?? '').trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || !rendered(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const rr = r.getClientRects()[0] ?? b;
      let clip = { top: rr.top, bottom: rr.bottom, left: rr.left, right: rr.right };
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
        if (getComputedStyle(e).overflow === 'visible') continue;
        const cb = e.getBoundingClientRect();
        clip = {
          top: Math.max(clip.top, cb.top), bottom: Math.min(clip.bottom, cb.bottom),
          left: Math.max(clip.left, cb.left), right: Math.min(clip.right, cb.right),
        };
      }
      if (clip.bottom - clip.top < 1 || clip.right - clip.left < 1) continue;
      hits.push({ y: Math.round(rr.top), text: t.slice(0, 48) });
    }
    return hits.sort((a, b) => a.y - b.y);
  };

  const fb = document.getElementById('lcx-fallback');
  const all = visibleText(document.body);
  const mine = fb ? visibleText(fb) : [];
  const box = fb ? fb.getBoundingClientRect() : null;
  /* WHAT IS HOLDING THE SPACE, for the failure message: every block between the top of the document and
     the fallback, with the height it is taking and whether the refusal released it. A y coordinate says a
     check failed; this says which element to go and look at. */
  const above = [];
  for (const el of Array.from(document.body.children)) {
    if (el.id === 'lcx-fallback') break;
    const r = el.getBoundingClientRect();
    if (r.height < 1) continue;
    above.push(`${el.tagName}${el.id ? '#' + el.id : ''} h=${Math.round(r.height)}`
      + ` css-height=${getComputedStyle(el).height}`
      + (el.dataset.lcxReleased ? ` released=${el.dataset.lcxReleased}` : ''));
  }
  return {
    title: document.title,
    fallbackPresent: !!fb,
    fallbackVisible: !!box && getComputedStyle(fb).display !== 'none' && box.height > 4 && box.width > 4,
    fallbackTop: box ? Math.round(box.top) : null,
    fallbackRows: fb ? fb.querySelectorAll('tbody tr').length : 0,
    refusalNamed: !!fb?.querySelector('#lcx-refusal .refusal'),
    fallbackTextAboveFold: mine.filter((h) => h.y < fold).length,
    fallbackTextNodes: mine.length,
    firstInkY: all.length ? all[0].y : null,
    inkAboveFold: all.filter((h) => h.y < fold).length,
    inkNodes: all.length,
    canvasesShown: Array.from(document.querySelectorAll('canvas'))
      .filter((c) => getComputedStyle(c).display !== 'none').length,
    holdingSpace: above,
  };
};

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/* ── THE FRAME, READ OFF THE INSTRUMENT ──────────────────────────────────────────── */
let FRAME;
{
  const server = await serveHarness({ root: join(ROOT, 'docs/3d'), fonts: FONTS });
  const p = await browser.newPage({ viewport: { width: 1240, height: 780 }, deviceScaleFactor: 1 });
  await p.goto(`http://127.0.0.1:${server.address().port}/e9/task.html`);
  FRAME = await p.evaluate(() => {
    const wrap = document.getElementById('frameWrap');
    if (!wrap) return null;
    /* The trial keeps `#stage` at `display:none` until Begin. Un-hidden here to READ the iframe's own box;
       Begin is never pressed and nothing is answered, so no trial is run and no result is written. */
    const stage = document.getElementById('stage');
    const was = stage ? stage.style.display : null;
    if (stage) stage.style.display = 'block';
    const f = document.createElement('iframe');
    f.src = 'about:blank';
    wrap.appendChild(f);
    const out = { width: f.clientWidth, height: f.clientHeight };
    f.remove();
    if (stage) stage.style.display = was ?? '';
    return out;
  });
  await p.close();
  server.close();
}
if (!FRAME || FRAME.width < 200 || FRAME.height < 200) {
  console.error(`  REFUSED: could not read the trial frame from e9/task.html (got ${JSON.stringify(FRAME)}).`);
  console.error('  The fold is derived from the instrument or it is not asserted at all.');
  await browser.close();
  process.exit(1);
}
const FOLD = FRAME.height;

/* A bundle older than the shared source does not contain the shared source. Named before the table. */
const stale = existsSync(SHARED)
  ? envs.filter((e) => statSync(join(DOCS, e, 'bundle.js')).mtimeMs < statSync(SHARED).mtimeMs)
  : [];

const rows = [];
for (const env of envs) {
  const server = await serveHarness({ root: join(DOCS, env), fonts: FONTS });
  const url = `http://127.0.0.1:${server.address().port}/live.html`;
  for (const mode of MODES) {
    const p = await browser.newPage({ viewport: { width: FRAME.width, height: FRAME.height }, deviceScaleFactor: 1 });
    p.on('pageerror', () => { /* a forced refusal IS a page error here */ });
    const problems = [];
    if (mode === 'refuse') {
      await p.goto(`${url}?frames=2&refuse=1`);
      try { await p.waitForFunction(() => document.title === 'REFUSED', { timeout: 90000 }); }
      catch { problems.push('?refuse=1 never reached REFUSED — there is no refusal to measure'); }
    } else {
      await p.goto(`${url}?frames=2`);
      try { await p.waitForFunction(() => document.title === 'READY', { timeout: 120000 }); }
      catch { problems.push('never reached READY, so a context loss cannot be provoked from a drawn frame'); }
      /* The real extension, as scripts/3d-audit.mjs does it — a synthetic event would prove only that a
         listener exists. */
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
      if (!provoked) problems.push('WEBGL_lose_context is unavailable, so this path was not exercised');
      await p.evaluate(() => { const l = document.getElementById('log'); if (l) l.style.display = 'none'; });
      /* WAITED ON THE FALLBACK, NOT ON THE TITLE, and that correction was itself a measured false failure:
         the first version of this check waited for `document.title === 'REFUSED'` and reported all nine
         environments failing a path they pass. `die()` sets the title, and a context loss does not go
         through `die()` — `showRefusal` is called straight from the listener in flatFallback.ts, which is
         the whole point of that listener. What comes back is the DATA: `data-rendered` is deleted and the
         section un-clips. That is what is waited for. */
      await p.waitForFunction(() => {
        const fb = document.getElementById('lcx-fallback');
        return !!fb && !fb.dataset.rendered && fb.getBoundingClientRect().height > 4;
      }, { timeout: 30000 }).catch(() => {
        problems.push('a context loss did not bring the flat fallback back onto the screen');
      });
    }
    const m = await p.evaluate(probe, FOLD);
    if (!m.fallbackPresent) problems.push('#lcx-fallback is not in the document (§6 rule 1)');
    else if (!m.fallbackVisible) problems.push('the flat fallback stayed hidden through a refusal');
    else {
      if (m.fallbackTop >= FOLD) {
        problems.push(`the flat fallback starts at y${m.fallbackTop}, BELOW the ${FOLD} px fold`
          + ` — the reader is timed on an empty frame. Holding the space: ${m.holdingSpace.join('; ') || '(nothing)'}`);
      }
      if (m.fallbackTextAboveFold === 0) {
        problems.push(`0 of the fallback's ${m.fallbackTextNodes} visible text nodes are above the ${FOLD} px`
          + ` fold. Holding the space: ${m.holdingSpace.join('; ') || '(nothing)'}`);
      }
    }
    if (!m.refusalNamed) problems.push('the refusal was not named to the reader inside the fallback');
    rows.push({ env, mode, ...m, problems });
    await p.close();
  }
  server.close();
}
await browser.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n  FALLBACK FOLD · frame ${FRAME.width}x${FRAME.height} derived from e9/task.html · root ${DOCS}`);
if (stale.length) {
  console.log(`\n  NOTE: ${stale.length} bundle(s) predate _shared/flatFallback.ts — ${stale.join(' ')}.`);
  console.log('  What is measured below is those bundles, not this source. Rebuild before diagnosing.');
}
console.log(`\n  ${pad('env', 5)}${pad('path', 8)}${pad('fallback y', 12)}${pad('fb text >fold', 15)}`
  + `${pad('first ink y', 13)}${pad('ink >fold', 11)}${pad('rows', 6)}verdict`);
for (const r of rows) {
  console.log(`  ${pad(r.env, 5)}${pad(r.mode, 8)}${pad(r.fallbackTop ?? '-', 12)}`
    + `${pad(`${r.fallbackTextAboveFold}/${r.fallbackTextNodes}`, 15)}${pad(r.firstInkY ?? '-', 13)}`
    + `${pad(`${r.inkAboveFold}/${r.inkNodes}`, 11)}${pad(r.fallbackRows, 6)}`
    + (r.problems.length ? 'FAILS' : 'in frame'));
}
const failing = rows.filter((r) => r.problems.length);
if (failing.length) {
  console.error(`\n  ${failing.length} of ${rows.length} refusal frames FAIL:`);
  for (const r of failing) for (const p of r.problems) console.error(`    ${r.env} ${r.mode}: ${p}`);
  console.error('\n  A §7(b) comparison is a comparison against the flat branch. A flat branch the operator');
  console.error('  cannot see is not a slower reading of the same data — it is no reading at all.');
} else {
  console.log(`\n  ${rows.length} refusal frames, every one with its flat fallback inside the frame.`);
}
process.exit(failing.length > 0 ? 1 : 0);
