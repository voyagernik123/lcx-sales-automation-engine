# E7 · THE STORM — status: **THE INTEGRAL IS THE DATA — verified to 0.00% against the table, but a pixel mixes six days and §2's rotation is not built.**

`live.png` is the gate. There are three controls, and each one exists to show a different thing failing:

- **`no-volume.png`** (`?vol=0`) — the calendar, the day grid, the front's absence, all three day states and
  every count, with no accumulation. This is what a heatmap already gives you, and it is the honest
  baseline E7 has to beat.
- **`no-depth.png`** (`?depth=0`) — the same field with the scene-depth cap removed, which is what
  `env/volume.ts` calls "fog on the lens". **It looks almost identical, and that is the finding**: see
  *What is not done*.
- **`refused.png`** (`?refuse=1`) — §6 rule 1. The same `die` a failed shader compile calls, so what the
  capture shows is the real path: the refusal named above a 28-row table with absent cells named rather
  than blanked.

## The reading a heatmap cannot give

The volume layer has no procedural noise term by construction, so the raymarch does exactly one thing:
integrate an uploaded grid. Front-to-back accumulation makes `alpha = 1 - exp(-tau)` exact, and the grid
is built so the integral across one day of one channel and one band equals that cell's risk times
`RISK_TO_TAU`. So the sentence an operator is told — *the depth of colour here is the total risk between
you and that day* — is a calibration, not a metaphor, and it is checked:

| | |
|---|---|
| accumulated risk → optical depth | **0.70 per risk unit** |
| **axial check, 21 rays** (one per channel × band) | **max error 0.00%, mean 0.00%** |
| τ across the eye sweep | 0 → **2.244** (α 0.894) |
| march | **0.125 m × 128 steps = 16.0 m** reach against a **14.72 m** box diagonal |
| rays truncated | **0 of 884** that cross the field |
| field | 76×42×112 = **357,504 voxels**, min 0, max 1, mean 0.0248, **24.8% non-zero** |
| integrable to | **D12** |
| calendar visible to | **D27** |

`axialCheck` marches the uploaded grid on the CPU with the engine's own exported `rayBoxSlab` and
`marchPlan` — the tested reference the shader mirrors line for line — and compares each ray's optical
depth against the sum of the table. **0.00% is designed, not lucky**, and that distinction matters: the
march step equals the voxel pitch and four voxels divide a day exactly, so the midpoint rule lands on
voxel centres and conserves the integral. It is a ratchet rather than a discovery. Change any one of
those three numbers on its own and it stops being zero, which is what the check is for.

Two horizons, both reported, because reporting one would claim more reach or less than the frame has:
**integrable to D12, visible to D27.** The calendar keeps going for fifteen more days; the accumulated
reading does not.

## The absent day is not a zero, and this is where that gets decided

A density field is a scalar. Zero means *no risk*. There is no value that means *we did not look* — so a
day the monitor did not cover cannot be represented in the volume at all, and writing zero there would
state, in the most convincing way this renderer has, that three unmeasured days were calm.

So the refusal is carried by everything except the density:

| | |
|---|---|
| observed / not measured / withheld | **23 / 3 / 2 days** |
| rendered as | `TILE_PLUS_VOLUMETRIC_MASS` / `FLOOR_HOLE_PLUS_EDGE_RAILS` / `STEEL_LID_ON_INTACT_TILE` |
| floor tiles omitted for absence | **24** |
| week gridlines suppressed for absence | **1** |
| flagged items that landed inside the outage | **9** |
| cumulative reading by state | `INTEGRABLE 13 · DAY_NOT_MEASURED 3 · INTEGRAL_CROSSES_UNMEASURED_DAY 10 · DAY_WITHHELD 2` |

Those four reading states are never summed, because an operator does something different about each: an
outage is a vendor problem, a compartment is a clearance problem, and a day past either is a day whose
total you simply do not have. Three of the four week ticks on the ruler say **NO INTEGRAL** instead of
continuing the scale, because a ruler that looks the same on both sides of a hole is a ruler claiming the
hole is not there.

**Nine already-scheduled flagged items landed on the three unmeasured days.** Their weight is in no cell
of the table and cannot be. The frame says so with a count; the flat fallback says so in a notice above
its own data. That number is why the outage was moved — see defect 8.

## Where the exact reading stops being exact

The clean form of the claim needs a ray parallel to the day axis. A perspective ray fans out and
descends, so it drifts across channels and slides down through severity bands, and its accumulation is a
mixture. Measured over the 884 sweep rays that actually cross the field:

| | max | mean |
|---|---|---|
| lane drift | **1.73 lanes** | 0.50 |
| days spanned | **17.5** | 5.82 |
| severity bands spanned | **3** | 1.46 |

