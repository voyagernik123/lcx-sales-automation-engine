# E4 · THE ORRERY — status: **THE CROSSING CLAIM HOLDS AND IS CAMERA-INDEPENDENT. §2's "compartment you fly into" is not built, and §7(b) is not timed.**

`live.png` is the gate. `flat.png` (`?flat=1`) is the control, and it is the whole argument: the same
eleven entities, the same shells, the same strengths, every inclination set to **zero**, camera looking
straight down — which is the node-link diagram this replaces. `no-shadow.png` and `no-ao.png` are the
two passes that carry the depth reading.

## The number this is entitled to exist on

A drawing in a plane has two axes and must spend both on layout, so once it also encodes relationship
distance as radius and kind as angle it has nothing left with which to keep edges apart — and edges
cross. A crossing in a plane is not untidiness: both edges occupy the same pixels at the same depth, so
two relationships become four possible relationships.

| | flat layout | orrery |
|---|---|---|
| crossings, in the layout's own plane | **7** | — |
| crossings on screen, at the capture camera | 7 | **3** |
| crossings on screen, worst of 36 azimuths | — | **18** |
| **crossings the reader cannot resolve** | **7 of 7** | **0** |
| minimum separation at a crossing | **0.0000 m** | **0.2845 m** |
| pairs of link tubes that graze in 3-D | 7 | **0** |
| best result over 120,000 angular orderings | **1 crossing** | — |
| links passing through an unrelated body | 1 (`TOKEN~SETTLEMENT` through `PARTNER`) | **0** |

Read the fourth row against the third. **The orrery has MORE crossings on screen than the flat layout
has in its plane** — up to 18 of them — and that is stated rather than hidden, because it is not the
claim. The claim is that none of them is ambiguous, and it is proven without reference to a camera:

> Two tubes can only fuse into an unreadable X if their **minimum separation in 3-D is less than the
> sum of their radii**. That quantity does not depend on where the camera is. It is 0.2845 m here
> against a largest radius sum of 0.172 m, so `grazingPairs3D` is **0** — and therefore **no viewpoint
> whatsoever** can produce an ambiguous crossing. The 36-azimuth sweep is the empirical check on that
> proof, and it agrees: worst-case ambiguous count 0.

The same routine run on the flat layout returns separation **exactly 0** for all 7 crossings, so
"every flat crossing is ambiguous" is measured rather than assumed. And `flatBestOverOrderings: 1`
answers the obvious objection: over 120,000 random permutations of the angular positions (322 ms) the
best the flat layout ever managed was **1** crossing, never 0. It cannot reorder its way out.

## What each axis is spent on, and what it measures

| encoding | axis | measured |
|---|---|---|
| relationship distance from the core | orbital **radius** | hops, by breadth-first search over the same 13 relationships that are drawn — not authored |
| record count | body **size** | log₁₀, radius 0.26–0.651 for 9 → 22,806 rows |
| entity kind | orbit **inclination** | 4 planes: 0° / 34° / −29° / 62°, plus varied ascending nodes |
| relationship strength | tube **thickness** | 0.29–0.92 → **2.19 px to 9.14 px on screen** |
| height above the reference plane | its **shadow** | the gap between a body and its own ellipse |

Hops are computed, not typed: add an edge and the shell moves. `unreachableEntities` is `[]`, and an
entity the search could not reach would **refuse** a shell rather than be parked on the outer ring.

Thickness is reported in **screen pixels**, not metres, because a 2 cm tube is not an encoding if it
lands on half a pixel. Same for the rings (`ringPx: 2.7`) and the bodies (`bodyPx: 26 … 60.3` against a
9 px floor).

**The kind is deliberately NOT printed on the labels.** If it were, a reader would never need the
planes and inclination would be decoration — the third axis would carry nothing. The kind is read from
which plane a body sits on, and the four plane labels are the key. That is a real cost: a reader who
cannot trace a ring loses the kind. It is the cost that makes the encoding load-bearing.

## Three states, three shapes — because size IS the value here

| state | count | rendered as |
|---|---|---|
| observed | 9 | sphere, brand blue, radius on the log scale |
| **absent** (never measured) | 1 | hollow amber **ring**, axis aimed at the reader |
| **withheld** (measured, may not be shown) | 1 | sealed steel **drum**, and **no label at all** |

