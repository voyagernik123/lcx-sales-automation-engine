# E1 · THE THEATRE — status: **THE HYBRID WORKS. §7(b) is now a real tension, not a gap.**

`live.png` is the gate. `no-dof.png` is not a control any more — read on.

## What changed: the panels carry the deck's real data

The previous verdict here was blunt — *"the panels carry no information … an operator learns strictly
less from this than from the flat deck"*. That is fixed, and fixed the way §6 rule 4 demands: **the
surfaces are GL and the text is DOM**, mapped onto the rendered quads by a perspective transform.

Not baked glyphs. The words on those panels are selectable, searchable, translatable, screen-reader
addressable, and correct at any zoom — because they are real DOM nodes that the browser rasterised.
(*Selectable* was false until the pointer-events fix below: they were in the accessibility tree and the
print path, and a pointer could not reach them.)
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
| P4 | 0 | 1.00 | 245×335 | −21.8 | 5.5 px | 0.18 px | **0 px** |
| P2 | 0 | 1.00 | 270×355 | +20.2 | 7.1 px | 0.23 px | **0 px** |
| P1 | −0.12 | 0.84 | 315×231 | +31.2 | 12.9 px | 0.41 px | **0 px** |
| P5 | +0.18 | 0.76 | 296×186 | −27.8 | 14.0 px | 0.45 px | **0 px** |

*The DOM blur column used to read 0.94 / 1.21 / 2.21 / 2.40 px. It was reduced by a contrast
measurement — see "The blur ceiling was a reading, not a measurement" below. The CoC column is the GL
lens and has not moved: the panel surfaces are still defocused by up to 14 px.*

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
against the scene's own maximum, the ceiling is reached exactly once, by the panel that earned it. (The
ceiling itself was then wrong by a factor of three — see the contrast measurement below.)

## The blur ceiling was a reading, not a measurement — and it was wrong by a factor of three

`entry.ts` set a 2.4 px DOM blur ceiling "measured by reading it: at 2.4 px an 11.5 px note is still
parseable on a lit panel". Parseable by the person who wrote it, at 100% zoom, already knowing what it
said. Measured as a **contrast ratio** — screenshot the frame, screenshot it again with every text leaf
`visibility:hidden` to obtain the true background including the GL render, keep the pixels that differ and
take the strongest 15% as glyph core — that note came out at **1.47:1** against a 4.5:1 requirement, and
**11 of 18 text runs on this frame failed WCAG AA**:

| run | before | after |
|---|---|---|
| `depth is time; fog is the reading limit on it,` 11.5 px, blur 2.4 px, opacity 0.58 | **1.47:1** | 6.35:1 |
| `E6 · THE VAULT` 11 px | 1.86:1 | 4.73:1 |
| `E5 · THE SURFACE` 11 px | 1.74:1 | 5.45:1 |
| `driven from the same input as the shipping flat engine` 11.5 px | 1.72:1 | 6.39:1 |
| `3D PROGRAMME · 9 ENVIRONMENTS` — unblurred, full opacity | 3.82:1 | 9.12:1 |
| `4 NOT SHOWN — ONLY 5 PANELS: …` — the frame's own caveat | 3.60:1 | 8.73:1 |
| total failing | **11 / 18** | **0 / 18** |

Three separate causes, three separate fixes:

1. **The text colours carried their own alpha** (`rgba(198,212,236,0.78)`) which multiplied with the
   recession opacity. Two dimmers stacked put an effective alpha of 0.45 on the furthest note. The hexes
   are now solid; the lens is the only dimmer.
2. **Blur and opacity were capped independently** when they multiply. The pair is now the largest one
   whose measured core still clears 4.5:1 everywhere — **0.45 px and 0.90** — found by bisection against
   the measurement (1.2/0.86 left five failures, 0.6/0.90 left one). At 11 px, *any* perceptible blur takes
   the glyph core below AA on a dark panel whatever colour the type is, so the DOM blur is now nearly
   invisible and the rack is carried by the GL frame, where the panel surfaces are still defocused by 5 to
   14 px. That is a real cost — sharp type on a defocused surface is a tell — and it is worth less than the
   words.
3. **The three HUD lines needed no lens fix at all**: unblurred and at full opacity they still failed,
   because they sat on a mid-slate sky. `rgba(4,6,11,0.82)` under them, the plate device E7's HUD already
   uses, took all three from 3.6–4.0:1 to 8.2–9.1:1 without moving a hex.

The measurement is now a pass in `capture.mjs`: it decodes both screenshots inside the page
(`createImageBitmap` into an `OffscreenCanvas`, because this repo has no PNG decoder in node), prints every
run's ratio, and **throws below 4.5:1** — and throws if a text run changed no pixels at all. A ratio
regression now fails the build the way `rectError` does.

## Projected text is reachable with a pointer again

`project.ts` justifies its own existence on the grounds that GL text is "unselectable, unsearchable,
invisible to a screen reader". Measured: `document.elementFromPoint` at the centre of all five projected
panels returned `CANVAS#c`, and a mouse drag across the frame selected the empty string — the overlay and
every leaf in it were `pointer-events:none`. Cmd/Ctrl+A still reached 5,674 characters, so the words were
in the document and unreachable with a pointer. The container still ignores the pointer, so it cannot
swallow a gesture aimed at the canvas; the panels no longer do.

