import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Printer, RefreshCw, ShieldOff, ShieldAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTitle, Button, InspectorDrawer } from '@/components/ui';
import { EmptyState, PageSkeleton } from '@/components/shared';
import { PrintStyles } from '@/components/report/PrintStyles';
import { useListNavigation } from '@/hooks/useListNavigation';
import {
  fetchOriginationQueue, fetchTargetBrief,
  provenanceLabel, BRIEF_SECTION_LABELS, BRIEF_SECTION_ORDER,
  type OriginationResponse, type QueueRow, type RefusalEntry, type RefusalLedger,
  type DeferredCut, type FactProvenance, type WhyNowTrigger, type TriggerState,
  type BriefResponse, type BriefAssertion, type BriefIntegrity,
} from '@/lib/api/gpsOrigination';
import { GpsMetaBanner } from './GpsMetaBanner';

/**
 * GLOBAL SERVICES — THE ORIGINATION QUEUE (Phase 8).
 *
 * `targeting.ts` is 1,152 lines with 70 passing tests and, until this file, ZERO
 * web references. This page is not a new capability; it is the first sight of one
 * that has been running in the dark since Phase 4. Everything below renders a
 * field that already existed on `OriginationQueue` — nothing here computes a
 * ranking, a confidence, a gate or a grade, because a screen that recomputes any
 * of those becomes a second opinion nobody reconciles.
 *
 * WHAT THIS SURFACE IS FOR, in one sentence: a finite queue he can trust, which
 * requires seeing what was EXCLUDED as clearly as what was included.
 *
 * The doctrine, and where each part of it lives on this screen:
 *
 *  D1 · every number opens. The score cell is a button; pressing it expands the
 *       full signed `Driver` trail, all six factors, summing to `rawScore`, with
 *       the weights version and the fact that the weights are a STATED PRIOR
 *       rather than a fitted model printed beside it.
 *  D2 · the refusal ledger is a PANEL, not a footnote, and it is rendered before
 *       any commentary about the queue. A gated target is absent from the table
 *       (`QueueRow.score` is non-nullable precisely so it cannot be there) and
 *       present in the ledger with every gate that fired, its reason, and whether
 *       it is a WALL or a TASK. `pages/__tests__/gpsOrigination.test.tsx` asserts
 *       both halves of that sentence.
 *  D3 · SCORE and CONF are separate columns with separate headers. There is no
 *       cell on this page containing a confidence-adjusted score, and the column
 *       header says so out loud so a reader is not left to infer it.
 *  D4 · the advisories, the deferred cut's reason, and the brief's integrity
 *       violations are printed, not hidden behind an "info" affordance. The screen
 *       tells him what is wrong with what it just told him.
 *  D5 · one dense table, monospace numerics, `tabular-nums` so digits do not jitter
 *       between rows. DELIBERATELY NO STAT CARDS: the existing four-stat GPS strip
 *       (`pages/Gps.tsx`) is the anti-pattern this phase was called in to correct —
 *       four numbers in four boxes is a third of a screen spent on four integers.
 *       The counts live in one tape line at the top.
 *  D6 · `useListNavigation` — the table is ONE tab stop, arrows move the cursor,
 *       Enter opens the brief. Same hook as the BD lead queue, so the movement
 *       grammar is identical across the app.
 *  D7 · `PrintStyles` plus both instants (`asOf` and `generatedIso`) in the header,
 *       because a printed queue with no date is a queue somebody will act on next
 *       quarter.
 *  D8 · no claim without a mechanism. Every grade on this page comes from
 *       `provenanceLabel()`, which always prints the age beside the grade
 *       (`origination.ts:230`) — so a fresh A1 and a stale B2 cannot render alike
 *       here even by accident, because the helper leaves no way to print the grade
 *       alone.
 *
 * WHAT THIS PAGE DOES NOT DO: there is no discovery, search or import affordance.
 * The watchlist is curated elsewhere, deliberately (plan §4, "explicitly not
 * built: the global discovery engine"), and an empty queue therefore says "no
 * watchlist yet" rather than showing a plausible-looking ranking of nothing.
 */

/** Band → tone. `low` is amber, not red: a low band means GO AND GET EVIDENCE, not "bad target" (`targeting.ts:869`). */
const BAND_TONE: Record<string, string> = {
  high: 'text-emerald-600 dark:text-emerald-400',
  medium: 'text-cyan-700 dark:text-cyan-400',
  low: 'text-amber-600 dark:text-amber-400',
};

/**
 * Trigger state → tone. `absent` is grey and `expired` amber on purpose: no
 * why-now is the ordinary condition of a lead list, while an EXPIRED one is a
 * record nobody re-checked, which is worse than none because it looks like one.
 */
const TRIGGER_TONE: Record<TriggerState, string> = {
  fresh: 'text-emerald-600 dark:text-emerald-400',
  ageing: 'text-cyan-700 dark:text-cyan-400',
  expired: 'text-amber-600 dark:text-amber-400',
  undated: 'text-amber-600 dark:text-amber-400',
  absent: 'text-grey',
};

