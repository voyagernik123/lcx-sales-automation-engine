# E0 · THE SPIKE — status: **GATE NOT MET**

`3D_VFX_1000X.md` §5 gives E0 one job: replace the estimated frame budget with a measured one
before any product code exists, and it is allowed to kill the plan. It has not passed.

## What is built and proven

| layer | file | state |
|---|---|---|
| L1.5 mesh | `packages/gl/src/env/mesh.ts` | ✅ 16 unit tests |
| L1.6 camera + light rig | `packages/gl/src/env/camera.ts` | ✅ NaN sweeps over every angle |
| L1.5 depth target + shadow map | `packages/gl/src/env/target3d.ts` | ✅ allocates, framebuffer COMPLETE |
| L2.5 GGX material + L2.6 PCF shadow | `packages/gl/src/env/lit.ts` | ✅ compiles on the driver |

The depth-attachment gap is real and was the first thing found: `stage.scene`, `bloomA` and
`bloomB` carry colour only — grep `stage.ts` for `DEPTH_ATTACHMENT` and it returns nothing. The
existing pipeline is physically unable to depth-test geometry, which is why `target3d.ts` exists
and why it is additive rather than a change to `stage.ts`.

## What is NOT working

**The geometry pass raises `GL_INVALID_VALUE` (1281) and the render target reads back empty.**

```
hdr           true
eye           [3.73, 3.30, 5.53]      ← camera is correct
boxTopNdc     [-0.245, 0.403]  w 7.497 ← geometry projects INSIDE the frame, in front of the eye
glAfterDraw   1281   GL_INVALID_VALUE  ← attributed to the pass, errors drained before it
glAfterRead   1282   GL_INVALID_OPERATION
targetCentre  [0,0,0,0]
```

`live.png` is a uniform navy rectangle. That colour is exactly the clear colour in linear, so
nothing drew at all — not the ground plane, not the box, not the sphere. Every program compiled,
no refusal fired, the framebuffer reported COMPLETE, and 4,236 triangles were submitted.

**This is the silent-black-frame class the unit tests were written to prevent, and it happened
anyway. `finite` is not `correct`.** The NaN sweeps proved the matrices are well-formed; they
cannot prove a GL state error three layers down. Worth recording as the lesson: pure-function
tests bound the maths and say nothing about the API calls.

## The two leading hypotheses, untested

1. **Depth-only framebuffer needs `gl.drawBuffers([gl.NONE])`.** The shadow map has no colour
   attachment, but the default draw buffer is still `COLOR_ATTACHMENT0`. Several drivers error
   on a draw in that state. Fits `1281` less well than `1282`, so it is second.
2. **A `uniform*fv` receiving the wrong component count.** `GL_INVALID_VALUE` is exactly what
   `uniform3fv` raises for an array whose length is not 3. `hexToLinear` and `eye` are the
   candidates to instrument first — pass explicit `Float32Array`s of known length and see which
   call clears the error.

Next step is one experiment, not a guess: wrap every GL call in the two draw paths with a
`getError()` check under a debug flag, and let it name the offending call.

## The number that is NOT the answer

`msPerFrame: 12.55` at 1280×800 with a 1024² shadow map — but the renderer string is
`SwiftShader`, i.e. **software rasterisation**, and the frame is empty. That number measures
nothing and must not be quoted as the frame budget. E0's gate requires a real GPU and a
non-empty frame.

## Reproduce

```bash
node docs/3d/e0/build.mjs && node docs/3d/e0/capture.mjs
```
