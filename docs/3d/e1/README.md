# E1 · THE THEATRE — status: **THE HYBRID WORKS. §7(b) is now a real tension, not a gap.**

`live.png` is the gate. `no-dof.png` is not a control any more — read on.

## What changed: the panels carry the deck's real data

The previous verdict here was blunt — *"the panels carry no information … an operator learns strictly
less from this than from the flat deck"*. That is fixed, and fixed the way §6 rule 4 demands: **the
surfaces are GL and the text is DOM**, mapped onto the rendered quads by a perspective transform.

Not baked glyphs. The words on those panels are selectable, searchable, translatable, screen-reader
addressable, and correct at any zoom — because they are real DOM nodes that the browser rasterised.
An environment that spends those four abilities to buy a third dimension has failed §7(b) before it
starts.

The content is the 3D programme's own state, because it is the only dataset in reach that can be
**verified rather than invented**. §6 rule 8 forbids placeholder numbers in a rendered environment,
and a plausible number in a beautiful frame is the most persuasive lie this codebase can tell.

## The number that makes this checkable

Every other figure in this harness is my arithmetic reported back to me. `rectError` is not: it asks
the **compositor** where it actually put each element and compares that to where the **renderer** says
the surface is.

| panel | shift | scale | element | perspX (×10⁻³) | CoC | DOM blur | rectError |
|---|---|---|---|---|---|---|---|
| P3 · nearest | 0 | 1.00 | 305×290 | −4.3 | 0.0 px | 0.00 px | **0 px** |
| P4 | 0 | 1.00 | 245×335 | −21.8 | 5.5 px | 0.94 px | **0 px** |
| P2 | 0 | 1.00 | 270×355 | +20.2 | 7.1 px | 1.21 px | **0 px** |
| P1 | −0.12 | 0.84 | 315×231 | +31.2 | 12.9 px | 2.21 px | **0 px** |
| P5 | +0.18 | 0.76 | 296×186 | −27.8 | 14.0 px | 2.40 px | **0 px** |

`perspX` is non-zero on every panel and **signed by which side of frame centre the panel sits on**
(+31 on the left, −28 on the right, −4 near the middle). Zero everywhere would have meant the
transforms were affine — labels as stickers on the lens — which is the failure the whole mechanism
exists to avoid. A homography with the perspective terms in the wrong place looks right head-on and
drifts as the surface turns, so it is exactly the bug a plausibility read of the code cannot catch.

## Four things went wrong, and each one is a rule now

**1 · `toFixed(6)` silently made every transform affine.** The perspective coefficients are divided by
the element's pixel width, so on a 400 px panel they land near 1e−7 while the translation terms sit
near 1e3 — nine orders of magnitude apart. Fixed-point rounding quantised the small ones to zero.
Fixed-point rounding is the wrong tool for a matrix whose entries do not share a scale. Caught only by
the test that parses the emitted `matrix3d` back and pushes the element's own corners through it.

**2 · Reusing the harness's `.cell` class hid the entire render.** `.cell` carries an opaque
background, so the first capture was five dark cards with a blue rim: the GGX response, the cast
shadows, the AO in the join and the brand blue itself all sat *behind* flat DOM, surviving only as a
few millimetres of panel edge. That is a 2D layout with a 3D border — it costs the frame everything
the renderer was for while keeping all of its expense. Content must be **glyphs and nothing else**.

**3 · Centred content put two panels into the refusal branch.** P1 and P5 each had two corners behind
the panel standing nearer, so both went dark and three of five workstreams carried nothing. The cheap
fix was to loosen the occlusion test until they passed — a fix to the *instrument*, which ships text
lying across the wrong surface. The placement is **searched** instead: shifts before scales, smaller
before larger, so a panel takes the least intervention that works. `shift 0, scale 1` on the three
inner panels therefore means *needed nothing*, not *was not checked*.

**4 · The blur clamp was doing the work of a scale.** `min(2.4, coc × 0.45)` clamped at the ceiling for
every unfocused panel, so a 5.5 px circle of confusion and a 14 px one came out identically blurred —
the blur said only "not the subject" and the ordering it existed to convey was gone. Normalised
against the scene's own maximum, the ceiling is reached exactly once, by the panel that earned it.

## §7(b): a real tension, stated rather than hidden

**The focus rack and the information requirement fight each other, and DOF wins.** In `live.png` only
P3 is comfortably readable; P2 and P4 are marginal; P1 and P5 are not readable at all. An operator
reading that frame gets one workstream out of five. The rack is doing exactly what §2 asks of it and
the cost falls entirely on (b).

So `no-dof.png` is **not a control** — it is the operator configuration, and it is internally
consistent: DOM blur and the opacity fade are both gated on the lens actually being on, so with
`?dof=0` the text is sharp on sharp geometry and **all five panels read**. Getting that gate wrong
would have put blurred text on crisp geometry — the same contradiction, merely inverted — and it was
caught by asking what the control capture *would* look like rather than by looking at it.

The honest product reading: the wide aperture is a hero frame, not an operator surface. A shipping
version racks focus on interaction and sits at `dof=0` at rest.

## What is still not done

- **No room.** No walls, no ceiling, no volumetric haze — still boxes on a plane, so (a) is
  under-delivered even though (b) now has an answer. This is the remaining work here.
- **DOM cannot be occluded by GL.** There is no depth buffer in the compositor and the canvas is one
  element, so a projected panel necessarily paints in front of *all* geometry. Handled by refusing to
  show occluded content, which is correct but is avoidance rather than a solution. `clip-path` driven
  by the inverse homography would be the real fix.
- **§7(b) is argued, not timed.** No operator has been put in front of both surfaces with a task and
  a stopwatch. Everything above is a reason to expect a good result, which is not a result.

## The reusable part

`packages/gl/src/env/project.ts` is the piece E3–E7 all need: `projectQuad` returns a CSS
`matrix3d` or a **named refusal** (`CORNER_BEHIND_CAMERA`, `DEGENERATE_ON_SCREEN`,
`EMPTY_ELEMENT_BOX`) rather than a wrong transform, plus `signedArea` so a caller can tell a
back-facing surface from a front-facing one before rendering mirror-imaged text. Ten tests, including
the round trip and the `matrix3d` column-major check.

## Reproduce

```bash
node docs/3d/e1/build.mjs && node docs/3d/e1/capture.mjs
```
