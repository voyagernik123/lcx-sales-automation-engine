# E3 · THE PIPELINE — status: **READS, and it cost two engine bugs, a lost object and a fog that erased the room.**

`live.png` is the gate. `flat-settle.png` (`?settle=0`) is the control and it is the one that matters:
every deal pinned to the rail, which is exactly what the bar list it replaces shows — value and stage,
movement demoted to a column. `no-particles.png` is what a machine without `EXT_color_buffer_float`
gets. `refused.png` is §6 rule 1's own claim, photographed.

## The reading a bar list cannot give

| | |
|---|---|
| value past diligence and stalled | **$4.35M · 39%** of the readable book |
| stalled at all (27 d+) | 5 of 10 readable deals · $5.36M · 47.5% |
| every stalled deal has visibly fallen | **59–129 px** from its own rail position |
| the same measure with `?settle=0` | **0 px** |
| gate throughput, intake → close | $125,278/d → $46,667/d · **2.68×** attrition |
| stream density, intake → close | 111.9 → 41.7 particles per metre |
| particles alive vs analytic steady state | **954 vs 956** · 0 outside the channel |

`$4.35M` is the number this environment exists for. It is two objects — `MERIDIAN PAY` at 41 days and
`HELIOS EXCHANGE` at 52 — lying on the floor of the near half of the channel, large because they are
worth a lot and low because nobody has touched them. The table in `refused.png` contains every figure
that produces it and gives it to you only after two sorts and some arithmetic, because value, stage and
movement are three columns there and three axes of one object here.

The **fall** is the load-bearing measurement, and it is per-deal rather than per-pair on purpose: it is
the same object's own screen position at its actual height against its position at the rail, so there is
no depth term in it. `?settle=0` drives all twelve to zero. That pair of numbers — 59 and 0 — is the
whole §6 argument, and the capture script throws if either moves.

Two states that a blank cell destroys are shaped differently rather than coloured differently:

- **`PRAXIS DESK` was never priced** → an amber **ring**, a hole where the mass should be, at a
  reference size that encodes nothing. Its days ARE known, so it still sits on the movement axis.
- **One deal is in a compartment that may not be read** → a dull steel **sphere**, floating 0.30 m
  above the top of the movement axis rather than at the top of it. Parking it at the rail would assert
  the freshest possible reading about the one deal nobody is allowed to check.

Both are excluded from every throughput figure, with the code `AGGREGATE_EXCLUDES_UNREADABLE_VALUE`, so
the streams are honestly light by whatever those two are worth rather than silently estimated.

## Two defects in `@lcx/gl`'s particle layer, found by a subtraction

`readState()` exists so a claim about particles is a number. It returned **812 alive against an
analytic steady state of 592**, with **241 of them outside the channel**. No screenshot of a particle
cloud can show either.

**1 · The dead sentinel parked nothing.** `particles.ts`'s own header said "a dead particle is PARKED,
not left drifting". It was not. Death wrote `age = -1`, and the next frame recomputed
`age = st.w + uDt` from that sentinel, found `-0.983 > life` false, and fell through to the integrate
path — so the corpse kept drifting invisibly with its age climbing back toward zero and **resurrected
about a second later**, wherever the flow had carried it by then. Those were the 241. The park is now
explicit, after rebirth so a slot can still be reused, and before integration so a corpse stops moving.

**2 · Lifetime was read out of the current frame's emission ranges,** so it only existed for sources
that happened to emit on that frame. Every source here has a rate under one particle per frame — which
is the normal case for a rate derived from a real quantity — so most frames left the array without the
entry and every particle belonging to that source fell back to a hard-coded `life = 1.0`. Lifetimes
were a function of emission jitter. Lives are now their own uniform, uploaded for all eight sources
every step. After both fixes: 954 against 956.

The layer's rule is *a particle is a unit of something*. Here one particle is **$800 of package value
crossing that gate**, at one second of simulation per day of pipeline, and velocity is held CONSTANT
across all five gates so that linear density — `rate / speed` — is proportional to dollars per day and
to nothing else. Two visual variables for one reading would leave neither recoverable.

