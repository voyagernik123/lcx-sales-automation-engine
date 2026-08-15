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
| E4 ORRERY | observed body | `#2C6BFF` | `OntologyOrreryGl.tsx:89` | identity | 293.2 | 85.8 | — |
| E4 ORRERY | core / link | `#7FB2FF` | `:90` / `:91` | identity | 275.2 | 43.4 | — |
| E4 ORRERY | value absent | `#FF8A3D` | `OntologyOrreryGl.tsx:149` | **absence drawn in the `reference` hex — §9.3** | 56.4 | 70.5 | — |
| E4 ORRERY | withheld | `#6B7A99` | `OntologyOrreryGl.tsx:150` | **absence, correct** | 276.2 | 18.6 | — |
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
| absence drawn in **four** hues across the surfaces: `#FF8A3D` (E4), `#E0A94A` (E3), `#6B7A99` (E4/E7), `#5C6880` (E6/E3) | — | one category, four values. **§9.3 sharpens this and it is worse than stated here**: `#FF8A3D` is not merely off-category, it is the *high end of the risk ramp* on E7 and `RiskCalendar`, so one hex means both "the largest measured value" and "no measurement". Still needs one pass by whoever owns the absence taxonomy |
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

---

## 8 · THE LIGHT PLATE — the measurement the light theme never had

> **Measured** 2026-08-15 through the shipped shaders on a real driver: headless Chromium on
> `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)`, scene target RGBA16F,
> `readPixels` off a 1024×512 framebuffer — the same instrument shape as `docs/3d/brand-fidelity.mjs`.
> Rule 8 asks for a capture per claim. The light theme had none, in a platform that **defaults to light**.

§5 ends on the right rule — *the token is the right hue and not a target pixel* — for a colour used as an
**albedo**. This section is the case §5 does not cover: a token used as the **plate**, which is the one place
a platform colour is supposed to come back out unchanged.

### 8.1 · The composite tone maps the plate, and only the dark theme hides it

`packages/gl/src/look/pipeline.ts:98-100` is `lit = plate + scene + bloom·gain`, then `lcxToneMap(lit)`,
then `lcxEncode`. The tone map is on the sum, so the **background is graded along with everything else**.
`c/(1+0.4c)` is near-identity only where `c` is small, and that is the whole reason nobody has seen this:

```
  dark  --page-bg #090e1b  ->    9  14  27     0 / 0 / 0 levels lost
  light --page-bg #f4f6fb  ->  213 214 217    31 / 32 / 34 LEVELS LOST
```

The dark canvas has **30 bytes of margin**: the tone map costs 0 levels at or below byte 57, 1 level from 58,
2 from 86. Every "the plate is the page's own canvas" claim in this repo is conditional on that margin, and
none of them says so.

### 8.2 · The capture, and the positive control that makes it evidence

`SignatureBackdrop` is the shell's ambient layer on all 78 routes. It draws in dark and is refused in light.
Both were rendered through the shipped `createPipeline` with the shipped uniforms:

| configuration | brightest px | darkest px | distinct | weakest of the 7 certified light text roles |
|---|---|---|---|---|
| **dark, as shipped** (control) | `9 14 27` | `3 5 13` | 30 | — raised, never lowered |
| light, `vignetteDepth 0.62` | `213 214 217` | `149 150 153` | 193 | **3.669:1 … 1.803:1 — every pixel fails** |
| light, `vignetteDepth 0.00` | `213 214 217` | `213 214 217` | 1 | **3.669:1 — flat, and still failing** |
| light, precompensated flat | `244 246 251` | `244 246 251` | 1 | 4.932:1 — *identical to the page* |
| light, precompensated `+4` lift | `248 250 255` | `248 250 255` | 1 | 5.107:1 |
| light, precompensated + vignette | `244 246 251` | `209 212 218` | 103 | 4.932:1 … **3.591:1** |

**The control is the point.** The dark row reproduces, byte for byte, the capture recorded independently at
`apps/web/src/components/layout/__tests__/ambientBackdrop.test.tsx:26-28` — brightest `[9,14,27]`, darkest
`[3,5,13]`, 30 distinct colours. A harness that could not produce that number is a harness whose light rows
mean nothing. It also caught a defect in itself: the first pass sampled the vignette key at `1 − v` and
reported the mirror of it, and the recorded capture is what exposed it, not a reading of the shader.

