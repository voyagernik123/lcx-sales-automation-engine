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
// no-atmos is the CONTROL, not a variant: the limb rim sits exactly where a lone sphere's own
// Fresnel falloff is strongest, so the shell's contribution is only separable by removing it.
for (const [name, reduced, q] of [['live', false, ''], ['no-atmos', false, '&atmos=0'], ['no-shadow', false, '&shadow=0'], ['refused', false, '&refuse=1']]) {
  const p = await b.newPage({ viewport:{width:1300,height:1000}, deviceScaleFactor:1,
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
  await p.screenshot({ path: resolve(HERE, `${name}.png`), fullPage: true });
  console.log(`  ${name}.png — canvases: ${state.canvases}, drawing: ${state.drawing}`);
  /* §6 RULE 1, CHECKED not asserted: present, carrying rows, hidden on success, visible and named on
     refusal. A fallback that is present but always hidden is the same as no fallback. */
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
      refusal: el.querySelector('.refusal')?.textContent?.slice(0, 44) ?? null,
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
   * THE REPORT IS READ, AND UNTIL NOW IT WAS NOT — and that is how E2's README came to publish two
   * numbers the harness contradicts.
   *
   * This script printed canvases and the fallback and never touched `globalThis.E2`, so `cities`,
   * `triangles`, `corridorPeakLift`, `behindLimb` and `onNightSide` — every headline claim in that
   * README — were unbacked by the process that makes the picture. The README said "eight city markers"
   * and "32,896 triangles" against a harness reporting 12 and 35136, and nothing could notice.
   *
   * The counts are ASSERTED against the arrays they come from rather than against literals typed here: a
   * literal would be the same defect one file further along.
   */
  const rep = await p.evaluate(() => globalThis.E2);
  console.log(`    ms/frame ${rep.msPerFrame} (${rep.frames} frames) · ${rep.rendererClass}`
    + ` · glError ${rep.glError} · clamps ${JSON.stringify(rep.paramClamps)}`);
  console.log(`    cities ${rep.cities} (facing ${rep.citiesFacing}, sunlit ${rep.citiesSunlit})`
    + ` · corridors ${rep.corridors} · triangles ${rep.triangles}`
    + ` · meridian ${rep.centralMeridian} · subSolar ${rep.subSolar}`);
  console.log(`    behindLimb ${JSON.stringify(rep.behindLimb)} · onNightSide ${JSON.stringify(rep.onNightSide)}`);
  console.log('    corridorPeakLift ' + rep.corridorPeakLift.map((c) => `${c.to}:${c.lift}@${c.separationDeg}°`).join(' '));
  if (rep.brandFidelity.length) throw new Error(`§6 rule 5: brand hex moved: ${JSON.stringify(rep.brandFidelity)}`);
  if (rep.glError !== 0) throw new Error(`glError ${rep.glError}`);
  /* A marker the camera cannot see is not a reading, and a terminator with nothing behind it is
     decoration — both are what the README claims are fixed, so both are checked here. */
  if (rep.citiesFacing < 1) throw new Error('no city marker is on the visible cap');
  if (rep.onNightSide.length === 0) throw new Error('the terminator separates nothing: onNightSide is empty');
  if (rep.behindLimb.length === 0) throw new Error('no endpoint is behind the limb: the occlusion test proves nothing');

  /*
   * THE DOM LABEL LAYER — §6 RULE 4, AND THE ONE THING IT MUST NOT DO IS LOSE A SITE.
   *
   * E2 was the last environment with no projected DOM text, deliberately: three of its sites sit ~23 px
   * apart at this camera and projected text without a collision policy reads as broken. The policy now
   * exists, and a policy that DROPS a site is worse than no labels — a reader counts twelve markers and
   * finds seven names, and the five missing ones are indistinguishable from five that do not exist.
   *
   * So the invariant is conservation, not coverage: every city is either LABELLED on the frame or STATED
   * in DOM prose beneath it. Reported counts were printed and unchecked, which is how E6 came to serve
   * `campaign.publ` as the name of a governed action.
   */
  const lab = rep.labels;
  if (!lab || typeof lab.projected !== 'number' || typeof lab.inWords !== 'number') {
    throw new Error('§6 rule 4: globalThis.E2.labels is missing — the DOM label layer did not report, so '
      + 'nothing here can tell whether it ran at all');
  }
  console.log(`    labels ${lab.projected} projected + ${lab.inWords} in words = ${lab.projected + lab.inWords}`
    + ` of ${rep.cities} cities${lab.pushedToRim !== undefined ? ` · ${lab.pushedToRim} pushed to the rim` : ''}`);
  if (lab.projected + lab.inWords !== rep.cities) {
    throw new Error(`§6 rule 4: ${lab.projected} labelled + ${lab.inWords} in words != ${rep.cities} cities — `
      + 'a site was dropped, and a dropped site reads as a site that does not exist');
  }
  /* And at least one must actually be ON the frame, or "the labels are in the DOM" is satisfied by a
     paragraph of prose and no projection — which is not what rule 4 asks for. */
  if (lab.projected < 1) throw new Error('§6 rule 4: no label is projected onto the frame at all');
  /* LIFT MONOTONIC WITH ANGULAR DISTANCE is the corridor claim, and it is now checked rather than
     asserted: sort by separation and every step must be non-decreasing in lift. A fixed lift would make
     the London hop a tall croquet hoop, and nothing here could previously have told the difference. */
  const byDist = [...rep.corridorPeakLift].sort((x, y) => x.separationDeg - y.separationDeg);
  if (byDist.some((c) => !(c.lift > 0))) throw new Error(`a corridor has no lift: ${JSON.stringify(byDist)}`);
  for (let i = 1; i < byDist.length; i++) {
    if (byDist[i].lift < byDist[i - 1].lift) {
      throw new Error(`corridor lift is not monotonic with distance: ${byDist[i - 1].to}`
        + ` (${byDist[i - 1].separationDeg}° → ${byDist[i - 1].lift}) then ${byDist[i].to}`
        + ` (${byDist[i].separationDeg}° → ${byDist[i].lift})`);
    }
  }
  await p.close();
}
await b.close(); s.close();
