# E5 · THE SURFACE — status: **AGREES WITH THE SHIPPING ENGINE. §2's ribbons and drag are not built.**

`live.png` is the gate. `flat-only.png` (`?mesh=0`) is the control: the plinth, the axes and every
annotation with no surface on it — which is also what a broken heightfield produces, so the pair is
what proves the mesh carries the reading rather than the frame around it.

## The one number that entitles this to exist

E5 is the only environment in the programme that promotes a surface which **already ships**.
`buildSurfaceMesh` in `@lcx/shared` computes the flat projection and `SurfacePlot` draws it, so the 3D
version is driven from the **identical input** and the two can be checked against each other rather
than admired separately:

| | flat engine | 3D mesh |
|---|---|---|
| cells total | 30 | 30 |
| cells drawn | 24 | 24 |
| cells holed | 6 | 6 |
| points absent | 2 | 2 |
| points withheld | 3 | 3 |

`agreesWithFlat: true`. If that is ever false, one of the two surfaces is showing data the other is
not, and it does not matter in the slightest which one is prettier. The capture script **throws** on
disagreement rather than printing it.

## The three states survive the promotion — which is the whole point

The flat engine is careful in a way that is easy to throw away: a grid point is OBSERVED, ABSENT
(never measured) or WITHHELD (measured, may not be shown), and a cell touching a non-observed corner
is drawn as a hole rather than interpolated across. A watertight 3D grid would be smoother, handsomer,
and would assert values nobody took — a straight regression wearing a better frame.

So `heightfield()` in `env/mesh.ts` takes `null` for *no cell*, and E5 renders the two non-observed
states **differently**:

- **ABSENT** → a hole. You can see the plinth through the notch on the left of the surface.
- **WITHHELD** → also no cell, but an amber plate sits at that grid point. The gap reads as
  deliberate rather than as missing, which is the distinction the flat figure makes with hatching and
  which a plain hole would have lost.

Two consequences of holes that are easy to miss, both handled and both tested:

- **A normal at a hole's rim cannot use a central difference** — one side does not exist. It falls
  back to one-sided, then to straight up. Sampling *through* a hole lights the rim as though the
  surface continued flat across it, which reads as a lighting bug rather than as missing data.
- **A vertex no surviving cell references still occupies its slot**, because indices are absolute.
  Compacting the vertex list is a memory saving paid for with an off-by-one in every index.

`VALUES_ARE_PLACEHOLDERS` is printed **on the frame**, in amber, by the engine's own notice mechanism
— not by a comment in a file nobody opens. The data here is synthetic and the capture says so.

## Two defects the instrumentation caught, not the eye

**1 · The title was a correct transform producing unreadable text.** The first version projected it
onto the plinth's front face with E1's `projectQuad`, because the mechanism was there. At azimuth 38°
that face is nearly edge-on: a 16 cm strip became **13.8 px** of screen height running diagonally
across the corner. The transform was right — `perspectiveX` of −339 proves it — and the result was
illegible. *A correct transform is not a legible one.* Legibility is now measured against a 26 px
minimum and the fallback is screen space, reported either way (`title.mode`), so a camera that does
present that face gets the projected plate back without anyone remembering to re-enable it.

This is the same judgement the tick labels make, reached from the opposite side: **content belongs on
a surface, annotation belongs in front of it, and a title is whichever the camera makes it.**

**2 · Both axes were missing their last tick.** `ticksOffFrame: 2` at distance 7.6 — the x axis ended
at 1000 and the y axis at 90. An axis missing its outermost tick is worse than no axis, because the
reader scales the surface against a range that stops short of the data. Caught by the count; the
capture looked fine.

## Two more the pen-test caught: a rate with no domain, and a key that went white

**3 · "Finite" is not "possible", so the surface would plot `PEAK 1250%`.** Validation was delegated
entirely to `buildSurfaceMesh`, which refuses a non-finite cell (`GEOMETRY_Z_NOT_FINITE`) and accepts any
finite number. `zAxis` is declared as a win rate and every probe label is formatted as a percentage, so a
cell of `12.5` rendered the headline **`PEAK 1250%`** with no notice and no refusal, and `-0.90` was
accepted as a win rate of −90%. Measured on a copy of this harness: `title READY`, frame text
`PEAK / 1250% / $2500k · 180 d`. The control — the same grid with one `NaN` — refused correctly, which is
exactly what made the gap look like coverage. The domain is now asserted here, in the surface that knows
the quantity is a fraction of deals won, and it **refuses** rather than clamping: a clamped 12.5 is a
plausible 100%. `SurfaceGridInput` has no field for a range, so the engine could not have known;
`zAxis.domain` refused the way non-finite already is remains the right engine-level fix.

**4 · `forced-colors: active` collapsed the state key.** Measured with `newPage({forcedColors:'active'})`,
OBSERVED `#2C6BFF` and WITHHELD `#C98A2B` **both** computed to `rgb(255,255,255)` — two states, one white
square — while the canvas kept its blue cells and amber marker plates. The swatches now carry
`forced-color-adjust: none` (a swatch samples a colour the renderer produces; the label text beside it
keeps its forced colours). Measured after: both hues survive in both modes.

## What §2 asked for and is not here

- **No contour ribbons.** Iso-level ribbons would give the surface a readable quantisation the smooth
  shading does not. Not built.
- **The probe does not drag.** There is a probe, it is placed on the measured peak rather than a
  hard-coded cell, and it prints the value from the same cell its height came from — so the number and
  the geometry cannot disagree. But it is static, and §2 says *"a probe you drag across it"*.
- **§7(b) is not timed.** The precondition is settled — both surfaces demonstrably show the same data
  — but no operator has been put in front of both with a task and a stopwatch.

Also: the peak's `$500k · 30 d` sub-label sits on the ridge behind it and is low-contrast there.

## Cost — and a number I published that was fiction

**This section previously read "0.45 ms/frame … 16.15 ms of headroom against the 60 Hz budget". Both
figures were wrong and the second was meaningless.** Corrected:

| | |
|---|---|
| frame time | **63.7 ms** at 1200×720 |
| renderer | SwiftShader (software) |
| 60 Hz headroom | **REFUSED** — `SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET` |
| real-hardware time | **UNMEASURED** |

Two separate defects, and the second is the worse one.

**1 · The timer was invalid.** It was `gl.finish()` over a 4-frame batch with no warm-up. `gl.finish()`
returns once the command buffer is **flushed**, not once the GPU has finished — a fact this repository
had already written down twice, and which E0, E1, E2 and E8 all handle with a trailing `readPixels`
that cannot be satisfied until the frame exists. E5 and E6 did not. The corrected instrument reports
**63.7 ms, not 0.45** — a factor of 140. A sub-millisecond shadow-mapped, AO'd frame on a CPU
rasteriser was never plausible, and I should have disbelieved it on sight rather than publishing it.

**2 · "Headroom against the 60 Hz budget" was meaningless whatever the timer said.** SwiftShader is a
CPU rasteriser; comparing it to a frame budget measures a machine nobody ships on, and the ratio to
real hardware is not a constant — E0 measured 1.305 ms on an M1 for a scene SwiftShader labours over.
The budget comparison now **refuses with a code** rather than being computed, exactly as absent data
refuses everywhere else here. Real-hardware timing for E5 is unmeasured: E0's and E8's M1 figures came
from manual browser sessions, and this harness has only ever run headless.

The surface is 48 triangles. The expense is the shadow map and AO, not the mesh.

## Reproduce

```bash
node docs/3d/e5/build.mjs && node docs/3d/e5/capture.mjs
```
