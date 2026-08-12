import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, normalize } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const T = { '.html':'text/html', '.js':'text/javascript' };
const s = createServer((q,r)=>{ const rel=normalize(decodeURIComponent(new URL(q.url,'http://x').pathname)).replace(/^(\.\.[/\\])+/,'');
  const f=join(HERE, rel==='/'?'live.html':rel);
  if(!f.startsWith(HERE)||!existsSync(f)){r.writeHead(404).end();return;}
  r.writeHead(200,{'content-type':T[f.slice(f.lastIndexOf('.'))]??'application/octet-stream'}); r.end(readFileSync(f)); });
await new Promise(r=>s.listen(0,'127.0.0.1',r));
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
// `no-volume` is the FLAT CONTROL: the calendar, the day grid and all three states with no
// accumulation — everything a heatmap can already say. `no-depth` is the ENGINEERING control: the
// same field with the depth cap removed, which is what "fog on the lens" actually looks like.
for (const [name, q] of [['live', ''], ['no-depth', '&depth=0'], ['no-volume', '&vol=0']]) {
  const p = await b.newPage({ viewport:{width:1300,height:1120}, deviceScaleFactor:1 });
  /* PRINTED THE MOMENT IT HAPPENS, not collected for after the wait. A page that throws never sets
     its title, so the harness reports a timeout and the actual exception — one line away — is never
     seen. That cost real time on E5 and it is the same shape of failure E0's temporal-dead-zone bug
     had. */
  const errs=[]; p.on('pageerror',e=>{ errs.push(e.message); console.error('    PAGE ERROR: '+e.message); });
  p.on('console',m=>{ if(m.type()==='error') console.error('    CONSOLE ERROR: '+m.text()); });
  // frames=1, not the page default of 300: a 112-step raymarch at 1200x720 under a CPU rasteriser
  // costs seconds per frame, and the sweep here only has to prove the frame draws at all. The
  // timeout is 5 minutes for the same reason.
  await p.goto(`http://127.0.0.1:${s.address().port}/live.html?frames=1${q}`);
  await p.waitForFunction(()=>document.title==='READY',{timeout:300000});
  if(errs.length) throw new Error('page errors: '+errs.join(' | '));
  const state = await p.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')];
    return { canvases: cs.length, drawing: cs.filter((c) => getComputedStyle(c).display !== 'none').length };
  });
  await p.waitForTimeout(1200);
  // fullPage: the report under the canvas is part of the evidence, and an element shot would crop it.
  await p.screenshot({ path: resolve(HERE, `${name}.png`), fullPage: true });
  console.log(`  ${name}.png — canvases: ${state.canvases}, drawing: ${state.drawing}`);
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
    + ` mean ${rep.axialCheck.meanErrorPct}% · laneDrift centre ${rep.centreRayLaneDrift}`
    + ` edge ${rep.edgeRayLaneDrift} lanes`);
  console.log(`    occlusion ${rep.glOcclusionPixels} px (${rep.glOcclusionPct}%)`
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