**Row three is the finding.** At *zero* amplitude — vignette off, scene cleared, nothing but the plate — the
light backdrop still paints `213 214 217` over a `244 246 251` page. The brightest pixel it can produce is
**23 levels below** the neutral byte 236 that `--green` `#1e7a4a` needs to hold 4.5:1. There is no amplitude,
including zero, at which this layer is neutral in the light theme.

### 8.3 · A light plate is buildable, and the price is exactly four levels

`packages/gl/src/look/precompensate.ts` inverts the curve, and its perimeter is met here exactly — bloom gain
is 0, the field is constant, nothing accumulates. `inverseToneMap(plate) − plate` into the scene target lands
the composite on `244 246 251`, the page, byte-exact (row four). So the refusal is not "it cannot be done".

The direction that survives is **additive**, and it is the mirror of the dark invariant — it needs no list of
roles, which is the same property that makes the dark argument hold for a role added tomorrow:

> Every pixel at or above the luminance of `--page-bg` can only **raise** a dark-on-light contrast ratio.

It clears the text floor on measurement: `--green` 4.932 → 5.107:1, no certified pair loses. It is refused on
the two constraints that are not text contrast.

- **Range, and the binding channel is not the obvious one.** Headroom to `#ffffff` is **11 / 9 / 4** levels,
  so **blue** binds. A lift that holds the canvas tint clips after four: `244 246 251 → 245 247 252 →
  246 248 253 → 247 249 254 → 248 250 255`, five distinct colours, then blue pins and only R and G climb —
  the tint `B−R` collapses from 7 to 3. §5 says lightness does not transfer through this pipeline; here the
  8-bit ceiling takes the **hue** as well.
- **The elevation ladder pays for it.** canvas→card is `1.0813:1` today and `1.0443:1` at +4 — roughly halving
  the only step separating a card from the page, which `tokens.css:96` requires to stay "visibly distinct".
- **Banding.** Four steps across a 1200 px field is a Mach contour every 300 px and this pipeline has no
  dither. An isolated one-level edge on a flat field reads *more* than a dense ramp, not less.

At the only amplitude that is safe — the flat precompensated plate — the layer is byte-identical to not
mounting it. **Refused, and the refusal now has its capture.**

### 8.4 · Moving the token is the worse trade, and it is a §1 violation

`--green` is `status.ready` (`apps/web/tailwind.config.js:51`): **63** `text-status-ready` sites plus 14 direct
`-green` utilities. It *means* ready, which puts it on the DATA side of the line `packages/gl/src/look/theme.ts`
draws — *"a theme may NOT tint a mark to suit its background, because that would be editing the measurement to
flatter the page."* Moving a status colour to make room for a decorative layer is that sentence, exactly.

It would also not be one token. Four roles sit inside 4.93–5.82:1 on the light canvas — `--green` 4.932,
`--amber` 5.224, `--grey` 5.671, `--indigo` 5.815 — so the corridor is set by a **cluster**:

```
  move --green                              corridor 10 -> 16 levels
  move --green --amber                                -> 25
  move --green --amber --grey                         -> 27
  move --green --amber --grey --indigo                -> 45
```

Against a tone-map cost of **31 levels at zero amplitude**, no single-token move even reaches the starting
line. The real proposal is *repaint the light theme's text palette darker to make room for a background*.

### 8.5 · What this changes elsewhere, and it is not this file's to change

`apps/web/src/components/__tests__/glContextBudget.test.ts:37` records *"the floor is now 1 everywhere"*, and
its census puts 70 routes at one live context "from the shell's backdrop". That census is a **static
mount-site walk and is theme-blind.** `SignatureBackdrop` returns `null` before `LinearPlate` exists, so
`import('@lcx/gl')` and `useFlatChart`'s `import('@lcx/gl/flat/shared.js')` never fire and `sharedRenderer()`
is never called. **On the platform's default theme the backdrop contributes 0 contexts on all 78 routes**, and
the 87,072 B barrel `SUBPATH_COST.md` prices is never fetched there at all. The census is not wrong about the
ceiling; it is wrong about the floor, in the theme most readers are in.

