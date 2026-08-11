# E1 · THE THEATRE — status: **RENDERS, DOES NOT PASS ITS GATE**

`live.png` is the gate. Read it before reading anything else here.

## What works

Five panels at graded depths on a lit deck, real cast shadows, and depth of field racking to the
nearest one — `focusPanel: "P3"`, `cocPx: 0.0` on it and 5.5–14 px on the rest, so the focus rack
§2 describes as the mechanism is demonstrably working. `glError: 0`. 1,212 triangles.

The instrumentation is the best thing here and worth keeping: per panel it reports `eyeDistance`,
`cocPx`, `visiblePct`, `inShadowPct`, `offFrame`, the screen bounding box and a sampled RGB. That
is verification a machine can assert on, rather than a claim that a picture looks right.

## Why it fails §7

> **(a) a stranger stops scrolling — (b) an operator still gets their answer at least as fast**

It fails (b) outright, and (b) is the clause that stops this programme becoming a showreel.

**The panels carry no information.** They are five flat slabs. Two are saturated brand blue and
dominate the frame; three are dark. Nothing on them is a workstream, a gate, a risk or a decision.
An operator learns strictly less from this than from the flat deck, so by the plan's own rule it
would have to ship behind a toggle defaulting to off — which is a way of saying it is not done.

It also under-delivers (a). There is no room: no walls, no ceiling, no volumetric haze, and every
panel is roughly the same size at roughly the same height, so the arc does not read. It is boxes
on a plane, not a theatre.

## What it actually needs

The panels must carry **the deck's real data**, and §6 rule 4 fixes how: text stays in the DOM,
projected from the same matrix. So E1 is not "more geometry" — it is a hybrid where GL renders the
lit panel SURFACES and the existing panel content is projected onto them, exactly as E8 projects
the mark onto the disc face. That is the real work and it has not been done.

Until then this is a lighting study, and it is labelled as one.

## Reproduce

```bash
node docs/3d/e1/build.mjs && node docs/3d/e1/capture.mjs
```
