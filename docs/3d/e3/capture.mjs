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
/* `flat-settle` is THE CONTROL: every deal pinned to the rail, which is exactly what a bar list shows
   — value and stage, movement demoted to a column. `no-particles` is the second control: the channel
   with no throughput, which is what a machine missing EXT_color_buffer_float actually gets. */
const reports = {};
for (const [name, q] of [
  ['live', ''], ['flat-settle', '&settle=0'], ['no-particles', '&particles=0'], ['refused', '&refuse=1'],
]) {
  const p = await b.newPage({ viewport:{width:1300,height:1100}, deviceScaleFactor:1 });
  /* PRINTED THE MOMENT IT HAPPENS, not collected for after the wait. A page that throws never sets its
     title, so the harness reports a 30-second TIMEOUT and the actual exception — which is one line
     away — is never seen. That cost real time on E5 and it is the same shape of failure as E0's
     temporal-dead-zone bug. */
  const errs=[]; p.on('pageerror',e=>{ errs.push(e.message); console.error('    PAGE ERROR: '+e.message); });
  p.on('console',m=>{ if(m.type()==='error') console.error('    CONSOLE ERROR: '+m.text()); });
  // frames=24, not the page default of 300: under swiftshader a shadowed, AO'd frame with a particle
  // step takes seconds, and the batch sweep only has to prove the frame draws at all. The particle
  // field is primed to steady state independently of this, so the density does not depend on it.
  await p.goto(`http://127.0.0.1:${s.address().port}/live.html?frames=24${q}`);
  const wantRefusal = name === 'refused';
  await p.waitForFunction((r)=>document.title===(r?'REFUSED':'READY'), wantRefusal, {timeout:120000});
  /* The forced-refusal variant throws on purpose, so its own message is expected. Any OTHER page error
     still fails the capture. */
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
  /* RULE 1 IS CHECKED HERE, not asserted in a README. The fallback table must exist, must carry every
     deal, must name absent rather than blank it, and must be HIDDEN when a frame was drawn and VISIBLE
     when it was not. A fallback that is present but always hidden is the same as no fallback. */
  const fb = await p.evaluate(() => {
    const el = document.getElementById('lcx-fallback');
    if (!el) return null;
    return {
      rows: el.querySelectorAll('tbody tr').length,
      absentCells: el.querySelectorAll('td.absent').length,
      /* VISUALLY hidden, not `display:none`. `_shared/flatFallback.ts` stopped using `display:none` on the
         success path because it PRUNED the table out of the accessibility tree; success now clips it to a
         1x1 out-of-flow box instead. A `display` test therefore reported a clipped, invisible table as
         still visible and failed the capture. What rule 1 needs asserted is that the table takes no space
         on screen when a frame drew, and takes space when one did not — so that is what is measured. */
      hidden: (() => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display === 'none' || cs.visibility === 'hidden' || (r.width <= 1 && r.height <= 1);
      })(),
      refusal: el.querySelector('.refusal')?.textContent?.slice(0, 60) ?? null,
    };
  });
  if (!fb) throw new Error('§6 rule 1: no flat fallback in the DOM');
  console.log(`    fallback rows ${fb.rows} · absent cells ${fb.absentCells}`
    + ` · hidden ${fb.hidden} · refusal ${fb.refusal ? JSON.stringify(fb.refusal) : 'none'}`);
  if (fb.rows !== 12) throw new Error(`§6 rule 1: the flat view carries ${fb.rows} of 12 deals`);
  /* FOUR absent cells, counted rather than guessed — the unpriced deal's value (its days ARE known, so
     it contributes one and not two), and the withheld deal's value, days and movement. An absent cell
     that turned into a blank or a zero would be rule 6 broken inside rule 1's own fix. */
  if (fb.absentCells < 4) throw new Error(`§6 rule 1: only ${fb.absentCells} absent cells named`);
  if (wantRefusal) {
    if (fb.hidden) throw new Error('§6 rule 1: the fallback stayed hidden through a refusal');
    if (!fb.refusal) throw new Error('§6 rule 1: a refusal was not named to the reader');
    if (state.drawing !== 0) throw new Error('a canvas that will never be drawn into is left on screen');
    await p.close();
    continue;
  }
  if (!fb.hidden) throw new Error('the fallback is still visible although a frame was drawn');
  const rep = await p.evaluate(() => globalThis.E3);
  reports[name] = rep;
  // The numbers are the part this process can actually check. A capture it cannot see proves nothing.
  console.log(`    ms/frame ${rep.msPerFrame} · ${rep.renderer} · glError ${rep.glError} · hdr ${rep.hdr}`
    + ` · ${rep.rendererClass} · headroom ${rep.headroom === null ? rep.headroomRefusal : rep.headroom + ' ms'}`);
  console.log(`    deals ${rep.deals} ${JSON.stringify(rep.counts)} · tags ${rep.tagsShown}`
    + ` · hiddenBy ${JSON.stringify(rep.hiddenBy)} · nameOverflow ${rep.nameOverflow.length}`);
  console.log(`    objectsOffFrame ${JSON.stringify(rep.objectsOffFrame)}`
    + ` · gateLabelsOffFrame ${JSON.stringify(rep.gateLabelsOffFrame)}`
    + ` · gateLabelsCrowded ${JSON.stringify(rep.gateLabelsCrowded)}`
    + ` · axisLabelsOffFrame ${rep.axisLabelsOffFrame}`);
  /* A tick whose stroke is not on the glass is a defect the old bounds count could not see. */
  console.log('    axisTicksDrawn ' + rep.axisTicksDrawn.map((t) => `${t.label}:${t.drawn ? 'yes' : 'NO'} (${t.lum ?? '-'} vs ${t.background ?? '-'})`).join('  '));
  /* THE SHARES CAN NOW BE null, AND THAT IS THE POINT: with no readable value in the book they refuse
     rather than printing 0%, so this line has to say "refused" instead of formatting a null as a number.
     `Math.round(100 * null)` is 0, which is exactly the false reading the harness fix removed. */
  const pct = (v) => (v === null ? 'REFUSED' : `${Math.round(100 * v)}%`);
  const px = (v) => (v === null ? 'n/a' : `${v} px`);
  console.log(`    settled ${rep.stalledCount} · deepStalled $${rep.deepStalledUsd} (${pct(rep.deepStalledShare)})`
    + ` · book ${rep.bookRefusal ?? 'readable'}`
    + ` · fallen ${px(rep.minStalledDisplacementPx)}..${px(rep.maxDisplacementPx)}`
    + ` · same-stage pair separation min ${px(rep.minSeparationPx)} (depth-confounded)`
    + ` · inversions ${rep.settleInversions.length}`);
  console.log(`    massAmbiguous ${rep.massAmbiguousPairs} (within-stage ${rep.massAmbiguousWithinStage})`
    + ` · outOfSegment ${rep.outOfSegment.length}`);
  const f = rep.particleField;
  console.log(`    particles ${f.refusal ?? 'ok'} · alive ${f.aliveActual}/${f.slots} (expected ${f.aliveExpected})`
    + ` · outOfChannel ${f.outOfChannel} · z ${JSON.stringify(f.zRange)} of ${JSON.stringify(f.channelZ)}`
    + ` · recycleSafe ${f.recycleSafe} (${f.slotRecycleSeconds}s vs life ${f.maxLifeSeconds}s)`);
  console.log(`    rateMonotoneDown ${rep.rateMonotoneDown} · first/last ${rep.rateRatioFirstLast}x`
    + ` · fog ${rep.fogNearest}..${rep.fogFurthest}`);

  if (rep.brandFidelity.length) throw new Error(`§6 rule 5: brand hex moved: ${JSON.stringify(rep.brandFidelity)}`);
  if (rep.glError !== 0) throw new Error(`glError ${rep.glError}`);
  if (rep.outOfSegment.length) throw new Error(`deals drawn outside their own stage segment: ${rep.outOfSegment}`);
  if (rep.nameOverflow.length) throw new Error(`names too long for their tag: ${rep.nameOverflow}`);
  /* `null` means the book had no readable value, so monotonicity is not a claim this run can make —
     which is a refusal to be reported, not a failure. `false` is a real defect. */
  if (rep.rateMonotoneDown === false) throw new Error('gate rates are not monotone down the funnel');
  if (rep.rateMonotoneDown === null && !rep.bookRefusal) {
    throw new Error('rateMonotoneDown refused without a bookRefusal to explain it');
  }
  /* A deal outside the frame is not in the environment, whatever its tag reports. This is the check the
     first framing did not have, and the first framing lost the largest object in the scene. */
  if (rep.objectsOffFrame.length) throw new Error(`deals off frame: ${rep.objectsOffFrame.join(', ')}`);
  /* An axis with no visible ticks is an assertion. Fatal, because the capture looks complete either way. */
  if (rep.axisLabelsOffFrame) throw new Error(`${rep.axisLabelsOffFrame} movement-axis labels off frame`);
  if (rep.gateLabelsOffFrame.length) throw new Error(`gate labels off frame: ${rep.gateLabelsOffFrame}`);
  /* An inverted pair says a stalled deal sits ABOVE a fresher one in its own stage, which is worse
     than showing nothing. Fatal in every variant, including the flat control where every deal is at
     one height and no pair can invert. */
  if (rep.settleInversions.length) throw new Error(`settling reads backwards: ${rep.settleInversions.join('; ')}`);
  /* Fog that does not vary with distance is fog that is doing nothing, whatever the density says — and a
     screenshot cannot tell that apart from subtlety. */
  if (rep.fog && rep.fogFurthest - rep.fogNearest < 0.2) {
    throw new Error(`FOG IS NOT SEPARATING DEPTHS: ${rep.fogNearest}..${rep.fogFurthest}`);
  }
  if (name !== 'no-particles') {
    if (f.refusal) console.error(`    NOTE: particles refused — ${f.refusal}`);
    else {
      /* A field that never fills, or one that leaks out of the channel, is a density that is not a
         reading. Both are numbers, so both are assertions rather than impressions. */
      /*
       * A BAND AROUND THE ANALYTIC STEADY STATE, not a floor at 60% of it.
       *
       * `< 0.6 * aliveExpected` passed anything from 574 upward against an expectation of 956, which is
       * why the README could publish 954 for months while the harness deterministically reported 952 —
       * the number this environment cites as the OUTCOME of two engine fixes was the one number nothing
       * defended. 2% is wide enough for the emission jitter a rate under one particle per frame produces
       * and narrow enough that either engine bug (a resurrected corpse, a lifetime falling back to 1.0)
       * moves it straight out of range: both defects moved this count by tens of percent.
       */
      const drift = Math.abs(f.aliveActual - f.aliveExpected) / f.aliveExpected;
      if (drift > 0.02) {
        throw new Error(`particle count ${f.aliveActual} is ${(100 * drift).toFixed(1)}% off the analytic`
          + ` steady state ${f.aliveExpected} — outside the 2% band`);
      }
      if (f.outOfChannel > 0.02 * f.aliveActual) throw new Error(`${f.outOfChannel} particles outside the channel`);
      if (!f.recycleSafe) throw new Error('slots recycle faster than a particle lives');
    }
  }
}