export function GpsOrigination() {
  const [res, setRes] = useState<OriginationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setRes(null);
    fetchOriginationQueue()
      .then(setRes)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);
  useEffect(load, [load]);

  // Same two-step as CommandDeck: the print tokens are pinned inside the media
  // query, but a `dark:` VARIANT still matches while the class is on <html>, so the
  // class comes off for the duration of the job (`components/report/PrintStyles.tsx`).
  const print = () => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    if (wasDark) root.classList.remove('dark');
    setTimeout(() => { window.print(); if (wasDark) root.classList.add('dark'); }, 60);
  };

  return (
    <div className="br-page mx-auto max-w-[1500px] p-5">
      <PrintStyles />
      <PageTitle
        icon={<Crosshair size={20} />}
        subtitle="A finite, ranked, explained queue — and the ledger of everything that was refused, with the gate that fired and its reason."
        actions={
          <div className="br-no-print flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={print}><Printer size={13} /> Print</Button>
            <Button size="sm" variant="secondary" onClick={load}><RefreshCw size={13} /> Reload</Button>
          </div>
        }
      >
        Origination · the queue
      </PageTitle>

      {/* THE READ, DECLARING ITSELF — above the queue and above the empty state,
          because the empty state is the thing it corrects. */}
      <GpsMetaBanner of={[res]} />

      {error ? (
        <EmptyState variant="error" title="Origination unavailable" description={error} />
      ) : !res ? (
        <PageSkeleton />
      ) : res.counts.considered === 0 ? (
        /* HONEST EMPTY STATE. Zero considered means the watchlist is empty, and this
         * page has no way to fill it — origination reads a curated list and there is
         * no discovery engine by design (plan §4). Saying "no targets match" would
         * imply a search ran; saying nothing at all would read as "nothing to do".
         *
         * IT NO LONGER CLAIMS NOTHING IS HIDDEN, and that removal is the point. Two
         * different states produce `considered === 0`: an empty watchlist, and a
         * database with no `gps_target` table — which is TODAY's state, because no
         * migration creates it (`gps/origination.ts` probes for it and the route
         * serves an empty queue when the probe fails). The route knows which it is
         * and reports it as `meta.migrated`, and as of `lib/api/meta.ts` the envelope
         * reaches the browser: `<GpsMetaBanner>` above prints the missing-tables
         * reading when that is the reason, so THIS text is now the other reading only
         * — an empty watchlist — and no longer has to hedge between the two. It still
         * does not claim nothing is hidden: the banner is what would say so. */
        <EmptyState
          variant="default"
          title="No watchlist yet"
          description="Nothing has been recorded to originate against. This queue ranks a curated watchlist — it does not source targets, by design — so it stays empty until targets exist. If the storage layer were missing instead, the notice above this list would say so; nothing above it means the watchlist itself is empty."
        />
      ) : (
        <Loaded res={res} />
      )}
    </div>
  );
}

function Loaded({ res }: { res: OriginationResponse }) {
  const { queue, counts } = res;
  const [briefFor, setBriefFor] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Tape res={res} />

      {/* THE QUEUE. Rendered first because it is the work; the ledger follows
        * immediately and at the same visual weight, which is the compromise between
        * "refusals are half the product" and "the queue is what he opens this for". */}
      <Section
        title={`Queue — ${counts.queued} of ${counts.considered} considered`}
        /* The BASIS, printed beside the ranking, because a ranking whose weights look
         * fitted when they are stated priors is the most expensive kind of decoration.
         * Both bases are read off the payload — neither sentence is authored here, so
         * the day the weights ARE learned from outcomes this line changes by itself. */
        note={`Capacity ${queue.capacity}. Ranked by ${queue.weightsVersion} weights — ${queue.weightsBasis.learnedFromOutcomes ? 'fitted from outcomes' : 'a STATED PRIOR, not learned from outcomes'}, reviewed ${queue.weightsBasis.reviewCadence}, stated ${queue.weightsBasis.statedOn}. Why-now shelf lives: ${queue.triggerBasis.learnedFromOutcomes ? 'fitted' : 'stated priors'} (${queue.triggerBasis.version}, stated ${queue.triggerBasis.statedOn}) — ${queue.triggerBasis.note}`}
      >
        <QueueTable rows={queue.rows} onOpenBrief={setBriefFor} />
      </Section>

      {queue.deferred.count > 0 && <DeferredPanel cut={queue.deferred} />}

      <RefusalPanel ledger={queue.refusals} onOpenBrief={setBriefFor} />

      <BriefDrawer targetId={briefFor} onClose={() => setBriefFor(null)} />
    </div>
  );
}

/**
 * The counts, as ONE dense line.
 *
 * Not four cards. `considered = queued + deferred + refused` is an identity the
 * shared module derives in a single expression and asserts in its tests
 * (`origination.ts:1216`), and printing the identity on one line is what lets a
 * reader check it at a glance — which is the whole reason the field exists, GPS
 * having previously shipped a surface whose counts were not on the response at all.
 */
function Tape({ res }: { res: OriginationResponse }) {
  const { counts, queue } = res;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-card px-4 py-2 font-mono text-micro tabular-nums shadow-card">
      <Cell k="considered" v={counts.considered} />
      <Cell k="queued" v={counts.queued} />
      <Cell k="deferred" v={counts.deferred} tone={counts.deferred > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
      <Cell k="refused" v={counts.refused} tone={counts.refused > 0 ? 'text-red-600 dark:text-red-400' : undefined} />
      <span className="text-grey">
        {'('}wall <span className="font-bold text-red-600 dark:text-red-400">{counts.walls}</span>
        {' · '}task <span className="font-bold text-amber-600 dark:text-amber-400">{counts.tasks}</span>{')'}
      </span>
      <span className="ml-auto text-grey">
        measured as of <span className="text-navy">{queue.asOf}</span>
        {' · built '}<span className="text-navy">{res.generatedIso}</span>
      </span>
    </div>
  );
}

