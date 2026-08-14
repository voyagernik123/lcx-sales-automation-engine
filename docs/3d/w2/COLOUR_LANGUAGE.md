# ONE PRODUCT, TWO COLOUR LANGUAGES — established, and resolved where the colour is STATUS

> **Measured** 2026-08-15 from the shipping source. Every number in this file is CIE Lab (D65) or Rec. 709
> luminance computed from the actual constants, reproducible from
> `packages/gl/src/look/semantic.test.ts`, which reads `apps/web/src/styles/tokens.css` and
> `apps/web/tailwind.config.js` off disk rather than copying them.
>
> **Depends on** commit `fd7fa0d`: "hex exact" over a shaded mesh is a category error, and the surviving
> invariant is ORDER PRESERVATION. Nothing here re-opens that.

---

## 0 · THE REPORTED DIVERGENCE IS REAL, AND IT IS WORSE THAN REPORTED

The report was: *the 3-D surfaces encode a blocked audit record in burnt orange while every other surface in
the product renders blocked in red.* Verified:

| | |
|---|---|
| E6 THE VAULT, blocked slab | `#C9552B` — `apps/web/src/components/geometry/VaultReliefGl.tsx:118` |
| E3 THE PIPELINE, stalled ramp end | `#C9552B` — `apps/web/src/components/geometry/PipelineReliefGl.tsx:132` |
| the platform's blocked role | `--red` — `apps/web/tailwind.config.js:44`, used at **245 sites** as `*-status-blocked` |
| `--red` light | `#a32035` — `apps/web/src/styles/tokens.css:82` |
| `--red` dark | `#e4687a` — `apps/web/src/styles/tokens.css:132` |

Measured hue distance from `#C9552B`:

```
  vs --red light  #a32035   23.8°
  vs --red dark   #e4687a   30.8°
  vs reference    #FF8A3D   10.0°   <- ITS NEAREST PALETTE HUE IS A DATA COLOUR
```

**So it is not a slightly-wrong red.** `#C9552B` sits inside the `reference` hue family, which
`packages/gl/src/look/colour.ts:98` reserves for "REFERENCE marks — percentiles, thresholds, targets.
Deliberately not a data hue." A blocked audit record and a threshold marker read as the same kind of object.

And one literal is doing **two different jobs the platform keeps apart**: E6 uses it for *blocked* (red in the
flat product) and E3 for *stalled* (amber in the flat product — see §3). The 3-D language does not merely
mistranslate one word; it collapses two.

The code already knew. `VaultReliefGl.tsx:923` describes its own legend as *"three hues became one white
square while the slabs behind them stayed blue, red and steel"*. The author's model was red. The constant
never was.

---

## 1 · THE DISTINCTION THAT DECIDES EVERY CASE

`theme.ts` splits a scene in two — DATA never moves, SCENERY must. That is not enough, and the gap is where
this defect lived.

| category | means | moves per theme? | example |
|---|---|---|---|
| **IDENTITY** | "this is our data" | **never** | `#2C6BFF` LCX blue |
| **STATUS** | a role the whole product shares: blocked, warning, ready | **yes — the platform's value, not the scene's** | `--red`, `--amber`, `--green` |
| **ABSENCE** | "no measurement" | never | `refusal` `#6B7A99` |
| **REFERENCE** | a percentile, a threshold, a target | never | `reference` `#FF8A3D` |

Status moving per theme does **not** violate rule 5. Rule 5 forbids the scene from tinting a *measurement*
to flatter the page — the same value rendering as two colours. A status colour encodes a **category**, and its
value is the platform's own definition of a word, which the platform defines per theme for contrast reasons it
has documented (`tokens.css:126-131` retuned `--red` dark from `#dc5064` because it failed 4.5:1 on the raised
wash). What a scene must preserve is the **role**, not the number. Deferring to the platform is the opposite
of inventing a tint.

**REFERENCE is a legitimate third thing and is not warning.** This is the trap in the whole exercise: an
orange threshold mark looks like an amber warning and is not one. `reference` answers "where is the target",
`conditional` answers "something needs attention". They are 19.7° apart in hue and must stay in separate
surfaces or separate frames — see §5.

---

## 2 · EVERY STATE A 3-D SURFACE ENCODES WITH COLOUR