---

## 9 · E4 THE ORRERY — a MATERIAL defect, and the one hex that means four things

> **Measured 2026-08-15** on `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader
> driver)`, scene target RGBA16F. Every number below is CIEDE2000 through
> `packages/gl/src/look/categorical.ts` — the implementation validated against the Sharma/Wu/Dalal vectors —
> read off framebuffer bytes, not computed from constants. Floor and statistic are
> `CATEGORICAL_FLOOR_DE2000 = 10` at the `SEPARATION_PERCENTILE = 0.05` fragment, from
> `docs/3d/w2/CATEGORICAL_SEPARATION.md` §3–4.

### 9.0 · The instrument, and why its numbers can be checked against the ones already published

A Playwright/SwiftShader harness — written for this section, **not yet committed**; see §9.6 — renders the
**same** 48×64 unit sphere under E4's own rig with only the
material swapped, one pass per material, and reads the whole 128×128 framebuffer back through the present
shader `OntologyOrreryGl.tsx` itself uses. Three things make it an instrument rather than a script:

- **It re-derives the provenance check.** Before any orrery number is printed it renders the Globe marker rig
  and compares its centre pixel to `docs/3d/brand-fidelity.json`'s recorded `litCentre` for all seven palette
  entries. **7/7 reproduce**, byte for byte. If they did not, the rig would not be the recorded one and the
  run exits 1.
- **It reads the materials out of the component** — every `material: { … }` block, brace-matched, plus the
  `lightColour`/`ambientGain`/`lightDir` literals. Nothing is retyped, so it cannot go stale against an edit,
  and re-running it after a change *is* the verification. (A field may be a ternary or a shared literal;
  reading `.core` off a literal yields `undefined`, which reaches the shader as NaN and renders **black with
  no GL error**, so the shape is resolved rather than assumed.)
- **The coverage mask is measured, not assumed.** "Not black" would exclude the darkest fragments of a mark,
  and on a dark rig those are exactly where two colours collapse. So the mask is taken by rendering one
  material under **two different clear colours**: a fragment the sphere covered is byte-identical between
  them, a background fragment is not. It returns **14,040** fragments — the same count §5a of
  `CATEGORICAL_SEPARATION.md` reports, from an independent derivation.

**What it does not establish**, carried forward from `CATEGORICAL_SEPARATION.md` §7 because it applies
here unchanged: this is a single sphere under a rig, not a frame of the real geometry — the absent mark is a
facing torus and the withheld mark a cylinder, and comparing *corresponding fragments* is only meaningful if
both marks are the same shape. The sphere is `sphere(1, 48, 64)`, finer than the `sphere(1, 20, 28)` the
component uploads, because it is the recorded instrument's sphere and the point is comparability with the
published rows. `shadow: null`, `ao: null`, no depth prepass, one driver.

**And it reproduces the published rows to the decimal**, which is what makes the rest of this section
comparable to them rather than a second opinion:

| recorded in `CATEGORICAL_SEPARATION.md` §5b | recorded | this instrument |
|---|---|---|
| orrery dark `core`/`withheld` | 6.2 / **7.2** / 8.3 | 6.23 / **7.21** / 8.31 |
| orrery light `core`/`withheld` | 7.9 / **8.6** / 10.3 | 7.87 / **8.55** / 10.29 |
| orrery light `observed`/`withheld` | 5.8 / **13.0** / 13.6 | 5.75 / **12.95** / 13.56 |
| orrery light `link`/`withheld` | 11.9 / **13.7** / 16.8 | 11.94 / **13.65** / 16.76 |
| orrery dark `link`/`withheld` | 12.2 / **13.8** / 17.2 | 12.15 / **13.84** / 17.20 |

One thing had to be recovered to get there, and it is stated because it changes what every number in §5
means: the recorded rows are taken with **the key light down the view ray**, not with the surface's own light
direction. §9.4 measures what happens when you use E4's actual key instead, and it is not a footnote.

### 9.1 · The defect was the metalness, and the roughness was not a co-defendant