/* THE CROSS-VARIANT ASSERTION, which is the only one that proves the third axis carries anything.
   `settle=0` is the flat reading: value and stage, no movement. If the live frame does not separate a
   stalled deal from a fresh one by real pixels while the control separates them by none, then the
   settling is decoration and this environment has no business existing. */
const live = reports['live'], flat = reports['flat-settle'];
/* `null` and `0` are now different answers from these fields — null is "nothing was measurable", 0 is the
   control legitimately reporting no fall. Distinguished here, because a null silently comparing as 0
   would let an environment that measured nothing pass as the flat control. */
if (flat.maxDisplacementPx === null) throw new Error('the control measured no displacement at all');
if (flat.maxDisplacementPx !== 0) throw new Error(`control still falls by ${flat.maxDisplacementPx} px — settle=0 is not flat`);
if (live.minStalledDisplacementPx === null) throw new Error('no stalled deal had a measurable displacement');
if (live.minStalledDisplacementPx < 20) throw new Error(`the least-fallen stalled deal moves only ${live.minStalledDisplacementPx} px`);
if (live.deepStalledUsd <= 0) throw new Error('no stalled value past diligence — the headline reading is empty');
console.log(`\n  PROOF: every stalled deal has visibly fallen from its own rail position by at least`
  + ` ${live.minStalledDisplacementPx} px (max ${live.maxDisplacementPx}); the flat control falls ${flat.maxDisplacementPx} px`);
console.log(`  PROOF: $${live.deepStalledUsd} (${live.deepStalledShare === null ? 'share REFUSED' : Math.round(100*live.deepStalledShare) + '%'}) past diligence and stalled,`
  + ` visible as ${live.stalledCount} objects on the floor`);
await b.close(); s.close();
