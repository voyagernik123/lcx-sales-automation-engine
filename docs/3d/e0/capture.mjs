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
for (const [name, reduced, q] of [['live', false, ''], ['no-ao', false, '&ao=0'], ['no-dof', false, '&dof=0'], ['diag-mirror', false, '&diag=1'], ['refused', false, '&refuse=1']]) {
  const p = await b.newPage({ viewport:{width:1600,height:1200}, deviceScaleFactor:1,  // 13 panels at 2x exceeds Chromium's ~16384px capture limit
    reducedMotion: reduced ? 'reduce' : 'no-preference' });
    /* PRINTED THE MOMENT IT HAPPENS, not collected for after the wait. A page that throws never sets
     its title, so the harness reports a 30-second TIMEOUT and the actual exception — which is one
     line away — is never seen. That cost real time on E5 and it is the same shape of failure E0's
     temporal-dead-zone bug had. */
  const errs=[]; p.on('pageerror',e=>{ errs.push(e.message); console.error('    PAGE ERROR: '+e.message); });
  p.on('console',m=>{ if(m.type()==='error') console.error('    CONSOLE ERROR: '+m.text()); });
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
  // fullPage, not an element shot: #root is 1500x~9000 and Playwright's element capture
  // waits for stability on a box that tall and times out.
  await p.screenshot({ path: resolve(HERE, `${name}.png`), fullPage: true });
  console.log(`  ${name}.png — canvases: ${state.canvases}, drawing: ${state.drawing}`);
  /* §6 RULE 1, CHECKED. A fallback that is present but always hidden is the same as no fallback. */
  const fb = await p.evaluate(() => {
    const el = document.getElementById('lcx-fallback');
    if (!el) return null;
    return {
      rows: el.querySelectorAll('tbody tr').length,
      hidden: getComputedStyle(el).display === 'none',
      refusal: el.querySelector('.refusal')?.textContent?.slice(0, 40) ?? null,
    };
  });
  if (!fb) throw new Error('§6 rule 1: no flat fallback in the DOM');
  console.log(`    fallback rows ${fb.rows} · hidden ${fb.hidden} · refusal ${fb.refusal ? JSON.stringify(fb.refusal) : 'none'}`);
  if (fb.rows === 0) throw new Error('§6 rule 1: the fallback carries no rows');
  if (wantRefusal) {
    if (fb.hidden) throw new Error('§6 rule 1: the fallback stayed hidden through a refusal');
    if (!fb.refusal) throw new Error('§6 rule 1: a refusal was not named to the reader');
    await p.close();
    continue;
  }
  if (!fb.hidden) throw new Error('the fallback is still visible although a frame was drawn');
  await p.close();
}
await b.close(); s.close();
