# E2 · THE GLOBE — status: **CARRIES INFORMATION. §7(b) still unproven.**

`live.png` is the gate.

## What works, and it is a lot

A globe with an atmospheric rim at the limb, a visible day/night terminator, eight city markers
placed from latitude/longitude by a documented formula rather than by hand, and a polished orbital
ring whose anisotropic highlight travels along the tube. 32,896 triangles, `glError: 0`.

Its instrumentation is again the strongest part: `centralMeridian`, `subSolar` as a lat/long
string, and `citiesFacing` / `citiesSunlit` / `behindLimb` / `onNightSide` as explicit sets — so a
test can assert that a marker on the far side is NOT drawn in front of the sphere, which is the
defect a screenshot hides.

## Both original problems are FIXED

**1 · THE CORRIDORS EXIST.** Seven great-circle arcs from Vaduz — where LCX actually is — so every
arc is a claim about a route rather than a decorative curve. `arcTube` in `env/mesh.ts` slerps along
the great circle, so no corridor cuts through the planet, and lifts by `sin(pi t)` so each one leaves
and meets the surface tangentially instead of floating with a step at each end.

Lift scales with angular distance, and the report proves it rather than asserting it:

| corridor | peak lift |
|---|---|
| London | 0.0245 |
| Dubai | 0.0628 |
| New York | 0.080 |
| Chicago | 0.088 |
| Johannesburg | 0.0996 |
| Tokyo | 0.1114 |
| Singapore | 0.1181 |

Monotonic with distance. A fixed lift would make the London hop a tall croquet hoop.

**2 · THE TERMINATOR NOW SEPARATES SOMETHING.** `onNightSide: ["New York", "Chicago"]`, where it was
empty. Two changes: four cities added spanning the rest of the globe, and — the one that actually
mattered — the sub-solar point and central meridian moved to 60/-15. At 95/30 the night side sat just
off the edge of what the camera sees, so NO number of extra cities would have populated that set.
`behindLimb: ["Mumbai", "Singapore", "Tokyo"]` confirms the occlusion test is real: those arcs curve
over the horizon and disappear.

## What is still unproven

§7(b) — "an operator still gets their answer at least as fast" — has not been MEASURED. The globe now
carries a reach map and a which-desks-are-awake reading, so it is arguable; arguable is not measured,
and the plan requires a task and a stopwatch against the flat surface.

**No landmass reference, so an endpoint is a position rather than a place.** A reader cannot name
where an arc lands. Coastline polylines through the existing `createLineBatch` would fix it with no
asset pipeline, and that is the next step here — before any more corridors, because more unlabelled
endpoints add no reading. §3.3 deferred the texture decision deliberately; the polyline route does not
need it.

**No DOM text at all, which is a §6 rule 4 violation and was not previously recorded here.** `build.mjs`
chose to have no DOM overlay, so eight sited cities and seven corridors carry no labels: nothing enters
the accessibility tree, nothing is selectable or translatable, and nothing survives printing. Every
other environment in the programme now projects real DOM content onto its geometry
(`projectQuad` / `projectScreen` in `packages/gl/src/env/project.ts`), and E2 is the one that does not.
This is why E1's derived panel set omits E2 rather than one of the others: it is the least complete.

**The twilight band is abrupt.** A real terminator has a gradient a few degrees wide; this one is the
raw N·L falloff.

**Frame time is not reported.** The harness computes `msPerFrame` but `capture.mjs` never reads it, so
no number for this environment has ever been written down. Unlike E5 and E6 it did not publish a wrong
figure — it published none.

## What it actually needs, in order

1. **City and corridor labels in the DOM**, projected — the rule 4 fix, and the thing that turns eight
   sited points into eight named ones.
2. **A landmass reference** so the endpoints mean something — coastline polylines through
   `createLineBatch`, which needs no asset pipeline.
3. **A softer terminator**, a few degrees of gradient rather than raw N·L.
4. **A reported frame time**, by the trailing-`readPixels` instrument the other harnesses use.

*This section previously listed "great-circle arcs" and "a sub-solar point that puts some corridors in
darkness" as outstanding, and repeated the landmass point twice — both of those had already been
built and are documented as fixed at the top of this file. A to-do list that re-requests finished work
is a to-do list nobody re-read.*

## Reproduce

```bash
node docs/3d/e2/build.mjs && node docs/3d/e2/capture.mjs
```