`core` `#7FB2FF` (a MEASURED count) and `withheld` `#6B7A99` (NO MEASUREMENT EXISTS) are ΔE2000 **20.9** apart
in the palette — clear of the floor twice over — and arrived **7.21** apart in dark and **8.55** in light.
The proposed mechanism was `metalness 0.36` next to `roughness 0.22`, and roughness had to be cleared as a
suspect rather than assumed innocent: 0.22 is a fairly polished surface, and a polished surface returns the
light's colour rather than its own.

**The curve, p05 against the shipped withheld drum, both themes, one variable at a time:**

```
  metalness, roughness held at 0.22          roughness, metalness held at 0.36
  metal   dark    light                      rough   dark    light
  0.36    7.21    8.55   <- shipped          0.10    6.79    7.78
  0.32    8.12    9.12                       0.14    6.80    7.80
  0.28    9.03    9.78                       0.18    6.89    7.94
  0.24    9.94   10.43                       0.22    7.21    8.55   <- shipped
  0.22   10.38   10.69                       0.26    7.41    9.27
  0.20   10.73   11.02                       0.30    7.41    9.86
  0.18   11.13   11.25                       0.34    7.41    9.94
  0.16   11.59   11.60                       0.42    7.60   10.03
  0.14   11.86   12.02                       0.50    7.85   10.23
  0.12   12.26   12.26                       0.60    8.40   10.02
  0.08   12.92   12.76
  0.04   13.57   13.16
  0.00   14.21   13.64
```

**The whole legal roughness range is worth 1.6 in dark and never clears the floor.** One metalness step of
comparable size is worth 5.7. So the hypothesis is confirmed and the competing one is refuted, with the
number: turning the core matte would have changed the look and left the defect in place. Dark crosses the
floor at metalness ≈ **0.235**, light at ≈ **0.26**.

The mechanism is the one `lit.ts` states about itself — *"metals have no diffuse lobe — the energy went into
the specular"*. Metalness *m* replaces *m* of the albedo with a mirror of the environment, and the
environment is the **same for every body in the frame**, so any two marks carrying it converge on it. It is
the same defect `MARKER_AMBIENT 120` produces on E2 by a different route: a fragment whose colour is mostly
the room is not a datum.

### 9.2 · The setting chosen, and what the core actually loses

**`roughness 0.22` unchanged, `metalness 0.36 → 0.08`** (`OntologyOrreryGl.tsx:676`).

The competing constraint was real: the core *is* the distinguished object and metalness was part of how it
said so. Measured, that constraint turns out to point the **other way**.

| | shipped 0.22/0.36 | chosen 0.22/0.08 |
|---|---|---|
| vs `withheld`, p05 dark / light | **7.21 / 8.55** ❌ | **12.92 / 12.76** ✅ |
| vs `withheld`, min dark / light | 6.23 / 7.87 | 9.91 / 9.48 |
| vs `observed` — an ordinary body — p05 dark / light | 9.55 / 10.50 | **13.70 / 13.93** |
| vs `link` (same hex, so MATERIAL ONLY): p95 dark, and % of the mark ≥ 2.3 apart | 9.88, **99.7%** | 2.77, **5.6%** |
| specular within 10% of clipping, % of the mark | 0.85% | 0.48% |

**The core is more distinguished after this, not less.** The mirror was dragging it toward the same washed
sky the ordinary bodies sit in, so `core`/`observed` — the pair a reader actually resolves, since both are
spheres among spheres — rose from 9.55 to 13.70 in dark. What the core gives up is its difference from a
**link**, which shares its hex `#7FB2FF`: that separation was 99.7% of the mark and is now 5.6%. A link is a
3.2 px tube and the core is the largest sphere on the frame, so this is a distinction nothing was reading.

**Why roughness stays at 0.22 rather than dropping to sharpen the highlight.** Measured at metalness 0.08,
roughness is now a live variable and its own curve says 0.22 is already the right end of it:

```
  rough   vs withheld p05 (d/l)   specular ≥90% of clip, % of mark (dark)   px on a 30 px body
  0.10    11.88 / 11.97           0.17%                                     1.2
  0.14    12.10 / 12.16           0.23%                                     1.6
  0.18    12.40 / 12.33           0.37%                                     2.6
  0.22    12.92 / 12.76           0.48%                                     3.4   <- kept
  0.26    13.36 / 13.15           0.54%                                     3.8
  0.30       — / —                0.43%  (light 0.88%, the light maximum)     3.0
  0.34    14.01 / 13.79           0.17%                                     1.2
  0.42    14.25 / 14.01           0.00%                                     0.0
```

Separation keeps rising with roughness while the highlight dies — at 0.42 the specular stops clipping at all
and the core becomes another matte ball. **A highlight too tight to land is not a distinction**: the layout
floors a body at 9 CSS px, and 0.17% of a 30 px body is one pixel.

> **CORRECTION, 2026-08-15.** This paragraph used to end "0.22 sits where the highlight is largest", nine
> lines below a table whose own 0.26 row prints 0.54% against 0.22's 0.48%. It was false in dark, false in
> light, and contradicted by the table it was written under. The sweep derived thirteen metalness steps and
> ten roughness steps in both themes; the transcription above kept five rows and the sentence quoted only
> settings that lose. **0.22 is second-largest in dark and third in light** — 0.26 beats it in both, and 0.30
> is the light maximum at 0.88%. The 0.30 row is restored above; its p05 column is left blank rather than
> filled in, because that figure was not in the run I have and inventing it is the same error one column
> over. The honest reason roughness stays is that it is the gloss the surface was authored with and was
> never the defect — the metalness was. A figure selected out of a table that contradicts it is worse than
> an unmeasured guess, because it arrives carrying the authority of having been measured.

The core's metalness is now identical to an ordinary body's, and that is the correct outcome rather than a
compromise: **every data mark on this surface is a dielectric**, which is `SurfaceReliefGl.tsx:298`'s own
rule — *"Dielectric, so §6 rule 5's hex survives: a metal has no diffuse lobe and #2C6BFF would arrive only
through the specular F0 as a blue-tinted mirror of the sky"*. The core is told apart by its hex
(`#7FB2FF` against `#2C6BFF`), its size, its permanent DOM label, and its polish — roughness 0.22 against
0.34, the biggest specular on the frame. Every one of those is a statement about the datum. Metalness was a
statement about the room.

**Proven to fail** (mutation applied to the component, harness re-run, restored by editing):

| mutation | what the instrument reported |
|---|---|
| `metalness: 0.08` → `b.isCore ? 0.36 : 0.08` | `core   #7FB2FF  rough 0.22  metal 0.36` then `dark  core / withheld   6.23   7.21   8.31   VIOLATES` |
| restored | `core   #7FB2FF  rough 0.22  metal 0.08` then `dark  core / withheld   9.91  12.92  18.35   ok` |

Because the harness parses the component, the mutation moves the measurement rather than a copy of it.

### 9.3 · `#FF8A3D` for ABSENT — the collision is real, it is worse than "annotation", and it does not move here

**What it encodes on this surface.** `magnitudeOf` maps `confidence: 'Low'` → `{ state: 'absent' }`, and the
facing ring at `OntologyOrreryGl.tsx:149` is the only thing that draws it. **Four** records in
`apps/web/src/data/states.ts` carry that confidence, so the mark is on the frame. The claim it makes is
**absence**: no measurement exists. `categorical.ts` derives the palette's own answer from chroma —
`#FF8A3D` is 70.5, far above the density ramp's floor of 40.2 — and files it as `annotation`.

**It is worse than annotation-versus-absence.** `StormReliefGl.tsx:350` and its flat twin
`RiskCalendar.tsx:58` use this exact literal as the **high end of the risk ramp** — the most severe *measured*
day. §2 of this document lists both rows and §4.1 **refuses** to retint the ramp, for a good reason. So one
hex carries *"the largest value on the scale"* on two shipping surfaces and *"there is no value"* here. That
is §6 rule 6's failure — absence reading as a value — one level above a single frame, and §6 of this document
had it filed as "one category, four values", which understates it.

**The obvious remedy fails on measurement.** The absence family has exactly one member, `refusal` `#6B7A99`,
and this surface has already spent it on the withheld drum. `refusal` at ten exposures, drawn with the absent
ring's own material, p05 dark/light, measured **after** the §9.2 fix:

```
  stops   hex        vs withheld      vs core          verdict
  -2.4    #2e3645    14.00 / 17.02    29.36 / 32.12    clears everything — and is nearly black
  -1.8    #3a4355    11.09 / 13.98    26.55 / 28.22    clears everything — and is nearly black
  -1.2    #485268     7.60 / 10.22    22.99 / 23.70    fails vs withheld
  -0.7    #55617a     4.14 /  5.94    19.23 / 19.45    fails vs withheld
   0.0    #6b7a99     1.45 /  1.07    13.28 / 13.12    fails vs withheld (it IS withheld)
  +0.7    #8698be     6.73 /  6.49     8.23 /  8.48    fails vs withheld AND vs the core
  +1.1    #98add7    11.15 / 10.56     6.33 /  6.38    fails vs the core
  +1.5    #adc4f4    15.60 / 14.64     8.36 /  7.67    fails vs the core
```

Nothing within 1.5 stops of `refusal` clears the floor against `refusal` itself, and the only end that clears
everything is a **near-black** — an absence mark at the bottom of the value scale, which is the failure rule 6
names in as many words. The off-palette greys the product already ships do no better: `#5C6880` measures 2.71
/ 3.90 against the drum and `#4A5568` 7.28 / 9.76. **A separated move needs a second absence entry in
`colour.ts`** — low chroma, ≥ 10 CIEDE2000 from `refusal` through a lit rig, and neither darker nor lighter
than the data ramp.

