/**
 * E1 THE THEATRE — the part of the deck that is arithmetic rather than GL.
 *
 * Extracted for the same reason `vaultRecords.ts` and `pipelineChannel.ts` are: the placement of the panels, the
 * depth ORDER they carry, and the decision that a line of text does not fit on a slab are all checkable without a
 * GPU, and every one of them is a place this environment can lie. `DeckReliefGl` imports this; nothing else does,
 * so it rides the same lazy chunk and never touches the initial bundle.
 *
 * ── WHAT THE DEPTH ORDER MEANS, AND WHAT IT DOES NOT ─────────────────────────────────
 * Depth here states WHICH PANEL IS BEING ADDRESSED — the reader's own choice — and, behind it, the order the deck
 * itself lists its panels in. It is NOT a ranking of urgency, size or risk. There is no quantity on the command
 * deck that orders these four panels against each other: "18 partners missing terms" and "1 critical risk" are not
 * comparable magnitudes, and sorting by the larger number would dress an arbitrary ranking as a priority. So the
 * ordering encoded is the one that actually exists (the deck's own sequence, and the reader's address), and the
 * numbers on the panels are printed as the counts they are, each labelled with what it counts.
 */

/** One panel of the deck, in the page's own words. The page owns every string here. */
export interface DeckPanelDatum {
  /** Stable across renders — used as a React key and as the address target. */
  readonly id: string;
  /** The panel's heading, exactly as the flat grid shows it. */
  readonly title: string;
  /**
   * The one measure the panel leads with, already formatted by the page.
   *
   * `null` means the page does not have it — a gating chain with no gates, a count the API did not return. It
   * renders as a named absence, never as a zero (§6 rule 6). An invented number on a lit panel is the most
   * persuasive lie this codebase can tell.
   */
  readonly headline: string | null;
  /** One line of context, or `null` to print nothing. Never a placeholder. */
  readonly note: string | null;
}

/**
 * THE FIVE PANEL POSITIONS, LIFTED FROM `docs/3d/e1/entry.ts` RATHER THAN RE-DERIVED.
 *
 * A convex arc bulging toward the camera, nearest at the centre, asymmetric in z and unequal in size — every one
 * of those is a decision the harness records and defends: the first draft put the near panels in FRONT of the far
 * ones and stood them squarely in the way, and five equal panels on a curve read as a grid that has been bent,
 * which is what this environment replaces.
 *
 * WHAT IS NOT INHERITED IS THE MEASUREMENT. The harness reports 100% / 83% / 78% visibility for its FIVE panels
 * under its own framing. This deck has four panels and frames the camera on the set it actually uses, so those
 * percentages describe a different arrangement and are not cited here. Occlusion is measured per render instead,
 * and what it costs is printed on the frame.
 */
const SLOT_TABLE = [
  { x: -3.55, z: -1.25, w: 1.72, h: 1.30 },
  { x: -1.62, z: 0.75, w: 1.30, h: 1.62 },
  { x: 0.18, z: 2.35, w: 1.44, h: 1.36 },
  { x: 1.62, z: 1.15, w: 1.20, h: 1.54 },
  { x: 3.62, z: -2.10, w: 1.78, h: 1.18 },
] as const;

export interface DeckSlot {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly h: number;
}

/** How many panels this arrangement can carry. Below two there is no order to state; above five the measured arc
 *  would have to be widened, and a sixth position invented for a frame that claims to be a room. */
export const MIN_PANELS = 2;
export const MAX_PANELS = SLOT_TABLE.length;

/**
 * The slots for `n` panels, chosen so both sides of the frame stay occupied.
 *
 * Dropping from one end of the arc would leave every panel on one side of the lens with an empty half-frame
 * beside it, which reads as a rendering fault rather than as a room. The subsets below keep the centre and grow
 * outward, and the caller frames the camera on their centroid.
 */
export function slotsFor(n: number): readonly DeckSlot[] {
  const count = Math.max(MIN_PANELS, Math.min(MAX_PANELS, Math.trunc(n)));
  const pick: Record<number, readonly number[]> = {
    2: [1, 2],
    3: [1, 2, 3],
    4: [0, 1, 2, 3],
    5: [0, 1, 2, 3, 4],
  };
  return (pick[count] ?? [0, 1, 2, 3, 4]).map((i) => SLOT_TABLE[i]!);
}

