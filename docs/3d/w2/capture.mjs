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
for (const [name, reduced] of [['live', false], ['reduced-motion', true]]) {
  const p = await b.newPage({ viewport:{width:900,height:420}, deviceScaleFactor:2,
    reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(`http://127.0.0.1:${s.address().port}/live.html`);
  await p.waitForFunction(()=>document.title==='READY',{timeout:30000});
  if(errs.length) throw new Error('page errors: '+errs.join(' | '));
  const state = await p.evaluate(() => {
    const c = document.querySelector('canvas');
    return { canvasShown: c ? getComputedStyle(c).display !== 'none' : false,
             svgBars: document.querySelectorAll('svg path').length };
  });
  await p.locator('#wrap').screenshot({ path: resolve(HERE, `${name}.png`) });
  console.log(`  ${name}.png — GL layer drawing: ${state.canvasShown} · SVG fallback paths: ${state.svgBars}`);
  await p.close();
}
await b.close(); s.close();
