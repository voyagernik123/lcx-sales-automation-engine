# E8 · THE FORGE — the first shippable environment

`live.png` is the gate. Sign-in is the one screen every operator and every stranger passes
through, which is why §5 puts this first.

## What it is

A machined disc on a plinth, inside a polished ring, lit by a single key light on an arc.

| element | material | why |
|---|---|---|
| disc | roughness 0.30, metalness 0.95 | **brushed**, not mirror — a broad travelling highlight instead of a hotspot |
| ring | roughness 0.13, metalness 0.92, brand blue | polished, so the highlight is tight and reads as machined |
| plinth | roughness 0.52, metalness 0.35 | semi-matte, so it grounds the object instead of competing with it |
| floor | roughness 0.88, metalness 0 | dielectric; it exists to catch the shadow |

**The highlight has to TRAVEL.** That is the whole effect and it is why the object is a cylinder
and a torus rather than a plane: both curve continuously, so one moving light sweeps a highlight
*along* them. A flat face gives a stationary blob and the object reads as a grey circle. In the
capture the sweep is visible at two points on the ring simultaneously.

## The mark stays in the DOM

§6 rule 4, and it is not a compromise. `MARK_VIEWBOX` and the four arrow paths come from
`apps/web/src/components/brand/LcxMark.tsx` — "Extracted, not drawn" — read programmatically so
this cannot drift from the approved artwork. Baking it into a texture would cost resolution, cost
the accessibility tree, and break the print path.

Its position is **projected**, not a hardcoded percentage: `projectScreen` with the identical
view-projection the geometry used. A `top:` value tuned by eye is right for exactly one camera and
silently wrong for every future one — and E1 THE THEATRE moves its camera. `behind` is checked
too, because a point behind the eye projects to a plausible-looking pixel that is entirely wrong.

## Cost, on the real M1

| | |
|---|---|
| resolution | 2400 × 1440 (2× retina) |
| triangles | 10,112 |
| **ms/frame** | **10.123** (with anisotropy — 10.743 without) |
| fps | 99 |
| headroom vs 16.6 ms | **6.48 ms** |

Full stack: shadow map → depth prepass → SSAO + 2 bilateral blurs → environment → GGX lit →
depth of field → tone-mapped present.

## Anisotropy — §2's actual ask, and it is free

`no-aniso.png` is the control. Isotropic GGX gives a round highlight; real turned metal has
grooves running one way, so the highlight elongates ALONG them and shows a **bar** of light rather
than a dot. In `live.png` the disc face carries a broad swept bar and the ring shows fine
circumferential striations.

Two roughnesses instead of one — `at` along the tangent, `ab` along the bitangent — with the
average preserved, so turning anisotropy up does not also change how rough the surface reads.

The tangents are **analytic** for both lathe-turned primitives: circumferential on the cylinder
wall AND its caps, along the ring on the torus. Deriving them from UVs gives a RADIAL tangent on a
cap, and the highlight then runs across the brush instead of along it — scratched rather than
turned. The frame is re-orthogonalised per fragment, because an interpolated tangent drifts
off-perpendicular and an anisotropic lobe on a skewed frame twists visibly across a curve.

The tangent transforms by the MODEL matrix, not the normal matrix: it lies IN the surface, so it
follows the geometry rather than staying perpendicular to it.

**Cost: 10.123 ms with anisotropy against 10.743 without.** It is not merely affordable, it is
cheaper than the isotropic path here — the anisotropic branch replaces the isotropic one rather
than adding to it.

## It IS wired into the sign-in route — this line used to say the opposite

**Correction.** This section read *"Not wired into the sign-in route yet. This is the harness proving
the environment; the React surface and its SVG/CSS fallback are the next step"* — and it went on
saying it for weeks after the work shipped. It is wired:

- `apps/web/src/pages/SelectOperator.tsx:13-14` lazy-imports `@/components/brand/ForgeBackdrop`,
  and line 151 renders it inside `<Suspense fallback={null}>`. That page IS the sign-in screen —
  email plus desk passcode, both verified server-side.
- The CSS half is `ForgePlate`, imported eagerly so the plate paints on the first frame with no bare
  page and no shift when the renderer lands on top of it. It is also the permanent fallback for
  server render, print, no-WebGL2 and a refused float target.
- `components/brand/__tests__/forgeBackdrop.test.tsx` asserts the MOUNT, not just the component
  ("built it, forgot to wire it" — which had already happened to W5), and `e2e/smoke.spec.ts:20-41`
  screenshots the sign-in gate in both themes.

E9's generated audit records this claim as a past defect, and E1's panel already renders the true
version onto E8's tile. This file was the last place the false one was still live. The lesson is the
one E9 exists for: a README sentence that was true when typed goes on being read as current.

## What is NOT done

- **§7(b) is not timed.** No operator has been put in front of the sign-in screen with and without
  the renderer and a stopwatch. The environment is scenery on a form rather than a data surface, so
  the clause bites differently here — but "differently" is not "not at all".
- **Not notarized.** A cinematic first-launch that Gatekeeper quarantines undoes the impression
  this exists to create.

## Reproduce

```bash
node docs/3d/e8/build.mjs && node docs/3d/e8/capture.mjs
# real GPU: serve docs/3d/e8, open live.html?frames=300&scale=2, read window.E8
```
