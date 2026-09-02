# THE PRODUCTION — LEDGER (the second brain)

Plan: `VFX_PRODUCTION_PLAN.md`. Owner approval: 2026-09-02, in advance, end to end, solo, no subagents, "even if it takes
days". This file is the only state that survives a context window. Write here before pushing; read here before building.

## 0 · RESUME PROTOCOL — do this on any fresh context, in order

1. Read this file top to bottom (it is short by design).
2. Read the phase marked **IN PROGRESS** in §2, then that phase's section in `VFX_PRODUCTION_PLAN.md` §3.
3. Read memory `vfx-production-plan.md` and `hard-rule-finish-the-work.md`.
4. Check the tree: `git status --short`, `git log --oneline -3`. If dirty, §5's last entry says what was mid-flight.
5. Continue from the **NEXT ACTION** line in §2. Do not re-plan. Do not re-run §1's baseline.
6. Every gate from the repo ROOT: `npm run ci-check` — a log without five stage
   totals is not a gate. Push `git push lcx-sales dev:main`. Verify with `scratchpad/verify-live.sh <sha> …` (recreate from
   §3 if the scratchpad is gone) and the GitHub deployments API for Render.
7. Regenerate the gallery every phase and LOOK at every capture before writing "done".

## 1 · BASELINE (P0 fills this — cite, never re-run)

| metric | before (P0, HEAD 2c437c5, 2026-09-02) |
|---|---|
| routes with any GL visible (coverage > 5%), dark | **3 of 79** (`/select` 95%, `/ontology` 58%, `/bd-pipeline` 16%) |
| routes with any GL visible, light | **4 of 79** |
| median glCoverage over 79 routes, dark / light | **0% / 0%** |
| routes carrying a GL environment (static) | 7 of 80 |
| GL contexts at rest (as shipped, fixtures on, reliefs at default) | 3 |
| default theme | light |
| frame time of the heaviest hero at 2× (probe) | not yet measured — the redraw contract lands with the stage (P1) |
| gallery | `docs/vfx/GALLERY.md`, 316 WebP thumbnails, 2.9 MB |