**The other move is real, is not refused, and is not this file's to make.** §7.2 above proposes exactly it for
E3: the amber absent ring becomes `refusal`, and E3 keeps its two absences apart by **shape**. E4 could take
the same move — `orreryLayout.ts` already separates them by shape on purpose (*"absent is a hollow ring and
withheld is a sealed drum, and neither is a sphere"*), and measured, a grey absent ring clears every governed
pair on this surface now that the core is a dielectric (13.28 / 13.12 against the core, 12.84 against an
observed body). The difference from E3 is the price: **E3's two absences stay two different values; E4's would
become the same value.** Absent against withheld falls from p05 **32.82 → 1.45**, and the reader is left with
shape alone to tell *never measured* from *you are not cleared for this*. That is a product decision, and it
carries a companion edit this agent does not own — `OntologyOrrery.tsx:252` captions the mark to the reader as
*"amber ring"*, so the hex and the caption move in one commit or the surface starts lying about itself.

**What keeps it safe inside this frame, which excuses nothing across the product.** E4 draws no reference or
threshold mark at all — its only claim colours are the five constants at `:89-150` — so `#FF8A3D` is
unambiguous *within* the frame, and the two absence states stay 32.82 / 33.36 apart where two greys would be
1.45. **Recorded, not fixed.**

### 9.4 · The finding the recorded arm cannot see: E4's own key direction

The published rows light the mark **down the view ray**. E4's actual key is `[0.14, -0.966, -0.22]` — nearly
plumb — and its camera sits at 26° elevation or higher (`orreryLayout.ts:618,689`). Under the surface's own
key, at the same rig gains, the same pairs measure:

| `core` / `withheld`, p05 | axis (recorded arm) | E4's key, face-on | E4's key at 26° |
|---|---|---|---|
| dark | 12.92 ✅ | **3.83** ❌ | **7.22** ❌ |
| light | 12.76 ✅ | 10.52 ✅ | 10.68 ✅ |

And **no material clears it**: at metalness 0.00 the dark theme still measures 4.90 face-on and 8.12 at 26°.
Nor does any roughness. The mechanism is not the material — with a near-plumb key, roughly half the visible
disc sits below the terminator on ambient alone, and E4's ambient is `0.52 × DEFAULT_SKY`, so that half is
near-black for **both** colours. p05 then lands in the crushed region and reports the shadow rather than the
mark.

Two honest readings of that, and this document does not pick between them:

- **The statistic was chosen against a bright-end failure.** §3 of `CATEGORICAL_SEPARATION.md` argues p05
  because the worst fragment of a convex dielectric is its specular highlight. Against a *dark-end* failure
  the same statistic behaves differently: it excuses 5% of the mark at the top and charges full price at the
  bottom. A two-sided statistic would be a different line, and inventing one silently here would make these
  numbers incomparable with every other row in the programme.
- **Or the dark rig genuinely under-lights this scene**, in which case the remedy is the ambient or the sky
  and belongs to E4's rig, not to a material — and it would move every pair on the surface at once.

Either way it is **not fixed here and not claimed to be.** What §9.2 fixes is the violation as the programme
measures it, in both themes, on the arm every other published number was taken on; §9.4 is a second, larger
question that the arm those numbers were taken on cannot ask.

### 9.5 · Reachability, because two of these marks are not equally live

- **The absent ring draws.** Four `confidence: "Low"` records in `apps/web/src/data/states.ts`.
- **The withheld drum does not.** `restricted: true` appears **nowhere** in `apps/web`, `packages` or `data`
  except `ontologyOrrery.test.tsx:338,362`, and `orreryLayout.ts` says so itself: *"WITHHELD IS AN ARM NOTHING
  IN THIS ONTOLOGY CURRENTLY SETS, AND IT STAYS"*. So the pair that violates the invariant is live in the
  code and in the test and **has never been on a reader's screen**. That is not a reason to leave it — the arm
  exists precisely so the day a restricted record arrives it is not reported as never-measured — but a claim
  that a reader was misled would be false, and this section does not make it.

### 9.6 · Delivered, and the four edits this change does not make

**Delivered**

- **`apps/web/src/components/geometry/OntologyOrreryGl.tsx:676`** — `metalness: b.isCore ? 0.36 : 0.08` →
  `metalness: 0.08`. Roughness untouched. The two violating rows clear the floor in both themes and the min
  rises above 9.4; every other cross-state pair on the surface is unchanged or better. `tsc --noEmit` clean;
  `ontologyOrrery.test.tsx` 30/30, the geometry suites 123/123, `doctrine-lint` clean.
- **`OntologyOrreryGl.tsx:92-148`** — the `#FF8A3D` collision recorded at the constant, with the family
  measurement, the E3 precedent, and the caption coupling, so the next reader does not "fix" it into a
  violation.
- **This section.**

**NOT delivered — files this agent does not own**

| file:line | what it now says | what it should say |
|---|---|---|
| `docs/3d/w2/CATEGORICAL_SEPARATION.md:234-235` | orrery `core`/`withheld` **VIOLATES** at 7.2 dark / 8.6 light | 12.92 / 12.76, **ok** — with the `metalness 0.36` rows kept as the before-state |
| `docs/3d/w2/CATEGORICAL_SEPARATION.md:262` | "`core` is drawn at `roughness 0.22, metalness 0.36` (`:575-576`)" | the line moved to `:661,676` **and the metalness is 0.08** — the sentence is now a description of a fixed defect and should say so |
| `docs/3d/w2/CATEGORICAL_SEPARATION.md:152` | "the best failing one is Orrery's `core`/`withheld` at **8.6**, so only 8.7–10.3 preserves those verdicts" | with Orrery fixed, the band that preserves the remaining verdicts is set by Storm's `tile`/`lid` at 10.3 alone |
| `docs/3d/w2/CATEGORICAL_SEPARATION.md:295` | "Orrery's core pair fails at `metalness 0.36`" | fixed 2026-08-15; §9 of `COLOUR_LANGUAGE.md` carries the curve |

**And the instrument itself is not committed.** It is written and it produced every number above, but
`docs/3d/w2/` is outside this agent's file set, so it currently exists only in this session's scratchpad as
`orrery-material-sweep.mjs`. It should land at **`docs/3d/w2/orrery-material-sweep.mjs`** — it is the only
thing that makes §9.1–9.4 re-measurable, and it is written to be run after an edit rather than before.

**Two edits this section explicitly does NOT propose:** moving `#FF8A3D` (§9.3 — it needs a palette entry or
a caption edit, and the grey it would move to is measurably worse inside the frame), and changing E4's rig to
address §9.4 (that would move every pair on the surface at once and needs its own measurement).
