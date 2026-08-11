# E6 · THE VAULT — status: **READS. Six framing errors, every one caught by a count.**

`live.png` is the gate. `no-fog.png` (`?fog=0`) is the control, and it is the capture that shows what
the honesty costs: every record, including ones no reader could resolve, presented at full contrast as
though it were available.

## The reading a table cannot give

| | |
|---|---|
| readable to | **4.0 d** |
| visible to | **19.3 d** |
| scale | 12 h per metre |
| fog | 0.33 at the nearest record → 0.99 at the furthest |

Those are two **different horizons** and the frame reports both. A table says "25 rows"; the vault says
*you can read four days back, you can see shapes for nineteen, and past that there is nothing.* That
distinction is the environment's whole justification, and reporting only one of the two numbers would
claim either more reach or less than it has.

Two more things depth-as-time gives that the table destroys:

- **A withheld record is visibly present.** In a table a row you may not read either shows or is
  absent, and both look like an empty result. Here the slab is lit, at its own moment in time, steel
  rather than blue or red — because giving it either verdict colour would assert a finding nobody is
  entitled to. You can see that something happened then and that you are not being shown it.
- **Density is shape.** Four blocked actions in one afternoon are a visible *stack* at one depth.
  Sorting a table by verdict finds the same rows and loses when they happened.

## Six errors, and the count caught every one

The capture looked plausible after most of these. None of them was found by looking.

**1 · The five newest records were behind the camera.** `CORNER_BEHIND_CAMERA: 5` — the eye sat level
with the corridor mouth, so the three-hour-old record was *beside* the viewer. A "records receding into
fog" composition fails at the near end first, and the five it dropped were the five an operator opens
this surface to see.

**2 · Records were wall plaques, so 16 of 25 were edge-on.** Mounted flat, a record's normal points
across the corridor at the centre line — where the reader stands. Turned to 0.42 of a right angle
instead, which is how signage in a real corridor is hung: angled at oncoming traffic, not parallel to
it. The same trade E1's `FACE_FRACTION` makes.

**3 · A nearly edge-on element broke the screenshot.** `projectQuad` correctly accepted records whose
every corner was in front of the camera and front-facing, but whose projected width collapsed toward
zero — so the homography's coefficients grew without bound and the element's transformed box ran to
millions of pixels. Playwright then failed with *"Unable to capture screenshot"*, naming the screenshot
rather than the transform three layers away. Two fixes: `overflow:hidden` on the overlay so a
projection can never extend the page box, and a 26 px minimum projected width (the same floor E5
settled on).

**4 · A cluster was a pile.** At 26 h/m the four blocks at 44–47 h spanned 0.115 m while each record is
0.62 m wide: five records deep in one slot, text over text — and the "density is shape" claim above was
the thing it destroyed. The scale doubled, and clusters now **stack upward**. Depth stays strictly
linear in time; the collision is resolved perpendicular to it, so four blocks in one afternoon read as
a stack of four at one depth. That is not a workaround for the overlap, it is the clearest statement of
what the overlap meant.

**5 · A daylight sky was lighting a sealed vault.** `skyColour` is a daylight environment and a floor
plane's normal points straight at its zenith. At `ambientGain: 0.86` the floor and ceiling became two
glowing wedges brighter than the key light, open sky showed through the corridor's far end, and the fog
— the entire point of the environment — was invisible against it. It read as a bright tunnel. Now: no
sky backdrop, clear to the fog colour so every surface converges on a value the frame already has, the
far end capped, ambient at 0.46, and the sky kept only as the specular environment for the records'
sheen, which is the part of it that was doing real work.

**6 · A 46° lens cannot make a "deep architectural space".** Three framings were measured. Close and
wide clipped the newest record's own text; far and wide made every record too small. Neither was a
distance problem: a wide angle on a 2.7 m corridor throws the walls past the frame edge, so the
architecture arrives as two dark wedges rather than as a space, and the depth it exaggerates is what
shrank the far records. At 33° the walls stay in frame and records hold their size down the corridor's
length.

Plus two smaller ones with the same shape: `campaign.publish` was silently served as `campaign.publ`
by `overflow:hidden` (a truncated identifier in an audit record is worse than no record — the box is
now sized against the longest action present, and `actionOverflow` re-checks it because the next action
someone adds will be longer), and the time origin now sits **3.4 m ahead of the viewer** so "now" is a
wall they face rather than a line they stand on.

## The occlusion test was wrong twice, and the second way is the interesting one

There is no depth buffer in the compositor, so a covered record must refuse to show text — E1's rule.
Both failures reported **zero occlusions against a capture that visibly had them**, which is the most
useful kind of wrong: a test that agrees with the code and disagrees with the picture.

1. **Wrong direction.** Sorting far-to-near is right for *painting*, because a later DOM element covers
   an earlier one. It is exactly wrong for *deciding*: the already-accepted quads are then the ones
   behind the record being tested. The two orders are now separate — decide near-to-far, paint
   far-to-near.
2. **Not symmetric.** Testing only "is a corner of the far record inside a nearer quad" misses the
   commonest case, where a large near record covers the **middle** of a smaller far one and neither
   quad's corners land inside the other. Checking both directions found 4 real overlaps and dropped
   shown records from 12 to 8. That is the honest cost, and it is reported by reason rather than
   absorbed.

`hiddenBy: {OCCLUDED: 4, EDGE_ON: 7, WITHHELD: 3, BEYOND_LEGIBLE_RANGE: 3}` — four reasons, never
summed, because an operator does something different about each. "17 hidden" is useless; that line is
actionable.

## What is not done

- **§7(b) is not timed.** No operator has been put in front of the vault and the table with a task.
- **7 records are still edge-on** and 3 are beyond legible range, so 8 of 25 carry text. The corridor
  wants either more length per hour or records that turn to face the reader as they approach.
- **The architecture is thin.** Walls, floor, ceiling and an end cap — no volumetric shafts, no
  recesses, nothing that earns the word *vault* beyond the fog. §2's "deep architectural space" is
  half-delivered.
- **Records are synthetic**, said on the frame in amber. The shape is deliberate — far more allows than
  blocks, blocks in clusters, some compartmented — because a uniform sprinkle would exercise none of
  the code that matters.

## Cost

0.425 ms/frame at 1200×720 under SwiftShader; 16.18 ms of headroom against the 60 Hz budget.

## Reproduce

```bash
node docs/3d/e6/build.mjs && node docs/3d/e6/capture.mjs
```