A body with no observed count still has to be visible, and **there is no honest size for it**: any
radius sits somewhere on the scale and therefore asserts a count. The resolution is not a cleverer
number, it is to leave the scale — a ring and a drum are not spheres. This is imperfect and the report
says so: `absentOuter: 0.455` and `withheldOuter: 0.3` both fall inside the observed range 0.26–0.651.
A reader who reads their extent as a record count is misreading a shape the legend explicitly excludes.

`COMPARTMENT` carries no label because a label is precisely what the reader is not cleared for. It is
lit, on its own orbit, casting its own shadow — you can see that an entity is there and that you are
not being shown what it is, which is the actual state of a need-to-know compartment and the thing a
table destroys by either showing a row or not.

`JURISDICTION~PERSON` exists and its strength was never measured, so it is drawn as a line of **pips**:
visibly present, visibly not on the thickness scale, because a sphere is not a tube. Drawing it at the
minimum thickness would assert a weak coupling nobody observed; omitting it would assert no
relationship.

## The defects, and what each one taught

**None of these was found by looking at the frame. Every one was found by a count, or by a zoom into
the pixels after a count said the frame was fine.**

**1 · Nine orbit rings cast nine shadows, and a shadow of an axis is an axis.** The plate came back
covered in concentric ellipses that looked exactly like more orbits, so the frame appeared to have
twice as many shells as the ontology has. Then the links came out of the caster list too — their
shadows were near-vertical black stripes, and a dark stripe on a plate covered in tubes reads as
another tube. The shadow pass now has its own draw list: **bodies only**, eleven clean ellipses. That
is a statement about what the shadows are for, not an optimisation.

**2 · The rings were sub-pixel and I diagnosed it as a colour problem.** A 1.4 cm tube at 22 m is
**1.2 px** — anti-aliased to a smear. I had picked 1.4 cm by eye and then spent a pass on the ring
colour. 3.2 cm is 2.7 px, and `ringPx` is now in the report so the next camera move cannot quietly
lose the structure the whole radius encoding is read off.

**3 · The withheld drum was nearly black, and it was a material error.** A metal has no diffuse term —
it shows its environment — and the environment here is `DEFAULT_SKY`, a dark interior whose zenith is
0.012. At `metalness: 0.58` the one body whose entire job is to be *seen and not read* was the hardest
thing on the frame to find. Steel that reads as steel in a dark room needs the diffuse term: 0.15.

**4 · The absent ring was a horizontal torus, so it was a 3-pixel sliver.** `torus` lies in the XZ
plane; at a 26° camera an unrotated ring is edge-on. Its axis now aims at the eye — the same measured
facing E1 and E6 use, and for the same reason: a facing derived from a convention can be backwards,
one aimed at the camera cannot. That fix created the next one: a camera-facing torus is lit only along
the top of its tube, so a thin tube took almost no light. The tube went from 6 cm to 11.5 cm.

**5 · Two bodies merged into one silhouette and no number would have caught it.** Depth resolves an
ambiguous *link* crossing, because one tube visibly passes in front of the other. It does **not**
resolve two spheres whose discs overlap: the nearer eats the further one's outline and the pair reads
as one body with a lump on it. Size is an encoding here, so a merged silhouette is a **misread record
count**. `PARTNER/CAMPAIGN` overlapped by 13 px at the original azimuth. There is now a
`bodyOverlapsOnScreen` count, the azimuth sweep counts merges at every 10°, and **the camera's azimuth
is chosen from `cleanAzimuths`** — 11 of the 36 positions have no merges, and 34° was not one of them.

**6 · A link passed straight through a body it had nothing to do with.** `LISTING~TOKEN` through
`CAMPAIGN`, caught by `linksThroughBodies` and not by the capture. A link through a body hides the
body, and a hidden entity is the failure this layout exists to avoid. `CAMPAIGN` moved from 288° to
258°; the orrery is now 0 and the flat layout still has 1.

**7 · Five annotation collisions, from four systems each individually correct.** `3 HOPS` on `PERSON`,
`CONTROL 62°` on `COUNTERPARTY`, `EVENT −29°` inside `QUEST`'s box, and in the flat control
`INSTRUMENT 0°` printed straight through the legend's `RECORDS ABSENT · 1`. Every subsystem was testing
against its own kind and nothing against the others. There is now **one obstacle set, filled in
priority order**: HUD and legend first (they are the key to every encoding — a plane label that lands on
the legend has destroyed the legend to say one word), then the plane labels, then the hop labels, then
entity labels nearest-first with **four candidate placements** each. 10 of 11 labels are placed; the
one that is not is the withheld compartment, by design.

