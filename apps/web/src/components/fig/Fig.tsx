import { useEffect } from 'react';
import type React from 'react';
import { clsx } from 'clsx';
import { useClock } from '@/lib/useClock';
import { markOf, observe } from '@/lib/figMarks';
import { figAnchor } from './figAddress';
import { formatMoney } from '@/lib/format';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  <Fig> — S6 of INSTRUMENT_100X_PLAN: one figure system for the eight desks
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The Bloomberg essence is not the colour orange; it is that every figure on the screen is LIVE, DATED
 * and ADDRESSABLE, and that a screen holds many of them. `<Fig>` is the one component that carries all
 * three so no desk has to remember:
 *
 *   · the VALUE, in IBM Plex Mono `tabular-nums` (`num-tabular` — the class 69 files already use, now
 *     with one home), formatted by KIND (money in major units, integer, percent, ratio, duration in
 *     minutes) and never rounded away from what the record holds;
 *   · the DELTA SINCE THE MARK — the value this figure showed at the operator's previous ARRIVAL (S4),
 *     with ▲ ▼ and the mark's instant, from `lib/figMarks.ts`; a first reading says so instead of
 *     inventing a zero;
 *   · the AGE of the source instant, coloured by staleness with the STATUS tokens only (fresh → ready,
 *     aging → conditional, stale → blocked), formatted from S1's clock (`useClock(1000)`) — no timer of
 *     its own;
 *   · the KEY ADDRESS — the ⌘K phrase / `g`-chord that lands on this figure — as a kbd chip.
 *
 * REFUSALS ARE VISIBLE. `source.at === null` renders the value UNDATED with a visible "undated" mark
 * and no delta (the −10 confidence rule made visible, not hidden); `value === null` renders the named
 * absence — "—" with the label — never a zero. `source.kind` says whether the figure is a record, a
 * derivation or an estimate, because a reader deciding whether to act is entitled to know.
 *
 * STILL. Nothing here animates; the arrival sweep is the shell's one motion (S4). Density is the layout's
 * property, not a spinner's.
 */

export type FigKind = 'money' | 'int' | 'pct' | 'ratio' | 'duration';
export type FigSourceKind = 'record' | 'derived' | 'estimate';

export interface FigSource {
  /** The instant the underlying record was written or the derivation computed. null = undated. */
  at: string | null;
  kind: FigSourceKind;
}

export interface FigProps {
  /** Stable per desk + figure: `${desk}.${name}`. The mark is keyed by it. */
  id: string;
  label: string;
  value: number | null;
  kind: FigKind;
  source: FigSource;
  /** ISO-4217 for money; defaults to USD. */
  currency?: string;
  /** Whether a rise is good (default true) — decides the delta's tone, never its sign. */
  goodIsUp?: boolean;
  /** The ⌘K phrase / chord that reaches this figure, shown as a chip. */
  address?: string;
  /**
   * The RECORD'S OWN comparison, when it carries one (a WBR metric's previous week, an SLO's target) — shown
   * beside the arrival delta, never instead of it: the two answer different questions.
   */
  compare?: { value: number; label: string };
  /**
   * The figure's OBSERVATION FRAME — what population it was counted over, what it could not see. The
   * marketing desk's lower-bound counts carry one, and a figure that drops its frame has become a claim.
   */
  frame?: React.ReactNode;
  /** Emphasis for the desk's headline figure. */
  hero?: boolean;
  onClick?: () => void;
  className?: string;
}

/* Staleness thresholds by kind of figure — a price is stale in hours, a headcount in weeks. */
const STALE_MS: Record<FigKind, { aging: number; stale: number }> = {
  money: { aging: 6 * 3_600_000, stale: 48 * 3_600_000 },
  int: { aging: 24 * 3_600_000, stale: 7 * 86_400_000 },
  pct: { aging: 24 * 3_600_000, stale: 7 * 86_400_000 },
  ratio: { aging: 24 * 3_600_000, stale: 7 * 86_400_000 },
  duration: { aging: 24 * 3_600_000, stale: 7 * 86_400_000 },
};

export function formatFig(value: number, kind: FigKind, currency = 'USD'): string {
  switch (kind) {
    case 'money': return currency === 'USD' ? formatMoney(value) : `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${currency}`;
    case 'int': return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
    case 'pct': return `${value.toLocaleString('en-US', { maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0 })}%`;
    case 'ratio': return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    case 'duration': {
      if (value < 60) return `${Math.round(value)} min`;
      if (value < 60 * 48) return `${(value / 60).toLocaleString('en-US', { maximumFractionDigits: 1 })} h`;
      return `${(value / 1440).toLocaleString('en-US', { maximumFractionDigits: 1 })} d`;
    }
  }
}

/** "3 h", "2 d", "41 s" — the age of an instant against the one clock. */
export function formatAge(atIso: string, nowMs: number): string {
  const ms = Math.max(0, nowMs - Date.parse(atIso));
  if (ms < 60_000) return `${Math.floor(ms / 1000)} s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h`;
  return `${Math.floor(ms / 86_400_000)} d`;
}