function Cell({ k, v, tone }: { k: string; v: number; tone?: string }) {
  return (
    <span className="text-grey">
      {k} <span className={clsx('font-bold', tone ?? 'text-navy')}>{v}</span>
    </span>
  );
}

function Section({ title, note, children, tone }: {
  title: string; note?: string; children: React.ReactNode; tone?: 'refusal';
}) {
  return (
    <section className={clsx(
      'rounded-lg border bg-card p-4 shadow-card',
      tone === 'refusal' ? 'border-red-500/40' : 'border-line',
    )}>
      <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">{title}</div>
      {note && <p className="mb-3 text-micro text-grey">{note}</p>}
      {children}
    </section>
  );
}

/* ── The queue table ────────────────────────────────────────────────────────── */

/**
 * The dense table. Eight columns, and the two that matter most to the doctrine are
 * adjacent and separate: SCORE and CONF.
 *
 * ONE TAB STOP (D6). `useListNavigation` gives the tbody a roving tabindex, so Tab
 * enters and leaves the table in one press while the arrows move the cursor, Home
 * and End jump, and Enter opens the brief for the cursor row. The same hook drives
 * the BD lead queue, which is the point — a second movement grammar for a second
 * ranked list is how an instrument becomes an app.
 *
 * Expansion is per row and additive: opening a trail never closes another, because
 * comparing two rows' trails is the reason to open them.
 */
