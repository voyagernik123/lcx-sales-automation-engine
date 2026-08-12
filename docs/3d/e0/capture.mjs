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
  /*
   * THE REPORT IS READ, AND UNTIL NOW IT WAS NOT — this script checked canvases and the fallback and
   * nothing else. E0's own target probe was coming back `glAfterRead: 1282` (GL_INVALID_OPERATION) with
   * `targetCentre: [0,0,0,0]` on every capture in the repository: the probe that proves the frame reached
   * the HDR target had failed, returned black, and neither the page nor this script said a word. A number
   * nothing asserts on is a number that can be anything.
   */
  const rep = await p.evaluate(() => globalThis.E0);
  console.log(`    ms/frame ${rep.msPerFrame} · ${rep.rendererClass} · frames ${rep.frames}`
    + ` · glError ${rep.glError} · setup ${rep.glDuringSetup} · afterDraw ${rep.glAfterDraw} · afterRead ${rep.glAfterRead}`);
  console.log(`    targetCentre ${JSON.stringify(rep.targetCentre)} read as ${rep.targetReadFormat}/${rep.targetReadType}`
    + ` · failingCalls ${JSON.stringify(rep.failingCalls)} · clamps ${JSON.stringify(rep.paramClamps)}`);
  if (rep.brandFidelity.length) throw new Error(`§6 rule 5: brand hex moved: ${JSON.stringify(rep.brandFidelity)}`);
  if (rep.glError !== 0) throw new Error(`glError ${rep.glError}`);
  if (rep.glDuringSetup !== 0) throw new Error(`a GL error was raised during setup: 0x${rep.glDuringSetup.toString(16)}`);
  if (rep.glAfterDraw !== 0) throw new Error(`glAfterDraw 0x${rep.glAfterDraw.toString(16)}`);
  if (rep.glAfterRead !== 0) throw new Error(`glAfterRead 0x${rep.glAfterRead.toString(16)} — the target probe's own read failed`);
  if (rep.failingCalls.length) throw new Error(`GL errors during the probe frame: ${rep.failingCalls.join(', ')}`);
  /* All four channels zero is what an undrawn target reads as, and it is indistinguishable from a
     working scene by any other field in this report. Fatal, not noted. */
  if (rep.targetCentre.every((v) => v === 0)) {
    throw new Error('targetCentre is [0,0,0,0]: nothing reached the HDR target at the probe point');
  }
  await p.close();
}
await b.close(); s.close();
