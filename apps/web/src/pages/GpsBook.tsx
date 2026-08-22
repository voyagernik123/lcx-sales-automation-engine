import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Printer, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTitle, Button } from '@/components/ui';
import { EmptyState, PageSkeleton } from '@/components/shared';
import { PrintStyles } from '@/components/report/PrintStyles';
import { InvoicesPanel } from '@/components/gps/InvoicesPanel';
import { useListNavigation } from '@/hooks/useListNavigation';
// `getOffer` only. `ENGAGEMENT_STATUS_LABELS` is deliberately NOT imported: the one
// status this page prints arrives pre-labelled on the wire as
// `OldestUnpaidDeposit.statusLabel` (book.ts:1064), and a page that re-derived the
// label from the enum would be a second place for the vocabulary to drift.
import { getOffer } from '@lcx/shared';
import {
  fetchGpsBook,
  AXIS_LABEL, VALUE_AXES, FUNNEL_STAGE_LABELS, CONSTRAINT_LABEL,
  BOOK_HEALTH_GRADE_LABEL, SINGLE_HOLDER_ALARM_SHARE_PCT,
  SINGLE_HOLDER_WATCH_SHARE_PCT, TOP3_ALARM_SHARE_PCT, AGED_DEPOSIT_ALARM_DAYS,
  type BookResponse, type BookConcentration, type CurrencyConcentration,
  type AxisConcentration, type ConcentrationHolder, type CurrencyMix,
  type CashConversion, type CurrencyFunnel, type AgingProfile,
  type BindingConstraint, type BookHealth, type BookHealthGrade,
  type BookPlaceholders, type BookUnresolved, type ValueAxis,
  type BenchHeadroom, type WipLoad, type MarginRealisation, type Driver,
} from '@/lib/api/gpsBook';
import { GpsMetaBanner } from './GpsMetaBanner';

/**
 * GLOBAL SERVICES — THE BOOK (Phase 6). "Is this book healthy?", on one screen.
 *
 * `book.ts` is 2,074 lines with 60 passing tests. Until this file, zero web
 * references — the same failure Phases 0–5 produced four times over
 * (`GPS_100X_PLAN.md` §0: 4,564 lines of engine surfaced in 0 web files). Nothing
 * below computes a share, an index, an aging bracket, a verdict or a grade. Every
 * number, every sentence and every refusal on this page is a field that already
 * exists on `BookResponse`, because a screen that recomputes any of them becomes a
 * second opinion nobody reconciles — and because the engine's sentences were
 * written to be rendered verbatim (`AxisConcentration.headline`,
 * `BindingConstraint.reason`, `FunnelConversion.suppressedReason`).
 *
 * THE REFRAME THIS SURFACE EXISTS TO EXPRESS: GPS is not a pipeline you fill, it
 * is a book you underwrite. So there is no pipeline on it. Each engagement is a
 * position with a margin, a currency, a capacity draw, a concentration
 * contribution and a counterparty, and the questions are portfolio questions:
 * where am I concentrated, what cash is late, what is limiting me, can I take
 * another one.
 *
 * ── The doctrine, and where each clause lives on this screen ─────────────────
 *
 *  D1 · EVERY NUMBER OPENS. The health score is a button onto its signed `Driver`
 *       trail, which sums to the score by addition, so the figure is
 *       reconstructable rather than asserted. Every axis row opens onto its
 *       holders — the actual rows behind the index — plus the holders EXCLUDED
 *       from it and why. Every constraint verdict opens onto `ConstraintEvidence`,
 *       each item carrying the function or column that produced it. `asOf` is in
 *       the tape, once, because a number without a time is not traceable.
 *       WHAT IS NOT TRACEABLE TO ITS ROWS, stated out loud on the surface rather
 *       than hidden: the aging brackets. `AgingBracket` carries `count` and
 *       `amountCents` and no engagement ids (book.ts:972), so a bracket opens onto
 *       its definition, its anchor timestamp and its `unaged` refusal — the
 *       formula and the source — but it cannot list the four invoices inside it.
 *       That gap is printed on the panel, not buried here.
 *
 *  D2 · REFUSALS ARE THE PRODUCT, NOT THE FOOTNOTE. The binding constraint is the
 *       first thing under the tape, in a sentence, at the largest type size on the
 *       page — including "nothing is binding", which is not good news and is not
 *       rendered as good news: the engine's own `demand` verdict says he is not
 *       selling, and that sentence is printed unedited. Every candidate constraint
 *       is listed with whether it bound, whether it could even be evaluated, and
 *       why. Suppressed conversion rates print their reason instead of a zero.
 *       Non-positive holders excluded from an index are named with their value.
 *
 *  D3 · UNCERTAINTY SITS BESIDE THE ESTIMATE, NEVER INSIDE IT. `scoreBand` is
 *       rendered in its own column next to `score`, never multiplied into it.
 *       Concentration bands (`low`–`high`) sit beside the index with the mechanism
 *       that produced the range printed beside them. Analytic confidence is a
 *       separate cell with a separate header, in ICD-203 words, and there is no
 *       cell anywhere on this page containing a confidence-adjusted anything.
 *
 *  D4 · THE SYSTEM ARGUES BACK. `BookHealth.statements` and the concentration
 *       headlines are the argument — "a services book with 60% of margin behind
 *       one partner is one resignation from a crisis" is a sentence the engine
 *       emits and this page prints where he cannot miss it.
 *
 *  D5 · BLOOMBERG DENSITY. Tables, `font-mono`, `tabular-nums` so digits do not
 *       jitter between rows, `text-micro` cells. DELIBERATELY NO STAT CARDS: the
 *       four-stat strip on `pages/Gps.tsx` is the anti-pattern this phase was
 *       called in to correct, and a concentration reading is five numbers per axis
 *       across four axes per currency — twenty tiles, or one table.
 *
 *  D6 · KEYBOARD PRIMARY. Both long lists (the axis table and the unresolved
 *       ledger) use `useListNavigation`: one Tab stop each, arrows move, Enter
 *       opens. Same hook as the BD lead queue and the origination queue, so the
 *       movement grammar is identical across the app.
 *
 *  D7 · PRINTABLE AND DATED. `PrintStyles`, with `asOf` in the header, so a
 *       printed book cannot be mistaken for this quarter's.
 *
 *  D8 · NO CLAIM WITHOUT A MECHANISM. This page says "measured" nowhere. Where a
 *       figure rests on a placeholder — prices, vendor costs, coordination hours —
 *       the cell is badged at the point of use AND the input is listed in the
 *       unresolved ledger with its owner. `migrated: false` renders as "no tables
 *       yet", never as zeros: GPS has already shipped one screen that could not
 *       tell those two states apart, which is the false claim this programme is
 *       under orders not to repeat.
 *
 * WHAT THIS PAGE CANNOT DO, deliberately: it cannot accept a client artifact
 * (decision D2, unanswered), it cannot edit a price, and it cannot mark a deposit
 * paid. It is an instrument, not a second write path onto the same rows.
 */

/* ── Tones. Thresholds come from the engine, never from a number typed here ── */

const GRADE_TONE: Record<BookHealthGrade, string> = {
  healthy: 'text-emerald-600 dark:text-emerald-400',
  watch: 'text-cyan-700 dark:text-cyan-400',
  strained: 'text-amber-600 dark:text-amber-400',
  critical: 'text-red-600 dark:text-red-400',
};

const ALARM = 'text-red-600 dark:text-red-400';
const WARN = 'text-amber-600 dark:text-amber-400';
const OK = 'text-emerald-600 dark:text-emerald-400';

/**
 * Share → tone, at the engine's own boundaries (`SINGLE_HOLDER_ALARM_SHARE_PCT`
 * = 50, `..._WATCH_...` = 30). Imported rather than inlined because a surface
 * that reddens at 40 while the engine alarms at 50 has invented a second
 * judgement, and book.ts:388 exports these constants precisely to stop that.
 */
function shareTone(sharePct: number | null): string {
  if (sharePct == null) return 'text-grey';
  if (sharePct >= SINGLE_HOLDER_ALARM_SHARE_PCT) return ALARM;
  if (sharePct >= SINGLE_HOLDER_WATCH_SHARE_PCT) return WARN;
  return 'text-navy';
}

/**
 * Integer cents → a string, in ONE currency, never pooled.
 *
 * The currency is a required argument and not optional, which is the type system
 * carrying the doctrine: `crossCurrencyTotalCents` is the literal `null`
 * permanently (book.ts:746) because a total across currencies is true in none of
 * them, and a formatter that could be called without a currency is the first step
 * back towards printing one.
 */
function money(cents: number, currency: string): string {
  const sign = cents < 0 ? '−' : '';
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}${currency} ${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/** A signed points figure for a driver trail. The sign is the message. */
function points(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
}

/** `null` never renders as a number. It renders as the word that says why. */
function orDash(v: number | null | undefined, suffix = ''): React.ReactNode {
  return v == null ? <span className="text-grey">n/a</span> : <>{v}{suffix}</>;
}

export function GpsBook() {
  const [res, setRes] = useState<BookResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setRes(null);
    fetchGpsBook()
      .then(setRes)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);
  useEffect(load, [load]);

  // Same two-step as CommandDeck and the origination queue: the print tokens are
  // pinned inside the media query, but a `dark:` VARIANT still matches while the
  // class sits on <html>, so the class comes off for the duration of the job.
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
        icon={<BookOpen size={20} />}
        subtitle="Not a pipeline — a book. Where it is concentrated, what cash is late, what is limiting it, and whether another engagement can be taken at all."
        actions={
          <div className="br-no-print flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={print}><Printer size={13} /> Print</Button>
            <Button size="sm" variant="secondary" onClick={load}><RefreshCw size={13} /> Reload</Button>
          </div>
        }
      >
        The Book · portfolio
      </PageTitle>

      {/* WHAT THE READ DECLARES ABOUT ITSELF. The book is the one GPS payload that
          carries `migrated` in DATA (`BookResponse.migrated`, book.ts:2061) and the
          state below is rendered from it — so on this page the banner's job is
          narrower and still necessary: it is the thing that speaks up if the envelope
          stops arriving, rather than letting the page render a confident book with the
          provenance silently gone. */}
      <GpsMetaBanner of={[res]} />

      {error ? (
        <EmptyState variant="error" title="The book is unavailable" description={error} />
      ) : !res ? (
        <PageSkeleton />
      ) : (
        <Loaded res={res} />
      )}
    </div>
  );
}

