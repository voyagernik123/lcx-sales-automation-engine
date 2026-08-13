# E6 · THE VAULT — status: **READS. Six framing errors, every one caught by a count.**

`live.png` is the gate. `no-fog.png` (`?fog=0`) is the control, and it is the capture that shows what
the honesty costs: every record, including ones no reader could resolve, presented at full contrast as
though it were available.

## The reading a table cannot give

| | |
|---|---|
| readable to | **4.0 d** — *measured*, every run of type at or above 4.5:1 |
| in geometric range to | **4.6 d** — the 13 m distance cut, which is what "readable" used to mean |
| visible to | **19.3 d** |
| scale | 12 h per metre |
| fog | 0.33 at the nearest record → 0.99 at the furthest |
| depth-ruler ticks | 1d 9.4:1 · 3d 8.9:1 · 7d 8.7:1 · 14d 9.0:1 |

Those are **different horizons** and the frame reports all of them. A table says "25 rows"; the vault
says *you can read four days back, you can see shapes for nineteen, and past that there is nothing.*
That distinction is the environment's whole justification, and reporting only one of the numbers would
claim either more reach or less than it has.

**"Readable" is now a pixel read, and for one commit it was a lie.** This table said `readable to 4.0 d`
and the frame printed `READABLE TO 4.0 d`, both taken from `distance > LEGIBLE_M` — a **metres** test.
Measured against the frame's own pixels, the record that SET that horizon carried its header at 2.65:1
and its actor at 2.56:1: below WCAG AA's 4.5:1 and below even the 3:1 large-text floor, in a frame
reporting zero clipping and zero errors. Two things were wrong and both are fixed:

- The horizon is derived from a **measured** WCAG ratio per line of type, composited from the fog-driven
  opacity over the background actually in the framebuffer — the technique 5bcb99a gave E3's axis ticks.
  `BELOW_READABLE_CONTRAST` is now one of the named reasons a record shows no text, and `readableToDays`
  cannot exceed what the pixels support. The capture fails if it does.
- The three lines of a record no longer dim each other. The header sat at 0.66 alpha and the actor at
  0.74 to rank them, on top of the fog's own `1 - 0.75 × haze` — so a line starting at 0.66 crossed AA at
  **nine hours** while the action name beside it was still at 8.6:1 four days back. The type already
  ranks itself by size and weight; fog is now the only thing that dims a record, which is what this
  environment claims fog is for. Records shown: 8 of 25, unchanged, and the same four reasons hide the
  rest.

**The depth ruler was three-quarters invisible and reported as fine.** `rulerOffFrame: 0` was a
frame-BOUNDS count, and the tick colour was `rgba(196,212,240, 0.85 × (1 - haze))`. Measured off the
framebuffer at each tick's own box, that law gave **3.54:1 at 1d, 2.18:1 at 3d, 1.32:1 at 7d and 1.04:1 at
14d** — the last differing from its own background by a maximum of **5/255**, which is nothing a reader
can see. One of four was even close to legible, none reached AA, and the 3d tick sat inside the reading
horizon the same frame was advertising. (An independent pen-test measurement by screenshot differencing
got 3.38 / 1.84 / 1.25 / 1.04 and the same 5/255 — two methods, same verdict.) The ruler is screen space because it annotates the corridor rather than living in it, so
it now takes a constant alpha — fog is a property of the corridor, and fogging an axis label about the
corridor deletes the axis. `rulerTicksUnreadable` reports the ratios and the capture is fatal on any tick
below AA.

*Capture provenance, 2026-08-13. Every ratio in this section is composited over what the renderer actually
put in the framebuffer, and `bundle.js` here predates `38c01b1` — it still carries the pre-fix
`max(1e-6, PI * d * d)` and no `uShadowTaps` uniform. **The ratios survive that, checkably rather than
hopefully:** the repaired isotropic guard fired only below roughness 0.154 and this scene's materials run
0.30 to 0.86, and no material here sets `anisotropy`, so neither repaired branch is reachable from the
vault. The claim that would move on a rebuild is not a contrast ratio — it is anything about shadow
softness, since `?tier=minimum` now resolves to one tap and a hard edge. This file makes none.*

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
far end capped, and ambient cut from 0.86 to 0.46.

*Correction:* an earlier draft of this paragraph said the sky was "kept only as the specular
environment … at a third strength". That was not what the code did. No `sky` option is passed, so
`bindSky` binds the full `DEFAULT_SKY`; the only reduction is the global `ambientGain`, and 0.46 from
0.86 is 0.53× rather than a third. The sky still lights the diffuse term as well as the specular one.
Two wrong numbers in one clause, describing a change I had made myself.

*And the retracted wording is still live in the source — found 2026-08-13, not fixed here.* `entry.ts:538`
reads "sky is still the specular environment for the records' sheen, at a third strength", which is the
sentence above, in the file this README is describing. Correcting the document and leaving the comment is
how the claim comes back: the next person reads the code. `entry.ts` is outside this sweep's remit; the
required change is to that comment, to say that `bindSky` binds the full `DEFAULT_SKY` and that
`ambientGain` 0.86 → 0.46 is 0.53×, affecting the diffuse term as well as the specular one.

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
actionable. Two further names exist and are empty in this frame: `BELOW_READABLE_CONTRAST`, and
`CONTRAST_UNMEASURABLE` for a record whose sample box lands off frame — that one refuses rather than
clamping the read to the frame edge, because an invented ratio is worse than a named absence.

## The two fields this environment exists to show went through `innerHTML`

