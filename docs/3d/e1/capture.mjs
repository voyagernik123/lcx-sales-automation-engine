import { chromium } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
let rendered = null;
// `no-dof` is the CONTROL for the one claim E1 makes: that the rack separates the addressed panel
// from the room. Same scene, same camera, focus off.
for (const [name, q] of [['live', ''], ['no-dof', '&dof=0'], ['no-ao', '&ao=0'], ['refused', '&refuse=1']]) {
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
  // The numbers are the part this process can actually check. A capture it cannot see proves nothing.
  const rep = await p.evaluate(() => globalThis.E1);
  /* Kept for the sidecar below: what the frame that produced `live.png` actually claimed. */
  if (name === 'live') rendered = rep;
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
  console.log(`    environments ${rep.environments.join(' ')} · shown ${rep.environmentsShown.join(' ')}`
    + (rep.environmentsOmitted.length ? ` · OMITTED ${rep.environmentsOmitted.join(' ')}` : ' · none omitted'));
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
/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE CONTRAST PASS. The one claim in this environment nobody had ever measured.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * E1 blurs and dims REAL TEXT to match the lens, and the trade was discussed at length in `entry.ts` purely
 * as a legibility-versus-realism question — "at 2.4 px of blur an 11.5 px note is still parseable", measured
 * by reading it. Measured properly, that panel's note was at **1.47:1** against the surface behind it and 11
 * of 18 text runs on this frame failed WCAG AA's 4.5:1, including all three unblurred HUD lines.
 *
 * So the measurement lives here now, and it is a PIXEL READ rather than arithmetic: screenshot the frame,
 * screenshot it again with every text leaf `visibility:hidden` — which gives the true background including
 * the GL render — keep the pixels that differ, and take the strongest 15% as glyph core. The decode happens
 * inside the page (`createImageBitmap` into an `OffscreenCanvas`) because this repository has no PNG
 * decoder in node and adding one to read two screenshots would be a dependency for a diff.
 *
 * `deviceScaleFactor: 2` for this pass only, so the core sample is not itself limited by the raster.
 */
{
  const p = await b.newPage({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 2 });
  await p.goto(`http://127.0.0.1:${s.address().port}/live.html?frames=4`);
  await p.waitForFunction(() => document.title === 'READY', null, { timeout: 60000 });
  await p.waitForTimeout(600);
  const CLIP = { x: 0, y: 0, width: 1300, height: 900 };
  const leaves = await p.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const overlay = canvas.parentElement.querySelector('div[style*="inset"]');
    const out = [];
    let i = 0;
    for (const e of overlay.querySelectorAll('*')) {
      if (!e.textContent.trim() || e.querySelector('*')) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      e.setAttribute('data-cx', String(i));
      const cs = getComputedStyle(e);
      const anc = e.closest('[style*="filter"]');
      out.push({ text: e.textContent.trim().slice(0, 40), x: r.x, y: r.y, w: r.width, h: r.height,
        px: cs.fontSize, weight: cs.fontWeight,
        blur: anc ? getComputedStyle(anc).filter : 'none',
        opacity: anc ? getComputedStyle(anc).opacity : cs.opacity });
      i++;
    }
    return out;
  });
  const withText = (await p.screenshot({ clip: CLIP })).toString('base64');
  await p.evaluate(() => { for (const e of document.querySelectorAll('[data-cx]')) e.style.visibility = 'hidden'; });
  await p.waitForTimeout(250);
  const noText = (await p.screenshot({ clip: CLIP })).toString('base64');
  await p.evaluate(() => { for (const e of document.querySelectorAll('[data-cx]')) e.style.visibility = 'visible'; });

  const measured = await p.evaluate(async ({ a, c, boxes, dsf }) => {
    const decode = async (b64) => {
      const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }));
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const cx = cv.getContext('2d');
      cx.drawImage(bmp, 0, 0);
      return { d: cx.getImageData(0, 0, bmp.width, bmp.height).data, w: bmp.width, h: bmp.height };
    };
    const A = await decode(a), C = await decode(c);
    const lin = (v) => { const u = v / 255; return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; };
    const L = (r, g, b2) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b2);
    const ratio = (x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    return boxes.map((bx) => {
      const x0 = Math.max(0, Math.floor(bx.x * dsf)), y0 = Math.max(0, Math.floor(bx.y * dsf));
      const x1 = Math.min(A.w - 1, Math.ceil((bx.x + bx.w) * dsf)), y1 = Math.min(A.h - 1, Math.ceil((bx.y + bx.h) * dsf));
      const cand = [];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const o = (A.w * y + x) << 2;
          const ar = A.d[o], ag = A.d[o + 1], ab = A.d[o + 2];
          const cr = C.d[o], cg = C.d[o + 1], cb = C.d[o + 2];
          const diff = Math.abs(ar - cr) + Math.abs(ag - cg) + Math.abs(ab - cb);
          if (diff > 6) cand.push({ diff, r: ratio(L(ar, ag, ab), L(cr, cg, cb)) });
        }
      }
      if (cand.length < 8) return { ...bx, best: null, samples: cand.length };
      cand.sort((u, v) => v.diff - u.diff);
      const core = cand.slice(0, Math.max(4, Math.round(cand.length * 0.15)));
      const rs = core.map((k) => k.r).sort((u, v) => v - u);
      return { ...bx, best: Number(rs[0].toFixed(2)), median: Number(rs[Math.floor(rs.length / 2)].toFixed(2)), samples: cand.length };
    });
  }, { a: withText, c: noText, boxes: leaves, dsf: 2 });

  const AA = 4.5;
  const failing = measured.filter((m) => m.best !== null && m.best < AA);
  console.log(`  contrast: ${measured.length} text runs measured, ${failing.length} below ${AA}:1`);
  for (const m of measured) {
    console.log(`    ${m.best === null ? 'no glyph px' : (m.best < AA ? 'FAIL' : 'pass')} `
      + `${m.best ?? '-'}:1 (median ${m.median ?? '-'}) ${m.px}/${m.weight} op${m.opacity}`
      + ` ${m.blur === 'none' ? 'noblur' : m.blur} "${m.text}"`);
  }
  const blind = measured.filter((m) => m.best === null);
  /* A run with no glyph pixels is not a pass. It means the text did not change a single pixel of the
     frame — invisible type, which is the failure this pass exists to catch in its most complete form. */
  if (blind.length) throw new Error(`text that changed no pixels: ${blind.map((m) => JSON.stringify(m.text)).join(', ')}`);
  if (failing.length) {
    throw new Error(`WCAG AA: ${failing.length} text run(s) below ${AA}:1 — `
      + failing.map((m) => `${JSON.stringify(m.text)} at ${m.best}:1`).join('; '));
  }
  await p.close();
}

