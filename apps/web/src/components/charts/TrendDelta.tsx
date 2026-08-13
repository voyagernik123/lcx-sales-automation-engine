import { CHART_BAD, CHART_GOOD } from './palette';

/**
 * §4.4 · THIS PRIMITIVE IS A HAND EXCLUSION FROM THE GL PATH. `GL_NO_MARK_TO_BACK`.
 *
 * `3D_VFX_FINAL_PLAN.md` §1.5 lists TrendDelta as the last of eleven chart primitives still
 * outside the linear-light pipeline, and asks for it to be re-backed so the blueprint's claim
 * that *every* visual passes through the renderer becomes literally true. It is not re-backed,
 * and the claim should be restated instead of the component being changed to fit it. Four
 * reasons, each measured or already on the record here.
 *
 * ── 1 · THERE IS NO MARK TO RE-BACK ─────────────────────────────────────────────────
 * Every one of the ten GL-backed primitives hands the renderer a GEOMETRIC FILL it was
 * already drawing in SVG: a bar rect (`useFlatBars`), a stacked track (`useFlatTrack`), a
 * polyline (`useFlatLine`/`useFlatBand`), a dial arc (`useFlatDial`). This file contains no
 * `<svg>` at all — no path, rect, polyline or circle. Its two children are a font glyph and a
 * number, and both are TEXT. Measured with the app's real font stack at its real classes
 * (`text-xs` = 12px/16px, `font-medium`, Inter): the chip lays out at 41.34 × 16 CSS px for
 * "▲4.2%", of which the glyph box is 9.27 × 16 — 22.4 % of the chip. The other 77.6 % is the
 * number. 100 % of the ink is text.
 *
 * `useFlatBars` and friends take their geometry "in the host SVG's viewBox units". There is no
 * viewBox here to share, and no width or height either: the box is derived from the text
 * metrics of the value, so it changes per instance (41.34 / 53.72 / 39.17 CSS px measured for
 * 4.2 % / 124.7 % / 0.1 %).
 *
 * ── 2 · THE ONE MARK GL *COULD* ADD IS ALREADY RECORDED AS NOT DRAWABLE ─────────────
 * The only candidate is a good/bad tint plate behind the text. `gl/FlatBand.tsx:16-20` already
 * settled that: an additive pass writes full coverage into the frame's alpha, so a tint "would
 * land on the card as a solid block of hue rather than a wash" — which is why `Sparkline`
 * declined its own 10 % area wash. Same mark, same pipeline, same answer.
 *
 * ── 3 · THE OTHER CANDIDATE IS BAKING TEXT, WHICH RULE 4 FORBIDS AND RATCHETS ───────
 * Drawing ▲ (U+25B2) as an SDF triangle would mean the GL path shows a shape where the
 * refusal path shows a glyph, and it would add a surface that bakes typography.
 * `packages/gl/src/env/harnessRules.test.ts` ("rule 4 — the only environment with no projected
 * DOM content is the one with nothing to say") pins that set to `'e0'` — tightened from
 * `'e0,e2'` once E2 was fixed — so the ratchet now stands at ZERO surfaces carrying baked text.
 * This would be the one that reopened it.
 *
 * ── 4 · THE THRESHOLD `PLATFORM_VFX_100X.md` §7.2 SAYS WAS NEVER MEASURED ───────────
 * That document says L5 needs a size threshold below which SVG is simply correct, "measured,
 * not guessed", and it was never built. Measured now: the smallest thing GL currently backs is
 * the StatCard `Sparkline` at 80 × 24 = 1,920 px². This chip is 661 px² — 2.90× smaller — and
 * its size is text-derived rather than fixed. `stage.setRegion` (`packages/gl/src/stage.ts:238-248`)
 * short-circuits only on an identical size ("repeated same-size charts are free"); otherwise it
 * deletes 3 framebuffers and 3 textures and allocates 6. At dpr 2 the three chips above are
 * 83 / 107 / 78 device px wide, so no two consecutive chips would hit that fast path. Chips are
 * the most numerous primitive in the product — 7 on `BoardReport` (4 StatCard tiles + 3 revenue
 * rows), 5 on the home `ForecastDeltaCard`, 4 on `KpiDashboard` — so this is a full target-set
 * reallocation per chip per frame, in exchange for zero marks.
 *
 * `docs/3d/w0/README.md:43-45`, the audit that ranked these eleven, reached the same verdict
 * about this component from the other direction: its one filed finding (weak in dark mode) is
 * "**not** fixed by a new renderer — [it is a] palette and scale decision".
 *
 * ── THE CONSEQUENCE, WHICH IS THE REST OF THIS FILE ─────────────────────────────────
 * Refusing GL here means the DOM is not the fallback path, it is the ONLY path, so a defect in
 * it is permanent. There was one, and it is fixed below: see the note on the direction word.
 */

export interface TrendDeltaProps {
  /** Percent change; 0 / null / undefined renders an em dash. */
  value: number | null | undefined;
  /** When false, a falling value is the good direction (e.g. churn, cost). */
  goodIsUp?: boolean;
}

/** Inline delta chip: ▲/▼ + percent, colored good/bad (vars swap in dark). */
export function TrendDelta({ value, goodIsUp = true }: TrendDeltaProps) {
  if (value === null || value === undefined || value === 0) {
    return <span className="text-xs text-grey">—</span>;
  }
  const up = value > 0;
  const good = up === goodIsUp;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-medium"
      style={{ color: good ? CHART_GOOD : CHART_BAD }}
    >
      {/*
        THE DIRECTION IN WORDS, BECAUSE IT WAS RECOVERABLE FROM NOTHING ELSE.
        `Math.abs()` below strips the sign from the number deliberately (the glyph carries it
        visually), and the glyph is `aria-hidden` because "black up-pointing triangle" is noise
        read aloud. The net effect was that +4.2 % and −4.2 % produced the identical accessible
        name, "4.2%" — so a screen reader, a text extraction and a copy-paste all lost the one
        fact the chip exists to carry. Colour did not cover it either: simulating deuteranopia
        (Viénot/Brettel/Mollon 1999) on the real tokens `--chart-good #0ca30c` and
        `--chart-bad #d03b3b` collapses their separation from ΔE76 121.3 to 13.5 in light mode,
        at a contrast ratio of 1.16:1 between them — for roughly 6 % of men the hue says almost
        nothing and the glyph SHAPE was the only surviving cue.

        `sr-only` is `position:absolute` (tailwindcss/lib/corePlugins.js:639-648), so it leaves
        the inline-flex flow and consumes none of the `gap-0.5`. MEASURED rather than assumed,
        because "invisible" utilities that silently eat a flex gap are a real failure: the chip's
        box is 41.344 × 16 at the same origin with and without this span, and a dpr-2 screenshot
        of the two is byte-identical by SHA-256. The Playwright snapshots therefore cannot move.

        STILL COLOUR-ONLY, DELIBERATELY AND NOT SILENTLY: the good/bad JUDGEMENT. A sighted
        reader infers it from the hue and `goodIsUp`; nothing here says "worse" out loud. That is
        a change to what a screen reader hears on all 16 chips counted in the header, so it is an
        owner call, not a drive-by.
      */}
      <span className="sr-only">{up ? 'Up' : 'Down'}</span>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}