`action` and `actor` were interpolated raw into an HTML string. With a realistic value — action
`a<b>c`, actor `O'Brien & Sons <ops>` — the unclosed tag was reparented **across the sibling div
boundary**: the action read `ac`, the actor lost `<ops>` silently, and the actor inherited the
700-weight styling that on this frame *means* "this is the action name". Every assertion this harness
owns passed while that was on screen — 25 fallback rows, zero clipped text, no page errors, 8 of 25
shown — and the flat table in the same DOM showed the truth, because it escapes its cells. A frame
disagreeing with its own fallback about what a governed action was is the worst thing this file can do,
and the header comment two lines above the defect argued at length that `campaign.publ` was
unacceptable because "a truncated identifier in an audit record is worse than no record".

The three lines are now elements with `textContent`. Verified on a copy of this harness with those two
values: the panel's own `textContent` is `ALLOWED · 3h ago` / `a<b>c` / `O'Brien & Sons <ops>`, its
`innerHTML` carries `a&lt;b&gt;c` and `O'Brien &amp; Sons &lt;ops&gt;`, and the same fields sent through
as `<img src=x onerror=…>` produced **zero** `<img>` elements anywhere in the page and ran nothing. That
is structural rather than an escape call someone has to remember: a sibling cannot be reparented by an
unbalanced tag in the one before it.

## The verdict key survived `forced-colors: active`; it did not

Under forced colours the browser replaces every author colour and the canvas — a bitmap — keeps its own.
Measured with `newPage({forcedColors:'active'})`, the three legend swatches all computed to
`rgb(255,255,255)`: **three hues, one white square**, while the slabs behind them stayed blue, red and
steel. Colour is the only channel carrying verdict on this frame. The swatches now set
`forced-color-adjust: none` — they are samples of colours the renderer actually produces, which is one of
the narrow cases where the author's colour must win — and the label text beside each one keeps its forced
colours, because that is what the mode is for. Measured after: three distinct hues in both modes.

The same mode used to defeat the fog on DOM text, because recession was expressed in colour alpha, which
forced colours overrides, rather than in `opacity`, which it does not. Every dimming in this file is now
`opacity`, so the reading limit the frame claims survives the mode that a low-vision reader is in.

## Three defects E3's README named against this file, and all three are fixed here

Added 2026-08-13 during a sweep for claims that were true when typed. `docs/3d/e3/README.md` carried a
section titled *"Three defects inherited from the template, not repeated here"* in the present tense, and
every one of them had been repaired in this file — two of them **by the commit that added that section**.
Recorded here so the fix has a home in the file that owns the code, rather than only a retraction in the
file that reported it:

- **The corridor floor.** `plane(size, segments)` is square, so `plane(6, CORRIDOR_LEN)` produced a 6 × 6
  patch with 44 subdivisions under a 44 m corridor — a floor for three metres and void for the rest, which
  under this fog and palette reads as a dark corridor rather than a missing one. It is
  `box(6, 0.12, CORRIDOR_LEN)` since `37c90df`: 12 triangles instead of 3,872 rasterised three times a
  frame to describe a rectangle, and it gains a lit edge where the floor meets the wall.
- **The normal matrix on the yawed records.** Twenty-five slabs were handed the identity 3 × 3 and lit as
  though they faced straight down the corridor — the angled signage this environment's readability depends
  on, shaded as if it were not angled. `normalOf(modelOf(…, p.yaw))` since `37c90df`.
- **AO's `near`/`far`.** This file passed a hand-written `near 0.1, far 60` while its own projection
  resolved to 0.085 and 68, so the depth linearisation and the world-space gather radius were both
  describing a slightly different scene — which reads as the strength being mistuned and sends you tuning
  strength. `nearFarOf(view)` since `5843108`, at `entry.ts:520`.

## What is not done

- **§7(b) is not timed.** No operator has been put in front of the vault and the table with a task. The
  instrument now exists and **covers E6**: `docs/3d/e9/task.html` carries two trials for this environment,
  counterbalanced flat-first. It has never been run by an operator, and a machine-reader attempt was run
  and invalidated itself on four defects, so this remains unmeasured rather than merely unscheduled.
- **7 records are still edge-on** and 3 are beyond legible range, so 8 of 25 carry text. The corridor
  wants either more length per hour or records that turn to face the reader as they approach.
- **The architecture is thin.** Walls, floor, ceiling and an end cap — no volumetric shafts, no
  recesses, nothing that earns the word *vault* beyond the fog. §2's "deep architectural space" is
  half-delivered.
- **Records are synthetic**, said on the frame in amber. The shape is deliberate — far more allows than
  blocks, blocks in clusters, some compartmented — because a uniform sprinkle would exercise none of
  the code that matters.

## Cost — corrected

**This previously read "0.425 ms/frame … 16.18 ms of headroom".** Both were wrong, for the same two
reasons set out in [E5's README](../e5/README.md#cost--and-a-number-i-published-that-was-fiction): a
`gl.finish()` timer that measures command-buffer flush rather than GPU completion, and a 60 Hz budget
comparison that is meaningless on a software rasteriser.

| | |
|---|---|
| frame time | **60.3 ms** at 1200×720 |
| renderer | SwiftShader (software) |
| 60 Hz headroom | **REFUSED** — `SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET` |
| real-hardware time | **UNMEASURED** |

60.3 against a published 0.425 is a factor of 142.

## Reproduce

```bash
node docs/3d/e6/build.mjs && node docs/3d/e6/capture.mjs
```
