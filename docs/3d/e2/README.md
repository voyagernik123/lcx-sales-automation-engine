# E2 · THE GLOBE — status: **CARRIES INFORMATION. §7(b) still unproven.**

`live.png` is the gate.

## What works, and it is a lot

A globe with an atmospheric rim at the limb, a visible day/night terminator, twelve city markers
placed from latitude/longitude by a documented formula rather than by hand, and a polished orbital
ring whose anisotropic highlight travels along the tube. 35,136 triangles, `glError: 0`.

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

**No landmass reference, so an endpoint is a position rather than a place.** A reader cannot name
where an arc lands. Coastline polylines through the existing `createLineBatch` would fix it with no
asset pipeline, and that is the next step here — before any more corridors, because more unlabelled
endpoints add no reading. §3.3 deferred the texture decision deliberately; the polyline route does not
need it.

**No DOM text at all, which is a §6 rule 4 violation and was not previously recorded here — STILL TRUE OF THIS
HARNESS, and NOT true of the shipped surface.** E2 is now promoted into the web app
(`apps/web/src/components/market/GlobeRelief.tsx` + `GlobeReliefGl.tsx`, mounted on `MarketMap`, opt-in and
defaulting to the scatter), and the product component projects real DOM labels through `projectScreen` — region
names, project and listing counts, market cap, solar time, the hub, the sub-solar reading, and every absence.
So the accessibility tree and the print path are covered where a reader actually meets E2. This file's own
`entry.ts` still renders no DOM text, so the harness violation stands as written below; nobody should read the
promotion as having fixed it here.

Two things the promotion could NOT carry over, and they are data limits rather than rendering ones:
`MarketMap`'s `MapPoint` has **no coordinates at all** — only a coarse `region` string — so the shipped globe
places REGIONS at published geographic centres (EU-27 near Gadheim; contiguous US near Lebanon, Kansas) and
says so on the frame, while this harness's twelve city sites remain placeholders. And the shipped terminator is
computed from the reader's own clock rather than from a fixed sub-solar point, which is what turns "which desks
are awake" into a reading instead of a lighting choice.

`build.mjs`
chose to have no DOM overlay, so twelve sited cities and seven corridors carry no labels: nothing enters
the accessibility tree, nothing is selectable or translatable, and nothing survives printing. Every
other environment in the programme now projects real DOM content onto its geometry
(`projectQuad` / `projectScreen` in `packages/gl/src/env/project.ts`), and E2 is the one that does not.
This is why E1's derived panel set omits E2 rather than one of the others: it is the least complete.

**The twilight band is abrupt.** A real terminator has a gradient a few degrees wide; this one is the
raw N·L falloff.

**Frame time is reported now, and it is SwiftShader's.** `capture.mjs` reads `msPerFrame` and prints it
with the frame count actually measured; the run behind this file's captures is ~180-215 ms/frame under
ANGLE/SwiftShader, which is a CPU rasteriser and therefore not a frame budget — `headroom` refuses with
`SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET` rather than comparing it to 16.6 ms. No real-hardware figure
for E2 exists yet.

## What it actually needs, in order

1. **City and corridor labels in the DOM**, projected — the rule 4 fix, and the thing that turns twelve
   sited points into twelve named ones.
2. **A landmass reference** so the endpoints mean something — coastline polylines through
   `createLineBatch`, which needs no asset pipeline.
3. **A softer terminator**, a few degrees of gradient rather than raw N·L.
4. **A real-hardware frame time.** The SwiftShader figure is now captured; the M1 number is not, because
   this harness has only ever run headless.

*This section previously listed "great-circle arcs" and "a sub-solar point that puts some corridors in
darkness" as outstanding, and repeated the landmass point twice — both of those had already been
built and are documented as fixed at the top of this file. A to-do list that re-requests finished work
is a to-do list nobody re-read.*

## Reproduce

```bash
node docs/3d/e2/build.mjs && node docs/3d/e2/capture.mjs
```