**8 · Label boxes were estimated at `chars × 6.6 px`, and 6.6 is wrong for 9.5 px type with
`letter-spacing: .08em`.** `SETTLEMENT`'s second line wrapped and the capture showed the word `REC`
alone on a third line. Worse: the collision test was then certifying an arrangement of boxes that were
not the boxes on screen. There is a browser here; it knows exactly how wide the text is. Every box is
now measured with `getBoundingClientRect`, which removes the class of error instead of tuning the
constant.

**9 · The plate caption ran diagonally down the frame, then got stretched, then got cut in half.**
Three separate faults in one element, and it is the only piece of *content on a surface* here so it is
the only one using `projectQuad`:

- It was axis-aligned in world space, so at a 60° azimuth it projected as a rotated parallelogram and
  its text ran on the diagonal. A correct transform producing text a reader tilts their head for is
  E5's lesson arriving from a new direction. Text on a floor is oriented to the **reader**, like a
  stage marking, so the plate is now built on the camera's own horizontal basis.
- The element was sized to the projected **bounding box**, which for a rotated quad is nothing like the
  quad: a 4.2∶1 plate measured 496 × 274, so the homography stretched 12 px type by 1.8× in one axis.
  Sized to the mean projected **edge lengths** instead, the source box has the quad's own aspect and
  authored pixels are rendered pixels — which is what makes a 26 px floor mean anything on both axes.
- Pulling the camera from 25 m to 22 m pushed its near edge past the bottom of the canvas, and
  `overflow:hidden` silently served **half a caption** with every number in the report still correct.
  There is now an on-frame test, and every refusal falls back to a screen-space caption with the reason
  reported (`plate.mode`) — E5's pattern, so a camera that does present the plane gets the projected
  version back without anyone remembering to re-enable it.

**10 · The AO pass is worth almost nothing here, and I only know that because I measured it.**
§6.3.3 assigns L2.7 to E4, so it runs. "The AO is on" is the easiest claim in the file to make and not
deliver — a broken pass, a wrongly linearised depth, or an occlusion term multiplying a near-zero
ambient all produce a complete, plausible frame with no error raised. So the page renders the frame
twice, with and without, and compares it pixel for pixel:

| | |
|---|---|
| largest change to any pixel | **21** of a possible 765 (three 8-bit channels) |
| pixels changed by more than 6 | **3,765** — **0.44%** of the frame |
| mean pixel value, with / without | 28.05 / 28.10 |

That is the pass at its shipping settings (`radius: 0.9, strength: 2.0`, up from 0.5/1.2 after this
measurement). It is not broken: pushing the ambient gain to 1.8 with radius 1.2 and strength 3.0 takes
the largest change to 52 over 2.0% of the frame. **The ceiling is structural.** AO modulates the
*ambient* term only; the ambient here is a dark instrument sky at gain 0.52, and a system of separated
spheres in open space has almost no concavities to occlude. **L2.7 does not earn its place in an
orrery**, and `no-ao.png` is a control that shows a 0.44% difference — which is the honest version of
what it shows. Raising the ambient until the pass mattered would be tuning the picture to justify a
layer.

**11 · That probe then found a defect in `@lcx/gl`, and it is one a quality ladder would hit.**
In the `?flat=1` and `?shadow=0` captures the probe came back with a largest change of **739 of 765**
over **96% of the frame** and `glErrorInProbe: 1282` (GL_INVALID_OPERATION); the mean pixel value fell
from 28.3 to **8.67**. Nothing about ambient occlusion can make a frame three times darker.

The cause is the **combination**. `lit.draw` handles a missing shadow map by setting `uShadowStrength`
to 0 and a missing AO texture by setting `uAOEnabled` to 0, but in neither case does it bind anything to
the sampler — so with **both** absent, `uShadowMap` and `uAO` are left pointing at texture units holding
whatever the last pass left there, which after the composite blit is the RGBA16F scene target. Sampling
a float colour target through those samplers is the invalid operation, and its undefined result is what
collapses the frame. Each guard is individually correct; the two together are not. **That pairing is
exactly what a low-end quality tier or a no-WebGL-extensions fallback would select**, so it is worth
fixing in the engine rather than working around here.

The probe now **refuses** in those two modes with `AO_PROBE_REQUIRES_SHADOW_PASS` rather than publishing
739 — a number that measures the driver's complaint while claiming to measure occlusion is worse than no
number. `capture.mjs` throws if the probe ever raises a GL error again.

