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
// `flat-only` is the CONTROL: the plinth and every annotation, with no surface on it. A broken
// heightfield produces the same picture, so the pair is what proves the mesh carries the reading.
for (const [name, q] of [['live', ''], ['flat-only', '&mesh=0'], ['no-ao', '&ao=0'], ['refused', '&refuse=1']]) {
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
  await p.waitForFunction((r)=>document.title===(r?'REFUSED':'READY'), wantRefusal, {timeout:60000});
  /* The forced-refusal variant throws on purpose; any OTHER page error still fails the capture. */
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
     RULE 1, CHECKED RATHER THAN ASSERTED. The fallback must be the REAL SurfacePlot — so it must
     contain that component's own SVG, with the same number of cell polygons the mesh drew — and it must
     be hidden when a frame was drawn and visible when it was not.
  */
  const fb = await p.evaluate(() => {
    const el = document.getElementById('lcx-fallback');
    if (!el) return null;
    return {
      svgs: el.querySelectorAll('svg').length,
      polys: el.querySelectorAll('svg polygon').length,
      hidden: getComputedStyle(el).display === 'none',
      refusal: el.querySelector('.refusal')?.textContent?.slice(0, 46) ?? null,
    };
  });
  if (!fb) throw new Error('§6 rule 1: no flat fallback in the DOM');
  console.log(`    fallback svg ${fb.svgs} · cell polygons ${fb.polys}`
    + ` · hidden ${fb.hidden} · refusal ${fb.refusal ? JSON.stringify(fb.refusal) : 'none'}`);
  if (fb.svgs === 0) throw new Error('§6 rule 1: the fallback rendered no SurfacePlot');
  if (wantRefusal) {
    if (fb.hidden) throw new Error('§6 rule 1: the fallback stayed hidden through a refusal');
    if (!fb.refusal) throw new Error('§6 rule 1: a refusal was not named to the reader');
    await p.close();
    continue;
  }
  if (!fb.hidden) throw new Error('the fallback is still visible although a frame was drawn');

  const rep = await p.evaluate(() => globalThis.E5);
  console.log(`    ms/frame ${rep.msPerFrame} · ${rep.renderer} · glError ${rep.glError} · ${rep.rendererClass} · headroom ${rep.headroom === null ? rep.headroomRefusal : rep.headroom + ' ms'}`);
  console.log(`    agreesWithFlat ${rep.agreesWithFlat}`
    + ` · cells ${rep.agreement.cellsDrawn.join('/')} drawn, ${rep.agreement.cellsHoles.join('/')} holes`
    + ` · absent ${rep.agreement.pointsAbsent.join('/')} · withheld ${rep.agreement.pointsWithheld.join('/')}`
    + `  (flat/mesh)`);
  console.log(`    range ${rep.observedRange ? rep.observedRange.join('..') : 'NONE'}`
    + ` · peak ${rep.peak ? `${(rep.peak.value*100).toFixed(0)}% at $${rep.peak.ticket}k/${rep.peak.days}d` : 'NONE'}`
    + ` · surfaceTris ${rep.surfaceTriangles} · ticksOffFrame ${rep.ticksOffFrame}`);
  console.log(`    notices ${rep.notices.join(' ')} · title ${rep.title.mode} (plate ${rep.title.plateHeightPx}px, min ${rep.title.minPlatePx})`);
  if (!rep.agreesWithFlat) throw new Error('MESH DISAGREES WITH THE SHIPPING FLAT ENGINE: ' + JSON.stringify(rep.agreement));
  await p.close();
}
await b.close(); s.close();
