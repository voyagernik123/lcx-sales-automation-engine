# THE SOLID — LCX as one object

**Status:** written 2026-08-03 for approval. Supersedes the previous version of this file,
which was wrong in a way worth recording.

---

## 0. Why the last plan was slop, precisely

It proposed nine phases of putting a third axis on individual pages. A margin surface is a
nicer chart. The Refusal Lattice is a nicer table. Every idea was correct and every idea was
**incremental** — the platform would end up being exactly what it already is, with better
pictures on it. Eight modules, eight surfaces, one at a time.

The error was the question. I asked *where does a dimension belong on these pages*. The
question is *what are these five things, and what do they share*:

| | What it actually is |
|---|---|
| **Palantir Gotham** | no dashboard. You start from an object and **traverse the ontology**. |
| **Apple** | objects are **continuous**. Nothing "navigates" — things come toward you. |
| **CIA watch floor** | the officer walking in is **told what changed while they slept**, ranked by consequence, before reading a word. |
| **F500 sales desk** | the pipeline is a **living thing you work**, not a report you read. |
| **Hedge fund** | you **mark your book daily**, and can walk from the top number down to the single position that moved it. |

**None of them is a set of pages.** Each is one continuous space you occupy, that knows what
changed, and that you interrogate rather than browse.

So the third dimension is not a chart feature. It is the **substrate that stops LCX being
eight modules.** Everything in this plan is a consequence of that one idea.

---

## 1. THE ONE IDEA

> **One building. Eight rooms. One camera. One clock. One mark.**
> You never navigate. You move, and depth is the only thing that changes.

Concretely: a single persistent spatial substrate with **fixed, memorised positions** for every
compartment and every object class. Four continuous scales of the same camera — no page loads,
no route transitions, no modal stack:

```
  SCALE 0  THE MARK      the whole business as one object. One number. Lights on in rooms.
  SCALE 1  THE FLOOR     eight rooms, their state, what moved overnight, who is inside.
  SCALE 2  THE DESK      one compartment's working surface, standing on its own risk.
  SCALE 3  THE OBJECT    one engagement / reply / lead, its evidence, its neighbours.
```

Zoom is the *only* verb. `⌘0..3` sets scale; the existing `g`-chord picks the room. What is
today a route change becomes a movement, and the operator never loses their place — because
in a building you cannot lose your place.

**Why this is not a gimmick, in one line:** eight compartments currently share a nav bar and
nothing else. Every cross-compartment fact this platform already knows — that governance can
read GPS client material through `/v1/audit`, that a marketing draft names an asset GPS is
quoting, that the same partner appears in a rate card and a delivery — is **structurally
invisible** because each module renders its own page and stops at its own edge. A building has
no edges. That is the information a flat platform loses, and it is the whole business.

---

## 2. THE FIVE ORGANS

Everything else falls out of these. No module owns them; they are the platform.

### I. THE MARK — *hedge fund*
One number, marked daily, for the whole business: the book, the pipeline, the programme, the
services book, marked once per day and **stored** so it has a history. Today no such number
exists and nothing marks anything.

The rule that makes it not a vanity metric: **the mark is walkable.** From the number you
descend — scale 0 → 3 — to the single position that moved it, and every step is the same
camera. A number you cannot walk down from is a slogan. And the mark **refuses** rather than
estimating: unmarked components are a stated hole in the number, not a zero.

### II. THE WATCH — *CIA*
You open LCXOS and, before reading a word, **you see which rooms have lights on.** What
changed while you slept, ranked by consequence, expressed as the state of the building rather
than a notification list. A refusal that fired overnight is a room with a wall across its door.
An expiring holdings declaration is a light going amber in governance.

Ranked by consequence, not recency — and consequence is already computable: money at risk,
liability tier, deadline proximity, whether a refusal blocked a client-facing act.

### III. THE TRAVERSE — *Palantir*
Every object knows its neighbours, and in a building the neighbour has **a direction and a
distance.** The ontology already exists — subjects, actions, entitlements, provenance grades,
`LINK_RESOLVERS`, the search-around API. What is missing is that traversal is currently a list
of links; here it is **a move through space you can retrace**, which is what makes an
investigation reproducible rather than a browsing history.

