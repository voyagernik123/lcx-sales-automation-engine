import { useMemo, useState } from 'react';
import { ChevronDown, Sigma } from 'lucide-react';
import { clsx } from 'clsx';
import type { ForecastData } from '@/lib/api/kpi';
import { ChartCard, Histogram, type HistogramMarker, type HistogramSeries } from '@/components/charts';
import { applyScenarioToValue, applyScenarioToWinProb, useInspect, useScenarioActive } from '@/stores';
import { SimPill, useScenario } from '@/components/deals/ScenarioControls';
import { STAGE_LABELS } from '@/types/kpi';
import { binTotals, simulateTotals } from './forecastSim';

const RUNS = 10_000;
const BINS = 28;
/** Cyan = the app-wide simulation/projection accent. */
const SIM_TEXT = 'text-cyan-700 dark:text-cyan-400';

const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString()}`;
const fmtUsdCompact = (v: number) =>
  `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.max(0, v))}`;

/** An exclusion the forecast made, as GET /v1/kpis/forecast reports it. */
export interface ForecastExclusionView {
  code: string;
  rule: string;
  count: number;
  ids: string[];
}

/**
 * The coverage/exclusion limb of GET /v1/kpis/forecast — fields
 * apps/api/src/kpi/forecast.ts ALREADY returns and this card was ignoring.
 *
 * `ForecastData` is declared in apps/web/src/lib/api/kpi.ts, which this lane does
 * not own, so they are read through a local structural view of the same payload.
 * That is the identical compensation this lane just DELETED from CommandDeck.tsx,
 * and it is owed here for the same reason it existed there: the owning file is out
 * of the file set. It is a debt, not a design — fold these fields into
 * `ForecastData` (and widen its `value`/`p10..expected` to `number | null`, which
 * the endpoint already sends) when that file is editable.
 *
 * Every added field is OPTIONAL so a plain `ForecastData` still satisfies it, and
 * so "the API build predates this field" stays distinguishable from "the field
 * arrived null" and from "the count is genuinely 0".
 */
export type ForecastWithCoverage = Omit<ForecastData, 'deals'> & {
  /** `value` is `number | null` over the wire — an unpriced deal, not a $0 deal. */
  deals: Array<Omit<ForecastData['deals'][number], 'value'> & { value: number | null }>;
  /**
   * Deals the API actually simulated. `deals.length` is the INPUT list and is
   * larger whenever anything was excluded. Absent or null = not-loaded; NEITHER
   * is zero deals.
   */
  simulatedDealCount?: number | null;
  unpriced?: ForecastExclusionView;
  unrateable?: ForecastExclusionView;
  /** Set iff the API had nothing it could price. The card must not draw a curve then. */
  distributionRefusal?: { code: string; rule: string } | null;
  /**
   * WHICH DEAL DECIDES THE QUARTER, most decisive first.
   *
   * The engine has always computed this from the 10,000 paths it already walks; the API
   * dropped it at the boundary until now, so this table could show probability, value and
   * expectation and never the one thing a reader actually acts on.
   *
   * Optional for the same reason as the fields above: absent means an API build that
   * predates it, which is distinguishable from "the figure was withheld".
   */
  decisiveness?: Array<{
    id: string;
    projectName: string | null;
    p50SwingPct: number | null;
    p50SwingStdErr: number | null;
    p50SwingCode: string | null;
    swing: number | null;
    swingCode: string | null;
    wonRuns: number;
    lostRuns: number;
  }>;
};

type ForecastDealView = ForecastWithCoverage['deals'][number];
/** A deal the client can actually draw: it has a price. */
type PricedDeal = ForecastDealView & { value: number };

/** How an excluded row reads in the per-deal table. Keyed off the stable code. */
const EXCLUSION_LABEL: Record<string, string> = {
  UNPRICED_DEAL_EXCLUDED: 'not priced',
  UNRATEABLE_STAGE_EXCLUDED: 'stage not rated',
};

/**
 * What the exclusion DID, per code. One sentence cannot cover both: an unpriced
 * deal was never scored 0, but an UNRATEABLE_STAGE deal was priced — what the
 * engine refused there was its win probability, not its value. Saying "not
 * scored 0" of that deal states a fact that is only true of the other exclusion.
 */
const EXCLUSION_EFFECT: Record<string, string> = {
  UNPRICED_DEAL_EXCLUDED: 'excluded from the simulation, not scored 0',
  UNRATEABLE_STAGE_EXCLUDED:
    'excluded from the simulation — priced, but the win probability was refused rather than invented',
};

/**
 * This card's OWN code, not the engine's, for a deal it cannot draw that the API
 * named in no exclusion (an API build older than the coverage limb, or a payload
 * that disagrees with the engine). It exists so an authored sentence is never
 * rendered in the same slot, with the same authority, as an engine rule.
 */
const CARD_EXCLUSION_CODE = 'UNPRICED_NOT_NAMED_BY_API_CLIENT_SIDE';
/** This card's OWN code for `unpriced`/`unrateable` missing from the payload entirely. */
const ABSENT_LIMB_CODE = 'EXCLUSION_DETAIL_NOT_RETURNED_CLIENT_SIDE';

/**
 * The price this card can actually draw, or null.
 *
 * `!= null` and not `!== null`: the whole file's thesis is nullability, and the
 * out-of-type case the client type cannot rule out is a payload whose `value`
 * KEY IS ABSENT rather than null. Under a strict check that deal passed the
 * filter, entered the simulation, and printed "$NaN" in three of the four
 * percentile tiles beside one real figure — while `binTotals` quietly dropped
 * its runs into `counts[NaN]`. A non-finite number does the same, so both are
 * treated as "no usable price" rather than laundered into a total.
 */
const drawablePrice = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * The Monte Carlo forecast as a distribution instrument (plan item 0.6/4.1):
 * histogram of 10,000 simulated quarter outcomes with P10/P50/P90 markers, a
 * "See the math" disclosure whose per-deal rows open the deal inspector, and
 * a scenario overlay — when any assumption dial is off baseline the deals are
 * re-simulated with adjusted win probabilities/values and drawn in cyan.
 *
 * COVERAGE IS PART OF THE FIGURE. The forecast excludes deals it cannot price
 * and deals whose stage it cannot rate; the subtitle used to print
 * `forecast.deals.length` — the input list — as the simulated set, so it claimed
 * coverage the simulation did not have. The client-side re-run had the matching
 * defect: it drew every input deal, which put an unpriced deal into the
 * histogram at $0.
 *
 * TWO INVARIANTS THIS CARD HOLDS, both of which it once broke:
 *  - An exclusion limb that is ABSENT is not a limb reporting zero. Absent means
 *    the card does not know what was excluded, and it says so — including that
 *    the set it drew cannot honour exclusions the API never named.
 *  - Anything the card decided for itself carries its OWN code and says it is
 *    the card's, never the engine's. `UNPRICED_DEAL_EXCLUDED` came from the
 *    engine; `UNPRICED_NOT_NAMED_BY_API_CLIENT_SIDE`, `NO_SIMULABLE_DEAL_CLIENT_SIDE`
 *    and `EXCLUSION_DETAIL_NOT_RETURNED_CLIENT_SIDE` are this file's, and a
 *    reader must be able to tell which they are looking at.
 */
export function ForecastDistribution({ forecast }: { forecast: ForecastWithCoverage }) {
  const inspect = useInspect();
  const scenario = useScenario();
  const simActive = useScenarioActive();
  const [mathOpen, setMathOpen] = useState(false);

  const excludedIds = useMemo(
    () => new Set<string>([...(forecast.unpriced?.ids ?? []), ...(forecast.unrateable?.ids ?? [])]),
    [forecast.unpriced, forecast.unrateable],
  );

  /**
   * The set actually drawn. The price check is load-bearing at runtime even
   * where the (out-of-lane) client type still says `number`: the endpoint sends
   * null for an unmarked price, and `total += null` sums as 0 — a deal somebody
   * agreed to do for nothing. The id check honours exclusions the API named for
   * reasons the payload does not otherwise expose (an unrateable stage).
   */
  const simulated = useMemo(
    () => forecast.deals.filter((d): d is PricedDeal => drawablePrice(d.value) !== null && !excludedIds.has(d.id)),
    [forecast.deals, excludedIds],
  );

  const baseDeals = useMemo(
    () => simulated.map((d) => ({ p: d.winProbability / 100, value: d.value })),
    [simulated],
  );
  const scnDeals = useMemo(
    () =>
      simActive
        ? simulated.map((d) => ({
            p: applyScenarioToWinProb(d.winProbability, scenario) / 100,
            // applyScenarioToValue is unit-agnostic multiplication; values here are dollars.
            value: applyScenarioToValue(d.value, scenario),
          }))
        : null,
    [simulated, scenario, simActive],
  );

  const baseSim = useMemo(() => simulateTotals(baseDeals, { runs: RUNS, seed: 42 }), [baseDeals]);
  const scnSim = useMemo(
    () => (scnDeals ? simulateTotals(scnDeals, { runs: RUNS, seed: 42 }) : null),
    [scnDeals],
  );

  const domainMax = Math.max(
    1,
    baseSim.totals[baseSim.totals.length - 1] ?? 0,
    scnSim ? scnSim.totals[scnSim.totals.length - 1] ?? 0 : 0,
  );
  const domain: [number, number] = [0, domainMax];

  const series: HistogramSeries[] = [
    { label: 'Baseline', counts: binTotals(baseSim.totals, domain, BINS) },
  ];
  if (scnSim) {
    series.push({
      label: 'Scenario',
      counts: binTotals(scnSim.totals, domain, BINS),
      className: 'text-accent-text',
    });
  }

  const view = scnSim ?? baseSim;
  const markers: HistogramMarker[] = [
    { label: 'P10', value: view.p10 },
    { label: 'P50', value: view.p50 },
    { label: 'P90', value: view.p90 },
  ].map((m) => ({ ...m, className: scnSim ? SIM_TEXT : 'text-navy' }));

  const bands: { label: string; base: number; scn: number | null }[] = [
    { label: 'P10 conservative', base: baseSim.p10, scn: scnSim?.p10 ?? null },
    { label: 'P50 median', base: baseSim.p50, scn: scnSim?.p50 ?? null },
    { label: 'P90 upside', base: baseSim.p90, scn: scnSim?.p90 ?? null },
    { label: 'Expected', base: baseSim.expected, scn: scnSim?.expected ?? null },
  ];

  /* ── coverage: what the figure covers, stated beside the figure ── */

  const drawn = simulated.length;
  const reported = forecast.simulatedDealCount;
  const openCount = forecast.deals.length;
  const plural = (n: number) => (n === 1 ? '' : 's');
  // Three states, never collapsed: not-loaded (absent or null over the wire) /
  // reported and corroborated by the set this card drew / reported and NOT
  // corroborated, in which case both numbers are shown rather than one picked.
  const coverage =
    reported == null
      ? `Simulated-deal count not returned by this API build — ${drawn} of ${openCount} open deal${plural(openCount)} were drawable here`
      : reported === drawn
        ? `${reported} simulated deal${plural(reported)}, of ${openCount} open`
        : `${reported} simulated deal${plural(reported)} per the API, ${drawn} drawn here, of ${openCount} open`;

  const exclusions = [forecast.unpriced, forecast.unrateable]
    .filter((e): e is ForecastExclusionView => (e?.count ?? 0) > 0);
  const nameOf = (id: string) => forecast.deals.find((d) => d.id === id)?.projectName ?? id;
  const exclusionFor = (id: string): ForecastExclusionView | null =>
    forecast.unpriced?.ids.includes(id) ? forecast.unpriced
      : forecast.unrateable?.ids.includes(id) ? forecast.unrateable
        : null;

  /**
   * AN ABSENT LIMB IS NOT AN EMPTY LIST. `count: 0` means the engine looked and
   * excluded nothing; the limb missing means the API build predates it. Gating
   * the block on `count > 0` alone rendered the two byte-identically, which is
   * exactly the not-loaded/genuinely-empty collapse the line above avoids for
   * `simulatedDealCount`. It is worse here than a missing sentence: with the
   * limbs absent `excludedIds` is empty too, so a PRICED deal at a stage the
   * engine cannot rate is drawn into the histogram with nothing on screen to
   * say the card had no way to know.
   */
  const absentLimbs = [
    forecast.unpriced == null ? 'unpriced' : null,
    forecast.unrateable == null ? 'unrateable' : null,
  ].filter((n): n is string => n !== null);

  /**
   * Deals THIS CARD withheld that the API named in no exclusion. Kept separate
   * from `exclusions` because the reason is the card's own observation and must
   * not be presented with an engine rule's authority.
   */
  const cardWithheldIds = forecast.deals
    .filter((d) => exclusionFor(d.id) === null && drawablePrice(d.value) === null)
    .map((d) => d.id);

  /**
   * Which body renders — decided BEFORE the exclusion block, because the
   * block's truncation depends on it. The per-deal math table lists every input
   * deal, so the block may abbreviate to 4 names only while that table exists.
   * In the refused and nothing-simulable states there is no table, and the
   * block is the ONLY place an excluded deal is named: a refusal that cannot
   * say which deals it withheld is the failure the refusal exists to prevent.
   */
  const bodyState: 'refused' | 'empty' | 'nothing-simulable' | 'drawn' = forecast.distributionRefusal
    ? 'refused'
    : openCount === 0
      ? 'empty'
      : drawn === 0
        ? 'nothing-simulable'
        : 'drawn';
  const nameCap: number | null = bodyState === 'drawn' ? 4 : null;
  const namesOf = (ids: string[]) => {
    const shown = nameCap == null ? ids : ids.slice(0, nameCap);
    const hidden = ids.length - shown.length;
    return `${shown.map(nameOf).join(' · ')}${hidden > 0 ? ` … (+${hidden} more, named in "See the math")` : ''}`;
  };

  /* The exclusion block renders in EVERY state, including the refusal — the
     reason a distribution is missing is the most useful thing on the card. */
  const exclusionBlock = (absentLimbs.length > 0 || exclusions.length > 0 || cardWithheldIds.length > 0) && (
    <ul data-testid="forecast-exclusions" className="mt-1.5 space-y-1 text-micro leading-relaxed text-grey">
      {absentLimbs.length > 0 && (
        <li data-testid="forecast-exclusions-absent">
          <span className="font-mono font-semibold">{ABSENT_LIMB_CODE}</span> · Exclusion detail not returned by this API
          build ({absentLimbs.join(' and ')} absent from the payload) — this is NOT a report of zero exclusions. The
          {' '}{drawn} deal{plural(drawn)} drawn here therefore cannot honour exclusions the API did not name: a deal with
          a real price at a stage the engine cannot rate would be drawn as though its win probability were calibrated.
          This code is the card's own, not the engine's.
        </li>
      )}
      {exclusions.map((e) => (
        <li key={e.code}>
          <span className="font-mono font-semibold">{e.code}</span> · {e.count} open deal{plural(e.count)}{' '}
          {EXCLUSION_EFFECT[e.code] ?? 'excluded from the simulation'}: {namesOf(e.ids)} — {e.rule}
        </li>
      ))}
      {cardWithheldIds.length > 0 && (
        <li data-testid="forecast-card-exclusions">
          <span className="font-mono font-semibold">{CARD_EXCLUSION_CODE}</span> · {cardWithheldIds.length} open
          deal{plural(cardWithheldIds.length)} withheld by THIS CARD, not by the engine — the payload carried no usable
          package value and the API named {cardWithheldIds.length === 1 ? 'it' : 'them'} in no exclusion:
          {' '}{namesOf(cardWithheldIds)} — the card's own observation of an absence, not an engine rule.
        </li>
      )}
    </ul>
  );

  return (
    <ChartCard
      title="Pipeline forecast — distribution"
      subtitle={`${RUNS.toLocaleString()} Monte Carlo simulations, re-run client-side (seeded, reproducible)`}
      action={<SimPill />}
    >
      <p data-testid="forecast-coverage" className="text-micro leading-relaxed text-grey">
        {coverage}
      </p>
      {exclusionBlock}

      {bodyState === 'refused' && forecast.distributionRefusal ? (
        /* A refusal is not a distribution. Drawing the histogram here would put
           10,000 runs of exactly 0 on screen — a $0 quarter asserted as certain. */
        <div data-testid="forecast-refusal" className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold text-navy">
            No distribution — <span className="font-mono">{forecast.distributionRefusal.code}</span>
          </p>
          <p className="mt-1 text-micro leading-relaxed text-grey">{forecast.distributionRefusal.rule}</p>
        </div>
      ) : bodyState === 'empty' ? (
        /* Genuinely empty — a different state from refused. An empty open
           pipeline does forecast 0, and says so without a code. */
        <p data-testid="forecast-empty" className="py-8 text-center text-xs text-grey">No open deals to simulate</p>
      ) : bodyState === 'nothing-simulable' ? (
        /* Every open deal excluded but no refusal arrived: the API build is older
           than `distributionRefusal`, or the two disagree. Either way there is
           nothing to draw and 10,000 zero totals is not the answer. */
        <p data-testid="forecast-nothing-simulable" className="py-8 text-center text-xs text-grey">
          Distribution withheld — <span className="font-mono">NO_SIMULABLE_DEAL_CLIENT_SIDE</span>: none of the
          {' '}{openCount} open deal{plural(openCount)} could be drawn here, and the API returned no
          {' '}<span className="font-mono">distributionRefusal</span> to cite. The code above is this card's own, not the
          engine's — the engine should have refused first.
        </p>
      ) : (
        <div data-testid="forecast-distribution-body">
          {/* percentile tiles — scenario-adjusted in cyan, baseline kept visible */}
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {bands.map((b) => (
              <div key={b.label} className="rounded-lg border border-line/70 p-2 text-center">
                <div className="text-micro font-medium uppercase tracking-wide text-grey">{b.label}</div>
                {b.scn != null ? (
                  <div className="mt-0.5">
                    <span className={clsx('num-tabular block text-sm font-semibold', SIM_TEXT)} title="Scenario-adjusted">
                      {fmtUsd(b.scn)}
                    </span>
                    <span className="num-tabular block text-micro text-grey line-through" title="Baseline">
                      {fmtUsd(b.base)}
                    </span>
                  </div>
                ) : (
                  <div className="num-tabular mt-0.5 text-sm font-semibold text-navy">{fmtUsd(b.base)}</div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3">
            <Histogram
              domain={domain}
              series={series}
              markers={markers}
              height={160}
              formatX={fmtUsdCompact}
              formatCount={(v) => `${Math.round(v)}`}
            />
            <p className="mt-1.5 text-micro text-grey">
              X: simulated quarter revenue · Y: runs per bucket · markers show {scnSim ? 'scenario' : 'baseline'} percentiles
            </p>
          </div>

          {/* THE HEADLINE, ALWAYS VISIBLE. The full ranking lives in "See the math" below
              because it is a derived statistic with standard errors — but the single most
              actionable sentence on this card should not require a click to find. */}
          <DecisivenessHeadline rows={forecast.decisiveness} />

          {/* See the math — every number's "why" */}
          <div className="mt-3 border-t border-line pt-2">
            <button
              type="button"
              onClick={() => setMathOpen((o) => !o)}
              aria-expanded={mathOpen}
              className="flex items-center gap-1.5 text-xs font-semibold text-navy hover:text-cyan-700 dark:hover:text-cyan-400"
            >
              <Sigma size={12} aria-hidden="true" />
              See the math
              <ChevronDown size={12} className={clsx('transition-transform', mathOpen && 'rotate-180')} aria-hidden="true" />
            </button>

            {mathOpen && (
              <div className="mt-2 space-y-2">
                <p className="text-micro leading-relaxed text-grey">
                  Expected = Σ winProbability × value over the {drawn} SIMULATED deal{plural(drawn)} — not over the
                  {' '}{openCount} open. The distribution draws each of them as an
                  independent Bernoulli(winProbability) event {RUNS.toLocaleString()} times (mulberry32 PRNG, seed 42 — same
                  engine as the API) and sums the values that close. Excluded deals are listed below with the rule that
                  excluded them; they contribute nothing, which is not the same as contributing 0.
                  {scnSim && (
                    <span className={SIM_TEXT}>
                      {' '}Scenario applies close-rate {scenario.closeRateDelta >= 0 ? '+' : ''}
                      {Math.round(scenario.closeRateDelta * 100)}% and value {Math.round(scenario.valueDelta * 100)}% to every deal before re-simulating.
                    </span>
                  )}
                </p>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-line/70">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-line text-left text-micro font-medium uppercase tracking-wide text-grey">
                        <th className="px-2 py-2.5">Deal</th>
                        <th className="px-2 py-2.5">Stage</th>
                        <th className="px-2 py-2.5 text-right">Win prob</th>
                        <th className="px-2 py-2.5 text-right">Value</th>
                        <th className="px-2 py-2.5 text-right">Expected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/50">
                      {/*
                        The INPUT list is still shown in full — an excluded deal
                        that vanished from this table would be a second way to
                        hide it. What changed is that an excluded row no longer
                        carries arithmetic: `fmtUsd(null)` rendered "$0", so an
                        unpriced deal showed a real win percentage against a $0
                        expected value, which reads as a deal agreed for nothing.
                      */}
                      {forecast.deals.map((d) => {
                        const excluded = exclusionFor(d.id);
                        const priced = drawablePrice(d.value);
                        /* Two provenances, never one slot. `excluded` is the
                           ENGINE's named exclusion and carries the engine's
                           rule; the fallback is this CARD's own observation and
                           says so, with its own code, rather than borrowing the
                           authority of the slot the engine's rule occupies. */
                        const cardWithheld = excluded === null && priced === null;
                        const priceLabel = d.value == null ? 'not priced' : 'price not numeric';
                        const label = excluded ? EXCLUSION_LABEL[excluded.code] ?? excluded.code : priceLabel;
                        const reason = excluded
                          ? `${excluded.code} — ${excluded.rule}`
                          : `${CARD_EXCLUSION_CODE} — this card, not the engine: ${
                              d.value == null
                                ? 'the payload carried no package value for this deal'
                                : 'the payload carried a package value that is not a finite number'
                            }, and the API named it in no exclusion.`;
                        const withheld = excluded !== null || priced === null;
                        const adjP = scnSim ? applyScenarioToWinProb(d.winProbability, scenario) : d.winProbability;
                        const adjV = priced === null
                          ? null
                          : scnSim ? applyScenarioToValue(priced, scenario) : priced;
                        // An unrateable stage has no calibrated base rate, so the
                        // percentage on it is the invented 5% fallback — withheld
                        // rather than printed beside real ones.
                        const rateWithheld = excluded?.code === 'UNRATEABLE_STAGE_EXCLUDED';
                        return (
                          <tr
                            key={d.id}
                            data-testid={`forecast-math-row-${d.id}`}
                            className={clsx('hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10', withheld && 'opacity-70')}
                          >
                            <td className="px-2 py-2.5">
                              <button
                                type="button"
                                onClick={() => inspect('deal', d.id)}
                                className="font-medium text-navy underline-offset-2 hover:underline"
                                title="Open deal inspector"
                              >
                                {d.projectName}
                              </button>
                            </td>
                            <td className="px-2 py-2.5 text-grey">{STAGE_LABELS[d.stage] ?? d.stage}</td>
                            <td className={clsx('num-tabular px-2 py-2.5 text-right font-mono', scnSim ? SIM_TEXT : 'text-navy')}>
                              {rateWithheld ? <span className="text-micro text-grey">not rated</span> : `${Math.round(adjP)}%`}
                            </td>
                            <td className={clsx('num-tabular px-2 py-2.5 text-right font-mono', scnSim ? SIM_TEXT : 'text-navy')}>
                              {adjV === null ? <span className="text-micro text-grey">{priceLabel}</span> : fmtUsd(adjV)}
                            </td>
                            <td className={clsx('num-tabular px-2 py-2.5 text-right font-mono font-bold', scnSim ? SIM_TEXT : 'text-navy')}>
                              {withheld || adjV === null ? (
                                <span className="text-micro font-normal text-grey" title={reason}>
                                  {label}
                                  {cardWithheld && (
                                    <span className="ml-1 font-mono" title={reason}>
                                      · this card
                                    </span>
                                  )}
                                </span>
                              ) : (
                                fmtUsd((adjP / 100) * adjV)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-line">
                        <td
                          colSpan={4}
                          data-testid="forecast-math-sum"
                          className="px-2 py-2.5 text-right text-micro font-medium uppercase tracking-wide text-grey"
                        >
                          {/* Naming the denominator: the sum is over the rows that
                              have numbers, so it must not read as a total of the table. */}
                          Σ expected — simulated rows only ({drawn} of {openCount})
                        </td>
                        <td className={clsx('num-tabular px-2 py-2.5 text-right font-mono font-bold', scnSim ? SIM_TEXT : 'text-navy')}>
                          {fmtUsd(view.expected)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <DecisivenessTable rows={forecast.decisiveness} scenarioActive={scnSim != null} />
              </div>
            )}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

/** The top row of the ranking, as one sentence, outside the disclosure. */
function DecisivenessHeadline({ rows }: { rows?: ForecastWithCoverage['decisiveness'] }) {
  const top = rows?.find((r) => r.p50SwingPct !== null);
  if (!top) return null;
  return (
    <p className="mt-2 text-micro text-grey" data-testid="decisiveness-headline">
      The quarter turns most on{' '}
      <span className="font-medium text-fg">{top.projectName ?? top.id}</span> — landing it adds{' '}
      <span className="num-tabular font-mono font-bold text-navy">
        {top.p50SwingPct!.toFixed(1)} pp
      </span>{' '}
      to the chance the book clears its own median. Not the biggest deal; the one that moves
      the odds.
    </p>
  );
}

/**
 * WHICH DEAL DECIDES THE QUARTER — the answer the expected-value table above cannot give.
 *
 * `p·value` ranks deals by what they are worth. This ranks them by how much they MOVE THE
 * ODDS that the book clears its own median, recovered from the same 10,000 paths. The two
 * orderings disagree in a way that matters: a large near-certain deal barely moves the odds
 * because it is already priced in, while a mid-sized genuine coin-flip decides everything.
 *
 * A WITHHELD row prints its refusal code, never a 0 and never a dash that looks like one.
 * The engine withholds for two distinct reasons and they are different facts:
 *   INSUFFICIENT_ARM     — too few simulated paths either way to have a mean worth quoting
 *   SE_EXCEEDS_MAGNITUDE — the estimate is inside its own noise
 * Both are ranked LAST rather than sorted as zero, because zero is a measurement.
 */
function DecisivenessTable(
  { rows, scenarioActive }: { rows?: ForecastWithCoverage['decisiveness']; scenarioActive: boolean },
) {
  // Absent = this API build predates the field. That is not "no deals are decisive", so it
  // renders nothing rather than an empty table implying a measurement was taken.
  if (!rows || rows.length === 0) return null;
  const measured = rows.filter((r) => r.p50SwingPct !== null);
  const withheld = rows.filter((r) => r.p50SwingPct === null);

  return (
    <div className="mt-5" data-testid="forecast-decisiveness">
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-grey">
        Which deal decides the quarter
      </div>
      <p className="mt-1.5 max-w-2xl text-micro leading-relaxed text-grey">
        Percentage points added to the chance the book clears its own median when the deal
        lands — measured across the same {'10,000'} simulated quarters, not derived from the
        value column. A big, near-certain deal moves this very little; it is already priced in.
      </p>
      {measured.length === 0 ? (
        <p className="mt-2 text-micro text-grey" data-testid="decisiveness-none-measured">
          No deal&apos;s swing survived its own standard error at this run count. That is a
          statement about the simulation&apos;s resolution, not a finding that every deal is
          equally decisive.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {measured.slice(0, 6).map((r) => (
            <li key={r.id} className="flex items-baseline gap-2 text-micro">
              <span className="num-tabular w-16 shrink-0 text-right font-mono font-bold text-navy">
                +{r.p50SwingPct!.toFixed(1)} pp
              </span>
              <span className="num-tabular w-16 shrink-0 text-right font-mono text-grey">
                ± {r.p50SwingStdErr?.toFixed(2) ?? '—'}
              </span>
              <span className="truncate text-fg">{r.projectName ?? r.id}</span>
            </li>
          ))}
        </ul>
      )}
      {scenarioActive && (
        /* THE SCENARIO DOES NOT REACH THIS TABLE. Everything else on this card re-simulates
           client-side under the scenario dials; decisiveness comes from the server's run
           over the REAL book. Sitting silently beside adjusted numbers, it would read as
           adjusted too. */
        <p className="mt-2 text-micro text-amber" data-testid="decisiveness-unscenarioed">
          A scenario is active, and these swings are NOT adjusted for it — they are measured
          on the real book as recorded. The figures above this line are the scenario&apos;s;
          these are not.
        </p>
      )}
      {withheld.length > 0 && (
        <p className="mt-2 text-micro text-grey" data-testid="decisiveness-withheld">
          {withheld.length} deal{withheld.length === 1 ? '' : 's'} withheld rather than ranked:{' '}
          {[...new Set(withheld.map((r) => r.p50SwingCode ?? 'UNSPECIFIED'))].join(', ')}. A
          withheld swing is not a swing of zero.
        </p>
      )}
    </div>
  );
}
