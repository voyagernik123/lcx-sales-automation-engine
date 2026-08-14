# CATEGORICAL SEPARATION — the invariant `ORDER SURVIVES` does not imply

**Measured 2026-08-15.** Instrument: a Playwright/SwiftShader harness that renders the *same* sphere
under the *same* rig with only the base colour swapped, one colour per pass, and reads the whole
128×128 framebuffer back. Pairs are compared **at corresponding fragments** — identical geometry,
identical light, 14,040 covered fragments each — because that is the only comparison a reader can
actually make. Driver: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …))`, scene target RGBA16F.

**Provenance check before anything else:** the harness's centre pixel reproduces
`docs/3d/brand-fidelity.json`'s recorded `litCentre` byte triple for **all seven** palette entries —
`#c8ebff`, `#f4ffff`, `#c2cafd`, `#ffffd8`, `#e8f5ff`, `#c6ccee`, `#c1c1cc`. Same rig, same numbers,
independently re-rendered. And the CPU model in `packages/gl/src/look/categorical.ts` reproduces the
flat-composite separations to the digit — 13.34, 17.91, 24.08, 52.56, 43.50, 57.96, 38.65 — through
the *live* `toneMapComposite`, which is what `categorical.test.ts` pins.

---

## 0 · The finding, reproduced — and one correction to how it was stated

The review's two numbers reproduce **exactly**:

| pair | palette ΔE76 | litCentre ΔE76 |
|---|---|---|
| `brand` / `refusal` | **68.2** | **9.8** |
| `brandBright` / `refusal` | **32.4** | **6.1** |

The finding is real. Two corrections to the framing, both of which the numbers force:

1. **ΔE76 is the wrong metric, and it is wrong in the direction that hid this.** On
   `brand`/`refusal` it reads 68.2 where CIEDE2000 reads **14.2** — a factor of **4.8**. CIE76 has
   no chroma weighting, so it charges full Euclidean price for a b\*-axis gap the eye discounts, and
   the palette's two must-be-distinct colours are both blues. Every fidelity number this repo has
   published — `brand-fidelity.json`, `tonemap.ts`'s header, `colour.ts`'s transform table — is
   CIE76. **Trust CIEDE2000.** Everything below is CIEDE2000 unless the column says ΔE76.

2. **`litCentre` is the worst fragment on the mark, not a typical one.** The measurement rig lights
   along the view axis, so the centre pixel of a sphere is the specular peak — the one place a
   dielectric is *supposed* to show the light's colour instead of its own albedo. Adopting that as
   the statistic would condemn every correct lit material ever written. The invariant below is
   therefore stated on the **5th-percentile fragment**, and **the finding survives it**: `brand` /
   `refusal` under the shipped Globe marker rig is 4.56 at its worst fragment and **7.95 at p05**,
   still under the floor.

---

## 1 · The full pairwise table, both metrics

All 21 palette pairs. `palette` = the hexes themselves; `litCentre` = the centre fragment of a lit
sphere under `GlobeReliefGl`'s marker configuration (PIN_MAT roughness 0.42 / metalness 0.05,
`lightColour [6.6, 6.2, 5.5]`, `MARKER_AMBIENT 120`, plate-derived sky).

