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
   (§5) the band was narrower: the worst passing case is Storm's `tile`/`lid` at **10.3** and the
   best failing one was Orrery's `core`/`withheld` at **8.6**, so only 8.7–10.3 preserved those
   verdicts. **AMENDED 2026-08-15.** Both Orrery and Storm are fixed, so no failing case brackets
   the band from below any more and the surviving constraint is one-sided: Storm's `tile`/`lid` at
   **10.3**. That is a WEAKER position, not a stronger one — a threshold with nothing failing just
   below it is no longer pinned by the data, and the next surface measured could land anywhere in
   the gap. **Recorded, not hidden:** `tile`/`lid` still flips to a violation if the floor moves
   above 10.3, and it is now the only pair doing any work at the boundary.

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
| ~~**storm**~~ | ~~dark~~ | ~~`tile` (observed day) / `withheldTile` (absence)~~ | ~~`#22315A` `#1B2540`~~ | ~~3.2~~ | ~~**4.4**~~ | ~~5.2~~ | **FIXED 2026-08-15 — see §5d** |
| ~~**orrery**~~ | ~~dark~~ | ~~`core` / `withheld`~~ | ~~`#7FB2FF` `#6B7A99`~~ | ~~6.2~~ | ~~**7.2**~~ | ~~8.3~~ | **FIXED 2026-08-15 — see COLOUR_LANGUAGE.md §9** |
| ~~**orrery**~~ | ~~light~~ | ~~`core` / `withheld`~~ | ~~`#7FB2FF` `#6B7A99`~~ | ~~7.9~~ | ~~**8.6**~~ | ~~10.3~~ | **FIXED 2026-08-15 — see COLOUR_LANGUAGE.md §9** |
| **orrery** | dark | `core` / `withheld`, after | `#7FB2FF` `#6B7A99` | 9.91 | **12.92** | 18.35 | ✅ ok |
| **orrery** | light | `core` / `withheld`, after | `#7FB2FF` `#6B7A99` | 9.48 | **12.76** | 17.67 | ✅ ok |
| storm | dark | `tile` / `lid` (absence) | `#22315A` `#6B7A99` | 8.1 | **10.3** | 12.4 | ok — 0.3 from the floor |
| storm | dark | `tile` / `rail` (absence) | `#22315A` `#6B7A99` | 8.3 | **11.2** | 13.3 | ok |
| orrery | light | `observed` / `withheld` | `#2C6BFF` `#6B7A99` | 5.8 | **13.0** | 13.6 | ok |
| storm | dark | `gate` / `lid` | `#2C6BFF` `#6B7A99` | 12.5 | **13.1** | 14.3 | ok |
| storm | dark | `gate` / `rail` | `#2C6BFF` `#6B7A99` | 12.4 | **13.2** | 13.9 | ok |
| **storm** | dark | `tile` / `withheldTile` **as it now ships** | `#22315A` `#595959` | 10.4 | **13.4** | 15.2 | ok — §5d‡ |
| orrery | light | `link` / `withheld` | `#7FB2FF` `#6B7A99` | 11.9 | **13.7** | 16.8 | ok |
| orrery | dark | `link` / `withheld` | `#7FB2FF` `#6B7A99` | 12.2 | **13.8** | 17.2 | ok |
| globe | both† | `pin` / `atmos` | `#2C6BFF` `#7FB2FF` | 5.7 | **15.2** | 21.9 | ok (highlight only) |
| pipeline | worst theme | `fresh` / `withheld` | `#2C6BFF` `#5C6880` | 14.4 | **15.6** | 16.3 | ok |
| vault | worst theme | `allowed` / `withheld` | `#2C6BFF` `#5C6880` | 11.9 | **16.4** | 20.1 | ok |
| … | | 23 further pairs, all ≥ 16.7 at p05 | | | | | ok |

† Globe's marker pass takes a fixed `lightColour` and plate-derived sky rather than the theme rig,
so its two themes measure identically. The other "worst theme" rows take the poorer of the two.

‡ Every other row in this table came off the original harness. That row came off the reconstruction
in §5d, which agrees with the original to the digit at p05 and median on all five Storm rows and to
within 0.4 at `min`. Storm has one theme and §5d derives why.

