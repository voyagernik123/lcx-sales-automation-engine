# E2 · THE GLOBE — status: **CARRIES INFORMATION. §7(b) still unproven.**

`live.png` is the gate.

## What works, and it is a lot

A globe with an atmospheric rim at the limb, a visible day/night terminator, twelve city markers
placed from latitude/longitude by a documented formula rather than by hand, and a polished orbital
ring whose anisotropic highlight travels along the tube. 35,136 triangles, `glError: 0`. Since the rule 4
fix below, the markers also carry projected DOM labels — occluded against the sphere, so a city on the far
side is stated in words instead of floating over the wrong ocean.

*Both of those numbers were wrong here until the capture started reading the report. This file said
"eight city markers" and "32,896 triangles" while the harness reported `cities: 12` and
`triangles: 35136` — twelve are listed in `entry.ts` and the change log four paragraphs below
documents the four that were added. `capture.mjs` printed neither figure, so nothing could disagree
with the prose; it now reads `globalThis.E2` and asserts the claims in this section.*

Its instrumentation is again the strongest part: `centralMeridian`, `subSolar` as a lat/long
string, and `citiesFacing` / `citiesSunlit` / `behindLimb` / `onNightSide` as explicit sets — so a
test can assert that a marker on the far side is NOT drawn in front of the sphere, which is the
defect a screenshot hides.

## Both original problems are FIXED

**1 · THE CORRIDORS EXIST.** Seven great-circle arcs from Vaduz — where LCX actually is — so every
arc is a claim about a route rather than a decorative curve. `arcTube` in `env/mesh.ts` slerps along
the great circle, so no corridor cuts through the planet, and lifts by `sin(pi t)` so each one leaves
and meets the surface tangentially instead of floating with a step at each end.

Lift scales with angular distance, and the report proves it rather than asserting it — the angular
separation is now reported beside the lift, and `capture.mjs` sorts by it and fails on any step that
goes down:

| corridor | separation from Vaduz | peak lift |
|---|---|---|
| London | 7.6° | 0.0245 |
| Dubai | 42.1° | 0.0628 |
| New York | 57.6° | 0.080 |
| Chicago | 64.8° | 0.088 |
| Johannesburg | 75.2° | 0.0996 |
| Tokyo | 85.9° | 0.1114 |
| Singapore | 91.9° | 0.1181 |

Monotonic with distance. A fixed lift would make the London hop a tall croquet hoop.

**2 · THE TERMINATOR NOW SEPARATES SOMETHING.** `onNightSide: ["New York", "Chicago"]`, where it was
empty. Two changes: four cities added spanning the rest of the globe, and — the one that actually
mattered — the sub-solar point and central meridian moved to 60/-15. At 95/30 the night side sat just
off the edge of what the camera sees, so NO number of extra cities would have populated that set.
`behindLimb: ["Mumbai", "Singapore", "Tokyo"]` confirms the occlusion test is real: those arcs curve
over the horizon and disappear.

## 3 · §6 RULE 4 IS CLOSED, and it was never the violation it was described as

E2 was the last environment in the programme breaking rule 4 — "text stays in the DOM, projected from the
same matrix, never baked into a texture" — and `harnessRules.test.ts` pinned the set of environments
projecting nothing at `'e0,e2'` as a ratchet so it could not grow. **That assertion now reads `'e0'`.**

**What was wrong was not baked text. It was NO text**, and the distinction decided the fix. There was
nothing to unbake: `LIT_FRAG` has no texture sampler and `Material` carries no map, which is the same
absence that leaves the earth a plain blue ball. `build.mjs` simply emitted no overlay, and its reason was
a real one rather than an oversight — three sites sit within eight degrees of each other, ~23 px apart at
this camera, "closer than the labels are wide", and it declined to ship text without a collision policy.

So there is a collision policy, and the occlusion problem a globe has and a deck does not:

- **Hidden behind the limb.** CSS has no depth buffer, so a projected label cannot be occluded by the
  sphere in front of it. A site is labelled only where `n·ê > R/L` — **the same dot product the report
  already publishes as `behindLimb`**, reused rather than re-derived, so a label cannot contradict the list
  printed beside it. Tokyo, Singapore and Mumbai therefore get no label; an unguarded projection would put
  TOKYO in the middle of the Atlantic, over the near hemisphere, pointing at nothing.