## The framing errors, and the counts that caught them

**1 · The eye was outside the channel and the largest object was off frame.** `sin 19° × cos 12.5° × 8.0`
is 2.54 m from the centre line; the wall stands at 1.54. The whole first capture was shot over the right
wall from outside it, and the `SIGNED` deal — the biggest object in the scene — sat 58° off the view axis
with **its tag reported as SHOWN**. `projectQuad` was right: every corner was in front of the camera and
front-facing, which is all it claims to check. Nothing was counting *framed*. `objectsOffFrame` now is,
on the OBJECT rather than its label, and it is fatal in the capture.

**2 · The stage length and the legibility limit collided.** Five stages at 2.8 m put the intake deals
15.4 m out against a `LEGIBLE_M` of 13.5, so the first camera that framed the near end correctly dropped
the label off **every deal in SOURCED** — four of twelve — and the frame looked composed. The channel is
now 2.2 m per stage: both ends fit inside one lens and one legibility limit.

**3 · Depth and height both map to screen y, and they cancel.** The first same-stage pair measurement
returned **13 px for two deals whose heights differ by 0.51 m**: the further one was also the lower one,
and the camera's tilt undid most of the difference. Three consequences, all kept: the slot pitch came
down from 0.58 to 0.38 m, the primary proof became the per-deal fall (no depth term), and
`settleInversions` counts pairs where a stalled deal projects *above* a fresher one in its own stage —
which is worse than showing nothing. It is 0, and it is fatal if it is not. The residual confound is
real and reported: the same-stage pair separation is **24 px in SOURCED** against 56–71 px elsewhere.

**4 · The elevation is bounded from both sides.** The horizon sits at `tan(elevation)/tan(fov/2)` in
NDC, so at 10° a quarter of the frame is empty space above a channel with no sky and no ceiling to put
there. Tilting down fills the frame, and every degree of tilt also maps depth more strongly into screen
y — the confound in defect 3. So the ceiling on the elevation is not aesthetic, it is
`minSeparationPx`. 14° is where that measurement still passes.

**5 · Perspective confounds the mass axis, and here is the count.** Size means value and distance also
means size. `massAmbiguousPairs: 2` — two pairs where the more valuable deal projects smaller than a
nearer, cheaper one. `massAmbiguousWithinStage: 0`, because within a stage the depths are close enough
that the comparison is sound. Volume is proportional to value (`edge ∝ value^(1/3)`, 0.13 m to 0.46 m)
rather than being an eye-pleasing ramp between two chosen sizes, which is why the small end is
perceptually weak and why every readable deal also carries its number in the DOM.

**6 · The fog erased the room it was giving depth to.** Solving `1 - exp(-d·15.5) = 0.90` — 90%
converged at the intake wall — left the NEAREST deal already 50% fogged and drove the floor and walls,
whose albedo is close to the fog colour, to indistinguishable black across the whole frame. The capture
was five luminous gates and six cubes in a void, with no channel. It is now `ln(2)/LEGIBLE_M`, so the
haze reaches half exactly where a tag stops being a word: **one** distance rather than two. Fog runs
0.21 at the nearest deal to 0.49 at the furthest, and the capture throws if that spread closes.

**7 · The key light lit the half of the room that was not in shot.** First it was overhead —
`(0.42, -0.66, -0.62)` puts two thirds of the direction straight down, so an almost-black floor
rendered as the palest thing in the frame and every object read as a dark shape on a bright plane. Then
it was grazing but arriving from the left, and the eye stands right of the centre line, so every surface
it can see — the left wall's inner face, the deals' right-hand faces — was the surface facing away from
the source. Negating x fixed a frame that a darker albedo could not have.

**8 · A membrane across a channel is a wall.** §2 asks for a luminous membrane across the aperture; a
thin box spanning it is exactly that and it is opaque, so five in a row make the channel a wall and
nothing past the first gate exists. The gate is now its EDGE — two posts and a floor sill as lit
geometry, plus an additive outline on the full rectangle. The lintel survived one round longer and had
to go too: 10 cm of bar blocks nothing at its own depth, and five of them under a 14° tilt laid five
dark bands across the deals *behind* them, because a lintel 2 m nearer than a deal projects lower than
its own height. The capture read as scaffolding with cubes between the beams.