**Two violations as measured, three entries, and they are three different defects.** The first is
closed as of 2026-08-15; the third never was one and is listed because it is the clearest argument
for the p05 statistic.

1. **`StormReliefGl` — `tile` vs `withheldTile`, `#22315A` vs `#1B2540`. FIXED 2026-08-15; the
   account is §5d.** As found, this one **failed before any lighting**: the two hexes were ΔE2000
   **5.67** apart at source, so no rig caused it and no rig could have fixed it. The fix was to the
   albedo — `withheldTile` is now **`#595959`**, achromatic — and the pair measures **13.4** at p05
   on this instrument and **14.1** on the tile's own flat face. `tile` vs `lid` is untouched at
   **10.3**, still the tightest passing verdict in the system.

2. **`OntologyOrreryGl` — `core` vs `withheld`, `#7FB2FF` vs `#6B7A99`. FIXED 2026-08-15; the
   account is `COLOUR_LANGUAGE.md` §9.** Palette distance ΔE2000 **20.9**, which clears the floor
   twice over, so the collapse was never the palette — it was the **material**. `core` was drawn at
   `roughness 0.22, metalness 0.36`. Metalness 0.36 removes 36% of the diffuse lobe and replaces it
   with a mirror of the sky, so a third of the mark's colour stopped being its albedo. It failed in
   **both themes**, worse in dark (7.2).

   The fix is `metalness: 0.08` — the same substance as every other body, the ternary removed
   (`OntologyOrreryGl.tsx:691`; roughness is untouched at `:687`). The pair now measures p05
   **12.92** dark and **12.76** light. **The core is MORE distinguished after this, not less**, which
   is the counter-intuitive part: the mirror had been dragging it toward the same washed sky the
   ordinary bodies sit in, so `core` vs `observed` rose from 9.55 to 13.70 in dark and 10.50 to 13.93
   in light. What it gives up is its distance from a `link`, which shares its hex — and a link is a
   3.2 px tube nobody confuses with the largest sphere in the frame.

   Re-measurable: `node docs/3d/w2/orrery-material-sweep.mjs` reads the materials out of the
   component, so it is the verification to run after any Orrery material edit.

   **The line numbers `:575-576` that this paragraph used to cite were already stale when written,
   and are recorded here as a caution:** a file:line in prose is a claim with a short shelf life,
   and this document has now carried two of them past the edit that invalidated them.

3. **`GlobeReliefGl` — `pin` vs `atmos`** is listed for completeness and **passes**: min 5.7 but p05
   15.2. It is the clearest case for the p05 statistic — the collapse is confined to the specular
   highlight, which is a lighting cue and not a mis-read. Under the `min` statistic it would be a
   violation, and so would seven other pairs that are plainly fine.

**Not applicable:** `DeckReliefGl` and `SurfaceReliefGl` draw only `#2C6BFF` and `#7FB2FF` — one
category — so they have no cross-category pair to fail. `ForgeBackdrop` (E1) draws `#2C6BFF` alone.

### 5d · Storm's floor pair — what was done, 2026-08-15

**The harness in §5b was not in the repo, and it has been reconstructed rather than re-invented.**
§7 said re-measuring needs it. What *is* committed is `docs/3d/brand-fidelity.mjs:184-233`, and §0
already establishes that its centre pixel reproduces this document's `litCentre` column for all
seven entries — so that file's sphere **is** the geometry these numbers were taken on. Read out of
it: `sphere(1.0)` at the origin, eye `[0,0,3.2]`, `perspective(fovY 0.6 rad, aspect 1)`, 128×128,
key light along the **view axis** (`lightDir [0,0,-1]`), `shadow: null`, `ao: null`. Two checks that
this is the right geometry and not a plausible one:

- **Coverage.** The projected radius is `tan(asin(1/3.2)) / tan(0.3) × 64` = **68.0 px** in a 64-px
  half-frame, so the sphere overflows and the four axis-facing edges of the silhouette are clipped.
  That is what makes the covered count **14,040** rather than the 12,868 an inscribed disc gives;
  an analytic ray-cast over the same grid covers **14,056**, a 0.11% difference which is the
  rasteriser's edge rule.