/**
 * THE THREE STATES, AND WHY THEY ARE THREE AND NOT TWO.
 *
 *  `migrated: false` — the compartment exists and has no tables. GPS's 0047/0049
 *      are not applied on prod, so this is the state today, and it is NOT the same
 *      fact as an empty book. The previous GPS surface could not tell them apart
 *      and rendered zeros for both; that is the shipped false claim this programme
 *      is under orders not to repeat (D8).
 *  `positionCount === 0` — tables exist, nothing is in them. Useful, because it
 *      still has something true to say: the placeholder ledger and the unresolved
 *      inputs are properties of the CATALOGUE, not of the positions, so they are
 *      real and they are rendered. What is missing is named, and so is what would
 *      fill it.
 *  otherwise — the instrument.
 */
function Loaded({ res }: { res: BookResponse }) {
  if (!res.migrated) {
    return (
      <div className="space-y-4">
        <EmptyState
          variant="default"
          title="No book yet — the tables do not exist"
          description="GLOBAL SERVICES' migrations (0047, 0049) have not been applied to this environment, so there is nothing to read. This is deliberately not shown as an empty book of zero positions: an unmigrated compartment and a book with nothing in it are different facts, and a screen that renders both as 0 is making a claim it cannot support. Apply the migrations and this page has data the moment the first engagement is recorded."
        />
        <PlaceholderLedger placeholders={res.placeholders} unresolved={res.unresolved} />
      </div>
    );
  }

  if (res.positionCount === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          variant="default"
          title="The book is empty"
          description="No engagements are recorded, so there is no concentration to measure, no cash to age and no capacity being consumed. Nothing is hidden and nothing is estimated: every figure this page would show is absent rather than zero. Record an engagement on the quote desk and it appears here as a position — a margin, a currency, a counterparty and a capacity draw."
        />
        {/* The verdict is still real with zero positions, and it is the most useful
          * sentence on the page in this state: with a clear supply side and nothing
          * live, the engine returns `demand` — "you are not selling" — which an
          * empty state that only said "no data" would have swallowed. */}
        <VerdictPanel constraint={res.health.binding} />
        <PlaceholderLedger placeholders={res.placeholders} unresolved={res.unresolved} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tape res={res} />
      <VerdictPanel constraint={res.health.binding} />
      <HealthPanel health={res.health} />
      <ConcentrationPanel concentration={res.concentration} />
      <CashPanel cash={res.cash} />
      {/* G6: invoices sit under the cash panel because aging IS a cash-conversion
          fact. The panel self-fetches /v1/gps/invoices and owns its own migrated:false
          sentence — the invoice register is a different migration from the book read. */}
      <InvoicesPanel />
      <CapacityPanel capacity={res.capacity} wip={res.wip} placeholders={res.placeholders} />
      <MarginPanel margin={res.marginRealisation} placeholders={res.placeholders} />
      <PlaceholderLedger placeholders={res.placeholders} unresolved={res.unresolved} />
    </div>
  );
}

/* ── The tape ────────────────────────────────────────────────────────────────
 * ONE LINE, not six cards. `positions`, `open`, `currencies`, the grade and the
 * instant, in the reading order of the question being asked. The grade is here
 * and the score is NOT: a score without its band would be a bare point estimate
 * on the one decision-bearing number this module emits, which D3 forbids, so the
 * score lives in the health panel where its band can sit beside it.
 */
function Tape({ res }: { res: BookResponse }) {
  const { health } = res;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-card px-4 py-2 font-mono text-micro tabular-nums shadow-card">
      <TapeCell k="positions" v={res.positionCount} />
      <TapeCell k="open" v={res.openPositionCount} />
      <span className="text-grey">
        currencies <span className="font-bold text-navy">{res.currencies.length}</span>
        {res.currencies.length > 0 && (
          <span className="ml-1 text-navy">({res.currencies.join(' · ')})</span>
        )}
      </span>
      <span className="text-grey">
        grade{' '}
        <span className={clsx('font-bold uppercase', GRADE_TONE[health.grade])}>
          {health.gradeLabel}
        </span>
      </span>
      <span className="text-grey">
        basis <span className="text-navy">{res.concentration.basis}</span>
        {' · scope '}<span className="text-navy">{res.concentration.scope}</span>
      </span>
      <span className="ml-auto text-grey">
        measured as of <span className="text-navy">{res.asOf}</span>
      </span>
    </div>
  );
}

function TapeCell({ k, v, tone }: { k: string; v: number; tone?: string }) {
  return (
    <span className="text-grey">
      {k} <span className={clsx('font-bold', tone ?? 'text-navy')}>{v}</span>
    </span>
  );
}

/* ── Shared chrome ──────────────────────────────────────────────────────────── */

function Section({ title, note, children, tone, right }: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'alarm' | 'warn';
  right?: React.ReactNode;
}) {
  return (
    <section className={clsx(
      'rounded-lg border bg-card p-4 shadow-card',
      tone === 'alarm' ? 'border-red-500/40' : tone === 'warn' ? 'border-amber-500/40' : 'border-line',
    )}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <div className="text-micro font-bold uppercase tracking-wider text-grey">{title}</div>
        {right}
      </div>
      {note && <p className="mb-3 text-micro text-grey">{note}</p>}
      {children}
    </section>
  );
}

function Th({ children, className, title }: { children?: React.ReactNode; className?: string; title?: string }) {
  return (
    <th
      title={title}
      className={clsx('px-2 py-1 text-micro font-semibold uppercase tracking-wide', className)}
      scope="col"
    >
      {children}
    </th>
  );
}

/**
 * `data-testid` is DECLARED on the props rather than passed through implicitly.
 *
 * JSX does not excess-property-check hyphenated attributes, so a `data-testid` on a
 * component that does not forward it compiles cleanly and is silently dropped —
 * which is a test that queries an element the page never marks, i.e. a green suite
 * asserting nothing. Declaring it here makes the forwarding a compiler-checked fact.
 */
function Td({ children, className, colSpan, 'data-testid': testId }: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
  'data-testid'?: string;
}) {
  return (
    <td colSpan={colSpan} data-testid={testId} className={clsx('px-2 py-1 align-top', className)}>
      {children}
    </td>
  );
}

/**
 * The placeholder badge, at the POINT OF USE.
 *
 * Not only in the ledger at the bottom. A reader who scrolls to a margin figure and
 * does not scroll to the bottom must still learn that the vendor cost under it is a
 * `TODO_VENDOR_COSTS` number the founder has not supplied. The founder's standing
 * instruction is that a placeholder must never read as a real number, and the only
 * way that survives is by badging the cell, not the page.
 */
