# P8 · HARDENING — preparation (written 2026-09-04 while the P6 sweep ran)

Plan: "the same thing on a MacBook Air at 2×, on a narrow window, on a lost GPU context (a readable flat surface that says
why), in reduced motion, on paper." Built: frame-time budget under 16.6 ms at 2× DPR on M1 for stage + hero + charts
(probe-measured, tier resolved once); memory ceilings; context-loss recovery on the stage; glass floors re-measured;
narrow/mobile framings; print pins for every new token. Gate: every ratchet green; full instrument sweep both themes;
`verify-app-renders.mjs`.

## What exists (read, not assumed)
- Quality tier: `components/shared/useQualityTier.ts` resolves the tier from ONE measured probe (BUDGET_MS 16.6; 11.328 ms
  at 2× on the fastest machine, 5.3 ms headroom) and never re-probes; device strings are rejected on principle.
- Context loss: `packages/gl/src/stage.ts` ~:542 documents the `loseContext()` hazard for the seven components; Stage.tsx
  has NO `webglcontextlost` / `webglcontextrestored` handler — a lost context on the shell room today is whatever the
  browser leaves on the canvas. (stage.ts note: 3:     * It also settles the second hazard. `loseContext()` fires `webglcontextlost`, and seven components )
- The instrument runs every capture at deviceScaleFactor 1, viewport 1440×1100 (instrument-audit.mjs:478); nothing measures
  2× or a narrow window. Hero panel rects assume device px = css px (:659).
- `scripts/verify-app-renders.mjs` does NOT exist — the plan's gate names a script P8 has to write (the S3 lesson: a
  deploy is live when its content renders, not when the deploy finished; for P8 it is "every route renders a frame or a
  readable refusal" on a real browser, at 1× and 2×, narrow and wide, GL on and lost).
- Print: apps/web/src/components/gps/__tests__/gpsPrint.test.tsx apps/web/src/components/gps/LegalPositionStamp.tsx apps/web/src/components/deals/DealReviewMemo.tsx .

## Design (decided now)
1. CONTEXT LOSS on the stage: listen for `webglcontextlost` (preventDefault so restore can fire) → set state
   `refused:CONTEXT_LOST` and show the flat surface that says why (the DOM plate already stands; the stage host reads
   `data-stage`); on `webglcontextrestored` rebuild the stage (re-run `start`) once. Measured with
   `WEBGL_lose_context` in the instrument on one route (loss → readable → restore → frame).
2. 2× DPR + NARROW: the instrument gains an optional pass (`INSTRUMENT_DPR=2`, `INSTRUMENT_NARROW=1` → 768×1100) over a
   route subset (the six heroes, /select, /lcxos, three desks) recording redraw ms and coverage at 2×; the budget is the
   probe's 16.6 ms, read from the stage redraw contract (`__LCX_STAGE_REDRAW`) and the heroes' own probes.
3. MEMORY CEILINGS: `performance.memory` where present (Chromium) sampled at rest per route; a ceiling stated per surface
   and the sweep records the max — a number, not a claim.
4. GLASS FLOORS RE-MEASURED: glass.test's contrast floors re-run against the P6 stage (the plate's walls now render) —
   the luminance percentiles from the P6 sweep are the input; if the .04 dark ceiling is exceeded anywhere, the fix is in
   the rig, stated.
5. PRINT PINS: every token P4–P7 introduced (chrome-fade vars, plate chamfer has none — GL is print:hidden) pinned in the
   print stylesheet; the Forge and the stage are print:hidden (P6 did the Forge; check the stage host).