| pair | categories | palette ΔE76 | palette ΔE00 | litCentre ΔE76 | litCentre ΔE00 | ΔE76 / ΔE00 |
|---|---|---|---|---|---|---|
| `brand` / `brandBright` | density (same) | 51.5 | 21.0 | 15.0 | **10.5** | 2.5× |
| `brand` / `brandDeep` | density (same) | 53.6 | 25.2 | 21.5 | **14.8** | 2.1× |
| `brand` / `reference` | density / annotation | 139.0 | 54.9 | 33.1 | **25.2** | 2.5× |
| `brand` / `refusal` | **density / absence** | 68.2 | 14.2 | 9.8 | **7.1** | **4.8×** |
| `brand` / `rule` | density / scenery | 67.1 | 26.8 | 15.2 | **14.3** | 2.5× |
| `brand` / `plate` | density / scenery | 83.9 | 37.4 | 17.7 | **15.1** | 2.2× |
| `brandBright` / `brandDeep` | density (same) | 50.9 | 49.4 | 32.0 | **21.1** | 1.0× |
| `brandBright` / `reference` | density / annotation | 107.9 | 47.4 | 20.1 | **14.3** | 2.3× |
| `brandBright` / `refusal` | **density / absence** | 32.4 | 20.9 | 6.1 | **5.1** | 1.6× |
| `brandBright` / `rule` | density / scenery | 52.9 | 49.5 | 24.7 | **18.0** | 1.1× |
| `brandBright` / `plate` | density / scenery | 71.1 | 58.5 | 22.0 | **15.7** | 1.2× |
| `brandDeep` / `reference` | density / annotation | 110.9 | 63.7 | 49.7 | **36.0** | 1.7× |
| `brandDeep` / `refusal` | **density / absence** | 36.6 | 25.3 | 26.0 | **16.0** | 1.4× |
| `brandDeep` / `rule` | density / scenery | 15.5 | 5.1 | 9.0 | **4.3** | 3.0× |
| `brandDeep` / `plate` | density / scenery | 30.3 | 14.4 | 21.6 | **12.8** | 2.1× |
| `reference` / `refusal` | **annotation / absence** | 87.6 | 41.9 | 25.5 | **19.9** | 2.1× |
| `reference` / `rule` | annotation / scenery | 100.6 | 60.4 | 41.2 | **31.5** | 1.7× |
| `reference` / `plate` | annotation / scenery | 101.7 | 64.2 | 33.0 | **25.2** | 1.6× |
| `refusal` / `rule` | absence / scenery | 29.3 | 24.2 | 18.8 | **13.7** | 1.2× |
| `refusal` / `plate` | absence / scenery | 44.0 | 33.7 | 18.1 | **12.9** | 1.3× |
| `rule` / `plate` | scenery (same) | 18.9 | 11.6 | 12.9 | **8.6** | 1.6× |

Two things this table says that the two-row version did not:

- **Every pair collapses, not only the flagged ones.** `brand`/`reference` — the pair with the
  largest hue separation in the palette — goes 54.9 → 25.2. The lit path compresses *everything*
  toward the neutral axis; what makes `brand`/`refusal` the serious one is that it starts nearest.
- **`brandDeep` / `rule` is 5.1 apart at the palette, before any lighting.** That is by design —
  `rule`'s own comment is "structure — axes, rules, ticks. RECEDES" — and it is why scenery is
  excluded from the invariant in §4.

---

## 2 · The category partition, with the evidence

`colour.ts`'s own comments state the intent for each entry. Read literally:

| key | `colour.ts` says | category |
|---|---|---|
| `brand` | "The anchor. Every data encoding starts here." | `density` |
| `brandBright` | "High end of the density ramp — brand blue lifted, same hue family." | `density` |
| `brandDeep` | "Low end. Not black: a data colour that reaches black is indistinguishable from absent." | `density` |
| `reference` | "REFERENCE marks — percentiles, thresholds, targets. **Deliberately not a data hue.**" | `annotation` |
| `refusal` | "REFUSAL / withheld. Reads as **'no measurement'**, never as a low value." | `absence` |
| `rule` | "Structure — axes, rules, ticks. Recedes." | `scenery` |
| `plate` | "Plate background, before the gradient." | `scenery` |

`categorical.ts` **derives** this rather than transcribing it, in three steps, each with a margin:

1. **Scenery** = a key that names a `SceneTheme` field. `plate` and `rule` do; nothing else does.
   This is the same derivation `semantic.ts` uses for its `DATA_KEYS`, deliberately — two hand
   derivations of one boundary is how boundaries rot. `theme.test.ts` fails first if it breaks.

2. **Density** = a remaining key named after the anchor (`brand*`). The palette's naming convention
   *is* the statement the comments make.

   **Hue was tried first and is worse, with the number.** `brandBright` sits **18.0°** of Lab hue
   from `brand`, *outside* `semantic.ts`'s own `HUE_BUCKET_DEG` of 15 ("the granularity at which
   hues get separate names"). A hue-bucket derivation would split the ramp it exists to hold
   together and file the top of the density scale as a separate claim. This is recorded so nobody
   re-tries hue.