/**
 * Slot indices ordered NEAREST FIRST, by measured distance from the eye rather than by declaration order.
 *
 * The focus target and the addressing both follow this, so a later nudge to one z cannot silently rack focus onto
 * the wrong panel — the harness names that as the bug this ordering exists to prevent.
 */
export function rankSlots(
  slots: readonly DeckSlot[],
  eye: readonly [number, number, number],
): readonly number[] {
  return slots
    .map((s, i) => ({ i, d: Math.hypot(s.x - eye[0], s.h / 2 - eye[1], s.z - eye[2]) }))
    .sort((a, b) => a.d - b.d)
    .map((e) => e.i);
}

/**
 * Which panel goes to which depth rank.
 *
 * At rest the deck's own order is the depth order: panel 0 nearest. Address a panel and it comes to the front
 * while the others keep their relative order behind it — so the frame states one thing that changed and nothing
 * else, which is the only way an ordering is readable as an ordering.
 */
export function addressOrder(count: number, addressed: number | null): readonly number[] {
  const all = Array.from({ length: count }, (_, i) => i);
  if (addressed === null || addressed < 0 || addressed >= count) return all;
  return [addressed, ...all.filter((i) => i !== addressed)];
}

/**
 * One line of panel text, with what it costs in pixels.
 *
 * `charPx` is an ESTIMATE for the proportional lines and a measurement for the monospace one (0.6 em advance, plus
 * tracking where set). It is deliberately generous: this number decides whether a line is DROPPED, and the failure
 * to avoid is `overflow: hidden` serving half a sentence as though it were the whole one — E6 shipped
 * `campaign.publ` as the name of a governed action that way. Over-estimating costs a line that would have fitted;
 * under-estimating costs a truncated one presented as complete, and those are not equally bad.
 */
export interface PanelLine {
  readonly text: string;
  readonly charPx: number;
  readonly lineHeightPx: number;
  /** An optional line is dropped to make the required ones fit. A required line that does not fit refuses. */
  readonly optional: boolean;
}

export type PanelFitRefusal = 'WORD_WIDER_THAN_PANEL' | 'TEXT_TALLER_THAN_PANEL';

export interface PanelFit {
  /** Which of the given lines to render, in order. */
  readonly keep: readonly boolean[];
  /** Non-null when the panel cannot carry its required text at all — the panel then shows none. */
  readonly refusal: PanelFitRefusal | null;
}

const wrappedHeight = (line: PanelLine, boxW: number): number => {
  const rows = Math.max(1, Math.ceil((line.text.length * line.charPx) / Math.max(1, boxW)));
  return rows * line.lineHeightPx;
};

const longestWordPx = (line: PanelLine): number => Math.max(
  0,
  ...line.text.split(/\s+/).map((w) => w.length * line.charPx),
);

/**
 * Does this text fit this slab, and if not, what gets dropped?
 *
 * Wrapping rather than truncating, and a named refusal rather than a clip. A single word wider than the box cannot
 * wrap, so it would be cut mid-word — which on a panel heading is indistinguishable from a shorter heading.
 */
export function fitPanelText(
  lines: readonly PanelLine[],
  boxW: number,
  boxH: number,
  gapPx: number,
): PanelFit {
  const keep = lines.map(() => true);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!;
    if (longestWordPx(ln) <= boxW) continue;
    if (!ln.optional) return { keep: lines.map(() => false), refusal: 'WORD_WIDER_THAN_PANEL' };
    keep[i] = false;
  }
  const heightOf = (): number => {
    const shown = lines.filter((_, i) => keep[i]);
    if (shown.length === 0) return 0;
    return shown.reduce((h, ln) => h + wrappedHeight(ln, boxW), 0) + gapPx * (shown.length - 1);
  };
  /* Optional lines go from the LAST one back: the context sentence is the cheapest thing on a panel to lose and
     the heading is the most expensive, so the drop order has to be the reverse of the reading order. */
  for (let i = lines.length - 1; i >= 0 && heightOf() > boxH; i--) {
    if (lines[i]!.optional) keep[i] = false;
  }
  if (heightOf() > boxH) return { keep: lines.map(() => false), refusal: 'TEXT_TALLER_THAN_PANEL' };
  return { keep, refusal: null };
}
