/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE WATCH — S4 of INSTRUMENT_100X_PLAN.md: what changed while you were away, ranked by consequence
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The CIA half of the plan. An arriving officer is told what changed while they slept, ranked by
 * consequence, before reading a word. LCXOS had the ingredients and not the sentence: an audit
 * log with 13 writers, `updated_at` on 56 tables, a notification bus that already knows its
 * compartment, an invoice aging summary, a perimeter view that knows when a review expires — and
 * an operator who answered "what do I look at first" by opening eighty routes.
 *
 * This module is the WIRE SHAPE and the RANKING PRIOR, declared once for the API that composes the
 * watch and the shell that performs its arrival. Pure: no I/O, no clock; the composer passes `asOf`.
 *
 * THE RANKING IS A STATED PRIOR, NOT A LEARNED ONE — and it says so on the response. Money first,
 * because a paid or disputed invoice and a won or lost deal move the number the business is run
 * on; liability second, because an expiring perimeter review or an amended conflict check is a
 * regulated employee's exposure; deadline third; activity last. The order is one constant so the
 * owner can overrule it in one edit, and the loop can replace it the day outcome data exists.
 */

import type { WorkspaceId } from './workspaces.js';

export type WatchKind = 'money' | 'liability' | 'deadline' | 'activity';

/** The prior, in rank order. Index IS rank. One constant; the owner may reorder it. */
export const WATCH_RANK: readonly WatchKind[] = ['money', 'liability', 'deadline', 'activity'] as const;

/** How many ranked items the arrival shows before folding the rest into one count line. */
export const WATCH_CAP = 12;

export type WatchSource = 'audit' | 'table' | 'notification' | 'perimeter' | 'invoice';

export interface WatchItem {
  /** Stable within a response: `${source}:${workspace}:${entity}:${id}`. */
  id: string;
  workspace: WorkspaceId;
  kind: WatchKind;
  /** 0 = first thing to look at. Dense within the response. */
  rank: number;
  title: string;
  /** One sentence of evidence — what changed, in the record's own terms. Never an inference. */
  detail: string;
  /** SPA route to open, or null when the object has no page of its own. */
  href: string | null;
  /** The instant the change was recorded, ISO. */
  at: string;
  source: WatchSource;
}

export interface WatchRoom {
  changed: number;
  top: WatchItem | null;
}

export interface WatchResponse {
  /** The watermark the caller asked from, echoed verbatim. */
  since: string;
  asOf: string;
  /** Ranked, capped at WATCH_CAP. */
  items: WatchItem[];
  /** Per compartment the operator HOLDS — compartments they do not hold are absent, not zero. */
  byWorkspace: Partial<Record<WorkspaceId, WatchRoom>>;
  /** Items beyond the cap — reported as a count, never dropped silently. */
  unranked: number;
  /**
   * What the watch could NOT see, in sentences: "nothing recorded since …" (about the record, not
   * the world), a register that does not exist on this environment, a compartment withheld by
   * entitlement. An empty `items` with an empty `absent` is a bug, and the API refuses to emit it.
   */
  absent: string[];
  /** The ranking's basis, said on every response so no surface can present it as learned. */
  rankingBasis: 'stated_prior';
}

/** Rank items by kind order, then recency. Pure; the composer's only sort. */
export function rankWatchItems(items: readonly Omit<WatchItem, 'rank'>[]): WatchItem[] {
  const order = new Map(WATCH_RANK.map((k, i) => [k, i] as const));
  return [...items]
    .sort((a, b) => {
      const ka = order.get(a.kind) ?? 99, kb = order.get(b.kind) ?? 99;
      if (ka !== kb) return ka - kb;
      return Date.parse(b.at) - Date.parse(a.at);
    })
    .map((it, i) => ({ ...it, rank: i }));
}

/** The sentence the watch says when the record is silent — about the record, never the world. */
export function nothingRecordedSince(sinceIso: string): string {
  return `Nothing recorded since ${sinceIso.slice(0, 16).replace('T', ' ')} UTC — a statement about the record, not about the world.`;
}