So a typical pixel integrates about six days and one and a half bands, and the worst one crosses the
whole calendar and every band. **The exact instrument for "total risk between you and that day, in this
channel and this band" is an orthographic camera down the day axis — which is a heatmap.** Perspective
buys the presence and costs this. It is a trade, printed rather than glossed — the HUD carries the
measured span on the frame itself, under the operator sentence, because *the depth of colour is the total
risk between you and that day* is exactly true and invites being read as the stronger claim that it is
one channel's total. The axial check verifies the machinery in the form where the mixture is zero.

## Ten defects, and what each one taught

**1 · The vertical profile was a tent, and the check refused it at 8.07% — systematically.** The profile
peaked at each band's centre and fell to its edges. It looks like a plume and it reads as one. It also
under-reported every one of the 21 axial rays by 7.1%, and the cause is a discretisation nobody finds by
looking: *a band's centre falls exactly between two voxel centres*, so the largest value the grid ever
holds is the tent half a voxel off its own peak — 0.9286, not 1. A uniform 7% under-statement of
accumulated risk, invisible in the picture, caught only because the CPU mirror compares against the sum
of the table. The plateau that replaced it is the better statement anyway: **within a severity band
there is no gradation** — ELEVATED is ELEVATED — so a profile peaking in the middle of a band was
asserting a continuum the data does not have.

**2 · The first camera put five sixths of the calendar in the top eighth of the frame.** 15.3° of
elevation with the eye 4.8 m from day 0 is a dramatic angle down a 14 m calendar, and it produced a
capture where day 0 filled the bottom half, days 10–27 were compressed into about a hundred pixels, the
three state markers piled on top of each other because there was nowhere else to be, and a quarter of
the frame was empty floor. **The numbers said it fitted, and it did fit.** It fitted the way a corridor
fits when you stand on its centre line: everything present, nothing readable. At 21.3° the near and far
edges are symmetric about the view axis at ±10.3° inside a 16.5° half-FOV, and the calendar occupies 61%
of the frame's height instead of 15%.

**3 · The low end of the colour ramp erased the calendar.** At 2.2× the brand blue, the baseline
advisory haze — which covers every observed day of every channel, and therefore the whole floor —
contributed about 0.24 of linear radiance against a floor tile whose own colour is 0.03. **Eight times
brighter, at 18% coverage.** The field was not hiding the calendar by being opaque; it was hiding it by
being brighter than it. §2 asks for a front advancing *on a calendar floor*, and a floor nobody can see
is not a calendar.

**4 · The high end clipped to a flat blob.** 2.6× turned nine days of escalating severity into one
white-orange cylinder with no internal structure. Both ends of a ramp are a legibility decision, and
they fail in opposite directions.

**5 · Day gridlines could not exist at all, and it was geometry rather than contrast.** With 6 cm tiles,
a line of sight entering an 11 cm gap at 21° of elevation has to run 15.6 cm to clear a 6 cm edge — so
**no ray through any gap ever reached the void behind the floor.** Every gap showed the lit `+z` face of
the next tile at very nearly the brightness of the tile tops, and the calendar rendered as seven smooth
strips. Thinning the plate to 2.5 cm needs 6.5 cm of run, and the gridline becomes the absence it is
supposed to be. I spent two iterations on tile *colour* before working out that the gap was not showing
what I thought it was showing.

**6 · A week gridline was drawn straight across the hole.** The week-2 boundary falls between day 13 and
day 14 — inside the outage — so a solid full-width rib filled in a third of the one piece of geometry
whose entire job is to be missing. **Same class of error as writing zero into the density**: a
structural element continuing across an unmeasured region asserts that the region is there. Now
suppressed, and counted, because a suppressed gridline is itself something a reader should be told.

**7 · The review-threshold gate was a wall.** A 0.52 m slab at day 8 stands 11 m from the eye: a band a
fifteenth of the frame's height across its whole width, and everything in the lower severity band beyond
it was gone. A threshold is a line in time, so it is now a line of posts on the lane boundaries plus a
low sill. It still occludes — measured — but it occludes eight thin vertical strips rather than the lower
half of three weeks.

**8 · The outage was in a place where it cost nothing.** Days 17–19 is late, deep in the frame, past
everything, and **no flagged item fell into it** — so `flaggedLostToNonObservedDays` read 0 and the whole
apparatus for reporting swallowed signal was untested by its own data. Moved to days 13–15, mid-advance,
where nine already-scheduled items land inside it. Choosing where synthetic data hurts is part of
authoring it honestly; putting the hole somewhere harmless is a way of passing your own test.