- **Faded near the limb, and refused at it.** The same quantity normalised is `cosFace`, the cosine between
  the surface normal and the direction to the eye: exactly 0 at the limb, 1 at the sub-view point. The
  thresholds are **derived from a pixel floor rather than typed in as a dot product** — a marker narrower
  than 5 px is not a thing a label can point at, and the marker is 16.9 px head-on at this camera, so
  `cosHide = 5/16.9 = 0.2955` and full opacity at twice that, `0.5911`. Those are **95.4% and 80.2% of the
  projected disc radius**: full strength over the inner four-fifths of the disc, fading across the next
  fifth, refused in the outer 5%. The shipped globe uses `1/CAMERA_DISTANCE + 0.05` for the same job; the
  0.05 was chosen by eye, and this is the number it was standing in for.
- **Nothing is lost to a refusal.** Every site not labelled on the frame is stated in DOM prose under it,
  with its coordinates, its day/night reading, its corridor, and the reason it is not labelled. `projected
  + inWords` must equal `cities`, and both are in the report.
- **Pushed to the rim when the dot is crowded.** Four sides at the marker was not enough, and the first
  version's failure was not subtle: **Vaduz — the hub, placed first precisely so it could not lose — was
  refused on all four sides**, boxed in by London 23 px away and Istanbul on the other side. Six of twelve
  labelled, and the one that mattered most in the prose. A label that cannot sit beside its dot is now
  pushed radially outward past the silhouette, where no marker can be covered because every marker is on
  the globe, and connected back by a 1 px leader.

Measured in Chromium against the real projection and the real font stack: **7 of 12 sites labelled, 5 in
words (3 behind the limb, 2 too edge-on), 2 pushed to the rim** with 67 px and 111 px leaders, no label
overlapping another and none covering a marker. The frame also now carries the **placeholder declaration in
amber**, because twelve real place names on a globe read as somebody's actual network and `CITY_SITES` says
plainly that they are not one — while the frame carried no words, the fallback's notice was enough.

*Those figures are from the algorithm running in a browser against the harness's own camera; the numbers
`live.png` publishes come from `globalThis.E2.labels` once `build.mjs` and `capture.mjs` have been re-run.
`build.mjs` still carries the comment explaining why there is no DOM overlay, and `capture.mjs` does not yet
assert `labels.projected + labels.inWords === cities` — both are outside this fix and both are stale.*

E2 is also promoted into the web app (`apps/web/src/components/market/GlobeRelief.tsx` +
`GlobeReliefGl.tsx`, mounted on `MarketMap`, opt-in and defaulting to the scatter), and that component has
projected DOM labels all along — region names, project and listing counts, market cap, solar time, the hub,
the sub-solar reading and every absence. Until now the harness was behind its own shipped surface. Two
things the promotion could not carry over, and they are data limits rather than rendering ones:
`MarketMap`'s `MapPoint` has **no coordinates at all** — only a coarse `region` string — so the shipped
globe places REGIONS at published geographic centres (EU-27 near Gadheim; contiguous US near Lebanon,
Kansas) and says so on the frame, while this harness's twelve city sites remain placeholders. And the
shipped terminator is computed from the reader's own clock rather than from a fixed sub-solar point, which
is what turns "which desks are awake" into a reading instead of a lighting choice.

## A refusal is now named to the reader, and was not

`createStage` refusing was handled by `document.title = 'REFUSED'; throw` — two statements that never
called `showRefusal`, which is the only code that names a refusal in the flat table and the only code
that hides the dead canvas. Measured in a browser launched with WebGL2 genuinely unavailable: title
REFUSED, a 1200x720 `display:block` canvas above the data, `#lcx-fallback .refusal` **null**, and
`#log` an **empty string** — the old ladder wrote to a `log` const declared twenty lines below it and
threw before it existed. A reader on a machine without WebGL2 got seven rows of unexplained table
under a dead rectangle.

`?refuse=1` could not catch this: it is handled above `createStage`, so the forced-refusal capture and
the E9 audit both short-circuit past the branch. The fix routes it through `die` like the other six
environments. Verified by relaunching Chromium with `--disable-webgl --disable-webgl2`: canvas
`display:none`, refusal `stage — NO_WEBGL2 — …`.