- **The rig, on the CPU.** `env/lit.ts`'s LIT_FRAG was transcribed to TypeScript and checked against
  the recorded GPU bytes in `docs/3d/brand-fidelity.json`: **worst channel disagreement 1/255**
  across all seven `litCentre` triples, two of them exact. It then reproduces **every** Storm row of
  §5b to the digit at p05 and median:

  | pair | this reconstruction (min / p05 / med) | §5b as recorded |
  |---|---|---|
  | `tile` / `withheldTile` | 3.3 / **4.4** / 5.2 | 3.2 / **4.4** / 5.2 |
  | `tile` / `lid` | 7.9 / **10.3** / 12.4 | 8.1 / **10.3** / 12.4 |
  | `tile` / `rail` | 8.7 / **11.2** / 13.3 | 8.3 / **11.2** / 13.3 |
  | `gate` / `lid` | 12.5 / **13.1** / 14.3 | 12.5 / **13.1** / 14.3 |
  | `gate` / `rail` | 12.4 / **13.2** / 13.9 | 12.4 / **13.2** / 13.9 |

  **One thing this exposes about the instrument, recorded because it is not what the §5b heading
  says.** The light is the *harness's*, along the view axis — not Storm's own key `[0.44,-0.66,-0.61]`.
  Swapping in Storm's direction puts the sphere's terminator inside the sample and the same
  `tile`/`withheldTile` pair reads **0.0 / 0.4 / 4.8**. So §5b's numbers are "this material under
  this light", exactly as §7 says, and are not a bound on the frame.

**A second instrument, because a floor is not a sphere.** Storm's tile is `box(LANE_W, TILE_T,
TILE_D)`; at azimuth 0 and elevation 21.3° the camera sees the `+Y` face and the `+Z` face and
nothing else, and their projected areas are **0.0652** and **0.0107** m² — the top face is 86% of
what a reader sees. A flat face has one normal, so **the tile has essentially one shading value**:
min, p05 and median coincide. That is the honest reason a floor colour cannot hide behind a
percentile, and it is measured under Storm's own key. Both instruments are reported below.

**Before and after.** `withheldTile` `#1B2540` → **`#595959`**; `roughness 0.55, metalness 0.1`
unchanged. Sphere column is the §5b instrument at full resolution (14,056 fragments); face column is
the tile as drawn. `gutter` and `week` are scenery, so the invariant does not govern them — they are
here because a withheld tile sits directly beside both, and because the incumbent was *worse*
against the gutter than against the pair everyone was looking at.

| pair | category | before, sphere min/**p05**/med | before, face | after, sphere min/**p05**/med | after, face |
|---|---|---|---|---|---|
| `tile` / `withheldTile` | **density / absence** | 3.3 / **4.4** / 5.2 ❌ | **4.4** ❌ | 10.4 / **13.4** / 15.2 ✅ | **14.1** ✅ |
| `gutter` / `withheldTile` | scenery / absence | 0.8 / **1.5** / 2.3 | **1.8** | 7.1 / **10.8** / 13.2 | **11.6** |
| `week` / `withheldTile` | scenery / absence | 2.6 / **3.8** / 4.6 | **4.2** | 9.8 / **12.9** / 14.3 | **13.8** |
| `lid` / `withheldTile` | absence / absence | 8.9 / **12.1** / 15.1 | **13.4** | 6.6 / **8.4** / 10.1 | **9.2** |
| `rail` / `withheldTile` | absence / absence | 9.8 / **13.3** / 16.4 | **14.4** | 7.1 / **9.2** / 11.0 | **9.7** |
| `gate` / `withheldTile` | annotation / absence | 17.6 / **20.5** / 23.1 | **21.7** | 20.6 / **24.2** / 26.0 | **25.2** |

At the raw hex, with no rig at all: `tile` 5.67 → **21.74**, `gutter` 2.52 → **23.09**, `week` 5.96
→ **20.12**, `lid` 29.08 → **18.14**.

**Both themes are the same numbers, and that is derived rather than assumed.** Stripping comments
from `StormReliefGl.tsx`, **no** identifier from `look/theme.ts` appears in its code — `sceneTheme`
occurs once, inside the comment that says it is deliberately not used. The stage is created
`{ alpha: false }` and the clear colour is a literal `#070B14`, so the page's background cannot
reach the frame either. This surface admits one rig, and the invariant's "in every theme the surface
admits" is satisfied by one measurement.

