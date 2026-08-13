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
answered by data: **render at 2×, 60 fps.**

*Corrected 2026-08-13. This paragraph ended "**no quality ladder.** The ladder can be built later if a
weaker GPU appears; it is not needed for this machine" — and it went on saying that after the ladder was
built, wired into this harness, and argued mandatory **out of E0's own third row**.
`packages/gl/src/env/quality.ts`'s header reasons from the 11.328 ms figure above: 5.3 ms of headroom at
2× with depth of field, on the fastest machine this will ever run on, leaves no reading of "optional".
This file reads that ladder at four sites — `entry.ts` sizes its shadow map through
`shadowMapSizeFor(TIER, 1024)` and reports `tierShadowMapSize` from the same call, and passes
`shadowTaps: Q.shadowTaps` at **both** of its `lit.draw` call sites — and E9's generated sweep measures E0
at **166.3 ms full against 30.7 ms minimum, an 81.5% saving**, the largest of the nine. The recommendation
this file made was overturned by the evidence this file produced. (Cited by symbol rather than by line:
`entry.ts` is being edited in another lane as this is written, and a line number is the one kind of
citation that goes stale without the claim changing.)*

**The tier changes what the captures below show, so they are tier-`full` captures.** At `?tier=minimum`
the shadow is **one tap — a hard edge, not a softer nine** (`env/lit.ts` branches on `uShadowTaps`), AO
and depth of field are off, and the render is 1×. "Soft PCF edges" below is a claim about `full` only.

## What the capture proves

`live.png` — cube with three distinctly lit faces (flat normals), metal sphere with a real
environment reflection and a crisp specular highlight, cast shadows with soft PCF edges, and
contact darkening at both bases from AO.
`no-ao.png` — the control. Identical scene, occlusion off.
`diag-mirror.png` — a roughness-0.045 mirror against an RGB sky (red zenith, green ground, blue
horizon). This is how the reflection orientation was *verified* rather than assumed.

*Capture provenance, 2026-08-13. All three PNGs and `bundle.js` predate `38c01b1`, which fixed four
defects in `env/lit.ts` — `bundle.js` still carries the pre-fix `max(1e-6, PI * d * d)` and no
`uShadowTaps` uniform at all, so it is checkable rather than assumed. **Two of E0's three claims here are
unaffected, and for a stated reason:** defect 4 fired only below roughness 0.154, and the deck (0.82),
the dielectric sphere (0.34) and `live.png`'s metal sphere (0.18) are all above it; and the environment
reflection does not go through the repaired function at all — `envSpecular` samples `skyColour` along a
roughness-blended reflect vector, so the orientation check in `diag-mirror.png` stands.
**What is NOT re-verified: the `?diag` mirror is roughness 0.045, the exact clamp where defect 4 replaced
the true denominator and returned a peak 18,930× too dim.** Its key-light highlight in that capture is
therefore wrong, and the capture has not been retaken.*

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

## Three more, and all three were in the instrument rather than the frame

**5 · The target probe's own `readPixels` was failing, and reported black.** `targetProbe` exists to
prove the frame reached the HDR target; it read with `gl.RGBA, gl.UNSIGNED_BYTE` on the reasoning that
"asking for FLOAT is itself an error on some drivers". On ANGLE/SwiftShader with an RGBA16F attachment it
is UNSIGNED_BYTE that is the error: every capture in this repository reported `glAfterRead: 1282`
(`GL_INVALID_OPERATION`) with `targetCentre: [0,0,0,0]` — the probe failed, returned black, and neither
the page nor `capture.mjs` said a word, because `capture.mjs` read no report fields at all. WebGL2 answers
the question directly: `IMPLEMENTATION_COLOR_READ_FORMAT`/`_TYPE` for the bound framebuffer, here
`RGBA/HALF_FLOAT`, decoded to linear radiance. `targetCentre` now reads `[0.0173, 0.0206, 0.0329, 1]` —
and `capture.mjs` throws on a non-zero `glAfterRead`, a non-empty `failingCalls`, or an all-zero centre.

**6 · `glError` was blind to setup, and its comment claimed the opposite.** The field carried "It is read
ONCE, here, because getError CLEARS the flag" while this file reads the flag four times above it,
including a deliberate drain that exists so the probe can attribute an error to a call. So a real
`GL_INVALID_VALUE` raised during context creation or mesh upload — exactly bug 1 above — read as 0.
Demonstrated by raising `GL_INVALID_VALUE` with `gl.viewport(0, 0, -1, -1)` and replaying E0's sequence:
all three fields reported clean. The drain now reports what it swallowed as `glDuringSetup`, and the
comment describes the window each field actually covers. *`scripts/3d-audit.mjs` feeds `glError` straight
into the audit's error column; that column is still labelled as an unqualified `glError` and should read
`glDuringSetup` too — that file is outside this harness.*

**7 · `?scale=abc` was reported as a driver fault.** `Math.max(1, Math.min(3, Number('abc')))` is NaN —
neither clamp rejects NaN — so `canvas.width` coerced to 0, `createStage` refused a 0x0 canvas with
`FRAMEBUFFER_INCOMPLETE`, and the page told the reader "this driver would not allocate the render targets
this view needs" about a driver that was fine. `?frames=abc` was quieter: the timing loop ran zero times
and `msPerFrame` serialised to `null`, which is this codebase's refusal convention, on a page titled
READY. Numeric parameters now refuse as `BAD_PARAM` by name, `frames` reports the count MEASURED rather
than the count requested (`frames=0` and `frames=-5` published a one-frame time as a 0- and -5-frame
sweep), and the sweep stops on a 20-second wall clock — `?frames=1e9` used to lock the renderer process
hard enough that Playwright could not evaluate an expression against the page, and clamping the count
alone does not fix that: 20000 frames of this scene under SwiftShader is over an hour.

The same refusal path had a second hole: `createStage` refusing was handled by an inline
`document.title='REFUSED'; log.textContent=…; throw` that never called `showRefusal`, so on a browser
with WebGL2 genuinely unavailable the reader got a 1280x800 dead canvas above the material table with no
message in the flat view at all. It goes through `die` now, like the other six.

## Reproduce

```bash
node docs/3d/e0/build.mjs && node docs/3d/e0/capture.mjs     # captures, swiftshader
# real GPU: serve docs/3d/e0 and open live.html?frames=600&scale=2, read window.E0
```
