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
| P2 THE CAMERA MOVES | **COMMITTED · verify pending** | sha in §5 | move: 2–6 frames then 0–2 (frames stop); coverage held 77/79 both · median 55% dark (P1 57) · 17% light (P1 18) | per §5 "P2 BUILT" and "P2 MEASURED" |
| P3 THE FIDELITY STACK | PENDING | | | |
| P4 THE EIGHT HEROES (+ desktop 0.4.0) | PENDING | | | |
| P5 GPU CHARTS EVERYWHERE | PENDING | | | |
| P6 THE OBJECTS (glTF) | PENDING | | | |
| P7 LIVENESS | PENDING | | | |
| P8 HARDENING | PENDING | | | |
| P9 PRODUCTION GATE + RELEASE | PENDING | | | |

**NEXT ACTION (2026-09-02):** P2 is committed (sha in §5) and pushed; run `scratchpad/verify-live.sh <sha> --js 'data-stage'`
→ flip P2 to LIVE here and in memory when it reports the SHA on both surfaces and the needle in the served JS. Then P3:
every patch is drafted in the session scratchpad `p3/` — follow `scratchpad/p3/APPLY.md` IN ORDER (aa.ts → pipeline `into` →
sky/env → edge tokens → edge CSS → oneMaterial test → Stage wiring → redraw hook → fidelity harness + brandPixel test → ship
`env-{dark,light}.webp` → gen:tokens → gl tsc/tests → brand-fidelity.mjs → gl-budget --write → PEEK BOTH THEMES → 3-route
instrument → root ci-check → commit → push → verify). Decide §4's byte question first: the shell is 436/440 and P3 adds
nothing to it (the Stage's engine imports are dynamic) — the split is P5's problem, not P3's.

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

- **Bytes — and WHICH chunk.** P1 moved initial JS 828 → 838/850 and the largest chunk 426 → 435/440. Measured on the
  built dist: the 435 KB chunk is the SHELL (`index-*.js`, carries `data-stage`; the stage's inline present shader is in
  it), not the engine — so P3's SMAA/bloom and P6's glTF loader (engine chunk, lazy) do not press it, but ANY shell growth
  does, and 5 KB is left. Before P5 (chart hooks in shared components) split the shell: `check-bundle.mjs:60` already
  says "code-split `index`, not raise the cap". Candidates, measured before choosing: the action manifest + command
  grammar (eager today), the inspector payload registry, the marketing/gps grammars.
- **Hero fixtures.** `/market-map`, `/audit-log`, `/deal-board` read 0% coverage in the harness because their heroes
  need `/v1/**` data the harness aborts. P4 adds fixtures for those endpoints so the judge sees them.
- **The chrome fades where it holds no text.** The sidebar's lower half and the top bar's centre carry no text; a
  gradient alpha there would show the room without touching a floor. Deferred to P3 (a mask, measured).

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