3. **Absence** = a remaining key with **less chroma than the least chromatic ramp member**. An
   absence mark has no hue to be read by; that is what makes it read as absence rather than as a
   value. Measured: the ramp floor is `brandDeep` at chroma **40.2**; `refusal` is **18.6** (2.2×
   below), `reference` is **70.5** (1.8× above). **Any cut between 19 and 70 gives the same two
   answers.** Taking the floor from the ramp rather than from `refusal` itself is what keeps this
   non-circular — `semantic.ts`'s `ACHROMATIC_CEILING = chroma(BRAND.refusal)` can never refuse
   `refusal`.

4. Everything left makes a claim and is not the ramp: **annotation**.

**Result:** `{brand, brandBright, brandDeep}` = one scale. `{reference}`, `{refusal}` = two other
claims. `{rule, plate}` = no claim. Seven cross-claim pairs are governed; ten pairs are not.

---

## 3 · The threshold, and it is a judgement

**Floor: ΔE2000 ≥ 10.** Stated as a judgement, because a chosen number presented as a derived one is
worse than a chosen one. Three arguments point at the same place:

1. **It is 4.3× the just-noticeable difference.** CIEDE2000's perceptibility threshold is ≈ 2.3 for
   a trained observer on a split field with the two halves touching. A reader of a lit scene has
   none of that: the marks are in different places, at different orientations, at small size, and
   the reader is **recognising** one from memory rather than **comparing** two. A small multiple of
   JND is the wrong order of magnitude for a categorical encoding.

2. **It is where this repo's own discipline already sits.** `semantic.ts` decides "same named
   colour?" with a 15° hue bucket. Rotating each claim colour's hue by 15° at its own L and C
   measures ΔE2000 **8.5** (`brandDeep`), **9.0** (`brandBright`), **11.3** (`reference`), **14.0**
   (`brand`). 10 is not a new discipline; it is the existing one restated in a metric you can
   measure on a pixel.

3. **The verdicts are stable across a wide band, which is the honest way to report a chosen
   number.** For the palette under the shipped marker rig the failing pair reaches **7.95** and the
   tightest passing one **13.25** — anything from 8 to 13 gives identical verdicts. Per-surface
   (§5) the band is narrower: the worst passing case is Storm's `tile`/`lid` at **10.3** and the
   best failing one is Orrery's `core`/`withheld` at **8.6**, so only 8.7–10.3 preserves those
   verdicts. **Recorded, not hidden:** Storm `tile`/`lid` flips to a violation if the floor moves
   above 10.3.

**Statistic: the 5th-percentile fragment.** The worst fragment of a convex dielectric is its
specular highlight, where the material is meant to show the light rather than its albedo; requiring
separation there condemns every lit material. Requiring it only at the median excuses a rig that
whites out a third of the mark. p05 says "a highlight may swallow up to 5% of the mark". The `min`
column is reported alongside throughout, so a reader can apply a different line to the same data.

---

## 4 · THE INVARIANT

> **CATEGORICAL SEPARATION.** Any two palette entries that encode **different categories** must
> remain at least **ΔE2000 10** apart at **95% of the fragments a reader can see**, in every theme
> the surface admits.
>
> The qualifier is load-bearing. `brandDeep` and `brandBright` are the two ends of one density ramp
> and *should* be close at the ends — forcing them apart would be inventing contrast the data does
> not have. `brand` and `refusal` are opposite claims and must never be close.
>
> **Scenery is out of scope**, deliberately: `brandDeep`/`rule` is ΔE2000 5.1 at the palette *by
> design*, because a rule recedes. Telling a mark from an axis is carried by geometry, position and
> thickness — `PipelineReliefGl.tsx:473` says colour repeats height "deliberately" for exactly this
> reason — and scenery moves with the theme, so its distance from a fixed data colour is
> `theme.ts`'s business.

**Why this is not implied by `ORDER SURVIVES`.** A monotone transform is not injective. At
illumination gain 8 the composite is strictly monotone — "a denser mark never renders lighter than a
sparser one" is *true* — and at that same gain `brandBright` and `refusal` arrive **7.72** apart.
The reader can still tell which of two density marks is denser, and can no longer tell a measured
mark from an unmeasured one. That is one test in `categorical.test.ts`, and it is the point of the
whole file.