**12 · A temporal dead zone, one line wide.** `SHADOW_ON` read `FLAT` four lines before `FLAT` was
declared. A page that throws never sets `document.title`, so the harness would have reported a
90-second timeout naming nothing at all.

**Plus:** the legend's dotted-strength row rendered as `">">">">` — `'a' + X + 'b'.repeat(5)` binds
`.repeat` to the last literal only. A 64 m deck filled the frame edge to edge and turned the bodies into
marks on paper (now 26 m, with all four of its own edges visible, reading as an instrument). And the
flat control cast eleven detached shadow discs that read as eleven more entities — a shadow is a depth
cue and a diagram in one plane has no depth to cue, so `?flat=1` has no key light shadow.

**13 · The entity id and its meta line went into `innerHTML`.** Both are strings a real ontology supplies
rather than this file, and `innerHTML` parses its argument: an `&` in an id corrupts the label silently and
a `<` starts an element, on the surface a reader trusts most. The same values already go through `escText`
in the flat table, so the frame and the fallback would have disagreed about the same entity by
construction. They are `textContent` now, per line, and the two plane/hop tick dots are elements rather
than a span of markup — a constructor that takes text cannot be got wrong by the next interpolation, which
is what an escape helper cannot promise. Nothing here has a live ingress yet (`grep -rn 'JSON.parse\|fetch('
docs/3d --include=*.ts` is empty), so this is a fix ahead of the dataset rather than after an incident.

**14 · The labels could not be reached with a pointer.** `project.ts` justifies its own existence on the
grounds that GL text is "unselectable, unsearchable, invisible to a screen reader", and every label sat
inside a `pointer-events:none` overlay: `document.elementFromPoint` at the centre of each one returned the
canvas, and a mouse drag selected the empty string. The container still ignores the pointer — it must not
swallow a gesture aimed at the canvas — and the leaves no longer do. Measured after: a drag inside the HUD
selects `ONTOLOGY AS ORBITS · RADIUS = HOPS · SIZE = RECORDS · TUBE = STRENGTH`.

**15 · `?scale=abc` was reported as a driver fault.** `Math.max(1, Math.min(3, Number('abc')))` is NaN —
neither clamp rejects NaN — so the canvas came out 0x0, `createStage` refused with
`FRAMEBUFFER_INCOMPLETE`, and the reader was told "this driver would not allocate the render targets this
view needs" about a driver that was fine. Numeric parameters now refuse as `BAD_PARAM` by name; `frames`
reports the count MEASURED rather than requested (`frames=0` and `frames=-5` published a one-frame time as
a 0- and -5-frame sweep); and the sweep stops on a 20-second wall clock, because `?frames=1e9` locked the
renderer process hard enough that Playwright could not evaluate an expression against the page.

## The occlusion order, and why there is only one of them here

E6 needed two opposite orders — decide near-to-far, paint far-to-near — and getting them the same way
round is how it reported zero occlusions against a picture that visibly had them. Here overlaps between
committed labels are **refused rather than layered**, so the committed boxes are pairwise disjoint and
DOM order cannot change what the reader sees. The near-to-far decision order still matters: it decides
who wins the contested pixels, and the answer is the nearer entity.

The overlap test is a rectangle intersection, which is **symmetric by construction** — E6's second
occlusion bug was a corner-containment test that missed a large near quad covering the *middle* of a
small far one with neither quad's corners inside the other. An axis-aligned box test cannot have that
failure, which is why it is the right tool for constant-size labels.

The 26 px projected-width floor does **not** transfer to the entity labels, and that is argued rather
than skipped: an entity name is *annotation of a body seen from outside*, and a world-space billboard
would be sized by the body — 1.3 m beside a 0.4 m sphere is 58 px wide here, so its type would render at
3 px, and enlarging the billboard until the type worked would make the labels bigger than the system
they annotate. So the labels are constant-size, and the legibility floor moves to the **subject**: a
body under 9 px across is an anti-aliased dot and a name attached to it names a smudge. The 26 px floor
is applied where it belongs — the one element that is content on a surface.

## What is not done

- **§2's "a compartment you fly into" is not built.** There is no camera motion and no interaction of
  any kind. §6 rule 2 forbids idle animation and the capture is a single frozen orbital phase, which is
  said here because a still of an orrery invites the assumption that it turns. It does not.
- **§7(b) is not timed.** No operator has been put in front of the orrery and `OntologyExplorer` with a
  task and a stopwatch. The precondition is stronger than E5's or E6's — the flat baseline is computed
  from the same data on every run, so the two are provably the same graph — but nobody has been timed.
