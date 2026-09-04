/**
 * WHERE A GLOBE LABEL'S BOX GOES, so that no two boxes — and no box and the frame's headline — sit on the
 * same pixels. Found in production at 1440 px: the EU and US centroid labels overlapped each other and both
 * ran up into the "LISTING GEOGRAPHY" headline, because every label was hung ABOVE its anchor with nothing
 * checking what was already there.
 *
 * Pure and pixel-only: the caller measures nothing. Box height is derived from the line count at the label's
 * fixed type sizes; width is the label's `max-width`, which is the worst case and therefore the safe one.
 * The rule is greedy, top-down: a label tries above its anchor, then below, then slides down past whatever
 * it still touches. Labels stay attached to their anchor's x; only the vertical placement moves, so the
 * reading "this box belongs to that pin" survives.
 */
export interface LabelAnchor {
  readonly key: string;
  readonly sx: number;
  readonly sy: number;
  /** Hung to the LEFT of the anchor (near the right frame edge). */
  readonly flip: boolean;
  /** Body lines under the title. */
  readonly lines: number;
}

export interface Rect { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

/** Title row + one body line, at the label's 10.5/10 px mono type with its line-heights. */
export const LABEL_LINE_PX = 13;
/** Vertical padding of the plate (5 + 5) plus its border. */
export const LABEL_PAD_PX = 12;
/** Anchor stand-off, horizontal and vertical. */
export const LABEL_GAP_PX = 10;
/** Air between two plates. */
export const LABEL_AIR_PX = 4;

export const labelHeightPx = (lines: number): number => LABEL_PAD_PX + LABEL_LINE_PX * (1 + lines);

const intersects = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Returns, per anchor (same order), the CSS `top` of its plate. The plate's x is unchanged: `sx + gap` or
 * `sx - gap - width` when flipped, exactly as before.
 */
export function settleLabels(
  anchors: readonly LabelAnchor[],
  opts: { readonly widthPx: number; readonly reserved: readonly Rect[]; readonly frameH?: number },
): number[] {
  const order = anchors.map((_, i) => i).sort((a, b) => anchors[a]!.sy - anchors[b]!.sy);
  const tops = new Array<number>(anchors.length).fill(0);
  const placed: Rect[] = [...opts.reserved];
  for (const i of order) {
    const a = anchors[i]!;
    const h = labelHeightPx(a.lines);
    const left = a.flip ? a.sx - LABEL_GAP_PX - opts.widthPx : a.sx + LABEL_GAP_PX;
    const right = left + opts.widthPx;
    const boxAt = (top: number): Rect => ({ left, top, right, bottom: top + h });
    const clear = (r: Rect) => !placed.some((p) => intersects(p, r));

    let top = a.sy - LABEL_GAP_PX - h;            // above the anchor, the default
    if (!clear(boxAt(top))) {
      top = a.sy + LABEL_GAP_PX;                  // below it
      for (let n = 0; n < 12 && !clear(boxAt(top)); n++) {
        const hit = placed.filter((p) => intersects(p, boxAt(top)));
        top = Math.max(...hit.map((p) => p.bottom)) + LABEL_AIR_PX;   // slide past what it touches
      }
    }
    if (opts.frameH !== undefined && top + h > opts.frameH) {
      /* Off the bottom: go back above and accept the overlap over being clipped — a clipped label loses
         its provenance line, which is the one line this figure must never lose. */
      top = Math.max(0, a.sy - LABEL_GAP_PX - h);
    }
    tops[i] = top;
    placed.push(boxAt(top));
  }
  return tops;
}
