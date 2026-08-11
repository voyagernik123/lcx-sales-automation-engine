# E0 · THE SPIKE — **GATE MET**

`3D_VFX_1000X.md` §5 gave E0 one job: replace the estimated frame budget with a measured one
before any product code exists, and it was allowed to kill the plan. It did the opposite.

## The measurement, on the real GPU

`ANGLE (Apple, ANGLE Metal Renderer: Apple M1)` — 600-frame batch, forced to completion with a
`readPixels` so the clock measures execution rather than command submission.

| resolution | ms/frame | fps | headroom vs 16.6 ms |
|---|---|---|---|
| 1280 × 800 (1×) | **1.305** | 766 | **15.3 ms** |
| 2560 × 1600 (2×) | **4.914** | 204 | **11.7 ms** |
| 2560 × 1600 (2×) **+ DOF** | **11.328** | 88 | **5.3 ms** |

Depth of field is the expensive pass — 6.4 ms of that, at full resolution with 24 taps each
doing two depth reads. It is full-res deliberately: the in-focus region passes through untouched,
so halving it would soften exactly what is meant to be crisp. Even so, the COMPLETE pipeline
holds 60 fps at full retina with 5.3 ms spare.

Full pipeline in that number: shadow map (1024²) → depth prepass → SSAO + two bilateral blurs
(half-res) → environment backdrop → GGX lit pass → tone-mapped present.

**§3.2 predicted ≈10.9 ms at 1× and said 2× would not fit. It is 8× cheaper than estimated and
2× retina holds 60 fps with 11.7 ms spare.** So the frame decision reserved for the owner is
answered by data: **render at 2×, 60 fps, no quality ladder.** The ladder can be built later if a
weaker GPU appears; it is not needed for this machine.

## What the capture proves

`live.png` — cube with three distinctly lit faces (flat normals), metal sphere with a real
environment reflection and a crisp specular highlight, cast shadows with soft PCF edges, and
contact darkening at both bases from AO.
`no-ao.png` — the control. Identical scene, occlusion off.
`diag-mirror.png` — a roughness-0.045 mirror against an RGB sky (red zenith, green ground, blue
horizon). This is how the reflection orientation was *verified* rather than assumed.

## Four real bugs, and what each one teaches

**1 · `IDENTITY` is a factory, not a constant.** `export const IDENTITY = (): Mat4 => …`, so
`new Float32Array(IDENTITY)` passes a *function* to the constructor and yields a **zero-length**
array. `uniformMatrix4fv` with 0 floats raises `GL_INVALID_VALUE`, every model matrix was empty,
every vertex collapsed to the origin — and the frame came out as pure clear colour with every
program compiled, no refusal, and a COMPLETE framebuffer. **Finite is not correct:** the NaN
sweeps in `env.test.ts` prove the maths is well-formed and say nothing about a GL argument three
layers below them. Found by instrumenting every GL call with its own `getError()`, because
`getError` clears as it reports and one check per pass names the *pass*, never the call.

**2 · The sphere was wound inwards.** It reflected the GROUND at its top and the ZENITH at its
bottom. `sphere()` copied `plane()`'s `a, c, b` index order, and the same pattern gives opposite
winding on a phi×theta grid. An inward sphere is **not** invisible under back-face culling — you
see the inside of its far hemisphere as a perfectly plausible disc with normals pointing the
wrong way. Diffuse still looked right, so only reflections were mirrored, and a low-contrast grey
sky cannot distinguish that from its own inverse. Three unmistakable colours can, in one frame.
Only the box had a winding test; the sphere and plane have one now.

**3 · The metal was black, and the material was right.** A metal has almost no diffuse lobe, so
nearly everything visible on it is reflected environment — and there was no environment. The bug
was the absence of `env/sky.ts`, not anything in `lit.ts`.

**4 · The depth prepass z-fought with the lit pass.** Structured stair-step blocks across every
flat face, **identical with AO on and off** — which is what proved it was the prepass and not the
occlusion. `SHADOW_VERT` computes `uLightVP * uModel * vec4(pos)`; GLSL multiplication is
left-associative, so the two *matrices* multiply first. `LIT_VERT` applies `uModel` to the vector
first. Algebraically equal, different rounding, so `LEQUAL` rejected fragments it should have
passed. Fixed with a dedicated prepass shader whose transform is **bit-identical** — not with a
looser depth test or a polygon offset, both of which hide the disagreement instead of removing it.

**And the tenth backtick.** A comment inside a GLSL template literal quoted an identifier in
backticks and terminated the string. The ratchet written after the ninth found shaders by their
`#version` marker and missed a snippet; it now finds them by GLSL *tokens*, and it has been
watched failing on the real bug and passing once removed.

## Reproduce

```bash
node docs/3d/e0/build.mjs && node docs/3d/e0/capture.mjs     # captures, swiftshader
# real GPU: serve docs/3d/e0 and open live.html?frames=600&scale=2, read window.E0
```
