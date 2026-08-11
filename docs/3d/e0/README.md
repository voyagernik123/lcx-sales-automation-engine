# E0 · THE SPIKE — status: **GATE MET**

`3D_VFX_1000X.md` §5 gives E0 one job: replace the estimated frame budget with a measured one
on real hardware, before any product code exists. It was allowed to kill the plan. It did not.

## The measurement — real Apple M1, not SwiftShader

```
renderer   ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)
scene      4,236 triangles · 1024² shadow map · 1280×800 · RGBA16F · tone-mapped blit
```

| scene passes / frame | triangles / frame | ms / frame |
|---|---|---|
| 1 | 4,236 | **0.599** |
| 20 | 84,720 | 1.139 |
| 100 | 423,600 | 3.856 |

**Fixed cost ≈ 0.57 ms** (shadow pass + fullscreen present). **Marginal cost ≈ 0.028–0.033 ms**
per additional scene pass — about **110,000 triangles per millisecond**.

### Why the number is believed

It **scales**. An earlier harness in this repo reported 5,000 fps because `gl.finish()` returns
on flush and `performance.now()` is clamped to ~100 µs, so a figure that does not move when the
work multiplies is measuring command submission rather than execution. Multiplying the geometry
100× moved this one from 0.599 to 3.856 ms, linearly across two decades. That is a clock.

### Against the estimate

§3.2 estimated **10.9 ms** of the 16.6 ms budget. Measured base scene: **0.60 ms**. The estimate
was **~18× pessimistic**, which means AO, DOF, volumetrics and particles all fit with room —
and the §3.2 quality-ladder recommendation becomes a nicety rather than a necessity.

**Headroom against 60 fps: 16.0 ms.**

## The bug that made the first three attempts render nothing

`IDENTITY` in `math.ts` is a **factory**, not a constant:

```ts
export const IDENTITY = (): Mat4 => new Float32Array([1,0,0,0, ...]);
```

So `new Float32Array(IDENTITY)` passed a **function** to the constructor and produced a
**zero-length array** rather than throwing. `uniformMatrix4fv` with 0 floats raises
`GL_INVALID_VALUE`, every model matrix was empty, every vertex collapsed to the origin — and the
frame came out as nothing but the clear colour, with **every program compiled, no refusal fired,
and the framebuffer reporting COMPLETE**.

The 16 new unit tests could not catch it. They prove the matrices are finite and well-formed;
this was a GL argument three layers beneath them. **`finite` is not `correct`, and a pure-function
test bounds the maths without saying anything about the API call.**

What found it in one run, after three wrong guesses, was making the code name its own failure:
`LitRenderer.shadowPass` and `draw` now take an optional `onStep` probe, because `getError()`
reports the first error since the last call and clears it — so a single check at the end of a
pass identifies the *pass* and never the *call*. That probe is permanent.

## What is visibly right, and what is not

`live.png` (SwiftShader, for the repeatable capture) and the real-GPU screenshot both show:

- ✅ three cube faces at distinctly different luminance — flat normals are working
- ✅ a cast shadow, soft-edged, correctly offset from the light direction
- ✅ a smooth sphere terminator with no polar faceting — analytic normals
- ✅ brand blue `#2C6BFF` recognisably itself through HDR + tone map

- ✅ **the dark metal is FIXED** — see L6 below.

## L6 · ENVIRONMENT — the dark-metal fix

`packages/gl/src/env/sky.ts`. The sphere was black and the material was *right*: a metal has
almost no diffuse lobe, so nearly everything visible on it is reflected environment, and there
was no environment. Every "why does my metal look like plastic" is this.

Analytic three-stop gradient rather than a cubemap: no asset, no fetch, no bytes, and — the part
that matters — the **backdrop and the reflections are the same function**, so they cannot
disagree. A mismatch there is the tell that a scene was assembled rather than lit.

Roughness lerps the reflection sample direction toward the normal instead of prefiltering, so a
mirror samples along R, a rough surface near N, and the gradient blurs for free.

**Cost, measured on the M1: 0.599 → 0.733 ms.** The fullscreen environment pass is 0.13 ms.

### Still open on the sphere

Its reflection is bright toward the lower body and dark at the top. Dark-at-top is correct
(reflecting the dark zenith). Bright-at-bottom is **suspect** — the lower hemisphere should
reflect the dark ground stop, with the bright band at the silhouette instead. Next check is a
near-mirror (`roughness 0.05`) sphere compared against the backdrop's own horizon line: if the
reflected horizon does not land where the real one does, the sample direction is inverted.
Recorded rather than assumed correct.

The contact-shadow difference between cube and sphere no longer reads as wrong now that there is
ambient light; leaving it unless the mirror test says otherwise.

## Reproduce

```bash
node docs/3d/e0/build.mjs && node docs/3d/e0/capture.mjs     # capture (software GL)
cd docs/3d/e0 && python3 -m http.server 8799                  # then open with a real GPU:
# http://127.0.0.1:8799/live.html?frames=300&repeat=1   → window.E0 carries the report
# ?repeat=20 / ?repeat=100                              → validates the clock by scaling work
```

## Verdict

**Proceed to E1a.** The frame budget is not the constraint anyone thought it was, the engine
layers work, and the next gap is the environment (L6) rather than performance.
