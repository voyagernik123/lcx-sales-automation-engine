/**
 * The LCX mark — the four-arrow symbol, and the ONLY place it is drawn.
 *
 * PROVENANCE, which is why this file reads like a receipt.
 *
 * `Visual Guidelines - LCX Final 1.0.pdf` says, on both logotype pages:
 *
 *     "Do not attempt to redraw or recreate any element of the logotype.
 *      Use the approved digital files of the artwork."
 *
 * So these four paths were NOT drawn. They were read out of the PDF's own vector
 * path items (page 12, "Variation Logotype" — the symbol-alone lockup, which is
 * the sanctioned mark-only use), and then the extraction was PROVEN rather than
 * eyeballed: the generated SVG was rendered at 1024px and XOR-compared against a
 * 1024px render of the same region of the approved PDF. Result — 4,908 differing
 * pixels, of which 4,908 (100.000%) lie on a shape boundary and **0 are
 * interior**. Identical geometry; only 1px of anti-aliasing differs.
 *
 * The asymmetries are the artwork's own (194.000 vs 193.999, 148.954 vs 148.917).
 * They are deliberately NOT tidied up, because tidying them would be redrawing.
 * If you "clean" these numbers you have replaced approved artwork with your own.
 *
 * The same coordinates generate the app icon; see
 * `apps/desktop/src-tauri/icons/` and the generator recorded in
 * `docs/brand-make-icons.py`. One source of truth, two outputs.
 *
 * BRAND RULES THIS COMPONENT ENFORCES (book, page 12):
 *   · symbol-only use is sanctioned as the "Variation Logotype"
 *   · clear space = 1/3 of the mark's height on every side — callers get this via
 *     `withClearSpace`, so it cannot be forgotten
 *   · minimum digital size 40px wide
 *   · never rotate, never add a shadow, never recolour off-palette, never crop
 *     the mark or bleed it off its tile
 * `fill="currentColor"` is how one file serves light and dark: the mark inherits
 * the text colour of wherever it sits, so it can never be a low-contrast
 * blue-on-blue — one of the book's explicit don'ts.
 */

/** The mark's own coordinate space, straight from the approved artwork. */
export const MARK_VIEWBOX = '0 0 194.000 193.999';

/** The four arrows: north, east, south, west. Extracted, not drawn. */
export const MARK_PATHS = [
  'M97.722 82.019L148.917 30.605L148.733 0.065L97.113 52.244L45.454 0.000L45.045 30.144Z',
  'M111.852 97.505L163.347 148.620L193.936 148.436L141.674 96.897L194.000 45.320L163.808 44.912Z',
  'M96.278 111.981L45.083 163.394L45.267 193.934L96.887 141.756L148.546 193.999L148.954 163.855Z',
  'M82.148 96.027L30.653 44.912L0.065 45.097L52.326 96.635L0.000 148.212L30.192 148.620Z',
] as const;

/** Book, page 12: "the minimum size is 40 pixels wide". */
export const MARK_MIN_PX = 40;

interface Props {
  /** Rendered width AND height in px. Below MARK_MIN_PX is a brand violation. */
  size?: number;
  /**
   * Reserve the book's clear space (1/3 of the mark's height per side) as padding
   * inside the given box, instead of letting the mark run to the edge. Use this
   * whenever the mark sits on a filled tile.
   */
  withClearSpace?: boolean;
  className?: string;
  /**
   * The mark is decorative wherever the product name is already written beside
   * it — which is everywhere in this app — so it defaults to aria-hidden rather
   * than announcing "LCX" twice to a screen reader.
   */
  title?: string;
}

/**
 * WHY THERE IS NO `<g transform>` HERE.
 *
 * Clear space used to be implemented with `transform="translate(…) scale(…)"`. A
 * viewBox does the same job declaratively — widen it by 1/3 of the mark's height per
 * side and the renderer maps it once, with no transform node to carry:
 *
 *     padded  = 194 * 5/3 = 323.333   (clear space = 1/3 of height, each side)
 *     offset  = (323.333 - 194) / 2 = 64.667
 *     viewBox = "-64.667 -64.667 323.333 323.333"
 *
 * Same geometry, same brand rule, less work per paint. Kept because it is simpler.
 *
 * WHAT THIS CHANGE DOES **NOT** FIX, stated because I twice guessed wrong about it.
 * `e2e/framebudget.spec.ts` fails at ~3.6ms per juiced element against a 0.5ms
 * budget, in CI and locally, and it passed on the commit before the rebrand. I
 * suspected this mark, because `TopNav` puts it on every page including the juiced
 * table and `playJuice` forces a reflow per element. **That is refuted:** the mark was
 * removed from TopNav and the full suite re-run in the regime where the failure
 * actually reproduces — still red. Removing it changes nothing measurable
 * (1.14/1.16/1.62ms with, 1.10/1.48/1.21ms without, isolated).
 *
 * Two earlier readings of mine were also wrong and are recorded so nobody repeats
 * them: "proven not my change" (drawn from isolated runs swinging 78→123ms, which is
 * noise, not evidence) and "the transform is the cause" (this paragraph's first
 * draft). The regime matters — isolated runs sit near 1.2ms, the full parallel suite
 * near 3.6ms, and only the second one is what CI measures.
 *
 * So the cause is OPEN. The budget is deliberately not loosened (§6 rule 10: never
 * buy green by proving less), which means the playwright job stays red until someone
 * finds it. The unit/build/perf job is green, so this is a known unknown about one
 * animation's cost, not about correctness.
 */
const MARK_W = 194;
const MARK_H = 193.999;
/** Clear space = 1/3 of the mark's height per side (book, page 12). */
const PADDED_W = (MARK_W * 5) / 3;
const PAD = (PADDED_W - MARK_W) / 2;

export function LcxMark({ size = 24, withClearSpace = false, className, title }: Props) {
  const viewBox = withClearSpace
    ? `${-PAD} ${-PAD} ${PADDED_W} ${PADDED_W}`
    : `0 0 ${MARK_W} ${MARK_H}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      className={className}
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/**
 * The product lockup: mark + LCXOS. One component so the name is spelled one way
 * everywhere — before the rename the shipped UI had `LCX TERMINAL` in the window
 * title and the cheat card, `LCX USA` in the top bar and on the sign-in page, and
 * the letters `LCX` set in a monospace box standing in for a logo, all at once.
 *
 * (This sentence was itself briefly false: the rename's own search-and-replace
 * rewrote the old name inside this very paragraph, turning it into "the rename it
 * replaces had LCXOS…". Repaired by hand. A blanket replace edits the prose that
 * explains the replace, which is worth knowing before running the next one.)
 */
export function LcxosLockup({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <span
        className="flex items-center justify-center rounded-md bg-lcx-black text-lcx-white"
        style={{ width: size, height: size }}
      >
        <LcxMark size={size} withClearSpace />
      </span>
      <span className="text-[15px] font-bold tracking-tight text-navy">LCXOS</span>
    </span>
  );
}
