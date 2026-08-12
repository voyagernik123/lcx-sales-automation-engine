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
// `flat` is THE CONTROL: the same entities, the same shells, the same strengths, every inclination
// zeroed and the camera looking straight down — i.e. the node-link diagram this replaces. Its
// crossing count is what the orrery's ambiguous count is measured against.
// `no-shadow` is the second control: a body's gap from its own shadow on the plate IS its height
// above the plane, so without it the third axis is present in the geometry and absent to the reader.
for (const [name, q] of [['live', ''], ['flat', '&flat=1'], ['no-ao', '&ao=0'], ['no-shadow', '&shadow=0'], ['refused', '&refuse=1']]) {
  const p = await b.newPage({ viewport:{width:1300,height:1000}, deviceScaleFactor:1 });
  /* PRINTED THE MOMENT IT HAPPENS, not collected for after the wait. A page that throws never sets
     its title, so the harness reports a 60-second TIMEOUT and the actual exception — which is one
     line away — is never seen. */
  const errs=[]; p.on('pageerror',e=>{ errs.push(e.message); console.error('    PAGE ERROR: '+e.message); });
  p.on('console',m=>{ if(m.type()==='error') console.error('    CONSOLE ERROR: '+m.text()); });
  // frames=10, not the page default of 300: under swiftshader a shadowed, AO'd frame takes tens of
  // milliseconds, and the batch sweep here only has to prove the frame draws at all.
  await p.goto(`http://127.0.0.1:${s.address().port}/live.html?frames=10${q}`);
  const wantRefusal = name === 'refused';
  await p.waitForFunction((r)=>document.title===(r?'REFUSED':'READY'), wantRefusal, {timeout:60000});
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
  /* §6 RULE 1, CHECKED not asserted. */
  const fb = await p.evaluate(() => {
    const el = document.getElementById('lcx-fallback');
    if (!el) return null;
    return {
      rows: el.querySelectorAll('tbody tr').length,
      absent: el.querySelectorAll('td.absent').length,
      hidden: getComputedStyle(el).display === 'none',
      refusal: el.querySelector('.refusal')?.textContent?.slice(0, 40) ?? null,
    };
  });
  if (!fb) throw new Error('§6 rule 1: no flat fallback in the DOM');
  console.log(`    fallback rows ${fb.rows} · absent ${fb.absent} · hidden ${fb.hidden}`
    + ` · refusal ${fb.refusal ? JSON.stringify(fb.refusal) : 'none'}`);
  if (fb.rows === 0) throw new Error('§6 rule 1: the fallback carries no rows');
  if (wantRefusal) {
    if (fb.hidden) throw new Error('§6 rule 1: the fallback stayed hidden through a refusal');
    if (!fb.refusal) throw new Error('§6 rule 1: a refusal was not named to the reader');
    await p.close();
    continue;
  }
  if (!fb.hidden) throw new Error('the fallback is still visible although a frame was drawn');
  // The numbers are the part this process can actually check. A capture it cannot see proves nothing.
  const rep = await p.evaluate(() => globalThis.E4);
  const c = rep.crossings;
  console.log(`    ms/frame ${rep.msPerFrame} · ${rep.renderer} · glError ${rep.glError} · ${rep.rendererClass}`
    + ` · headroom ${rep.headroom === null ? rep.headroomRefusal : rep.headroom + ' ms'} · ${rep.triangles} tris, ${rep.drawCalls} draws`);
  console.log(`    CROSSINGS flat-in-plane ${c.flatInPlane} (ambiguous ${c.flatAmbiguous}, best of ${c.orderingsTried} orderings ${c.flatBestOverOrderings})`);
  console.log(`              orrery grazing-pairs-3D ${c.grazingPairs3D} · minSep ${c.minSeparation3DM} m`
    + ` · at this camera ${c.atThisCamera.total} crossings / ${c.atThisCamera.ambiguous} ambiguous`);
  console.log(`              sweep ${c.sweepAzimuths} azimuths: screen ${c.sweepScreenCrossings[0]}..${c.sweepScreenCrossings[1]},`
    + ` worst ambiguous ${c.sweepWorstAmbiguous} → avoided ${c.ambiguousCrossingsAvoided}`);
  console.log(`    linksThroughBodies ${JSON.stringify(rep.linksThroughBodies)} · states ${JSON.stringify(rep.countStates)}`
    + ` · bodyPx ${rep.bodyPx.min}..${rep.bodyPx.max} (floor ${rep.bodyPx.floor})`);
  console.log(`    linkPx ${rep.linkPx.thinnest}..${rep.linkPx.thickest} legible ${rep.strengthLegible}`
    + ` · labels ${rep.labelsShown}/${rep.entities} hiddenBy ${JSON.stringify(rep.labelsHiddenBy)}`
    + ` · plate ${rep.plate.mode}${rep.plate.reason ? ' ' + rep.plate.reason : ''} ${rep.plate.widthPx}x${rep.plate.heightPx}`);
  console.log(`    bodyOverlaps ${rep.bodyOverlapsOnScreen.pairs} ${JSON.stringify(rep.bodyOverlapsOnScreen.detail)} · cleanAzimuths ${JSON.stringify(rep.cleanAzimuths)}`);
  console.log(`    aoEffect maxDelta ${rep.aoEffect.maxDelta}/765 · changed ${rep.aoEffect.changed} px `
    + `(${(rep.aoEffect.fraction * 100).toFixed(2)}% of ${rep.aoEffect.sampled}) · mean ${rep.aoEffect.meanWith} vs ${rep.aoEffect.meanWithout}`
    + ` · glErrorInProbe ${rep.aoEffect.glErrorInProbe}${rep.aoEffect.refusal ? ' · ' + rep.aoEffect.refusal : ''}`);
  console.log(`    ticks offFrame: plane ${rep.planeTicksOffFrame}, hop ${rep.hopTicksOffFrame} · unreachable ${JSON.stringify(rep.unreachableEntities)}`);

  if (rep.glError !== 0) throw new Error(`glError ${rep.glError}`);
  /* The AO probe renders the frame twice. If that raises a GL error the probe is measuring the driver's
     complaint rather than the pass, and the delta it reports is not attributable to occlusion. */
  if (rep.aoEffect.glErrorInProbe !== 0) throw new Error(`AO probe raised glError ${rep.aoEffect.glErrorInProbe}`);
  if (rep.unreachableEntities.length) throw new Error(`entity with no relationship distance: ${rep.unreachableEntities}`);
  /* A thickness encoding whose thinnest tube is sub-pixel is a claim the reader cannot see, whatever
     the radius says. */
  if (!rep.strengthLegible) throw new Error(`STRENGTH NOT LEGIBLE: thinnest link ${rep.linkPx.thinnest} px`);
  /* THE §7(b) ASSERTION. Two tubes can only fuse into an unreadable X if they graze in 3-D, so a
     non-zero grazing count in the orrery means the third axis has not bought what this environment
     claims — and the flat layout having zero crossings would mean there was nothing to buy. */
  if (name !== 'flat') {
    if (c.grazingPairs3D !== 0) throw new Error(`ORRERY HAS AMBIGUOUS CROSSINGS: ${JSON.stringify(c.grazingPairs3DDetail)}`);
    if (c.sweepWorstAmbiguous !== 0) throw new Error(`an azimuth produced an ambiguous crossing: ${c.sweepWorstAmbiguous}`);
    if (c.flatInPlane <= 0) throw new Error('the flat baseline has no crossings, so there is nothing to avoid');
    if (c.flatBestOverOrderings <= 0) throw new Error('a reordering gets the flat layout to zero crossings — inclination buys nothing');
  }
  await p.close();
}
await b.close(); s.close();