**Why achromatic, and why the paper shortlist was refused.** Three hexes in the lid's hue family at
chroma 8–20 were proposed as a starting point on raw-hex distance alone. Measured under the rig they
**all fail**, and not marginally:

| candidate | raw-hex vs tile | sphere p05: tile / gutter / week | face p05: tile / gutter / week |
|---|---|---|---|
| `#4D5562` | 15.54 | 9.6 ❌ / 7.9 ❌ / 8.9 ❌ | 9.3 ❌ / 8.2 ❌ / 8.9 ❌ |
| `#4C5561` | 15.86 | 9.9 ❌ / 8.1 ❌ / 9.2 ❌ | 9.9 ❌ / 8.4 ❌ / 9.5 ❌ |
| `#4B5460` | 15.61 | 9.8 ❌ / 7.8 ❌ / 9.1 ❌ | 9.9 ❌ / 8.4 ❌ / 9.4 ❌ |

That is the general shape of the problem: **raw-hex distance is a poor predictor here**, and the
lid's own hue family is the worst place to look, because the lid is the one thing that must keep
reading *on top of* this tile. The bounds the search actually used are all taken from rules this
repo already states:

- **absence ⇒ low chroma.** `categorical.ts` §3 derives absence as "a mark with LESS CHROMA than the
  least chromatic ramp member … no hue to be read BY". In Storm's frame the least chromatic mark
  that carries a reading is `tile` at **27.8**, so that is the ceiling.
- **family ⇒ hue.** `semantic.ts`'s `HUE_BUCKET_DEG` (15) is "the granularity at which hues get
  separate names", so "the lid's family" is ±15° of hue **276.2** — applied only above chroma 3,
  because below that hue is not a property a reader has.
- **never the brightest.** Peak presented luminance on its own faces, under Storm's own key, must
  stay below the lid's **0.05735** — the file's own recorded defect, restated as a number.
- **objective: minimise luminance**, not maximise distance. Maximising distance is what returns
  olive; it also runs straight into the lid ceiling and lands the tile at 89% of the lid's brightness.

**And the binding constraint turned out to be chroma, not lightness.** Every other floor colour is a
chromatic navy (`tile` 27.8, `week` 24.9, `gutter` 17.7), so chroma is the axis that separates —
which means the thing that makes this tile clear the floor is exactly the thing that makes it read as
absence. Measured, in the lid's own hue at the shipped material: **nothing above chroma 6.7 clears
the floor at all**, and from chroma 4 upward the **lid collapses against its own tile to 5–7**,
spending the redundancy that was holding the reading up. `#595959` at chroma 0.0 keeps it at 8.4/9.2.

**What is a judgement here, stated as one.** Chroma 0 and the hue bound are derived; the *lightness*
is not. The feasible neutrals at the shipped material run L\* 33–41 and every one of them clears the
governed pair (12.5–14.2 at p05). L\* 37.8 was chosen as the dimmest whose worst **required** pair —
which is `gutter`, a scenery pair the invariant does not even govern — clears by more than 5%:
L\* 36.1 puts it at 10.1, 0.1 above the line, and this document already carries one verdict at 10.3
and calls it the one genuinely close call.

**The luminance ordering it produces, on the floor face** (peak presented luminance): `gate` 0.0670,
`rail` 0.0624, `lid` 0.0574, **`withheldTile` 0.0396**, `tile` 0.0185, `week` 0.0182, `gutter`
0.0118. Fourth of seven — above every observed-day element, below every absence marker. The
presented pixel of a withheld tile goes `#131829` → `#383838`; an observed tile is `#1b233b`.

**What this does not fix, measured.** The volume is composited over the floor before the tone map,
so the same haze lands on both tiles and reduces every separation. `tile` vs `withheldTile` at the
p05 face, under the low and high ends of the severity ramp:

| α | 0.2 | 0.5 | 0.8 |
|---|---|---|---|
| low end, before → after | 1.6 → **5.4** | 0.7 → **2.5** | 0.3 → **0.7** |
| high end, before → after | 3.7 → **4.6** | 1.4 → **1.5** | 0.4 → **0.4** |