**9 · Three annotation layers collided, and every count said they were fine.** Five gate labels at one
height converged toward the vanishing point into an illegible stack while `gateLabelsOffFrame` reported
0 — true and useless. All three movement-axis ticks were on the right wall at the nearest gate, where
the eye cannot see that face: `axisLabelsOffFrame: 3 of 3`, capture looked complete. And the `SIGNED`
gate's throughput printed straight through the `ATLAS OTC` tag, because deal tags are inside the
occlusion test with each other and a screen-space annotation is not in it at all. Fixes, in order of
how much they generalise: gate labels alternate sides and are placed near-to-far with a **30 px
crowding refusal** that names the gate whose number it suppressed; the axis moved outboard of the wall at
the TERMS gate (a ruler beside the space, not drawn across it); and the gate labels are anchored at
y = 2.10, above the tallest tag the scene can produce rather than above the gate.

### 9b · The axis fix was not a fix, and this is the sharpest instance of the whole pattern

Moving the axis outboard of the **left** wall took `axisLabelsOffFrame` from 3 to 0, and this file
recorded it as fixed. It was not. The camera stands right of the centre line — azimuth 9° puts the eye at
x = +1.24 — and the left wall is a solid slab from y 0 to 1.25, so **every ray from the eye to a
left-outboard tick passes through it.** All three ticks were occluded. The labels floated with nothing to
anchor them, and the count reported 0 because it only ever tested *frame bounds*.

**The number changed and the visibility did not** — in the fix for a previous instance of exactly that
failure. A count that cannot see occlusion is not a weaker check than the eye; on this evidence it is
worse, because it produced a written claim the capture contradicted.

The axis now sits on the side the eye is on, chosen from the sign of `eye[0]`. That makes occlusion by a
channel wall impossible **by construction** — tick and eye are on the same side of both slabs at any
azimuth — rather than unlikely by measurement, and the report states `axisSide` and `axisOnEyeSide`
instead of a bounds count. A guarantee is the right answer here precisely because the measurement was the
thing that lied.

**Residual, and not fixed:** the capture now shows tick strokes at `0d` and `20d` and **none at
`45d+`**. Two of three. The `45d+` tick sits at rail height where the floor slab passes outboard of the
wall, and the honest reading is that it is occluded by the floor rather than by the wall — the same class
of fault, one surface along. It is recorded rather than guessed at, because guessing is what produced
9b.

**10 · `$1,600` printed on the frame as `$2k`.** `Math.round(1600/1000)` — a formatter written for deal
values, applied to the constant that *defines what one particle means*. A 25% error in the frame's own
legend.

**11 · Tag stagger made occlusion worse before it made it better.** Alternating tag heights by slot
parity separated slots 0 and 1 and pushed slot 1 into the band belonging to the stage in front:
occlusion refusals went from 4 to 5. Offsetting each tag 0.45 m outboard toward its own wall gives the
two lanes disjoint horizontal bands, so lane-to-lane collision at a shared depth is impossible rather
than unlikely. Down to 3.

**12 · The withheld object was the brightest thing in the frame.** Steel at roughness 0.28 / metalness
0.58 under a sky environment put a hard specular highlight on the one object whose entire message is
that there is nothing here for you to read.

## Three defects inherited from the template, not repeated here

Reading E6's `entry.ts` closely enough to copy its structure surfaced three things it gets wrong. None
of them is visible in a capture.

- **`plane(size, segments)` is SQUARE.** E6 calls `plane(6, CORRIDOR_LEN)` and gets a 6 × 6 floor with
  44 subdivisions under a 44 m corridor — its fog and its darkness hide the shortfall. E3 builds the
  plane at the channel's width and stretches z in the model matrix, which is safe here only because the
  plane's single normal is +y.
