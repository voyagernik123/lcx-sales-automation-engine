import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, normalize } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
/*
 * THE FONTS ARE SERVED, and until now they were not.
 *
 * `build.mjs` inlines apps/web's built CSS, which declares @font-face with `url(/fonts/InterVariable.woff2)`
 * and four JetBrains Mono weights. This server only ever served the harness directory, so every one of
 * those requests 404'd and EVERY CAPTURE IN THIS PROGRAMME was shot with substituted system fonts.
 *
 * That is not cosmetic. Rule 4 keeps text in the DOM precisely so it is real type, and the legibility
 * thresholds this programme has been tuning are metric-dependent: E5 and E6 both settled on a 26 px
 * minimum projected width, E1 on a 2.4 px blur ceiling, E6 sized a record box against "16 characters at
 * 6.6 px". All of those were measured against the wrong typeface. The numbers may well survive; they were
 * not measured against what ships.
 */
const T = { '.html':'text/html', '.js':'text/javascript', '.woff2':'font/woff2', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
const FONTS = resolve(HERE, '../../../apps/web/public/fonts');
const s = createServer((q,r)=>{ const rel=normalize(decodeURIComponent(new URL(q.url,'http://x').pathname)).replace(/^(\.\.[/\\])+/,'');
  const f = rel.startsWith('/fonts/')
    ? join(FONTS, rel.slice('/fonts/'.length))
    : join(HERE, rel==='/'?'live.html':rel);
  if((!f.startsWith(HERE) && !f.startsWith(FONTS))||!existsSync(f)){r.writeHead(404).end();return;}
  r.writeHead(200,{'content-type':T[f.slice(f.lastIndexOf('.'))]??'application/octet-stream'}); r.end(readFileSync(f)); });
await new Promise(r=>s.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
// `no-fog` is the CONTROL, and it is the capture that shows what the honesty costs: every record,
// including ones no reader could resolve, presented at full contrast as though it were available.
for (const [name, q] of [['live', ''], ['no-fog', '&fog=0'], ['no-ao', '&ao=0'], ['refused', '&refuse=1']]) {
  const p = await b.newPage({ viewport:{width:1300,height:1000}, deviceScaleFactor:1 });
    /* PRINTED THE MOMENT IT HAPPENS, not collected for after the wait. A page that throws never sets
     its title, so the harness reports a 30-second TIMEOUT and the actual exception — which is one
     line away — is never seen. That cost real time on E5 and it is the same shape of failure E0's
     temporal-dead-zone bug had. */
  const errs=[]; p.on('pageerror',e=>{ errs.push(e.message); console.error('    PAGE ERROR: '+e.message); });
  p.on('console',m=>{ if(m.type()==='error') console.error('    CONSOLE ERROR: '+m.text()); });
  // frames=4, not the page default of 300: under swiftshader a shadowed, AO'd, depth-of-field
  // frame takes seconds, and the batch sweep here only has to prove the frame draws at all.
  await p.goto(`http://127.0.0.1:${s.address().port}/live.html?frames=4${q}`);
  const wantRefusal = name === 'refused';
  await p.waitForFunction(
    (r)=>document.title===(r?'REFUSED':'READY'),
    wantRefusal,
    {timeout:60000},
  );
  /* The forced-refusal variant throws on purpose, so its own thrown message is expected. Any OTHER
     page error still fails the capture. */
  const unexpected = wantRefusal ? errs.filter(e=>!/FORCED_REFUSAL/.test(e)) : errs;
  if(unexpected.length) throw new Error('page errors: '+unexpected.join(' | '));
  const state = await p.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')];
    return { canvases: cs.length, drawing: cs.filter((c) => getComputedStyle(c).display !== 'none').length };
  });
  await p.waitForTimeout(1200);
  // fullPage: the report under the canvas is part of the evidence, and an element shot would crop it.
  await p.screenshot({ path: resolve(HERE, `${name}.png`), fullPage: true });
  console.log(`  ${name}.png — canvases: ${state.canvases}, drawing: ${state.drawing}`);
  // The numbers are the part this process can actually check. A capture it cannot see proves nothing.
  /*
     RULE 1 IS CHECKED HERE, not asserted in a README. The fallback table must exist, must carry every
     record, and must be HIDDEN when a frame was drawn and VISIBLE when it was not. A fallback that is
     present but always hidden is the same as no fallback.
  */
  const fb = await p.evaluate(() => {
    const el = document.getElementById('lcx-fallback');
    if (!el) return null;
    return {
      rows: el.querySelectorAll('tbody tr').length,
      absentCells: el.querySelectorAll('td.absent').length,
      /*
       * MEASURED OFF THE LAYOUT, NOT OFF `display`, and the old check would now FAIL A WORKING PAGE.
       * The shared fallback hid itself with `display: none` until that was found to prune the table out
       * of the accessibility tree on every success path — the exact reason it is built unconditionally —
       * so success now CLIPS it to a 1x1 box instead. `display` is `block` in both states, so a test for
       * `none` reports a correctly hidden fallback as still visible.
       * Both halves are asserted: the flag the stylesheet keys off, and the box a reader actually sees.
       * Neither a `markRendered()` that never ran nor a stylesheet that stopped clipping can pass.
       */
      hidden: el.getAttribute('data-rendered') === '1'
        && el.getBoundingClientRect().width <= 1 && el.getBoundingClientRect().height <= 1,
      refusal: el.querySelector('.refusal')?.textContent?.slice(0, 60) ?? null,
    };
  });
  if (!fb) throw new Error('§6 rule 1: no flat fallback in the DOM');
  console.log(`    fallback rows ${fb.rows} · absent cells ${fb.absentCells}`
    + ` · hidden ${fb.hidden} · refusal ${fb.refusal ? JSON.stringify(fb.refusal) : 'none'}`);
  if (wantRefusal) {
    if (fb.hidden) throw new Error('§6 rule 1: the fallback stayed hidden through a refusal');
    if (!fb.refusal) throw new Error('§6 rule 1: a refusal was not named to the reader');
  } else if (!fb.hidden) {
    throw new Error('the fallback is still visible although a frame was drawn');
  }
  if (wantRefusal) { await p.close(); continue; }

  /*
     TEXT OVERFLOW, MEASURED BY THE BROWSER rather than estimated in the harness.
     The harness's own `actionOverflow` multiplies character count by 6.6 px, which was a guess about
     JetBrains Mono's advance width — and until this run the fonts 404'd, so every capture used substituted
     system metrics and that guess was never once checked against the typeface it describes. scrollWidth
     against clientWidth is what the compositor actually did.
  */
  const clipped = await p.evaluate(() => {
    const out = [];
    for (const el of Array.from(document.querySelectorAll('#lcx-fallback ~ div div, div[style*="matrix3d"] div'))) {
      const e = el;
      if (e.scrollWidth > e.clientWidth + 1 && e.textContent && e.textContent.trim().length > 0) {
        out.push({ text: e.textContent.trim().slice(0, 24), scroll: e.scrollWidth, client: e.clientWidth });
      }
    }
    return out;
  });
  console.log(`    text clipped by its own box: ${clipped.length}`
    + (clipped.length ? ' — ' + clipped.map((c) => `${JSON.stringify(c.text)} ${c.scroll}>${c.client}`).join(', ') : ''));
  if (clipped.length > 0) {
    throw new Error('a record\'s text is truncated by its own box: '
      + clipped.map((c) => c.text).join(', ')
      + ' — a truncated identifier in an audit record is worse than no record');
  }

  const rep = await p.evaluate(() => globalThis.E6);
  console.log(`    ms/frame ${rep.msPerFrame} · ${rep.renderer} · glError ${rep.glError} · ${rep.rendererClass} · headroom ${rep.headroom === null ? rep.headroomRefusal : rep.headroom + ' ms'}`);
  console.log(`    readableTo ${rep.readableToDays}d (at ${rep.readableThreshold}:1)`
    + ` · inRangeTo ${rep.inRangeToDays}d · visibleTo ${rep.visibleToDays}d`
    + ` · ${rep.hoursPerMetre} h/m · fogDensity ${rep.fogDensity}`
    + ` · fog ${rep.fogNearest}..${rep.fogFurthest} (nearest..furthest)`);
  console.log(`    records ${rep.records} · shown ${rep.shown}`
    + ` · counts ${JSON.stringify(rep.counts)} · hiddenBy ${JSON.stringify(rep.hiddenBy)}`
    + ` · rulerOffFrame ${rep.rulerOffFrame}`
    + ` · rulerRatios ${JSON.stringify(rep.rulerTicks.map((t) => [t.days, t.ratio]))}`);
  /* Fog that does not vary with distance is fog that is doing nothing, whatever the density says —
     and a screenshot cannot tell that apart from subtlety. */
  if (rep.fog && rep.fogFurthest - rep.fogNearest < 0.25) {
    throw new Error(`FOG IS NOT SEPARATING DEPTHS: ${rep.fogNearest}..${rep.fogFurthest}`);
  }
  /*
   * THE DEPTH RULER IS AN AXIS OR IT IS NOTHING, AND `rulerOffFrame` COULD NOT TELL THE DIFFERENCE.
   *
   * All four ticks were reported on-frame while three of them measured 3.38:1, 1.25:1 and 1.04:1 against
   * their own background — the 14d label differed from the backplate by 5/255, which no reader can see.
   * Frame bounds are not legibility, so this asserts on the harness's own pixel read instead. Fatal:
   * "depth is time" is printed on the frame as a marked axis, and an axis whose marks are invisible makes
   * that sentence an assertion again.
   */
  if (rep.rulerTicksUnreadable.length > 0) {
    throw new Error('depth-ruler ticks below AA against their own background: '
      + JSON.stringify(rep.rulerTicksUnreadable));
  }
  /*
   * AND THE HEADLINE MUST BE BACKED BY THE PIXELS. `READABLE TO n d` used to come from a metres test,
   * and the record that set it carried body copy at 2.56:1. Every record the frame SHOWS is now measured,
   * so if the worst one is below the threshold the word on the frame is not earned.
   */
  if (rep.worstShownTextRatio !== null && rep.worstShownTextRatio < rep.readableThreshold) {
    throw new Error(`the frame claims READABLE TO ${rep.readableToDays}d but its worst shown record`
      + ` measures ${rep.worstShownTextRatio}:1 against ${rep.readableThreshold}:1`);
  }
  await p.close();
}
await b.close(); s.close();