Better everywhere and **nowhere near the floor**. Above roughly α 0.3 no floor colour survives the
composite — that is a property of `ONE / ONE_MINUS_SRC_ALPHA` over an opaque field, not of this
albedo, and it is not addressable by a palette choice. It is the reason the lid, which stands 21 cm
**above** the floor and inside the volume rather than under it, is redundancy worth keeping rather
than a defence that was already sufficient.

### 5c · Two things found in passing that are not separation failures

- **`OntologyOrreryGl` uses `#FF8A3D` — the palette's `reference` hex — to mean ABSENT**
  (`:92`). The palette says that colour means "percentiles, thresholds, targets". One hex, two
  claims, in different surfaces. Within Orrery's own frame the separation is fine (31.5+); the
  collision is across the product.
- **Three off-palette absence colours ship**: `#6B7A99` (`refusal`, Orrery, Storm), `#5C6880`
  (Vault, Pipeline), and Storm's withheld tile — `#1B2540` when this was written, **`#595959`**
  since §5d. `#6B7A99` and `#5C6880` are ΔE2000 **7.4** apart, and `#595959` is **18.1** from the
  first and **12.4** from the second — same category, so none of this is a violation, but the
  palette has one absence colour and the product uses three. §5d makes the third one *further* from
  the other two, deliberately: it is a floor rather than a marker, and it has to clear a floor made
  of navy. Nothing here argues the product should keep three; it argues that the one it needed for a
  large flat area was never going to be the one chosen for a small lifted marker.

---

## 6 · Can the rig satisfy the invariant, or does it need a redesign?

**For the palette: yes, and no redesign is needed.** The measurement is unambiguous — every claim
pair clears the floor under `theme.ts`'s dark and light rigs and under the Globe rig at ambient 1.
The single failing configuration is `MARKER_AMBIENT 120`. That is a fix to one number, and the
commit that introduced it already documents it as a workaround for something else.

**For the three named violations: no, and the rig was never the problem.** Storm's tile pair failed at
the hex; Orrery's core pair failed at `metalness 0.36`. Neither is a tone-map defect, and **both are
now closed by changing the mark's own material rather than the room it stands in** — an albedo for
Storm (§5d), a metalness for Orrery (`COLOUR_LANGUAGE.md` §9). That both fixes landed on the mark and
neither on the rig is the strongest evidence this section has that the tone map was never implicated.

**Storm's is now closed, and it took an albedo and nothing else** — §5d. The sentence this paragraph
used to carry, "no rig fixes it", was true and was being read as "nothing fixes it": the fix was
never going to come from the rig, because the pair was 5.67 apart before any light reached it. What
it needed was the palette-level move the invariant's own derivation implies — **an absence mark has
no hue to be read by** — applied to a floor that is otherwise entirely navy. `roughness` and
`metalness` were left alone, and measured that is the right call in both directions: raising
metalness to the lid's 0.35 costs **2.5** ΔE2000 on the same albedo, because metal replaces the
diffuse lobe with a mirror of a near-black sky.

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
  survives. Storm's `tile`/`lid` at 10.3 is the one verdict that is genuinely close to its line, and
  §5d did not move it — neither of those two materials changed.
- **The test does not read a pixel.** `categorical.test.ts` pins the CPU model against the numbers
  measured here and proves the model is sensitive to the live tone map. Re-measuring a *rig* needs a
  fragment-level harness; §5d reconstructs one from `docs/3d/brand-fidelity.mjs` and validates it
  against recorded GPU bytes (1/255 worst channel) and against all five Storm rows of §5b, but that
  reconstruction is **not committed** and no test runs it. Until it is, §5d's numbers are
  reproducible only by rebuilding it from the recipe stated there.
- **§5d's second instrument is not a capture either.** A tile's top face is one normal and one
  shading value, which is why its min, p05 and median coincide — that is arithmetic about a flat
  face, not a rendered frame. Shadow, AO and the volume are still absent from it, and the volume in
  particular is measured separately in §5d and is the one term that erases the distinction outright
  at high accumulation.