function QueueTable({ rows, onOpenBrief }: { rows: QueueRow[]; onOpenBrief: (id: string) => void }) {
  const body = useRef<HTMLTableSectionElement>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const nav = useListNavigation({
    count: rows.length,
    container: body,
    onActivate: (i) => { const r = rows[i]; if (r) onOpenBrief(r.targetId); },
  });

  if (rows.length === 0) {
    // Not the same sentence as an empty watchlist. Everything considered was either
    // refused or deferred, and both of those have their own panel below — so this
    // says where the rows went rather than implying there were none.
    return (
      <p className="text-label text-grey">
        Nothing reached the queue. Every target considered was refused or deferred — see the ledger and the deferred cut below.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-micro">
        <thead>
          <tr className="border-b border-line text-grey">
            <Th className="w-8 text-right">#</Th>
            <Th>Target</Th>
            <Th className="w-16 text-right">Score</Th>
            {/* The header carries the rule, not a comment: D3 is only enforced on
              * screen if the reader can see that the two numbers are two numbers. */}
            <Th className="w-24 text-right" title="Computed separately and never multiplied into the score">Conf · band</Th>
            <Th className="w-40">Evidence grade</Th>
            <Th>Why now · date · grade</Th>
            <Th className="w-56">Top drivers</Th>
            <Th className="w-24">Gaps</Th>
          </tr>
        </thead>
        <tbody ref={body} {...nav.containerProps}>
          {rows.map((r, i) => {
            const expanded = open.has(r.targetId);
            return [
              <tr
                key={r.targetId}
                {...nav.rowProps(i)}
                aria-expanded={expanded}
                data-testid={`queue-row-${r.targetId}`}
                className={clsx(
                  'border-b border-line/50 align-top outline-none',
                  nav.index === i && 'bg-cyan-500/5 ring-1 ring-inset ring-cyan-500/40',
                )}
              >
                <Td className="text-right font-mono tabular-nums text-grey">{r.rank}</Td>
                <Td>
                  <button
                    onClick={() => onOpenBrief(r.targetId)}
                    className="text-left text-label font-semibold text-navy hover:underline"
                  >
                    {r.name}
                  </button>
                  <div className="text-[10px] text-grey">{r.jurisdiction ?? 'jurisdiction not recorded'}</div>
                </Td>
                {/* D1: the number opens. One interaction, no navigation, no modal. */}
                <Td className="text-right">
                  <button
                    onClick={() => toggle(r.targetId)}
                    data-testid={`score-${r.targetId}`}
                    aria-label={`Score ${r.score} for ${r.name} — open the driver trail`}
                    className="font-mono text-label font-bold tabular-nums text-navy hover:underline"
                  >
                    {r.score}
                  </button>
                </Td>
                <Td className="text-right" data-testid={`conf-${r.targetId}`}>
                  <span className="font-mono tabular-nums text-navy">{r.confidence}</span>
                  <span className={clsx('ml-1 font-semibold uppercase', BAND_TONE[r.band])}>{r.band}</span>
                </Td>
                <Td className="font-mono text-grey-dark">
                  {r.provenance.length > 0
                    ? provenanceLabel(r.provenance[0])
                    : <span className="text-amber-600 dark:text-amber-400">no graded evidence</span>}
                  {r.provenance.length > 1 && <span className="text-grey"> +{r.provenance.length - 1}</span>}
                </Td>
                <Td><TriggerCell trigger={r.trigger} state={r.triggerState} /></Td>
                <Td className="font-mono">
                  {[...r.drivers]
                    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
                    .slice(0, 3)
                    .map((d) => (
                      <div key={d.label} className="flex gap-1.5">
                        <span className={clsx('w-8 shrink-0 text-right tabular-nums font-bold', d.points < 0 ? 'text-red-600 dark:text-red-400' : 'text-navy')}>
                          {d.points > 0 ? '+' : ''}{d.points}
                        </span>
                        <span className="min-w-0 truncate text-grey-dark">{d.label}</span>
                      </div>
                    ))}
                </Td>
                <Td className="text-[10px]">
                  {r.missingFactors.length > 0 && (
                    <div className="text-amber-600 dark:text-amber-400">{r.missingFactors.length} factor{r.missingFactors.length === 1 ? '' : 's'} unknown</div>
                  )}
                  {r.unprovenanced.length > 0 && (
                    <div className="text-amber-600 dark:text-amber-400">{r.unprovenanced.length} unsourced input{r.unprovenanced.length === 1 ? '' : 's'}</div>
                  )}
                  {r.missingFactors.length === 0 && r.unprovenanced.length === 0 && <span className="text-grey">—</span>}
                </Td>
              </tr>,
              expanded ? (
                <tr key={`${r.targetId}-trail`} data-testid={`trail-${r.targetId}`} className="border-b border-line/50 bg-ice-soft/30 dark:bg-ice-soft/5">
                  <Td colSpan={8}><Trail row={r} /></Td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-grey">
        ↑↓ move · Home/End jump · ⏎ opens the brief · click a score to open its driver trail.
      </p>
    </div>
  );
}

function Th({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <th title={title} className={clsx('px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider', className)}>{children}</th>;
}

/**
 * `data-testid` is declared explicitly rather than left to a rest-spread.
 *
 * TypeScript does not type-check HYPHENATED JSX props on a component, so
 * `<Td data-testid="…">` compiled clean while silently dropping the attribute —
 * the assertion for it failed at runtime with a green `tsc`. Naming the prop is
 * what makes the drop impossible; the general lesson is that a `data-*` prop on a
 * custom component is checked by nothing.
 */
function Td({ children, className, colSpan, 'data-testid': testId }: {
  children: React.ReactNode; className?: string; colSpan?: number; 'data-testid'?: string;
}) {
  return <td colSpan={colSpan} data-testid={testId} className={clsx('px-2 py-1.5', className)}>{children}</td>;
}

/** Why-now: the kind, the sentence, the date, the state, and the grade of the record itself. */
function TriggerCell({ trigger, state }: { trigger: WhyNowTrigger | null; state: TriggerState }) {
  if (!trigger) {
    // A row with no why-now is a list entry, not a reason to call today. Said out
    // loud rather than left as an empty cell (`origination.ts:311`).
    return <span className={clsx('text-[10px]', TRIGGER_TONE[state])}>no why-now recorded — this is a list entry, not a reason to call today</span>;
  }
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="text-label text-navy">{trigger.statement}</span>
        <span className={clsx('font-mono text-[10px] font-bold uppercase', TRIGGER_TONE[state])}>{state}</span>
        {trigger.futureDated && (
          <span className="font-mono text-[10px] font-bold uppercase text-red-600 dark:text-red-400">future-dated — check this</span>
        )}
      </div>
      <div className="font-mono text-[10px] text-grey">
        {trigger.kindLabel} · {trigger.occurredIso ?? 'undated'}
        {trigger.ageDays != null && ` · ${trigger.ageDays}d of ${trigger.shelfLifeDays}d shelf life`}
        {' · '}{provenanceLabel(trigger.provenance)}
      </div>
    </div>
  );
}

/**
 * The full driver trail — D1's "one interaction" destination.
 *
 * Shows ALL six factors, not the non-zero ones. A factor contributing exactly zero
 * is a finding ("we know nothing about their access") and dropping it from the trail
 * would turn a complete audit into a highlights reel. The trail prints the sum and
 * the clamp separately because `rawScore` and `score` differ when the drivers sum
 * past 100, and a reader who adds the column up must not conclude the page is wrong.
 */
function Trail({ row }: { row: QueueRow }) {
  const sum = row.drivers.reduce((a, d) => a + d.points, 0);
  return (
    <div className="grid gap-4 py-1 md:grid-cols-2">
      <div>
        <Label>Driver trail — all six factors, signed</Label>
        <table className="w-full font-mono text-micro tabular-nums">
          <tbody>
            {row.drivers.map((d) => (
              <tr key={d.label}>
                <td className="py-0.5 pr-2 text-grey-dark">{d.label}</td>
                <td className={clsx('py-0.5 text-right font-bold', d.points < 0 ? 'text-red-600 dark:text-red-400' : d.points === 0 ? 'text-grey' : 'text-navy')}>
                  {d.points > 0 ? '+' : ''}{d.points}
                </td>
              </tr>
            ))}
            <tr className="border-t border-line">
              <td className="py-0.5 pr-2 font-bold text-grey">raw sum</td>
              <td className="py-0.5 text-right font-bold text-navy">{sum}</td>
            </tr>
            <tr>
              <td className="py-0.5 pr-2 text-grey">reported rawScore</td>
              <td className="py-0.5 text-right text-navy">{row.rawScore}</td>
            </tr>
            <tr>
              <td className="py-0.5 pr-2 text-grey">score (clamped 0–100)</td>
              <td className="py-0.5 text-right font-bold text-navy">{row.score}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-[10px] text-grey">{row.summary}</p>
      </div>

      <div className="space-y-3">
        <div>
          {/* Beside, never inside. The penalties are the confidence's OWN trail and
            * they are printed in the same signed Driver shape as the score's, which
            * is what makes it visible that they are two computations rather than one. */}
          <Label>Confidence {row.confidence} · band {row.band} — computed separately, never multiplied into the score</Label>
          {row.confidencePenalties.length === 0 ? (
            <p className="text-micro text-grey">No confidence penalties.</p>
          ) : (
            <div className="font-mono text-micro tabular-nums">
              {row.confidencePenalties.map((p) => (
                <div key={p.label} className="flex gap-2">
                  <span className={clsx('w-8 shrink-0 text-right font-bold', p.points < 0 ? 'text-red-600 dark:text-red-400' : 'text-navy')}>
                    {p.points > 0 ? '+' : ''}{p.points}
                  </span>
                  <span className="text-grey-dark">{p.label}</span>
                </div>
              ))}
            </div>
          )}
          {row.missingFactors.length > 0 && (
            <p className="mt-1 text-micro text-amber-600 dark:text-amber-400">
              Unknown factors: {row.missingFactors.join(', ')} — what to go and get.
            </p>
          )}
        </div>

        <div>
          <Label>Provenance of the facts feeding this score</Label>
          <ProvenanceList facts={row.provenance} />
          {row.unprovenanced.length > 0 && (
            <p className="mt-1 text-micro text-amber-600 dark:text-amber-400">
              Moving the score with NO source attached: {row.unprovenanced.join(', ')}.
            </p>
          )}
        </div>

        {row.advisories.length > 0 && (
          <div>
            <Label>Advisories</Label>
            <ul className="space-y-0.5">
              {row.advisories.map((a) => (
                <li key={a} className="flex gap-1.5 text-micro text-amber-700 dark:text-amber-300">
                  <span className="text-grey">•</span>{a}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-grey">{children}</div>;
}

/**
 * Every fact through `provenanceLabel()` — the module's only grade renderer, and it
 * always prints the age (`origination.ts:224`). Staleness is marked separately as
 * well, because "stale" is a threshold judgement the module already made and
 * re-deriving it here from the age would be a second opinion.
 */
function ProvenanceList({ facts }: { facts: FactProvenance[] }) {
  if (facts.length === 0) {
    return <p className="text-micro text-amber-600 dark:text-amber-400">No graded evidence supplied for any scoring input.</p>;
  }
  return (
    <div className="space-y-0.5">
      {facts.map((f) => (
        <div key={f.field} className="flex flex-wrap items-baseline gap-1.5 font-mono text-micro">
          <span className="text-grey-dark">{f.label}</span>
          <span className="text-navy">{provenanceLabel(f)}</span>
          <span className="tabular-nums text-grey">conf {f.confidence}</span>
          {f.undated && <span className="font-bold uppercase text-amber-600 dark:text-amber-400">undated</span>}
          {f.stale && !f.undated && <span className="font-bold uppercase text-amber-600 dark:text-amber-400">stale</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * The capacity cut, as a REASONED EXCLUSION rather than a truncation.
 *
 * The rows below the line were removed by a rule, and the rule prints its own
 * sentence plus the two scores either side of the line — which is the only way a
 * reader can judge whether the cut fell somewhere meaningful. `targetIds` is shown
 * because nothing disappears without a name (`origination.ts:627`).
 */
function DeferredPanel({ cut }: { cut: DeferredCut }) {
  return (
    <Section title={`Deferred — ${cut.count} below the capacity line`}>
      <p className="text-label text-grey-dark">{cut.reason}</p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-micro tabular-nums">
        <span className="text-grey">lowest queued <span className="font-bold text-navy">{cut.lowestQueuedScore ?? '—'}</span></span>
        <span className="text-grey">highest deferred <span className="font-bold text-navy">{cut.highestDeferredScore ?? '—'}</span></span>
      </div>
      <div className="mt-2 font-mono text-[10px] text-grey">deferred: {cut.targetIds.join(' · ')}</div>
    </Section>
  );
}

/* ── The refusal ledger — D2, and half the product ──────────────────────────── */

/**
 * THE REFUSAL LEDGER. A panel, at the same weight as the queue, never a footnote.
 *
 * This is the thing that makes the queue trustworthy. Before this file the gates in
 * `evaluateGates` fired into nothing: a target excluded for a sanctions concern and
 * a target excluded because nobody has run the conflict check both vanished from the
 * screen identically, which is indistinguishable from data loss and is exactly the
 * defect the mandate's multiply-by-zero formula had (`targeting.ts:406`).
 *
 * WALL vs TASK is the distinction the panel is built around, because it is the one
 * that changes what he does this morning. A TASK is work he can do — "run the
 * conflict check" — and its remedy is printed as the next action. A WALL is a walk
 * away, and it gets the red border and no remedy, because offering one would invite
 * someone to try. The two are separated by colour, by an uppercase disposition
 * label, and by whether a remedy list appears — three signals, not one, so the
 * distinction survives a colourblind reader and a black-and-white printout (D7).
 *
 * `byGate` prints EVERY gate key including the zeros (`origination.ts:434`). A gate
 * that never fired reading as a visible zero rather than an absent row is what
 * distinguishes "checked, nothing found" from "not checked" — the same three-state
 * honesty `ScreeningResult` exists for.
 */
function RefusalPanel({ ledger, onOpenBrief }: { ledger: RefusalLedger; onOpenBrief: (id: string) => void }) {
  const gates = Object.entries(ledger.byGate) as [string, number][];
  return (
    <Section
      tone={ledger.entries.length > 0 ? 'refusal' : undefined}
      title={`Refusal ledger — ${ledger.entries.length} refused · ${ledger.walls} wall · ${ledger.tasks} task`}
      note="Every gated target, with every gate that fired and its reason. A WALL is a walk-away; a TASK is work with a remedy printed beside it."
    >
      {/* Gate tally: all seven keys, zeros included. */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-line/60 pb-2 font-mono text-[10px] tabular-nums">
        {gates.map(([key, n]) => (
          <span key={key} className="text-grey" data-testid={`gate-tally-${key}`}>
            {key.replace(/_/g, ' ')} <span className={clsx('font-bold', n > 0 ? 'text-red-600 dark:text-red-400' : 'text-grey')}>{n}</span>
          </span>
        ))}
      </div>

      {ledger.entries.length === 0 ? (
        /* Not "no refusals" as a congratulation. Every gate was evaluated and none
         * fired, which is a different and more useful sentence. */
        <p className="text-label text-grey">All seven gates were evaluated against every target considered and none fired.</p>
      ) : (
        <div className="space-y-2">
          {ledger.entries.map((e) => <RefusalRow key={e.targetId} entry={e} onOpenBrief={onOpenBrief} />)}
        </div>
      )}
    </Section>
  );
}

function RefusalRow({ entry, onOpenBrief }: { entry: RefusalEntry; onOpenBrief: (id: string) => void }) {
  const wall = entry.disposition === 'wall';
  return (
    <div
      data-testid={`refusal-${entry.targetId}`}
      className={clsx(
        'rounded border border-l-4 p-2',
        wall ? 'border-l-red-500 border-red-500/30 bg-red-500/5' : 'border-l-amber-500 border-amber-500/30 bg-amber-500/5',
      )}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        {wall
          ? <ShieldOff size={13} className="shrink-0 text-red-600 dark:text-red-400" />
          : <ShieldAlert size={13} className="shrink-0 text-amber-600 dark:text-amber-400" />}
        <span className={clsx('font-mono text-[10px] font-bold uppercase tracking-wider', wall ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
          {wall ? 'wall — walk away' : 'task — recoverable'}
        </span>
        <button onClick={() => onOpenBrief(entry.targetId)} className="text-label font-semibold text-navy hover:underline">
          {entry.name}
        </button>
        <span className="text-[10px] text-grey">{entry.jurisdiction ?? 'jurisdiction not recorded'}</span>
        {/* The confidence we refused AT. "Excluded on 200-day-old D5 evidence" is a
          * materially different claim from "excluded on a regulator filing", and a
          * ledger that cannot show the quality of its own refusals is unauditable. */}
        <span className="ml-auto font-mono text-[10px] tabular-nums text-grey">
          refused at confidence <span className="font-bold text-navy">{entry.confidence.confidence}</span>
          <span className={clsx('ml-1 font-bold uppercase', BAND_TONE[entry.confidence.band])}>{entry.confidence.band}</span>
          {entry.confidence.admiralty && <span className="ml-1 text-navy">{entry.confidence.admiralty}</span>}
        </span>
      </div>

      {/* ALL gates, in GATE_KEYS order — never just the first. A target blocked on
        * sanctions AND on a guaranteed-listing demand must not look like a one-fix job. */}
      <ul className="mt-1.5 space-y-1">
        {entry.gates.map((g) => (
          <li key={g.key} className="text-micro">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">{g.key.replace(/_/g, ' ')}</span>
            {g.key === entry.primary.key && <span className="ml-1 font-mono text-[10px] font-bold uppercase text-grey-dark">primary</span>}
            <div className="text-grey-dark">{g.reason}</div>
            {g.recoverable && g.remedy
              ? <div className="text-cyan-700 dark:text-cyan-400">→ {g.remedy}</div>
              : <div className="text-red-600 dark:text-red-400">→ no remedy — this gate is not curable.</div>}
          </li>
        ))}
      </ul>
      <div className="mt-1 font-mono text-[10px] text-grey">
        {entry.wallCount} unrecoverable · {entry.recoverableCount} curable
      </div>
    </div>
  );
}

/* ── The research brief — 8.4 / 8.5 ─────────────────────────────────────────── */

/**
 * Make the brief printable even though it lives in a `fixed` overlay (D7).
 *
 * `PrintStyles` un-fixes the app's scroll containers but nothing un-fixes an
 * overlay, so a ⌘P with the drawer open would emit one clipped page. This rule is
 * keyed on `[data-gps-brief]`, an attribute this file sets on its own content, and
 * reaches the drawer's root through `:has()` — which is the only direction CSS can
 * select an ancestor. Scoped to `@media print` and to this one attribute, so it can
 * never affect the sixteen other overlays that share `InspectorDrawer`.
 */
const BRIEF_PRINT_CSS = `
@media print {
  .fixed:has([data-gps-brief]) {
    position: static !important;
    background: #fff !important;
    backdrop-filter: none !important;
    display: block !important;
  }
  .fixed:has([data-gps-brief]) > * {
    width: 100% !important;
    max-width: none !important;
    box-shadow: none !important;
    border: none !important;
    overflow: visible !important;
    height: auto !important;
    max-height: none !important;
  }
}
`;

/**
 * One target's brief, cited, with what we do NOT know as a first-class section.
 *
 * The failure mode this is designed against is a brief that READS WELL AND IS
 * WRONG, walking him into a client conversation on a false premise. Three
 * mechanisms, all of them in the data rather than in this renderer:
 *
 *  1. there is no free-prose field on `ResearchBrief` — to say something you must
 *     create an assertion, and an assertion without provenance is a violation with
 *     a code (`origination.ts:871`);
 *  2. `UNVERIFIED` is a printed LABEL, not an absence, and it is rendered here in
 *     the same visual register as the grade it replaces so the eye cannot skip it;
 *  3. `integrity` is a verdict computed by `briefIntegrity()` and carried on the
 *     sealed brief. This page prints the verdict; it does not judge the brief
 *     itself, because a renderer that decided what counts as a violation would be
 *     a second opinion with no test.
 */
function BriefDrawer({ targetId, onClose }: { targetId: string | null; onClose: () => void }) {
  const [res, setRes] = useState<BriefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetId) { setRes(null); setError(null); return; }
    let live = true;
    setRes(null); setError(null);
    fetchTargetBrief(targetId)
      .then((r) => { if (live) setRes(r); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Brief unavailable'); });
    return () => { live = false; };
  }, [targetId]);

  if (!targetId) return null;

  return (
    <InspectorDrawer isOpen onClose={onClose} title={res ? `Brief — ${res.brief.name}` : 'Brief'}>
      <style>{BRIEF_PRINT_CSS}</style>
      <div data-gps-brief data-testid="brief" className="space-y-4">
        {error ? (
          <p className="text-label text-red-600 dark:text-red-400">{error}</p>
        ) : !res ? (
          <p className="text-label text-grey">Reading the brief…</p>
        ) : (
          <BriefBody res={res} />
        )}
      </div>
    </InspectorDrawer>
  );
}

function BriefBody({ res }: { res: BriefResponse }) {
  const b = res.brief;
  const bySection = (s: string) => b.assertions.filter((a) => a.section === s);

  return (
    <>
      {/* Header: score and confidence as two separate readings, and the two instants. */}
      <div className="rounded border border-line bg-card p-2.5">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-micro tabular-nums">
          <span className="text-grey">score <span className="text-h3 font-bold text-navy">{b.score ?? '—'}</span>
            {b.score == null && <span className="ml-1 text-[10px] uppercase text-red-600 dark:text-red-400">gated — no score</span>}
          </span>
          <span className="text-grey">confidence <span className="text-h3 font-bold text-navy">{b.confidence}</span>
            <span className={clsx('ml-1 font-bold uppercase', BAND_TONE[b.band])}>{b.band}</span>
          </span>
        </div>
        <div className="mt-1 font-mono text-[10px] text-grey">
          measured as of {b.asOf} · sealed {b.generatedIso} · brief built {res.generatedIso}
        </div>
        <p className="mt-1 text-[10px] text-grey">
          Confidence is reported beside the score and is never folded into it. A low band does not mean a bad target; it means do not act on this ranking yet.
        </p>
      </div>

      {/* THE REFUSAL, IF THERE IS ONE — above the content, not after it. A brief for a
        * refused target is legitimate, but rendering it without the gate beside it
        * rebuilds the silent exclusion this phase removed (D2). */}
      {res.refusal && (
        <div className={clsx(
          'rounded border border-l-4 p-2.5',
          res.refusal.disposition === 'wall'
            ? 'border-l-red-500 border-red-500/30 bg-red-500/5'
            : 'border-l-amber-500 border-amber-500/30 bg-amber-500/5',
        )}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
            refused · {res.refusal.disposition === 'wall' ? 'wall — walk away' : 'task — recoverable'}
          </div>
          <ul className="mt-1 space-y-1">
            {res.refusal.gates.map((g) => (
              <li key={g.key} className="text-micro">
                <span className="font-mono text-[10px] uppercase text-grey">{g.key.replace(/_/g, ' ')}</span>
                <div className="text-grey-dark">{g.reason}</div>
                {g.recoverable && g.remedy && <div className="text-cyan-700 dark:text-cyan-400">→ {g.remedy}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <IntegrityPanel integrity={b.integrity} />

      {b.trigger && (
        <div>
          <Label>Why now</Label>
          <TriggerCell trigger={b.trigger} state={b.trigger.state} />
        </div>
      )}

      {/* Assertions, in the fixed running order of a printed brief. */}
      {BRIEF_SECTION_ORDER.map((s) => {
        const rows = bySection(s);
        if (rows.length === 0) return null;
        return (
          <div key={s} data-testid={`brief-section-${s}`}>
            <Label>{BRIEF_SECTION_LABELS[s]}</Label>
            <div className="space-y-1.5">
              {rows.map((a) => <Assertion key={a.id} a={a} />)}
            </div>
          </div>
        );
      })}

      {/* UNKNOWNS — a section, not an omission. An empty page reads as "nothing to
        * worry about", which is the most expensive thing a brief can imply. */}
      <div data-testid="brief-unknowns">
        <Label>What we do not know</Label>
        {b.unknowns.length === 0 ? (
          <p className="text-micro text-grey">Nothing outstanding was derived — every scored factor has a value and a source.</p>
        ) : (
          <ul className="space-y-0.5">
            {b.unknowns.map((u) => (
              <li key={u} className="flex gap-1.5 text-micro text-amber-700 dark:text-amber-300"><span className="text-grey">•</span>{u}</li>
            ))}
          </ul>
        )}
      </div>

      {b.proposedOpening && <Opening opening={b.proposedOpening} assertions={b.assertions} />}
    </>
  );
}

/**
 * One claim, with its grade and date — or with the word UNVERIFIED where the grade
 * would be.
 *
 * The two states are rendered in the SAME slot and the same monospace register on
 * purpose. An unverified claim that merely lacks a grade chip reads, to a person
 * skimming, exactly like a sourced one whose chip scrolled off; a claim that says
 * UNVERIFIED in the place a grade belongs cannot be misread that way. That is the
 * whole of slice 8.4 on screen.
 */
function Assertion({ a }: { a: BriefAssertion }) {
  return (
    <div
      data-testid={`assertion-${a.id}`}
      className={clsx(
        'rounded border border-l-4 px-2 py-1.5',
        a.status === 'UNVERIFIED'
          ? 'border-l-amber-500 border-amber-500/30 bg-amber-500/5'
          : 'border-l-line border-line/70',
      )}
    >
      <p className="text-label text-navy">{a.text}</p>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[10px]">
        {a.status === 'UNVERIFIED' ? (
          <span
            data-testid={`unverified-${a.id}`}
            className="rounded border border-amber-500/50 bg-amber-500/10 px-1 font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300"
          >
            unverified
          </span>
        ) : a.provenance ? (
          <>
            <span className="rounded border border-line px-1 font-bold uppercase tracking-wider text-grey">sourced</span>
            <span className="text-navy">{provenanceLabel(a.provenance)}</span>
            {a.provenance.sourceUrl && (
              <a href={a.provenance.sourceUrl} target="_blank" rel="noreferrer" className="text-cyan-700 underline dark:text-cyan-400">source</a>
            )}
            {a.provenance.stale && <span className="font-bold uppercase text-amber-600 dark:text-amber-400">stale — re-check</span>}
          </>
        ) : (
          /* SOURCED with no provenance is a BLOCKING integrity violation, and the
           * integrity panel above says so. Printed here too, beside the claim, because
           * that is where a reader is when they need to know not to repeat it. */
          <span className="font-bold uppercase text-red-600 dark:text-red-400">presented as sourced but carries no provenance — do not repeat this</span>
        )}
        {a.estimate && (
          /* ICD-203 vocabulary, and the analytic confidence stays orthogonal to the
           * likelihood — two readings, never one blended number. */
          <span className="text-grey">
            judgement: <span className="font-bold text-navy">{a.estimate.term}</span> ({a.estimate.pct}%) · analytic confidence <span className="font-bold text-navy">{a.estimate.confidence}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** The verdict on the brief, printed. D8: a brief that claims to be checked shows the check. */
function IntegrityPanel({ integrity }: { integrity: BriefIntegrity }) {
  const blocking = integrity.violations.filter((v) => v.blocking);
  const findings = integrity.violations.filter((v) => !v.blocking);
  return (
    <div
      data-testid="brief-integrity"
      className={clsx('rounded border p-2.5', integrity.ok ? 'border-line' : 'border-red-500/40 bg-red-500/5')}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-micro tabular-nums">
        <span className={clsx('font-bold uppercase tracking-wider', integrity.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
          {integrity.ok ? 'integrity ok' : 'do not carry this into a client conversation'}
        </span>
        <span className="text-grey">assertions <span className="font-bold text-navy">{integrity.assertions}</span></span>
        <span className="text-grey">sourced <span className="font-bold text-navy">{integrity.sourced}</span></span>
        <span className="text-grey">unverified <span className={clsx('font-bold', integrity.unverified > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-navy')}>{integrity.unverified}</span></span>
        <span className="text-grey">mean source confidence <span className="font-bold text-navy">{integrity.meanProvenanceConfidence ?? '—'}</span></span>
      </div>
      {integrity.onlyUnknowns && (
        /* A valid brief, and the most honest possible output for a target nobody has
         * researched. Named so it is not mistaken for a rendering failure. */
        <p className="mt-1 text-micro text-grey-dark">
          This brief asserts nothing. It lists what we do not know, which for an un-researched target is the honest output.
        </p>
      )}
      {blocking.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {blocking.map((v, i) => (
            <li key={`${v.code}-${i}`} className="text-micro text-red-700 dark:text-red-300">
              <span className="font-mono text-[10px] font-bold uppercase">{v.code.replace(/_/g, ' ')}</span> — {v.detail}
            </li>
          ))}
        </ul>
      )}
      {findings.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {findings.map((v, i) => (
            <li key={`${v.code}-${i}`} className="text-micro text-amber-700 dark:text-amber-300">
              <span className="font-mono text-[10px] font-bold uppercase">{v.code.replace(/_/g, ' ')}</span> — {v.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The proposed opening — slice 8.5, and a DRAFT by type.
 *
 * There is no send control here and there cannot be one: `approvedForSend` is the
 * literal `false` on `ProposedOpening`, so nothing this module can construct is
 * approved, and approval is a human act through the existing send-gate discipline.
 * The citations are resolved to the assertions' own text so the reader can see what
 * the sentence is leaning on rather than a list of ids.
 */
function Opening({ opening, assertions }: { opening: BriefResponse['brief']['proposedOpening'] & object; assertions: BriefAssertion[] }) {
  const byId = new Map(assertions.map((a) => [a.id, a]));
  return (
    <div data-testid="brief-opening" className="rounded border border-cyan-500/40 p-2.5">
      <Label>Proposed opening — draft, not approved for send</Label>
      <p className="text-label text-navy">{opening.text}</p>
      {opening.citedAssertionIds.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {opening.citedAssertionIds.map((id) => {
            const a = byId.get(id);
            return (
              <li key={id} className="font-mono text-[10px] text-grey">
                {id} — {a ? a.text : <span className="font-bold uppercase text-red-600 dark:text-red-400">cites an assertion that is not in this brief</span>}
                {a && a.status === 'UNVERIFIED' && <span className="ml-1 font-bold uppercase text-red-600 dark:text-red-400">unverified — this opening must not lean on it</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1.5 font-mono text-[10px] text-grey">
          {opening.assertsNothing
            ? 'no citations — the author declared this text makes no factual claim about the target'
            : 'no citations and no declaration that it asserts nothing — see the integrity findings above'}
        </p>
      )}
      <p className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
        approved for send: no — approval is a human act on the send gate, not a state this screen can set
      </p>
    </div>
  );
}