- **The flat baseline is my construction of the flat layout, not the shipping component.** It is this
  layout with the inclinations zeroed, which isolates the one axis under test and is generous about
  ordering (120,000 permutations). It is *not* a measurement of `OntologyExplorer`, whose real edge
  routing I have not read. Whether that component's layout does better than 1 crossing is unmeasured.
- **The merged-silhouette guarantee is camera-dependent** in a way the crossing guarantee is not. 11 of
  36 azimuths are clean; at the other 25 some pair of bodies merges. The environment names the clean
  ones and picks from them, but a free camera would need a live count. **The flat layout is clean at all
  36** — it has no depth for a body to hide behind — so a merged silhouette is a cost the third axis
  *introduces*, and it is the one measured respect in which the flat version is safer.
- **AO is on the frame and doing 0.44% of it.** Named above. The layer is assigned, not earned.
- **`@lcx/gl` breaks when the shadow map and the AO texture are both absent.** Found here, not fixed
  here. Named above; `packages/gl/src/env/lit.ts`.
- **Nothing outside the shadow frustum casts.** `extent: 10.5` covers the outermost shell at 7.3 m; a
  body placed further out would silently lose its shadow, and its height would silently stop being
  readable. Not guarded.
- **No fog, no depth of field, no particles.** L2.7 (AO) is the assigned layer and is the only optional
  pass used. The system floats in a flat clear colour; the plate and the shadows are the whole spatial
  frame.
- **The data is synthetic**, said on the frame in amber. The shape is deliberate — four orders of
  magnitude in the record counts so the log scale is necessary, a graph that is not a tree so crossings
  exist at all, one absent count and one withheld compartment — because a uniform star would exercise
  none of the code that matters.
- **The nominal extents of the absent and withheld bodies fall inside the observed size range.** Shape
  carries the refusal; size cannot. Named above rather than hidden.

## Cost — and only one of these three numbers is publishable

| | |
|---|---|
| frame time | **50.9 ms** at 1200×720 (mean of 4 runs of 60 frames; spread 2.5 ms) |
| triangles / draw calls | 39,456 / 54 |
| shadow map | 1536² |
| renderer | SwiftShader (software) |
| 60 Hz headroom | **REFUSED** — `SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET` |
| real-hardware time | **UNMEASURED** |

Measured with the trailing `readPixels` and a warm-up frame. `gl.finish()` returns once the command
buffer is **flushed**, not once the GPU has finished, and that error published two frame times in this
programme that were 140× wrong. The 60 Hz comparison **refuses** rather than being computed: SwiftShader
is a CPU rasteriser, the ratio to real hardware is not a constant, and E0 measured 1.305 ms on an M1
for a scene SwiftShader labours over. Real-hardware timing for E4 is unmeasured; this harness has only
ever run headless.

**The two variant timings are not publishable and here is why.** `?ao=0` measured 41.0, 59.8 and 56.1 ms
over three runs — an 18.8 ms spread on a 50 ms frame, so "AO costs *x*" is a number I do not have.
And `?shadow=0` is reproducibly **slower** than the full frame: 68.1, 69.0, 73.0 ms. Part of that is now
explained by defect 11 above — with the shadow map null the lit shader still runs its 9-tap PCF loop
(only `uShadowStrength` goes to zero) and it runs it against whatever texture is bound to unit 0, which
after the blit is a 1200×720 RGBA16F target rather than a 1536² depth texture. Nine float-target taps
per fragment is a plausible reason for a *slower* frame, but I have not isolated it and I am not going
to publish it as the cause. The control exists to show what the shadows do for the **reading**, and on
that it delivers: compare `no-shadow.png` and see that the bodies have no height.

## Reproduce

```bash
node docs/3d/e4/build.mjs && node docs/3d/e4/capture.mjs
npx tsc -p docs/3d/e4/tsconfig.json
```

`capture.mjs` throws rather than printing if `grazingPairs3D` is non-zero, if any azimuth produces an
ambiguous crossing, if the flat baseline has no crossings to avoid, if a reordering gets the flat layout
to zero, if the thinnest link tube goes sub-pixel, if an entity has no relationship distance, if the AO
probe raises a GL error, or if `glError` is not 0.

`entry.ts` is not covered by the repo's `type-check:3d`, which points at `docs/3d/p1` only — so
`tsconfig.json` here is E7's workaround, under the same strict settings including `noUnusedLocals` and
`noUncheckedIndexedAccess`. **esbuild strips types; a green `build.mjs` says nothing about soundness.**