The same branch was reachable without touching a browser flag. `?scale=abc` made `SCALE` NaN — neither
`Math.max` nor `Math.min` rejects NaN — so the canvas came out 0x0 and the reader was told "this driver
would not allocate the render targets this view needs" about a driver that was fine. Every numeric
parameter now goes through one parser that refuses a non-number as `BAD_PARAM` and reports any clamp it
had to apply.

## What is still unproven

§7(b) — "an operator still gets their answer at least as fast" — has not been MEASURED. The globe now
carries a reach map and a which-desks-are-awake reading, so it is arguable; arguable is not measured,
and the plan requires a task and a stopwatch against the flat surface.

**No landmass reference, so an endpoint is a NAMED position rather than a recognised place.** The
projected labels now say which city an arc lands on, which is what the rule 4 fix bought; what a reader
still cannot do is recognise the geography without reading the words, or place the five sites that are only
in the prose. Coastline polylines through the existing `createLineBatch` would fix it with no asset
pipeline, and it is the next step here. §3.3 deferred the texture decision deliberately; the polyline route
does not need it.

*This paragraph used to say "a reader cannot name where an arc lands" and that the labels were the blocker
for more corridors. The labels exist now, so the claim has been narrowed to what is still true rather than
left standing as written.*

**The twilight band is abrupt.** A real terminator has a gradient a few degrees wide; this one is the
raw N·L falloff.

**Frame time is reported now, and it is SwiftShader's.** `capture.mjs` reads `msPerFrame` and prints it
with the frame count actually measured; the run behind this file's captures is ~180-215 ms/frame under
ANGLE/SwiftShader, which is a CPU rasteriser and therefore not a frame budget — `headroom` refuses with
`SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET` rather than comparing it to 16.6 ms. No real-hardware figure
for E2 exists yet.

## What it actually needs, in order

1. **A rebuilt bundle and a fresh capture.** The label layer is in `entry.ts` and is NOT in `bundle.js`,
   `live.png` or the report figures published above, because both are generated. Until
   `node docs/3d/e2/build.mjs && node docs/3d/e2/capture.mjs` runs, this file describes a layer no capture
   has photographed — which is §6 rule 8 outstanding, not satisfied.
2. **`build.mjs`'s "NO DOM OVERLAY" comment and `capture.mjs`'s missing label assertion.** The first states
   a decision that has been reversed; the second means `labels.projected + labels.inWords === cities` is
   reported and unchecked. Both are one edit each, in files this change did not touch.
3. **A landmass reference** so the endpoints are recognised as well as named — coastline polylines through
   `createLineBatch`, which needs no asset pipeline.
4. **A softer terminator**, a few degrees of gradient rather than raw N·L.
5. **A real-hardware frame time.** The SwiftShader figure is now captured; the M1 number is not, because
   this harness has only ever run headless.

*"City and corridor labels in the DOM, projected" was item 1 of this list and is done — see §6 RULE 4 above.
Corridor text lands on the ENDPOINT label rather than at the arc's apex: an apex is not a place, so a label
there would name no city while competing for pixels with the two that do.*

*This section previously listed "great-circle arcs" and "a sub-solar point that puts some corridors in
darkness" as outstanding, and repeated the landmass point twice — both of those had already been
built and are documented as fixed at the top of this file. A to-do list that re-requests finished work
is a to-do list nobody re-read.*

## Reproduce

```bash
node docs/3d/e2/build.mjs && node docs/3d/e2/capture.mjs
```


## The anisotropic roughness values are sqrt() of the authored ones

Added 2026-08-13. `RING_MAT` (authored 0.14, `anisotropy: 0.8`) and `CORRIDOR_MAT` (authored 0.22,
`anisotropy: 0.85`) carry `0.3742` and `0.469` in source. `distributionGGXAniso` used to take `at`/`ab` from
*perceptual* roughness while the isotropic branch used `alpha = rough²`; correcting that in `38c01b1` made
this ring's lobe 7.1× narrower and the corridors' 4.6×, so the values were re-authored as square roots to
restore the effective alpha exactly. The corridor claim this harness actually tests — that lift rises with
angular distance — is unaffected: it is geometry, not shading. Pinned by
`packages/gl/src/env/anisoPreserved.test.ts`.