### IV. THE FLOOR IS YOUR RISK — *hedge fund, again*
The surfaces from the previous plan survive — but **not as charts on pages.** They are the
*floors* of the rooms. The GPS desk stands on its margin surface. Distribution stands on the
k-surface with the k=1 ridge under your feet. Marketing stands on the refusal lattice. You are
never looking *at* your risk; you are standing on it, and the shape of the ground is the
information.

This is also what kills the slop objection permanently: a floor cannot be decorative. If it
has no data it is **a hole you can see through**, which is the fog spec generalised — absence
is absence of geometry, never flat ground.

### V. THE OBJECT — *Apple*
One material, one light, one physics, no seams. It is an app you own, not a site you visit:
the icon, the launch, the DMG, the window that has no chrome fighting the wordmark, and the
fact that every one of the four scales is obviously **the same piece of metal.**

---

## 3. THE LAWS

Six, each enforceable by a test, because a spatial platform with no laws becomes a video game.

1. **ONE CAMERA.** Orthographic always — perspective makes a far quantity look smaller than an
   equal near one, so the projection itself falsifies. Four scales, three seats per scale
   (PLAN/SECTION/ISO on `1/2/3`), **no free orbit ever.** An uncitable camera makes every
   screenshot unreproducible, and this platform's whole value is that its outputs are
   reproducible.
2. **SECTION IS THE DEFAULT.** The flat read is what loads. Nobody is ever forced into a
   dimensional read to do their job, and every surface has an equivalent table one key away.
   Dimensionality is an *affordance*, not a tax.
3. **POSITION IS PERMANENT.** A room is always in the same place; an object class is always at
   the same depth. Spatial memory is the entire payoff, and it is destroyed by one re-layout.
   Positions live in a versioned manifest, and moving one is a deliberate migration.
4. **HEIGHT IS QUANTITY. COLOUR IS ONLY EPISTEMIC STATE.** measured = solid · stale = dashed
   hairline · **absent = void with a hatched floor and no geometry.** A zero-height cell is a
   lie; a hole is the truth. This is also why a placeholder can never look expensive: **a
   placeholder has no height to light.**
5. **A REFUSAL HAS A LOCATION.** committed settles ≤120ms · refused is **a wall on the exact
   boundary that stopped it** · undetermined is the void. The platform's doctrine is that
   refusals are real; in a building they are things you can walk into.
6. **ONE CLOCK.** A single global time dial. Pull it back and the **whole building** shows you
   that moment — every room, one instant, one stated window. Not eight independent date
   pickers. And the dial refuses to travel to a time before a compartment was instrumented,
   with a labelled cliff rather than an empty room.

---

## 4. THE BUILD

Seven phases. Each one ships something an operator can use; none is a prerequisite nobody sees.

### P0 · THE MEASURE — *nothing ships until this closes*
`apps/web/scripts/check-bundle.mjs` filters to `.js` only, so **`public/` is never measured** —
`public/fonts` is already **724KB, invisible**. A 40MB asset tree lands green. Every byte this
programme produces goes straight through that hole. Count every shipped byte, separate budgets
for code and assets, mutation-test the counter with a deliberate 5MB file.

### P1 · THE SUBSTRATE — the camera, the scales, the manifest
The four scales, the three seats, the position manifest, the one clock, and the shared
projection + material layer. Pure, tested, ~8KB, consumed by everything after. This is where
the laws become code rather than prose. The honesty vocabulary already exists three times in
three shapes (`metricPolicy.ts:26`, `gpsFeel.ts:38`, `marketingGates.ts:1997`) — P1 gives that
one geometry rather than inventing honesty.

### P2 · THE FLOOR — eight rooms, real positions, real state
Scale 1 becomes real: the building, the rooms, who is inside — **including machines**, because
`machineMap()` grants the shared key `operate` on 7 of 8 compartments and appears on no screen
today. The capability ladder is elevation. `governance → /v1/audit → GPS client material` is
drawn as a service passage, because that is a fact about the building that no matrix can hold.

