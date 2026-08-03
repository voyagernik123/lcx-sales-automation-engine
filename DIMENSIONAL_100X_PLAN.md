# THE DIMENSIONAL INSTRUMENT — implementation plan

**Status:** written 2026-08-03 for approval. Nothing here is built.
**Synthesised from:** 10 per-module design lanes (`scratchpad/dim-*.md`) and the Blender
feasibility lanes (`scratchpad/bl-*.md`).
**Standard:** Palantir · Apple · CIA · a Fortune 500 sales desk · a hedge fund's crown jewel.

---

## 0. The first-principles finding

Ten lanes went looking for places to add a dimension. Every one of them found the same
thing instead, and it is not what I expected:

> **The engines already compute the extra dimension and throw it away.**

- **GPS.** `CostModel` (`underwrite.ts:229`) has **no price term**. Price enters the
  simulator on exactly one line — `underwrite.ts:809 marginCents(p.priceCents, cost)`. So one
  sorted cost array yields *every* price column exactly: `pLoss(price)` **is** the cost
  survival function and `p10Margin = price − p90Cost` is an identity the module already
  guarantees (`:691`). The surface is not an upgrade of the band chart. It is the band chart's
  own arithmetic, un-collapsed. **Zero new simulation.**
- **Command.** `launchSim.ts:191-200` computes each task's start, finish and binding
  predecessor on every run and keeps `durSum` and `critCount`. **2,000 runs in, three numbers
  out.**
- **Intel.** `ach()` returns three hypothesis probabilities summing to 1 (`alpha.ts:255-346`).
  Three non-negatives summing to one is *natively a point in a triangle*. `.50/.45/.05` and
  `.50/.05/.45` have identical verdict **and** identical margin (`:336`) and are opposite
  pictures. A scalar margin destroys a 2D position.
- **Sales.** `deal_events` is already written on every transition (`routes/deals.ts:172,285,
  411,469,496`) and `kpi_daily_snapshots` already holds the funnel dated and daily
  (`schema.ts:522`). **The time axis needs no new table.**
- **Marketing.** The abuse resolvers are pure with no I/O (`abuse.ts:389,559`), so the entire
  verdict space can be **enumerated at build time**.
- **Governance.** `machineMap()` (`entitlements.ts:59-65`) grants the shared key `operate` on
  7 of 8 compartments and **appears nowhere on `/access`**, because the table's rows are the
  human roster.

So this is not a visualisation project bolted onto a data project. It is **recovering
information the platform already paid for and is currently discarding.** That is why it can
be cheap, and it is why it can be honest.

### The two-sided test, in final form

1. Does the third dimension carry information the flat version **loses**?
2. Does the geometry **remove a false implication** the flat version adds?

Either is sufficient. The marketing lane found the second: four clearance cards in
`grid lg:grid-cols-4` (`MarketingCrisis.tsx:1069`) encode a sequence CDC CERC forbids. A flat
layout that loses nothing can still lie.

### What the analogy actually maps to

| | The real content |
|---|---|
| **Palantir** | a navigable ontology and provenance on every figure → Compartment Plan, ACH solid |
| **CIA** | compartmentation, the sand table, ICD-203, Admiralty grading → governance as space, fog-as-void |
| **Hedge fund** | the volatility surface, and marking your own book honestly → margin solid, calibration surface |
| **Apple** | the artefact is *machined*: one material, one light → THE PLATE, the DMG, the window chrome |
| **F500 sales** | the pipeline as a flowing volume, forecast discipline → pipeline flow surface |
| **LCX** | regulated: everything prints, everything is defensible → print plates, client mode |

### What this is NOT

**No WebGL. No three.js. No Blender for anything data-bearing.** Every top-ranked idea is
hand-projected SVG, 5–9KB, on an already-lazy route, deterministic and monochrome — therefore
**re-derivable by an auditor**, which a baked bitmap can never be. Blender's role is narrow
and real: the DMG plate, the app icon, artefact covers. Nothing that carries a number.

---

## 1. P0 — THE MEASURE. *Nothing ships until this closes.*

`apps/web/scripts/check-bundle.mjs` filters `readdirSync(assets)` to `.js` only. **`public/`
is never measured** — `public/fonts` is already **724KB, invisible to the budget**. A 40MB
render tree would land green.

