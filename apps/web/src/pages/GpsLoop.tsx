import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { getOffer } from '@lcx/shared';
import type {
  BookMonitorSpec, CalibrationHealthView, Conclusion, Driver, LoopDataSource,
  LoopResponse, LoopVolumeStatement, MarginGroup, MarginRealisation,
  OutcomeCaptureDraft, OutcomeCaptureForm, ReviewPacket, SuppressibleRate,
  WbrGpsBlock, WinLossRow, WinLossSummary,
} from '@lcx/shared';
import { PageTitle, Button, Badge, Input, Select } from '@/components/ui';
import { ErrorNotice, PageSkeleton } from '@/components/shared';
import { formatMoney } from '@/lib/format';
import { isOverlayOpen } from '@/lib/dismiss';
import { gpsKeysBelongToSurface } from '@/components/gps/gpsPaneFocus';
import {
  fetchGpsLoop, fetchGpsMarginRealisation, fetchGpsWinLoss, recordGpsOutcome,
  type OutcomeSubmission,
} from '@/lib/api/gpsLoop';
import { GpsMetaBanner } from './GpsMetaBanner';

/**
 * GLOBAL SERVICES — THE LOOP (plan §8, Phase 12).
 *
 * THE SCREEN THAT IS HONEST ABOUT WHAT IT DOES NOT KNOW. Its whole character is
 * restraint, and the test of that character is n=0: at zero recorded outcomes this
 * page must still be worth opening, and it must not imply a single number it does
 * not have. So the ordering is inverted from every dashboard convention — what
 * CANNOT be concluded is the first block of content, not a footnote under a chart.
 *
 * WHY THAT ORDERING IS CORRECT AND NOT MERELY MODEST. At ~29 engagements a year
 * (`LOOP_VOLUME_STATEMENT.assumedAnnualEngagementVolume`, the founder's own
 * realistic figure and not a target) the honest answer to almost every question a
 * review asks is "not yet". `calibrationHealth` computes that ~1 year is needed
 * before the BEST-covered offer reaches `MIN_N_FOR_RATE` = 8
 * (`calibration.ts:860`). A page that led with a win-rate donut and buried the n
 * would be lying at exactly the volume this business runs at. Saying so first is
 * the anti-slop move (plan §8, 12.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FIVE THINGS THIS SURFACE DELIBERATELY WILL NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. PRINT A PERCENTAGE BELOW THE THRESHOLD. Every rate arrives as
 *     `SuppressibleRate` with `pct: number | null` (`loop.ts:150`), so the null
 *     branch is unavoidable in the renderer — there is no code path where 3
 *     outcomes become "33%". Where a rate is withheld the screen prints the
 *     engine's own sentence ("3 outcomes — too few to express a rate") rather
 *     than an em-dash, because a dash reads as an oversight and a sentence reads
 *     as a finding (D2, D3).
 *  2. OFFER TO ADJUST A WEIGHT. There is no button, no slider, no "apply
 *     recommendations", and no disabled control implying a future one. The review
 *     packet informs a human; `ReviewPacket.weightChangeMechanism` names the only
 *     mechanism there is — a human edits `WEIGHTS_V1` in `targeting.ts` and says
 *     why in the commit. Fitted weights would be self-fulfilling: the score
 *     decides who gets pursued and therefore generates the data confirming it
 *     (`calibration.ts`, and `proposedWeightChanges: never[]` makes the proposal
 *     literally untypeable).
 *  3. DECIDE FOR ITSELF WHETHER A CAPTURE IS VALID. The browser holds the draft
 *     and nothing else; every blocker, field status and legal reason option is read
 *     off the `OutcomeCaptureForm` the API returns, INCLUDING on a 422 refusal,
 *     which carries the whole form so the reasons travel with the "no" (D2). A
 *     second copy of `won_before_acceptance` in this file would drift from the
 *     engine, and the drifting copy would be the one the operator saw. When
 *     `gps_outcome` (the outcome migration, named by the server in `data.migration.file` — never hard-coded here, the number has moved twice) is not applied the server
 *     answers 503 with the migration named and the accepted form attached, and the
 *     screen states that — the operator learns their entry was fine and one file is
 *     missing, rather than seeing a generic failure.
 *  4. RENDER A LOSS AS A MAGNITUDE. Slippage is signed everywhere
 *     (`MarginGroup.slippageMeanCents`, `calibration.ts:459`: "the sign is the
 *     entire message"). `Math.abs` appears nowhere in this file.
 *  5. SHOW A MONITOR AS WATCHING. All five specs are DEFINITIONS
 *     (`BookMonitorSpec.mutatesState: false`, no `execute` field), none is
 *     registered, and `METRIC_SQL` has no GPS metric at all
 *     (`apps/api/src/intel/monitors.ts`). Each row prints what a human must wire.
 *
 * DENSITY (D5). Monospace and `tabular-nums` on every figure, 11px data rows,
 * bordered tables, no card per statistic. The four-stat GPS strip on `Gps.tsx` is
 * the anti-pattern this page is written against: four big numbers in four boxes
 * spend the whole viewport on less information than one row of this table.
 *
 * PRINT (D7). `@media print` styling is not enough on its own, so the WBR block
 * carries the engine's `lines` verbatim — a list of sentences each with its n
 * attached, which is what survives being pasted into a review deck. The failure
 * mode being defended against is a rate arriving on a slide with no n beside it
 * (`calibration.ts:872`).
 *
 * TRACEABILITY (D1). Every figure that has a derivation carries a `Drivers`
 * disclosure — the same `Driver { label, points }` pair the platform uses on
 * `alpha.ts:41` — openable in one interaction. HONEST CAVEAT, and it is the
 * engine's own: `points` on a review row is a labelled magnitude, NOT a signed
 * contribution to a score. Nothing on this page contributes to anything, because
 * this page changes nothing.
 *
 * KEYBOARD (D6). Digits 1–9 jump to a section, `p` prints. No Escape and no Tab
 * handler: this app has exactly one owner for each of those keys and it is not
 * this page.
 */

/* ══════════════════════════════════════════════════════════════════════════ */
/* PRIMITIVES — the density kit this page is built from                        */
/* ══════════════════════════════════════════════════════════════════════════ */

/** Integer cents → exact money. EXACT, never compacted: at a $10–25k ticket
 *  "$20K" hides the $500 that is the whole finding. Negatives keep their sign. */
function cents(c: number): string {
  return formatMoney(c / 100, { exact: true });
}

/** Signed cents. Negative is red AND carries `−`, so the sign survives a
 *  greyscale print (D7) — colour alone is not a signal on paper. */
function SignedCents({ value, className }: { value: number | null; className?: string }) {
  if (value == null) {
    return <span className={clsx('font-mono text-grey', className)}>not measurable</span>;
  }
  return (
    <span
      className={clsx(
        'font-mono tabular-nums',
        value < 0 ? 'font-semibold text-status-blocked' : 'text-navy',
        className,
      )}
    >
      {cents(value)}
    </span>
  );
}

/** A plain figure. `null` renders as the caller's word, never as a zero. */
function Num({ value, absent = 'none' }: { value: number | null; absent?: string }) {
  if (value == null) return <span className="font-mono text-grey">{absent}</span>;
  return <span className="font-mono tabular-nums text-navy">{value.toLocaleString('en-US')}</span>;
}

/**
 * D1 — what produced this number, in one interaction.
 *
 * `<details>` rather than a modal or a hover, for two reasons that are not style:
 * it needs no focus trap, which keeps this page out of the app's single Escape
 * contract; and a hover reveal does not exist on paper, whereas the page's
 * "expand all derivations" control opens every one of these before a print so the
 * derivations survive into the printed record (D7).
 *
 * `open` is driven by the page rather than by the element so that one control can
 * open all of them. `key` on the caller side is what resets the DOM state.
 */
