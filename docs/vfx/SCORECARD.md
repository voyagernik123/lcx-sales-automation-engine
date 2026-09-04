# THE PRODUCTION — SCORECARD (DRAFT, opened 2026-09-04 during P7; closed at P9)

One line per promise in VFX_PRODUCTION_PLAN.md: **met** (measured, live), **short** (measured, below the stated target, with the
number), or **refused by design** (with the reason). Nothing here is a multiplier or an adjective; every entry names the record
(`docs/instrument/audit/production-pN/BASELINE.json`, a commit, or a capture) it is read from.

| Phase | Promise | Verdict | The number, and where it is read from |
|---|---|---|---|
| P0 | The instrument: every route, both themes, GL coverage measured against a validated visibility control | met | 79 routes × 2 themes per sweep; visibility control: a known 40 % area reads 40.0 % (ΔE 99.4), identical captures 0 % — every BASELINE |
| P1 | One stage behind every route (the room, the plate, the rooms' glows) | met | Stage.tsx mounted once in the shell; GL contexts 77 → 79 of 79 routes (P6 record) |
| P2 | Per-room framing; edge model from the stage's own rig | met | 530f0d9; STAGE_LIGHT-derived edge tokens (oneMaterial.test) |
| P3 | Luminance under the text floors, both themes; one present path | met | light median 17 → 45 %, dark 55 → 32 % inside the .04 ceiling P2 exceeded; antialiased == compositeOnly 7/7; redraw median 4.7 ms (5c22d09) |
| P4 | Chrome fade, heroes on the one present path, environment maps | met | dark visible 61 → 71, ≥ 35 % 17 → 37; fade text hits 0/158; desktop v0.4.0 published (97243c2) |
| P5 | GPU charts everywhere, to the resolution floor | met, with a ruling | 10 of 12 charts on the engine; ControlBand (L 5.2) and Sparkline (4.6 device px) stay SVG by glThreshold.test's 20-px floor (a395018) |
| P5 | ≥ 50 % GL coverage on desk routes | **short** | with fixtures the desks RENDER and coverage falls: /bd-kpis 36 → 11 % dark, /win-loss 36 → 12 %, /forecast 36 → 8 %, /scorecard 36 → 22 % (light 55 → 21/19/14/30). A rendered desk is opaque cards over the plate; the P4 figures measured empty desks. Recorded as the §4 plate question, not tuned away |
| P5 | The arrival bloom on changed figures | met | six keyed sites; `useArrivalBloom` decides once per mount from the figure marks |
| P6 | The Forge as a machined mesh from Blender, live on sign-in and /lcxos; the still where GL refuses | met | forge.glb 160,520 B, 12,376 triangles, KHR_mesh_quantization, engraved mark (72 vertices at the cut floor); /select coverage 95/96 %, /lcxos 18/20 % (P6 record + smoke); brand hex from the bytes exact (oneObject.test) |
| P6 | Room markers as small machined objects | met | eight pucks from the same glb on 154 of 160 captures (the six without a stage are /lcxos, /select, /portal) |
| P6 | The plate with a real edge profile | met, and a defect found | outward 45° chamfer; the slab's walls had been wound inward since P2 and culled — the "plate" was a top face. Desk routes unchanged to the percent with the walls rendered |
| P6 | Every asset within budget, calibrated (Standard), no eager bytes | met | passthrough 867 → 1025 of 1152 (stated raise); initial JS 761/850 unchanged by the asset; sidecar Standard; the glb fetched after the first frame |
| P6 | (record hygiene) rAF at rest 0 | **artefact, then met** | the P6 record read 14 rAF/s on /lcxos: the Forge's 5 s arc caught by the rest window; `data-arc` + the instrument's wait → P7's record: rAF loops 0, dark visible 79 of 79 |
| P6 | (record hygiene) pipeline hero light panel | **short, unexplained** | 91 → 86 %; the two captures are identical inside the hero, the page under it changed (the watch line). Not isolated |
| P7 | Rooms light in rank order on the arrival; changed figures bloom once; the ticker turns over; then stillness | met | production-p7 run 2: 154/154 captures — the watch arrived with 3 ranked items, steps === items on all, frames during the sweep ≤ items+1 (worst 3), motion at rest 0, rAF at rest 0; quiet held rooms keep P3's .22 glow (run 1 had removed it: dark median 35 → 30 — corrected before the commit) |
| P7 | The arrival sweep measured as ONE bounded sequence | met | steps === items and frames ≤ items + 1 on 154 of 154 captures, under a CONTROLLED clock (the merely frozen clock had held the sweep at 0 — that first reading would have recorded darkness as the record) |
| P7 | (defect owned) the stage's glows sized by the watch | met | draw() had read the watch from a closure captured at mount (null for the life of the mount) since P3; refs now |
| P8 | 16.6 ms at 2× on M1 for stage + hero + charts | met | idle M1 GPU (ANGLE Metal), DPR 2, 30 frames: stage p90 3.7–7.2 ms, Forge p90 2.7–3.3 — worst p90 7.2 against 16.6 (scripts/measure-frame-budget.mjs; the software rasteriser is refused a verdict) |
| P8 | Context-loss recovery on the stage: a readable flat surface that says why | met | `webglcontextlost` → `refused:CONTEXT_LOST` on the host, `webglcontextrestored` → rebuilt once; verify-app-renders --lose-context on /tasks: refused during, drawn after |
| P8 | Glass floors re-measured | met after a fix | the room-glow cores exceeded the dark .04 ceiling on 2.3 % of the page area (p99 .041, max .096, a stripe at 62–73 % of the rect); glowGain dark .20 → .14 → p99 .036, over-ceiling 0.0 %; light p05 .596 over .55, 0.1–0.2 % under it in the top fifth (recorded) |
| P8 | Memory ceilings | measured | JS heap at rest per capture: 28–38 MB at 1×/2×, up to 58 MB narrow on /command-deck light; the full sweep's max is in the P8 record |
| P8 | Narrow / mobile framings | measured | at 768 px all six routes reach (after the instrument's shell anchor moved off the footer text the narrow layout hides): /lcxos 34/37 %, /select 91/93, /tasks 36/49, /market-map 25/33 (globe .63/.78), /bd-kpis 14/19, /command-deck 20/28; the surface relief sits below the fold at 768 (panel 0/.29 — off-screen, not refused); arrival 3/3 everywhere |
| P8 | Print pins | met | both GL hosts print:hidden, pinned from source (glHostsPrintHidden.test) |
| P8 | `verify-app-renders.mjs`: every route renders or says why, at 1× and 2×, wide and narrow, reduced motion, context lost | met, reduced matrix stated | 80/80 routes at 1× wide; 12/12 on the six-route subset at 2× and 768; reduced 3/3; context lost → restored 3/3 (the deck needs > 1.5 s to rebuild; bounded wait). The 320-page full matrix was stopped at ~50 s/page |
| P9 | Final sweep, gallery, this scorecard closed, desktop at the same build, walkthrough | pending | |

## Refused by design (standing)
- No idle motion anywhere: no pulse, spin, breath, marching edge — the redraw ratchet and `oneWatch.test` hold it; the arrival is the only motion and it stops.
- No per-step fade between arrival steps (frames between steps are a scheduled animation).
- The plate ceiling in dark stays .04 (glass.test refused .06 at 4.16:1); light's floor .55.
- Desk coverage is not raised by making cards translucent over the plate: text contrast owns that decision (§4 open item, owner call).

## What the numbers do NOT say (stated so a green is not over-read)
- "GL visible" is a difference between a GL-on and a GL-off capture of one page load, not a judgement of quality; the gallery is where quality is judged.
- The desk fixtures are deterministic and shaped like the API's types; they are not production data.
- Hero panel percentages are the share of each hero's own rect that the GL frame changes; a hero whose design is dark-on-dark (pipeline .43, vault .31 in dark) reads low by design and says so in its record.