**The mechanism is arithmetic.** Reinhard with shoulder *s* is `c/(1 + c·s)`. Its output asymptote
is `1/s` = **2.50** — but the 8-bit encode saturates at output **1.0**, which the curve reaches at
input `1/(1 − s)` = **1.667**. So the headroom above linear 1.0 is a factor of 1.667, **0.74 of a
stop**, and brand blue's blue channel is *already* at linear 1.0. Every fragment above 1.667 is
`#FFFFFF` whatever it started as, and two colours that both clear it are separated by **zero**.
`illuminationCeiling()` computes the crossing from the live curve: `brandBright`/`refusal` fails at
gain **6.26**, `brand`/`refusal` at **45.64**. `GlobeReliefGl.tsx:515` runs its markers at
`MARKER_AMBIENT 120`.

---

## 5 · Which rigs and which surfaces violate it

### 5a · The palette under five rigs

Min / **p05** / median ΔE2000 over 14,040 corresponding fragments of a lit sphere.

| pair | unlit / flat | Globe marker (amb 120) | same rig, amb 1 | theme dark | theme light |
|---|---|---|---|---|---|
| `brand` / `reference` | 52.56 / **52.56** | 25.25 / **37.61** | 32.16 / **48.14** | 35.49 / **47.74** | 29.60 / **44.86** |
| `brand` / `refusal` | 13.34 / **13.34** | 4.56 / **7.95** ❌ | 10.25 / **14.63** | 13.25 / **14.46** | 7.64 / **13.54** |
| `brandBright` / `reference` | 43.50 / **43.50** | 14.29 / **28.79** | 20.04 / **38.20** | 26.83 / **39.19** | 16.67 / **34.17** |
| `brandBright` / `refusal` | 17.91 / **17.91** | 5.06 / **13.25** | 10.31 / **13.63** | 9.87 / **14.53** | 6.93 / **14.06** |
| `brandDeep` / `reference` | 57.96 / **57.96** | 28.72 / **41.96** | 27.89 / **45.79** | 27.60 / **46.42** | 29.93 / **42.82** |
| `brandDeep` / `refusal` | 24.08 / **24.08** | 8.74 / **15.67** | 8.96 / **20.03** | 8.84 / **19.33** | 9.04 / **17.29** |
| `reference` / `refusal` | 38.65 / **38.65** | 19.88 / **31.68** | 21.20 / **32.04** | 22.33 / **32.79** | 23.57 / **31.79** |

**The palette is not the defect and the tone map alone is not the defect.** Unlit, the tightest
claim pair clears the floor by 1.33×. The one rig that fails is the one with `MARKER_AMBIENT 120`,
and **dropping that single number to 1 clears every pair on the same rig** (`brand`/`refusal` 7.95 →
14.63). `3D_VFX_100X_LIVE.md` §0 already calls that ambient "a lighting hack compensating for a
colour-management defect"; it is also, measured, the largest single cause of categorical collapse in
the system.

Note also how thin the margins are everywhere else: `brand`/`refusal` clears at 13.54–14.63 across
the sane rigs, against a floor of 10. There is roughly 40% of headroom on the pair that matters
most, in every configuration.

### 5b · Per surface, under each surface's own rig and each mark's own material

Rigs and materials read out of the shipping sources (`lightColour`, `ambientGain`, sky, roughness,
metalness — file:line recorded in the harness). Only **cross-category** pairs are listed; 39 of
them. Ranked by p05, worst first.