const SOURCE_WORD: Record<FigSourceKind, string> = { record: 'record', derived: 'derived', estimate: 'estimate' };

export function Fig({ id, label, value, kind, source, currency, goodIsUp = true, address, compare, frame, hero = false, onClick, className }: FigProps) {
  const nowMs = useClock(1000);
  useEffect(() => { observe(id, value, source.at); }, [id, value, source.at]);
  const anchor = figAnchor(id);
  // A palette "go to figure" row lands on `#fig-<id>`; the router does not scroll to hashes, so the figure does.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === `#${anchor}`) document.getElementById(anchor)?.scrollIntoView({ block: 'center' });
  }, [anchor]);

  const mark = markOf(id);
  const undated = source.at === null;
  const ageMs = undated ? null : Math.max(0, nowMs - Date.parse(source.at!));
  const staleness: 'fresh' | 'aging' | 'stale' | 'undated' =
    undated ? 'undated' : ageMs! >= STALE_MS[kind].stale ? 'stale' : ageMs! >= STALE_MS[kind].aging ? 'aging' : 'fresh';
  const ageTone = { fresh: 'text-status-ready', aging: 'text-status-conditional', stale: 'text-status-blocked', undated: 'text-status-blocked' }[staleness];

  let deltaNode: React.ReactNode = null;
  if (value !== null && !undated) {
    if (mark === null) {
      deltaNode = <span className="text-grey">first reading</span>;
    } else if (mark.value !== value) {
      const d = value - mark.value;
      const good = d > 0 === goodIsUp;
      const pct = mark.value !== 0 ? Math.abs((d / mark.value) * 100) : null;
      deltaNode = (
        <span className={good ? 'text-status-ready' : 'text-status-blocked'} title={`since your last arrival${mark.at ? `, record of ${mark.at.slice(0, 16).replace('T', ' ')} UTC` : ''}`}>
          {d > 0 ? '▲' : '▼'} {kind === 'pct' ? `${Math.abs(d).toLocaleString('en-US', { maximumFractionDigits: 1 })} pt` : pct !== null && pct < 1000 ? `${pct.toLocaleString('en-US', { maximumFractionDigits: pct < 10 ? 1 : 0 })}%` : formatFig(Math.abs(d), kind, currency)}
        </span>
      );
    } else {
      deltaNode = <span className="text-grey">unchanged</span>;
    }
  }

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-micro font-medium uppercase tracking-wide text-grey">{label}</span>
        {address && <kbd className="shrink-0 rounded border border-line px-1 font-mono text-micro text-grey" title="Reach this figure from ⌘K">{address}</kbd>}
      </div>
      <div className={clsx('num-tabular font-mono text-navy', hero ? 'text-[26px] leading-8' : 'text-lg leading-6')} data-fig-value={value === null ? '' : String(value)}>
        {value === null ? <span className="text-grey">—</span> : formatFig(value, kind, currency)}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-micro leading-snug">
        {value === null ? (
          <span className="text-grey">not in the record</span>
        ) : (
          <>
            {deltaNode}
            {compare && (
              <span className={compare.value === value ? 'text-grey' : (value - compare.value > 0) === goodIsUp ? 'text-status-ready' : 'text-status-blocked'} title={`${compare.label}: ${formatFig(compare.value, kind, currency)}`}>
                {value - compare.value === 0 ? '=' : value - compare.value > 0 ? '+' : '−'}{formatFig(Math.abs(value - compare.value), kind, currency)} {compare.label}
              </span>
            )}
            <span className={ageTone} title={undated ? 'This figure carries no source instant — the record does not say when it was true' : `${SOURCE_WORD[source.kind]} · ${source.at!.slice(0, 16).replace('T', ' ')} UTC`}>
              {undated ? 'undated' : `${formatAge(source.at!, nowMs)} · ${SOURCE_WORD[source.kind]}`}
            </span>
          </>
        )}
      </div>
      {frame && <div className="mt-0.5">{frame}</div>}
    </>
  );

  const cls = clsx('min-w-0 border-t border-line/70 px-2 py-1.5 text-left', onClick && 'hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10', className);
  return onClick
    ? <button type="button" id={anchor} onClick={onClick} className={cls} data-fig={id} data-staleness={staleness}>{body}</button>
    : <div id={anchor} className={cls} data-fig={id} data-staleness={staleness}>{body}</div>;
}

/** The terminal grid: dense rows of figures, no cards inside cards. */
export function FigGrid({ children, cols = 4, className }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 6; className?: string }) {
  const colCls = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 md:grid-cols-4', 6: 'grid-cols-3 md:grid-cols-6' }[cols];
  return <div className={clsx('grid gap-x-3 border-b border-line/70', colCls, className)} role="list">{children}</div>;
}
