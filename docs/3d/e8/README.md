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

> ### ⚠ EVERY APPEARANCE CLAIM BELOW WAS MEASURED ON A SHADER THAT HAS SINCE BEEN FIXED
>
> Recorded 2026-08-13. `38c01b1` repaired four defects in `env/lit.ts`, and **E8 is the environment they
> bear on hardest — three of the four reach this frame.** The commit says so in its own subject line:
> *"EXPECT A LOOK CHANGE on those three"*, E8 among them.
>
> - **Defect 4 — the isotropic divide guard, five orders of magnitude too high.** `max(1e-6, PI*d*d)`
>   against a real floor of `5.3e-11`. It fired for every material smoother than roughness **0.154**,
>   inside `NdotH > 0.9997` — the core of the highlight. **The ring is 0.13**, so its peak came back
>   **3.9× too dim**.
> - **Defect 2 — `at`/`ab` were perceptual roughness passed where alphas were wanted.** Both materials
>   here set `anisotropy` (disc 0.86, ring 0.72), so crossing that branch jumped alpha from `rough²` to
>   `rough`: at the disc's 0.30 that is 0.09 → 0.30, a visibly wider and duller lobe.
> - **Defect 3 — the anisotropic divide guard, `max(1e-8, v2)` above a real floor of `1.6e-11`**, which
>   returned about ⅔ of the correct intensity for smooth materials near the peak. Reaches the ring.
>
> Defects 2 and 4 **compounded on the same material**: the mark's highlight was both blurred and clipped,
> which is most of the difference between machined metal and grey plastic.
>
> **`live.png` and `no-aniso.png` were not retaken, and this is checkable rather than inferred:**
> `docs/3d/e8/bundle.js` still contains `return a2 / max(1e-6, PI * d * d);` and contains no
> `uShadowTaps` uniform at all, while `packages/gl/src/env/lit.ts` at HEAD has `max(1e-16, …)` and
> declares that uniform. So "the highlight is tight", "a broad travelling highlight", "shows a **bar** of
> light rather than a dot" and "the sweep is visible at two points on the ring" all describe the pre-fix
> render. They are the claims this environment exists on, and they need a rebuild and a recapture before
> they can be read as current. The one thing the fix cannot have broken is the *argument*: a clipped and
> widened highlight understated the effect, so the direction of the change is toward the claim, not away
> from it. That is a reason to expect a good recapture and it is not a recapture.

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

Two **alphas** instead of one — `at` along the tangent, `ab` along the bitangent — with the average
preserved, so turning anisotropy up does not also change how rough the surface reads.

*This read "Two **roughnesses** instead of one" until 2026-08-13, and the word was the defect rather than
a loose description of it.* `distributionGGXAniso` consumes alphas; `distributionGGX` consumes perceptual
roughness and squares it internally. The old code split **perceptual roughness** (`rough * (1 ± aniso)`)
and handed the halves to the function that wanted alphas, so the two branches disagreed about what the
number meant and the lobe widened the instant `aniso` crossed 0.001 — visible on this frame as the mark
blooming rougher exactly when the feature switched on. It is `alpha = rough * rough` split now
(`lit.ts`), and the average that is preserved is the **alpha**. The algebra is what makes this a defect
rather than a preference: with `at = ab` the anisotropic form reduces *exactly* to the isotropic one, so
the branches agree if and only if `at`/`ab` converge on the isotropic alpha. They did not.

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

*Both figures were taken on the pre-`38c01b1` bundle — noted 2026-08-13. That commit changed the arithmetic
inside both branches (two divide guards and the `at`/`ab` derivation) without changing the pass structure or
the branch, so the comparison is expected to stand; "expected to stand" is not a measurement, and this pair
of numbers is the argument for the whole feature. It needs re-taking in the same manual M1 session as the
recapture. The tier is also now a variable the M1 numbers above do not name: E9's generated sweep measures
E8 at **148.75 ms full against 36.617 ms minimum, a 75.4% saving** under SwiftShader, where the tier drives
AO, depth of field and the shadow map — so any future frame-time claim here has to say which tier it is.*

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

**Those two e2e baselines are the shipping consequence of the shader fix above.**
`ForgeBackdrop.tsx` carries the same two materials as this harness — its disc is roughness 0.30 with
`anisotropy: 0.86` and its ring is 0.13 with 0.72 — so the live sign-in screen is where defect 4 was
*actually running*, on the one screen every operator and every stranger passes through. (Cited by material
rather than by line: that file is being edited in another lane, and the two lines have already moved once
while this note was being written.) `smoke.spec.ts-snapshots/` holds `front-door-light-chromium-darwin.png`
and `front-door-dark-chromium-darwin.png`, last written at `3c01d5c`, well before `38c01b1`.
**They are a pixel ratchet against a frame the renderer no longer
produces, so they should be expected to fail and be regenerated deliberately rather than muted** — a
baseline updated because it broke, without anyone naming why, is how a ratchet stops being a guard. That
file is outside this sweep; the change needed there is a re-record of both PNGs, with the reason in the
commit message.

E9's generated audit records this claim as a past defect, and E1's panel already renders the true
version onto E8's tile. This file was the last place the false one was still live. The lesson is the
one E9 exists for: a README sentence that was true when typed goes on being read as current.

## What is NOT done

- **§7(b) is NOT APPLICABLE here, decided 2026-08-13 — it is no longer an outstanding item.** This
  bullet read: *"§7(b) is not timed. No operator has been put in front of the sign-in screen with and
  without the renderer and a stopwatch. The environment is scenery on a form rather than a data surface,
  so the clause bites differently here — but 'differently' is not 'not at all'."* Building the instrument
  settled it the other way, and `docs/3d/e9/RUNNING_THE_TRIAL.md` carries the decision: clause (b) asks
  whether an operator gets **their answer** faster, and E8 is a machined disc, a ring and a plinth — it
  carries no dataset and answers no question, so there is no answer to time. **E8 is gated on clause (a)
  alone**, and its (a) row is in `docs/3d/e9/gate-a.json`. This is a category difference, not an omission:
  recording it as "unmeasured" implies outstanding work that does not exist, and the trial covers the six
  environments that do have an answer to time (E2, E3, E4, E5, E6, E7). §7(b) does remain unmeasured on
  all six of those — no operator has run it.
- **Not notarized.** A cinematic first-launch that Gatekeeper quarantines undoes the impression
  this exists to create.

## Reproduce

```bash
node docs/3d/e8/build.mjs && node docs/3d/e8/capture.mjs
# real GPU: serve docs/3d/e8, open live.html?frames=300&scale=2, read window.E8
```