Seven of the eight environments. `L*` and `C*` are CIE Lab (D65); `h°` is the Lab hue angle. E8 THE FORGE is
absent because it carries no dataset and encodes no state — `3D_VFX_1000X.md` §11.4 already settles that split.
E7 ships as code and is unreachable as a surface today (commit `621363d`), so its rows describe the constants,
not something a reader can currently open.

| surface | state | hex | file:line | category | h° | C* | flat product's answer |
|---|---|---|---|---|---|---|---|
| E1 THEATRE | addressed panel | `#2C6BFF` | `DeckReliefGl.tsx:521` | identity | 293.2 | 85.8 | selection, not status |
| E1 THEATRE | unaddressed panel | `#16203A` | `DeckReliefGl.tsx:522` | scenery | — | — | — |
| E1 THEATRE | coverage caveat (DOM) | `#E0A94A` | `DeckReliefGl.tsx:807` | see §6 | 79.1 | 56.3 | `text-status-conditional` |
| E2 GLOBE | site pin | `#2C6BFF` | `GlobeReliefGl.tsx:401` | identity | 293.2 | 85.8 | — |
| E2 GLOBE | hub / corridor | `#8FA3C4` / `#4C86FF` | `:421` / `:424` | identity + scenery | — | — | — |
| E3 PIPELINE | fresh lead | `#2C6BFF` | `PipelineReliefGl.tsx:131` | identity | 293.2 | 85.8 | — |
| E3 PIPELINE | **stalled lead** | **`#C9552B`** | **`PipelineReliefGl.tsx:132`** | **STATUS — DIVERGENT** | 46.3 | 63.6 | **`status-conditional` = `--amber`** |
| E3 PIPELINE | market cap absent | `#E0A94A` | `PipelineReliefGl.tsx:133` | absence — see §6 | 79.1 | 56.3 | blank cell |
| E3 PIPELINE | both absent | `#5C6880` | `PipelineReliefGl.tsx:134` | absence — see §6 | 275.2 | 14.9 | blank cell |
| E3 PIPELINE | gates / channel | `#31415C` / `#1E2A42` | `:185` / `:186` | scenery | — | — | — |
| E5 SURFACE | the sheet | `#2C6BFF` | `SurfaceReliefGl.tsx:256` | identity | 293.2 | 85.8 | — |
| E5 SURFACE | marker | `#7FB2FF` | `SurfaceReliefGl.tsx:350` | identity | 275.2 | 43.4 | — |
| E4 ORRERY | observed body | `#2C6BFF` | `OntologyOrreryGl.tsx:87` | identity | 293.2 | 85.8 | — |
| E4 ORRERY | core / link | `#7FB2FF` | `:88` / `:89` | identity | 275.2 | 43.4 | — |
| E4 ORRERY | value absent | `#FF8A3D` | `OntologyOrreryGl.tsx:90` | reference/absence — §6 | 56.4 | 70.5 | — |
| E4 ORRERY | withheld | `#6B7A99` | `OntologyOrreryGl.tsx:91` | **absence, correct** | 276.2 | 18.6 | — |
| E6 VAULT | allowed record | `#2C6BFF` | `VaultReliefGl.tsx:117` | identity — see §4 | 293.2 | 85.8 | no flat classifier exists |
| E6 VAULT | **blocked record** | **`#C9552B`** | **`VaultReliefGl.tsx:118`** | **STATUS — DIVERGENT** | 46.3 | 63.6 | **`status-blocked` = `--red`** |
| E6 VAULT | withheld record | `#5C6880` | `VaultReliefGl.tsx:121` | absence — see §6 | 275.2 | 14.9 | — |
| E7 STORM | risk ramp low | `#2C6BFF` | `StormReliefGl.tsx:306` | identity | 293.2 | 85.8 | **same two hexes** — `RiskCalendar.tsx:57` |
| E7 STORM | risk ramp high | `#FF8A3D` | `StormReliefGl.tsx:307` | reference — see §5 | 56.4 | 70.5 | **same two hexes** — `RiskCalendar.tsx:58` |
| E7 STORM | withheld lid / rail | `#6B7A99` | `:285` / `:286` | **absence, correct** | 276.2 | 18.6 | `text-status-conditional` caption |
| E7 STORM | gate | `#2C6BFF` | `StormReliefGl.tsx:288` | identity | 293.2 | 85.8 | — |