- **`normalMat: N3` on a rotated mesh is wrong.** E6 hands the identity 3 × 3 to twenty-five *yawed*
  record slabs, so their normals are lit as though they had never been rotated. E3's boxes are
  axis-aligned, and the one rotated mesh — the absent-value ring — gets the rotation as its normal
  matrix, which for a pure rotation is its own inverse-transpose.
- **AO's `near`/`far` disagree with the projection.** `viewProjection` defaults them from the orbit
  distance, so E5 and E6 both hand the AO pass a hand-written pair their own cameras do not use, and the
  occlusion radius then means a different number of metres than it says. E3 pins `near`/`far` in the
  `Viewpoint` and passes the same two constants to AO.

The §6 ratchet in `packages/gl/src/env/harnessRules.test.ts` — added by another lane while this was
being built — also caught that E3 had no flat fallback and never called `assertBrandFidelity`. Both are
now in, and `refused.png` photographs the first.

## What is not done

- **§7(b) is not timed.** Nobody has been sat in front of the channel and `BdPipeline` with a task and a
  stopwatch. Everything above is about whether the frame carries the reading, not about whether an
  operator gets their answer faster.
- **8 of 12 deals carry a label** — `{OCCLUDED: 3, WITHHELD: 1}`. Three of those are real losses, and
  the fix is more channel length per stage, which collides with the legibility limit in defect 2.
- **The depth confound is reduced, not removed.** 24 px of same-stage separation in SOURCED is thin, and
  the honest reading there is the colour ramp rather than the height.
- **There is no wake, so §2's "velocity" is only in the height.** A trail behind a moving deal runs
  ALONG the channel and therefore slants through depth, and `ruleAtDepth` explicitly refuses to fake
  that — it needs a billboard normal per vertex, which is a spine request rather than a local hack.
- **Screen density is not linear density.** Point size divides by w, so no `pointScale` makes the
  perspective streams comparable at both ends of the channel: 30 made the near stream 15 px blobs
  reading as dust, 8 put the intake stream under a pixel. It is 18, and the throughput is printed as a
  number at every gate because of it.
- **Particles take no fog.** The additive pass has no fog term, so a particle at the intake is as bright
  as one at the close while every surface around it has faded. The streams therefore disagree with the
  architecture about distance.
- **Volume-encoded mass is weak at the small end.** $95k is a 0.13 m cube, 13 px on screen at 11.7 m.
  Honest and hard to compare; the label is doing the work there.
- **The architecture is thin.** A floor, two walls, five portals. No recesses, no reflections, no depth
  of field. It reads as a channel because of the gates and the fog, not because of the building.
- **Real-hardware timing is UNMEASURED,** and the software number is noisy: the same build measured
  **39.2 to 54.4 ms** across nine runs under SwiftShader on a machine doing other work. Quoting a single
  figure would be quoting the run that happened to be quietest.
- **`type-check:3d` does not cover this directory.** It points at `docs/3d/p1` only, so `entry.ts` is
  checked only by `npx tsc -p docs/3d/e3/tsconfig.json`, which is a gate nothing runs for you.
- **The deals are synthetic**, said on the frame in amber and in the flat table's notices. The shape is
  deliberate — a funnel, value skewed to two names, the two largest late-stage deals stalled — because a
  uniform spread would make the headline figure true by construction rather than by measurement.

## Cost

| | |
|---|---|
| frame time | **39.2–54.4 ms** at 1200×720, 60-frame batches, same build |
| renderer | SwiftShader (software), HDR float targets available |
| 60 Hz headroom | **REFUSED** — `SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET` |
| real-hardware time | **UNMEASURED** |
| triangles | 5,764 · shadow map 1536² · 2,048 particle slots |

The first working build measured **952 ms/frame**. Two things: a `plane(2.9, 96)` floor is 18,432
triangles of flat deck rasterised three times a frame for no additional shading detail (40 segments now,
5,764 triangles total), and roughly 220 resurrected particles were each still paying a full curl
evaluation. 952 → 40 was one geometry constant and one engine bug.

## Reproduce

```bash
node docs/3d/e3/build.mjs && node docs/3d/e3/capture.mjs
npx tsc -p docs/3d/e3/tsconfig.json
```