The harness aborts `/v1/**` and fixtures exist for the eight desks only, so data-driven heroes on other routes
(`/market-map`'s globe, `/audit-log`'s vault, `/deal-board`'s surface) read 0% here although they draw in production
with data. P4 adds hero fixtures so the judge sees them; until then their 0 is a harness limit, stated, not a finding.

## 2 · STATUS — exactly one row IN PROGRESS

| Phase | Status | Commit | Measured after | Notes |
|---|---|---|---|---|
| P0 GALLERY + VISIBILITY INSTRUMENT | DONE · **LIVE** (ba713aa, both surfaces by SHA) | ba713aa | `docs/vfx/GALLERY.md` + `docs/instrument/audit/production-p0/` | baseline: GL visible on 3/79 dark, 4/79 light; median 0%; controls 40.0% and 0 |
| P1 DARK FIRST + THE STAGE | DONE · **LIVE both surfaces** (Pages: `data-stage` in the entry; Render deployment 6219260694 `success`) | 08cfe3f | `docs/instrument/audit/production-p1/` + `GALLERY.md` (P0 kept as `GALLERY-P0.md`) | GL visible 3 → **77 of 79** (dark) and 4 → **77** (light); median coverage 0 → **57% dark / 18% light**; ≥ 35% dark on 57 routes, ≥ 20% light on 34; zeros = `/lcxos` `/portal` (outside the shell); standing metrics held (vt 76, motion 0, rAF 0, intervals 2, errors 0, GL 77 by design) |
| P2 THE CAMERA MOVES | **LIVE** | 530f0d9 | move: 2–6 frames then 0–2 (frames stop); coverage held 77/79 both · median 55% dark (P1 57) · 17% light (P1 18) | per §5 "P2 BUILT" and "P2 MEASURED" |
| P3 THE FIDELITY STACK | **LIVE** | 5c22d09 | light median 17 → 45% · dark 55 → 32% (inside the .04 ceiling P2 exceeded) · antialiased == compositeOnly 7/7 · redraw median 4.7 ms, 0 over 8 · the pair from ONE page load | per §5 "P3 …" checkpoints |
| P4 THE EIGHT HEROES (+ desktop 0.4.0) | **LIVE** | web 97243c2 (carries 8cdf9aa · 3c29de8 · 0c0cd3a) · desktop v0.4.0 | heroes ≥ 60%/panel: surface .85/.92 · globe .65/.81 · orrery .80/.83; pipeline .43/.91 and vault .31/.88 (dark designed-dark, documented); chrome fade 0 text hits/158; dark visible 61 → 71, ≥ 35% 17 → 37; light median 45 → 47% | per §5 "P4 …" checkpoints |
| P5 GPU CHARTS EVERYWHERE | **COMMITTED (this commit; verify-live pending → then LIVE)** — steps 1–4 in this commit: grouped chart on the engine, arrival bloom (6 keyed sites), RouteError, desk fixtures; sweep recorded (desk ≥ 50 % NOT met — the §4 plate finding) | — | | §4 bytes: competitors.ts 66 KB + states.ts 19 KB ride the shell via the `@/data` barrel from Sidebar, ExtendedInspectors, lib/compliance; move them out first (target shell ≤ 360 KB), then the 12 charts on the shared renderer |
| P6 THE OBJECTS (glTF) | PENDING | | | |
| P7 LIVENESS | PENDING | | | |
| P8 HARDENING | PENDING | | | |
| P9 PRODUCTION GATE + RELEASE | PENDING | | | |

**NEXT ACTION (written 2026-09-02 21:40 local, Fable weekly budget at 96 % — this recipe is model-agnostic; finish it on any tier):** P5 CLOSE-OUT, from this tree, in order. (1) Sweep: `ls docs/instrument/audit/production-p5/BASELINE.json` — if absent, re-run `INSTRUMENT_FIXTURES=1 INSTRUMENT_PHASE_LABEL="P5 · GPU charts everywhere (to the resolution floor)" INSTRUMENT_OUT_DIR=docs/instrument/audit/production-p5 INSTRUMENT_GALLERY_DIR=docs/vfx node scripts/instrument-audit.mjs` (~75 min). (2) `node docs/vfx/p5/fill.mjs docs/instrument/audit/production-p4/BASELINE.json docs/instrument/audit/production-p5/BASELINE.json` → paste its output into `docs/vfx/p5/commit-msg.txt` at {{DESK}}/{{SWEEP}}; the ≥ 50 % desk-coverage target is NOT met on card-dense desks (opaque cards over the plate) — record it as the §4 plate finding, do not tune it away. (3) Root gate from the repo root: `npm run ci-check` (~10 min; 0 `npm error`, all FIVE stage totals) → {{GATE}}. (4) `git add apps/web/src/components/charts apps/web/src/components/deals/GroupedColumnChart.tsx apps/web/src/components/kpi/ForecastCard.tsx apps/web/src/components/kpi/FunnelSection.tsx apps/web/src/components/shared/RouteError.tsx apps/web/src/components/shared/__tests__/routeError.test.tsx apps/web/src/pages/KpiDashboard.tsx apps/web/src/pages/WinLoss.tsx apps/web/src/router.tsx scripts/instrument-fixtures.mjs docs/vfx/LEDGER.md docs/vfx/GALLERY.md docs/vfx/gallery docs/vfx/p5 docs/instrument/audit/production-p5 scripts/verify-live.sh` — NOT the P6 files. (5) Update this row's P5 status + this NEXT ACTION, `git commit -F docs/vfx/p5/commit-msg.txt`, `git push lcx-sales dev:main`. (6) `bash scripts/verify-live.sh <sha> --lazy-js 'winloss:by-jurisdiction' --lazy-js 'kpi:channel-conversion'` + the GitHub deployments API; open the CI run. (7) Flip §2 P5 → LIVE with the sha; update memory `vfx-production-plan.md`. (8) SEPARATE commit: `git add packages/gl/src/env/gltf.ts packages/gl/src/env/gltf.test.ts scripts/blender/export_gltf.py docs/vfx/P6_PREP.md` → "feat(gl): P6 pre-work — glTF loader (5 tests), hand-written GLB exporter, prep note; inert, imported by nothing" → push. (9) P6 proper per docs/vfx/P6_PREP.md — after the Fable reset (~2026-09-03 17:30 local); it is the creative work, spend Fable there, not on (1)–(8).

## 3 · STANDING RULES (from the previous programs; every one still binds)

- One clock: `lib/clock.ts` is the only `setInterval`; rAF only inside bounded tweens or on-demand redraws; at rest 0.
- One material: DOM scenery tokens are GENERATED from `packages/gl/src/look/theme.ts` (`npm run gen:tokens -w apps/web`).
- Brand hex is decided from the bytes (`docs/3d/brand-fidelity.mjs`; S7's `scripts/blender/brand_hex.py`), never from a
  shader's intent. The tone map moves brand blue ΔE76 18.3 unless precompensated — `look/precompensate.ts`.
- Contrast floors (`lib/__tests__/contrast.test.ts`) outrank any look. New dark-overridden tokens need print pins
  (`components/report/PrintStyles.tsx`) or two print ratchets go red.
- Refusals are honest: `createStage` returns a discriminated union; every caller handles it. Never fabricate data.
- Every GL byte is lazy; initial JS ≤ 850 KB (`perf-budget`); GL budget test pins the routes at cap.
- Instrument: `INSTRUMENT_FIXTURES=1` for the eight desks; `INSTRUMENT_ROUTES=` for subsets; never run two instrument
  sweeps or a sweep and a gate concurrently when timing is being read.
- The gate is the root `ci-check`. CI is the backstop and runs e2e — OPEN THE RUN, never infer it.
- Verify live by content needles + deployment SHA; Pages serves index.html for missing assets (a 200 proves nothing).
- Solo. No subagents, no workflows. Commit per phase with measured before/after in the body.

## 4 · OPEN ITEMS

- **check-bundle INITIAL_PREFIXES is stale (P5 gate, 2026-09-02):** the prefix list and index.html disagree on the initial JS set (762 vs 760 KB; index.html wins, the list now only guards the per-chunk ceiling). Re-derive the list from index.html or delete it — one line, next docs/perf pass.
- **Instrument fixture gap — the watch (seen in the P5 sweep captures, 2026-09-03).** Every desk capture's top bar reads "WATCH The watch is unavailable — Failed to fetch. Last looked never." because `useArrival.ts:94` polls `/v1/watch?since=…` and `instrument-fixtures.mjs` has no fixture for it (unlisted endpoints are aborted by design). It does not move coverage, but it is a visible failure string in the record and the gallery. NOT patched mid-sweep: the P5 record must match the fixtures P5 commits. Fix in the next sweep: a `WatchResponse` fixture (`packages/shared/src/watch.ts:56` — `since` echoed, `asOf`, `items[]` a few ranked WatchItems, `byWorkspace` for the held compartments, `unranked: 0`, `absent[]` at least one sentence when items are empty — the API refuses empty+empty).
- **Bytes — MEASURED per module (2026-09-03, sourcemap attribution of the 448 KB shell chunk, 98% attributed).** The shell is
  not the engine and not the routes: `src/data/competitors.ts` 66 KB, `components/inspect/*` 56 KB (the payload registry),
  lucide-react 39 KB, `components/layout/*` 34 KB, `src/data/states.ts` 19 KB, `router.tsx` 15 KB, `data/products.ts` 7.6 KB,
  `data/requirements.ts` 5.9 KB, `data/redFlags.ts` 5.1 KB. ~104 KB of DATA modules ride in the shell eagerly — the class the
  bundle checker recorded as the one split that worked (moving prose/data out of shared modules). P5 opens by lazy-loading
  the two datasets at their consumers (measured target: shell 438 → ≤ 360 KB) before any chart hook lands in a shared component.
- **Bytes — and WHICH chunk (P1 note).** P1 moved initial JS 828 → 838/850 and the largest chunk 426 → 435/440. Measured on the
  built dist: the 435 KB chunk is the SHELL (`index-*.js`, carries `data-stage`; the stage's inline present shader is in
  it), not the engine — so P3's SMAA/bloom and P6's glTF loader (engine chunk, lazy) do not press it, but ANY shell growth
  does, and 5 KB is left. Before P5 (chart hooks in shared components) split the shell: `check-bundle.mjs:60` already
  says "code-split `index`, not raise the cap". Candidates, measured before choosing: the action manifest + command
  grammar (eager today), the inspector payload registry, the marketing/gps grammars.
- **The dark visibility ceiling is the PLATE's, not the stage's.** Under the .04 luminance ceiling the glass proof needs at
  plate α .56, a dark room differs from the plate by < 8/255 on card-dense pages (P3 probe3: /settings 3%, /readiness 14%).
  P1's "≥ 35% dark on every seated route" is unreachable by lighting alone. The levers are the plate (a lower α where no
  text sits — the chrome-fade item above, generalised to the plate's margins) or a chroma-only room (deep blue, done in P3).
  Decide in P4/P5 with the per-panel probe in hand; do not raise the ceiling (glass.test.ts refused .06).
- **Hero fixtures.** `/market-map`, `/audit-log`, `/deal-board` read 0% coverage in the harness because their heroes
  need `/v1/**` data the harness aborts. P4 adds fixtures for those endpoints so the judge sees them.
- **The chrome fades where it holds no text.** The sidebar's lower half and the top bar's centre carry no text; a
  gradient alpha there would show the room without touching a floor. Deferred to P3 (a mask, measured) — NOT DONE IN P3:
  the P3 sweep was already running on the tuned tree when this item came back up, and a chrome change re-opens every
  coverage number. Do it FIRST in P4, beside the hero-panel coverage probe, and measure it the same way (blocked-fetch diff
  is not the tool here; the GL-off capture pair is).

## 5 · CHECKPOINT LOG — append-only, newest last

- 2026-09-02 · **PLAN WRITTEN** after the owner's ruling: the INSTRUMENT program "unslopified" the platform but he wants
  visible, high-fidelity 3D/VFX across every route. Grounding read: engine = `packages/gl` 16,569 lines (lit GGX/aniso,
  shadow maps, sky IBL, DoF, AO, particles, volumes, bloom composite + precompensation, flat charts, quality tiers,
  motion); no glTF loader, procedural sky only, no SMAA; 7 routes carry GL (`/ontology /bd-pipeline /deal-board
  /market-map /audit-log /marketing/crisis /command-deck`) + `/select` Forge; reliefs default ON except storm; theme
  default light (`useUIStore.darkMode: false`); 12 chart components (~20 sites), 4 GL flat renderers, 35 files with
  inline data SVG; the old backdrop slot is `AppLayout` `relative isolate` (X1 comment); initial JS 828/850.
- 2026-09-02 · **P0 BUILT** (instrument only; the tree's app code untouched). `createStage` gains the refusal
  `FORCED_OFF_FOR_MEASUREMENT` on `window.__LCX_GL_OFF`; the instrument captures every reached route×theme twice and
  measures in a lab page in Chromium (no PNG decoder in Node): `glCoverage` = share of viewport pixels with any channel
  > 8/255 apart, `glDelta` = mean ΔE76 over them; 400 px WebP thumbnails to `docs/vfx/gallery/`; `GALLERY.md` written
  from the JSON. Controls: a 800×500 GL canvas in a 1000×1000 viewport read **40.0%**; identical captures read 0.
  Reliefs stay at their SHIPPED defaults in the shipped capture (`INSTRUMENT_RELIEFS_OFF=1` restores S6's reading).
  Four-route check: `/select` 95/96%, `/ontology` 18/36%, `/bd-pipeline` 35/43%, `/market-map` 0/0% (the globe needs
  API data the harness aborts — P4 adds hero fixtures so the judge can see data-driven heroes). Baseline sweep running.
- 2026-09-02 · **P1 SPEC (settled before building; drafts in scratchpad `p1/`).** (1) `packages/gl/src/env/stageScene.ts`:
  pure — `invert`, `unprojectToPlane`, `rectToNdc`, `slabGeometry` (the DOM content rect unprojected onto y=PLATE_Y and
  extruded), `roomPositions` (8 on an arc behind the plate), `roomGlow` (bounded by the watch's `byWorkspace[room].changed`;
  unheld = unlit), `STAGE_VIEW`, `STAGE_KEY_DIR`, `STAGE_LUMINANCE_MAX = {dark .12, light .96}`. (2)
  `components/stage/Stage.tsx`: one context, dynamic engine imports (Forge pattern), frames ON DEMAND (mount, class
  change, ResizeObserver on host + `[data-stage-plate]`, arrival store, route) coalesced into one rAF → allowlisted in
  `oneClock.test.ts`; sky → shadow pass → lit ground + slab (fog) → additive glows (points, `lo/hi` brand blue) →
  present (tone map + encode); `data-stage="drawn|refused:<code>"`. (3) Shell: `<Stage />` first child of the
  `relative isolate` root (the X1 slot; `bg-page` stays as the honest fallback beneath); `MainContent` gets
  `data-stage-plate` + `m-2 rounded-xl border-line/60` + `GLASS_PLATE_CLASS`; TopNav/Sidebar `bg-card` →
  `GLASS_CHROME_CLASS`. (4) `lib/glass.ts` alphas (light .86/.92, dark .80/.90) + `glass.test.ts`: literals match; every
  text role ≥ 4.5:1 over composite(card·α over STAGE_LUMINANCE_MAX) both themes. (5) Dark default: `useUIStore`
  `darkMode: true` with persist `version: 1` + `migrate` flipping stored `false` → true ONCE (existing operators
  persisted the old default; their next toggle persists at v1); index.html pre-hydration adds `dark` unless the stored
  state says `darkMode: false` (the body attr keeps the LIGHT hex as the no-JS fallback so `oneMaterial.test` holds).
  (6) `glContextBudget.test.ts` CAP 1 → 2 (stage + one hero) with the measured route set. (7) Gate: coverage ≥ 35%
  dark / ≥ 20% light on every seated route; contrast + glass green; rAF at rest 0; initial JS unchanged.
- 2026-09-02 · **P0 BASELINE SWEPT** (79 routes × 2 themes × 2 captures, fixtures ON, reliefs at shipped defaults; HEAD
  2c437c5): GL visible on **3 of 79** routes in dark (`/select` 95%, `/ontology` 58%, `/bd-pipeline` 16%) and **4 of 79**
  in light; median coverage **0%** both themes; GL contexts at rest 3. Gallery: 316 thumbnails, 2.9 MB, committed.
  This is the honest starting picture — the owner's "things look exactly the same" as a number. Gate running for the
  P0 commit; P1 applies from scratchpad `p1/` the moment it is clean.
- 2026-09-02 · **P0 COMMITTED ba713aa · VERIFIED LIVE** (325 files: instrument, engine refusal, gallery 316 thumbnails,
  baseline dir). Gate: five test stages clean; gl-budget went red on two stale published byte figures (stage.ts grew
  by one refusal) → refreshed with `build.mjs --write` → clean. The P0 gallery is preserved as `GALLERY-P0.md` +
  `gallery-p0/` so every later phase can be read beside the start.
- 2026-09-02 · **P1 BUILT — three things the photographs caught that no test did.** (1) **Row-major vs column-major.**
  My `transform4` read the engine's `Mat4` as rows; `math.ts` is column-major (`projectNdc`). The slab landed a
  plate-width away from the DOM rect it was fitted to. Caught by photographing the raw stage (`scratchpad/stage-peek.mjs`:
  page as shipped, then every DOM layer hidden) beside the page — the alignment was exact after the fix. (2) **A slab
  fitted to the whole page is a wall.** With the unprojection right, the slab's top face filled the page rect and the
  camera saw nothing else: the room was gone. Now only the page's BOTTOM edge is unprojected; the page stands on a
  SHELF (`SHELF_DEPTH` 1.6) and the floor, the eight glows and the horizon recede behind it, visible through the glass.
  Camera lowered to 13°. (3) **Glass and text floors are one trade, and it is measurable.** `glass.test.ts` computes
  every certified text role over composite(surface·α over the stage's declared bound). It refused three cuts:
  dark chrome .80 over a .12 room (red/indigo on card 4.07/4.37); dark plate .62 over .08 (red/indigo on page-bg
  3.94/4.23); light plate .80 over a black worst case (green 4.48). The resolution is the sRGB curve: a DARK room
  (bound **.04**) behind a **.56** plate shows more than a brighter room behind .84, because dark values are stretched
  on screen (composite ≈ 40/255 vs the page's 18/255). Light declares a FLOOR (`STAGE_LUMINANCE_MIN.light` .55,
  shadows lifted to .4) so the plate can open to .78. Final: chrome .86/.88, plate .78/.56, blur md (xl smeared the
  glows to a tint). Lighting: structure-albedo floor (the rig's `ground` cannot be lit), key 2.6/1.5, glows gain .2
  size .7 (peak ≤ .037), horizon carries 5–8% brand blue in dark. Three-route reading (fixtures on, both themes):
  `/settings` 16%, `/command-deck` 30%, `/targets` 65% — dense pages are mostly opaque cards BY THE FLOORS, so the
  stage reads as a quiet glass pane there and as a room on sparse ones. The P1 gate's "≥ 35% on every seated route"
  will not be met on card-dense desks; the full sweep says by how much and the plan's §5 rule applies: the shortfall
  is written in the same sentence as the result. Gate running.
- 2026-09-02 · **P1 GATE RUN 1: two true ratchets.** `qualityTierStamp.test.ts` — every surface that resolves a tier
  must stamp it on its canvas (`canvas.dataset.qualityTier = tier`) so a capture can say which tier it shows; the stage
  did not → stamped; KNOWN_SURFACES 7 → 8. `reliefRedrawRatchet.test.ts` — (a) a context owner needs a props interface
  the ratchet can parse for data props → `StageProps { plateAttr? }`; (b) **no renderer may schedule a frame it does not
  draw** (`requestAnimationFrame`/`setTimeout`/`setInterval` banned in context owners — a deferred frame can land after
  its data or its context is gone). The stage's rAF-coalesced invalidation was exactly that; it now coalesces the same
  task's invalidations with a MICROTASK and draws synchronously. The `oneClock` allowlist entry was withdrawn (the
  stage calls no rAF at all). Gate run 2 running.
- 2026-09-02 · **P2 SPEC (settled before building).** THE CAMERA MOVES on navigation and the room you enter comes
  forward. (1) Per-room framing: `stageScene.roomFraming(room)` — azimuth −12° ± up to 7° across the eight rooms
  (the camera turns TOWARD the room's glow), target x biased toward that glow, distance unchanged; `null` room (a
  desk-level route) = the neutral framing. (2) The tween: `startMotion({ purpose: 'user-driven', durationMs: 420 })`
  from `@lcx/gl/motion` (bounded; reduced motion → `instant`), framing via `interpolateFraming`; frames come from the
  ONE clock — `onFrame` from `lib/clock.ts`, subscribed only while a tween is live and unsubscribed at `done` — never
  rAF in the component (redraw ratchet) and never a loop (one-clock ratchet: `onFrame` is the allowed source; the
  subscription is bounded by the tween). (3) The seam: the Stage already re-draws on `location.pathname`; P2 makes
  that redraw a MOVE when the workspace changes and a cut when it does not (same room, different page). The DOM half
  (S3 view transitions, 180 ms crossfade) stays; the two are phase-locked by construction — both start on the same
  navigation commit. (4) The shelf ARRIVES: during the tween the shelf's front edge eases up from y = PLATE_Y − 0.12
  to PLATE_Y (the page lands), and the entered room's glow eases from its resting intensity to +0.25 (the `here`
  bonus in `roomGlow`) — consequential motion, then stillness. (5) The inspector drawer: OUT of P2 (the DOM drawer's
  slide is already a physical panel over the plate; a GL twin would be a second author of one motion). (6) Gate: vt on
  real navigation still 76/79; rAF at rest 0 and `animations` at rest 0 (the instrument's at-rest sample is BEFORE
  the continuity click, so a 420 ms move never reads as rest); `framebudget.spec.ts` green; frame time during the move
  measured by a new `INSTRUMENT_MOVE_TRACE` (ms per frame for the tween's duration on three routes).
- 2026-09-02 · **P1 SWEPT** (79 × 2 × 2, fixtures ON, reliefs at defaults): GL visible **3 → 77 of 79** in dark and
  **4 → 77** in light; median coverage **0% → 57% / 56%**; distribution dark p25 27 · p75 67 · max 100; ≥ 35% on 56,
  ≥ 20% on 66, ≥ 10% on 77. The two zeros are `/lcxos` and `/portal` (outside the shell — the still, the public
  portal). Lowest seated: `/outreach` 13%, `/states` 17%, `/roadmap` 17% — card-dense. Standing metrics held: vt 76 ·
  motion at rest 0 · rAF at rest 0 · intervals 2 · errors 0 · GL contexts 77 (the stage, by design; cap 2 pinned).
  The P1 gate line "≥ 35% on every seated route" is MET ON 56 OF 77, not all — structural (the floors keep dense pages
  opaque), stated in the commit and here. Looked at: command-deck dark, bd-pipeline dark, targets light.
- 2026-09-02 · **THE LIGHT COLUMN WAS DARK — caught by looking, not by the numbers.** The P1 sweep's light and dark
  columns matched almost exactly (77/77, 56%/57%) and `targets-light-on.webp` was a dark page. Cause: the instrument's
  `themeSeed` wrote the UI store at persist **version 0**, and P1's migration flips a version-0 `darkMode: false` to
  dark ONCE (the old default, persisted for everyone who never touched the toggle — the flip is the product decision,
  and it means an operator who had explicitly chosen light is flipped once too; stated, accepted, one toggle back).
  The peek script seeded version 1 and rendered light correctly, which is why the raw-stage photographs were right and
  the sweep was not. Fix: the seed writes version 1. The P1 sweep is RE-RUN before commit; the dark column stands.
- 2026-09-02 · **P1 SWEPT, RUN 2 (the real light column).** Dark unchanged: visible 77/79, median 57%, p25 31 · p75 67
  · max 95; ≥ 35% on 57. Light: visible 77/79, median **18%** (p25 14 · p75 21 · max 96); ≥ 20% on 34, ≥ 10% on 76;
  lowest seated `/outreach` 6%, `/states` 10%, `/scenario` 10%. Light is chroma-led by necessity (no luminance headroom
  under the floors) and reads as a tinted glass panel with depth at the base; P3 (fidelity stack) and P5 (GPU charts)
  carry the next lift there. Standing metrics held (vt 76 · motion 0 · rAF 0 · intervals 2 · errors 0 · GL 77).
  Gate run 3 on the final tree (light lighting + instrument seed) running; commit follows.
- 2026-09-02 · **P1 LIVE 08cfe3f** (Pages: `data-stage` in the entry; Render 6219260694 `success`). 641 files.
- 2026-09-02 · **P2 BUILT.** `stageScene.roomFraming` (azimuth −12° ± 7° across the arc, target slides toward the
  room; null = neutral), `SHELF_ARRIVAL_DROP` .12, `STAGE_MOVE_MS` 420. `Stage.tsx`: a route change is a MOVE when the
  workspace changes and a cut when it does not; the tween is `startMotion({ purpose: 'user-driven' })` from the
  engine (reduced motion → instant), frames from `lib/clock`'s `onFrame` subscribed only while the tween lives; the
  shelf's front edge eases up from −.12 to rest and the entered room's glow eases in over the same 420 ms. New
  `stageMotion.test.ts` pins the framing geometry, the ≤ 500 ms bound, `onFrame` in and `requestAnimationFrame`/timers
  out of the file, one `createStage`. Instrument gains `INSTRUMENT_MOVE_TRACE=1` (frames in the 600 ms after a real
  in-app click, then frames in the next 600 ms — rest): 2–6 frames then 0–2 on three routes under the frozen-clock
  harness (its rAF is wrapped and slowed; the number that matters is that frames STOP). PHOTOGRAPHED
  (`stage-peek-move.mjs`): before → 260 ms → rest show the camera turning toward the sales room and the shelf landing.
  A pure-white frame at 120 ms with the DOM hidden turned out to be the view transition's snapshot layer, not a user
  state: composed-page frames at 40/90/150/220/320 ms measure white share 0.000 and mean luminance 21–27 (the dark
  page). Dark glows back to eight distinct pools (size .5, gain .22 — peak stays under the .04 bound). Gate running;
  `framebudget.spec.ts` running beside it.
- 2026-09-02 · **P3 SPEC (settled before building; grounded in `look/pipeline.ts`, `look/precompensate.ts`, `env/sky.ts`,
  `check-bundle.mjs`).** THE FIDELITY STACK, engine-side and lazy — the shell must not grow (435/440). (1) **Anti-aliasing:**
  `look/aa.ts` — an FXAA 3.11-shape pass on the sRGB LDR output (the composite encodes exactly once; AA runs on the
  encoded image where edge luma is what the eye sees). Called FXAA, not SMAA — say what it is. Applied by the stage's
  present and by `createPipeline().resolve`. (2) **Bloom for the stage and heroes:** the stage and the reliefs present
  with their own tone-map shader and no bloom; route them through `createPipeline` (plate + scene + bloom + the ONE tone
  map + the ONE encode) so glows and emissive marks bloom. Data-encoding colours stay exact through the curve by
  `precompensate(target, site)` (measured 7/7 exact; refuses when headroom is gone — the refusal is honoured, never
  worked around). (3) **A real studio environment:** Blender renders an equirect environment per theme (Standard
  transform, calibrated like S7; 1024×512 → WebP ≤ 60 KB each under `public/objects/env-{dark,light}.webp`);
  `env/sky.ts` gains an equirect path (sample `uEnvMap` when bound, procedural stops otherwise) and `lit.ts` gains SH9
  irradiance uniforms computed once from the map on load — so glossy surfaces reflect a room and diffuse ones are lit by
  it. Brand marks are additive after lit and unaffected; verified by `docs/3d/brand-fidelity.mjs` extended to the stage
  pipeline (ΔE76 < 2 on every emissive mark after bloom). (4) **The edge model (S2's unbuilt half):**
  `gen-scenery-tokens.ts` derives `--edge-hi`/`--edge-lo` from the rig's key direction and gains per theme; one global
  rule lights every `bg-card` panel with a top-left highlight and bottom-right shadow hairline (decorative — the hairline
  rule in `contrast.test.ts` already classifies it). (5) **The redraw contract from P0:** the stage exposes
  `window.__LCX_STAGE_REDRAW()` (draw once, return ms); the instrument's frame-time probe times ten forced redraws per
  route×theme and reports the median — the number P8 hardens against. (6) **Gate:** brand fidelity ΔE76 < 2 after the
  stack; contrast + glass green; median redraw ≤ 8 ms at 1× in the harness (2× on M1 measured by the peek); coverage not
  lower than P2 on any route; shell chunk unchanged; every engine byte lazy.
- 2026-09-02 · **P2 MEASURED + COMMITTED.** Sweep `production-p2` (HEAD 08cfe3f code + P2 tree): GL visible 77/79 both
  themes (P1 77/77); median coverage 55% dark / 17% light (P1 57 / 18 — each room now rests in its own framing, so
  per-route numbers move a point or two; the distribution's quartiles are within 2 of P1's). Standing metrics held (view
  transitions 76/79, CSS/rAF at rest 0, intervals ≤ 2, errors 0, contexts 77). The move itself is evidenced by the trace
  (2–6 frames then 0–2 — frames STOP) and the photographs, not by the sweep (a static capture cannot show a move).
  Gallery regenerated (`docs/vfx/GALLERY.md`, P2 header). The P1 gate's structural shortfall is unchanged and carried.
  `scripts/blender/env_studio.py` stays untracked until P3 (its phase). Gate: root ci-check clean first run on this tree.
- 2026-09-02 · **P2 LIVE.** 530f0d9 verified on both surfaces (`verify-live.sh 530f0d9 --js 'data-stage'`: PAGES LIVE probe 1,
  RENDER deployment 6219813553 success). P3 apply began the same hour. CI run 33616640209 on 530f0d9: GREEN, both jobs.
- 2026-09-02 · **P3 IN PROGRESS — applied, measured so far.** All eleven scratchpad patches are in the tree. Catches: (1) the
  edge generator first read the RELIEFS' rig (theme.ts keyGain 7.4/5.2 → 43%/32% hairlines); corrected to the STAGE's rig
  (`STAGE_LIGHT`) with calmer coefficients → hi .09/.12, lo .18/.23 (light/dark). (2) `brand-fidelity.mjs` returned
  `MARKER_COVERED_NO_PIXELS` for the lit path after the AA series was added: GL 1282 at the lit draw. Bisect: reverting the
  lit shader's two env lines did NOT clear it; clearing every texture unit before the lit loop DID — a binding left by the
  new passes, not the shader (the exact unit was not isolated; recorded as such). The harness now names its refusal and the
  GL error instead of dying on `m.sources.hexes`. Measured: antialiased == compositeOnly for all 7 colours (exact), lit brand
  #447fff, sourceHash 5858a9d80b9b32d7. (3) `oneObject.test` refused the env maps without sidecars → `env_studio.py` writes
  the render.py-shaped sidecar; `encode.py` produces 1×/2× (dark 4.4+11.3 KB, light 3.5+9.5 KB of 60). (4) Peek on the dev
  server: env-{dark,light}.webp fetched 200 both themes; stage redraw median 5.8–6.6 ms at 1440×1100 on SwiftShader; tier
  full. (5) I first read the frame as unchanged by the map — WRONG: with the fetch blocked (`PEEK_BLOCK_ENV=1`) and the
  frames diffed, the map moves 81% of dark pixels and 100% of light (mean max|Δ| 23 / 41 of 255). The room IS studio-lit;
  what the frame lacked was a visible reflection, because both softboxes sit BEHIND the camera and the shelf was roughness
  .5. Fix: a front-top softbox in `env_studio.py` (Blender +Y = the engine's view direction) and shelf roughness .28,
  floor .7 — rendered and encoded (dark 4.8+12.6 KB, light 3.7+9.8 KB): the diff now moves 88.9% / 100% of pixels (mean
  24.6 / 40.8) and the shelf's front-top edge carries the softbox's reflection. Peek redraw median 3.5–3.7 ms dark,
  3.5–5.9 ms light. Lesson re-learned: judge a change by a diff, not by whether it looks different.
- 2026-09-02 · **P3 PROBE (3 routes × 2 themes, instrument, frozen clock, SwiftShader).** `stageRedrawMs` (median of ten
  forced redraws): /command-deck 4.0 dark · 4.5 light, /settings 5.1 · 3.8, /ontology 8.2 · 4.4 — median of six 4.45 ms;
  the one over 8 is /ontology dark, where the route's own GL relief draws beside the stage. GL coverage vs P2:
  /command-deck 34 → 61% dark, 13 → 84% light; /ontology 68 · 72; /settings 19 · 23 — the studio-lit room shows through
  the glass more than the procedural sky did. Visibility controls held (40% area → 40.0%, identical → 0). Root gate
  started on this tree; the 79-route sweep follows the gate (not concurrently — the sweep's timings would be skewed).
- 2026-09-02 · **P3 CATCH — the studio broke the bounds the glass proof assumes.** `glass.test.ts` proves the plate's text
  contrast against CONSTANTS (`STAGE_LUMINANCE_MIN.light .55`, `STAGE_LUMINANCE_MAX.dark .04`); nothing measures the frame
  against them at runtime. Measured on the P3 peek frames under the plate (relative luminance, sRGB-decoded): light
  p1 .371 · p5 .439 · p50 .524 · p99 .588 — BELOW the .55 floor across most of the frame; dark p95 .064 · p99 .071 — ABOVE
  the .04 ceiling. The room the eye liked is a room the contrast proof does not cover. Fix in flight: `envGain` per theme
  (`STAGE_LIGHT`, through `bindSky` as `uEnvGain`) — dark .5, light 1.45 as the first cut — then re-measure by peek until
  both frames sit inside the bounds; the number goes in this ledger, not in a test that reads the constant. The recurring
  defect (memory: weak success conditions) in its P3 form: a passing test whose premise the frame no longer honours.
- 2026-09-02 · **P3 TUNING BY THE PROOF.** No-map frames (P2-shaped) measured p1 .598 light (floor met) and p99 .049 dark —
  the dark ceiling was already exceeded by .009 before P3; P2's "peak under .04" was not this measurement. envGain
  .5/1.45: light p1 .505 (short), dark p99 .056. Light 1.65: p1 .559 · p99 .855 — inside both bounds, FINAL. Dark: tried
  widening the ceiling to .06 and let `glass.test.ts` judge — REFUSED: red 4.16:1 and indigo 4.46:1 through the glass
  (floor 4.5). The contract stays .04 and the frame dims: glowGain .22 → .17, envGain .3 (measuring). The gate was RED
  in packages/gl on the first run — three ratchets pinned facts P3 changed (program-owner census 10 → 11 with aa.ts;
  lit sampler count 2 → 3 with uEnvMap; the kd line now in its LOD form) — each updated to the new true fact, the
  banned shapes kept and extended.
- 2026-09-02 · **P3 TUNED INSIDE THE BOUNDS (final constants).** `STAGE_LIGHT.dark`: keyGain 2.6 → 2.3, glowGain .22 → .10,
  envGain .3; `.light`: envGain 1.65 (key/glow unchanged). Measured under the plate, relative luminance: dark /command-deck
  p99 .036 · max .038, /settings p99 .038 · max .040 — 0.00% of pixels over .04 on both; light /command-deck p1 .559 ·
  p99 .855 (floor .55 met, ceiling .96 clear). The hot band that resisted the first two steps was the wall's blue wash
  (glow + key), located by a luminance map (y 634–792, colour 48/60/100), not the shelf highlight. The dark room is dimmer
  than P2's by design: the proof, not the eye, sets the ceiling. Stage redraw 3.5–4.4 ms in the peeks throughout. Edge
  tokens regenerated for the new dark key (hi .11). Full gate running on this final tree; the 79-route sweep follows.
- 2026-09-02 · **P3 SWEEP RESTARTED (a process catch) + P4 PREP.** The first P3 sweep ran WITHOUT `INSTRUMENT_FIXTURES=1`
  (P2's had it), so its eight desk landings would have been empty states and the "not lower than P2" comparison unfair on
  them; killed at ~12 min and restarted with fixtures, output to a log file (the first run's `| tail` hid progress until
  exit). P4 groundwork read while waiting: the five heroes (Globe/market, Pipeline, Surface, Vault, Storm — all in
  `components/{geometry,market,risk}/*ReliefGl.tsx`) each present with their OWN tone-map shader and no pipeline (P4 routes
  them through `createPipeline` + FXAA like the stage); refusal codes in them are `GL_ERROR_AFTER_DRAW` (+ Storm's
  `FIELD_RESAMPLED_TO_EMPTY`) — no width refusal exists as code, so the plan's "compact framings replacing width refusals"
  must be re-derived from what each relief does at narrow widths, not from a code search. Fixtures live in
  `scripts/instrument-fixtures.mjs` (`DESK_ROUTES`, `allDeskFixtures` → [glob, envelope]); P4 adds the hero endpoints
  (market-map, audit-log, deal-board) there. P2 page coverage on hero routes: market-map .65/.21, bd-pipeline .33/.41,
  ontology .32/.42, deal-board .66/.17, audit-log .59/.15, command-deck .34/.13 (dark/light) — PAGE numbers that include the
  stage; P4's gate ("each hero ≥ 60% of ITS PANEL") needs a per-panel probe (the hero canvas rect), to be added first.
- 2026-09-02 · **P3 SWEEP (fixtures on, 79 routes) — the honest result.** Light: GL visible 77/79 (P2 77), median coverage
  17% → 47%, ≥ 35% on 3 → 51 routes, ≥ 20% on 32 → 61. Dark: visible 77 → 63, median 55% → 32%, ≥ 35% on 53 → 21; 82
  route×theme pairs read LOWER than P2 by more than 2 points, nearly all dark. WHY: the dark room was dimmed (glow .22 →
  .10, key 2.6 → 2.3) to bring the frame under the .04 ceiling the glass proof assumes — a ceiling P2's frame was
  EXCEEDING (p99 .049), so part of P2's 55% was bought with an out-of-contract frame. Coverage counts pixels that differ by
  > 8/255 in any channel; a dark room held under .04 luminance differs little from the plate. Redraw: 152 samples, median
  5.8 ms, p90 8.0, max 11.3, 13 over 8 (routes with their own GL relief beside the stage). Decision pending one measured
  iteration: chroma-led dark glows (deep blue spends the ceiling on the .07-weight channel) — if dark coverage recovers
  without breaking .04, re-sweep; if not, P3 ships with the regression stated and the P1 dark target re-examined.
- 2026-09-02 · **P3 CHROMA-LED DARK (the iteration).** Glows recoloured deep blue (lo #1A3FCC, hi #2C6BFF; were #2C6BFF /
  #7FA6FF) and glowGain raised .10 → .20: luminance p99 .034 (/command-deck) · .037 (/settings), max .036 / .039 — inside
  the .04 ceiling — while the raw frame's channel-delta-vs-ground share reads 59–60% (a proxy for coverage; the real number
  comes from the GL-off pair through the plate). Dark FINAL: key 2.3 · glow .20 deep blue · envGain .3. Four-route probe
  running with these constants; the 79-route sweep re-runs after it so the record matches the shipped tree.
- 2026-09-02 · **P3 sweep — the one motion-at-rest reading, explained.** `routesWithMotionAtRest` 0 → 1: /ontology dark read
  75 CSS animations at the at-rest sample (1 infinite `animate-spin` — the page's loading indicator, OntologyExplorer.tsx:300
  — and 74 one-shot `fadeIn` on CustomOntologyNode cards, iter=1) and a GL census of 1 canvas (P2: 2): the orrery had not
  mounted yet when the sample was taken 1.5 s after the shell anchor. The light run of the same route in the same sweep read
  0 animations, gl 2. A slow load under sweep CPU, not motion at rest by design; the re-sweep will say whether it recurs.
  If it does, the ontology route's mount path (static data import → orrery) is the thing to time, not the stage.
- 2026-09-02 · **P3 CATCH — THE STUDIO RACE in the instrument.** Four-route probe with the final constants: /regulatory-dashboard
  light read 11% in the sweep and 38% in the probe with NO light change between them; /command-deck dark 35 → 8. The stage
  fetches its environment map after the first frame and redraws when it lands; the instrument's GL-on capture (1.5 s after
  the shell anchor) lands before or after that redraw at random — so every P3 coverage number so far measured an unknown
  frame. A measurement-validity defect I introduced with the async map (P2 had none). Fix: the instrument waits (≤ 4 s) for
  `__LCX_STAGE_ENV_READY` (or a stage refusal) and RECORDS `stageEnv` per route×theme, so a number always says which frame
  it measured. Consequence: the P3 sweep already written is invalid as a comparison and is being re-run after the probe.
  The deep-blue glow decision also waits for a race-free number.
- 2026-09-02 · **P3 PROBE3 (race-free; `stageEnv` bound in all 8 captures) — the dark decision.** Coverage, dark P2 → now:
  /command-deck 34 → 38, /regulatory-dashboard 42 → 32, /readiness 36 → 14, /settings 16 → 3; light: 17 → 11, 11 → 14,
  11 → 7, 13 → 24. Reading: open pages recover or exceed P2 in dark; card-dense pages cannot — the plate (.56) covers the
  room and a glow held under the .04 ceiling differs from the plate by less than the 8/255 the metric counts. P2's higher
  dark numbers on those pages were bought with a frame outside the contract. DECISION: dark FINAL = key 2.3 · deep-blue
  glows (#1A3FCC → #2C6BFF) at .20 · envGain .3; light FINAL = envGain 1.65. The P1 dark target ("≥ 35% on every seated
  route") is NOT reachable inside the .04 ceiling at plate .56 and is re-stated in §4 as a plate question, not a stage one.
  A stability probe (probe4, identical) runs before the re-sweep so run-to-run variance is on record.
- 2026-09-02 · **P3 RE-SWEEP (race fix in; `stageEnv` bound 152/152 seated captures) + THE SECOND RACE.** Aggregates, P2 → P3:
  light visible 77 → 77, median 17% → 47%, ≥ 35% on 3 → 51, ≥ 20% on 32 → 58; dark visible 77 → 62, median 55% → 32%,
  ≥ 35% on 53 → 17, ≥ 20% on 65 → 50; lowest dark 3% (/states, /products, /howey, /capital-estimator, /roadmap,
  /settings — card-dense). Redraw: n 152, median 5.0 ms, p90 5.5, max 6.7, 0 over 8 (the first sweep's 13 over 8 were
  CPU contention from the killed run). Standing metrics ALL held (continuity 76, motion at rest 0, intervals 2, rAF 0,
  contexts 77, errors 0). BUT the stability probe (probe4 = probe3 repeated) shows a SECOND race on data pages:
  /command-deck dark 38 → 8, light 24 → 49; /regulatory-dashboard light 11 → 40 — with the env bound both times; the four
  other pairs repeated exactly. Cause: fixture responses and the panels they fill land before or after the capture, moving
  how much of the plate is opaque card. Instrument hardened again: bounded `networkidle` wait + `busyAtCapture` (count of
  `.animate-spin` at the shot) recorded per capture. Three identical probes on the two routes run next; if they repeat, the
  sweep runs a THIRD time so the committed record has repeatable numbers. Per-route deltas from any earlier P3 sweep are
  NOT to be quoted.
- 2026-09-02 · **THE SECOND RACE, FOUND IN THE PAIR ITSELF.** Three identical probes after the networkidle wait: /command-deck
  dark 8/8/35, light 24/49/49; /regulatory-dashboard dark 34/32/5, light 40/40/11 — env bound, 0 spinners, GL census 1/1/1
  every time. The thumbnails say why: in a low run the GL-OFF capture carries the top OFFLINE strip and the GL-ON capture
  does not (the strip's presence follows the health probe's timing per page load), so the layout below it shifts and every
  moved pixel counts as "GL coverage". The metric was measuring a banner race, not the stage — in P2's single-run numbers
  too, unseen. Fix: the harness pins the health state deterministically on every route (a fixture for `/v1/health`,
  registered after the `/v1/**` abort like the desk fixtures; infrastructure state, not content), so both captures of a pair
  load the same layout. Then three probes again; then the sweep, a third time.
- 2026-09-02 · **THE PAIR IS TWO PAGE LOADS — the root of the variance.** With health pinned, three probes still read
  /command-deck dark 8/8/35 (figures 60/60/54), light 50/24/24 (figures 2/60/60 — one run captured the deck BEFORE its
  fixture content existed), /regulatory-dashboard light 11/40/11; dark there is now 5/5/5 — its earlier 32–42 were the
  banner shifting one capture of the pair, so P2's 42 on that route was an artefact too, and P2's per-route dark numbers are
  not to be trusted individually. The GL-on and GL-off captures are separate page loads whose CONTENT can differ at the
  shot (fixture panels, lazy chunks, entrance states), and the metric counts every differing pixel as GL. Fix (instrument):
  fingerprint the page text at each capture, wait for it to settle (unchanged for 600 ms, ≤ 5 s), and mark a pair whose two
  fingerprints differ as `domMatch: false`; such pairs are EXCLUDED from the coverage aggregates and flagged in the gallery,
  with the count reported. A number that measured two different pages is not a number.
- 2026-09-02 · **VARIANCE, ROUND THREE.** With health pinned AND the body-text fingerprint matching in every pair (domMatch
  true ×12), coverage still flipped: /command-deck dark 8/38/8, light 49/24/24; /regulatory-dashboard dark 32/5/32, light
  40/11/11. Same text, different pixels. `AccessUnverifiedBanner` is ruled out (it renders only on a server answer that
  says entitlements are unavailable; the harness aborts the request, so `me` stays null). What is left that moves pixels
  without moving text: a view transition (S3) or entrance animation still mid-flight when the shot follows the continuity
  navigation's return. The instrument now waits (≤ 3 s) for `document.getAnimations()` to be quiet for 300 ms before the
  shot and records `animationsAtShot`/`vtAtShot`. Three probes again. If THIS does not settle it, the pair is taken from
  ONE page load (force GL off in place) — the structural fix — before any further sweep.
- 2026-09-02 · **ROUND THREE → THE STRUCTURAL FIX.** Animations quiet at every shot (0/0/0, no view transition in flight), yet
  with the fingerprint widened to the whole body + scroll, EVERY pair reads domMatch false — including the routes that
  repeat exactly (regulatory 5/5/5, 11/11/11). Of course: the GL-off load renders the reliefs' FLAT FALLBACKS, whose labels
  differ from the GL surfaces' — two separate loads can never be validated by text, and the coverage metric only means
  "GL" when nothing but GL differs between the two captures. So: THE PAIR FROM ONE PAGE LOAD. The instrument now shoots
  GL-on, dispatches `lcx:gl-force-off` on the SAME page (the Stage disposes and blanks its canvas → `refused:
  FORCED_OFF_FOR_MEASUREMENT`; `useReliefPreference` flips every relief to its fallback), waits for the refusal and 400 ms,
  and shoots GL-off. Default on; `INSTRUMENT_INPLACE_OFF=0` restores the two-load pair for comparison. Two product hooks
  added (instrument-facing, nothing in the product dispatches the event) beside `__LCX_STAGE_REDRAW`/`__LCX_STAGE_ENV_READY`.
  Three probes run on it; if repeatable, the third sweep is the record P3 ships with — and P0–P2's per-route coverage
  numbers are re-classified as two-load measurements (aggregates indicative, per-route not comparable).
- 2026-09-02 · **IN-PLACE PAIR, FIRST RUN: 0/0/0 EVERYWHERE — repeatable and wrong.** The stage reported
  `refused:FORCED_OFF_FOR_MEASUREMENT` and the reliefs fell back (canvases 1), yet the OFF thumbnail still shows the room:
  a disposed WebGL context keeps its last presented frame on screen, and `canvas.width = canvas.width` did not clear it.
  A perfectly repeatable zero is the weak-success shape again — the state said "off", the pixels said "on". Fix: force-off
  HIDES the canvas (`canvas.hidden = true`) beside disposing — the page without its GL layer is the ground the plate would
  show over a refused stage, which is what the metric means. Three probes again with this.
- 2026-09-02 · **`canvas.hidden = true` did nothing: still 0%.** The stage canvas carries a display utility class, and an
  author `display` rule outranks the `[hidden]` user-agent style. Force-off now sets `style.display = 'none'` inline. The
  chain was killed and restarted with the fix (three probes). Each of these is a small fact; each would have shipped a
  zero as a measurement if the number had been read as "repeatable, therefore right".
- 2026-09-02 · **THE IN-PLACE PAIR REPEATS — method final.** With `style.display = 'none'` inline (the canvas's `block`
  class had beaten `[hidden]`): /command-deck dark 8/11/11, light 23/23/24; /regulatory-dashboard dark 5/5/5, light
  11/11/11 — mean ΔE76 identical across runs (6/6/6, 10/10/10, 7/7/7). Direct test on the dev server: stage `drawn`,
  display `block` → `refused:FORCED_OFF_FOR_MEASUREMENT`, display `none`; 31.6% of the page's pixels change at 1440×1100.
  Residual run-to-run spread ≤ 3 points. The P3 record is the third sweep, running now with this method; every number in
  it carries `stageEnv`, `busyAtCapture`, `inPlace: true` and the OFF state beside it.
- 2026-09-02 · **P3 SWEEP #3 — THE RECORD (one-page-load pairs).**
  THE SWEEP (docs/instrument/audit/production-p3; 79 routes × 2 themes, fixtures on, the pair from ONE page load; P2's
  figures were two-load measurements — aggregates indicative, per-route not comparable):
  dark: GL visible on 77 → 61 of 79 · median 55% → 32% · ≥ 35% on 53 → 17 · ≥ 20% on 65 → 49 · ≥ 10% on 77 → 59
  light: GL visible on 77 → 76 of 79 · median 17% → 45% · ≥ 35% on 3 → 48 · ≥ 20% on 32 → 57 · ≥ 10% on 76 → 63
  lowest seated dark: /states 3%, /products 3%, /howey 3%, /capital-estimator 3%, /roadmap 3%.
  Stage redraw (median of ten, frozen clock, SwiftShader): n 152, median 4.7 ms, p90 5.4, max 7.3, over 8 ms: 0.
  Every seated capture carries its state: stageEnv bound 152/152, in-place pairs 158/158 (the two unseated routes pair a page with itself and read 0 by design), pairs excluded {"dark":0,"light":0}.
  Standing metrics: continuity 76 → 76 · motion at rest 0 → 0 · max intervals 2 → 2 · rAF loops 0 → 0 · GL contexts 77 → 77 · page errors 0 → 0.
  Dark's fall from P2 is the .04 ceiling honoured (P2's frame was outside it) plus the plate covering card-dense pages;
  light's rise is the studio. Root gate running on this exact tree; commit follows.
- 2026-09-02 · **P3 GATE, run 1: red on ONE api test outside P3.** `distGate.test.ts › lets a NON-token campaign advance to
  live freely` — `expected 403 to be 200`: the compliance gate fired on a campaign the test made non-token. P3 touched no
  api file; the test is in the pending pass's recorded flake class (order-dependent state in the shared test db — the
  ci-mirror lesson). Procedure from that record: three isolated runs, then the full gate again; the P3 commit waits for a
  clean full run, not for a green re-run of the one file. Every other stage was green (shared 57/1997 · gl 17/359 · api
  169+1 skipped of 171 with 3531/3546 · web and e2e not reached because the api stage failed first).
- 2026-09-02 · **P3 COMMITTED 5c22d09** (gate run 2 clean; pushed to lcx-sales main). verify-live next; flip to LIVE on report.
- 2026-09-03 · **P3 LIVE.** 5c22d09 verified on both surfaces (`verify-live.sh 5c22d09 --js 'lcx:gl-force-off' --lazy-js 'uInvSize'
  --css 'edge-hi'`: PAGES LIVE probe 2, RENDER deployment 6222789643 success). CI 33632456017: GREEN, both jobs (confirmed 2026-09-03).
- 2026-09-03 · **P4 STARTED.** Order fixed before building (PREP): (1) the chrome fade where no text sits, measured by the
  GL-off pair and a text-rect scan; (2) the per-PANEL coverage probe (`[data-hero]` rect → `panelCoverage`); (3) hero
  fixtures; (4) the five heroes through pipeline + FXAA + studio; (5) E1 as a 3D gauge; (6) gate; (7) desktop v0.4.0.
- 2026-09-03 · **P4 (1) THE CHROME FADE — built and measured.** The glass moved to a masked `::before` layer
  (`GLASS_CHROME_LAYER_CLASS`, same alphas); the sidebar fades between its last nav item and its footer, the top bar between
  the breadcrumb and the controls — bands MEASURED by ResizeObserver into `--fade-a/--fade-b` (px), "no fade" until
  measured or when the band is under 120/200 px. `glass.test.ts` asserts the layer spells the same alphas. Instrument scan:
  text nodes intersecting a band (text on its own solid background excepted) = **0 on all 8 route×theme probes**; bands
  reported in px per capture. Coverage (in-place pair, P3 → P4): /ontology 57 → 59 · 61 → 63, /settings 3 → 7 · 7 → 10,
  /bd-pipeline 23 → 25 · 48 → 52, /command-deck 8 → 15 · 23 → 31 (dark · light). Visible in the peek: the room shows
  through the lower sidebar and the top bar's centre in both themes.
- 2026-09-03 · **P4 (2) THE PER-PANEL PROBE — built; first numbers.** `data-hero` on each wrapper root (globe, pipeline, vault,
  surface, storm, orrery); the lab counts changed pixels inside each hero's rect → `visibility.panels`. First read: orrery
  .80 dark · .82 light (gate ≥ .60 met); pipeline .39 dark · .87 light (dark BELOW the gate — the dark relief differs too
  little from its fallback; a P4 (4) task); command-deck no panel yet (its surface needs the lp-rescore engine fixture).
- 2026-09-03 · **P4 (3) HERO FIXTURES — built; the heroes draw in the harness.** `scripts/instrument-fixtures.mjs` gains
  `heroFixtures()` (140 seeded MapPoints across bands/regions/categories with the scoring fields; 40 AuditEntries; a
  CommandDeep `reference` with scorecards + funnel; Readiness; the lp-rescore engine result) and `/market-map`, `/audit-log`
  join DESK_ROUTES. First per-panel numbers with data: globe .58 dark · .59 light (just under the .60 gate); vault .31 dark ·
  .89 light; orrery .80 · .82 (static data); pipeline .39 · .87. Dark is the shortfall everywhere — the reliefs' dark frames
  differ too little from their flat fallbacks under the plate. P4 (4) — the P3 stack on the heroes — is where that moves:
  `packages/gl/src/look/present.ts` (`createPresenter`: copy → pipeline → FXAA, one path for the stage and the five heroes;
  `loadEnvironmentMap`) is written and type-clean; the Stage and the five ReliefGl files adopt it next.
- 2026-09-03 · **P4 (4a) ONE PRESENT PATH — adopted by all seven GL surfaces.** `createPresenter` (look/present.ts) replaces
  each surface's own present shader in GlobeReliefGl, PipelineReliefGl, VaultReliefGl, SurfaceReliefGl, StormReliefGl,
  OntologyOrreryGl and the Stage (its inline P3 wiring folded in). Catches: two heroes declare `th` after the present call
  (theme read via `liveTheme()` instead); the storm reuses the fullscreen vertex shader for its volume composite (aliased to
  the engine's `PRESENT_COPY_VERT`); the orrery's refusal carries a reason argument. tsc clean; 12 ratchet files / 163
  tests green. The deck fixture threw 4× `undefined.filter/.length` on first contact: the panels read `reference.sources`
  and top-level `rfi/requirements/blockers/live` — added; channel `type` is capitalised ('Paid'). Probe of the five hero
  routes running through the new path.
- 2026-09-03 · **P4 (4a) MEASURED — the heroes through the one path, with data.** Per-panel coverage (dark · light): globe
  .61 · .61 (gate ≥ .60 MET, up from .58 · .59), vault .31 · .88, pipeline .39 · .87, orrery .80 · .55 (light fell from .82
  on the first probe; gl census 2 both — to be looked at, not explained away), deck: no panel, 4 page errors persist
  (`undefined.filter/.length`) — the fixture still misses a field; stack captured next. Redraw 3.4–4.5 ms on every hero
  route. Peeks with fixtures: the globe (region pins, arc lift, labels) and the vault (the corridor of records) are visibly
  the pages' primary instruments now. Dark is the shortfall on vault and pipeline: their dark frames differ too little from
  the flat fallbacks. Next: the studio map on the four sky-bearing heroes (wired: `loadEnvironmentMap` + `withEnv` on the
  sky options, gains dark .6 / light 1.0), then re-measure.
- 2026-09-03 · **P4 (4b) THE STUDIO ON THE HEROES — first wiring changed nothing, and the record says exactly why.** Four
  sky-bearing heroes gained `loadEnvironmentMap` + `withEnv(sky)`; the probe read panels IDENTICAL to four decimals
  (orrery .8039, pipeline .3872, globe .6084, vault .3074) — good for repeatability, useless for the change: each hero's
  `redrawForTheme()` returns early when the theme is unchanged, so the map landed and nothing repainted. The onReady now
  resets `drawnTheme` first. Re-probe running. Deck: `LpOptimizerPanel` reads `sensitivity`, `setAnalysis.gaps`,
  `unrankable` from the lp-rescore result — added to the fixture; deck probe queued behind the running one.
- 2026-09-03 · **P4 (5) E1 — a decision before a build.** The plan says "a machined 3D gauge". The deck is AT the two-context
  cap (stage + the LP surface; `glContextBudget.test.ts` CONCURRENT_CAP 2, 15 routes at cap) — a GL gauge is a third context,
  and the ratchet is right: a gauge that costs a context refuses on the page it decorates. So E1 is rebuilt as a gauge SHADED
  BY THE RIG (SVG; bevel and rim from `--edge-hi/--edge-lo`, the needle's shadow cast toward the key's opposite) that CARRIES
  the figures the old one did not: five weighted segments (arc = weight, tone = score), the composite as needle + number,
  ticks. `readinessGauge.test.tsx` counts the marks and reads the angle back. Not GL, said plainly; the room shows through
  the plate behind it. The readiness fixture is on the dial's 0–100 scale with five dials.
- 2026-09-03 · **P4 (4b) THE STUDIO ON THE HEROES — measured, with the redraw guard reset.** Per-panel coverage (dark · light),
  before → after: orrery .80 → .80 · .55 → .83 (gate met both); globe .61 → .65 · .61 → .81 (met both); pipeline .39 → .43 ·
  .87 → .91 (dark still under .60); vault .31 · .88 unchanged (no sky by its own design — decision pending on whether an
  ENVIRONMENT is a sky). Page coverage rose with it (/market-map light 32 → 38, /ontology light 44 → 63). Deck with the
  completed fixtures: 0 errors; its DARK capture read 2 figures against 54 in light and the surface's rect was empty — the
  first theme run of a route pays Vite's cold chunk compile, and the capture can land on a half-loaded page. Instrument:
  a warm-up pass visits every route once before measuring (recorded in totals.warmup).
- 2026-09-03 · **P4 — THE VAULT'S DARK PANEL IS A DOCUMENTED EXCEPTION, NOT A SHORTFALL TO TUNE.** `VaultReliefGl.tsx`'s
  header: no sky backdrop is allocated because a sealed corridor lit by a sky becomes a tunnel whose deepest region is its
  brightest — the inverse of the reading ("depth is time"); the interior is near-black in dark by design and the records
  are unlit marks. An environment map is that sky by another name. So the vault keeps the P3 stack's present path (bloom,
  FXAA) and no environment; its dark panel coverage (.31) stays under the .60 gate with this reason on record, its light
  (.88) clears it. The pipeline's dark (.43) is a genuine shortfall to work.
- 2026-09-03 · **Instrument, P4 additions.** Warm-up pass before measuring (every route visited once; `totals.warmup`); gallery
  rows carry each hero's panel coverage beside the page number; the P4 fill helper prints the hero-panels table with the
  gate mark. Pipeline dark (.43) is the one genuine shortfall left to work before the P4 sweep: its dark frame is a near-black
  channel with wireframe rails; the env at .6 lifts it little — the next measured step is a higher dark env gain for that
  surface alone, judged by its panel number and a look, not by the page.
- 2026-09-03 · **P4 — the deck's hero was below the fold.** With the warm-up in place the deck read 60 figures, 2 contexts, 0
  errors in both themes — and `panels.surface` null in both: the LP surface's rect was clipped to zero area because
  `LpOptimizerPanel` rendered four panels down the page, past 1100 px. The hero the plan names as the deck's primary
  instrument was not in the first viewport. Moved directly under the readiness gauge (CommandDeck.tsx), reason in the JSX.
  Pipeline dark: env gain .6 → 1.3 for that surface alone, probing.
- 2026-09-03 · **P4 — the pipeline's dark panel: a second documented exception.** Env gain .6 → 1.3 read .42 vs .43 — the
  shortfall is not lighting. The pair shows why: GL-on is the channel, a near-black room with wireframe rails and six lead
  blocks (its reading: height is movement, far end → near end are the gates); GL-off is the flat table of the same leads —
  rows of text on a dark card. Where the room is black and the card is dark, pixels agree, and the metric reads .43.
  Brightening the room would break the reading it exists for. Recorded as designed-dark, like the vault; gain reverted to
  the heroes' common .6. P4 hero gate so far: globe ✓✓, orrery ✓✓ (both themes), pipeline light ✓ · dark exception, vault
  light ✓ · dark exception, deck surface pending its probe, storm gated by design (no feed).
- 2026-09-03 · **P4 HERO GATE TALLY (per-panel coverage, in-place pairs, warm-up on).** surface (deck) .85 dark · .92 light —
  MET after the move into the first viewport (rect y 772, clipped to the 1100 px capture); globe .65 · .81 MET; orrery .80 ·
  .83 MET; pipeline dark .43 (designed-dark, documented) · light .91 MET; vault dark .31 (designed-dark, documented) · light
  .88 MET; storm gated by design (no feed) and says so. Full P4 sweep (79 routes, fixtures incl. heroes, warm-up) running
  for the record; then gate → commit → push → verify → desktop v0.4.0.
- 2026-09-03 · **P4 SWEEP — THE RECORD (79 routes, fixtures incl. heroes, one-page-load pairs, warm-up 162 s).**
  THE SWEEP (docs/instrument/audit/production-p4; 79 routes × 2 themes, fixtures on incl. the heroes, one-page-load pairs, warm-up 79 routes / 162 s):
  dark: GL visible on 61 → 71 of 79 · median 32% → 34% · ≥ 35% on 17 → 37 · ≥ 20% on 49 → 51
  light: GL visible on 76 → 76 of 79 · median 45% → 47% · ≥ 35% on 48 → 51 · ≥ 20% on 57 → 60
  HERO PANELS (coverage inside each hero's rect; gate ≥ 60% both themes):
  orrery    /ontology      dark 80% · light 83%  ✓ gate
  pipeline  /bd-pipeline   dark 43% · light 91%
  globe     /market-map    dark 65% · light 81%  ✓ gate
  vault     /audit-log     dark 31% · light 88%
  storm     /marketing/crisis dark — · light —
  surface   /command-deck  dark 85% · light 92%  ✓ gate
  Chrome-fade text hits across all captures: 0. Stage redraw: n 152, median 4 ms, p90 4.6, max 12.8, over 8: 3.
  Standing metrics: continuity 76 → 76 · motion at rest 0 → 0 · max intervals 2 → 2 · rAF loops 0 → 0 · GL contexts 77 → 77 · page errors 0 → 0.
  Dark's rise (visible 61 → 71, ≥ 35% on 17 → 37) is the chrome fade and the heroes through the one path with the studio;
  the three redraws over 8 ms (max 12.8) are on hero routes where the hero's context draws beside the stage under SwiftShader.
  Root gate running on this exact tree; commit follows.
- 2026-09-03 · **P4 GATE, run 1: red on one engine ratchet, rightly.** `stage.test.ts` counts the modules that free a program
  the stage also holds — 11 → 12: `look/present.ts` deletes its copy program in `dispose()`, one per stage, like aa.ts in P3.
  The pin moved to 12 with the reason beside it; gate run 2 running. (shared 57/57 green before the stop.)
- 2026-09-03 · **P4 GATE, run 2: gl and api green; web red on `topNavChrome.test.tsx` ×5.** The chrome-fade hook constructs a
  `ResizeObserver`; jsdom has none, the effect threw, the header never rendered, five header tests failed together. Both
  chrome hooks now measure once and return when `ResizeObserver` is undefined (also the honest behaviour on an old WebKit:
  a band measured once beats a thrown chrome). Gate run 3 running.
- 2026-09-03 · **P4 WEB COMMITTED 8cdf9aa** (gate run 3 clean; pushed to lcx-sales main). verify-live next; then the desktop release v0.4.0.
- 2026-09-03 · **P4 close-out in flight.** 8cdf9aa pushed (CI 33640413487 started). verify-live running with the P4 needles.
  Desktop v0.4.0: six version homes bumped; the signed build gate (root ci-check + tauri build) running; then the DMG size
  guard (read bytes → set the page's constant + history line → REBUILD), `release:dry`, `release`, CDN-verify, release commit.
- 2026-09-03 · **Desktop v0.4.0 — a process catch.** `npm run build-gate` is the build's PRE-step (it composes root ci-check
  and is what `tauri build` runs as beforeBuildCommand); run alone it gated the tree (all five stages green, perf OK, JS
  841/850) and produced no bundle — the artefacts on disk were 0.3.0's. The real build (`npm run build:dmg`, signed) is
  running; it re-runs the gate inside, which is the cost of one command being the truth.
- 2026-09-03 · **Desktop v0.4.0 built and signed; THE DMG GUARD would fire, as designed.** `LCXOS_0.4.0_aarch64.dmg` is
  4,370,551 bytes = 4.4 MB; the page said 4.3 (0.3.0's 4,330,900). `LCXOS_DMG_MB` → 4.4 with a 0.4.0 history line naming what
  the 40 KB are (the scene module, the present path, the two studio maps + sidecars, the fixture code paths); rebuilding so
  the page bundled inside the app agrees with the artefact, then `release:dry`. Pages still served the pre-P4 shell 35 min
  after the push while Render had registered 8cdf9aa within a minute — a Pages-side delay or failed build; no Cloudflare
  token here to read its log. verify-live still polling.
- 2026-09-03 · **CI e2e red on 8cdf9aa — one real defect, found by the keyboard-day spec.** `flow 2 fast path`: press `f`,
  land on Decide, expect its hint chip — "expected one chip beside Decide, got []". Cause: `LpOptimizerPanel` renders NOTHING
  until the lp-rescore engine answers (`if (!res) return null`), then mounts a tall panel; since P4 moved it ABOVE Decide, the
  page shifts after the chips are placed and the chip detaches from its target. The frame-budget and Tab-count marks in the
  log were retries that then passed. Fixes: the LP panel reserves its space while loading (a skeleton of the panel's height),
  and the hint chips re-place on layout shifts (ResizeObserver) — the general defect any async panel above a target would
  cause. Pages: Cloudflare's check-run says in_progress (queued, not failed); Render registered the deployment at once.
- 2026-09-03 · **Desktop v0.4.0: rebuilt with the 4.4 MB constant; `release:dry` clean — and it says DIRTY TREE.** The size
  guard accepted 4.4 (DMG 4,370,514 B this build; 4,370,551 on the first — the bytes move by tens between builds, the tenth
  of a megabyte does not). The build record marks the tree dirty (the bumps and the deck fix are uncommitted), and a release
  is cut from a commit, not a working copy: order is e2e evidence → root gate → commit (fix + bumps) → push → REBUILD from
  the commit → release. 21 GL chunks carry shader source (7 renderer surfaces + 14 shared) — the presenter is shared, not
  seven copies.
- 2026-09-03 · **The deck fix is measured: flow 2 passes on a fresh dev server (2 passed, 11.2 s; the chip is beside Decide;
  4 presses to an armed decide field via the hint layer).** Root gate running on the fix + v0.4.0 bump tree. Pages for 8cdf9aa
  has read `in_progress` for 45 minutes (Cloudflare check-run; dashboard: dash.cloudflare.com → Workers & Pages →
  lcx-sales-automation-engine → deployment 73aed997) while Render deployed at once — if it never lands, that dashboard is
  Nik's to open; the next push will queue behind it either way.
- 2026-09-03 · **verify-live 8cdf9aa: TIMEOUT pages=0 render=1.** Render serves 8cdf9aa; Pages still serves the pre-P4 shell
  after twenty probes (~30 min) and ~55 min since the push, its check-run `in_progress` throughout. Half-live is recorded as
  half-live: the API is P4, the web is not yet. The fix commit will queue a second Pages build behind it.
- 2026-09-03 · **fix(deck) + v0.4.0 bumps COMMITTED 3c29de8, pushed.** Desktop rebuild from this commit next, then release.
- 2026-09-03 · **Desktop v0.4.0 — two guards fired, both rightly.** (1) `release:dry` refused: "the built app points at
  localhost:8791". Mechanism: the desktop gate pins `VITE_API_URL` to the production origin when IT builds apps/web/dist, but a
  root `npm run ci-check` I ran afterwards (the fix commit's gate) rebuilt the same gitignored dist with the developer
  `.env.local` — and Tauri bundles whatever dist is on disk. Rule for this repo: nothing rebuilds apps/web/dist between the
  desktop gate and the publish. (2) The rebuild from 3c29de8 failed its inner gate at the web vitest stage while my root gate
  ran concurrently on the same tree and dist — one gate at a time. Rebuilding solo now; publish follows the dry run.
- 2026-09-03 · The concurrent gate's web red was `marketingHoldings.test.tsx › shows the NOT DECLARED warning even with nothing
  to show` (`holdings-register-empty` not found) — a marketing page P4 never touched, green in the root gate that ran beside
  it. Recorded as the worker-contention class (memory: vitest file count shifts workers), not fixed by hand; the solo build's
  gate is the arbiter.
- 2026-09-03 · **DESKTOP v0.4.0 PUBLISHED.** `npm run release` from eb0ed00 (clean tree): tag v0.4.0 on voyagernik123/lcx-terminal-releases;
  latest.json serves 0.4.0 (confirmed after 1 attempt); DMG (4,371,024 B, served content-length equal) and latest.json fetch
  anonymously HTTP 200; the served signature equals the local .sig (404 chars). Installed locally: /Applications/LCXOS.app reports
  0.4.0 (adhoc signature, as every release before it). The web's LIVE flip still waits on Cloudflare Pages (queued since 14:11Z).
- 2026-09-03 · **CI 33643251167 on 3c29de8: GREEN on both jobs** — the deck fix passes the keyboard-day spec in CI too (the
  8cdf9aa run's e2e red is closed by it). Cloudflare Pages check-runs for 8cdf9aa and 3c29de8 both still `in_progress`.
- 2026-09-03 · **release(desktop) commit 0c0cd3a pushed** (Launch.tsx history bytes 4_371_024; the ledger's close-out). Web LIVE flip
  still waits on Cloudflare Pages; the next verify-live targets 0c0cd3a (it carries every earlier P4 commit).
- 2026-09-03 · **P5 STARTED (byte pre-step) while P4's web flip waits on Pages.** Shell attribution (sourcemap, 98%): the two
  datasets and the inspector payload registry are the shell's weight, not the engine. Three shell files reach the barrel:
  Sidebar.tsx, inspect/payloads/ExtendedInspectors.tsx, lib/compliance.ts. Step 1: import what they actually use directly,
  so `competitors`/`states` fall out of the shell; measure with check-bundle; then the shared-renderer charts.
- 2026-09-03 · **P5 STEP 1 MEASURED — the datasets leave the shell.** Three import lines (Sidebar `redFlags`, ExtendedInspectors
  and lib/compliance `states`) now name their module instead of the `@/data` barrel. Shell chunk 448 → 360 KB (largest
  352/440), initial JS 840 → 755/850, 211 lazy chunks — 85 KB out with no behaviour change; competitors.ts and the ontology
  graph now load only on the routes that read them. The bundle checker's INITIAL_PREFIXES note remains a warning about a stale
  list, not a failure. Gate → commit → push next; Pages will queue it behind P4's builds.
- 2026-09-03 · **P5 census, re-derived (no script stood behind P0's "35").** Files outside components/charts whose inline <svg>
  carries DATA-BOUND marks: 16 — StrategicMatrix 11 marks, FeasibilityMap 9, GpsUnderwriting 6, RiskCalendar 6, CockpitPanels 6
  (the E1 gauge among them), SurfacePlot 4, MarketScatter 3, PartnerDossier 3, OntologyMiniMap 2, AnomalyDeviation 2,
  PipelineSankey 2, GroupedColumnChart 2, ActivityStrip 2, Wbr 1, LoadingSkeleton 1, GapAnalysis 1. Of these, SurfacePlot,
  RiskCalendar, MarketScatter and OntologyMiniMap are the heroes' flat twins BY DESIGN and stay; LoadingSkeleton encodes
  nothing. P5's move list is the other eleven, onto ColumnChart / Sparkline / ControlBand / BarChartH where they encode data.
  P0's 35 counted every non-icon <svg>; the number that matters is 11.
- 2026-09-03 · verify-live 3c29de8: TIMEOUT pages=0 render=1 — Render carries 3c29de8 (and 0c0cd3a since 14:57Z); Pages still
  serves the pre-P4 shell. The watcher re-verifies 0c0cd3a the moment Pages serves a new shell (≤ 2 h), else names the dashboard.
- 2026-09-03 · **P5 STEP 1 COMMITTED 97243c2, pushed** (gate clean first run; perf JS 755/850 · largest 352/440). Step 2 next: the
  ControlBand and StatCard GL twins on the shared renderer (plan: session scratchpad `p5/PLAN.md`; if gone, §5 P5 notes).
- 2026-09-03 · **P5 STEP 2 — the last chart twin.** Of the twelve chart components, ten already drew on the shared flat renderer
  and StatCard's "track" is the GL-backed Sparkline it embeds — the one without a twin was ControlBand (291 lines of SVG on
  /kpi-dashboard via CalledVsLanded). `charts/gl/FlatBand.tsx` (`useFlatBand`, modelled on FlatBars): the band as one quad per
  adjacent pair of readings, expected/actual as lit strokes, single-reading runs as points, gaps kept as gaps; colour tokens
  resolved from the palette at draw time (an unresolved token refuses); kits held per stage; the SVG stays the refused/print
  twin. ControlBand mounts the canvas behind its SVG and its data marks defer to GL when a frame has really been drawn; the
  early return moved below the hooks (ColumnChart's rule).
- 2026-09-03 · **P5 STEP 2 — REVERTED BY A RATCHET THAT WAS RIGHT.** `glThreshold.test.ts` is the measured policy on which charts
  may draw on the GL path: Gate A, the lit-axis extent must be ≥ 20 device px (the shader's own edge, `smoothstep(0.10, 0, t)`,
  needs two pixel rows to read as an edge; `SVG_GL_THRESHOLD.md` §7.3). ControlBand was UN-backed at 38c01b1 with the numbers
  on record: L = 5.2 device px, stroke halfWidth 1.3 (65 % of the SVG's 2 px), 55 primitives from a dash splitter — and the
  test's LIVE arm asserts it hands the GL layer nothing and imports no `./gl/`. My twin (`FlatBand.tsx`) would have shipped lit
  modelling that cannot exist on a 2-px line. Removed; ControlBand restored to SVG. Sparkline sits below the same floor, so
  StatCard's track is SVG by the same physics. P5's "every chart on the engine" is therefore TEN of twelve by measurement, two
  documented below the floor — the plan's number was written before the floor was; the floor wins.
- 2026-09-03 · **P5 STEP 3 TRIAGE — by the floor, not by the list.** Of the eleven inline-data-SVG files, the marks that could
  carry lit modelling (≥ 20 device px along the shading axis, dpr 2 → ≥ 10 CSS px): GroupedColumnChart's columns — YES (one
  real move, onto the shared FlatBars path, and into components/charts so `glThreshold`'s LIVE scan governs it). Below the
  floor and staying SVG: AnomalyDeviation (BAR_H 6 → L 12), GpsUnderwriting range bars (9 px → L 18), ActivityStrip cells
  (1 px), GapAnalysis cells (a matrix, no chart component and no lit axis), Wbr's 1.5-px path, PartnerDossier's polygons,
  PipelineSankey's ribbons (a sankey is not one of the twelve), StrategicMatrix/FeasibilityMap dot fields (r 3–6 px). The
  plan's "35 files" is, measured, one move. The remaining P5 gain is not in more GL charts; it is in the shared renderer's
  presence on every desk route (coverage ≥ 50%), the arrival bloom, and the record.
- 2026-09-03 · **P5 STEP 3 (the one move) + STEP 4 (GL side) — built.** GroupedColumnChart moved from components/deals into
  components/charts (so `glThreshold`'s LIVE scan governs it) and onto the shared FlatBars path with ColumnChart's exact recipe
  (host ref → resolved palette hex; rects memoised; SVG columns defer to GL; grid/ticks/labels/tooltips stay SVG); registered
  with L = 60 % of plotH = 86.4 units × 2 = 172.8 device px. THE ARRIVAL BLOOM: `charts/gl/useArrivalBloom.ts` decides once
  per mount from S4's mark (`markOf` ≠ signature → 1, first reading → 0, observes the signature for the next rollover);
  `useFlatChart` carries `bloom` into the frame for the ENTRANCE only; FlatBars/FlatTrack/FlatDial scale their bloom gain by
  1 + 2.5·bloom·(1−t) — the glow rides the tween that already runs and decays with it, no timer, nothing at rest, none under
  reduced motion. Unit test written. Next: `arrivalKey` on ColumnChart/BarChartH/GroupedColumnChart and one keyed site per desk.
- 2026-09-03 · CI on 97243c2 (the byte win): GREEN. Chart + component ratchets with the grouped chart registered and the
  arrival hook: 16 files / 197 tests green.
- 2026-09-03 · **P5 STEP 4 — keyed sites.** `arrivalKey` on ColumnChart, BarChartH and GroupedColumnChart (signature = the values
  they draw); six desk sites keyed: kpi:channel-conversion, kpi:funnel-stages, kpi:forecast, winloss:by-jurisdiction,
  winloss:by-package, winloss:loss-reasons. tsc clean; charts + pages tests 47 files / 719 green. Probe of five desk routes
  running for the ≥ 50 % coverage gate.
- 2026-09-03 · **P5 desk probe — inconclusive by construction, and one defect.** /bd-kpis, /win-loss, /forecast, /scorecard read
  P4 → P5 identical (36 % dark · 55 % light, gl 1, figures 1): their charts never drew because the harness has no fixtures for
  the KPI/forecast/scorecard/win-loss endpoints (the desk fixtures cover the eight landings and the P4 heroes). /bd-kpis under
  the fixtures shows the ERROR BOUNDARY ("Something broke"), not its no-connection state — a page that throws on a missing
  endpoint is a defect regardless of P5; the console error is being captured. The P5 coverage gate needs those fixtures first.
  Also seen: an unknown URL renders react-router's raw developer 404 — the root route has no `errorElement`.
- 2026-09-03 · **Two defects found in passing, fixed.** (1) An unknown URL rendered react-router's developer page on black;
  `components/shared/RouteError.tsx` is now the shell route's `errorElement` (thrown route errors → the product ErrorNotice)
  and a catch-all child `*` inside AppLayout names the state — "This page does not exist", the way home — with the shell and
  the stage still standing behind it (peek: stage drawn, studio fetched). `routeError.test.tsx` pins both branches.
  (2) `KpiDashboard.tsx` stored its load error as a MESSAGE STRING, so a refused fetch read "Something broke" instead of
  "No connection"; it now keeps the error object and ErrorNotice classifies it. Desk fixtures for /bd-kpis, /win-loss,
  /forecast, /scorecard next (types read from `types/kpi.ts`, `lib/api/{bd,intel}.ts`).
- 2026-09-03 · **PAGES MOVED.** After ~2.5 h the production shell is a new chunk (`index-ASbpYADt.js`); Cloudflare's check-runs:
  97243c2 (the newest push) completed SUCCESS, 8cdf9aa completed FAILURE (a Cloudflare-side build failure — no log reachable
  from here; the later build carried the same code and succeeded), 0c0cd3a still in_progress. verify-live 97243c2 running
  with the P4 needles + `uInvSize`; the LIVE flips for P4 and the P5 byte step follow its report.
- 2026-09-03 · **P4 LIVE.** verify-live 97243c2 — probe 1: Pages has `chrome-fade-y` (shell JS), `chrome-fade-x` (CSS), `data-hero` and
  `uInvSize` (lazy chunks); Render deployment 6225350768 success. The P5 byte step rides the same commit and is live with it.
- 2026-09-03 · **P5 desk probe with fixtures — three findings.** /bd-kpis: charts draw, coverage 36 → 45 dark · 55 → 72 light —
  and the KPI section still throws (`(history ?? []).map is not a function`, NaN polyline points in CalledVsLanded): the
  history fixture's shape is not what the chart maps; fixing from the fetcher and the component, not by guessing. /win-loss:
  figures 2 — the board fixture's wins fell outside the page's 90-day `closedAt` cutoff; fixed to 45 % closed within 80 days.
  /forecast and /scorecard: content renders (39 and 23 figures) and page coverage FELL (36 → 11 · 55 → 19; 36 → 22 · 55 → 30):
  their real content is opaque cards over the plate. The P5 gate "≥ 50 % on every desk route" is the §4 plate question again —
  card-dense desks cannot show the room through their cards — and P5 records it rather than tunes the cards away.
- 2026-09-03 · **KPI desk draws on the engine under fixtures** (0 errors, 37 figures; donut, bars and funnel columns all GL) —
  page coverage 11 % dark · 21 % light because the desk is now opaque cards over the plate (the §4 plate question, not a chart
  question). Win/loss: a SECOND fetch (`/v1/ai/win-loss?pool=`) had no fixture and the page rendered its error as a raw red
  string — same defect as the KPI desk: it now keeps the error object and shows the product ErrorNotice; the fixture is built
  from the page's own Bucket type. Probe of /win-loss running; the full P5 sweep follows it.
- 2026-09-03 · **Win/loss draws on the engine** under its fixtures: 0 errors, 32 figures; the two GroupedColumnCharts (by
  jurisdiction, by package) and the loss-reason bars are GL — the P5 move is visible in the capture. Coverage 12 % dark ·
  19 % light: opaque cards over the plate, as on every card-dense desk. Full P5 sweep started (79 routes, fixtures incl. the
  desk charts, warm-up, one-page-load pairs); then gate → commit → push → verify.

- **2026-09-03 (night, during the P5 sweep) — P6 PRE-WORK, inert in the tree.** While the full P5 sweep owned the browser
  (routes 14→46 of 80 over ~45 min), P6 was grounded and drafted without touching anything the sweep serves:
  `packages/gl/src/env/gltf.ts` (GLB loader: generic accessor decode incl. KHR_mesh_quantization, node TRS
  de-quantization, refusals with reasons), `packages/gl/src/env/gltf.test.ts` (5 green: float round-trip, int16
  quantized, TRS to real units, bad magic, short file), `scripts/blender/export_gltf.py` (hand-written GLB writer:
  bevelled disc/ring/plinth, the LCX mark ENGRAVED from lcx-mark.svg — 72 vertices at the cut floor, measured — 30°
  smooth-by-angle rule), and `docs/vfx/P6_PREP.md` (facts, decisions, measured bytes). Export measured: forge.glb
  146,716 bytes, 11,356 triangles (ring slimmed 160×24 → 128×16: tube facets .02 units), parsed by the loader with
  bounds equal to the live radii and 0 off-unit normals. Decision: ForgeBackdrop keeps material authority (anisoPreserved
  pins the √roughness convention; the still's light plinth #B9C5D8 ≠ live #AEBACD, recorded not "fixed"); one
  theme-agnostic glb; MAX_PASSTHROUGH_KB 1024 → 1152 stated in the P6 body. All four files are UNTRACKED and imported by
  nothing — they ship in their own commit after P5, never inside P5's.