### The platform's semantic tokens, both themes

Derived from `tailwind.config.js:39-49` (role → property) and `tokens.css` (property → triple).

| role | property | light | L* | C* | h° | dark | L* | C* | h° |
|---|---|---|---|---|---|---|---|---|---|
| `ready` | `--green` | `#1e7a4a` | 45.2 | 42.6 | 153.7 | `#2db482` | 65.6 | 49.9 | 161.9 |
| `conditional` | `--amber` | `#8a5f00` | 43.6 | 52.4 | 78.4 | `#e6a028` | 71.0 | 69.1 | 76.1 |
| `blocked` | `--red` | `#a32035` | 36.1 | 57.3 | 22.6 | `#e4687a` | 59.7 | 51.7 | 15.5 |
| `deferred` | `--grey` | `#5a6272` | 41.4 | 10.1 | 274.0 | `#94a0b6` | 65.6 | 12.8 | 272.1 |
| `unverified` | `--indigo` | `#4f46e5` | 40.7 | 93.9 | 302.6 | `#818cf8` | 61.8 | 60.5 | 293.6 |

---

## 3 · THE TWO GENUINE DIVERGENCES

### 3.1 · E6 blocked → the `blocked` role

`vaultRecords.ts:18` derives BLOCKED from an action naming a refusal — `workspace.access_refused`, written by
`middleware/workspace.ts` when the compartment gate turns a read away. That is *a governed action that did not
happen*, which is the platform's `blocked` word exactly. The flat audit table has no classifier of its own
(`AuditLog.tsx` renders rows without a verdict colour), so E6 invented the classification — but not the
vocabulary. `blocked` is spoken 245 times elsewhere and it is red.

**Genuine. Resolve to `blocked`.**

### 3.2 · E3 stalled → the `conditional` role

The flat product flags a lead that has stopped moving as a **warning chip**, and every warning chip is
`status-conditional`: `PipelinePulseHeader.tsx:72` renders `border-status-conditional
bg-status-conditional-bg text-status-conditional` for all six codes with no per-code hue.

**Two precision notes, because both are near-misses this repo punishes:**

1. E3's "stalled" is *days since last TOUCH* — `STALL_ONSET = 27` for the count it prints and
   `STALL_DAYS = 45` where the ramp saturates (`pipelineChannel.ts:42-45`). In `salesIntel.ts` that quantity
   is the **`ghosted`** code (:170); the code literally named `stalled` (:182) is days-in-STAGE against the
   stage median, a different measurement. Both are warning chips and both render `conditional`, so the mapping
   is unaffected — but the word does not line up and this file will not pretend it does.
2. `WarningStageMatrix.tsx:68` *does* use `status-blocked` red at the top of a ramp — for the **share of
   deals in a stage carrying a warning** (`r >= 0.75`), a density across a stage, not one lead's staleness. No
   single stalled lead is red anywhere in the flat product. So E3's endpoint is amber, and red stays reserved
   for `blocked`, which E3 has no state for.

**Genuine. Resolve to `conditional` — and it fixes a false claim in the same file.**
`PipelineReliefGl.tsx:473` says colour repeats the height *"deliberately. A single-channel encoding … fails
for anyone reading at a glance or in greyscale."* Measured, that is false today: `#2C6BFF` (Y 0.1827) and
`#C9552B` (Y 0.1909) are **1.035** apart in luminance, so in greyscale the ramp is flat and the promised
redundancy does not exist. Bound to `conditional` it becomes **1.25** light and **2.02** dark — and note the
directions are opposite and both correct: on a dark ground a stalled cube gets *lighter*, on a bright ground
*darker*. Away from the ground, either way.

---

## 4 · WHAT DELIBERATELY DOES NOT CHANGE, WITH THE ARGUMENT

### 4.1 · E7 THE STORM and its flat twin: the `#2C6BFF → #FF8A3D` risk ramp — **NOT status, and changing it would CREATE a divergence**

The strongest-looking candidate and the clearest refusal. `RiskCalendar.tsx:56-58` — the flat counterpart —
carries **the same two literals**, with the comment *"Brand, and shared with `StormReliefGl` by value on
purpose"*, and its header states the reason: *"the only raw hexes left are the two ends of the RISK RAMP,
which are brand and data rather than interface … so a cell here and the slab through it in the 3-D view
cannot disagree about colour."* The flat and 3-D surfaces already speak one language. Retargeting the 3-D end
to `--red` or `--amber` would break the one place in this product where a figure and its 3-D twin were
deliberately made to agree. **Refused.**