I have spent this entire week defending that ratchet. It has a hole in it, and every asset
this programme produces goes straight through the hole.

- Count every shipped byte: `public/`, images, fonts, glTF, everything. Separate budgets for
  code and for assets, both enforced, both printed.
- A per-route asset budget, because "the page is 5KB of SVG" must stay true.
- The existing `MAX_INITIAL_KB=850` / `MAX_CHUNK_KB=440` untouched. Current: **828KB initial,
  22KB headroom**, 165 lazy chunks.
- Mutation-test the new counter: add a 1MB file to `public/` and prove it goes red.

**Exit:** a deliberate 5MB asset fails CI. Then, and only then, phase 1.

---

## 2. P1 — THE PLATE. The grammar, as code.

One shared, pure, tested projection + material layer that every later phase consumes. Six
clauses, each enforceable by a test:

1. **Orthographic or it does not ship.** Perspective makes a far bar shorter than an equal
   near bar — the projection itself falsifies the quantity.
2. **Three named seats — PLAN / SECTION / ISO, on keys 1 / 2 / 3. No free orbit.** An
   uncitable camera makes every screenshot unreproducible. **SECTION (flat) is the DEFAULT**,
   so nobody is forced into a dimensional read to do their job.
3. **One material.** Matte token fill, 1px hairline, no specular, no emissive. Depth comes
   from hairline and occlusion — which is also exactly why it survives black and white.
4. **Height is the quantity. Colour is only the epistemic state.** measured = solid ·
   stale = dashed hairline · **absent = void with a hatched floor and no geometry.**
   A zero-height cell is a lie; a hole is the truth. This is also what kills "a placeholder
   looks expensive": **a placeholder has no height to light.**
5. **A refusal has a location.** committed = settles ≤120ms · refused = a wall *on the
   boundary that stopped it* · undetermined = the void. Consumes the existing `gpsFeel.ts:38`
   vocabulary rather than inventing one.
6. **Reduced motion is an equivalence, not a downgrade.** Honour `prefers-reduced-motion` via
   `juice.ts:190`; juice stays off by default.

The honesty vocabulary already exists three times in three shapes — `metricPolicy.ts:26-58`,
`gpsFeel.ts:38-42`, `marketingGates.ts:1997`. **P1's job is to give that vocabulary a
geometry, not to invent honesty.** One definition, three consumers.

---

## 3. P2 — THE MARGIN SOLID. The proof case.

Three sheets (p10/p50/p90) over **price × effort-overrun**, cut by the break-even plane.
Below the existing `Band` (`GpsUnderwriting.tsx:1031`).

Four reads no slice gives:
- **The ambiguous region** — where p10 is below the plane and p90 above, the two intersection
  curves bound the set of prices whose profitability is **undetermined**. Today that is one
  boolean per render (`:1049`).
- **Two slopes and their ratio** — dollars of price per percent of overrun.
- `fixedCostCents` shifts the sheets **rigidly** while overrun **spreads** them. Identical
  cents, different shape.
- The iso-P(loss) contour.

**Cost: ~5KB SVG, zero initial bytes, ~1KB payload, no new simulation.**
Never claims a forecast (both axes are placeholders *today*), never a smooth surface past the
sample grid, never a recommended price. Refuses absolutely on `isRefusal`; collapses to a line
on `isZeroVarianceEffort`; drops the y-axis when `hoursPerDay` is null. Refuses with the words
**SURFACE NOT DRAWN** rather than an empty frame — a frame with nothing in it reads to a
client as "margin is flat".

Ships with its **print plate**: axonometric, margin=0 contour, the quote's distance from the
cliff, `PLACEHOLDER GEOMETRY` overprinted in **dashed stroke** while the placeholder flags
hold, because dashed survives a photocopy and tint does not. **Client mode strips the solid**
(MiCA Art 66(2), breachable negligently).

---

## 4. P3 — THE REFUSAL LATTICE. The thesis, in one object.

5 embargo states × 4 holdings states × 3 stances = **60 cells, each holding the verdict
`assessMarketAbuse` returns for one unchanged sentence.**