function Drivers({ label, drivers, open }: { label: string; drivers: readonly Driver[]; open?: boolean }) {
  if (drivers.length === 0) return null;
  return (
    <details className="mt-1 group" open={open}>
      <summary className="cursor-pointer list-none text-micro text-grey underline decoration-dotted underline-offset-2 hover:text-navy">
        {label} ({drivers.length})
      </summary>
      <table className="mt-1 w-full border-collapse text-micro">
        <tbody>
          {drivers.map((d) => (
            <tr key={d.label} className="border-t border-line">
              <td className="py-0.5 pr-2 text-grey">{d.label}</td>
              <td className="py-0.5 text-right font-mono tabular-nums text-navy">
                {Number.isFinite(d.points) ? d.points.toLocaleString('en-US') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** A section. `n` is its keyboard digit (D6) and its print anchor. */
function Section({
  n, id, title, kicker, children,
}: {
  n: number; id: string; title: string; kicker?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 break-inside-avoid border border-line bg-card">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line bg-ice-soft px-3 py-2">
        <span className="font-mono text-micro text-grey">{n}</span>
        <h2 className="font-mono text-label font-bold uppercase tracking-wide text-navy">{title}</h2>
        {kicker && <span className="text-micro text-grey">{kicker}</span>}
      </header>
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}

/** Dense table shell. One border style, 11px rows, no zebra — D5. */
function Table({ head, children }: { head: readonly string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-micro">
        <thead>
          <tr className="border-b border-line text-left">
            {head.map((h, i) => (
              <th
                key={h}
                className={clsx(
                  'py-1 pr-3 font-mono text-micro font-semibold uppercase tracking-wide text-grey',
                  i > 0 && 'whitespace-nowrap',
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** A stated refusal or exclusion (D2). Never styled as an error — it is content. */
function Stated({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'warn' | 'block' }) {
  return (
    <p
      className={clsx(
        'border-l-2 px-2 py-1 text-label leading-snug',
        tone === 'block' && 'border-status-blocked bg-status-blocked-bg text-navy',
        tone === 'warn' && 'border-status-conditional bg-status-conditional-bg text-navy',
        tone === 'neutral' && 'border-line bg-ice-soft text-navy',
      )}
    >
      {children}
    </p>
  );
}

/**
 * A rate, or the reason there is not one.
 *
 * THE ANTI-SLOP RENDERER. `pct` is `number | null` on the wire, so this component
 * cannot be written without handling the withheld case, and the withheld case
 * prints the engine's own sentence plus the raw counts. The 95% interval travels
 * BESIDE the point estimate and never inside it (D3) — folding a confidence into
 * a score is the exact defect that made the original mandate formula gameable
 * (`GPS_IMPLEMENTATION_PLAN.md` §1.3).
 */
function Rate({ rate }: { rate: SuppressibleRate }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono tabular-nums text-navy">
          {rate.counts.won} won / {rate.counts.lost} lost
        </span>
        {rate.pct == null ? (
          <Badge status="deferred">rate withheld</Badge>
        ) : (
          <>
            <span className="font-mono text-label font-bold tabular-nums text-navy">{rate.pct}%</span>
            {rate.interval95Pct && (
              <span className="font-mono text-micro tabular-nums text-grey">
                95% CI {rate.interval95Pct.lowPct}–{rate.interval95Pct.highPct}%
              </span>
            )}
          </>
        )}
      </div>
      {rate.suppressed && rate.suppressionReason && (
        <p className="mt-0.5 text-micro leading-snug text-grey">{rate.suppressionReason}</p>
      )}
      {rate.suppressed && !rate.suppressionReason && (
        <p className="mt-0.5 text-micro leading-snug text-grey">
          {rate.n} outcome{rate.n === 1 ? '' : 's'} — too few to express a rate (threshold {rate.minN}).
        </p>
      )}
    </div>
  );
}

/** Offer key → the catalogue's own name. Falls back to the key, never to blank. */
function offerLabel(key: string): string {
  // `getOffer` THROWS on an unknown key by design (`catalogue.ts:438`) so that a
  // quote path cannot silently price at zero. A label is not a quote path, and a
  // partner-supplied or historical key must not blank a review table — so the key
  // itself is the fallback, which is still information.
  try {
    return getOffer(key as Parameters<typeof getOffer>[0]).name;
  } catch {
    return key;
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 12.3 · CALIBRATION HEALTH — the main content, not the caveat                 */
/* ══════════════════════════════════════════════════════════════════════════ */

const VERDICT_TONE: Record<CalibrationHealthView['verdict'], 'ready' | 'conditional' | 'blocked' | 'deferred'> = {
  no_outcomes_at_all: 'deferred',
  nothing_can_be_concluded: 'deferred',
  counts_only: 'conditional',
  pooled_rate_only: 'conditional',
  per_offer_rates_available: 'ready',
};

/**
 * One row per question a reviewer actually asks.
 *
 * `answerable: false` rows are RENDERED AS ROWS, at full contrast, carrying the
 * reason in the answer column — `Conclusion.answer` is never blank and never an
 * em-dash (`loop.ts:757`). Greying them out or filtering them away would turn the
 * most common honest answer into an absence, and an absence reads as "nothing to
 * see here" rather than "we cannot tell".
 */
function ConclusionRow({ c }: { c: Conclusion }) {
  return (
    <tr className="border-t border-line align-top">
      <td className="py-1 pr-3 text-navy">{c.question}</td>
      <td className="py-1 pr-3">
        {c.answerable
          ? <Badge status="ready">answerable</Badge>
          : <Badge status="deferred">cannot conclude</Badge>}
      </td>
      <td className="py-1 pr-3 leading-snug text-navy">
        {c.answer}
        {c.interval95Pct && (
          <span className="ml-1 whitespace-nowrap font-mono tabular-nums text-grey">
            [95% CI {c.interval95Pct.lowPct}–{c.interval95Pct.highPct}%]
          </span>
        )}
      </td>
      <td className="py-1 pr-3 text-right font-mono tabular-nums text-navy">{c.n}</td>
      <td className="py-1 text-right font-mono tabular-nums text-grey">
        {c.threshold == null ? 'n/a' : c.threshold}
      </td>
    </tr>
  );
}

function HealthBlock({ view }: { view: CalibrationHealthView }) {
  const h = view.health;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge status={VERDICT_TONE[view.verdict]}>{view.verdictLabel}</Badge>
        <span className="text-label font-semibold text-navy">{view.headline}</span>
      </div>

      {view.isNothingConcludable && (
        <Stated tone="warn">
          Nothing on this page is concludable at n={h.recordCount}. The rows below state
          what cannot be concluded and why. That is the report — it is not a loading
          state, and it will not resolve by reloading.
        </Stated>
      )}

      {/* The engine's own sentences, verbatim, most important first. These are
          written to be pasted into a review deck without editing, which is the
          only way a caveat ever leaves the codebase (`calibration.ts:868`). */}
      <ul className="space-y-0.5">
        {view.statements.map((s) => (
          <li key={s} className="flex gap-1.5 text-label leading-snug text-navy">
            <span aria-hidden className="text-grey">·</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>

      <Table head={['Question a review will ask', 'Verdict', 'Answer, or the reason there is none', 'n', 'Threshold']}>
        {view.conclusions.map((c) => <ConclusionRow key={c.key} c={c} />)}
      </Table>

      <Table head={['Coverage', 'Value', 'What it gates']}>
        <tr className="border-t border-line">
          <td className="py-1 pr-3 text-navy">Decided outcomes on file</td>
          <td className="py-1 pr-3 text-right"><Num value={h.recordCount} absent="0" /></td>
          <td className="py-1 text-grey">Everything below. {h.wonCount} won, {h.lostCount} lost.</td>
        </tr>
        <tr className="border-t border-line">
          <td className="py-1 pr-3 text-navy">Offers with any decided outcome</td>
          <td className="py-1 pr-3 text-right"><Num value={h.offersWithAnyOutcome} absent="0" /></td>
          <td className="py-1 text-grey">
            Per-offer rates. {h.offersWhereRateCanBeExpressed.length} offer(s) have reached the rate threshold.
          </td>
        </tr>
        <tr className="border-t border-line">
          <td className="py-1 pr-3 text-navy">Engagements with complete margin data</td>
          <td className="py-1 pr-3 text-right"><Num value={h.recordsWithCompleteMarginData} absent="0" /></td>
          <td className="py-1 text-grey">
            Every margin figure on this page. It is the denominator, not a count of engagements.
          </td>
        </tr>
        <tr className="border-t border-line">
          <td className="py-1 pr-3 text-navy">Partners with margin data</td>
          <td className="py-1 pr-3 text-right"><Num value={h.partnersWithMarginData} absent="0" /></td>
          <td className="py-1 text-grey">&ldquo;Which partner leaks margin&rdquo; — the question this desk exists to answer.</td>
        </tr>
        <tr className="border-t border-line">
          <td className="py-1 pr-3 text-navy">Years to the first per-offer rate</td>
          <td className="py-1 pr-3 text-right">
            {view.estimatedYearsToFirstOfferRate == null
              ? <Badge status="ready">reached</Badge>
              : <span className="font-mono tabular-nums text-navy">{view.estimatedYearsToFirstOfferRate}</span>}
          </td>
          <td className="py-1 text-grey">
            At {h.assumedAnnualVolume}/year over the catalogue — {h.assumedAnnualVolumePerOffer}/offer/year if
            demand were even, and it will not be. This converts &ldquo;not enough data&rdquo; into a date.
          </td>
        </tr>
      </Table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 12.1 · OUTCOME CAPTURE — the form at close, evaluated by the engine           */
/* ══════════════════════════════════════════════════════════════════════════ */

const FIELD_STATUS_BADGE: Record<
  OutcomeCaptureForm['fields'][number]['status'],
  { tone: 'ready' | 'conditional' | 'blocked' | 'deferred' | 'unverified'; label: string }
> = {
  recorded: { tone: 'ready', label: 'recorded' },
  missing: { tone: 'blocked', label: 'missing' },
  // NOT "missing". A lost engagement has no realised price, and rendering that as a
  // gap trains the reader to ignore gaps (`loop.ts:243`).
  not_applicable: { tone: 'deferred', label: 'not applicable' },
  // NOT an operator failing — a fact about the world. `marginRealisation` already
  // counts these separately as `excludedIncompleteRealisation` (`calibration.ts:557`).
  awaiting_external_event: { tone: 'conditional', label: 'awaiting external event' },
  // The honest one. These two fields are stored and NOTHING summarises them
  // (`calibration.ts:150`). Saying so on the form is the only way the operator
  // learns it before inferring that a dashboard exists.
  recorded_not_aggregated: { tone: 'unverified', label: 'recorded, not aggregated' },
};

const COMPLETENESS: Record<OutcomeCaptureForm['completeness'], { tone: 'ready' | 'conditional' | 'blocked' | 'deferred'; label: string }> = {
  empty: { tone: 'deferred', label: 'Nothing captured' },
  blocked: { tone: 'blocked', label: 'Blocked — cannot become a record' },
  ready_awaiting_realisation: { tone: 'conditional', label: 'Recordable, realisation still open' },
  complete: { tone: 'ready', label: 'Complete' },
};/** Integer cents ⇄ a dollars field. Rounds to the cent; never floats a total. */
function centsToInput(c: number | null): string {
  return c == null ? '' : (c / 100).toFixed(2);
}
function inputToCents(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  // NaN becomes null, not 0. An unparseable price must read as "not stated" —
  // zero is a real realised price (a written-off engagement) and the two must
  // never collapse.
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * 12.1 — the form he fills at close.
 *
 * ═══ EVERY VERDICT ON THIS FORM COMES FROM THE SERVER ═══
 * The browser holds the draft and NOTHING ELSE. Blockers, per-field status, legal
 * reason options, completeness and the derived margins are all read off the
 * `OutcomeCaptureForm` the API returns — including on a REFUSAL, because
 * `POST /v1/gps/loop/outcome` answers 422 with the whole form so the reasons travel
 * with the refusal instead of a toast saying "invalid" (D2). A second copy of
 * `won_before_acceptance` living in this file would drift from the engine the first
 * time either side changed, and the drifting copy would be the one the operator saw.
 *
 * ═══ THE TABLE DOES NOT EXIST YET, AND THE FORM SAYS SO WHEN IT LEARNS ═══
 * `gps_outcome` arrives in the outcome migration, which nobody has applied and whose FILENAME comes from the server. The
 * server answers 503 with the migration named AND the accepted form attached, so the
 * operator can see that their entry was fine and the only missing thing is one file.
 * The screen renders that as a stated absence, never as a generic failure — and it
 * does not pre-emptively disable the control, because "we cannot store this yet" is a
 * fact about the environment that the environment should report, not a guess this
 * page makes on every load.
 *
 * ═══ WHAT THIS FORM WILL NOT DO ═══
 *  · It does not default realised price to the quoted price. The engine refuses that
 *    (`loop.ts:360`) and so does the field: it opens EMPTY. The default is
 *    superficially reasonable and would destroy `priceSlippageMeanCents` by
 *    construction — every engagement would show zero discount, and the one number
 *    that tells the founder whether he is discounting under pressure would read zero
 *    forever.
 *  · It does not let the quoted price or quoted partner cost be edited. They were
 *    fixed at proposal time; re-typing them at close is how the quoted side of every
 *    slippage number gets quietly rewritten to match the realised one.
 *  · `acceptanceFirstPass` is a THREE-valued control. Null and false are opposite
 *    facts — "not delivered" versus "failed first pass" — and a checkbox can only
 *    express one of them.
 *  · `factorScoresAtQuote` is not typeable here. It is a snapshot against a versioned
 *    scorer, and a review of "did the prior discriminate" is meaningless if the
 *    inputs can be hand-entered after the fact.
 *  · No file, no attachment, no location field. Decision D2 is unanswered.
 */
function CaptureBlock({
  initial, engagementId, driversOpen,
}: { initial: OutcomeCaptureForm | null; engagementId?: string; driversOpen: boolean }) {
  const [form, setForm] = useState<OutcomeCaptureForm | null>(initial);
  const [draft, setDraft] = useState<OutcomeCaptureDraft | null>(initial?.draft ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OutcomeSubmission | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  useEffect(() => {
    setForm(initial);
    setDraft(initial?.draft ?? null);
    setResult(null);
    setFailure(null);
  }, [initial]);

  const patch = useCallback((p: Partial<OutcomeCaptureDraft>) => {
    setDraft((d) => (d == null ? d : { ...d, ...p }));
  }, []);

  const submit = useCallback(async () => {
    if (!engagementId || draft == null) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const r = await recordGpsOutcome(engagementId, draft);
      setResult(r);
      // The server's form replaces the local view in every arm, including the
      // refusals. The browser's opinion of this draft is never displayed.
      if (r.form) setForm(r.form);
    } catch (e) {
      setFailure(e);
    } finally {
      setSubmitting(false);
    }
  }, [engagementId, draft]);

  if (!form || !draft) {
    return (
      <div className="space-y-2">
        <Stated>
          No engagement named, so no capture form. This block is per-engagement; the health,
          win/loss, margin, review and monitor blocks are book-wide and do not depend on one
          (<span className="font-mono">LoopResponse.capture</span> is legitimately null, not omitted).
        </Stated>
        <p className="text-label leading-snug text-grey">
          Open this page from an engagement to get its close checklist. Without one, the page still
          answers the only question that matters at this volume: what can and cannot be concluded.
        </p>
      </div>
    );
  }

  const s = form.subject;
  const c = COMPLETENESS[form.completeness];
  const dispositionField = form.fields.find((f) => f.key === 'disposition');
  const dispositionOptions = dispositionField?.options ?? ['won', 'lost'];
  const lost = draft.disposition === 'lost';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-micro">
        <Badge status={c.tone}>{c.label}</Badge>
        <span className="text-navy">{form.headline}</span>
        <span className="font-mono text-grey">
          {offerLabel(s.offerKey)} · engagement {s.engagementId} · status {s.status}
        </span>
      </div>

      <Stated>
        This is the input Phase 7&rsquo;s distributions depend on. Until an outcome is recorded here it
        is not in <span className="font-mono">winLossSummary</span>, not in{' '}
        <span className="font-mono">marginRealisation</span>, and not in the review packet — so every
        &ldquo;nothing can be concluded&rdquo; on this page traces back to this form not having been
        filled, rather than to anything about the business.
      </Stated>

      {/* ── The draft. Ten fields, one of them not typeable, none of them defaulted ── */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
        <Select
          label="Won or lost"
          value={draft.disposition ?? ''}
          onChange={(e) => patch({
            disposition: (e.target.value || null) as OutcomeCaptureDraft['disposition'],
            // Changing the disposition invalidates the reason: the vocabularies do not
            // overlap, and silently keeping a win reason on a loss is how
            // `reason_invalid_for_disposition` becomes a mystery instead of a decision.
            reason: null,
          })}
          options={[{ value: '', label: 'not stated' }, ...dispositionOptions.map((o) => ({ value: o, label: o }))]}
        />
        <Select
          label="Reason (closed vocabulary)"
          value={draft.reason ?? ''}
          disabled={form.reasonOptions == null}
          onChange={(e) => patch({ reason: (e.target.value || null) as OutcomeCaptureDraft['reason'] })}
          options={[
            {
              value: '',
              // D2 — the disabled state explains itself rather than sitting there greyed.
              label: form.reasonOptions == null ? 'choose won or lost first' : 'not stated',
            },
            ...(form.reasonOptions ?? []).map((o) => ({ value: o, label: o })),
          ]}
        />
        <Input
          label="Decision date"
          type="date"
          value={draft.decidedAt ?? ''}
          onChange={(e) => patch({ decidedAt: e.target.value || null })}
        />
        <Input
          label={lost ? 'Realised price — n/a on a loss' : 'Realised price invoiced ($)'}
          type="number"
          step="0.01"
          placeholder="empty until invoiced"
          value={centsToInput(draft.realisedPriceCents)}
          onChange={(e) => patch({ realisedPriceCents: inputToCents(e.target.value) })}
        />
        <Input
          label="Realised partner cost, as the partner invoiced ($)"
          type="number"
          step="0.01"
          placeholder="empty until the partner bills"
          value={centsToInput(draft.realisedVendorCostCents)}
          onChange={(e) => patch({ realisedVendorCostCents: inputToCents(e.target.value) })}
        />
        <Input
          label="Delivering partner"
          type="text"
          placeholder="blank = unstaffed or in-house"
          value={draft.partner ?? ''}
          onChange={(e) => patch({ partner: e.target.value || null })}
        />
        <Input
          label="Cycle time, days (stored, not aggregated)"
          type="number"
          step="1"
          min="0"
          value={draft.cycleTimeDays == null ? '' : String(draft.cycleTimeDays)}
          onChange={(e) => {
            const n = Number(e.target.value);
            patch({ cycleTimeDays: e.target.value.trim() === '' || !Number.isFinite(n) ? null : Math.round(n) });
          }}
        />
        <Select
          label="Accepted first pass (null ≠ false)"
          value={draft.acceptanceFirstPass == null ? '' : String(draft.acceptanceFirstPass)}
          onChange={(e) => patch({
            acceptanceFirstPass: e.target.value === '' ? null : e.target.value === 'true',
          })}
          options={[
            { value: '', label: 'not delivered / not known' },
            { value: 'true', label: 'yes — accepted without rework' },
            { value: 'false', label: 'no — rework round required' },
          ]}
        />
        <div className="text-micro leading-snug text-grey">
          <div className="mb-1 text-sm font-medium text-navy">Factor scores at quote time</div>
          {draft.factorScoresAtQuote
            ? <span className="font-mono text-navy">snapshotted — {Object.keys(draft.factorScoresAtQuote).length} factor(s)</span>
            : <span>absent — this engagement predates scoring.</span>}
          {' '}Not editable here by design: a snapshot that can be hand-entered after the decision
          cannot support a review of whether the prior discriminated.
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button onClick={submit} disabled={submitting || !engagementId}>
          {submitting ? 'Recording…' : 'Record the outcome'}
        </Button>
        <span className="text-micro leading-snug text-grey">
          Recorded against the signed-in operator, idempotently — the engagement id is the primary
          key, so re-submitting a close corrects the row rather than double-counting the book.
        </span>
      </div>

      {result?.outcome === 'recorded' && (
        <Stated tone="neutral">Recorded. Reload the page for the aggregates to include it.</Stated>
      )}
      {result?.outcome === 'blocked' && (
        <Stated tone="warn">
          Nothing was written. These facts do not yet constitute a record — the reasons are below,
          each with the field to fix.
        </Stated>
      )}
      {result?.outcome === 'store_missing' && (
        <Stated tone="block">
          <strong>Your entry was acceptable. The table does not exist.</strong>{' '}
          <span className="font-mono">gps_outcome</span> arrives in{' '}
          {/* The filename comes from the SERVER (`data.migration.file`). When it does
              not, say so — a guessed number sent an operator to look for a migration
              that was already applied, which reads as "the API is lying to me". */}
          <span className="font-mono">{result.migration ?? 'a migration the server did not name'}</span>{' '}
          and nobody has applied it on this
          environment, so nothing was written and nothing was lost — the remedy is to run one file,
          not to re-enter this. Until it is applied,{' '}
          <strong>every aggregate on this page rests on zero readable outcomes</strong>, which is a
          different statement from an empty book.
        </Stated>
      )}
      {failure != null && <ErrorNotice error={failure} />}

      {/* D2/D4 — the engine argues back, with a reason and a field, never a disabled
          button and never a toast. `won_before_acceptance` is the one that earns its
          keep: at $10–25k the difference between a verbal yes and an accepted proposal
          is the whole basis of the deposit leg. */}
      {form.blockers.length > 0 && (
        <ul className="space-y-1">
          {form.blockers.map((b) => (
            <li key={b.code}>
              <Stated tone="warn">
                <span className="font-mono text-micro">{b.code}</span> — {b.message}
                {b.field && <span className="text-grey"> (field: {b.field})</span>}
              </Stated>
            </li>
          ))}
        </ul>
      )}

      <Table head={['Field', 'Status', 'What is degraded while this is empty', 'Closed vocabulary']}>
        {form.fields.map((f) => {
          const badge = FIELD_STATUS_BADGE[f.status];
          return (
            <tr key={f.key} className="border-t border-line align-top">
              <td className="py-1 pr-3 text-navy">
                {f.label}
                {f.requiredForRecord && <span className="ml-1 text-status-blocked" title="required for a record">*</span>}
              </td>
              <td className="py-1 pr-3"><Badge status={badge.tone}>{badge.label}</Badge></td>
              <td className="py-1 pr-3 leading-snug text-grey">
                {f.consequenceIfAbsent ?? 'Nothing downstream depends on it.'}
              </td>
              <td className="py-1 font-mono leading-snug text-grey">
                {f.options ? f.options.join(' · ') : 'free value'}
              </td>
            </tr>
          );
        })}
      </Table>

      <Table head={['Money at close', 'Amount', 'Note']}>
        <tr className="border-t border-line">
          <td className="py-1 pr-3 text-navy">Quoted margin</td>
          <td className="py-1 pr-3 text-right"><SignedCents value={form.quotedMarginCents} /></td>
          <td className="py-1 text-grey">
            Price {cents(s.quotedPriceCents)} − partner cost {cents(s.quotedVendorCostCents)}. Both are
            read-only: re-typing them at close is how the quoted side of every slippage number gets
            rewritten to match the realised one.
          </td>
        </tr>
        <tr className="border-t border-line">
          <td className="py-1 pr-3 text-navy">Realised margin</td>
          <td className="py-1 pr-3 text-right"><SignedCents value={form.realisedMarginCents} /></td>
          <td className="py-1 text-grey">Null, never 0, until both realised figures exist.</td>
        </tr>
        <tr className="border-t border-line">
          <td className="py-1 pr-3 text-navy">Margin slippage</td>
          <td className="py-1 pr-3 text-right"><SignedCents value={form.marginSlippageCents} /></td>
          <td className="py-1 text-grey">Signed. Negative means margin was given away.</td>
        </tr>
      </Table>

      {form.missingForMarginRealisation.length > 0 && (
        <Stated tone="warn">
          Excluded from every margin number until these arrive:{' '}
          <span className="font-mono">{form.missingForMarginRealisation.join(', ')}</span>. That exclusion
          is counted as <span className="font-mono">excludedIncompleteRealisation</span> and is a hole in
          the mean, not a zero in it.
        </Stated>
      )}

      <Drivers label="Open the capture figures" drivers={form.openNumbers} open={driversOpen} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* WIN / LOSS — counts, and no percentage below the threshold                   */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The load state of a detail fetch that the loop response does not carry.
 *
 * This is UI STATE, not a response shape — the payloads themselves are
 * `WinLossSummary` and `MarginRealisation` from `@lcx/shared`, unmodified. The
 * distinction matters: a hand-written response interface is the defect that
 * crashed this compartment in production (`lib/api/gps.ts:83`), whereas a
 * three-state loader is a fact about the browser.
 *
 * `unavailable` exists because `GET /v1/gps/win-loss` and
 * `GET /v1/gps/margin-realisation` are NOT registered yet. When they 404 the block
 * says which route is missing and which already-tested engine function would serve
 * it, rather than rendering an empty table that reads as "no losses".
 */
type Detail<T> =
  | { status: 'loading' }
  | { status: 'ok'; value: T }
  | { status: 'unavailable'; reason: string };

function WinLossBlock({
  pooled, detail,
}: { pooled: SuppressibleRate; detail: Detail<WinLossSummary> }) {
  return (
    <div className="space-y-2">
      <div className="border border-line px-2 py-1.5">
        <div className="font-mono text-micro uppercase tracking-wide text-grey">Pooled, all offers</div>
        <Rate rate={pooled} />
        <p className="mt-1 text-micro leading-snug text-grey">
          Pooled reaches the threshold long before any single offer does, which is why it is
          reported separately rather than as a headline that stands in for the five below.
        </p>
      </div>

      {detail.status === 'loading' && <p className="text-label text-grey">Loading per-offer counts…</p>}

      {detail.status === 'unavailable' && (
        <Stated tone="warn">
          Per-offer counts are not on the wire. {detail.reason} The engine exists and is tested:{' '}
          <span className="font-mono">winLossSummary(records)</span> returns a row for EVERY offer including
          offers with zero outcomes (<span className="font-mono">calibration.ts:345</span>) — a missing row is
          invisible, whereas &ldquo;0 won / 0 lost&rdquo; is the finding that an offer has never been decided.
          This block is empty because a route is unregistered, not because there are no losses.
        </Stated>
      )}

      {detail.status === 'ok' && (
        <Table head={['Offer', 'Counts and rate', 'Top loss reasons', 'Top win reasons']}>
          {detail.value.byOffer.map((r: WinLossRow) => (
            <tr key={r.offerKey} className="border-t border-line align-top">
              <td className="py-1 pr-3 text-navy">{offerLabel(r.offerKey)}</td>
              <td className="py-1 pr-3"><Rate rate={{
                pct: r.winRatePct,
                n: r.sampleSize,
                minN: detail.value.minNForRate,
                suppressed: r.rateSuppressed,
                suppressionReason: r.suppressionReason,
                interval95Pct: r.interval95Pct,
                counts: { won: r.won, lost: r.lost },
              }} /></td>
              <td className="py-1 pr-3 font-mono leading-snug text-grey">
                {r.topLossReasons.length === 0
                  ? 'no losses recorded'
                  : r.topLossReasons.map((x) => `${x.reason} ×${x.count}`).join(' · ')}
              </td>
              <td className="py-1 font-mono leading-snug text-grey">
                {r.topWinReasons.length === 0
                  ? 'no wins recorded'
                  : r.topWinReasons.map((x) => `${x.reason} ×${x.count}`).join(' · ')}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* MARGIN REALISATION — quoted vs realised, signed, with the dispersion         */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * One margin group — an offer, a partner, or the pooled total.
 *
 * THE SIGN IS THE ENTIRE MESSAGE (`calibration.ts:459`). Slippage renders signed
 * and red when negative, and there is no `Math.abs` anywhere on this page: a
 * partner who overran by $3,000 must not read the same as one who came in $3,000
 * under. `priceSlippage` and `costSlippage` are shown side by side so a review can
 * say "we discounted" versus "the partner overran" instead of only "margin was
 * down" — the two have completely different remedies and only one of them is the
 * partner's fault.
 *
 * VARIANCE IS NULL AT n=1 and prints as "n=1, no dispersion". One overrun is an
 * anecdote and the engine refuses to dress it as a trend; so does this row.
 */
function MarginRow({ g, label }: { g: MarginGroup; label: string }) {
  return (
    <tr className="border-t border-line align-top">
      <td className="py-1 pr-3 text-navy">{label}</td>
      <td className="py-1 pr-3 text-right font-mono tabular-nums text-navy">{g.n}</td>
      <td className="py-1 pr-3 text-right"><SignedCents value={g.quotedMarginMeanCents} /></td>
      <td className="py-1 pr-3 text-right"><SignedCents value={g.realisedMarginMeanCents} /></td>
      <td className="py-1 pr-3 text-right"><SignedCents value={g.slippageMeanCents} /></td>
      <td className="py-1 pr-3 text-right">
        {g.slippageStdDevCents == null
          ? <span className="font-mono text-grey">n={g.n}, no dispersion</span>
          : <span className="font-mono tabular-nums text-navy">±{cents(g.slippageStdDevCents)}</span>}
      </td>
      <td className="py-1 pr-3 text-right"><SignedCents value={g.worstSlippageCents} /></td>
      <td className="py-1 pr-3 text-right font-mono">
        <SignedCents value={g.priceSlippageMeanCents} />
        <span className="text-grey"> / </span>
        <SignedCents value={g.costSlippageMeanCents} />
      </td>
      <td className="py-1 text-right">
        {g.negativeRealisedMarginCount > 0
          ? <Badge status="blocked">{g.negativeRealisedMarginCount} at a loss</Badge>
          : <span className="font-mono text-grey">0</span>}
      </td>
    </tr>
  );
}

const MARGIN_HEAD = [
  'Group', 'n', 'Quoted margin', 'Realised margin', 'Slippage',
  '± std dev', 'Worst', 'Price / cost slippage', 'Delivered at a loss',
] as const;

function MarginBlock({ detail }: { detail: Detail<MarginRealisation> }) {
  if (detail.status === 'loading') {
    return <p className="text-label text-grey">Loading margin realisation…</p>;
  }
  if (detail.status === 'unavailable') {
    return (
      <Stated tone="warn">
        Quoted-versus-realised margin is not on the wire. {detail.reason} The engine exists and is
        tested: <span className="font-mono">marginRealisation(records)</span> returns{' '}
        <span className="font-mono">byOffer</span>, <span className="font-mono">byPartner</span> (worst mean
        slippage first — it is an action list, and the partner who quotes accurately does not need
        attention), the signed dispersion, and{' '}
        <span className="font-mono">offersWithNoRealisationData</span>, which is itself the finding in the
        first quarter. Nothing in the 47 migrations before `0047_gps.sql` tracked cost at all, so this is
        the first margin measurement this platform has ever been able to make — and it is one route away.
      </Stated>
    );
  }

  const m = detail.value;
  const anyData = m.overall != null;

  return (
    <div className="space-y-2">
      {!anyData && (
        <Stated>
          No engagement has both a realised price and a realised partner cost, so no margin is
          measurable. Not zero margin — unmeasured margin. {m.excludedIncompleteRealisation} won
          engagement(s) are waiting on a realised figure and {m.excludedLost} lost engagement(s) never had
          one (a loss realises no margin; it is not a data gap).
        </Stated>
      )}

      <Table head={MARGIN_HEAD}>
        {m.overall && <MarginRow g={m.overall} label="ALL (pooled)" />}
        {m.byOffer.map((g) => <MarginRow key={`o:${g.key}`} g={g} label={`offer · ${offerLabel(g.key)}`} />)}
        {m.byPartner.map((g) => <MarginRow key={`p:${g.key}`} g={g} label={`partner · ${g.key}`} />)}
      </Table>

      <div className="grid gap-1 text-micro leading-snug text-grey sm:grid-cols-2">
        <p>
          <span className="font-mono text-navy">{m.excludedIncompleteRealisation}</span> won engagement(s)
          excluded — realised figure still null. This is a hole in every mean above, not a zero in it.
        </p>
        <p>
          <span className="font-mono text-navy">{m.excludedLost}</span> lost engagement(s) excluded. No
          margin was realised on them; they are not a data gap.
        </p>
        {m.offersWithNoRealisationData.length > 0 && (
          <p className="sm:col-span-2">
            Blind spots, named:{' '}
            <span className="font-mono text-navy">
              {m.offersWithNoRealisationData.map(offerLabel).join(', ')}
            </span>{' '}
            have zero complete engagements. The list is the finding.
          </p>
        )}
        <p className="sm:col-span-2">
          Partners are ordered worst mean slippage first, as the engine returns them. The screen does not
          re-sort: this is an action list, not a league table.
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 12.2 · THE REVIEW PACKET — informs a human, applies nothing                  */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The quarterly packet.
 *
 * THERE IS NO CONTROL ON THIS BLOCK THAT ADJUSTS A WEIGHT, and there is no
 * disabled one either — a greyed-out "Apply" implies the capability exists and is
 * merely gated, which is a different and worse lie than silence. The type makes the
 * proposal untypeable (`proposedWeightChanges: never[]`), and this renderer prints
 * `weightChangeMechanism` so the reader learns the actual path: a human edits
 * `WEIGHTS_V1` in `targeting.ts` and says why in the commit.
 *
 * `insufficient_evidence` ROWS ARE RENDERED AT FULL CONTRAST. The engine surfaces
 * `insufficientEvidence` as its own flag specifically so a table can show them as
 * rows (`loop.ts:578`); greying them out turns the most common honest answer into
 * an absence. In most quarters this block's headline number IS the insufficient
 * count, and that is a result rather than a failure to produce one.
 */
function ReviewBlock({ review, driversOpen }: { review: ReviewPacket; driversOpen: boolean }) {
  const p = review.packet;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {review.noFactorReviewable
          ? <Badge status="deferred">No factor reviewable</Badge>
          : <Badge status="conditional">{review.insufficientEvidenceCount} of {review.rows.length} insufficient</Badge>}
        <span className="text-label text-navy">{review.headline}</span>
      </div>

      <Stated>
        <strong>Nothing here is applied.</strong> Weights are a stated prior, not a fitted parameter, and the
        only mechanism by which one ever changes is: {review.weightChangeMechanism}. Fitted weights would be
        self-fulfilling — the score decides who gets pursued, and therefore generates the data that confirms
        it. Human review required: {String(p.humanReviewRequired)}. Auto-adjustment applied:{' '}
        {String(p.autoAdjustmentApplied)}. Proposed changes: {review.proposedWeightChanges.length}.
      </Stated>

      <Table head={[
        'Factor', 'Verdict', 'n won', 'n lost', `min n / arm (${review.minStandardisedSeparation} σ)`, 'How the row was produced',
      ]}>
        {review.rows.map((r) => (
          <tr key={r.factor} className="border-t border-line align-top">
            <td className="py-1 pr-3 text-navy">
              {r.label}
              <Drivers label="figures" drivers={r.openNumbers} open={driversOpen} />
            </td>
            <td className="py-1 pr-3">
              {r.insufficientEvidence
                ? <Badge status="deferred">{r.verdictLabel}</Badge>
                : <Badge status="unverified">{r.verdictLabel}</Badge>}
            </td>
            <td className="py-1 pr-3 text-right font-mono tabular-nums text-navy">{r.nWon}</td>
            <td className="py-1 pr-3 text-right font-mono tabular-nums text-navy">{r.nLost}</td>
            <td className="py-1 pr-3 text-right font-mono tabular-nums text-grey">{r.minNPerArm}</td>
            <td className="py-1 leading-snug text-grey">{r.formula}</td>
          </tr>
        ))}
      </Table>

      {review.rows.length === 0 && (
        <Stated tone="warn">
          The packet has no factor rows at all. No outcome on file carries the quote-time factor scores the
          review needs — those are snapshotted, never re-derived, because a review of &ldquo;did the prior
          discriminate&rdquo; is meaningless if the inputs have been silently recomputed under a newer
          definition of the scoring code.
        </Stated>
      )}

      <p className="text-micro leading-snug text-grey">
        <span className="font-mono text-navy">{p.recordsMissingFactorScores}</span> outcome(s) predate
        scoring and are counted as ABSENT evidence, never as a zero score. Verdict spread:{' '}
        <span className="font-mono">
          {Object.entries(review.verdictCounts).map(([k, v]) => `${k}=${v}`).join(' · ')}
        </span>
      </p>

      {review.caveats.length > 0 && (
        <ul className="space-y-0.5">
          {review.caveats.map((c) => (
            <li key={c} className="flex gap-1.5 text-micro leading-snug text-grey">
              <span aria-hidden>·</span><span>{c}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 12.4 · MONITORS ON THE BOOK — definitions, and what each one still needs     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Five specifications, none of them running.
 *
 * `METRIC_SQL` whitelists nine metrics, all about tracked assets, and the
 * evaluator's query joins the asset tables (`apps/api/src/intel/monitors.ts`).
 * There is no GPS subject type and no GPS metric, so NOTHING here can be
 * registered today — and each row prints `wiringRequired`, which names precisely
 * what a human must add. A spec rendered as an active watch would be the exact
 * defect this programme was called in to fix.
 *
 * Three of the five are additionally blocked on figures nobody has supplied — a
 * margin floor, a real bench, a perimeter-review date. Those stay disabled on
 * purpose: an alert compared against a placeholder is worse than no alert, because
 * it teaches the reader to dismiss the channel.
 */
function MonitorsBlock({
  specs, registerable,
}: { specs: readonly BookMonitorSpec[]; registerable: readonly string[] }) {
  const reg = new Set(registerable);
  return (
    <div className="space-y-2">
      <Stated tone="warn">
        None of these is registered and none has ever fired. They are definitions held as code constants.
        Every one proposes to a human and none acts:{' '}
        <span className="font-mono">mutatesState=false</span>,{' '}
        <span className="font-mono">requiresHumanAction=true</span>, and there is no{' '}
        <span className="font-mono">execute</span> field for one to hide in.{' '}
        <strong>{reg.size} of {specs.length}</strong> could be registered enabled once the metric exists.
      </Stated>

      <Table head={['Monitor', 'Condition', 'What it asks a human to decide', 'Registerable', 'Still to wire']}>
        {specs.map((s) => (
          <tr key={s.key} className="border-t border-line align-top">
            <td className="py-1 pr-3 text-navy">
              {s.name}
              <div className="text-micro text-grey">{s.subjectType}</div>
            </td>
            <td className="py-1 pr-3 leading-snug text-navy">
              {s.condition.reads}
              <div className="mt-0.5 font-mono text-micro text-grey">
                {s.condition.metric} {s.condition.op} {s.condition.threshold}
              </div>
            </td>
            <td className="py-1 pr-3 leading-snug text-grey">
              <span className="font-mono text-navy">{s.proposes.actionId}</span> — {s.proposes.decisionRequested}
              <div className="mt-0.5">{s.why}</div>
            </td>
            <td className="py-1 pr-3">
              {s.blockedOnPlaceholders
                ? <Badge status="blocked">blocked on placeholders</Badge>
                : reg.has(s.key)
                  ? <Badge status="conditional">once metric exists</Badge>
                  : <Badge status="deferred">not yet</Badge>}
              <div className="mt-0.5 font-mono text-micro text-grey">
                enabled on registration: {String(s.enabledOnRegistration)}
              </div>
            </td>
            <td className="py-1 leading-snug text-grey">
              {s.wiringRequired.length === 0 ? 'nothing' : (
                <ul className="space-y-0.5">
                  {s.wiringRequired.map((w) => <li key={w}>· {w}</li>)}
                </ul>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 12.5 · THE WBR BLOCK — the book's week, printed (D7)                         */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The week, as it would appear on paper.
 *
 * `lines` IS THE ARTIFACT. Each is a sentence with its n attached, written by the
 * engine so that the n cannot be dropped in the retelling — the failure mode being
 * defended against is a rate arriving on a slide with no n beside it
 * (`calibration.ts:872`). The structured figures beside it are for the screen; the
 * list is what gets pasted into the review.
 *
 * WIP IS FIRST-CLASS because coordination hours are the real ceiling: partners
 * deliver, the founder sells and coordinates around a full-time LCX job. When the
 * hours are placeholders that is PRINTED rather than hidden — a utilisation
 * percentage computed from a capacity nobody supplied is a number that will be
 * quoted in a meeting.
 */
function WbrBlock({ wbr }: { wbr: WbrGpsBlock }) {
  const w = wbr.wip;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-micro text-grey">
        <span>week of {wbr.weekStart}</span>
        <span>composed {wbr.generatedAt}</span>
        <span className="text-navy">
          decided this week: {wbr.decidedThisWeek.won} won / {wbr.decidedThisWeek.lost} lost
        </span>
      </div>

      {/* The printable artifact. `whitespace-pre-line` so the engine's own line
          breaks survive; no reflowing, no editorialising. */}
      <ol className="space-y-0.5 border border-line bg-ice-soft px-2 py-1.5">
        {wbr.lines.map((l) => (
          <li key={l} className="whitespace-pre-line text-label leading-snug text-navy">{l}</li>
        ))}
      </ol>

      <Table head={['This week', 'Value', 'Note']}>
        <tr className="border-t border-line">
          <td className="py-1 pr-3 text-navy">Cumulative pooled win rate</td>
          <td className="py-1 pr-3"><Rate rate={wbr.pooledWinRate} /></td>
          <td className="py-1 text-grey">
            {wbr.offersWithExpressibleRate.length === 0
              ? 'No single offer has reached the rate threshold, so no per-offer rate is quoted anywhere in this review.'
              : `Expressible per offer: ${wbr.offersWithExpressibleRate.map(offerLabel).join(', ')}.`}
          </td>
        </tr>
        <tr className="border-t border-line">
          <td className="py-1 pr-3 text-navy">Mean margin slippage</td>
          <td className="py-1 pr-3"><SignedCents value={wbr.marginSlippageMeanCents} /></td>
          <td className="py-1 text-grey">
            Signed — negative is margin given away. {wbr.awaitingRealisedFigures} won engagement(s) are
            still missing a realised figure, which is the hole in this mean.
          </td>
        </tr>
        <tr className="border-t border-line">
          <td className="py-1 pr-3 text-navy">Delivered at a realised loss</td>
          <td className="py-1 pr-3 text-right">
            {wbr.negativeRealisedMarginCount > 0
              ? <Badge status="blocked">{wbr.negativeRealisedMarginCount}</Badge>
              : <span className="font-mono tabular-nums text-navy">0</span>}
          </td>
          <td className="py-1 text-grey">A count, never a rate.</td>
        </tr>
      </Table>

      {w == null ? (
        <Stated>
          No delivery load was supplied, so this review makes no coordination-capacity claim. Coordination
          hours are the real ceiling on this business and an invented utilisation figure is worse than none.
        </Stated>
      ) : (
        <>
          <Table head={['Coordination load', 'Value', 'Note']}>
            <tr className="border-t border-line">
              <td className="py-1 pr-3 text-navy">Active / blocked / awaiting collection / unstaffable</td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums text-navy">
                {w.active} / {w.blocked} / {w.awaitingCollection} / {w.unstaffable}
              </td>
              <td className="py-1 text-grey">WIP is a first-class number because coordination hours are the ceiling.</td>
            </tr>
            <tr className="border-t border-line">
              <td className="py-1 pr-3 text-navy">Coordination hours / week vs capacity</td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums text-navy">
                {w.coordinationHoursPerWeek} / {w.capacityHoursPerWeek}
              </td>
              <td className="py-1 text-grey">
                {w.utilisationPct == null
                  ? 'Utilisation not expressible.'
                  : `Utilisation ${w.utilisationPct}%.`}{' '}
                {w.overCapacity && <span className="font-semibold text-status-blocked">Over capacity.</span>}
              </td>
            </tr>
          </Table>
          {w.usesPlaceholderHours && (
            <Stated tone="warn">
              The coordination hours above are PLACEHOLDERS
              (<span className="font-mono">COORDINATION_HOURS_ARE_PLACEHOLDERS</span>). Nobody has supplied
              the real per-engagement hours or the weekly capacity, so the utilisation figure is arithmetic
              on assumptions and must not be quoted as a measurement.
            </Stated>
          )}
        </>
      )}

      {wbr.caveats.length > 0 && (
        <ul className="space-y-0.5">
          {wbr.caveats.map((c) => (
            <li key={c} className="flex gap-1.5 text-micro leading-snug text-grey">
              <span aria-hidden>·</span><span>{c}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* PROVENANCE (D1) — rows, formula, grade, timestamp, and the named absences     */
/* ══════════════════════════════════════════════════════════════════════════ */

const GRADE_LABEL: Record<LoopDataSource['sourceGrade'], string> = {
  operator_entered: 'operator entered — a human typed it, nothing verified it',
  code_constant: 'code constant — held in source, not in a table',
  derived: 'derived — computed from operator-entered rows',
};

function ProvenanceBlock({ sources }: { sources: readonly LoopDataSource[] }) {
  return (
    <Table head={['Block', 'What was read', 'Rows', 'Source grade', 'As of', 'Named absences']}>
      {sources.map((d) => (
        <tr key={d.block} className="border-t border-line align-top">
          <td className="py-1 pr-3 font-mono text-navy">{d.block}</td>
          <td className="py-1 pr-3 leading-snug text-navy">{d.reads}</td>
          <td className="py-1 pr-3 text-right font-mono tabular-nums text-navy">{d.rowCount}</td>
          <td className="py-1 pr-3 leading-snug text-grey">{GRADE_LABEL[d.sourceGrade]}</td>
          <td className="py-1 pr-3 whitespace-nowrap font-mono text-micro text-grey">{d.asOf}</td>
          <td className="py-1 leading-snug text-grey">
            {d.notPresent.length === 0 ? 'none' : (
              <ul className="space-y-0.5">{d.notPresent.map((n) => <li key={n}>· {n}</li>)}</ul>
            )}
          </td>
        </tr>
      ))}
    </Table>
  );
}

/**
 * The volume constraint, stated where it cannot be scrolled past.
 *
 * Rendered from the wire (`LoopVolumeStatement`) rather than hardcoded, because the
 * literal types make `tsc` fail if the engine's constants ever move and this banner
 * would otherwise keep asserting an 8 that is no longer true.
 */
function VolumeBanner({ v }: { v: LoopVolumeStatement }) {
  return (
    <div className="border border-line bg-ice-soft px-3 py-2">
      <p className="text-label leading-snug text-navy">{v.statement}</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-micro text-grey">
        <span>assumed volume {v.assumedAnnualEngagementVolume}/yr</span>
        <span>min n for a rate {v.minNForRate}</span>
        <span>min n per arm {v.minNPerArmForSeparation}</span>
        <span>learns: {String(v.learns)}</span>
        <span>adjusts weights: {String(v.adjustsWeights)}</span>
        <span>trainable dataset: {String(v.isTrainableDataset)}</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE PAGE                                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

const SECTIONS = [
  { n: 1, id: 'loop-health', title: 'Calibration health', kicker: 'what can and cannot be concluded' },
  { n: 2, id: 'loop-capture', title: 'Outcome capture', kicker: 'the record at close' },
  { n: 3, id: 'loop-winloss', title: 'Win / loss', kicker: 'counts, and a rate only above the threshold' },
  { n: 4, id: 'loop-margin', title: 'Margin realisation', kicker: 'quoted vs realised, signed' },
  { n: 5, id: 'loop-review', title: 'Review packet', kicker: 'informs a human, applies nothing' },
  { n: 6, id: 'loop-monitors', title: 'Monitors on the book', kicker: 'definitions, not watches' },
  { n: 7, id: 'loop-wbr', title: 'WBR block', kicker: 'the week, printed' },
  { n: 8, id: 'loop-provenance', title: 'Provenance', kicker: 'rows, grade, timestamp, absences' },
] as const;

/**
 * `engagementId` resolves from the prop, then from `?engagementId=`.
 *
 * The prop exists so a future embed can pass one directly; the query parameter is
 * what makes registering the route sufficient — the desk links here from an
 * engagement, and requiring a router change to pass a param would leave the capture
 * block permanently unreachable. A uuid is opaque and carries no client name, no
 * price and nothing personal, which is the only reason it is allowed in a URL.
 */
export function GpsLoop({ engagementId: engagementIdProp }: { engagementId?: string } = {}) {
  const [searchParams] = useSearchParams();
  const engagementId = engagementIdProp ?? searchParams.get('engagementId') ?? undefined;
  const [loop, setLoop] = useState<LoopResponse | null>(null);
  // Raw, not stringified: `ErrorNotice` classifies the error (offline vs 401 vs 500)
  // and a pre-flattened message would throw that classification away.
  const [error, setError] = useState<unknown>(null);
  const [winLoss, setWinLoss] = useState<Detail<WinLossSummary>>({ status: 'loading' });
  const [margin, setMargin] = useState<Detail<MarginRealisation>>({ status: 'loading' });
  const [driversOpen, setDriversOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    fetchGpsLoop(engagementId)
      .then((r) => { if (live) setLoop(r); })
      .catch((e: unknown) => { if (live) setError(e ?? new Error('unknown failure loading /v1/gps/loop')); });

    /**
     * The two detail fetches DEGRADE, they do not fail the page.
     *
     * `GET /v1/gps/win-loss` and `GET /v1/gps/margin-realisation` are not
     * registered yet (see `lib/api/gpsLoop.ts`). A rejection here must not blank
     * the health, review, monitor and WBR blocks, which are the ones that are
     * useful at n=0 — and it must not render as an empty table either, because an
     * empty win/loss table reads as "no losses". So the reason is captured and
     * printed in the block itself.
     */
    fetchGpsWinLoss()
      .then((v) => { if (live) setWinLoss({ status: 'ok', value: v }); })
      .catch((e: unknown) => {
        if (live) setWinLoss({
          status: 'unavailable',
          reason: `GET /v1/gps/loop/win-loss is not answering (${e instanceof Error ? e.message : String(e)}).`,
        });
      });

    fetchGpsMarginRealisation()
      .then((v) => { if (live) setMargin({ status: 'ok', value: v }); })
      .catch((e: unknown) => {
        if (live) setMargin({
          status: 'unavailable',
          reason: `GET /v1/gps/loop/margin is not answering (${e instanceof Error ? e.message : String(e)}).`,
        });
      });

    return () => { live = false; };
  }, [engagementId]);

  /**
   * D6 — keyboard primary. Digits jump, `d` opens every derivation, `p` prints.
   *
   * NO ESCAPE HANDLER AND NO TAB HANDLER. This app has exactly one owner for each
   * of those keys and it is not this page; adding a second would be the third time
   * that bug shipped. The guard skips any event originating in a field or a
   * contenteditable so a future filter box cannot swallow typing.
   */
  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
    /*
     * ── THE STANDDOWN, ADDED BY PHASE 11 ──────────────────────────────────────
     *
     * Two guards, and neither is defensive:
     *
     * `isOverlayOpen()` — this listener is on `window` for the life of the page, so `p`
     * pressed with a modal up opened the PRINT DIALOG behind the scrim and `d` reshaped a
     * disclosure nobody could see. `GpsDelivery` has had this guard since it shipped and
     * this page did not; the argument is the same one made there.
     *
     * `gpsKeysBelongToSurface()` — a DOCKED pane registers nothing with the dismiss stack
     * on purpose (`lib/split.ts` argues it at length: one entry makes `isOverlayOpen()`
     * true and kills the very keys docking exists to preserve), so `isOverlayOpen()` cannot
     * see it. `⌘\` docks the universal evidence pane over any desk in the app, this one
     * included, which is why this was a live defect and not a hypothetical about a GPS pane
     * that no desk mounts yet.
     */
    if (isOverlayOpen()) return;
    if (!gpsKeysBelongToSurface()) return;

    const digit = SECTIONS.find((s) => String(s.n) === e.key);
    if (digit) {
      document.getElementById(digit.id)?.scrollIntoView({ block: 'start' });
      return;
    }
    if (e.key === 'd') setDriversOpen((v) => !v);
    if (e.key === 'p') window.print();
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const pooled = useMemo(() => loop?.wbr.pooledWinRate ?? null, [loop]);

  if (error != null) {
    return (
      <div className="space-y-3">
        <PageTitle subtitle="Outcome capture, calibration health, and the quarterly review packet">
          Global Services · The Loop
        </PageTitle>
        <ErrorNotice error={error} />
      </div>
    );
  }
  if (!loop || pooled == null) return <PageSkeleton />;

  return (
    <div ref={rootRef} className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PageTitle subtitle="Outcome capture, calibration health, and the quarterly review packet — with the refusals kept in">
          Global Services · The Loop
        </PageTitle>
        <div className="flex shrink-0 items-center gap-2 print:hidden">
          <span className="font-mono text-micro text-grey">as of {loop.asOf}</span>
          <Button variant="secondary" onClick={() => setDriversOpen((v) => !v)}>
            {driversOpen ? 'Collapse derivations (d)' : 'Expand all derivations (d)'}
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>Print (p)</Button>
        </div>
      </div>

      <VolumeBanner v={loop.volume} />

      {/* WHAT THE READS DECLARE ABOUT THEMSELVES, above every figure they produced.
          The loop's `meta` is the only place three facts travel: `migrated`,
          `outcomeStoreMigrated` and `pendingMigration` (routes/gpsLoop.ts:170, :311).
          Without them a calibration page served from an environment with no outcome
          store printed rates, factor verdicts and a review packet over ZERO records
          and looked identical to a page served from a full one — the exact reading a
          calibration surface must never allow. The two detail reads are included
          because a win-rate carries the same obligation. */}
      <GpsMetaBanner
        className="mt-0"
        of={[
          loop,
          winLoss.status === 'ok' ? winLoss.value : null,
          margin.status === 'ok' ? margin.value : null,
        ]}
      />

      {/* D2 — top-level refusals and exclusions, before any figure. These are not a
          footer: the survivorship-bias disclosure in particular changes how every
          number below should be read, and a caveat under the fold is a caveat that
          never travelled. */}
      <ul className="space-y-1">
        {loop.notices.map((n) => (
          <li key={n}><Stated tone={n.includes('n=') ? 'warn' : 'neutral'}>{n}</Stated></li>
        ))}
      </ul>

      {/* Section index. Doubles as the D6 key legend, so the shortcuts are
          discoverable rather than documented somewhere nobody reads. */}
      <nav className="flex flex-wrap gap-x-3 gap-y-1 border border-line px-3 py-1.5 print:hidden">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="font-mono text-micro text-grey hover:text-navy"
          >
            <span className="text-navy">{s.n}</span> {s.title}
          </a>
        ))}
      </nav>

      <div className="space-y-3">
        <Section {...SECTIONS[0]}><HealthBlock view={loop.health} /></Section>
        <Section {...SECTIONS[1]}>
          <CaptureBlock initial={loop.capture} engagementId={engagementId} driversOpen={driversOpen} />
        </Section>
        <Section {...SECTIONS[2]}><WinLossBlock pooled={pooled} detail={winLoss} /></Section>
        <Section {...SECTIONS[3]}><MarginBlock detail={margin} /></Section>
        <Section {...SECTIONS[4]}><ReviewBlock review={loop.review} driversOpen={driversOpen} /></Section>
        <Section {...SECTIONS[5]}>
          <MonitorsBlock specs={loop.monitors} registerable={loop.registerableMonitorKeys} />
        </Section>
        <Section {...SECTIONS[6]}><WbrBlock wbr={loop.wbr} /></Section>
        <Section {...SECTIONS[7]}><ProvenanceBlock sources={loop.dataSources} /></Section>
      </div>

      <p className="pb-4 font-mono text-micro text-grey">
        Composed {loop.asOf}. Every figure above is traceable to the rows and the formula named beside it;
        every absence above is named rather than blank. This page records nothing and changes nothing.
      </p>
    </div>
  );
}

export default GpsLoop;