It is also not a status: it is a magnitude with no threshold. `reference` is the documented hue for exactly
that, and §1 keeps reference separate from warning.

### 4.2 · `ALLOWED = #2C6BFF` in E6 — identity, not `ready`

`ready` is green and E6 has three verdicts, so the tempting move is allowed→green. **Refused, twice over.**

- **It would assert a finding.** ALLOWED means "a governed action completed and was recorded". Green says
  *healthy*. Painting every recorded action green tells a reader the audit spine reports good outcomes, which
  no one is entitled to conclude from the fact that something was logged.
- **The ordinary case of a dataset is identity.** ALLOWED is the majority of every page of the spine. If it
  were green, the corridor would carry no brand presence at all and the reader would lose the "this is our
  data" anchor that is the *only* thing `#2C6BFF` means. The pattern that generalises across all seven
  surfaces is: **the majority state is identity; the exceptions are status.**

### 4.3 · The absence family — out of category by construction

`refusal` `#6B7A99` means "no measurement" and rule 6 depends on it never reading as a low value. It is not a
status and nothing here folds it in. E4 THE ORRERY's withheld body and E7 THE STORM's withheld lid and rail already use the palette
value exactly and are correct.

### 4.4 · `deferred` and `unverified` are INADMISSIBLE in a lit scene — measured, not preferred

Two of the platform's five roles cannot be used as a mark colour in a scene at all. Both would have shipped as
a plausible mapping.

| role | measurement | consequence |
|---|---|---|
| `unverified` (`--indigo`) | **0.4°** of hue from brand blue in dark (`#818cf8` h 293.6 vs `#2C6BFF` h 293.2); 9.4° light | in a scene where brand blue means "this is our data", an unverified mark is indistinguishable from an ordinary observed one at exactly the moment the distinction matters |
| `deferred` (`--grey`) | chroma **10.1** light / **12.8** dark, *below* `refusal`'s **18.6** — it has no hue signal; what it has is `refusal`'s hue (1.2° light, 3.1° dark) at another lightness | E6, E3 and E7 all already draw a refusal neutral. Two near-neutrals in one frame, one meaning "we chose not to" and one meaning "no measurement", is the confusion rule 6 exists to prevent — and lightness is the discriminator a lit scene does not have (§5) |

`semantic.ts` **computes** these verdicts from the palette rather than declaring them, so a token retune flips
the answer and the test says so. Declared booleans would have been unfalsifiable — the `assertBrandFidelity`
failure mode.

---

## 5 · WHAT "MATCHES THE PLATFORM" CAN AND CANNOT MEAN ON A LIT SURFACE

**It cannot mean the same pixel, and any test asserting it does would be `assertBrandFidelity` a second
time.** `fd7fa0d` measured it: a lit material's radiance is `base colour × illumination`, the whole frame is
then tone-mapped, brand blue leaves the flat path as `#2c68dc` (ΔE76 18.3) and lands 46–88 ΔE from its hex on
the lit path. `hexToLinear` exists and is used — but it converts the token, it does not protect it.

**What transfers:**

- **HUE FAMILY.** Illumination in these scenes is near enough achromatic and the tone map is per channel, so
  the hue survives to within the desaturation the curve causes. A red slab renders as a red slab.
- **ORDER.** The curve is monotone per channel, so a denser mark never renders lighter than a sparser one.
  This is `fd7fa0d`'s replacement invariant and binding a status colour does not touch it.

**What does not transfer: LIGHTNESS.** And this is not a footnote — it is *why admission is decided on hue
alone*. Two albedos of the same hue and different lightness render at overlapping lightnesses depending only
on where each sits relative to the key light. `GlobeReliefGl` proved it in the other direction: it draws its
brand pins at `MARKER_AMBIENT = 120` (`GlobeReliefGl.tsx:463`, against `BODY_AMBIENT = 1.6`) because brand
blue against a plate-level sky returns about 0.02 of linear radiance. A mapping that leaned on "the red is
darker than the amber" would be leaning on the one property the pipeline destroys.