6. `verify-app-renders.mjs`: one Playwright run, real GL (swiftshader) — for every route: a frame drawn (`data-stage=drawn`
   or a hero's ready flag) OR a refusal string in words; at 1× and 2×; narrow and wide; and once with the context lost.
   Exit non-zero on any silent blank. Runs in the gate? Too slow (minutes) — runs in CI's e2e job and before every push in
   the release checklist; the ledger states which.

## Anchors (read 2026-09-04, during the P7 sweep)
- Stage.tsx:123 `const canvas = canvasRef.current, host = hostRef.current;` · :130 `g.createStage(canvas, { alpha: false })` · :131 refusal →
  `setState(\`refused:${code}\`)` · :138 `bail(reason)` disposes · :367 `forceOff` (the instrument's off switch) sets
  `refused:FORCED_OFF_FOR_MEASUREMENT`. Context loss goes beside forceOff: `canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); … setState('refused:CONTEXT_LOST') })`
  and `webglcontextrestored` → re-run `start(g)` once (g is in scope; `dispose` the old stage first).
- useQualityTier.ts: `probeSync(gl)` (reads a pixel from the drawn framebuffer), `measureFrameMs(...)`, `recordQualityProbe({...})` (first
  recording wins), `isSoftwareRasteriser(gl)` (refuses a 60 Hz headroom figure on swiftshader — the instrument IS swiftshader, so the 2× frame-time
  budget is measured on the M1 by a separate probe run, never by the sweep), `qualityTierReport()`.
- Instrument: `captureRoute` opens `browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1, … })` at :478 — the DPR/narrow pass
  parametrises exactly these two fields (`INSTRUMENT_DPR`, `INSTRUMENT_VIEWPORT=768x1100`) and writes to its own OUT_DIR.
- Print: `styles/gpsPrint.css` (+ component-level `@media print` in LegalPositionStamp, DealReviewMemo). The Forge is `print:hidden` (P6); the
  stage host (Stage.tsx:358 `<div … data-stage>`) is NOT yet — add `print:hidden` there in P8 and pin it in the print test.

## Added from P6/P7's CI (2026-09-04)
- keyboardday.spec.ts:719 (`f` collapses the deck traversal): reads Decide's bounding box right after `End` scrolls the MainContent scroller, then expects a hint chip at that box. On slow runners (juicedP50 33–50 ms) the smooth scroll is still settling and the chip lands elsewhere → "expected one chip beside Decide, got []". Failed on 83af9c4 and 8fc1206, passed on rerun both times. FIX: wait until the scroller's `scrollTop` is unchanged across two animation frames before reading the box (a settle-wait, not a longer timeout); the same guard belongs in `keys.scrollWithKey`.

- Route table: DERIVED from apps/web/src/router.tsx by a regex parse in scripts/instrument-audit.mjs:260–273 (`routes.push({ path, probe, component, module, seated })`, refusing under 60 routes as a drift guard). P8 lifts that parse into `scripts/instrument-routes.mjs` (`export function routesFromRouter()`) so `verify-app-renders.mjs` and the instrument read ONE list; the draft verifier in the session scratchpad imports a JSON that does not exist — switch it to the .mjs export when applying.

## Drafts staged (session scratchpad `p8/`, 2026-09-04 — re-derive from this note if the session is gone)
- `instrument-routes.mjs` — `routesFromRouter(srcDir)` lifted from instrument-audit.mjs:261–275 verbatim, throws under 60; proven: 80 routes,
  77 seated, unseated /lcxos, /portal, /select. `patch_instrument_routes.py` makes the instrument call it.
- `verify-app-renders.mjs` — every route × DPR {1,2} × width {1440,768}; seats an operator, answers health + watch, desk fixtures; verdict per
  capture: OK / BLANK / NO-TEXT, and with `--lose-context`: SILENT-ON-LOSS / NO-RECOVERY (uses WEBGL_lose_context on the stage canvas,
  restore after 400 ms, expects `data-stage` to say `refused:…` during and `drawn` after). Exit 1 on any failure.
- `patch_stage_contextloss.py` — after `createStage` in Stage.tsx: `webglcontextlost` → preventDefault + `refused:CONTEXT_LOST` (+ a
  `data-context-lost` counter on the host); `webglcontextrestored` → dispose + `start(g)` once. Also `print:hidden` on the stage host.
- `patch_instrument_dpr.py` — `INSTRUMENT_DPR`, `INSTRUMENT_VIEWPORT=WxH` env → the page's deviceScaleFactor/viewport (check `heroRects`
  scaling by DPR by hand before trusting panel percentages at 2×).
- `patch_keyboardday_settle.py` — the scroll-settle wait before Decide's box is read (two unchanged rAF reads of the scroller's scrollTop).
Order after P7 is LIVE: routes module → verifier → context loss (+ its instrument check) → DPR/narrow pass over the hero + desk subset →
memory ceilings → glass floors re-measured on the P7 record → print pins → gate → commit → push → verify → P8 LIVE.

## Status (2026-09-04, during the P8 sweep)
DONE in the tree: routes module · verifier (+ --reduced, --lose-context; one context per combination) · context loss said + recovered (measured) · DPR/viewport env + hero-rect scaling · narrow anchor · heap sampling · Forge redraw contract · frame budget measured idle on the M1 GPU (worst p90 7.2 ms) · glass floors measured, glow cores brought under the ceiling (glowGain .20 → .14) · print pins test · keyboardday settle-wait. PENDING: the full P8 sweep record (run 2), the reduced verifier matrix after it, gate, commit (p8-commit.sh), verify (p8-verify.sh), LIVE.