| surface | theme | pair | hexes | min | **p05** | median | verdict |
|---|---|---|---|---|---|---|---|
| **storm** | dark | `tile` (observed day) / `withheldTile` (absence) | `#22315A` `#1B2540` | 3.2 | **4.4** | 5.2 | ❌ **VIOLATES** |
| **orrery** | dark | `core` (measured) / `withheld` (absence) | `#7FB2FF` `#6B7A99` | 6.2 | **7.2** | 8.3 | ❌ **VIOLATES** |
| **orrery** | light | `core` (measured) / `withheld` (absence) | `#7FB2FF` `#6B7A99` | 7.9 | **8.6** | 10.3 | ❌ **VIOLATES** |
| storm | dark | `tile` / `lid` (absence) | `#22315A` `#6B7A99` | 8.1 | **10.3** | 12.4 | ok — 0.3 from the floor |
| storm | dark | `tile` / `rail` (absence) | `#22315A` `#6B7A99` | 8.3 | **11.2** | 13.3 | ok |
| orrery | light | `observed` / `withheld` | `#2C6BFF` `#6B7A99` | 5.8 | **13.0** | 13.6 | ok |
| storm | dark | `gate` / `lid` | `#2C6BFF` `#6B7A99` | 12.5 | **13.1** | 14.3 | ok |
| storm | dark | `gate` / `rail` | `#2C6BFF` `#6B7A99` | 12.4 | **13.2** | 13.9 | ok |
| orrery | light | `link` / `withheld` | `#7FB2FF` `#6B7A99` | 11.9 | **13.7** | 16.8 | ok |
| orrery | dark | `link` / `withheld` | `#7FB2FF` `#6B7A99` | 12.2 | **13.8** | 17.2 | ok |
| globe | both† | `pin` / `atmos` | `#2C6BFF` `#7FB2FF` | 5.7 | **15.2** | 21.9 | ok (highlight only) |
| pipeline | worst theme | `fresh` / `withheld` | `#2C6BFF` `#5C6880` | 14.4 | **15.6** | 16.3 | ok |
| vault | worst theme | `allowed` / `withheld` | `#2C6BFF` `#5C6880` | 11.9 | **16.4** | 20.1 | ok |
| … | | 23 further pairs, all ≥ 16.7 at p05 | | | | | ok |

† Globe's marker pass takes a fixed `lightColour` and plate-derived sky rather than the theme rig,
so its two themes measure identically. The other "worst theme" rows take the poorer of the two.

**Three violations, and they are three different defects.**

1. **`StormReliefGl` — `tile` vs `withheldTile`, `#22315A` vs `#1B2540`.** This one **fails before
   any lighting**: the two hexes are ΔE2000 **5.7** apart at source. No rig can fix it and no tone
   map caused it. An unmeasured day's tile is very nearly an observed day's tile. Storm's own header
   says the refusal is carried by the **floor** — the density volume is simply absent — and by the
   lid and rail marks; that redundancy is what is holding the reading up, and the lid pair is itself
   **10.3**, 0.3 above the floor. Neither of these hexes is in `BRAND_HEX`.

2. **`OntologyOrreryGl` — `core` vs `withheld`, `#7FB2FF` vs `#6B7A99`.** Palette distance ΔE2000
   **20.9**, which clears the floor twice over; the collapse is the **material**. `core` is drawn at
   `roughness 0.22, metalness 0.36` (`:575-576`). Metalness 0.36 removes 36% of the diffuse lobe and
   replaces it with a mirror of the sky, so a third of the mark's colour stops being its albedo. It
   fails in **both themes**, worse in dark (7.2).

3. **`GlobeReliefGl` — `pin` vs `atmos`** is listed for completeness and **passes**: min 5.7 but p05
   15.2. It is the clearest case for the p05 statistic — the collapse is confined to the specular
   highlight, which is a lighting cue and not a mis-read. Under the `min` statistic it would be a
   violation, and so would seven other pairs that are plainly fine.

**Not applicable:** `DeckReliefGl` and `SurfaceReliefGl` draw only `#2C6BFF` and `#7FB2FF` — one
category — so they have no cross-category pair to fail. `ForgeBackdrop` (E1) draws `#2C6BFF` alone.

### 5c · Two things found in passing that are not separation failures

- **`OntologyOrreryGl` uses `#FF8A3D` — the palette's `reference` hex — to mean ABSENT**
  (`:92`). The palette says that colour means "percentiles, thresholds, targets". One hex, two
  claims, in different surfaces. Within Orrery's own frame the separation is fine (31.5+); the
  collision is across the product.
- **Three off-palette absence colours ship**: `#6B7A99` (`refusal`, Orrery, Storm), `#5C6880`
  (Vault, Pipeline), `#1B2540` (Storm tile). `#6B7A99` and `#5C6880` are ΔE2000 **7.4** apart — same
  category, so this is not a violation, but the palette has one absence colour and the product uses
  three.

---