**A second consequence, stated because it is easy to get wrong:** the platform tokens are authored for **4.5:1
text contrast against a background**, not as reflectances. `--amber` light is `#8a5f00` — a very dark
yellow-brown, chosen at `tokens.css:72-79` because `#9a6b00` measured 4.34 on `--page-bg`. Used as an albedo
on a light-theme ground of `#E8EDF6` it renders as a dark mark on a bright plate, which is *correct for a lit
scene* and would look wrong as flat UI text. **The token is the right hue and not a target pixel.** Do not
"correct" it toward the flat appearance.

**The one margin to watch:** `conditional` is **19.7°** from `reference` in dark (22.0° light) — the tightest
legitimate separation in the system. No shipping surface carries both marks in one frame today (E7 uses
`reference` as a ramp end and has no warning mark; E3 will carry `conditional` and no reference mark). A future
surface that wants both must check, and `semantic.test.ts` pins the 19.7° so the margin cannot shrink silently.

---

## 6 · FINDINGS THAT ARE **NOT** PLATFORM DIVERGENCE, RECORDED SO THEY ARE KNOWN QUANTITIES

None of these are resolved here — absence is its own category and §1 says so. They are 3-D-internal palette
drift and they are measured.

| what | measurement | why it is not fixed here |
|---|---|---|
| `#5C6880` for withheld, in **two** surfaces (`VaultReliefGl.tsx:121`, `PipelineReliefGl.tsx:134`) | `refusal`'s hue to **1.0°**, but **7.2 L\*** darker | a private darkening of the absence mark. Rule 6 depends on `refusal` never reading as a low value, and 7.2 L\* down is 7.2 L\* closer to reading as one. It is still absence, not status |
| `#E0A94A` for E3's absent ring (`PipelineReliefGl.tsx:133`), captioned "an amber ring" (`PipelineRelief.tsx:139`) | **0.7°** from `--amber` light, **3.0°** from dark | it *is* the platform's conditional hue, used for an absence. Absence's colour is `refusal`. **This one blocks the E3 fix — see §7.2** |
| absence drawn in **four** hues across the surfaces: `#FF8A3D` (E4), `#E0A94A` (E3), `#6B7A99` (E4/E7), `#5C6880` (E6/E3) | — | one category, four values. Worth one pass by whoever owns the absence taxonomy; not this change |
| `#E0A94A` as DOM caveat text (`DeckReliefGl.tsx:807`) | 0.7° from `--amber` light | the same role `VaultRelief.tsx:72` already moved to `text-status-conditional`. It sits on an always-dark `rgba(4,6,11,0.82)` scrim *inside* the canvas overlay, so a themed token would be wrong there — the correct fix is not a token swap and is out of scope |

---

## 7 · WHAT CHANGED, AND THE EXACT EDITS THIS CHANGE DOES NOT MAKE

### 7.1 · Delivered

- **`packages/gl/src/look/semantic.ts`** (new). The status-role mapping. Reachable as
  `@lcx/gl/look/semantic.js` through the existing wildcard `exports` — **no edit to `src/index.ts` is
  required**, which also keeps it off the barrel chunk that `docs/3d/w2/SUBPATH_COST.md` measured at 87.7 KiB
  a route.
  - `statusAlbedo(role, theme)` → the token's value as a **linear** albedo, resolved per theme.
  - `statusHex(role, theme)` → `#RRGGBB` for a DOM legend swatch, documented as *the role, not the pixel*.
  - `statusAdmission(role)` / `sceneStatusRoles()` → the §4.4 verdicts, **computed from the palette**.
  - `hueAngleDeg` / `chroma` / `hueDistanceDeg` / `greyscaleRatio` → the metrics the invariant is stated in,
    exported so a reviewer re-measures rather than trusts.
  - `HUE_BUCKET_DEG = 15` — `360/24`, the granularity at which hues get separate names. One constant for both
    directions: a surface's status colour must be *within* it of its token, and *outside* it of every data
    colour. **The verdicts are robust to the choice** — every admitted role clears 19.7° and every refused one
    is inside 9.4°, so anything from 10 to 19 gives the same five answers.
  - `STATUS_POLICY` — what a surface prints. It promises hue and order and never a hex, because
    `TONE_POLICY` once ended *"so #2C6BFF leaves the pipeline as #2C6BFF"* and that sentence was on screen
    under P1 for every frame the surface ever drew.
  - The table is **recorded, not read from the DOM.** `getComputedStyle` was refused: this package's vitest
    environment is `node` with no DOM on purpose, the `docs/3d/*` harnesses never load `tokens.css`, and a
    silent fallback would hand a dark harness the light triples.
