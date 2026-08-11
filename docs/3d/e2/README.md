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

And the sphere still has no landmasses, so a corridor endpoint is a position rather than a place. A
reader cannot yet name where an arc lands without the marker's tooltip. Coastline polylines through
the existing `createLineBatch` would fix it with no asset pipeline, and that is the next step here —
before any more corridors, because more unlabelled endpoints add no reading.

The twilight band is also abrupt rather than soft. A real terminator has a gradient a few degrees
wide; this one is the raw N·L falloff.

Lesser: the sphere has no landmasses, so it cannot say WHERE anything is. A continent texture is an
asset, which §3.3 deliberately deferred — so an arc's endpoints currently mean nothing to a reader
even once the arcs exist. That ordering matters: arcs before texture is backwards.

## What it actually needs, in order

1. **Great-circle arcs** between partner lat/longs, extruded and lit. The payload.
2. **A landmass reference** so the endpoints mean something — texture, or coastline polylines
   through the existing `createLineBatch`, which needs no asset pipeline.
3. A sub-solar point that puts some corridors in darkness, so the terminator carries the
   "which desks are awake" reading it exists for.

## Reproduce

```bash
node docs/3d/e2/build.mjs && node docs/3d/e2/capture.mjs
```
