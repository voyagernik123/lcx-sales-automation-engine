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
// `no-dof` is the CONTROL for the one claim E1 makes: that the rack separates the addressed panel
// from the room. Same scene, same camera, focus off.
for (const [name, q] of [['live', ''], ['no-dof', '&dof=0'], ['no-ao', '&ao=0']]) {
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
  await p.waitForFunction(()=>document.title==='READY',{timeout:60000});
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
  const rep = await p.evaluate(() => globalThis.E1);
  console.log(`    ms/frame ${rep.msPerFrame} · ${rep.renderer} · glError ${rep.glError} · focus ${rep.focusPanel} at ${rep.focusDistance} m`);
  for (const pn of rep.panels) {
    console.log(`    ${pn.id} ${pn.hex} dist ${pn.eyeDistance} coc ${pn.cocPx}px visible ${pn.visiblePct}%`
      + ` inShadow ${pn.inShadowPct}% screen ${pn.screen.join(',')} offFrame ${pn.offFrame}`
      + ` pixel ${pn.sample ? `${pn.sample.rgb.join('/')} at ${pn.sample.sx},${pn.sample.sy}` : 'NO UNOCCLUDED SAMPLE'}`);
  }
  /* THE HYBRID'S OWN VERIFICATION, and the only number here the browser produced rather than the
     harness: `rectError` is the gap in CSS pixels between where the COMPOSITOR put a projected
     element and where the RENDERER said its surface is. Anything above a pixel means the DOM content
     is not on the panel, however convincing the capture looks. */
  for (const pr of rep.projections) {
    console.log(`    ${pr.id} ${pr.shown ? 'SHOWN' : 'HIDDEN'}`
      + (pr.refusal ? ` refusal ${pr.refusal}` : '')
      + ` occludedCorners ${pr.occludedCorners} backFacing ${pr.backFacing}`
      + ` shift ${pr.contentShift} scale ${pr.contentScale}`
      + ` element ${pr.elementPx ? pr.elementPx.join('x') : '-'}`
      + ` perspX(1e-3) ${pr.perspectiveX}`
      + ` coc ${pr.cocPx}px domBlur ${pr.domBlurPx}px opacity ${pr.domOpacity}`
      + ` rectError ${pr.rectError === null ? 'n/a' : pr.rectError + 'px'}`);
  }
  const d = rep.deck;
  console.log(`    deck lit ${d.litRgb ? d.litRgb.join('/') : 'none'} (${d.litSamples} samples)`
    + ` · shadowed ${d.shadowedRgb ? d.shadowedRgb.join('/') : 'none'} (${d.shadowedSamples} samples)`);
  await p.close();
}
await b.close(); s.close();
