/**
 * G5 Stage 2's missing half — DIFFABLE DRAFTS.
 *
 * The plan's words are "a review queue — diffable drafts, acceptance with a named
 * human, rework loop". Versions were listed and never compared, which makes a reviewer
 * re-read forty pages to find the paragraph that moved. A QA gate whose cost is
 * re-reading everything is a QA gate that gets skipped on a Friday.
 *
 * ── WHY THIS IS PURE, AND HERE ───────────────────────────────────────────────
 * A diff is arithmetic over two strings. Putting it in the shared layer means it is
 * tested without a browser or a database, and means the API can use it too (for a
 * printed review sheet) without a second implementation. No dependency is added: the
 * shared GPS layer is scanned by a ratchet that forbids runtime imports, so this is a
 * classic LCS walk in about forty lines rather than a library.
 *
 * ── LINE GRANULARITY, DELIBERATELY ───────────────────────────────────────────
 * Word-level highlighting reads better in a code review and worse here: these drafts
 * are regulatory prose, where a reviewer's question is "which CLAIM changed", and a
 * claim is a line. Line granularity also makes the `[FACT REQUIRED: …]` markers pop
 * as whole added or removed lines, which is the single most important thing to see
 * between two versions of a MiCA draft.
 */

export type DiffKind = 'same' | 'added' | 'removed';

export interface DiffLine {
  readonly kind: DiffKind;
  readonly text: string;
  /** 1-based line number in the OLD version; null for an added line. */
  readonly oldLine: number | null;
  /** 1-based line number in the NEW version; null for a removed line. */
  readonly newLine: number | null;
}

export interface DraftDiff {
  readonly lines: readonly DiffLine[];
  readonly added: number;
  readonly removed: number;
  readonly unchanged: number;
  /** True when the two versions are byte-identical — worth saying out loud. */
  readonly identical: boolean;
  /**
   * Added or removed lines carrying a `[FACT REQUIRED: …]` marker, which is the
   * question a reviewer actually has: did this revision CLOSE a hole or OPEN one?
   */
  readonly factMarkersAdded: number;
  readonly factMarkersRemoved: number;
}

const FACT_MARKER = /\[FACT REQUIRED:/;

/** Longest-common-subsequence table over lines. O(n·m); drafts are ~1k lines at most. */
function lcsLengths(a: readonly string[], b: readonly string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

/**
 * Diff two draft versions, oldest first. Deterministic: same inputs, same output,
 * including the tie-break (a removal is emitted before an addition at the same
 * position, so a changed line reads old-then-new the way a person expects).
 */
export function draftDiff(oldText: string, newText: string): DraftDiff {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const table = lcsLengths(a, b);
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i], oldLine: i + 1, newLine: j + 1 });
      i++; j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ kind: 'removed', text: a[i], oldLine: i + 1, newLine: null });
      i++;
    } else {
      lines.push({ kind: 'added', text: b[j], oldLine: null, newLine: j + 1 });
      j++;
    }
  }
  while (i < a.length) {
    lines.push({ kind: 'removed', text: a[i], oldLine: i + 1, newLine: null });
    i++;
  }
  while (j < b.length) {
    lines.push({ kind: 'added', text: b[j], oldLine: null, newLine: j + 1 });
    j++;
  }

  const added = lines.filter((l) => l.kind === 'added');
  const removed = lines.filter((l) => l.kind === 'removed');
  return {
    lines,
    added: added.length,
    removed: removed.length,
    unchanged: lines.length - added.length - removed.length,
    identical: oldText === newText,
    factMarkersAdded: added.filter((l) => FACT_MARKER.test(l.text)).length,
    factMarkersRemoved: removed.filter((l) => FACT_MARKER.test(l.text)).length,
  };
}

/** One sentence a reviewer can act on, or the honest statement that nothing moved. */
export function diffHeadline(d: DraftDiff): string {
  if (d.identical) {
    return 'These two versions are byte-identical. Whatever the rework asked for did not reach the text.';
  }
  const parts = [`${d.added} line(s) added, ${d.removed} removed, ${d.unchanged} unchanged`];
  if (d.factMarkersRemoved > 0) {
    parts.push(`${d.factMarkersRemoved} [FACT REQUIRED] marker(s) CLOSED — check each one is closed by a supplied fact and not by prose`);
  }
  if (d.factMarkersAdded > 0) {
    parts.push(`${d.factMarkersAdded} NEW [FACT REQUIRED] marker(s) — this revision opened holes the previous version did not have`);
  }
  return `${parts.join('. ')}.`;
}