## The reading order was the camera's, not the reader's

The panels are sorted far-to-near for the compositor and were **appended** in that order, so DOM order was
camera order: the measured AX tree read E6, E5, E0, E8, E1 while the report's `environmentsShown` reads
E1, E8, E0, E6, E5 and the flat table lists E0…E8 in index order. Three representations of the same rows
disagreeing about sequence, and the announced order changing if the camera moved. Paint order is now a
`z-index` (4, 3, 2, 1, 0 by depth) and the elements are appended in reading order; the AX tree and the
report now agree.

## §7(b): a real tension, stated rather than hidden

**The focus rack and the information requirement fight each other.** The GL rack is unchanged — the
surfaces are defocused by up to 14 px — but the type on them is now held above WCAG AA, so an operator
reading `live.png` gets five workstreams rather than one. What the frame no longer does is *pretend* the
far panels are readable when they measure 1.5:1.

`no-dof.png` is still **not a control** — it is the operator configuration, and it is internally
consistent: DOM blur and the opacity fade are both gated on the lens actually being on, so with `?dof=0`
the text is sharp on sharp geometry. Getting that gate wrong would have put blurred text on crisp geometry
— the same contradiction, merely inverted — and it was caught by asking what the control capture *would*
look like rather than by looking at it.

The honest product reading: the wide aperture is a hero frame, not an operator surface. A shipping
version racks focus on interaction and sits at `dof=0` at rest.

## Two corrections

**The panel content is now DERIVED, because two of its five rows were wrong.** The frame prints "Every
row below is checkable against this repository", and it was rendering E0's frame time as *4.41 ms* —
that is P1's number; E0 measured 1.305 at 1× — and *"E3–E7 NOT STARTED"* after E5 and E6 had shipped.
Invented content in a rendered environment is exactly what §6 rule 6 exists to stop, and a claim of
checkability the reader has to take on trust is worse than no claim. Each panel's state is now read
from that environment's own README first line at build time, so it cannot go stale without the README
going stale with it, and an unparseable README renders a visible refusal rather than a stale row.

**The frame now states its own coverage.** There are five panels of geometry and **nine** environments
(`docs/3d/e0` … `e8`), and the first derived version silently dropped one — a frame presenting itself as
the state of the programme with a shipped environment missing. The geometry is not widened (the five
positions are measured: 100% / 83% / 78% visibility, which a sixth panel would invalidate), so the HUD
prints `9 ENVIRONMENTS` and `4 NOT SHOWN — ONLY 5 PANELS: E2 E3 E4 E7`, the report carries
`environmentsOmitted`, and `rendered.json` records both beside the sha of the bundle that drew them.
Naming what is missing is the only honest version of not showing it.

*This paragraph said "six environments" and quoted a HUD string —
`6 ENVIRONMENTS · 1 NOT SHOWN — ONLY 5 PANELS: E2` — that appears in no capture in this repository:
`grep -rn '6 ENVIRONMENTS' docs/3d` found it only here. A README quoting a rendered frame it did not
look at is the exact failure the paragraph above it was written to correct.*

## The count was wrong in three different ways at once

**1 · The audit was being counted as an environment.** `build.mjs` harvested every README under a
`docs/3d/eN` directory, and `docs/3d/e9` is the **audit**: its first line parses, so it was injected and
the frame rendered `10 ENVIRONMENTS · 5 NOT SHOWN — ONLY 5 PANELS: E2 E3 E4 E7 E9`, with a panel titled
`E9 · THE AUDIT`. E9's own first line says "all 9 environments". The flat table carried the same wrong
set under a sentence promising it "carries every environment". The harvest now requires an `entry.ts`,
which is what an environment is in this tree — the same predicate `harnessRules.test.ts` already uses to
exclude E9 from the harness ratchet.

**2 · The committed PNG disagreed with the committed bundle.** At 5bcb99a `bundle.js` contained ten env
states and rendered `10 · 5`; `live.png` at the same commit printed `9 ENVIRONMENTS · 4 NOT SHOWN`.
Verified by serving HEAD's own bundle and html unmodified — `window.E1.environments` came back with ten
ids — and by reading the committed PNG's pixels. §6 rule 8 is "every claim gets a capture", and the
ratchet only asserts that `live.png` **exists**, so a frame captured before the last build passes 10/10.
`capture.mjs` now writes `rendered.json` with the frame's own counts and the sha256 of the bundle that
produced them, so a stale PNG is a one-line check rather than an archaeology exercise.

**3 · A dropped environment was silent.** `build.mjs`'s own comment promised "a missing README becomes a
visible refusal rather than a row that quietly keeps asserting last month's state", and both skip paths
were bare `continue`s. Replayed over a fixture tree with `e1/README.md` absent: `derived 2 environment
states: E0 E2`, no refusal, E1 simply gone from a frame that prints "Every row below is checkable against
this repository". Either skip now fails the build by name.

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
back-facing surface from a front-facing one before rendering mirror-imaged text. **Eight** tests,
including the round trip and the `matrix3d` column-major check. (This said "ten". There are eight —
`packages/gl/src/env/env.test.ts`. A test count is the cheapest possible claim to check and I did not
check it.)

## Reproduce

```bash
node docs/3d/e1/build.mjs && node docs/3d/e1/capture.mjs
```