Same words. Clear at one corner, **€700,000 of personal liability** at another. Flatten it to
three tables and you lose the entire thesis — that the text column is *constant*. Two axes are
independent registers owned by different people: that is the volatility-surface argument in a
categorical domain.

**Cost zero.** The resolvers are pure, so enumerate at build, emit isometric SVG. Stamped with
`MARKET_ABUSE_RULESET_VERSION` (`abuse.ts:95`) + SHA + instant, and **CI re-runs the
enumeration and fails on drift** — so the picture cannot outlive the rule it depicts.

This is the single best expression of what the platform is for: the two worst MiCA violations
are invisible to a wording review, and this makes the invisible axis the visible one.

---

## 5. P4 — THE SPINE and THE ACH SOLID. Recovering what is thrown away.

**The Spine (command).** Axonometric: length = mean duration, lane = dependency structure,
**cross-section = criticality**, **gap = literal slack**. Four channels on four geometric
properties. No flat form holds all four, because two are extents and one is a *separation* —
and separations need places. Cross-section rather than colour, so it prints.
**The assumption hatch:** beams from `DEFAULT_DURATIONS` (`:29-41`) draw open-hatched;
owner-entered triples draw solid. **The render is a progress bar on its own credibility** —
the day you type real effort triples, the picture visibly hardens.
**Never a calendar grid**, because mean-of-max ≠ max-of-means. ~10KB lazy, ~30 pure engine
lines adding `meanStart` / `meanFloat` / `layer`.

**The ACH Confidence Solid (intel).** The triangle of three hypotheses is the floor; height is
evidence mass (Σ support-weight × Admiralty confidence). Each active evidence item is a vector
from the centroid toward the vertex it leans to — **the vector sum must land on the verdict
point.** So the render is a *construction that can be checked*, not an illustration.
Probabilities are normalised, so one weak item and six strong ones give the same coordinates:
**height is the only channel that separates them.** Exports as a one-page engraved **Evidence
Assay** which **refuses to print if a cited observation id will not resolve**.
A wobble must never be read as: the hypothesis being false; the counterparty being weak — a
wobble indicts *our collection*; risk in any financial sense; or deception.

---

## 6. P5 — THE COMPARTMENT PLAN. The building, not the matrix.

`TEAM` is three people × 8 compartments = 24 cells, so **nothing dimensional beats the table
at showing the grid** — and the lane said so. What the table structurally cannot hold:

- **Non-member occupants.** `machineMap()` gives the shared key `operate` on 7 of 8
  compartments and appears nowhere, because the rows are the roster.
- **The capability ladder as elevation.** `CAP_ORDER` is ordered; compartment id is
  **categorical** — which kills the tempting "governance vol surface", since a slope between
  `gps` and `governance` would be a lie with lighting. Height is honest only as the ladder.
- **Inter-compartment information flow.** `entitlements.ts:78-82`: `governance` owns
  `/v1/audit`, whose rows carry GPS `checkPerformed` and `disclosureTextUsed` **verbatim**. So
  holding governance yields a read of GPS client material, and `gps.machineAccess:false` does
  not cover it. **That is a fact about the building, not about a member** — no matrix can hold
  it.

Isometric: 8 rooms, 3 floors = the ladder, doors = grants, occupants **including machines**,
GPS→governance drawn as a **service passage**, `capSecondTier`'s clamp as a literal ceiling,
and `regulatory`'s `apiPrefixes: []` (`workspaces.ts:149`) as **a door with no wall**.
Inline SVG, no dependency. Must never imply the building is *secure* — only who can reach what.

---

## 7. P6 — SALES FLOW · K-SURFACE · CALIBRATION

- **Pipeline Flow Surface** — stage × date × volume, off `deal_events` + `kpi_daily_snapshots`,
  **no new table**. Kanban deletes time; trend lines collapse stage into separate series; only
  the coupling shows *propagation* — **a jammed pipeline and a healthy one have identical
  totals and identical trend lines.** Labelled cliff at instrumentation start, holes for
  missing snapshot dates, table below 14 dates.
