# THE PRODUCTION — high-fidelity 3D and VFX across the whole platform

**Status: APPROVED IN ADVANCE by the owner, 2026-09-02 ("build the plan, present it, start building; do not wait; even if
it takes days"). Built solo, no subagents, no workflows. The second brain is `docs/vfx/LEDGER.md`; on any fresh context,
read that first (§0), then the phase marked IN PROGRESS here, then build.**

---

## 0 · Why the last program left you looking at the same screens

The INSTRUMENT program (S0–S7) did what it said: one clock, one material, one camera, the watch, the terminal, the object.
Its thesis was subtraction — "a backdrop that says nothing on 73 routes is slop with lighting" — and its measured result
is GL contexts at rest **77 → 1**. It removed the always-on 3D layer (which drew nothing in the default light theme anyway),
retired one relief, and left six reliefs on seven routes that refuse to a flat fallback whenever the window is narrow,
the data is absent, or the toggle was off. Everything else is DOM. That is what you opened, and it looks like the app
before, because for the pages you use it *is* the app before, minus the motion.

So the question this plan answers is not "how do we add wallpaper back". It is: **how does every screen in this
platform become a rendered, lit, physical instrument — the way Palantir's geospatial surfaces and Bloomberg's density
read as a single expensive object — without a single pixel of it lying about data.** Every rule the previous programs
proved still binds (one clock, one material, brand hex from the bytes, refusals honest, data never fabricated). What
changes is the *position* of the 3D: it stops being behind the content and becomes the stage the content stands on, the
charts themselves, the objects you touch, and the motion of the truth arriving.

## 1 · The one measurement this plan is judged by

**Visibility.** For every route, in both themes, the instrument captures the screen twice — as shipped, and with every
GL layer forced off — and reports the share of viewport pixels that differ (`glCoverage`) and how strongly (`glDelta`,
mean ΔE). Today the honest number on most routes is **0%**; that number *is* your complaint. The plan's targets are stated
per phase as coverage on named routes, verified by a sweep, and shown to you as side-by-side captures in
`docs/vfx/GALLERY.md`, regenerated every phase. If a phase does not move the pictures, it did not happen.

Secondary gates, all existing and all kept: frame budget (`e2e/framebudget.spec.ts`, and a new GL frame-time probe in
the instrument), brand fidelity from the bytes (`docs/3d/brand-fidelity.mjs`, ΔE76 against `#2C6BFF`), the contrast
ratchet (`contrast.test.ts` — the a11y floors outrank the rig), rAF at rest 0 and CSS motion at rest 0 (the one clock),
GL contexts at rest ≤ 2 per route (the stage plus at most one hero), initial JS ≤ 850 KB (every GL byte stays lazy).

## 2 · Decisions made here, so nobody re-derives them

1. **Dark is the default theme.** Bloomberg and Palantir are dark for the same reason a cinema is: lit surfaces read
   against black. Light remains one toggle away and every light-theme ratchet stays enforced, but the first thing an
   operator sees is the lit product. (Revert: `useUIStore.darkMode` default, one line, plus index.html's pre-hydration
   fallback.)
2. **One engine.** `packages/gl` (16.5k lines: GGX/anisotropic BRDF, shadow maps, sky IBL, DoF, AO, particles, volumes,
   bloom composite with brand precompensation, flat charts, quality tiers, motion specs) is extended, not replaced.
   three.js + postprocessing was weighed: it would give bloom/SMAA/glTF in a day and cost a second material system,
   ~200 KB of lazy bytes, and every fidelity guard rewritten. The engine gains what it lacks — a glTF loader, a proper
   post stack (SMAA, bloom already there, vignette), HDR equirect environments from Blender — in ~1.5k lines I own.
3. **The 3D renders on demand.** Every stage and hero draws a frame when state changes (navigation, arrival, theme,
   resize, hover-intent) and otherwise holds the last frame. rAF at rest stays 0. Motion is consequential (S4).
4. **Refusal becomes reframing.** A narrow window gets a compact framing of the same instrument, not a flat fallback.
   Flat is reserved for the honest cases: no WebGL2, context lost, print, reduced-motion where the motion *was* the
   information. No data is ever fabricated to light a surface — the storm stays gated until a feed exists.
5. **Glass chrome with guaranteed floors.** The sidebar and top bar become frosted panels over the stage; a measured
   tint keeps every certified text role above 4.5:1 in both themes (the contrast ratchet is the judge, not the eye).
6. **Deploy every phase.** Each phase ends committed, gated, pushed, verified live, with the gallery regenerated and one
   line telling you which URL to open and what you will see. Desktop releases follow at P4 and P9.

## 3 · The phases

Each phase: **What you will see · What is built · The gate · Live check.** Estimates are agent-days of build; the owner
said days are fine.

### P0 · THE GALLERY AND THE VISIBILITY INSTRUMENT · 0.5 d
- **You will see:** `docs/vfx/GALLERY.md` — every route, both themes, shipped vs GL-off, side by side, with the
  coverage number. Today's baseline, honestly ~0% on ~72 of 80 routes.
- **Built:** `scripts/instrument-audit.mjs` gains `glCoverage`/`glDelta` per route×theme (second capture with the stage
  and reliefs forced off via an init flag), a GL frame-time probe (ms per rendered frame, sampled during a forced
  redraw), and a gallery writer (WebP thumbnails, committed, ≤ 60 KB each).
- **Gate:** the probe's positive/negative controls (a page with a known GL rectangle → coverage = its area ± 1%).

### P1 · DARK FIRST, AND THE STAGE · 2 d
- **You will see, on every route:** the app standing on a lit studio floor. The page is a physical plate with a soft
  shadow; behind it a horizon with volumetric falloff; the eight rooms of the platform are fixed lights in the space
  that glow where the watch (S4) found change since you last looked, dark where nothing moved, fogged where you hold no
  key. The sidebar and top bar are frosted glass over it. Dark by default; light is the same stage under a bright
  studio.
- **Built:** `components/stage/Stage.tsx` mounted once in `AppLayout` at the old backdrop slot (`relative isolate`),
  lazy after first paint, one WebGL2 context, on-demand frames; `packages/gl/env/stage-scene.ts` (ground, plate slab,
  room lights bound to `useArrivalStore`); glass tokens in `tokens.css` generated from `look/theme.ts` (S2's pipeline)
  with a `--glass-tint` derived so every role clears its floor; `darkMode` default true + index.html fallback.
- **Gate:** coverage ≥ 35% on every seated route in dark and ≥ 20% in light; contrast ratchet green; rAF at rest 0;
  GL contexts at rest 1 (+1 on hero routes); initial JS unchanged (stage is lazy).

### P2 · THE CAMERA MOVES · 1.5 d
- **You will see:** navigation as a camera move — the plate you leave recedes, the room you enter lights and the plate
  arrives with depth (≈ 400 ms, one easing, the S1 clock); the inspector drawer as a physical panel that slides in with a
  real shadow over the plate; `⌘\` docking as the plate narrowing to make room. Reduced motion → cut, as today.
- **Built:** the stage camera bound to the S3 view-transition seam (router.tsx wrap), `motion/` specs for dolly/pan,
  drawer geometry in the stage; view-transition names kept for the DOM half.
- **Gate:** vt on real navigation still 76/79; rAF only during transitions (instrument trace); frame budget spec green.

### P3 · THE FIDELITY STACK · 2 d
- **You will see:** materials that read as machined — brushed metal bars of light on the Forge and the plate edges,
  emissive data marks with real bloom, edges resolved without shimmer, a studio environment reflected in glossy surfaces.
- **Built:** SMAA pass; the existing bloom promoted to a first-class post stack with the brand precompensation extended
  so a data mark's core still decodes to `#2C6BFF` after bloom (measured by `brand-fidelity.mjs`); HDR equirect studio
  environments rendered in Blender (Standard transform, calibrated like S7) as IBL for the stage and heroes; the S2 edge
  model (top-left highlight / bottom-right shadow hairlines on DOM cards from the rig's key direction) generated into
  tokens.
- **Gate:** brand fidelity ΔE76 < 2 on every emissive mark after the stack; contrast ratchet green; frame time ≤ 8 ms
  for the stack at 2× on M1 (measured by the new probe).

### P4 · THE EIGHT ENVIRONMENTS AS HEROES · 2.5 d  *(desktop release after this phase)*
- **You will see:** on `/market-map` the globe, on `/bd-pipeline` the pipeline relief, on `/ontology` the orrery, on
  `/deal-board` the underwriting surface, on `/audit-log` the vault — each the page's primary instrument, prominent, lit
  by the P3 stack, standing on the P1 stage, drawn at any window width (compact framing), in both themes. The command
  deck gets a rebuilt E1: the readiness dial as a machined 3D gauge that carries the deck's figures (the old one drew no
  data marks, which is why it was retired). The storm stays gated (no feed) and says so.
- **Built:** hero framing per environment; compact framings replacing width refusals; light-theme material fixes (or the
  documented reason a surface is dark-only); P3 stack applied; `ReliefWatchLine` kept.
- **Gate:** each hero ≥ 60% coverage of its panel in both themes; data chroma above floor (`3d-audit-app.mjs`); every
  refusal code still reachable and honest; gate; desktop v0.4.0.

### P5 · GPU CHARTS EVERYWHERE · 2.5 d
- **You will see:** every chart on every desk — bars, columns, donuts, funnels, sparklines, histograms, stat cards'
  tracks, control bands — rendered by the engine with the production material: lit strokes with depth, emissive marks
  that bloom once on arrival, the same lighting as the stage. Print and reduced-motion get the SVG twin.
- **Built:** the 12 chart components in `components/charts/` gain GL renderers on the shared flat renderer (four exist:
  FlatBars/Track/Dial/Line); the 35 files carrying hand-written data SVGs are moved onto the shared components where
  they encode data (the rest are icons and stay); one arrival-bloom hook on the S4 store.
- **Gate:** coverage on every desk route ≥ 50%; the shared renderer stays ONE context per page (`sharedRenderer`);
  brand fidelity on chart marks; contrast ratchet; frame budget.

### P6 · THE OBJECTS (BLENDER → glTF) · 2 d
- **You will see:** the Forge on sign-in as a real machined mesh (bevels, brushed grain, engraved mark) under the P3
  stack, live where hardware allows and the S7 still where it does not; room markers on the stage as small machined
  objects; the plate with a real edge profile; `/lcxos` hero live.
- **Built:** a minimal glTF 2.0 loader in the engine (positions/normals/tangents/uv/indices, PBR factors, baked AO/normal
  textures as PNG); `scripts/blender/` grows `export_gltf.py` with the S7 calibration pipeline; assets under
  `public/objects/*.glb` within the passthrough budget.
- **Gate:** every asset within budget and calibrated (Standard); the sign-in Forge's brand hex from the bytes; no
  eager bytes.

### P7 · LIVENESS · 1 d
- **You will see:** the truth arriving as light — on arrival the rooms that changed light up in rank order across the
  stage, the changed figures bloom once, the ticker turns over; then everything is perfectly still until the next
  change. Nothing pulses, spins or breathes.
- **Built:** the S4 arrival choreography rendered in the stage and the charts; consequential-motion ratchet extended.
- **Gate:** CSS motion at rest 0; rAF at rest 0; the arrival sweep measured as one bounded sequence.

### P8 · HARDENING · 1.5 d
- **You will see:** the same thing on a MacBook Air at 2×, on a narrow window, on a lost GPU context (a readable flat
  surface that says why), in reduced motion, on paper.
- **Built:** frame-time budget under 16.6 ms at 2× DPR on M1 for stage + hero + charts (probe-measured, tier resolved
  once); memory ceilings; context-loss recovery on the stage; glass floors re-measured; narrow/mobile framings;
  print pins for every new token.
- **Gate:** every ratchet green; full instrument sweep both themes; `verify-app-renders.mjs`.

### P9 · THE PRODUCTION GATE AND RELEASE · 1 d
- **You will see:** the finished platform, every route, both themes, in `GALLERY.md` next to the P0 baseline; the
  desktop at the same build; a two-minute walkthrough of what to open.
- **Built:** final sweep, gallery, `docs/vfx/SCORECARD.md` (met / short / refused by design, stated plainly), desktop
  release, LEDGER and memory closed.

## 4 · The loop that keeps the quality bar through every context window

For every phase, in this order, no step skipped: build → `npm run ci-check` from the repo root (0 `npm error`, five stage
totals) → instrument sweep (visibility, GL, rAF, motion, figures; both themes) → **look at the gallery** (every capture,
not the numbers) → fidelity harness → frame-budget spec → commit with the measured before/after in the body → push →
`verify-live.sh` (SHA + content needles) → LEDGER §2/§5 → tell the owner the URL and what to see. The LEDGER's §0 is the
resume protocol; §1 the P0 baseline (cite, never re-run); §2 exactly one phase IN PROGRESS; §3 standing rules; §4 open
items; §5 the append-only checkpoint log. A phase is DONE only when it is LIVE and the gallery shows it.

## 5 · What this plan will not do, said now

It will not fabricate data to light a surface (the storm), will not add a second engine, will not animate at rest, will
not lower an accessibility floor for a look, and will not report a phase done on the strength of a number nobody looked
at. If a gate cannot be met, the shortfall is written in the SCORECARD in the same sentence as the result.
