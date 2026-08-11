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
// no-atmos is the CONTROL, not a variant: the limb rim sits exactly where a lone sphere's own
// Fresnel falloff is strongest, so the shell's contribution is only separable by removing it.
for (const [name, reduced, q] of [['live', false, ''], ['no-atmos', false, '&atmos=0'], ['no-shadow', false, '&shadow=0']]) {
  const p = await b.newPage({ viewport:{width:1300,height:1000}, deviceScaleFactor:1,
    reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(`http://127.0.0.1:${s.address().port}/live.html?frames=4${q}`);
  await p.waitForFunction(()=>document.title==='READY',{timeout:60000});
  if(errs.length) throw new Error('page errors: '+errs.join(' | '));
  const state = await p.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')];
    return { canvases: cs.length, drawing: cs.filter((c) => getComputedStyle(c).display !== 'none').length };
  });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: resolve(HERE, `${name}.png`), fullPage: true });
  console.log(`  ${name}.png — canvases: ${state.canvases}, drawing: ${state.drawing}`);
  await p.close();
}
await b.close(); s.close();