- **The K-Surface (distribution).** This module has one measured quantity: audited status
  transitions. `routes/distribution.ts:124` generates its channel scorecard from **index
  arithmetic** (`3 + ((i*2)%3)`) — `i % 3` in a table's clothing. So the reframe is that here
  3D renders **the geometry of the assumption space, not growth** — a stronger honesty
  position, and reproducible *by construction* because the engines are seeded
  (`mulberry32(seed ?? 42)`). `k = links × conversion × referral` over its two unknown axes;
  the **k=1 ridge is an exact hyperbola**; the declared params give **k = 0.21**. Analytic,
  1,600 multiplies, no Monte Carlo. The emission **breach frontier** layers on the same axes.
- **Calibration Surface (sales).** mcap × vol/mcap band, height = asserted weight, fill =
  `sampleWon`. The weights are hand-transcribed constants whose own comment admits
  `n=1, noise; nudged up but not trusted` (`propensity/weights.ts:10`). Two non-commensurable
  values — a heatmap must demote one.

---

## 8. P7 — THE OBJECT. Where Blender finally earns its place.

Ordered by *felt every day*, and the first item is not 3D at all:

1. **The traffic-light inset.** `tauri.conf.json:24` sets `titleBarStyle: "Transparent"`,
   `TopNav.tsx:83` is an `h-12` header whose first child is the mark + wordmark, and
   `grep data-tauri-drag-region apps/web/src` returns **zero hits**. The OS window controls sit
   on your logotype and the top bar may not be draggable. **You cannot claim a machined object
   while macOS chrome overlaps your wordmark.** Zero bytes. Needs one screenshot of the built
   app, because `Transparent` and `Overlay` differ and nobody has looked.
2. **The `g`-window bar.** `CheatCard.tsx:126` prints "within 1.2s". A printed number does not
   teach a duration; a 120×6px bar draining over the real `GO_WINDOW_MS` does — and that window
   is exactly why `g`+digit fails for a new operator. Manual only, never the printed sheet.
3. **The DMG plate.** `bundle.macOS.dmg` has positions and **no `background` key** — the install
   window is default white, and it is the last surface before Gatekeeper refuses a colleague who
   got the file via Slack. One ink, no bevel. **Blender.**
4. **The app icon**, and artefact covers. **Blender.**

---

## 9. P8 — ADVERSARIAL, GATE, SHIP

Attack lanes: can any render imply precision it lacks · can a void be mistaken for zero · can
a placeholder look expensive · does every plate print in B/W · does any seat produce an
uncitable screenshot · does the asset budget actually hold. Then the full gate **including
e2e**, and the reachability pin at `keyboardday.spec.ts:1235` if the action count moved.

---

## 10. What I killed, and why it matters that I did

- **Perimeter as terrain** — my own third-ranked bet. `PERIMETER_PROFILES` is 15 cells and
  **all 15 are unreviewed placeholders**: zero walls, zero gates. Terrain implies survey, and
  drawing a wall smuggles the legal finding `perimeter.ts` explicitly refuses to encode.
  **Fog spec, owed anyway:** fog = *no position on file*. Never passable, never impassable,
  never clearing with time (staleness makes it **thicker**), never informed by a neighbour, and
  decisively — **never with ground underneath.** Fog is the absence of geometry: a hole in the
  table, not a cloud above it.
- **Book-as-3D-portfolio** — unordered categoricals; occlusion destroys what the table keeps.
- **Delivery-drift solid** — `ProgressDisplay`'s `blocked` variant has **no `pct` field**. The
  geometry demands exactly the lie the engine withholds.
- **Treasury runway surface** — arithmetic over two localStorage guesses. *Two axes existing is
  not the test.*
- **Funnel cone** — `marginal` is linear in budget, so it would imply a saturation the model
  does not model.
- **Readiness plates** — no snapshot history exists to extrude.
- **Governance vol surface** — compartment id is categorical; a slope would be a lie.
- **Engagement sculpture** — a hairball with manners.

---

## 11. Sequence, and the one thing to look at first

**P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8.**

P0 is not optional and not negotiable: the budget currently cannot see a single byte this
programme produces. P1 before any surface, or eight lanes invent eight grammars.

**If you only approve one thing, approve P0 + P1 + P3.** The Refusal Lattice costs zero bytes,
needs no live data, is enumerated at build and drift-checked in CI — and it is the clearest
statement this platform can make about what it is: *the same sentence, clear at one corner and
€700,000 at another.*
