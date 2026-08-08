import { chromium } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, normalize } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(HERE, 'motion.json'), 'utf8'));
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json' };
const server = createServer((req,res)=>{
  const rel = normalize(decodeURIComponent(new URL(req.url,'http://x').pathname)).replace(/^(\.\.[/\\])+/,'');
  const f = join(HERE, rel === '/' ? 'motion.html' : rel);
  if (!f.startsWith(HERE) || !existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200,{'content-type':TYPES[f.slice(f.lastIndexOf('.'))] ?? 'application/octet-stream'});
  res.end(readFileSync(f));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const O = `http://127.0.0.1:${server.address().port}`;
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1700,height:1050}, deviceScaleFactor:2 });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(d=>{ window.__MOTION__=d; }, data);
await p.goto(`${O}/motion.html`);
await p.waitForFunction(()=>document.title==='READY',{timeout:30000});
if (errs.length) throw new Error('page errors: '+errs.join(' | '));
await p.locator('#wrap').screenshot({ path: resolve(HERE,'motion.png') });
console.log('  ', await p.locator('#stats').textContent());
await b.close(); server.close();