### P3 · THE WATCH — the arrival
Overnight change as building state, ranked by consequence. Includes the consequence engine
(pure, testable) and the honest refusal: an unlit room means *nothing changed*, never *nothing
happened* — and the difference is stated.

### P4 · THE FLOORS ARE RISK — the surfaces, as ground
The margin surface under the GPS desk (**zero new simulation** — `CostModel` has no price term,
price enters on one line, so one sorted cost array yields every price column exactly, and
`p10Margin = price − p90Cost` is an identity the module already guarantees). The refusal
lattice under marketing (**cost zero** — pure resolvers, enumerated at build, CI fails on
drift). The k-surface under distribution. The spine in command, with the **assumption hatch**:
beams from `DEFAULT_DURATIONS` draw open-hatched, owner-entered triples draw solid, so the
render is a progress bar on its own credibility.

### P5 · THE MARK — the number, and the walk down
Daily marking with history, and the descent from the number to the position. This is the phase
that makes the platform a book rather than a set of tools.

### P6 · THE TRAVERSE — the ontology as movement
Neighbours with direction and distance; a retraceable path; the investigation as an artefact
you can hand to someone else.

### P7 · THE OBJECT — *Blender's only real home*
The traffic-light inset first, and it is not 3D at all: `titleBarStyle: "Transparent"` with
zero `data-tauri-drag-region` hits means **macOS chrome is sitting on your wordmark.** You
cannot claim a machined object while that is true. Then the `g`-window bar (a printed "1.2s"
does not teach a duration; a bar draining over the real `GO_WINDOW_MS` does), the DMG plate
(`bundle.macOS.dmg` has positions and **no background key** — default white, and it is the last
surface before Gatekeeper stops a colleague), and the icon.

---

## 5. What this costs, honestly

**No WebGL. No three.js. No Blender for anything carrying a number.** Nested SVG with one
shared camera, 5–9KB per surface, on already-lazy routes, deterministic and monochrome —
therefore **re-derivable by an auditor**, which a baked bitmap can never be. Current headroom
is 22KB initial of an 850KB budget, and 167 lazy chunks already exist.

The expensive part is not rendering. It is **P1 and P3** — a camera that never lies and a
consequence ranking that is honest. Those are engine problems, and this repo is good at engine
problems.

**What I am not promising:** that scale 0→3 will feel like one piece of metal on the first
attempt. Continuous zoom across four semantic scales is genuinely hard, and the failure mode is
a platform that feels like a toy. The mitigation is law 2 — **the flat read is the default**,
so the dimensional layer can be wrong for a while without anybody's day being worse.

---

## 6. Killed, and why the kills matter

- **Perimeter as terrain** — all 15 `PERIMETER_PROFILES` cells are unreviewed placeholders.
  Zero walls, zero gates. Terrain implies survey; drawing a wall smuggles the legal finding
  `perimeter.ts` refuses to encode. **Fog is the absence of geometry, never ground with a cloud
  over it** — never passable, never impassable, never clearing with time (staleness makes it
  thicker), and never with ground underneath.
- **Delivery-drift solid** — `ProgressDisplay`'s `blocked` variant has no `pct` field. The
  geometry demands exactly the lie the engine withholds.
- **Treasury runway surface** — arithmetic over two localStorage guesses. *Two axes existing is
  not the test.*
- **Funnel cone** — `marginal` is linear in budget; it would imply a saturation the model does
  not model.
- **Governance vol surface** — compartment id is categorical. A slope between `gps` and
  `governance` is a lie with lighting.
- **Free orbit, perspective, specular, particles, a 3D logo, animated money, anything moving
  while an operator reads a table.**

---

## 7. The order, and what to approve

**P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7.**

P0 because the budget currently cannot see a single byte of this. P1 because eight lanes
otherwise invent eight cameras.

**If you approve one thing, approve P0 + P1 + P2.** That is the building existing at all — the
camera, the laws, and eight rooms you can move between with machines visible inside them. Once
the substrate is real, every surface in P4 is a floor rather than a feature, and the platform
has stopped being eight modules.