**9 · Lane drift was measured on rays that miss the field, and reported 0.00.** The first version took
the two rays at the frame's horizontal edges. Those rays leave the field's x range *before* they reach
its near face, so `rayBoxSlab` correctly returns a miss and there was no drift to measure. Arithmetically
right, completely misleading — the same shape as E6's occlusion test agreeing with the code and
disagreeing with the picture.

**10 · This README's own first line was going to render as a truncated number on another
environment's frame.** E1 reads every `docs/3d/e*/README.md` first line at build time and puts the
verdict on a panel, cutting it at the first `.`, `·` or `—`. The original line began *"the integral IS
the data, to 0.00%"* — so E1's headline would have been **"THE INTEGRAL IS THE DATA, TO 0"**, a decimal
point read as a full stop and a number amputated mid-figure. Exactly the class of defect E1's own comment
about `campaign.publ` warns against, caused by a file that looks like documentation. **A README first
line in this programme is not prose, it is input to another environment's frame**, so the verdict now
puts a clean 24-character clause in front of its first em dash.

Plus three smaller ones. The **absent-gap rails were two faint lines at 16 m**, so each edge now carries
a fence of posts — which also gave the occlusion measurement something to bite on, because raising the
field clear of the floor had left almost no geometry standing inside the volume (`glOcclusionPixels` had
fallen to 3,943, under the capture script's own floor). The legend printed a **hand-picked mauve for the
middle of the ramp**, a colour the renderer never produces, now a gradient bar with severity labelled as
*height* instead. And the occlusion measurement reported **a pixel count alone**, which halved when the
ramp was dimmed without the depth cap doing anything different — the mean and max delta are reported
next to it so a threshold effect cannot be mistaken for the effect disappearing.

## The state key collapsed under forced colours, and the labels were raw HTML

Two defects found by pen-test, both measured:

**`forced-colors: active` deleted the key.** Measured with `newPage({forcedColors:'active'})`, the
OBSERVED swatch `#101B2F` and the WITHHELD swatch `#6B7A99` **both** computed to `rgb(255,255,255)` —
two states, one white square — while the canvas, being a bitmap, kept its dark tiles and its steel lids.
The swatches now carry `forced-color-adjust: none`, because a swatch is a *sample* of a colour the
renderer produces rather than decoration; the label text beside each keeps its forced colours, which is
what the mode exists for. Measured after: both hues survive in both modes.

**The channel and date labels went through `innerHTML`.** `CHANNELS` is a literal today, so nothing was
being corrupted — but E6's identical line, with `action` and `actor` interpolated the same way, turned
`a<b>c` into `ac` and reparented an unclosed tag across a sibling boundary while every assertion in that
harness passed. The three label sites here (channel name, date tag, week-ruler tick) are now elements
with `textContent`, and the ruler's `<br>` is a second block element instead of markup. That leaves no
raw-HTML sink on this frame for a channel list from anywhere else to arrive at.

*Capture provenance, 2026-08-13. `bundle.js` here predates `38c01b1`, which repaired four defects in
`env/lit.ts` — the committed bundle still carries the pre-fix `max(1e-6, PI * d * d)` and no `uShadowTaps`
uniform. **None of E7's readings move on that, and the reason is structural rather than lucky:** the axial
check, the τ sweep, the lane-drift and days-spanned spans and the depth-cap pixel delta are all properties
of the volume integrator, which does not go through the lit shader at all; and of the lit geometry, the
repaired isotropic guard fired only below roughness 0.154 while this scene's materials run 0.52 to 0.84,
with no `anisotropy` anywhere. The one claim that would need re-taking on a rebuild is `glOcclusionPixels`
and its mean/max deltas, because those are framebuffer reads over lit geometry — 3,943 was already under
the capture script's own floor once.*

*RETAKEN 2026-08-14, and the prediction above is the one in this programme that survived a rebuild intact.
All three PNGs are now built against `830d8e6`, so they carry Layer 3 as well as the four repaired guards.
**E7 changed less than any of the five environments retaken in this pass:** the whole canvas moved
**−0.69%** in mean relative luminance and **+0.10%** in saturation, and the near-camera floor band —
which is volume composite with no lit geometry behind it — is **byte-identical, 0 pixels changed**. That is
the structural argument being confirmed rather than restated: an environment whose frame is mostly volume
integration barely notices a change to the lit BRDF. The claim this note flagged for re-taking has been
re-taken and it did move, by very little: `glOcclusionPixels` **8,083 → 8,172 px (0.94% → 0.95%)**, delta
mean **10.0 → 10.2**, max **120 → 121**, and 8,172 is comfortably clear of the floor that 3,943 once fell
under. Every other field printed by the report — `integrableTo D12`, `visibleTo D27`, `totalRisk 24.465`,
occupancy 24.81%, `truncated 0/884`, the axial check at 0% error, the lane-drift and days-spanned spans —
is unchanged to the last published digit.*

One trap avoided by design rather than found: **the volume cannot be drawn into the scene target it
samples depth from.** That is a feedback loop, and WebGL2 does not leave it undefined — it raises
INVALID_OPERATION and draws nothing. The volume renders into its own target and is composited with a
premultiplied source-over blend that does not tone map, because the present pass owns the only tone map
in the pipeline.

## What is not done

- **§2's "rotation" is not built.** There is no rotational term and there will not be one until there is
  a measured rotational quantity, because curl noise over a compliance calendar is weather. "Pressure" is
  interpreted as the accumulated integral, which is the honest reading of it; a *gradient* — how fast
  risk is building, day over day — is not rendered at all and would be the most useful thing to add next.
- **`no-depth.png` looks almost identical to `live.png`.** The depth cap changes **8,083 pixels, 0.94% of
  the frame**, at a mean delta of 10/255 and a max of 120. The claim is true and load-bearing — 108 of
  884 rays are cut short by a solid — but it is *small here*, because the field floats over a floor rather
  than standing among big occluders. The engine's "fog on the lens" warning describes a worse failure than
  this scene can demonstrate, and the control capture is the evidence of that rather than of a dramatic
  fix.
- **9 of 28 date labels carry text**: 15 refuse as `TOO_FLAT`, 3 for the hole, and 1 as `OCCLUDED` — day
  0's floor label is covered by the PAID_SEARCH channel panel standing beside it, which is the occlusion
  test working and still a label lost. Past day 9 the floor is too foreshortened for a legible strip and
  the depth scale falls to the week ruler. More metres per day would fix it and would show fewer days.
- **The colour ramp saturates at 0.714 risk units and 10 cells are past it.** Above that, colour says
  nothing more; height still carries severity and opacity still carries magnitude. The layer's mix is on
  `clamp(density, 0, 1)` and density is fixed by the integral calibration, so this is not tunable without
  breaking the thing that makes the picture the data.
- **The hole reads at the near end and is thin at the far end.** Three days at 16 m is about 30 px of dark
  against a floor that is already dark, so the state is carried by the fence, the pill and the count as
  much as by the gap itself.
- **§7(b) is not timed.** No operator has been put in front of the storm and the heatmap with a task and
  a stopwatch. The precondition is at least settled: `no-volume.png` is the same scene with the
  accumulation removed, so the two can be compared on the same data rather than admired separately.
- **The data is synthetic**, declared in amber on the frame and in the fallback's notices. 39
  hand-authored flagged items plus a per-channel background rate; no generator, no noise.
- **Real-hardware timing is unmeasured.** E7 ships its own `tsconfig.json` and passes it clean under p1's
  strict settings.

  *The rest of this bullet was STALE and is corrected 2026-08-13. It read: "**the repo's `type-check:3d`
  script points at `docs/3d/p1` only** — e0, e1, e2, e5, e6 and e8 entry files are type-checked by nothing
  at all, since esbuild strips types rather than verifying them … the other six are somebody's next job."
  Somebody did it, at `5843108`. `scripts/type-check-3d.mjs` **globs** `docs/3d/*/entry.ts` rather than
  naming one, and an `entry.ts` with no `tsconfig.json` is a hard failure — because silently skipping is
  what let six environments go unverified. It found real bugs on its first run, including two
  temporal-dead-zone throws and an allocated-but-never-drawn sky backdrop in E6. Measured here: **12/12
  harnesses clean**, which is more than the nine environments, because globbing also picked up `s6` and
  `w1`. That is the argument for globbing over listing, and it is why this bullet could go stale in the
  first place: it was a hand-written list of who was uncovered.*

## Cost

| | |
|---|---|
| frame time | **157–272 ms** at 1200×720 over four-frame batches |
| of which the volume | **~110–220 ms** — `?vol=0` measures 50 ms for the same scene |
| renderer | SwiftShader (software) |
| 60 Hz headroom | **REFUSED** — `SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET` |
| real-hardware time | **UNMEASURED** |

The march is 128 steps of a trilinear 3-D fetch plus a 6-step shadow ray in occupied voxels, over the
39% of pixels whose ray crosses the field. The 2,784 triangles are free by comparison. **The spread is
reported as a spread on purpose**: single-frame batches came back at 153 ms and 438 ms on consecutive runs
of the same build, which is why the harness times four frames, and four-frame batches still range across
157–272 ms. A single number here would be a fiction with two more significant figures than the
measurement has.

## Reproduce

```bash
node docs/3d/e7/build.mjs && node docs/3d/e7/capture.mjs
npx tsc -p docs/3d/e7/tsconfig.json
```