/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE SIDECAR. §6 rule 8 is "every claim gets a capture", and a capture nothing ties to a
 * bundle is a claim with an alibi.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * At commit 5bcb99a the committed `live.png` printed `3D PROGRAMME · 9 ENVIRONMENTS · 4 NOT SHOWN` while the
 * committed `bundle.js` at the same commit contained ten injected env states and rendered `10 · 5`. Verified
 * by serving HEAD's own bundle and html unmodified: `window.E1.environments` came back with ten ids. The
 * ratchet in `packages/gl/src/env/harnessRules.test.ts` only asserts that `live.png` EXISTS, so a frame
 * captured before the last build passes 10/10 and the picture and the code can disagree indefinitely.
 *
 * This writes what the frame ACTUALLY rendered, next to the sha of the bundle that rendered it. A stale PNG
 * is then a one-line check anywhere — the sidecar's `bundleSha256` will not match `bundle.js` — and the
 * counts themselves become diffable in review rather than living only inside a PNG. It is not a substitute
 * for the ratchet learning to compare mtimes; that file is not this harness's to edit.
 */
{
  const bundle = readFileSync(resolve(HERE, 'bundle.js'));
  const sidecar = {
    note: 'Written by capture.mjs. If bundleSha256 does not match docs/3d/e1/bundle.js, the PNGs are stale.',
    bundleSha256: createHash('sha256').update(bundle).digest('hex'),
    bundleBytes: bundle.length,
    /* The frame's own claims, from the run that produced live.png. */
    environments: rendered.environments,
    environmentsShown: rendered.environmentsShown,
    environmentsOmitted: rendered.environmentsOmitted,
    hud: [
      `3D PROGRAMME · ${rendered.environments.length} ENVIRONMENTS`,
      'STATE DERIVED FROM EACH README AT BUILD TIME',
      ...(rendered.environmentsOmitted.length
        ? [`${rendered.environmentsOmitted.length} NOT SHOWN — ONLY 5 PANELS: ${rendered.environmentsOmitted.join(' ')}`]
        : []),
    ],
  };
  writeFileSync(resolve(HERE, 'rendered.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  console.log(`  rendered.json — ${sidecar.hud[0]}${sidecar.hud[2] ? ` · ${sidecar.hud[2]}` : ''}`);
}
await b.close(); s.close();