- **`packages/gl/src/look/semantic.test.ts`** (new). 15 assertions. It parses
  `apps/web/tailwind.config.js` for the role census and `apps/web/src/styles/tokens.css` for the triples, off
  disk, in both themes — so the mapping cannot drift from the platform, and the copy `theme.ts:100-103` makes
  by hand now has the check its comment could not perform. The repo root is **found**, not counted in `..`s,
  and a missing token file **throws** rather than degrading into a skip.

**Proven to fail, six ways** (each mutation applied, run, restored):

| mutation | failure |
|---|---|
| `blocked` light `163 → 164` | `blocked (--red) in light: expected [0.3712…] to deeply equal [0.3662…]` |
| drop `unverified` from the mapping | `expected ['blocked','conditional',…(2)] to deeply equal […(3)]` |
| `HUE_BUCKET_DEG 15 → 40` | `expected ['ready'] to deeply equal ['blocked','conditional','ready']` |
| point the test at a moved token file | `cannot locate apps/web/src/styles/tokens-moved.css … there is no fallback by design` |
| `--grey` light → a chromatic triple | `deferred (--grey) in light: expected […] to deeply equal […]` |
| `ACHROMATIC_CEILING refusal(18.6) → 60` | `expected [] to deeply equal ['blocked','conditional','ready']` — isolates the chroma branch |

`npx vitest run` in `packages/gl`: **15 files, 278 tests, all passing**. `tsc --noEmit` clean.

### 7.2 · NOT delivered — the surface edits, which are other agents' files

Reported rather than made, per the concurrency constraint. Each needs
`import { statusAlbedo } from '@lcx/gl/look/semantic.js'` and the live theme from
`liveTheme()`/`sceneTheme` that surface already resolves.

**E6 — `apps/web/src/components/geometry/VaultReliefGl.tsx:118`**

```
-  BLOCKED: '#C9552B',
+  BLOCKED: <statusAlbedo('blocked', theme)>      // --red, resolved per theme
```
`VERDICT_HEX` is a `Record<AuditVerdict, string>` consumed at `:587` via `hexToLinear(...)` for the material
and at `:938` as a DOM swatch background, so the smallest correct shape is to make the record theme-dependent
and feed `:587` the linear value directly and `:938` `statusHex('blocked', theme)`. **The AA reading distance
the frame prints re-measures itself** — `:660` computes it from `readPixels`, not from the hex — so this
changes the reported number honestly and silently breaks nothing.

**E3 — `apps/web/src/components/geometry/PipelineReliefGl.tsx:132` and `:133`, as a PAIR**

```
-  const STALLED_HEX = '#C9552B';
+  stalled end  = statusAlbedo('conditional', theme)   // --amber
-  const ABSENT_HEX = '#E0A94A';
+  absent ring  = BRAND.refusal                        // #6B7A99, the palette's absence colour
```
**Both edits or neither.** `#E0A94A` is 0.7° from `--amber` light (§6). Moving the ramp end to `conditional`
while the ring stays put would put two amber meanings 0.7° apart in one frame — a warning and an absence.
Moving the ring to `refusal` puts absence where the palette already says it belongs, and E3 keeps the two
absences apart by **shape**, which `PipelineReliefGl.tsx:410-424` already states is its primary channel
("three shapes, because two absences that a blank cell destroys have to stay apart in three dimensions").

Companion caption edit: **`apps/web/src/components/geometry/PipelineRelief.tsx:139`** reads *"are drawn as an
amber ring"* and must stop saying amber.

**Known non-alignment, stated rather than papered over:** E3's ramp reaches full `conditional` at
`STALL_DAYS = 45`, while the flat product's warning chip fires at `STALL_ONSET = 27`
(`pipelineChannel.ts:42-45`). Binding the colour does not align the threshold, and putting a knee at 0.6 in
the ramp is a design change, not a colour binding. Not proposed here.

**What no surface should do:** bind `deferred` or `unverified` (§4.4), or move E7 THE STORM's ramp (§4.1).
