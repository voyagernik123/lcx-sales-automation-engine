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
// `no-volume` is the FLAT CONTROL: the calendar, the day grid and all three states with no
// accumulation — everything a heatmap can already say. `no-depth` is the ENGINEERING control: the
// same field with the depth cap removed, which is what "fog on the lens" actually looks like.
for (const [name, q] of [['live', ''], ['no-depth', '&depth=0'], ['no-volume', '&vol=0'], ['refused', '&refuse=1']]) {
  const p = await b.newPage({ viewport:{width:1300,height:1120}, deviceScaleFactor:1 });
  /* PRINTED THE MOMENT IT HAPPENS, not collected for after the wait. A page that throws never sets
     its title, so the harness reports a timeout and the actual exception — one line away — is never
     seen. That cost real time on E5 and it is the same shape of failure E0's temporal-dead-zone bug
     had. */
  const errs=[]; p.on('pageerror',e=>{ errs.push(e.message); console.error('    PAGE ERROR: '+e.message); });
  p.on('console',m=>{ if(m.type()==='error') console.error('    CONSOLE ERROR: '+m.text()); });
  // frames=4, not the page default of 300: a 128-step raymarch at 1200x720 under a CPU rasteriser
  // costs hundreds of milliseconds per frame. One frame was not enough — the same build timed at 193
  // and 438 ms on consecutive runs — so four is the smallest batch whose mean is worth printing.
  await p.goto(`http://127.0.0.1:${s.address().port}/live.html?frames=4${q}`);
  const wantRefusal = name === 'refused';
  await p.waitForFunction((r)=>document.title===(r?'REFUSED':'READY'), wantRefusal, {timeout:300000});
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
     day, must name absent rather than blank it, and must be HIDDEN when a frame was drawn and VISIBLE
     when it was not. A fallback that is present but always hidden is the same as no fallback. */
  const fb = await p.evaluate(() => {
    const el = document.getElementById('lcx-fallback');
    if (!el) return null;
    return {
      rows: el.querySelectorAll('tbody tr').length,
      absentCells: el.querySelectorAll('td.absent').length,
      hidden: getComputedStyle(el).display === 'none',
      refusal: el.querySelector('.refusal')?.textContent?.slice(0, 60) ?? null,
    };
  });
  if (!fb) throw new Error('§6 rule 1: no flat fallback in the DOM');
  console.log(`    fallback rows ${fb.rows} · absent cells ${fb.absentCells}`
    + ` · hidden ${fb.hidden} · refusal ${fb.refusal ? JSON.stringify(fb.refusal) : 'none'}`);
  if (wantRefusal) {
    if (fb.hidden) throw new Error('§6 rule 1: the fallback stayed hidden through a refusal');
    if (!fb.refusal) throw new Error('§6 rule 1: a refusal was not named to the reader');
    await p.close();
    continue;
  }
  if (!fb.hidden) throw new Error('the fallback is still visible although a frame was drawn');
  // The numbers are the part this process can actually check. A capture it cannot see proves nothing.
  const rep = await p.evaluate(() => globalThis.E7);
  console.log(`    ms/frame ${rep.msPerFrame} · ${rep.renderer} · glError ${rep.glError} · ${rep.rendererClass}`
    + ` · headroom ${rep.headroom === null ? rep.headroomRefusal : rep.headroom + ' ms'}`);
  console.log(`    integrableTo D${rep.integrableToDay} · visibleTo D${rep.visibleToDay}`
    + ` · front D${rep.frontDay}${rep.frontRefusal ? ' ('+rep.frontRefusal+')' : ''}`
    + ` · totalRisk ${rep.totalObservedRisk} · days ${JSON.stringify(rep.days)}`);
  console.log(`    field ${rep.gridSize.join('x')} min ${rep.fieldMin} max ${rep.fieldMax}`
    + ` mean ${rep.fieldMean} occupancy ${rep.fieldOccupancyPct}% · densityScale ${rep.densityScale}`);
  console.log(`    march step ${rep.worldStep} x ${rep.maxSteps} = ${rep.marchReachM} m vs diagonal`
    + ` ${rep.boxDiagonalM} m · truncated ${rep.eyeRays.truncated}/${rep.eyeRays.hitBox}`
    + ` · geometryCapped ${rep.eyeRays.geometryCapped} · tau ${rep.eyeRays.tauMin}..${rep.eyeRays.tauMax}`);
  console.log(`    axialCheck ${rep.axialCheck.rays} rays · maxErr ${rep.axialCheck.maxErrorPct}%`
    + ` mean ${rep.axialCheck.meanErrorPct}%`);
  console.log(`    per eye ray: laneDrift max ${rep.eyeRayLaneDriftMax} mean ${rep.eyeRayLaneDriftMean} lanes`
    + ` · daysSpanned max ${rep.eyeRayDaysSpannedMax} mean ${rep.eyeRayDaysSpannedMean}`
    + ` · bandsSpanned max ${rep.eyeRayBandsSpannedMax} mean ${rep.eyeRayBandsSpannedMean}`);
  console.log(`    occlusion ${rep.glOcclusionPixels} px (${rep.glOcclusionPct}%)`
    + ` delta mean ${rep.glOcclusionMeanDelta} max ${rep.glOcclusionMaxDelta}`
    + ` · dateLabels ${rep.dateLabels.shown} shown ${JSON.stringify(rep.dateLabels.refusedBy)}`
    + ` · channelLabels ${rep.channelLabels.shown} ${JSON.stringify(rep.channelLabels.refusedBy)}`);
  console.log(`    readingStates ${JSON.stringify(rep.readingStates)}`
    + ` · flaggedLostToOutage ${rep.flaggedLostToNonObservedDays} · tiles ${rep.tilesDrawn}`
    + ` omitted ${rep.tilesOmittedForAbsence} · tris ${rep.triangles}`);

  if (rep.glError !== 0) throw new Error(`glError ${rep.glError}`);
  if (rep.brandFidelity.length) throw new Error('brand fidelity failed');
  /* THE GATE FOR THIS ENVIRONMENT. If the marched integral does not agree with the sum of the table,
     the picture is not the data and nothing else in the report matters. */
  if (rep.volume && !rep.volumeRefusal && rep.axialCheck.maxErrorPct > 5) {
    throw new Error(`THE PICTURE DOES NOT INTEGRATE THE DATA: axial error ${rep.axialCheck.maxErrorPct}%`);
  }
  if (rep.volume && !rep.volumeRefusal && rep.fieldMax <= 0) {
    throw new Error('THE FIELD IS EMPTY: fieldMax 0');
  }
  /* A volumetric drawn without scene depth is fog on the lens. This is the number that says the depth
     cap is doing something, and it is asserted on the `live` variant only — `no-depth` is the picture
     of it not doing anything. */
  if (name === 'live' && rep.glOcclusionPixels < 4000) {
    throw new Error(`SCENE DEPTH IS NOT LOAD-BEARING: only ${rep.glOcclusionPixels} px differ`);
  }
  /* The three states must stay three states. Equal render treatments would mean they had collapsed. */
  const treatments = new Set([rep.absentRenderedAs, rep.withheldRenderedAs, rep.observedRenderedAs]);
  if (treatments.size !== 3) throw new Error('THE THREE STATES COLLAPSED: ' + [...treatments].join(' / '));
  if (rep.days.ABSENT < 1 || rep.days.WITHHELD < 1) throw new Error('no absent/withheld days to test');
  await p.close();
}
await b.close(); s.close();