function PlaceholderTag({ what }: { what: string }) {
  return (
    <span
      className="ml-1 inline-flex items-center gap-1 rounded border border-amber-500/50 bg-amber-500/10 px-1 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400"
      title={`${what} is a PLACEHOLDER — a number standing in for one the founder has not yet supplied. Do not quote it.`}
    >
      placeholder
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 6.2 — THE VERDICT. What is limiting the book, in words, first.
 *
 * THE MOST IMPORTANT ELEMENT ON THE PAGE, and the reason it is a sentence at the
 * largest type size rather than a gauge: `bindingConstraint` was deliberately not
 * called `capacityUtilisation` (book.ts:1288) because a percentage answers "how
 * full are you" and the question he actually has is "what do I do about it". A
 * dial cannot say "a client owes a deposit that funds a partner, chase it".
 *
 * `none` and `demand` ARE NOT GOOD NEWS AND ARE NOT STYLED AS GOOD NEWS. The
 * engine's `demand` verdict is the "nothing is limiting you, you are not selling"
 * finding — the single most uncomfortable thing this instrument can tell him — and
 * a screen that painted it green because no wall was hit would have inverted the
 * message. Both render in amber with the engine's own sentence unedited.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Verdict tone. Deliberately NOT keyed off `binds` — every verdict except a true
 * `none` reports something the reader must act on, and `insufficient_data` is the
 * worst of them for an instrument whose promise is traceability.
 */
function verdictTone(code: BindingConstraint['code']): { border: 'alarm' | 'warn'; text: string } {
  if (code === 'unstaffable_offers' || code === 'bench_capacity') return { border: 'alarm', text: ALARM };
  if (code === 'insufficient_data') return { border: 'warn', text: WARN };
  return { border: 'warn', text: WARN };
}

function VerdictPanel({ constraint: c }: { constraint: BindingConstraint }) {
  const [openAudit, setOpenAudit] = useState(false);
  const tone = verdictTone(c.code);

  return (
    <Section
      title="Binding constraint — what is limiting the book"
      tone={tone.border}
      right={
        /* D3: analytic confidence in the VERDICT, in ICD-203 words, in its own
         * cell with its own label. Never folded into the verdict, never rendered
         * as a percentage next to it — book.ts:1381 derives it from how many
         * checks were evaluable and how many placeholder inputs were load-bearing,
         * which is a mechanism, and the basis string states it. */
        <span className="font-mono text-micro text-grey">
          confidence in this verdict{' '}
          <span className="font-bold uppercase text-navy">{c.confidenceLabel}</span>
        </span>
      }
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className={clsx('mt-0.5 shrink-0', tone.text)} />
        <div className="min-w-0">
          <div className={clsx('text-body font-bold uppercase tracking-wide', tone.text)}>
            {CONSTRAINT_LABEL[c.code]}
          </div>
          {/* Rendered verbatim. The engine wrote this sentence to be printed
            * (book.ts:1370 — "safe to render verbatim"); paraphrasing it on the
            * surface is how a screen ends up disagreeing with its own engine. */}
          <p className="mt-1 text-body text-navy">{c.reason}</p>
          {c.remedy && (
            <p className="mt-1 text-label text-grey-dark">
              <span className="font-semibold uppercase tracking-wide text-grey">remedy · </span>
              {c.remedy}
            </p>
          )}
          <p className="mt-1 text-micro text-grey">{c.confidenceBasis}</p>
        </div>
      </div>

      {/* D1: the verdict opens onto its evidence, each item naming the function or
        * column that produced it. `value` arrives pre-formatted because the engine
        * knows the unit and the surface does not (book.ts:1349). */}
      {c.evidence.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-micro">
            <thead>
              <tr className="border-b border-line text-grey">
                <Th>Evidence behind the verdict</Th>
                <Th className="w-40 text-right">Value</Th>
                <Th className="w-64">Produced by</Th>
              </tr>
            </thead>
            <tbody>
              {c.evidence.map((e) => (
                <tr key={`${e.label}-${e.source}`} className="border-b border-line/50">
                  <Td className="text-grey-dark">{e.label}</Td>
                  <Td className="text-right font-mono font-bold tabular-nums text-navy">{e.value}</Td>
                  <Td className="font-mono text-grey">{e.source}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* D2: every candidate, bound or not, evaluable or not. A constraint that did
        * not bind is evidence; a constraint that could not be TESTED is a hole, and
        * the two are different rows with different words. */}
      <button
        onClick={() => setOpenAudit((v) => !v)}
        aria-expanded={openAudit}
        data-testid="verdict-audit-toggle"
        className="br-no-print mt-3 inline-flex items-center gap-1 text-micro font-semibold uppercase tracking-wide text-cyan-700 hover:underline dark:text-cyan-400"
      >
        <ChevronRight size={12} className={clsx('transition-transform', openAudit && 'rotate-90')} />
        {c.considered.length} candidates tested in precedence order
        {c.unevaluable.length > 0 && (
          <span className={WARN}> · {c.unevaluable.length} could not be evaluated</span>
        )}
      </button>

      {openAudit && (
        <div className="mt-2 overflow-x-auto" data-testid="verdict-audit">
          <table className="w-full border-collapse text-left text-micro">
            <thead>
              <tr className="border-b border-line text-grey">
                <Th className="w-8 text-right">#</Th>
                <Th className="w-48">Candidate</Th>
                <Th className="w-20">Binds</Th>
                <Th className="w-24" title="False when an input was null, so 'did not bind' would be a false negative">Testable</Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {c.considered.map((chk, i) => (
                <tr key={chk.code} className="border-b border-line/50 align-top">
                  <Td className="text-right font-mono tabular-nums text-grey">{i + 1}</Td>
                  <Td className="font-semibold text-navy">{chk.label}</Td>
                  <Td className={clsx('font-mono font-bold uppercase', chk.binds ? ALARM : 'text-grey')}>
                    {chk.binds ? 'binds' : 'no'}
                  </Td>
                  <Td className={clsx('font-mono uppercase', chk.evaluable ? 'text-grey' : WARN)}>
                    {chk.evaluable ? 'yes' : 'no input'}
                  </Td>
                  <Td className="text-grey-dark">{chk.reason}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE COMPOSED GRADE — with its band beside it and its trail underneath.
 *
 * The score starts at 100 ("a book with no observed problem") and takes signed
 * deductions, each a named `Driver`, so the drivers SUM TO THE SCORE by addition
 * (book.ts:1790). That property is the whole of D1 in one line, and the table
 * below prints the running total so a reader can check the arithmetic rather than
 * take it on trust — which is the difference between explainability and a
 * plausible-looking list of reasons.
 * ═══════════════════════════════════════════════════════════════════════════ */

function HealthPanel({ health: h }: { health: BookHealth }) {
  const [openTrail, setOpenTrail] = useState(false);

  // The running total, computed on the way down so the last row equals `score`.
  // If it ever does not, the reader sees it — which is the point of printing it.
  const running = useMemo(() => {
    let acc = 0;
    return h.drivers.map((d) => { acc += d.points; return acc; });
  }, [h.drivers]);
  const sum = running.length > 0 ? running[running.length - 1] : 0;

  return (
    <Section
      title="Book health"
      note={h.headline}
      right={
        <span className="font-mono text-micro text-grey">
          confidence <span className="font-bold uppercase text-navy">{h.confidenceLabel}</span>
        </span>
      }
    >
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        {/* D1: the score is a button. One interaction, no navigation, no modal. */}
        <div>
          <div className="text-micro uppercase tracking-wide text-grey">Score</div>
          <button
            onClick={() => setOpenTrail((v) => !v)}
            aria-expanded={openTrail}
            data-testid="health-score"
            aria-label={`Book health score ${h.score} of 100 — open the driver trail`}
            className={clsx('font-mono text-2xl font-bold tabular-nums hover:underline', GRADE_TONE[h.grade])}
          >
            {h.score}
          </button>
          <span className="ml-1 font-mono text-micro text-grey">/100</span>
        </div>

        {/* D3: THE BAND IS A SEPARATE FIGURE IN A SEPARATE COLUMN. Not a ± on the
          * score, not a shaded score, not a confidence-weighted score. The basis
          * sentence names the mechanism that makes it a range — and when nothing is
          * unattributed the band collapses and says so, because a band drawn around
          * a fully known quantity is theatre (book.ts:280). */}
        <div className="min-w-0">
          <div className="text-micro uppercase tracking-wide text-grey">
            Range once attribution lands
          </div>
          <div className="font-mono text-label font-bold tabular-nums text-navy" data-testid="health-band">
            {h.scoreBand.isPoint
              ? <span className="text-grey">point — {h.score}, nothing unattributed</span>
              : <>{h.scoreBand.low} – {h.scoreBand.high}</>}
          </div>
          <div className="max-w-2xl text-micro text-grey">{h.scoreBand.basis}</div>
        </div>

        <div>
          <div className="text-micro uppercase tracking-wide text-grey">Grade</div>
          <div className={clsx('text-label font-bold uppercase', GRADE_TONE[h.grade])}>
            {BOOK_HEALTH_GRADE_LABEL[h.grade]}
          </div>
        </div>
      </div>

      <p className="mt-2 max-w-4xl text-micro text-grey">{h.confidenceBasis}</p>

      {/* D4 — the argument, in the engine's words, ordered most important first. */}
      {h.statements.length > 0 && (
        <ul className="mt-3 space-y-1" data-testid="health-statements">
          {h.statements.map((s) => (
            <li key={s} className="flex gap-2 text-label text-navy">
              <span className="select-none text-grey">·</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ICD-203 likelihood, only when a realised base rate was supplied — and the
        * REFUSAL printed when it was not, which is the ordinary case. Attaching
        * "likely" to a rate nobody has observed is the invented precision
        * `estimative.ts` exists to prevent (book.ts:1730). */}
      <div className="mt-3 rounded border border-line bg-page px-3 py-2 text-micro">
        <div className="font-bold uppercase tracking-wide text-grey">Collection outlook</div>
        {h.collectionOutlook ? (
          <p className="mt-1 text-label text-navy" data-testid="collection-outlook">
            {h.collectionOutlook.claim}{' '}
            <span className="font-bold uppercase">{h.collectionOutlook.phrase}</span>
            <span className="ml-2 font-mono text-micro text-grey">
              (n={h.collectionOutlook.sampleSize} · confidence {h.collectionOutlook.confidence})
            </span>
          </p>
        ) : (
          <p className="mt-1 text-label text-grey" data-testid="collection-outlook-refusal">
            {h.collectionOutlookRefusal ?? 'No realised collection history, so no likelihood is asserted.'}
          </p>
        )}
      </div>

      <button
        onClick={() => setOpenTrail((v) => !v)}
        aria-expanded={openTrail}
        className="br-no-print mt-3 inline-flex items-center gap-1 text-micro font-semibold uppercase tracking-wide text-cyan-700 hover:underline dark:text-cyan-400"
      >
        <ChevronRight size={12} className={clsx('transition-transform', openTrail && 'rotate-90')} />
        {h.drivers.length} drivers · they sum to the score
      </button>

      {openTrail && (
        <div className="mt-2 overflow-x-auto" data-testid="health-trail">
          <table className="w-full border-collapse text-left text-micro">
            <thead>
              <tr className="border-b border-line text-grey">
                <Th>Driver</Th>
                <Th className="w-24 text-right">Points</Th>
                <Th className="w-28 text-right" title="Running total. The last row must equal the score.">Running</Th>
              </tr>
            </thead>
            <tbody>
              {h.drivers.map((d: Driver, i) => (
                <tr key={`${d.label}-${i}`} className="border-b border-line/50">
                  <Td className="text-grey-dark">{d.label}</Td>
                  <Td className={clsx(
                    'text-right font-mono font-bold tabular-nums',
                    d.points < 0 ? ALARM : d.points > 0 ? OK : 'text-grey',
                  )}>
                    {points(d.points)}
                  </Td>
                  <Td className="text-right font-mono tabular-nums text-grey">{running[i]}</Td>
                </tr>
              ))}
              <tr className="border-t-2 border-line">
                <Td className="font-bold uppercase tracking-wide text-grey">Score</Td>
                <Td />
                <Td className={clsx(
                  'text-right font-mono font-bold tabular-nums',
                  sum === h.score ? 'text-navy' : ALARM,
                )}>
                  {sum}
                  {sum !== h.score && (
                    <div className="text-[10px] font-normal normal-case">
                      does not match the reported score {h.score} — the trail is incomplete
                    </div>
                  )}
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 6.1 — CONCENTRATION. A TABLE, and per currency, and never pooled.
 *
 * FOUR AXES × FIVE FIGURES × N CURRENCIES. That arithmetic is the argument
 * against tiles: even a single-currency book is twenty numbers, and twenty tiles
 * is a screen. One table per currency, one row per axis, is the only layout in
 * which "where am I concentrated" is answerable at a glance — and it is the layout
 * in which the four axes can be COMPARED, which is the actual question.
 *
 * `effectiveHolders` is the headline figure and not `hhi`, on the engine's own
 * instruction (book.ts:325): "your book behaves like 1.8 independent clients" is
 * actionable in a way that "HHI 0.55" is not. The index is kept in an adjacent
 * column for anyone who wants it, in the 0–10,000 antitrust convention, labelled.
 *
 * WHY THERE IS NO CROSS-CURRENCY TOTAL, ANYWHERE, INCLUDING IN A FOOTER. Because
 * `crossCurrencyTotalCents` is the literal `null` permanently (book.ts:746) and
 * converting at a rate this system does not have would be an invented number on
 * the one surface whose entire promise is that every number is traceable.
 * ═══════════════════════════════════════════════════════════════════════════ */

function ConcentrationPanel({ concentration: c }: { concentration: BookConcentration }) {
  return (
    <Section
      title={`Concentration — by ${c.basis}, ${c.scope} positions`}
      note={
        <>
          Each table is ONE currency. Nothing is totalled across currencies and no
          rate is applied — a figure true in no currency is worse than a missing one.
          Bands are the reading once unattributed value is attributed; the mechanism
          is on the row. Alarm above {SINGLE_HOLDER_ALARM_SHARE_PCT}% single holder
          and {TOP3_ALARM_SHARE_PCT}% top-three, watch above{' '}
          {SINGLE_HOLDER_WATCH_SHARE_PCT}% — stated priors reviewed by a human, not
          fitted from outcomes.
        </>
      }
    >
      {c.notes.length > 0 && (
        <ul className="mb-3 space-y-1" data-testid="concentration-notes">
          {c.notes.map((n) => (
            <li key={n} className="text-micro text-grey">· {n}</li>
          ))}
        </ul>
      )}

      {c.perCurrency.length === 0 ? (
        <p className="text-label text-grey">
          No positions in scope, so there is nothing to concentrate. Terminal positions
          are excluded by design — a client who paid and left concentrates nothing.
        </p>
      ) : (
        <div className="space-y-4">
          {c.perCurrency.map((cc) => <CurrencyAxes key={cc.currency} cc={cc} />)}
        </div>
      )}

      <CurrencyMixTable mix={c.currencyMix} />
    </Section>
  );
}

/** One currency's four axes, as one dense table. Rows expand to their holders. */
function CurrencyAxes({ cc }: { cc: CurrencyConcentration }) {
  const body = useRef<HTMLTableSectionElement>(null);
  const [open, setOpen] = useState<Set<ValueAxis>>(new Set());
  const rows = useMemo(() => VALUE_AXES.map((axis) => cc.byAxis[axis]), [cc]);

  const toggle = (axis: ValueAxis) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(axis)) next.delete(axis); else next.add(axis);
      return next;
    });

  // D6 — ONE TAB STOP for the whole table, arrows move the cursor, Enter opens the
  // holders. Same hook as the origination queue and the BD lead board: a second
  // movement grammar for a second ranked table is how an instrument becomes an app.
  const nav = useListNavigation({
    count: rows.length,
    container: body,
    onActivate: (i) => { const r = rows[i]; if (r) toggle(r.axis); },
  });

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3 font-mono text-micro tabular-nums">
        <span className="font-bold uppercase tracking-wider text-navy">{cc.currency}</span>
        <span className="text-grey">
          positions <span className="font-bold text-navy">{cc.positionCount}</span>
        </span>
        <span className="text-grey">
          total <span className={clsx('font-bold', cc.totalValueCents < 0 ? ALARM : 'text-navy')}>
            {money(cc.totalValueCents, cc.currency)}
          </span>
        </span>
        <span className="text-grey">(signed — losses are not clamped)</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-micro">
          <thead>
            <tr className="border-b border-line text-grey">
              <Th className="w-40">Axis</Th>
              <Th className="w-28 text-right" title="How many equal-sized holders the book BEHAVES like — 1/HHI">Behaves like</Th>
              <Th className="w-24 text-right" title="Herfindahl index, 0–10,000 antitrust convention. Computed over attributed positive holders only.">HHI pts</Th>
              {/* D3: the band is its own column with its own header. */}
              <Th className="w-32 text-right" title="Reading once unattributed value is attributed. Beside the index, never inside it.">Band low–high</Th>
              <Th>Dominant holder</Th>
              <Th className="w-20 text-right">Share</Th>
              <Th className="w-20 text-right" title="Combined share of the largest three">Top 3</Th>
              <Th className="w-24 text-right" title="Share of positive value attributable to a named holder">Coverage</Th>
              <Th className="w-24 text-right">Holders</Th>
            </tr>
          </thead>
          <tbody ref={body} {...nav.containerProps}>
            {rows.map((a, i) => {
              const expanded = open.has(a.axis);
              return [
                <tr
                  key={a.axis}
                  {...nav.rowProps(i)}
                  aria-expanded={expanded}
                  data-testid={`axis-row-${cc.currency}-${a.axis}`}
                  className={clsx(
                    'border-b border-line/50 align-top outline-none',
                    nav.index === i && 'bg-cyan-500/5 ring-1 ring-inset ring-cyan-500/40',
                  )}
                >
                  {/* D1: the axis name is the affordance onto the rows behind it. */}
                  <Td>
                    <button
                      onClick={() => toggle(a.axis)}
                      data-testid={`axis-open-${cc.currency}-${a.axis}`}
                      aria-label={`${AXIS_LABEL[a.axis]} concentration — open the holders behind the index`}
                      className="inline-flex items-center gap-1 text-left text-micro font-semibold text-navy hover:underline"
                    >
                      <ChevronRight size={11} className={clsx('shrink-0 transition-transform', expanded && 'rotate-90')} />
                      {AXIS_LABEL[a.axis]}
                    </button>
                  </Td>
                  <Td className="text-right font-mono font-bold tabular-nums text-navy">
                    {orDash(a.effectiveHolders)}
                  </Td>
                  <Td className="text-right font-mono tabular-nums text-grey-dark">
                    {orDash(a.hhiPoints)}
                  </Td>
                  <Td className="text-right font-mono tabular-nums" data-testid={`axis-band-${cc.currency}-${a.axis}`}>
                    {a.band == null ? (
                      <span className="text-grey">n/a</span>
                    ) : a.band.isPoint ? (
                      <span className="text-grey" title={a.band.basis}>point</span>
                    ) : (
                      <span className="text-navy" title={a.band.basis}>
                        {a.band.low.toFixed(2)}–{a.band.high.toFixed(2)}
                      </span>
                    )}
                  </Td>
                  <Td className="text-grey-dark">
                    {a.dominant ? a.dominant.label : <span className="text-grey">nothing attributed</span>}
                  </Td>
                  <Td className={clsx('text-right font-mono font-bold tabular-nums', shareTone(a.dominant?.sharePct ?? null))}>
                    {a.dominant ? `${a.dominant.sharePct}%` : <span className="text-grey">n/a</span>}
                  </Td>
                  <Td className={clsx(
                    'text-right font-mono tabular-nums',
                    a.top3SharePct != null && a.top3SharePct >= TOP3_ALARM_SHARE_PCT ? ALARM : 'text-grey-dark',
                  )}>
                    {a.top3SharePct == null ? <span className="text-grey">n/a</span> : `${a.top3SharePct}%`}
                  </Td>
                  <Td className={clsx(
                    'text-right font-mono tabular-nums',
                    a.coveragePct != null && a.coveragePct < 100 ? WARN : 'text-grey-dark',
                  )}>
                    {a.coveragePct == null ? <span className="text-grey">n/a</span> : `${a.coveragePct}%`}
                  </Td>
                  <Td className="text-right font-mono tabular-nums text-grey">
                    {a.holderCount}
                    {a.unattributedPositions > 0 && (
                      <span className={WARN}> +{a.unattributedPositions}?</span>
                    )}
                  </Td>
                </tr>,

                /* THE HEADLINE ROW, ALWAYS VISIBLE AND NOT BEHIND THE TOGGLE.
                 * This is the sentence the module exists for — "60% of margin behind
                 * one partner is one resignation from a crisis" (book.ts:376) — and an
                 * index cannot say anything. Hiding it under a disclosure would make
                 * the page a table of indices again. */
                <tr key={`${a.axis}-headline`} className="border-b border-line/50">
                  <Td colSpan={9} className="pb-2 pt-0">
                    <span className="text-micro text-grey-dark" data-testid={`axis-headline-${cc.currency}-${a.axis}`}>
                      {a.headline}
                    </span>
                  </Td>
                </tr>,

                expanded ? (
                  <tr key={`${a.axis}-detail`} className="border-b border-line bg-page/60">
                    <Td colSpan={9} className="py-2">
                      <AxisDetail a={a} />
                    </Td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * D1 IN FULL, FOR ONE AXIS: the rows, the denominator, the mechanism, the refusals.
 *
 * This is what "every number opens" has to mean to be worth anything. The share in
 * the collapsed row is a fraction, and a fraction is only traceable if BOTH parts
 * of it are visible — so `attributedPositiveCents` and `totalPositiveCents` are
 * printed here as the denominator, and the difference between them is named as
 * unattributed rather than left as an unexplained gap.
 *
 * The two refusal lists are the part a normal dashboard omits:
 *  · `excludedNonPositive` — a holder at −$2,000 against a $10,000 book has share
 *    −0.2, whose SQUARE IS POSITIVE, so a loss-making counterparty would increase
 *    the measured diversification of the book (book.ts:361). They are excluded from
 *    the index and named here with their value, because silently dropping them is
 *    exactly what D2 forbids.
 *  · `notes` — every caveat the engine attached to this axis, in its order.
 */
function AxisDetail({ a }: { a: AxisConcentration }) {
  const unattributed = a.totalPositiveCents - a.attributedPositiveCents;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tabular-nums text-grey">
        <span>
          attributed{' '}
          <span className="font-bold text-navy">{money(a.attributedPositiveCents, a.currency)}</span>
        </span>
        <span>
          of positive total{' '}
          <span className="font-bold text-navy">{money(a.totalPositiveCents, a.currency)}</span>
        </span>
        <span className={unattributed > 0 ? WARN : undefined}>
          unattributed{' '}
          <span className="font-bold">{money(unattributed, a.currency)}</span>
          {' in '}{a.unattributedPositions} position{a.unattributedPositions === 1 ? '' : 's'}
        </span>
        <span>
          index over <span className="font-bold text-navy">{a.holderCount}</span> holder
          {a.holderCount === 1 ? '' : 's'}
        </span>
        <span>
          normalised{' '}
          <span className="font-bold text-navy">
            {a.normalisedHhi == null ? 'n/a' : a.normalisedHhi.toFixed(3)}
          </span>
        </span>
      </div>

      {a.holders.length === 0 ? (
        <p className="text-micro text-grey">
          No holder on this axis carries positive value, so no index is computed.
          A zero here would read as a perfectly diversified book, which is why it is
          absent rather than 0.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-[10px]">
          <thead>
            <tr className="border-b border-line/60 text-grey">
              <Th className="w-8 text-right">#</Th>
              <Th>{AXIS_LABEL[a.axis]}</Th>
              <Th className="w-36 text-right">{a.basis === 'price' ? 'Price' : 'Margin'}</Th>
              <Th className="w-20 text-right">Share</Th>
              <Th className="w-20 text-right">Positions</Th>
            </tr>
          </thead>
          <tbody>
            {a.holders.map((h: ConcentrationHolder, i) => (
              <tr key={h.key} className="border-b border-line/30">
                <Td className="text-right font-mono tabular-nums text-grey">{i + 1}</Td>
                <Td className="text-navy">{h.label}</Td>
                <Td className="text-right font-mono tabular-nums text-grey-dark">
                  {money(h.valueCents, a.currency)}
                </Td>
                <Td className={clsx('text-right font-mono font-bold tabular-nums', shareTone(h.sharePct))}>
                  {h.sharePct}%
                </Td>
                {/* Two $5k engagements and one $10k are not the same risk, which is
                  * why the count travels with the value (book.ts:271). */}
                <Td className="text-right font-mono tabular-nums text-grey">{h.positions}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {a.band && !a.band.isPoint && (
        <p className="text-[10px] text-grey" data-testid={`axis-band-basis-${a.axis}`}>
          <span className="font-bold uppercase tracking-wide">band mechanism · </span>
          {a.band.basis}
        </p>
      )}

      {a.excludedNonPositive.length > 0 && (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1">
          <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Excluded from the index — {a.excludedNonPositive.length} holder
            {a.excludedNonPositive.length === 1 ? '' : 's'} at or below zero
          </div>
          <ul className="mt-1 space-y-px">
            {a.excludedNonPositive.map((x) => (
              <li key={x.key} className="font-mono text-[10px] tabular-nums text-grey-dark">
                {x.label} · {money(x.valueCents, a.currency)} · {x.positions} position
                {x.positions === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-grey">
            A Herfindahl index is not defined over negative shares — squaring a
            negative share would make a loss-making counterparty look like
            diversification. They are named here rather than dropped.
          </p>
        </div>
      )}

      {a.notes.length > 0 && (
        <ul className="space-y-px" data-testid={`axis-notes-${a.axis}`}>
          {a.notes.map((n) => (
            <li key={n} className="text-[10px] text-grey">· {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The currency mix — THE ONE AXIS MEASURED IN COUNTS, and it says so in its header.
 *
 * A share of value requires a total, and a total across currencies is true in no
 * currency (book.ts:645). Converting at a rate this system does not have and cannot
 * source would put an invented number on the surface whose promise is the opposite.
 * So the mix is a count, the header states the basis rather than leaving a reader to
 * infer it, and each currency's own total travels beside it un-pooled and
 * un-addable.
 */
function CurrencyMixTable({ mix }: { mix: CurrencyMix }) {
  return (
    <div className="mt-4">
      <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">
        Currency mix — basis: {mix.basis.replace('_', ' ')}, not value
      </div>
      <p className="mb-2 text-micro text-grey" data-testid="currency-mix-headline">{mix.headline}</p>
      {mix.holders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-micro">
            <thead>
              <tr className="border-b border-line text-grey">
                <Th className="w-24">Currency</Th>
                <Th className="w-24 text-right">Positions</Th>
                <Th className="w-24 text-right">Share of count</Th>
                <Th className="w-40 text-right" title="In this currency only. Not addable to any other row.">Own-currency total</Th>
                <Th className="w-28 text-right">Behaves like</Th>
                <Th className="w-24 text-right">HHI pts</Th>
              </tr>
            </thead>
            <tbody>
              {mix.holders.map((h, i) => (
                <tr key={h.currency} className="border-b border-line/50">
                  <Td className="font-mono font-bold text-navy">{h.currency}</Td>
                  <Td className="text-right font-mono tabular-nums text-grey-dark">{h.positions}</Td>
                  <Td className="text-right font-mono tabular-nums text-navy">{h.sharePct}%</Td>
                  <Td className="text-right font-mono tabular-nums text-grey-dark">
                    {money(h.valueCents, h.currency)}
                  </Td>
                  {/* The index describes the whole mix, so it belongs on one row
                    * only — repeating it per currency would read as a per-currency
                    * figure, which it is not. */}
                  <Td className="text-right font-mono font-bold tabular-nums text-navy">
                    {i === 0 ? orDash(mix.effectiveHolders) : ''}
                  </Td>
                  <Td className="text-right font-mono tabular-nums text-grey">
                    {i === 0 ? orDash(mix.hhiPoints) : ''}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 6.3 — CASH CONVERSION. Booked → accepted → deposit → invoiced → collected.
 *
 * The oldest unpaid deposit in days has been computed since Phase 1
 * (`awaitingDeposit.oldestAcceptedDays`) and has never appeared on a screen. In a
 * business where the deposit is what commits a partner, that number is the
 * difference between a signature and a delivery, so it is the first line of this
 * panel rather than a column in a table.
 *
 * DAYS ARE THE ONLY FIGURE STATED BOOK-WIDE HERE, and the reason is dimensional:
 * days are currency-agnostic, cents are not. Counts likewise. Every amount lives
 * inside its own currency's funnel and the oldest deposit carries its currency with
 * it so it can be printed without ever being added to another.
 * ═══════════════════════════════════════════════════════════════════════════ */

function CashPanel({ cash }: { cash: CashConversion }) {
  const aged = cash.agedDepositCount > 0;
  const o = cash.oldestUnpaidDeposit;

  return (
    <Section
      title="Cash conversion"
      tone={aged ? 'alarm' : undefined}
      note={
        <>
          Cumulative counts per stage, per currency. Conversion rates are suppressed
          below the sample size at which a rate means anything, and the suppressed
          cell prints its reason instead of a zero. A deposit unpaid past{' '}
          {AGED_DEPOSIT_ALARM_DAYS} days is one full payment cycle after a signature —
          a stated prior, not a measurement.
        </>
      }
      right={
        <span className="font-mono text-micro tabular-nums text-grey">
          awaiting deposit <span className="font-bold text-navy">{cash.awaitingDepositCount}</span>
          {' · awaiting collection '}<span className="font-bold text-navy">{cash.awaitingCollectionCount}</span>
          {' · aged '}
          <span className={clsx('font-bold', aged ? ALARM : 'text-navy')}>{cash.agedDepositCount}</span>
        </span>
      }
    >
      {/* THE HEADLINE FACT OF THE PANEL. Never a column. */}
      <div
        className={clsx(
          'mb-3 rounded border px-3 py-2',
          o == null ? 'border-line bg-page' : o.days >= AGED_DEPOSIT_ALARM_DAYS
            ? 'border-red-500/40 bg-red-500/5' : 'border-line bg-page',
        )}
        data-testid="oldest-unpaid-deposit"
      >
        <div className="text-micro font-bold uppercase tracking-wide text-grey">Oldest unpaid deposit</div>
        {o == null ? (
          <p className="mt-1 text-label text-grey">
            No accepted engagement is waiting on a deposit. Nothing is late because
            nothing is outstanding — not because the figure is missing.
          </p>
        ) : (
          <p className="mt-1 text-label text-navy">
            <span className={clsx(
              'font-mono text-body font-bold tabular-nums',
              o.days >= AGED_DEPOSIT_ALARM_DAYS ? ALARM : WARN,
            )}>
              {o.days}d
            </span>{' '}
            since acceptance — <span className="font-semibold">{o.clientName ?? o.clientId}</span>,{' '}
            <span className="font-mono tabular-nums">{money(o.depositRequiredCents, o.currency)}</span>{' '}
            outstanding, status {o.statusLabel}.
            <span className="ml-2 font-mono text-micro text-grey">
              accepted {o.acceptedAt} · engagement {o.engagementId}
            </span>
          </p>
        )}
      </div>

      {/* D8 — receivable aging has NO ANCHOR in the schema: `gps_engagement` has no
        * invoiced-at column, so the engine refuses to age receivables rather than
        * substituting `updated_at` and calling the result a receivable age. The
        * refusal is printed where the empty table is, not omitted. */}
      {!cash.receivableAnchorAvailable && (
        <p className={clsx('mb-3 text-micro', WARN)} data-testid="receivable-refusal">
          <span className="font-bold uppercase tracking-wide">Receivable aging withheld · </span>
          {cash.receivableAgingRefusal
            ?? 'No position supplied an invoice date, so nothing can be aged from one. No substitute timestamp is used.'}
        </p>
      )}

      {cash.notes.length > 0 && (
        <ul className="mb-3 space-y-1" data-testid="cash-notes">
          {cash.notes.map((n) => <li key={n} className="text-micro text-grey">· {n}</li>)}
        </ul>
      )}

      {cash.perCurrency.length === 0 ? (
        <p className="text-label text-grey">
          No positions, so there is no funnel. Every stage is absent rather than zero.
        </p>
      ) : (
        <div className="space-y-5">
          {cash.perCurrency.map((f) => <FunnelBlock key={f.currency} f={f} />)}
        </div>
      )}
    </Section>
  );
}

/** One currency: the funnel, then the two aging profiles. */
function FunnelBlock({ f }: { f: CurrencyFunnel }) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3 font-mono text-micro tabular-nums">
        <span className="font-bold uppercase tracking-wider text-navy">{f.currency}</span>
        <span className="text-grey">
          open <span className="font-bold text-navy">{money(f.openCents, f.currency)}</span>
        </span>
        <span className="text-grey">
          collected <span className="font-bold text-navy">{money(f.collectedCents, f.currency)}</span>
        </span>
        <span className="text-grey">
          awaiting deposit{' '}
          <span className="font-bold text-navy">
            {f.awaitingDeposit.count} · {money(f.awaitingDeposit.amountCents, f.currency)}
          </span>
        </span>
        <span className="text-grey">
          awaiting collection{' '}
          <span className="font-bold text-navy">
            {f.awaitingCollection.count} · {money(f.awaitingCollection.amountCents, f.currency)}
          </span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-micro">
          <thead>
            <tr className="border-b border-line text-grey">
              <Th className="w-40">Stage</Th>
              <Th className="w-20 text-right">Count</Th>
              <Th className="w-40 text-right">Value</Th>
              <Th className="w-28 text-right" title="Conversion into the NEXT stage. Numerator and denominator are both printed so the rate is checkable.">→ next</Th>
              <Th>Basis, or why no rate is shown</Th>
            </tr>
          </thead>
          <tbody>
            {f.stages.map((s, i) => {
              const conv = f.conversions[i] ?? null;
              return (
                <tr key={s.stage} className="border-b border-line/50 align-top">
                  <Td className="font-semibold text-navy">{FUNNEL_STAGE_LABELS[s.stage]}</Td>
                  <Td className="text-right font-mono font-bold tabular-nums text-navy">{s.count}</Td>
                  <Td className="text-right font-mono tabular-nums text-grey-dark">
                    {money(s.valueCents, f.currency)}
                  </Td>
                  <Td className="text-right font-mono tabular-nums">
                    {conv == null ? (
                      <span className="text-grey">—</span>
                    ) : conv.ratePct == null ? (
                      /* D2: a suppressed rate is not 0%. It is a refusal with a
                       * reason, and the reason is in the next cell. */
                      <span className={WARN}>withheld</span>
                    ) : (
                      <span className="font-bold text-navy">{conv.ratePct}%</span>
                    )}
                  </Td>
                  <Td className="text-grey">
                    {conv == null
                      ? 'Final stage — cash in.'
                      : conv.ratePct == null
                        ? conv.suppressedReason
                        : `${conv.toCount} of ${conv.fromCount} reached ${FUNNEL_STAGE_LABELS[conv.to].toLowerCase()}.`}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 grid gap-3 lg:grid-cols-2">
        <AgingTable p={f.depositAging} />
        <AgingTable p={f.receivableAging} />
      </div>
    </div>
  );
}

/**
 * One aging profile.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE PLACE ON THIS PAGE WHERE D1 IS NOT FULLY SATISFIED, SAID OUT LOUD.
 * ─────────────────────────────────────────────────────────────────────────────
 * A bracket opens onto its DEFINITION (the day boundaries, inclusive at both ends),
 * its ANCHOR (which timestamp the age is measured from) and its REFUSALS (`unaged`
 * with `unagedReason`) — the formula, the source and the caveat. It cannot open onto
 * the engagements inside it, because `AgingBracket` carries `count` and
 * `amountCents` and no ids (book.ts:972). Rather than fake a drill-down or quietly
 * omit the limitation, the panel prints it: the reader is told the rows are not
 * reachable from here and where they are reachable from. Closing the gap needs an
 * API field, which is not this file's to add.
 */
function AgingTable({ p }: { p: AgingProfile }) {
  const empty = p.count === 0 && p.unaged === 0;
  return (
    <div className="rounded border border-line px-2 py-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-micro font-bold uppercase tracking-wide text-grey">{p.what}</span>
        <span className="font-mono text-[10px] tabular-nums text-grey">
          aged from <span className="text-navy">{p.anchor}</span>
          {p.oldestDays != null && <> · oldest <span className="font-bold text-navy">{p.oldestDays}d</span></>}
        </span>
      </div>

      {empty ? (
        <p className="py-1 text-micro text-grey">
          Nothing to age. No item is in this leg — the brackets are absent, not zeroed.
        </p>
      ) : (
        <table className="mt-1 w-full border-collapse text-left text-[10px]">
          <thead>
            <tr className="border-b border-line/60 text-grey">
              <Th className="w-20">Bracket</Th>
              <Th className="w-14 text-right">Count</Th>
              <Th className="text-right">Amount</Th>
              <Th className="w-28">Days, inclusive</Th>
            </tr>
          </thead>
          <tbody>
            {p.brackets.map((b) => (
              <tr key={b.key} className="border-b border-line/30">
                <Td className={clsx(
                  'font-mono font-semibold',
                  b.count > 0 && b.minDays > AGED_DEPOSIT_ALARM_DAYS ? ALARM : 'text-navy',
                )}>
                  {b.label}
                </Td>
                <Td className="text-right font-mono tabular-nums text-grey-dark">{b.count}</Td>
                <Td className="text-right font-mono tabular-nums text-grey-dark">
                  {money(b.amountCents, p.currency)}
                </Td>
                <Td className="font-mono text-grey">
                  {b.minDays}–{b.maxDays == null ? '∞' : b.maxDays}
                </Td>
              </tr>
            ))}
            <tr className="border-t border-line">
              <Td className="font-bold uppercase tracking-wide text-grey">Total</Td>
              <Td className="text-right font-mono font-bold tabular-nums text-navy">{p.count}</Td>
              <Td className="text-right font-mono font-bold tabular-nums text-navy">
                {money(p.amountCents, p.currency)}
              </Td>
              <Td />
            </tr>
          </tbody>
        </table>
      )}

      {/* D2 — items whose anchor was missing or in the future are NAMED, not filed
        * into the freshest bracket where nobody would ever look for them. */}
      {p.unaged > 0 && (
        <p className={clsx('mt-1 text-[10px]', WARN)} data-testid="aging-unaged">
          {p.unaged} item{p.unaged === 1 ? '' : 's'} could not be aged.{' '}
          {p.unagedReason ?? 'No reason was supplied, which is itself a fault.'}
        </p>
      )}

      <p className="mt-1 text-[10px] text-grey">
        Brackets carry a count and an amount only — the engagements behind a bracket
        are not reachable from this cell, because the response does not carry their
        ids. Open the delivery desk for the individual positions.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 6.2 — CAPACITY. Not a gauge. A reason, per offer, plus his own ceiling.
 *
 * TWO CEILINGS, AND THEY ARE NOT THE SAME CEILING. The bench can deliver N more
 * engagements; HE can coordinate M hours a week around a full-time LCX job. Either
 * can bind first, so both are here, and neither is expressed as a percentage of the
 * other.
 *
 * THE ONE ARITHMETIC RULE THIS PANEL MUST NOT BREAK: `totalSpareSlots` IS NOT THE
 * SUM OF THE PER-OFFER HEADROOMS AND IS NOT PRESENTED AS ONE (partners.ts:384). A
 * partner capable of three offers contributes their spare slot to all three
 * figures, because each answers "if the NEXT deal were this offer, could we take
 * it?". Summing the column would triple the ceiling and license selling three
 * engagements into one slot — so the total sits outside the table, labelled as the
 * simultaneous ceiling, with `perOfferIndependent` printed beside it.
 * ═══════════════════════════════════════════════════════════════════════════ */

function CapacityPanel({ capacity, wip, placeholders }: {
  capacity: BenchHeadroom | null;
  wip: WipLoad | null;
  placeholders: BookPlaceholders;
}) {
  return (
    <Section
      title="Capacity — the bench, and his own hours"
      note="Two independent ceilings. The bench figure answers “could a partner deliver one more”; the hours figure answers “could he coordinate one more”. Neither is a percentage of the other and they are not combined into a single utilisation number."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">Bench</div>
          {capacity == null ? (
            /* D2 — "unknown" is not "zero". No offer names a delivering partner
             * today (decision D5), so the bench genuinely cannot be computed, and
             * saying "0 slots" would read as a full bench rather than an absent one. */
            <p className="text-label text-grey" data-testid="capacity-unknown">
              The bench is unknown, which is not the same as full. No partner roster
              has been supplied and no offer names a delivering partner, so there is
              nothing to compute headroom from. Until then the honest answer is that
              capacity is unmeasured — this panel will not substitute a zero for it.
            </p>
          ) : (
            <>
              <div className="mb-1 flex flex-wrap gap-x-4 font-mono text-micro tabular-nums">
                <span className="text-grey">
                  simultaneous ceiling{' '}
                  <span className={clsx('font-bold', capacity.totalSpareSlots === 0 ? ALARM : OK)}>
                    {capacity.totalSpareSlots}
                  </span>
                </span>
                <span className="text-grey">
                  unstaffed active{' '}
                  <span className={clsx('font-bold', capacity.unstaffedActiveCount > 0 ? ALARM : 'text-navy')}>
                    {capacity.unstaffedActiveCount}
                  </span>
                </span>
                <span className={capacity.availabilityEvaluated ? 'text-grey' : WARN}>
                  availability windows{' '}
                  {capacity.availabilityEvaluated ? 'applied' : 'NOT applied'}
                </span>
              </div>
              <p className={clsx('mb-2 text-[10px]', capacity.perOfferIndependent ? 'text-grey' : WARN)}>
                {capacity.perOfferIndependent
                  ? 'No partner is capable of more than one of these offers, so the per-offer figures below are independent.'
                  : 'At least one partner can deliver more than one offer, so the per-offer figures OVERLAP. Do not add the column — the simultaneous ceiling above is the real limit.'}
              </p>
              <table className="w-full border-collapse text-left text-micro">
                <thead>
                  <tr className="border-b border-line text-grey">
                    <Th>Offer</Th>
                    <Th className="w-20 text-right">Headroom</Th>
                    <Th className="w-20 text-right">Active</Th>
                    <Th className="w-20 text-right" title="Partners with a matching capability">Capable</Th>
                    <Th className="w-24 text-right" title="Capable AND holding a usable rate card — i.e. quotable with a known margin">Quotable</Th>
                    <Th>Reasons</Th>
                  </tr>
                </thead>
                <tbody>
                  {capacity.perOffer.map((oh) => (
                    <tr key={oh.offerKey} className="border-b border-line/50 align-top">
                      <Td className="text-navy">{getOffer(oh.offerKey)?.name ?? oh.offerKey}</Td>
                      <Td className={clsx(
                        'text-right font-mono font-bold tabular-nums',
                        oh.blocked ? ALARM : OK,
                      )}>
                        {oh.blocked ? 'blocked' : oh.headroom}
                      </Td>
                      <Td className="text-right font-mono tabular-nums text-grey-dark">{oh.activeNow}</Td>
                      <Td className="text-right font-mono tabular-nums text-grey-dark">
                        {oh.capablePartnerIds.length}
                      </Td>
                      <Td className={clsx(
                        'text-right font-mono tabular-nums',
                        oh.quotablePartnerIds.length === 0 ? WARN : 'text-grey-dark',
                      )}>
                        {oh.quotablePartnerIds.length}
                        {!placeholders.partnerRateCardsSupplied && <PlaceholderTag what="Partner rate cards" />}
                      </Td>
                      {/* D2 — the REASON is the deliverable here, not the number.
                        * "Not a gauge — a reason" (GPS_100X_PLAN.md §2, slice 6.2). */}
                      <Td className="text-grey">
                        {oh.reasons.length === 0
                          ? 'No constraint recorded.'
                          : oh.reasons
                              .map((r) => `${r.label}${r.slots !== 0 ? ` (${r.slots > 0 ? '+' : ''}${r.slots})` : ''}`)
                              .join(' · ')}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div>
          <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">
            His coordination hours
          </div>
          {wip == null ? (
            <p className="text-label text-grey" data-testid="wip-unknown">
              Work-in-progress load is unavailable, so no hours ceiling is stated. An
              unmeasured ceiling is reported as unmeasured; it is not rendered as
              unlimited capacity.
            </p>
          ) : (
            <>
              <p className="mb-2 text-label text-navy">{wip.headline}</p>
              <table className="w-full border-collapse text-left text-micro">
                <tbody>
                  <WipRow k="Active in delivery" v={wip.active} />
                  <WipRow k="Distinct clients" v={wip.clients} />
                  <WipRow k="Blocked (still costs his attention)" v={wip.blocked} tone={wip.blocked > 0 ? WARN : undefined} />
                  <WipRow k="Awaiting a client or counsel input" v={wip.awaitingClientInput} tone={wip.awaitingClientInput > 0 ? WARN : undefined} />
                  <WipRow k="Awaiting collection" v={wip.awaitingCollection} />
                  <WipRow
                    k="Unstaffable — no partner names this offer"
                    v={wip.unstaffable}
                    tone={wip.unstaffable > 0 ? ALARM : undefined}
                  />
                  <tr className="border-b border-line/50">
                    <Td className="text-grey-dark">
                      Coordination hours per week
                      {wip.usesPlaceholderHours && <PlaceholderTag what="Coordination hours" />}
                    </Td>
                    <Td className="text-right font-mono font-bold tabular-nums text-navy">
                      {wip.coordinationHoursPerWeek}
                    </Td>
                  </tr>
                  <tr className="border-b border-line/50">
                    <Td className="text-grey-dark">
                      Capacity hours per week
                      {wip.usesPlaceholderHours && <PlaceholderTag what="Capacity hours" />}
                    </Td>
                    <Td className="text-right font-mono font-bold tabular-nums text-navy">
                      {wip.capacityHoursPerWeek}
                    </Td>
                  </tr>
                  <tr className="border-b border-line/50">
                    <Td className="text-grey-dark">Utilisation</Td>
                    <Td className={clsx(
                      'text-right font-mono font-bold tabular-nums',
                      wip.overCapacity ? ALARM : 'text-navy',
                    )}>
                      {wip.utilisationPct == null
                        ? <span className="text-grey">n/a — no capacity recorded</span>
                        : `${wip.utilisationPct}%`}
                    </Td>
                  </tr>
                </tbody>
              </table>
              {wip.usesPlaceholderHours && (
                <p className={clsx('mt-2 text-[10px]', WARN)} data-testid="wip-placeholder-note">
                  The hours above are PLACEHOLDERS. They have not been supplied by the
                  founder, so utilisation is arithmetic on an assumption and must not be
                  quoted, planned against, or shown to a client.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Section>
  );
}

function WipRow({ k, v, tone }: { k: string; v: number; tone?: string }) {
  return (
    <tr className="border-b border-line/50">
      <Td className="text-grey-dark">{k}</Td>
      <Td className={clsx('text-right font-mono font-bold tabular-nums', tone ?? 'text-navy')}>{v}</Td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 6.4 — MARGIN REALISATION. Quoted versus realised, and which side leaked.
 *
 * THE MOST IMPORTANT NUMBER IN A PARTNER-DELIVERED BUSINESS, and nothing in this
 * platform has ever measured it: a grep for margin or cost across the first 47
 * migrations finds nothing (calibration.ts:562). At a $10–25k ticket a single scope
 * overrun eats the deal, so the question is not "what did we quote" but "what did
 * we keep".
 *
 * `slippage ≈ priceSlippage − costSlippage` is printed as two columns rather than
 * one, because "we discounted" and "the partner overran" have completely different
 * remedies and a single slippage figure cannot distinguish them.
 *
 * WHAT THIS PANEL WILL SAY FOR THE FORESEEABLE FUTURE: nothing measured. There is
 * no outcome table in the schema, so `marginRealisation` arrives null, and the
 * blind spot IS the finding — printed as such rather than left as an empty card.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** `MarginGroup`, reached through the response so no second import site exists. */
type MarginGroupRow = MarginRealisation['byOffer'][number];

function MarginPanel({ margin, placeholders }: {
  margin: MarginRealisation | null;
  placeholders: BookPlaceholders;
}) {
  if (margin == null) {
    return (
      <Section title="Margin realisation — quoted vs realised" tone="warn">
        <p className="text-label text-grey" data-testid="margin-unavailable">
          Not measured, and not estimated. No engagement has a recorded realised
          outcome — there is no outcome table in the schema — so quoted margin cannot
          be compared with anything. This is the blind spot itself rather than an
          empty panel: in a business where partners deliver and a single scope overrun
          eats a $10–25k engagement, nobody currently knows what is actually kept.
          {!placeholders.partnerRateCardsSupplied && (
            <> Partner rate cards have not been supplied either, so even the QUOTED side
            of the comparison rests on placeholder vendor costs.</>
          )}
        </p>
      </Section>
    );
  }

  return (
    <Section
      title="Margin realisation — quoted vs realised"
      note="Slippage is signed: negative means margin was given away. It is split into the two sides — a discount and a partner overrun are the same slippage and different problems. Standard deviation is withheld at n = 1, because one overrun is an anecdote."
      right={
        <span className="font-mono text-micro tabular-nums text-grey">
          excluded: incomplete <span className="font-bold text-navy">{margin.excludedIncompleteRealisation}</span>
          {' · lost '}<span className="font-bold text-navy">{margin.excludedLost}</span>
        </span>
      }
    >
      {margin.overall && <MarginTable title="All complete engagements" rows={[margin.overall]} />}
      {margin.byOffer.length > 0 && <MarginTable title="By offer" rows={margin.byOffer} />}
      {margin.byPartner.length > 0 && (
        <MarginTable title="By partner — worst mean slippage first" rows={margin.byPartner} />
      )}

      {/* D2 — the offers with NO data are named. An action list that silently omits
        * the offers it cannot see is worse than no list. */}
      {margin.offersWithNoRealisationData.length > 0 && (
        <p className={clsx('mt-3 text-micro', WARN)} data-testid="margin-blind-spots">
          <span className="font-bold uppercase tracking-wide">No realisation data · </span>
          {margin.offersWithNoRealisationData
            .map((k) => getOffer(k)?.name ?? k)
            .join(' · ')}
          . These offers have zero complete engagements, so nothing about their real
          margin is known. The blind spot is the finding.
        </p>
      )}
    </Section>
  );
}

function MarginTable({ title, rows }: { title: string; rows: readonly MarginGroupRow[] }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-micro">
          <thead>
            <tr className="border-b border-line text-grey">
              <Th>Group</Th>
              <Th className="w-12 text-right">n</Th>
              <Th className="w-32 text-right">Quoted margin</Th>
              <Th className="w-32 text-right">Realised margin</Th>
              <Th className="w-32 text-right" title="Realised minus quoted. Negative means margin was given away.">Slippage</Th>
              <Th className="w-28 text-right" title="Standard deviation of slippage. Withheld below n = 2.">σ</Th>
              <Th className="w-28 text-right" title="Mean price slippage — the discounting side">Price side</Th>
              <Th className="w-28 text-right" title="Mean cost slippage — the partner-overrun side">Cost side</Th>
              <Th className="w-24 text-right" title="Engagements delivered at a realised loss. A count, not a rate.">At a loss</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={`${g.kind}-${g.key}`} className="border-b border-line/50">
                <Td className="text-navy">{g.kind === 'offer' ? (getOffer(g.key as never)?.name ?? g.key) : g.key}</Td>
                <Td className="text-right font-mono tabular-nums text-grey">{g.n}</Td>
                {/* CENTS ARE PRINTED WITHOUT A CURRENCY CODE HERE, and that is a
                  * limitation not an oversight: `MarginGroup` pools engagements
                  * across currencies (calibration.ts:445 carries no currency field),
                  * so the only honest label is the unit. Stated rather than dressed
                  * up with a symbol the data does not support. */}
                <Td className="text-right font-mono tabular-nums text-grey-dark">
                  {(g.quotedMarginMeanCents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </Td>
                <Td className="text-right font-mono tabular-nums text-grey-dark">
                  {(g.realisedMarginMeanCents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </Td>
                <Td className={clsx(
                  'text-right font-mono font-bold tabular-nums',
                  g.slippageMeanCents < 0 ? ALARM : g.slippageMeanCents > 0 ? OK : 'text-grey',
                )}>
                  {(g.slippageMeanCents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </Td>
                <Td className="text-right font-mono tabular-nums text-grey">
                  {g.slippageStdDevCents == null
                    ? <span title="n = 1: one overrun is an anecdote, not a dispersion.">withheld</span>
                    : (g.slippageStdDevCents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </Td>
                <Td className="text-right font-mono tabular-nums text-grey-dark">
                  {(g.priceSlippageMeanCents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </Td>
                <Td className="text-right font-mono tabular-nums text-grey-dark">
                  {(g.costSlippageMeanCents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </Td>
                <Td className={clsx(
                  'text-right font-mono tabular-nums',
                  g.negativeRealisedMarginCount > 0 ? ALARM : 'text-grey',
                )}>
                  {g.negativeRealisedMarginCount}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-grey">
        Amounts are MAJOR UNITS OF THE ENGAGEMENT'S OWN CURRENCY, unlabelled, because
        these means pool engagements whose currencies differ and the group carries no
        currency. A symbol here would be a claim the data cannot support.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE UNRESOLVED LEDGER — one block, badged, at the foot of the page.
 *
 * TWO DIFFERENT KINDS OF ABSENCE, kept apart on purpose (book.ts:2019): a
 * PLACEHOLDER is a number standing in for a real one, an UNRESOLVED is a capability
 * that does not exist yet. Conflating them is precisely how "we used a guess"
 * becomes "we measured it" over a few quarters.
 *
 * It is at the FOOT and not the head because a reader who opens the book wants the
 * verdict first — and it is not the only place these appear: every affected cell
 * above carries its own badge, so a reader who never scrolls this far still cannot
 * mistake a placeholder for a price.
 *
 * IT IS NOT EDITABLE HERE, and that is deliberate. The founder's inputs are one
 * editable block in the catalogue, not five scattered forms; a portfolio screen that
 * could rewrite a price band would be a second source of truth for the number the
 * whole compartment is waiting on. This ledger names the owner instead.
 * ═══════════════════════════════════════════════════════════════════════════ */

const OWNER_LABEL: Record<BookUnresolved['owner'], string> = {
  founder: 'Founder',
  'founder+counsel': 'Founder + counsel',
  partner: 'Partner',
  engineering: 'Engineering',
};

function PlaceholderLedger({ placeholders: p, unresolved }: {
  placeholders: BookPlaceholders;
  unresolved: readonly BookUnresolved[];
}) {
  const body = useRef<HTMLTableSectionElement>(null);
  const blocking = unresolved.filter((u) => u.blocking).length;
  const nav = useListNavigation({ count: unresolved.length, container: body });

  const flags: { label: string; bad: boolean; detail: string }[] = [
    {
      label: 'Price bands',
      bad: p.priceBandsArePlaceholders,
      detail: 'Every price band in the catalogue is a placeholder. No figure derived from one may be quoted.',
    },
    {
      label: 'Vendor costs',
      bad: p.vendorCostsArePlaceholders,
      detail: 'Expected vendor cost is a TODO figure, so every margin above is arithmetic on an assumption.',
    },
    {
      label: 'Coordination hours',
      bad: p.coordinationHoursArePlaceholders,
      detail: 'The weekly hours ceiling is assumed, so utilisation is not measured.',
    },
    {
      label: 'Partner rate cards',
      bad: !p.partnerRateCardsSupplied,
      detail: 'No real rate cards exist, so nothing derived from partner cost is measured.',
    },
  ];

  return (
    <Section
      title="Unresolved inputs — what is a placeholder, and who alone can fix it"
      tone={blocking > 0 ? 'warn' : undefined}
      note="A placeholder is a number standing in for a real one. An unresolved input is a capability that does not exist yet. They are listed separately because conflating them is how a guess becomes a measurement."
      right={
        <span className="font-mono text-micro tabular-nums text-grey">
          {p.blockingQuotingDecisions} decision{p.blockingQuotingDecisions === 1 ? '' : 's'} block quoting
          {' · '}
          <span className={clsx('font-bold', blocking > 0 ? WARN : 'text-navy')}>{blocking}</span> blocking
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2" data-testid="placeholder-flags">
        {flags.map((f) => (
          <span
            key={f.label}
            title={f.detail}
            className={clsx(
              'inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-micro',
              f.bad
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'border-line text-grey',
            )}
          >
            {f.label}
            <span className="font-bold uppercase">{f.bad ? 'placeholder' : 'supplied'}</span>
          </span>
        ))}
      </div>

      {unresolved.length === 0 ? (
        <p className="text-label text-grey">
          The engine reported no unresolved inputs. Every flag above still stands on
          its own — an absent ledger is not a supplied input.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-micro">
            <thead>
              <tr className="border-b border-line text-grey">
                <Th className="w-56">Field</Th>
                <Th className="w-36">Owner</Th>
                <Th className="w-20">Blocking</Th>
                <Th>Why it matters</Th>
                <Th>Consequence of leaving it</Th>
              </tr>
            </thead>
            <tbody ref={body} {...nav.containerProps}>
              {unresolved.map((u, i) => (
                <tr
                  key={u.field}
                  {...nav.rowProps(i)}
                  data-testid={`unresolved-${u.field}`}
                  className={clsx(
                    'border-b border-line/50 align-top outline-none',
                    nav.index === i && 'bg-cyan-500/5 ring-1 ring-inset ring-cyan-500/40',
                  )}
                >
                  <Td className="font-mono font-semibold text-navy">{u.field}</Td>
                  <Td className="text-grey-dark">{OWNER_LABEL[u.owner]}</Td>
                  <Td className={clsx('font-mono font-bold uppercase', u.blocking ? WARN : 'text-grey')}>
                    {u.blocking ? 'yes' : 'no'}
                  </Td>
                  <Td className="text-grey-dark">{u.whyItMatters}</Td>
                  <Td className="text-grey-dark">{u.consequence}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
