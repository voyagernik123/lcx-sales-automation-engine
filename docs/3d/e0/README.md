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

- ❌ **the metallic sphere is far too dark.** At `metalness 0.92` there is almost no diffuse lobe,
  so a metal reflects its environment — and there is no environment yet. This is not a bug in
  `lit.ts`; it is the L6 gap, and it is the first thing E1b needs.
- ❌ the sphere's contact shadow is weaker than the cube's. Suspect the shadow frustum `extent`
  fit rather than the PCF.

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
