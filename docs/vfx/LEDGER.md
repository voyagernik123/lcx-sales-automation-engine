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

| metric | before (P0) |
|---|---|
| routes with any GL visible (coverage > 5%), dark | _P0_ |
| routes with any GL visible, light | _P0_ |
| median glCoverage over 80 routes, dark / light | _P0_ |
| routes carrying a GL environment (static) | 7 of 80 |
| GL contexts at rest | 1 (`/select`) |
| default theme | light |
| frame time of the heaviest hero at 2× (probe) | _P0_ |

## 2 · STATUS — exactly one row IN PROGRESS

| Phase | Status | Commit | Measured after | Notes |
|---|---|---|---|---|
| P0 GALLERY + VISIBILITY INSTRUMENT | **IN PROGRESS** | — | `docs/vfx/GALLERY.md` | coverage/delta per route×theme; frame-time probe; gallery writer |
| P1 DARK FIRST + THE STAGE | PENDING | | | |
| P2 THE CAMERA MOVES | PENDING | | | |
| P3 THE FIDELITY STACK | PENDING | | | |
| P4 THE EIGHT HEROES (+ desktop 0.4.0) | PENDING | | | |
| P5 GPU CHARTS EVERYWHERE | PENDING | | | |
| P6 THE OBJECTS (glTF) | PENDING | | | |
| P7 LIVENESS | PENDING | | | |
| P8 HARDENING | PENDING | | | |
| P9 PRODUCTION GATE + RELEASE | PENDING | | | |

**NEXT ACTION (2026-09-02):** P0. Extend `scripts/instrument-audit.mjs`: (1) a second capture per route×theme with GL
forced off (init script sets `window.__LCX_GL_OFF = true`; the stage and every relief read it and refuse with code
`FORCED_OFF_FOR_MEASUREMENT`; relief prefs also seeded off), (2) `glCoverage` = share of viewport pixels whose RGB
distance between the two captures exceeds 8/255, `glDelta` = mean ΔE76 over changed pixels, (3) positive control (a
route with a known GL rectangle) and negative control (a DOM-only route → 0%), (4) `docs/vfx/GALLERY.md` writer with WebP
thumbnails under `docs/vfx/gallery/` (≤ 60 KB each, committed), (5) a GL frame-time probe (force a redraw N times via
`window.__LCX_GL_REDRAW?.()` where a surface exposes it; report ms/frame). Then the baseline sweep both themes → §1 →
commit → push → present the plan with the baseline number.

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

- (none yet)

## 5 · CHECKPOINT LOG — append-only, newest last

- 2026-09-02 · **PLAN WRITTEN** after the owner's ruling: the INSTRUMENT program "unslopified" the platform but he wants
  visible, high-fidelity 3D/VFX across every route. Grounding read: engine = `packages/gl` 16,569 lines (lit GGX/aniso,
  shadow maps, sky IBL, DoF, AO, particles, volumes, bloom composite + precompensation, flat charts, quality tiers,
  motion); no glTF loader, procedural sky only, no SMAA; 7 routes carry GL (`/ontology /bd-pipeline /deal-board
  /market-map /audit-log /marketing/crisis /command-deck`) + `/select` Forge; reliefs default ON except storm; theme
  default light (`useUIStore.darkMode: false`); 12 chart components (~20 sites), 4 GL flat renderers, 35 files with
  inline data SVG; the old backdrop slot is `AppLayout` `relative isolate` (X1 comment); initial JS 828/850.
