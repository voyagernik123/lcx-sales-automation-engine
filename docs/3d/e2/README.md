# E2 · THE GLOBE — status: **RENDERS WELL, DOES NOT PASS ITS GATE**

`live.png` is the gate.

## What works, and it is a lot

A globe with an atmospheric rim at the limb, a visible day/night terminator, eight city markers
placed from latitude/longitude by a documented formula rather than by hand, and a polished orbital
ring whose anisotropic highlight travels along the tube. 32,896 triangles, `glError: 0`.

Its instrumentation is again the strongest part: `centralMeridian`, `subSolar` as a lat/long
string, and `citiesFacing` / `citiesSunlit` / `behindLimb` / `onNightSide` as explicit sets — so a
test can assert that a marker on the far side is NOT drawn in front of the sphere, which is the
defect a screenshot hides.

## Two honest problems, one of them fatal

**1 · THE ARCS ARE MISSING, and they are the entire point.** §2 E2 asks for "extruded arcs for
every partner and listing corridor". There are city dots and no corridors. Without them this is a
handsome planet carrying no information at all, which fails §7(b) exactly as E1 does. A great-circle
arc between two lat/longs is the payload; the sphere is the frame around it.

**2 · EVERY CITY IS ON THE DAY SIDE.** Its own report says `citiesSunlit: 8` and `onNightSide: []`.
A terminator with nothing behind it is a gradient, not a terminator — either the sub-solar point or
the city set needs to straddle it, or the day/night line is decoration. Recorded because the harness
surfaced it; not fixed.

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