## 6 · Can the rig satisfy the invariant, or does it need a redesign?

**For the palette: yes, and no redesign is needed.** The measurement is unambiguous — every claim
pair clears the floor under `theme.ts`'s dark and light rigs and under the Globe rig at ambient 1.
The single failing configuration is `MARKER_AMBIENT 120`. That is a fix to one number, and the
commit that introduced it already documents it as a workaround for something else.

**For the three named violations: no, and the rig was never the problem.** Storm's tile pair fails at
the hex; Orrery's core pair fails at `metalness 0.36`. Neither is a tone-map defect.

**On unlit / emissive categorical marks.** The commit dismissed post-tone-map geometry as
"a sticker, not a surface". That is a description, not an argument, and the review was right to flag
it. Argued properly, in both directions:

*The case for.* Unlit marks are the standard answer in data visualisation for one specific reason:
an unlit mark's colour is a **function of the datum only**, while a lit mark's colour is a function
of the datum *and* its orientation, its neighbours, the camera and the light. A categorical encoding
is a claim that colour ⇒ category, and shading makes that a many-to-one map in the wrong direction.
The measurement here is exactly that: the *unlit* column of §5a passes every pair, with no min/p05
spread at all, because there is nothing to spread — one datum, one pixel. If the goal is that
absence never reads as a value, unlit marks achieve it by construction rather than by tuning.

*The case against, which is also measured.* These are not scatter plots with an incidental 3-D
skin. The deck, the globe, the pins, the vault records **are** the data, and their *shape* carries
the reading: `pinHeight(s.projects, …)` puts the value in the geometry, and geometry is only legible
because it is shaded. An unlit sphere is a flat disc; an unlit heightfield is a silhouette. So
"render the marks unlit" is not a colour-management change here — it deletes the encoding channel
the surface was built on. That is a real argument and it is what "a sticker" was gesturing at.

*Where the two meet, and what I would actually do.* The distinction that resolves it is **does the
mark's shape carry information**:

- **Shape-carrying marks stay lit** (E2 pins, E5 lanes, E6 records, E4 heightfield). For these the
  invariant is enforced on the rig and the material, not by removing the lighting — and §5 says that
  is achievable: drop `MARKER_AMBIENT`, and keep metalness off a data mark. `SurfaceReliefGl:298`
  already reasons this way ("dielectric, so the hex survives: a metal has no diffuse lobe").
- **Pure category tokens do not carry shape** — Storm's withheld lid, Orrery's withheld dot,
  Vault's withheld plinth. Nothing about their geometry is a measurement; they exist to say "no
  reading here". These are the marks where unlit or emissive is the right call, and the "sticker"
  objection does not apply because a sticker is precisely what a category token *is*.

That is a narrower proposal than "composite marks after the tone map", it does not need the
data/scenery split the commit correctly says these surfaces lack, and it is testable: an emissive
token's colour is its albedo, so its separation from every other category is the unlit column of
§5a, which passes by 1.33× at the tightest.

**Not proposed, and why:** an emissive path is a real change to `lit.ts` and a real byte cost, and
this document has not measured either. What is measured is the invariant, the violations, and that
the palette-level failure needs no redesign at all.

---

## 7 · What this does not establish

- **No surface was captured.** These are single spheres under each surface's rig, not frames of the
  real geometry. A pin is not a unit sphere and a tile is not a sphere at all; the numbers stand for
  "this material under this light", not "this frame".
- **Shadow, AO and fog were not applied** (`shadow: null, ao: null`). All three scale radiance
  *down*, which moves a fragment away from the clip and generally *increases* separation on bright
  fragments — so the bright-end results here are, if anything, conservative. They also darken, which
  can reduce separation at the dark end. Untested.
- **One driver.** SwiftShader via ANGLE, deliberately, so the record is reproducible on CI hardware.
  Not cross-checked against a discrete GPU.
- **The floor and the percentile are judgements**, and §3 gives the band over which each verdict
  survives. Storm's `tile`/`lid` at 10.3 is the one verdict that is genuinely close to its line.
- **The test does not read a pixel.** `categorical.test.ts` pins the CPU model against the numbers
  measured here and proves the model is sensitive to the live tone map; re-measuring requires the
  harness.
