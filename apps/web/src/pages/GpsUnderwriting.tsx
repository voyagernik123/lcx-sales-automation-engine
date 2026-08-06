import { useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, Lock, RotateCcw, ShieldAlert, Swords } from 'lucide-react';
import { clsx } from 'clsx';
import {
  OFFERS, type OfferKey,
  buildSurfaceMesh, marginPct, type SurfaceOutcome,
} from '@lcx/shared';
import { SurfacePlot } from '@/components/geometry/SurfacePlot';
import { apiConfig } from '@/lib/apiClient';
import { PageTitle, Button, Input, Select } from '@/components/ui';
import { EmptyState } from '@/components/shared';
import { PrintStyles } from '@/components/report/PrintStyles';
import { useListNavigation } from '@/hooks/useListNavigation';
import { formatMoney } from '@/lib/format';
import {
  underwriteQuote, UNDERWRITE_VERDICT_LABEL, isRefusal,
  type UnderwriteBody, type UnderwriteResponse, type Underwriting,
  type MarginDistribution, type OverrunPoint, type OverrunSensitivity,
  type IssueCheck, type IssueDecision, type DevilsAdvocate,
  type UnderwriteDriver, type VarianceAttribution, type EffortTriple,
} from '@/lib/api/gpsUnderwrite';
import { GpsMetaBanner } from './GpsMetaBanner';
import { LegalPositionStamp } from '@/components/gps/LegalPositionStamp';
import { readLegalPosition } from '@/components/gps/legalPosition';
import {
  GpsPrintArtefact, gpsUnderwritingRefusal, type GpsPrintProvenanceRow,
} from '@/components/gps/GpsPrint';
import { signalGps, underwriteFeel } from '@/lib/gpsFeel';

/**
 * GLOBAL SERVICES — THE UNDERWRITING SCREEN (Phase 7).
 *
 * He types a price. The screen answers with a DISTRIBUTION.
 *
 * That sentence is the whole product. Every CRM on earth stores a price; none of
 * them tells you the price is wrong. `gps/underwrite.ts` is 1,843 lines and 81
 * tests of the machinery that can, and until this file it had no face — the same
 * failure that put 4,564 lines of targeting, partners, calibration and delivery
 * behind a four-stat strip and a form (`GPS_100X_PLAN.md` §0).
 *
 * THIS SCREEN COMPUTES NOTHING. Not the percentiles, not P(loss), not the block,
 * not the variance attribution, not one sentence of the devil's advocate. All of
 * it arrives on one `UnderwriteResponse` from one simulation, and the only
 * arithmetic below is `cents / 100` for display and an SVG coordinate transform.
 * That is deliberate to the point of pedantry: the moment a surface derives a
 * decision-bearing number it becomes a second opinion nobody reconciles, and the
 * governed block would eventually be quoting a threshold against a figure the
 * server never produced.
 *
 * ── THE DOCTRINE, AND WHERE EACH PART OF IT LIVES ON THIS SCREEN ──────────────
 *
 * D1 · EVERY NUMBER OPENS. `spreadCents` and the median cost are buttons that
 *      expand the full `UnderwriteDriver` trail — ten-plus signed lines, each with
 *      its UNIT and its formula/source/caveat (`underwrite.ts:644`). The unit is
 *      rendered from `driver.unit`, never guessed, because a trail that prints
 *      "600000 points" for six thousand dollars is worse than no trail.
 *
 * D2 · REFUSALS ARE THE HEADLINE, NOT A TOAST. Seven of the eight verdicts are
 *      refusals; when one fires the band is REPLACED by the refusal — never
 *      rendered beside it — with every `reason` printed in full. A currency
 *      mismatch does not produce a slightly-wrong margin here, it produces no
 *      margin and a sentence.
 *
 * D3 · NO BARE POINT ESTIMATE, ENFORCED BY A MECHANISM RATHER THAN BY CARE.
 *      `<Figure>` is the only component on this page that renders a margin, and it
 *      REQUIRES a `percentile` prop and stamps it into `data-percentile`.
 *      `pages/__tests__/gpsUnderwriting.test.tsx` then asserts that every
 *      `[data-margin-figure]` in the DOM carries a percentile and that p10, p50 and
 *      p90 appear in equal numbers — so a future edit that renders "Margin: $6,000"
 *      alone goes red instead of looking tidy. `MarginDistribution` has no
 *      `marginCents` field for exactly the same reason (`underwrite.ts:671`).
 *
 * D4 · THE SCREEN SAYS THE PRICE IS WRONG, IN WORDS. When P(loss) is over the
 *      policy's appetite the headline is a sentence — "at this price you lose money
 *      in 23% of simulated outcomes" — and the issue control is BLOCKED: `disabled`,
 *      red, with the reason quoted verbatim from `IssueDecision.reason` and the
 *      failing check's threshold and observed value side by side. A warning is a
 *      thing you click past at 23:00; a block is a decision someone has to
 *      overturn on the record (`underwrite.ts:1330`).
 *
 * D5 · DENSE. Tape lines, monospace, `tabular-nums`, no stat cards anywhere. The
 *      four-stat GPS strip is the anti-pattern this phase was called in to correct.
 *
 * D6 · KEYBOARD. The sensitivity table is one tab stop with roving tabindex —
 *      arrows move, Enter selects that uplift as the displayed distribution, which
 *      is the same movement grammar as the origination queue and the BD lead list.
 *      The overrun slider is a native range input, so arrows work there for free.
 *
 * D7 · PRINTABLE. `PrintStyles`, the `asOf` instant and the seed in the header, and
 *      the disclosure banners print with everything else — a printed distribution
 *      that has lost the words "this is a prior" is the most dangerous artifact
 *      this programme could produce.
 *
 * D8 · NO CLAIM WITHOUT A MECHANISM. Every method statement on this page is read
 *      off the wire (`percentileMethod`, `underwriting.method`,
 *      `varianceDriver.method`, `sensitivity.method`, `policyNotice`,
 *      `basisReason`, `devilsAdvocate.sourceStatement`) rather than typed here.
 *      A sentence typed on a screen is a claim; a sentence shipped beside the
 *      number that produced it is a mechanism. `sensitivity.monotone` is printed as
 *      a checked property, not asserted as a comment.
 *
 * ── WHY THE NUMBERS DO NOT SHIMMER ───────────────────────────────────────────
 * Three separate decisions, because "debounce it" alone is not enough:
 *  1. The request is debounced (400ms) and built from a memoised body, so typing
 *     "17500" is one simulation, not five.
 *  2. `seed` is NOT sent. The server's `DEFAULT_SEED` is the only seed, and the
 *     response echoes the one it used, which is printed in the header. A browser
 *     that picks its own seed picks its own answer.
 *  3. `asOf` is captured ONCE per page load into a ref. It is what rate-card
 *     staleness is judged against (`underwrite.ts:938` — this module refuses on a
 *     stale card rather than reporting beside it), so re-reading the clock on every
 *     keystroke would make a card expire mid-edit and the screen would flip from a
 *     band to a refusal while the founder was still typing the price.
 * While a new run is in flight the PREVIOUS answer stays on screen, dimmed, with
 * the inputs it belongs to. A skeleton would be worse: it hides the number he is
 * comparing against.
 *
 * ── WHAT THIS SCREEN CANNOT HONESTLY DO YET ──────────────────────────────────
 * There is no partner roster to choose from. `PARTNER_BENCH` is empty BY
 * CONSTRUCTION (`partners.ts:307`) — no partner has been named and no rate card
 * exists — so the partner field is a typed id and the server's answer for an
 * unknown id is a stated refusal, which is the correct output rather than a
 * placeholder margin. The effort triple, the price bands, the rate cards and the
 * margin floor are all unsupplied, all badged, and all rendered in ONE editable
 * block (`GPS_100X_PLAN.md` §12). Nothing on this page presents a placeholder as
 * a real number.
 */

/* ── Formatting. Display only; every value below was computed on the server. ── */

/** Integer cents → money. `exact` always: this is a decision surface, not a dashboard. */
const money = (cents: number) => formatMoney(cents / 100, { exact: true });

/** A 0–1 probability → whole-tenths percent. `0.9168` → `91.7%`. */
const prob = (p: number) => `${(p * 100).toFixed(1)}%`;

/** Signed money, for deltas where the sign is the point. */
const signedMoney = (cents: number) => (cents > 0 ? `+${money(cents)}` : money(cents));

/**
 * A driver's `points` rendered in ITS OWN UNIT (D1).
 *
 * `UnderwriteDriver.unit` is required precisely so this function can exist
 * (`underwrite.ts:644`): `Driver.points` means score points everywhere else in the
 * platform, and here the same field carries cents, days, a percent, a ratio or a
 * count. Switching on the unit is the difference between a trail that explains a
 * number and a trail that misreports it in the platform's own vocabulary.
 */
function driverValue(d: UnderwriteDriver): string {
  switch (d.unit) {
    case 'cents': return signedMoney(d.points);
    case 'days': return `${d.points}d`;
    case 'pct': return `${d.points}%`;
    case 'ratio': return `${d.points}×`;
    case 'count': return String(d.points);
  }
}

/** Epoch means "never confirmed" — `PLACEHOLDER_STATED_AT` (`underwrite.ts:141`). */
const NEVER_CONFIRMED = '1970-01-01T00:00:00.000Z';

const BASIS_TONE: Record<string, string> = {
  prior: 'text-amber-600 dark:text-amber-400',
  blended: 'text-cyan-700 dark:text-cyan-400',
  measured: 'text-emerald-600 dark:text-emerald-400',
};

/**
 * The founder's inputs. Held as STRINGS, not numbers.
 *
 * A half-typed "1750" is not the price $17.50 and must not be underwritten as one;
 * strings let the parse fail into `null` ("no price yet") instead of collapsing to
 * 0, which `marginPct` and `pLoss` treat as a completely different question
 * (`Gps.tsx:300` reasons this out at length for the same field).
 */
interface QuoteForm {
  offerKey: OfferKey;
  partnerId: string;
  currency: string;
  priceDollars: string;
  quotedVendorDollars: string;
  optimisticDays: string;
  likelyDays: string;
  pessimisticDays: string;
  fixedCostDollars: string;
  /**
   * THERE IS NO `hoursPerDay` AND NO `effortStatedBy` FIELD, and both absences are
   * corrections rather than omissions. The first draft of this screen had inputs for
   * both; the route rejects them with a `SERVER_FACT` 400 (`SERVER_FACT_FIELDS`,
   * `apps/api/src/gps/underwrite.ts:665`) — hours-per-day belongs on the rate-card row
   * stated by whoever recorded the rate, because a smaller number is a smaller cost,
   * and `statedBy` comes from the authenticated session so the record is a record and
   * not an assertion. An input that cannot reach the server is worse than no input: it
   * invites the founder to believe he has supplied something.
   */
}

const EMPTY_FORM: QuoteForm = {
  offerKey: 'mica_whitepaper',
  partnerId: '',
  currency: 'USD',
  // OPENS EMPTY, deliberately, the same decision as the quote desk's price field
  // (`Gps.tsx:322`): a defaulted price is a price somebody did not choose, and this
  // screen's entire job is to argue with a number a human committed to.
  priceDollars: '',
  quotedVendorDollars: '',
  optimisticDays: '',
  likelyDays: '',
  pessimisticDays: '',
  fixedCostDollars: '',
};

/** Whole dollars typed by a human → integer cents. Null for empty/unparseable. */
function dollarsToCents(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  // 17_500.1 * 100 is 1750010.0000000002 in IEEE-754. `Math.round` closes the only
  // float in the system immediately — money is integer cents everywhere else.
  return Math.round(n * 100);
}

function toDays(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The form → the wire, or null when the request would be meaningless.
 *
 * Returning null for a missing price or partner is not validation theatre: without
 * either of them there is nothing to underwrite, and firing the request anyway
 * would spend a refusal on a field the founder has not filled in yet — training him
 * to ignore refusals, which are half of what this screen is for.
 *
 * THE EFFORT TRIPLE IS ALL-OR-NOTHING. A partially typed override is sent as no
 * override at all, so the server falls back to the placeholder and says so
 * (`effortFromRequest`, `underwrite.ts:177`, owns `isPlaceholder` for exactly this
 * reason — a mapper that sets the flag by hand is where a placeholder gets promoted
 * to a real figure by accident).
 */
function toRequest(f: QuoteForm): UnderwriteBody | null {
  const priceCents = dollarsToCents(f.priceDollars);
  const partnerId = f.partnerId.trim();
  if (priceCents == null || !partnerId) return null;

  const o = toDays(f.optimisticDays);
  const l = toDays(f.likelyDays);
  const p = toDays(f.pessimisticDays);
  const effort = o != null && l != null && p != null
    ? { optimisticDays: o, likelyDays: l, pessimisticDays: p }
    : null;

  return {
    offerKey: f.offerKey,
    priceCents,
    currency: f.currency.trim().toUpperCase() || 'USD',
    quotedVendorCostCents: dollarsToCents(f.quotedVendorDollars),
    partnerId,
    effort,
    fixedCostCents: dollarsToCents(f.fixedCostDollars),
  };
}

/**
 * WHAT PRODUCED EACH FIGURE ON THE SHEET, for the artefact's provenance table.
 *
 * READ OFF THE RESPONSE, NEVER RECOMPUTED. Every `source` names the field on the wire or
 * the server function that produced it, and `GpsPrintArtefact` prints "NOT STATED by the
 * surface that printed this" for a row that omits one — so a figure whose origin nobody can
 * name is visibly unsourced rather than quietly authoritative. Only figures that survive a
 * REFUSAL are listed: on a refused verdict `distribution` is absent, so the rows below it
 * would be a table of em-dashes claiming to be provenance.
 */
function printProvenance(res: UnderwriteResponse): readonly GpsPrintProvenanceRow[] {
  const u = res.underwriting;
  const rows: GpsPrintProvenanceRow[] = [
    { label: 'Price', value: `${money(u.priceCents)} ${u.currency}`, source: 'typed on this screen — the thing being argued with' },
    { label: 'Offer', value: u.offerKey, source: 'UnderwriteBody.offerKey → OFFERS' },
    { label: 'Partner', value: u.partnerId, source: 'UnderwriteBody.partnerId — rate card loaded server-side by id' },
    { label: 'Verdict', value: u.verdict, source: 'buildUnderwriteResponse → UnderwriteVerdict' },
    { label: 'Seed', value: String(u.seed), source: 'server-chosen; the run is reproducible from it' },
    { label: 'Samples', value: u.sampleCount.toLocaleString('en-US'), source: 'Underwriting.sampleCount' },
    { label: 'Percentile method', value: res.percentileMethod, source: 'PERCENTILE_METHOD, verbatim off the wire' },
  ];
  if (u.distribution) {
    rows.push({
      label: 'p50 realised margin',
      value: money(u.distribution.p50MarginCents),
      source: `MarginDistribution.p50MarginCents · ${u.distribution.method}`,
    });
  }
  /*
   * `pLoss` IS NULL ON EVERY REFUSAL AND IS NEVER PRINTED AS 0. "No loss risk found" and
   * "loss risk not computable" are opposite statements (`underwrite.ts:1044`); the row is
   * omitted rather than zeroed, and the REFUSED notice above the table is what says why.
   */
  if (u.pLoss != null) {
    rows.push({
      label: 'P(margin < 0)',
      value: prob(u.pLoss),
      source: u.lossSampleCount != null
        ? `Underwriting.pLoss — ${u.lossSampleCount} of ${u.sampleCount} sampled runs`
        : 'Underwriting.pLoss',
    });
  }
  return rows;
}

export function GpsUnderwriting() {
  const [form, setForm] = useState<QuoteForm>(EMPTY_FORM);
  const [res, setRes] = useState<UnderwriteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The uplift currently displayed, in percent. 0 is the baseline. */
  const [uplift, setUplift] = useState(0);

  /**
   * THE SCREEN NEVER READS THE CLOCK. `asOf` is a rejected field
   * (`SERVER_FACT_FIELDS`) precisely because staleness is judged against it and
   * nothing else, so a browser-supplied date would be a browser-supplied verdict on
   * whether an expired rate card may be used. The server resolves one instant per
   * request and it comes back on the payload, which is what the tape prints.
   *
   * That also removes the last thing on this page that could have changed between two
   * identical edits, which is why the numbers cannot shimmer.
   */
  const body = useMemo(() => toRequest(form), [form]);
  /**
   * THE SERIALISED REQUEST IS THE EFFECT'S DEPENDENCY, and it is the mechanism that
   * stops the numbers shimmering rather than a nicety.
   *
   * `body` is a fresh object on every keystroke, so depending on it would re-run the
   * effect — and re-simulate — even when the founder's edit did not change the request
   * (typing then deleting a character, changing a field the request ignores). The
   * string changes only when the payload does, so identical inputs produce exactly one
   * run and the displayed p50 cannot move under a reader who changed nothing. The
   * effect parses it back rather than closing over `body` so the request that is sent
   * is provably the one the dependency was computed from.
   */
  const key = body == null ? null : JSON.stringify(body);

  useEffect(() => {
    if (key == null) { setRes(null); setError(null); setBusy(false); return; }
    let live = true;
    setBusy(true);
    const t = setTimeout(() => {
      underwriteQuote(JSON.parse(key) as UnderwriteBody)
        .then((r) => { if (live) { setRes(r); setError(null); } })
        .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Underwriting failed'); })
        .finally(() => { if (live) setBusy(false); });
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [key]);

  const set = <K extends keyof QuoteForm>(k: K, v: QuoteForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  /**
   * THE INSTANT THE BROWSER READ ITS CLOCK, captured ONCE per page load.
   *
   * Two instants go onto the printed sheet and they are not the same fact: this one is when
   * the operator was looking, `res.asOf` is when the SERVER computed the figures. A sheet
   * dated only to the read is a sheet that cannot be told from a stale one, which is why
   * `GpsPrintArtefact` raises a notice when the second is absent rather than substituting
   * the first. A ref, not state: re-reading the clock per render would make the dateline
   * move under a reader who changed nothing, which is the defect the request key above
   * exists to prevent for the numbers.
   */
  const readAtRef = useRef<string>();
  readAtRef.current ??= new Date().toISOString();

  /**
   * HOW A COMPUTED VERDICT NOW FEELS, and the asymmetry is the point.
   *
   * Before this, pressing Compute produced a refusal and a distribution with exactly the
   * same silence. `underwriteFeel` maps the eight verdicts onto three outcomes, and the
   * split it draws is the one that matters commercially: `refused_price_not_set` and the
   * other four missing-input verdicts are UNDETERMINED, not refused, because the input
   * nobody supplied is the founder's and shaking at an operator for it is a lie about whose
   * problem it is (`lib/gpsFeel.ts:216`).
   *
   * Fired from an effect keyed on the verdict rather than inside the fetch, so a re-render
   * cannot re-announce a verdict the operator has already been told about, and so the DOM
   * node the reaction lands on exists by then.
   */
  const answerRef = useRef<HTMLDivElement | null>(null);
  const verdict = res?.underwriting.verdict ?? null;
  useEffect(() => {
    if (verdict == null) return;
    const { outcome, because } = underwriteFeel(verdict);
    signalGps(answerRef.current, outcome, `${UNDERWRITE_VERDICT_LABEL[verdict]} — ${because}`);
  }, [verdict]);

  useEffect(() => {
    if (error == null) return;
    signalGps(answerRef.current, 'undetermined', `${error} No distribution is shown.`);
  }, [error]);

  return (
    <div className="br-page mx-auto max-w-[1500px] p-5">
      <PrintStyles />
      <PageTitle
        icon={<Calculator size={20} />}
        subtitle="Type a price. The answer is a distribution of realised margin, the probability it loses money, and the reasons it runs over — not a number."
        actions={
          /*
           * THE PRINT CONTROL MOVED ONTO THE ARTEFACT, and the `.dark`-stripping dance it
           * used to do is gone with it. That dance removed `.dark` from `<html>`, waited
           * 60ms, called `window.print()` and put the class back — which cannot help a plain
           * ⌘P (the one an operator actually presses) and restores the class under a
           * blocking print job, so the sheet could come out of the restore half dark.
           * `pages/Wbr.tsx:60` removed exactly this for exactly this reason.
           * `styles/gpsPrint.css` neutralises the surviving `dark:` variants inside the
           * artefact instead, which works for ⌘P too.
           */
          <div className="br-no-print flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setForm(EMPTY_FORM); setRes(null); setUplift(0); }}>
              <RotateCcw size={13} /> Clear
            </Button>
          </div>
        }
      >
        Underwriting · price in, distribution out
      </PageTitle>

      <div className="space-y-4">
        <QuoteBar form={form} set={set} />

        {/* THE STAMP. This screen prints, and what it prints is a price with a loss
            probability beside it — the most quotable artefact in the compartment.
            NOTE WHAT IT WILL SAY: `UnderwriteBody` carries no jurisdiction (there is no
            field for one, deliberately — the simulation is about effort and cost), so
            the reading resolves to "no jurisdiction is even named on this screen". That
            is the honest sentence for a distribution computed with no place attached to
            it, and it is louder than a per-jurisdiction one, not quieter. */}
        <LegalPositionStamp reading={readLegalPosition([res])} subject="underwritten price" />

        {/* WHAT THE SIMULATION DECLARES ABOUT ITS OWN BASIS. `envelope()`
            (routes/gpsUnderwrite.ts:161) carries `migrated` — false when the rate-card
            registry is absent, i.e. when the cost side of every figure below came from
            nothing — and `issueDecisionIsAdvisory`, which is the difference between the
            block verdict on this screen and the guard's verdict at issue. Both used to
            travel in `meta` and die in the fetch layer, so a distribution computed
            without a rate card printed a p50 that read like a price. */}
        <GpsMetaBanner className="mt-0" of={[res]} />

        <InputProvenance form={form} res={res} set={set} />

        {error ? (
          <EmptyState
            variant="error"
            title="Underwriting unavailable"
            description={`${error} — no distribution is shown, because a screen that fills in a band when the server did not answer is the failure this phase exists to correct.`}
          />
        ) : body == null ? (
          <EmptyState
            variant="default"
            title="Nothing to underwrite yet"
            description="Enter a price and the partner who would deliver it. Both are required: the price is the thing being argued with, and the rate card the cost is drawn from is loaded server-side by partner id. Nothing is assumed for either."
          />
        ) : res == null ? (
          <p className="rounded-lg border border-line bg-card px-4 py-3 font-mono text-micro text-grey shadow-card">
            Running {'…'} 4,000 seeded samples over partner effort and recorded-overrun ratios.
          </p>
        ) : (
          /*
           * THE ARTEFACT WRAPPER, and it is only around the ANSWER.
           *
           * Not around the whole page: the quote bar is the input, and a printed sheet that
           * carries the fields you were typing into is a screenshot, not a document. The
           * notices, the dateline and the provenance table belong above and below the figures
           * they qualify, which is where they land here.
           *
           * `sources` is every payload this screen holds — one, `res`. `gpsPrintCaveats`
           * reads it for the distribution BASIS, for `migrated` and for the perimeter, and
           * resolves an absent field to UNVERIFIED rather than to clean, so handing it the
           * response is not an optimisation of a longer list: it is the whole list, and if
           * this screen ever holds a second payload it must be added here or the sheet will
           * quietly stop qualifying it.
           *
           * `refusals` is the underwriting verdict reprinted with the guard's own reasons.
           * `gpsUnderwritingRefusal` returns null when the quote was underwritten, so the
           * REFUSED block appears exactly when `Refusal` does inside `Answer` — one verdict,
           * said once on screen and once on paper, never derived twice.
           */
          <GpsPrintArtefact
            kind="underwriting"
            title={`${res.underwriting.offerKey} · ${money(res.underwriting.priceCents)} ${res.underwriting.currency}`}
            asOf={readAtRef.current!}
            computedAt={res.asOf}
            sources={[res]}
            refusals={[gpsUnderwritingRefusal(res.underwriting)].filter(
              (r): r is NonNullable<typeof r> => r != null,
            )}
            provenance={printProvenance(res)}
          >
            <div ref={answerRef}>
              <Answer res={res} busy={busy} uplift={uplift} setUplift={setUplift} />
            </div>
          </GpsPrintArtefact>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE QUOTE — one dense row, not a form                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

type Setter = <K extends keyof QuoteForm>(k: K, v: QuoteForm[K]) => void;

/**
 * The commercial inputs, on one line.
 *
 * Not a card, not a two-column form, not a wizard. Four fields decide the answer
 * and they belong in the founder's eyeline at the same time as the answer, because
 * the interaction this screen exists for is "nudge the price, watch P(loss) move".
 * A form that pushes the distribution below the fold has already lost.
 */
function QuoteBar({ form, set }: { form: QuoteForm; set: Setter }) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-card p-3 shadow-card">
      <div className="w-64">
        <Select
          label="Offer"
          value={form.offerKey}
          onChange={(e) => set('offerKey', e.target.value as OfferKey)}
          options={OFFERS.map((o) => ({ value: o.key, label: o.name }))}
        />
      </div>
      <div className="w-44">
        <Input
          label="Price to client"
          inputMode="decimal"
          placeholder="no price yet"
          value={form.priceDollars}
          onChange={(e) => set('priceDollars', e.target.value)}
          data-testid="price-input"
          className="font-mono tabular-nums"
        />
      </div>
      <div className="w-20">
        <Input
          label="CCY"
          value={form.currency}
          onChange={(e) => set('currency', e.target.value)}
          className="font-mono uppercase"
        />
      </div>
      <div className="w-56">
        <Input
          label="Partner id (delivers)"
          placeholder="no bench roster recorded"
          value={form.partnerId}
          onChange={(e) => set('partnerId', e.target.value)}
          data-testid="partner-input"
          className="font-mono"
        />
      </div>
      <div className="w-44">
        <Input
          label="Vendor cost on the quote"
          inputMode="decimal"
          placeholder="optional cross-check"
          value={form.quotedVendorDollars}
          onChange={(e) => set('quotedVendorDollars', e.target.value)}
          className="font-mono tabular-nums"
        />
      </div>
      <p className="min-w-[16rem] flex-1 text-[10px] leading-snug text-grey">
        The partner id is TYPED because no bench roster exists — <span className="font-mono">PARTNER_BENCH</span> is
        empty by construction (<span className="font-mono">partners.ts:307</span>), no partner has been named and no
        rate card has been supplied. The server loads the card by this id and by offer; the browser cannot send one,
        so it cannot choose its own cost basis and read back a margin that agrees with it. An id with no card comes
        back as a stated refusal, which is the correct answer and not a gap in this screen.
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE ONE EDITABLE BLOCK OF UNSUPPLIED INPUTS (§12)                           */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * EVERY UNSUPPLIED FOUNDER INPUT, IN ONE PLACE, BADGED.
 *
 * `GPS_100X_PLAN.md` §12 requires one editable block rather than placeholders
 * scattered across the surface, and `TODO_EFFORT_DAYS` / `TODO_PRICE_BANDS` /
 * `TODO_VENDOR_COSTS` are each single blocks in the shared layer for the same
 * reason: replacing them is one edit with no stale number surviving elsewhere.
 *
 * THE EFFORT TRIPLE IS THE ONE INPUT THAT MATTERS MOST. It is what turns this
 * screen from a prior into a model (`underwrite.ts:104`), it is unsupplied, and its
 * shipped placeholder is stamped `system:placeholder` at the UNIX epoch so it can
 * never look freshly confirmed. The fields below are seeded from whatever the
 * server actually used, on request — pressing "adopt" copies the placeholder into
 * the inputs so he can edit real numbers over it, and the moment all four fields
 * are filled the request carries an override and the response stops calling it a
 * placeholder. Nothing here fakes that transition: a partially typed triple is sent
 * as no triple at all.
 *
 * `statedBy` is REQUIRED for an override and it is not pre-filled with a session
 * identity. A pessimistic estimate's only route to correction is the record of who
 * estimated it (`underwrite.ts:78`), and a service account cannot be asked why.
 */
function InputProvenance({ form, res, set }: { form: QuoteForm; res: UnderwriteResponse | null; set: Setter }) {
  const u = res?.underwriting;
  const effort = u?.effort ?? null;
  const overriding = form.optimisticDays !== '' || form.likelyDays !== '' || form.pessimisticDays !== '';
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.04] shadow-card">
      {/* THE UNRESOLVED LIST IS NOT BEHIND A DISCLOSURE, and the first draft of this
        * block had it inside the `<details>` below. `underwrite.ts:1789` says what it is
        * for in as many words — "rendered as a blocking banner, not a footnote: every
        * number on the screen is arithmetic over these" — and a collapsed banner is a
        * footnote with extra steps. The EDITOR collapses; the WARNING does not.
        * `pages/__tests__/gpsUnderwriting.test.tsx` asserts the list has no `<details>`
        * ancestor, which is the only sense in which jsdom can check "not hidden". */}
      <div className="px-4 py-2">
        <div className="text-micro font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          Unsupplied inputs — every number on this screen stands on these
          {u?.effortIsPlaceholder && <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px]">effort triple is a PLACEHOLDER</span>}
        </div>
        {res != null && res.unresolvedInputs.length > 0 && (
          <ul className="mt-1.5 space-y-1" data-testid="unresolved-inputs">
            {res.unresolvedInputs.map((s) => (
              <li key={s} className="flex gap-2 text-micro leading-snug text-grey-dark">
                <span className="text-amber-600 dark:text-amber-400">▲</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <details className="border-t border-amber-500/30" open={res == null || u?.effortIsPlaceholder === true}>
      <summary className="cursor-pointer px-4 py-2 text-micro font-bold uppercase tracking-wider text-grey">
        Supply them here — one editable block
      </summary>
      <div className="space-y-3 px-4 pb-3">
        <div className="flex flex-wrap items-end gap-2">
          <EffortField label="Optimistic (d)" v={form.optimisticDays} onChange={(x) => set('optimisticDays', x)} />
          <EffortField label="Likely (d)" v={form.likelyDays} onChange={(x) => set('likelyDays', x)} />
          <EffortField label="Pessimistic (d)" v={form.pessimisticDays} onChange={(x) => set('pessimisticDays', x)} />
          <div className="w-40">
            <Input label="Pass-through cost ($)" inputMode="decimal" value={form.fixedCostDollars} onChange={(e) => set('fixedCostDollars', e.target.value)} className="font-mono text-micro tabular-nums" />
          </div>
          {effort != null && effort.isPlaceholder && !overriding && (
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                set('optimisticDays', String(effort.optimisticDays));
                set('likelyDays', String(effort.likelyDays));
                set('pessimisticDays', String(effort.pessimisticDays));
              }}
            >
              Adopt the placeholder to edit over it
            </Button>
          )}
        </div>
        {effort != null && <EffortProvenance effort={effort} />}
        <p className="text-[10px] leading-snug text-grey">
          TWO FIELDS ARE DELIBERATELY ABSENT HERE. <span className="font-bold">Stated by</span> is taken from the
          signed-in session, not typed, so a triple is a record of who estimated it rather than an assertion about who
          did. <span className="font-bold">Hours per day</span> belongs on the rate-card row, stated by whoever
          recorded the rate: it bridges an hourly card to a triple in days, a smaller number is a smaller cost, and an
          hourly card with no hours on record is a refusal rather than an assumed 8. The server rejects both if a
          client sends them, so there is no input for either.
        </p>
      </div>
      </details>
    </div>
  );
}

function EffortField({ label, v, onChange }: { label: string; v: string; onChange: (v: string) => void }) {
  return (
    <div className="w-28">
      <Input label={label} inputMode="decimal" value={v} onChange={(e) => onChange(e.target.value)} className="font-mono text-micro tabular-nums" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE ANSWER                                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Order matters and is argued for, because this is the reading order of a
 * consequential decision:
 *
 *  1. THE BASIS. Before any number, what kind of number it is. A reader who sees
 *     the band first has already believed it.
 *  2. THE HEADLINE. P(margin < 0) in words, and the block if there is one.
 *  3. THE DISTRIBUTION. Band, percentiles, cost, and the overrun slider on it.
 *  4. THE VARIANCE. Which input owns the spread, and the openable trail.
 *  5. THE GATE. Every check, both sides of each comparison.
 *  6. THE ARGUMENT AGAINST. The devil's advocate and its source.
 *  7. THE METHOD. Read off the wire, printed last, printed in full.
 */
function Answer({ res, busy, uplift, setUplift }: {
  res: UnderwriteResponse; busy: boolean; uplift: number; setUplift: (v: number) => void;
}) {
  const u = res.underwriting;
  const refused = isRefusal(u.verdict);
  /* Lifted rather than owned by `Variance` so the band-width figure in the
   * percentile table can open the same trail — D1 is "one interaction", and a
   * number whose explanation lives behind a different control fails it. */
  const [trail, setTrail] = useState(false);

  return (
    <div className={clsx('space-y-4 transition-opacity', busy && 'opacity-60')}>
      <Tape res={res} busy={busy} />
      <BasisDisclosure u={u} />

      {refused ? (
        <Refusal u={u} />
      ) : (
        <>
          <Headline u={u} issue={res.issue} />
          <Distribution res={res} uplift={uplift} setUplift={setUplift} onOpenTrail={() => setTrail(true)} />
          <Variance v={u.varianceDriver} drivers={u.drivers} open={trail} onToggle={() => setTrail((p) => !p)} />
        </>
      )}

      <IssueGate issue={res.issue} policyNotice={res.policyNotice} />
      <Advocate d={res.devilsAdvocate} />
      <Reasons u={u} />
      <Method res={res} />
    </div>
  );
}

/** The run's identity, on one line: what it priced, with what seed, as of when. */
function Tape({ res, busy }: { res: UnderwriteResponse; busy: boolean }) {
  const u = res.underwriting;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-card px-4 py-2 font-mono text-micro tabular-nums shadow-card">
      <span className="text-grey">price <span className="font-bold text-navy">{money(u.priceCents)}</span> {u.currency}</span>
      <span className="text-grey">offer <span className="text-navy">{u.offerKey}</span></span>
      <span className="text-grey">partner <span className="text-navy">{u.partnerId}</span></span>
      {/* `'usable'` is the only non-hazard state of the three (`partners.ts:205`);
        * `no_validity_stated` is amber and not grey on purpose — a card with no expiry
        * is not a fresh card, it is a card nobody dated. */}
      <span className="text-grey">rate card <span className={clsx('font-bold', u.rateCardStatus === 'usable' ? 'text-navy' : 'text-amber-600 dark:text-amber-400')}>{u.rateCardStatus}</span></span>
      <span className="text-grey">samples <span className="text-navy">{u.sampleCount.toLocaleString('en-US')}</span></span>
      <span className="text-grey">seed <span className="text-navy">{u.seed}</span></span>
      <span className="ml-auto text-grey">
        {busy && <span className="mr-2 font-bold text-cyan-700 dark:text-cyan-400">recomputing {'…'}</span>}
        as of <span className="text-navy">{res.asOf}</span>
      </span>
    </div>
  );
}

/* ── 1. THE BASIS — impossible to mistake a prior for a measurement (D8) ────── */

/**
 * WHAT KIND OF NUMBER THIS IS, ABOVE THE NUMBER.
 *
 * `basis` is not a display string. It is derived from `OutcomeBlend.weight` — the
 * probability a sample actually draws an empirical figure instead of the prior's
 * neutral 1.00 — so `'prior'` on this banner is a fact about the arithmetic that
 * produced the percentiles below it (`underwrite.ts:473`).
 *
 * THE `prior` CASE IS RENDERED AS A WALL, and that is the single most important
 * decision on this page. A footnote saying "estimates may vary" under a
 * confident-looking $6,000-to-$11,000 band is how confident nonsense ships. The
 * banner is red-amber, it is above the band, it prints, and it names both the
 * mechanism (founder-entered effort × a rate card, propagated through arithmetic)
 * and the falsifier (the first recorded partner invoice).
 *
 * AND IT DOES NOT PROMISE THE BAND WILL NARROW. `underwrite.ts:504` is explicit:
 * if partners routinely invoice 1.3× the quote, recorded outcomes MOVE the band
 * down and may WIDEN it. Saying "this will tighten as outcomes land" would be a
 * pleasant claim with no mechanism behind it — the honest sentence is that it will
 * change shape.
 */
function BasisDisclosure({ u }: { u: Underwriting }) {
  /**
   * A REFUSAL HAS NO DISTRIBUTION TO DISCLOSE THE BASIS OF, and the first draft of
   * this component printed "this distribution comes from founder-entered effort
   * estimates" on a refused quote — a claim about an object that does not exist.
   * `underwrite.ts:1075` fills `basisReason` on that path with exactly the right
   * sentence ("no distribution was produced … describes only what the inputs WOULD
   * have been"), so the fix is to let the module's own wording stand alone and
   * suppress ours. The page is not allowed to be more confident than the payload.
   */
  const prior = u.basis === 'prior' && !isRefusal(u.verdict);
  return (
    <section
      data-testid="basis-disclosure"
      data-basis={u.basis}
      className={clsx(
        'rounded-lg border p-4 shadow-card',
        prior ? 'border-amber-500 bg-amber-500/[0.07]' : 'border-line bg-card',
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-micro font-bold uppercase tracking-wider text-grey">Basis</span>
        <span className={clsx('font-mono text-base font-bold uppercase', BASIS_TONE[u.basis])} data-testid="basis-code">
          {u.basis}
        </span>
        {prior && (
          <span className="text-label font-bold text-amber-700 dark:text-amber-400" data-testid="prior-warning">
            This distribution comes from founder-entered effort estimates, not from recorded outcomes. It is a prior,
            not a measurement, and it must not be presented as one.
          </span>
        )}
      </div>
      <p className="mt-1.5 text-micro leading-snug text-grey-dark">{u.basisReason}</p>
      <p className="mt-1 font-mono text-[10px] text-grey">
        Cost draw: <span className="font-bold text-navy tabular-nums">{Math.round(u.blend.weight * 100)}%</span> from
        {' '}<span className="text-navy tabular-nums">{u.blend.sampleSize}</span> usable recorded outcome{u.blend.sampleSize === 1 ? '' : 's'}
        {u.blend.medianRatio != null && <> · median realised/quoted cost ratio <span className="font-bold text-navy tabular-nums">{u.blend.medianRatio}×</span></>}
        {u.blend.excluded.length > 0 && <> · <span className="text-amber-600 dark:text-amber-400">{u.blend.excluded.length} outcome(s) excluded, each with a reason</span></>}
      </p>
      {u.blend.excluded.length > 0 && (
        /* D2: an excluded row is never silent. Every drop carries its own sentence. */
        <ul className="mt-1.5 space-y-0.5">
          {u.blend.excluded.map((e) => (
            <li key={e.engagementId} className="font-mono text-[10px] text-grey-dark">
              <span className="text-grey">{e.engagementId}</span> — {e.reason}
            </li>
          ))}
        </ul>
      )}
      {prior && (
        <p className="mt-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-400">
          What would change this: one recorded partner invoice against a quoted vendor cost. Note what is NOT promised —
          the band will not necessarily narrow. If partners routinely invoice above the quote, recorded outcomes move
          this band down and may widen it. That is the model telling the truth for the first time, not a regression.
        </p>
      )}
    </section>
  );
}

/* ── 2. THE REFUSAL, and it replaces the answer rather than sitting beside it ── */

/**
 * SEVEN OF THE EIGHT VERDICTS ARE REFUSALS (`underwrite.ts:291`), and a refusal is
 * this screen's most common honest output today: no rate card has been supplied, so
 * an unknown partner id produces one.
 *
 * There is no band, no percentile, no slider and no P(loss) in this branch — not a
 * greyed-out one, not a zeroed one. `pLoss` is null on a refusal and never 0,
 * because "no loss risk found" and "loss risk not computable" are opposite
 * statements (`underwrite.ts:988`), and a screen that renders 0.0% for the second
 * one has told a lie the shared module went out of its way not to tell.
 */
function Refusal({ u }: { u: Underwriting }) {
  return (
    <section className="rounded-lg border-2 border-red-500 bg-red-500/[0.06] p-4 shadow-card" data-testid="refusal">
      <div className="flex flex-wrap items-baseline gap-3">
        <ShieldAlert size={18} className="text-red-600 dark:text-red-400" />
        <span className="text-base font-bold uppercase tracking-wide text-red-600 dark:text-red-400">
          {UNDERWRITE_VERDICT_LABEL[u.verdict]}
        </span>
        <span className="font-mono text-micro text-grey" data-testid="refusal-code">{u.verdict}</span>
      </div>
      <p className="mt-2 text-label leading-snug text-grey-dark">
        No distribution was produced, so none is shown. Nothing on this screen estimates a margin for this quote — a
        band drawn over a refusal is the failure this phase exists to correct.
      </p>
      <ul className="mt-2 space-y-1">
        {u.reasons.map((r) => (
          <li key={r} className="flex gap-2 text-micro leading-snug text-grey-dark">
            <span className="text-red-600 dark:text-red-400">—</span><span>{r}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 font-mono text-[10px] text-grey">
        Reproducible: seed {u.seed} · {u.sampleCount.toLocaleString('en-US')} samples · as of {u.asOf}. A refusal is
        reported with its seed for the same reason a result is — reproducing a refusal matters as much.
      </p>
    </section>
  );
}

/* ── 3. THE HEADLINE — P(margin < 0), in words (D4) ─────────────────────────── */

/**
 * THE ONE FIGURE THIS ENTIRE PHASE EXISTS TO PRODUCE, and it is a sentence before
 * it is a number.
 *
 * "At this price you lose money in 23% of simulated outcomes" is the plan's own
 * example of the system arguing back (`GPS_100X_PLAN.md` §1 D4), and it is written
 * out in full rather than left as a percentage in a table because a percentage in a
 * table is a fact and a sentence is an argument.
 *
 * MATERIALITY IS NOT DECIDED HERE. The escalation to "THIS PRICE IS WRONG" fires on
 * `issue.failed` containing `p_loss_above_threshold` — i.e. the server's policy
 * decided, against a threshold this screen prints beside the observation. Inventing
 * a second display threshold in the web layer would produce a screen that shouts at
 * one number and blocks at another, which is how a governed block gets routed
 * around.
 *
 * P(loss) IS A POINT ESTIMATE AND THAT IS CORRECT. D3 bans point estimates on
 * decision-bearing MARGINS, where the uncertainty is the subject. `pLoss` is a
 * counted proportion of a fully enumerated sample — `lossSampleCount / sampleCount`,
 * both printed here so the fraction can be checked by hand — not an estimate with a
 * band of its own.
 */
function Headline({ u, issue }: { u: Underwriting; issue: IssueDecision }) {
  const pLoss = u.pLoss;
  const over = issue.failed.some((c) => c.code === 'p_loss_above_threshold');
  const appetite = issue.policy.maxPLoss;

  if (pLoss == null) return null;

  return (
    <section
      data-testid="ploss-headline"
      data-over-appetite={over ? 'true' : 'false'}
      className={clsx(
        'rounded-lg border-2 p-4 shadow-card',
        over ? 'border-red-500 bg-red-500/[0.06]' : pLoss > 0 ? 'border-amber-500/60 bg-card' : 'border-line bg-card',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div>
          <div className="text-micro font-bold uppercase tracking-wider text-grey">P(margin {'<'} 0)</div>
          <div
            className={clsx('font-mono text-3xl font-bold tabular-nums', over ? 'text-red-600 dark:text-red-400' : pLoss > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}
            data-testid="ploss-value"
          >
            {prob(pLoss)}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {over ? (
            <p className="text-base font-bold leading-snug text-red-600 dark:text-red-400" data-testid="price-is-wrong">
              This price is wrong. At {money(u.priceCents)} {u.currency} you lose money in {prob(pLoss)} of simulated
              outcomes — {u.lossSampleCount?.toLocaleString('en-US')} of {u.sampleCount.toLocaleString('en-US')} —
              against a stated appetite of {prob(appetite)}. Issuing a proposal at this price is blocked below.
            </p>
          ) : pLoss > 0 ? (
            <p className="text-label leading-snug text-grey-dark" data-testid="ploss-sentence">
              At {money(u.priceCents)} {u.currency} this engagement loses money in {prob(pLoss)} of simulated outcomes
              ({u.lossSampleCount?.toLocaleString('en-US')} of {u.sampleCount.toLocaleString('en-US')}), which is
              within the stated appetite of {prob(appetite)} — so it is reported, not blocked.
            </p>
          ) : (
            <p className="text-label leading-snug text-grey-dark" data-testid="ploss-sentence">
              No simulated outcome loses money at {money(u.priceCents)} {u.currency}, under these inputs. That is a
              statement about the inputs and not a guarantee: the pessimistic effort figure is the ceiling this model
              knows about, and reality is not bounded by it.
            </p>
          )}
          <p className="mt-1 font-mono text-[10px] text-grey">
            ICD-203: <span className="font-bold text-navy">{u.pLossLikelihood?.term}</span> ({u.pLossLikelihood?.pct}%)
            {' · '}{u.lossSampleCount?.toLocaleString('en-US')} of {u.sampleCount.toLocaleString('en-US')} samples
            {' · counted, not fitted'}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── The ONLY way a margin renders on this page (D3, mechanised) ────────────── */

/**
 * A MARGIN FIGURE, WHICH CANNOT BE RENDERED WITHOUT SAYING WHICH PERCENTILE IT IS.
 *
 * `percentile` is a required prop and lands in `data-percentile`; the element also
 * carries `data-margin-figure`. `gpsUnderwriting.test.tsx` then asserts (a) every
 * `[data-margin-figure]` has a non-empty `data-percentile`, and (b) `p10`, `p50` and
 * `p90` occur in equal numbers — so a future edit that adds "Margin: $6,000" on its
 * own turns the suite red rather than looking neat.
 *
 * This is D3 as a MECHANISM rather than as a habit, which is the only form of it
 * that survives the next person in the file. `MarginDistribution` deliberately has
 * no `marginCents` field for the same reason (`underwrite.ts:671`): the moment a
 * point estimate exists it becomes the field every surface renders.
 */
function Figure({ percentile, cents, tone, size = 'md' }: {
  percentile: string; cents: number; tone?: 'auto' | 'muted'; size?: 'md' | 'lg' | 'sm';
}) {
  const negative = cents < 0;
  return (
    <span
      data-margin-figure=""
      data-percentile={percentile}
      className={clsx(
        'font-mono font-bold tabular-nums',
        size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-[10px]' : 'text-label',
        tone === 'muted' ? 'text-grey' : negative ? 'text-red-600 dark:text-red-400' : 'text-navy',
      )}
    >
      {money(cents)}
    </span>
  );
}

/* ── 4. THE DISTRIBUTION ────────────────────────────────────────────────────── */

const SVG_W = 1000;
const SVG_H = 100;
const PAD_L = 8;
const PAD_R = 8;

/** Linear map from cents to viewBox x. Degenerate domains land in the middle. */
function scaler(lo: number, hi: number): (c: number) => number {
  const span = hi - lo;
  if (!(span > 0)) return () => SVG_W / 2;
  return (c) => PAD_L + ((c - lo) / span) * (SVG_W - PAD_L - PAD_R);
}

/**
 * THE BAND, DRAWN FROM THE ORDER STATISTICS AND NOTHING ELSE.
 *
 * Inline SVG, no charting dependency — the bundle has ~26KB of headroom and a
 * budget test that fails the build, and a box-and-whisker of five numbers does not
 * need 40KB of library.
 *
 * IT IS NOT A DENSITY, AND THE CAPTION SAYS SO. The obvious prettier choice is a
 * smooth curve, and it would be a fabrication: the server returns p05/p10/p50/p90/p95
 * plus min and max, and a curve drawn through seven points asserts a shape for the
 * 3,993 samples nobody sent. Nearest-rank order statistics mean every mark on this
 * chart IS an observed sample (`PERCENTILE_METHOD`), and nothing between two marks is
 * drawn as if it were known.
 *
 * ZERO IS ALWAYS IN THE DOMAIN, and the loss region is shaded. A margin band that
 * scrolls the break-even line off the edge of its own axis is the one rendering that
 * would defeat the purpose of the page.
 */
function Band({ d, selected, uplift, currency }: {
  d: MarginDistribution; selected: OverrunPoint; uplift: number; currency: string;
}) {
  const lo = Math.min(d.minMarginCents, selected.p10MarginCents, 0);
  const hi = Math.max(d.maxMarginCents, selected.p90MarginCents, 0);
  const pad = Math.max(1, Math.round((hi - lo) * 0.03));
  const x = scaler(lo - pad, hi + pad);
  const zero = x(0);
  const pctLeft = (c: number) => `${(x(c) / SVG_W) * 100}%`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        className="block h-24 w-full"
        role="img"
        aria-label={
          `Realised margin band in ${currency} at ${uplift === 0 ? 'the baseline effort' : `+${uplift}% effort`}: ` +
          `p10 ${money(selected.p10MarginCents)}, p50 ${money(selected.p50MarginCents)}, p90 ${money(selected.p90MarginCents)}. ` +
          `Break-even at zero is ${selected.p10MarginCents < 0 ? 'inside' : 'outside'} the p10–p90 band. ` +
          `P(margin below zero) ${prob(selected.pLoss)}.`
        }
      >
        {/* The loss region, and the break-even line. Drawn FIRST so the band sits on top. */}
        <rect x={0} y={0} width={Math.max(0, zero)} height={SVG_H} className="fill-red-500/10" />
        <line x1={zero} y1={0} x2={zero} y2={SVG_H} className="stroke-red-500" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />

        {/* The baseline band as a ghost, only once an uplift is selected: the point of
          * the slider is the COMPARISON, and a chart that redraws in place without
          * leaving the baseline behind makes the reader hold it in memory. */}
        {uplift !== 0 && (
          <rect
            x={x(d.p10MarginCents)} y={16} width={Math.max(1, x(d.p90MarginCents) - x(d.p10MarginCents))} height={9}
            className="fill-grey/25 stroke-grey/50" strokeWidth={1} vectorEffect="non-scaling-stroke"
          />
        )}

        {/* p05–p95 whiskers. BASELINE ONLY, and the caption says why: `OverrunPoint`
          * carries p10/p50/p90 and nothing else (`underwrite.ts:1179`), so drawing
          * whiskers on an uplifted point would mean inventing two percentiles. */}
        {uplift === 0 && (
          <>
            <line x1={x(d.p05MarginCents)} y1={55} x2={x(d.p95MarginCents)} y2={55} className="stroke-navy/40" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <line x1={x(d.p05MarginCents)} y1={45} x2={x(d.p05MarginCents)} y2={65} className="stroke-navy/40" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <line x1={x(d.p95MarginCents)} y1={45} x2={x(d.p95MarginCents)} y2={65} className="stroke-navy/40" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </>
        )}

        {/* The p10–p90 band of the SELECTED point. */}
        <rect
          x={x(selected.p10MarginCents)} y={36}
          width={Math.max(1.5, x(selected.p90MarginCents) - x(selected.p10MarginCents))} height={38}
          className="fill-cyan-500/20 stroke-cyan-600" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
        />
        {/* The median, as a tick inside the band and never as the band. */}
        <line x1={x(selected.p50MarginCents)} y1={32} x2={x(selected.p50MarginCents)} y2={78} className="stroke-navy" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      </svg>

      {/* The numbers as HTML, not SVG text, so every one of them goes through
        * `<Figure>` and inherits the D3 mechanism. */}
      <div className="relative mt-1 h-8">
        {([['p10', selected.p10MarginCents], ['p50', selected.p50MarginCents], ['p90', selected.p90MarginCents]] as const).map(([p, c]) => (
          <span key={p} className="absolute -translate-x-1/2 whitespace-nowrap text-center" style={{ left: pctLeft(c) }}>
            <span className="block font-mono text-[10px] uppercase text-grey">{p}</span>
            <Figure percentile={p} cents={c} size="sm" />
          </span>
        ))}
        <span className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10px] font-bold text-red-600 dark:text-red-400" style={{ left: pctLeft(0), top: '1.1rem' }}>
          break-even
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-grey">
        Order-statistic band, not a density: only the percentiles the server returned are drawn, and every mark is an
        observed sample. Nothing between two marks is estimated. Shaded region is margin below zero.
        {uplift !== 0 && ' Grey ghost is the baseline band; p05/p95 whiskers are baseline-only because an uplifted point carries p10/p50/p90 and nothing else.'}
      </p>
    </div>
  );
}

/**
 * THE BAND, THE PERCENTILES, THE COSTS AND THE OVERRUN SLIDER, on one surface.
 *
 * THE SLIDER DOES NOT REFETCH. `sensitivity.points` already contains the baseline
 * and every uplift, computed in the same call under COMMON RANDOM NUMBERS — the
 * sampled effort is multiplied by (1 + uplift) with the seed, the draw order and the
 * overrun ratios held byte-identical (`OVERRUN_METHOD`). So moving the slider selects
 * an already-computed point instead of launching a new simulation, which buys three
 * things at once: it is instant, it cannot shimmer, and the comparison against the
 * baseline is sample-by-sample rather than run-against-run. That last one is why
 * `sensitivity.monotone` is arithmetic rather than statistical, and it is printed
 * below as a checked property rather than asserted in a comment (D8).
 */
function Distribution({ res, uplift, setUplift, onOpenTrail }: {
  res: UnderwriteResponse; uplift: number; setUplift: (v: number) => void; onOpenTrail: () => void;
}) {
  const u = res.underwriting;
  const d = u.distribution;
  const s = res.sensitivity;

  if (d == null) {
    // Unreachable by the module's own contract — `distribution` is null on every
    // refusal and this branch runs only for `underwritten`. Stated rather than
    // returning null anyway: a blank region would be the one failure mode this page
    // must never have, a missing answer that looks like an answered nothing.
    return (
      <section className="rounded-lg border border-red-500 bg-card p-4 text-label text-red-600 dark:text-red-400">
        The server reported verdict <span className="font-mono">{u.verdict}</span> with no distribution attached. That
        combination should be impossible; nothing is being estimated in its place.
      </section>
    );
  }

  const points = s.points;
  const idx = Math.max(0, points.findIndex((p) => p.effortUpliftPct === uplift));
  const selected = points[idx] ?? {
    effortUpliftPct: 0,
    p10MarginCents: d.p10MarginCents, p50MarginCents: d.p50MarginCents, p90MarginCents: d.p90MarginCents,
    p50MarginPct: d.p50MarginPct, pLoss: u.pLoss ?? 0, deltaP50Cents: 0, deltaPLoss: 0,
  };

  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-micro font-bold uppercase tracking-wider text-grey">
          Realised margin · distribution ({u.currency})
        </span>
        <span className="font-mono text-[10px] text-grey">
          showing <span className="font-bold text-navy">{uplift === 0 ? 'baseline effort' : `+${uplift}% effort`}</span>
          {' · '}p10–p90 band, median tick, break-even shaded
        </span>
      </div>

      <Band d={d} selected={selected} uplift={uplift} currency={u.currency} />

      <OverrunControl s={s} points={points} idx={idx} setUplift={setUplift} />

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <PercentileTable d={d} u={u} onOpenTrail={onOpenTrail} />
        <SensitivityTable s={s} points={points} selectedIdx={idx} setUplift={setUplift} />
      </div>

      <div className="mt-4">
        <MarginSurface res={res} />
      </div>

      <p className="mt-2 text-[10px] leading-snug text-grey" data-testid="percentile-method">{res.percentileMethod}</p>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════════ */
/* THE MARGIN SURFACE — the one figure on this platform that needs three dimensions   */
/* ══════════════════════════════════════════════════════════════════════════════════ */

/**
 * `SensitivityTable`, directly above this, is the 2-D slice: it holds the price at the
 * quoted number and walks the effort overrun. It answers "what does an overrun cost me".
 * It cannot answer the question the desk actually asks, which is **"how much price buys
 * back an overrun"** — that is a relationship between TWO independent variables, and a
 * table with the price fixed has no column for it.
 *
 * So the third axis here is not decoration, and the test the plan sets for this whole
 * track is met concretely: remove a dimension and a specific fact becomes unreadable.
 *
 * ── WHY EVERY HEIGHT IS ARITHMETIC AND NOT A SECOND SIMULATION ────────────────────
 * The engine returns, per overrun point, the median margin AT THE QUOTED PRICE. Median
 * cost is recovered exactly: cost = price − p50 margin. That is not an approximation —
 * margin is a decreasing affine transform of cost at a fixed price, so the median maps
 * through it exactly. Vendor cost does not move because LCX charges more, so re-pricing
 * against that fixed simulated cost is arithmetic, and it is done by `marginPct`, the
 * same pure function the quote itself uses. No second Monte Carlo is run, nothing is
 * refetched, and no percentile is invented: an auditor with `s.points` and a calculator
 * reproduces every cell.
 *
 * ── WHAT IS ON THE RECORD, AND WHAT IS NOT ────────────────────────────────────────
 * Exactly ONE cell is the quote — the quoted price at baseline effort. Every other cell
 * is a counterfactual, and `readsAs` says so on the figure rather than in this comment,
 * because a reader who takes the whole surface as a set of committed quotes has been
 * misled by a figure that was technically accurate.
 *
 * `valuesArePlaceholders` is wired to the SERVER'S OWN flag, never to a literal `true`.
 * The effort triples behind these costs are still `TODO_EFFORT_DAYS`, so the figure must
 * look like a placeholder — and on the day real triples land, `EFFORT_TRIPLES_ARE_
 * PLACEHOLDERS` flips in that same commit and this surface stops hatching itself without
 * anyone remembering it exists.
 */
const PRICE_MULTIPLES = [0.8, 0.9, 1, 1.1, 1.2] as const;

/**
 * EXACTLY what the surface reads, and nothing else.
 *
 * Narrow on purpose rather than taking `Underwriting` and `OverrunSensitivity` whole: it lets
 * the test drive THIS function with an honest four-field fixture instead of casting a
 * half-built `Underwriting`, and a cast is how a renamed field passes a suite. The real call
 * site satisfies it structurally, so nothing is adapted or copied at the boundary.
 */
export interface MarginSurfaceInput {
  readonly priceCents: number;
  readonly currency: string;
  readonly asOf: string;
  readonly points: readonly Pick<OverrunPoint, 'effortUpliftPct' | 'p50MarginCents'>[];
  /** The SERVER's placeholder flag. Never a literal — see the note above. */
  readonly placeholders: boolean;
}

export function buildMarginSurface({
  priceCents: price, currency, asOf, points, placeholders,
}: MarginSurfaceInput): SurfaceOutcome {
  const priceAt = (m: number) => Math.round(price * m);

  /*
   * Row-major, `rows[j][i]` at (price i, overrun j) — the engine's own order for both.
   * `marginPct` returns null at a non-positive price, which the mesh draws as a HOLE
   * rather than as a zero. Unreachable from this screen (a price is required to get a
   * distribution at all) and deliberately not special-cased: the one thing this figure
   * must never do is put a break-even-looking cell where there is no margin to state.
   */
  const rows = points.map((p) =>
    PRICE_MULTIPLES.map((m) => marginPct(priceAt(m), price - p.p50MarginCents)),
  );

  return buildSurfaceMesh({
    rows,
    xAxis: {
      label: 'Price',
      unit: currency,
      ticks: PRICE_MULTIPLES.map((m) => ({ value: priceAt(m), label: money(priceAt(m)) })),
    },
    yAxis: {
      label: 'Effort overrun',
      unit: '% over the sampled triple',
      ticks: points.map((p) => ({
        value: p.effortUpliftPct,
        label: p.effortUpliftPct === 0 ? 'baseline' : `+${p.effortUpliftPct}%`,
      })),
    },
    zAxis: {
      label: 'Median margin',
      unit: '% of price',
      formatTick: (v) => `${Math.round(v)}%`,
    },
    frame: {
      /*
       * THE API HOST, NAMED AS THE API HOST. The response carries no database identity,
       * and inventing one ('production') would be the exact laundering the frame exists
       * to prevent. What this screen actually knows is which service answered it.
       */
      environment: `API ${apiConfig.base}`,
      observedAt: asOf,
      /* A snapshot at one instant, not a window — so both endpoints are null, not `asOf`. */
      windowFrom: null,
      windowTo: null,
      source:
        'gps/underwrite.ts simulate → OverrunPoint.p50MarginCents, repriced by gps/types.ts marginPct',
      valuesArePlaceholders: placeholders,
    },
  });
}

const MARGIN_SURFACE_READS_AS =
  'Height is the MEDIAN margin as a percent of price. The floor axes are the two things that '
  + 'move a services P&L against each other: what LCX charges, and how far the effort overruns. '
  + 'The ridge between them is the answer the table beside this cannot give — how much price '
  + 'buys back an overrun. Only ONE cell is a quote on the record, the quoted price at baseline '
  + 'effort; every other cell is arithmetic on the same simulated median cost, at a price nobody '
  + 'has offered. Heights are medians, so half of the simulated outcomes fall below each one.';

function MarginSurface({ res }: { res: UnderwriteResponse }) {
  const u = res.underwriting;
  const s = res.sensitivity;

  const surface = useMemo(
    () => buildMarginSurface({
      priceCents: u.priceCents,
      currency: u.currency,
      asOf: u.asOf,
      points: s.points,
      placeholders: res.effortTriplesArePlaceholders,
    }),
    [u.priceCents, u.currency, u.asOf, s.points, res.effortTriplesArePlaceholders],
  );

  return (
    <SurfacePlot
      surface={surface}
      title={`Median margin over price × effort overrun (${u.currency})`}
      readsAs={MARGIN_SURFACE_READS_AS}
      heightPx={340}
    />
  );
}

/**
 * The one slider the plan asks for (§3 slice 7.4): +10 / +25 / +50% effort.
 *
 * A native `range` so the arrow keys, Home and End work without a line of code —
 * keyboard-first is the constraint, and a div with `onKeyDown` reimplementing a
 * standard control badly is not it. It is discrete over the returned points rather
 * than continuous over percent, because a continuous slider would imply the screen
 * can answer for +37% and it cannot: the server computed four points and interpolating
 * between two of them would be exactly the fabricated shape the band refuses to draw.
 */
function OverrunControl({ s, points, idx, setUplift }: {
  s: OverrunSensitivity; points: readonly OverrunPoint[]; idx: number; setUplift: (v: number) => void;
}) {
  if (points.length === 0) {
    return (
      <p className="mt-2 text-micro text-amber-600 dark:text-amber-400">
        No sensitivity points were returned ({s.verdict}), so no overrun can be shown. Nothing is interpolated in
        their place.
      </p>
    );
  }
  const cur = points[idx]!;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-line bg-ice-soft/40 px-3 py-2 dark:bg-ice-soft/[0.04]">
      <label htmlFor="gps-uw-overrun" className="text-micro font-bold uppercase tracking-wider text-grey">
        Scope overrun
      </label>
      <input
        id="gps-uw-overrun"
        data-testid="overrun-slider"
        type="range"
        min={0}
        max={points.length - 1}
        step={1}
        value={idx}
        onChange={(e) => setUplift(points[Number(e.target.value)]?.effortUpliftPct ?? 0)}
        aria-valuetext={`${cur.effortUpliftPct}% additional effort, median margin ${money(cur.p50MarginCents)}, probability of loss ${prob(cur.pLoss)}`}
        className="h-1.5 w-52 accent-cyan-600"
      />
      <span className="font-mono text-label font-bold tabular-nums text-navy" data-testid="overrun-current">
        +{cur.effortUpliftPct}%
      </span>
      {/* THE TRIPLET, NEVER THE MEDIAN ALONE. The first draft of this readout printed
        * "median $X" beside the slider and nothing else — a bare point estimate on the
        * most-looked-at number on the page, which is precisely the defect D3 exists to
        * prevent and which the structural test in
        * `pages/__tests__/gpsUnderwriting.test.tsx` caught. Uncertainty sits beside the
        * estimate, including in a one-line summary. */}
      <span className="font-mono text-micro tabular-nums text-grey">
        p10 <Figure percentile="p10" cents={cur.p10MarginCents} />
        {' · p50 '}<Figure percentile="p50" cents={cur.p50MarginCents} />
        {' · p90 '}<Figure percentile="p90" cents={cur.p90MarginCents} />
        {cur.effortUpliftPct !== 0 && <span className="ml-1 font-bold text-red-600 dark:text-red-400">({signedMoney(cur.deltaP50Cents)} at the median vs baseline)</span>}
        {' · P(loss) '}
        <span className={clsx('font-bold', cur.pLoss > 0 ? 'text-red-600 dark:text-red-400' : 'text-navy')}>{prob(cur.pLoss)}</span>
        {cur.deltaPLoss !== 0 && <span className="text-red-600 dark:text-red-400"> (+{(cur.deltaPLoss * 100).toFixed(1)}pp)</span>}
      </span>
      <span className="ml-auto font-mono text-[10px] text-grey">
        {s.breakevenUpliftPct == null
          ? 'no tested uplift turns the median negative'
          : `median goes negative at the +${s.breakevenUpliftPct}% uplift`}
        {' · monotone '}
        <span className={clsx('font-bold', s.monotone ? 'text-navy' : 'text-red-600 dark:text-red-400')}>{String(s.monotone)}</span>
      </span>
    </div>
  );
}

/**
 * Every percentile the server produced, with the matching COST sample beside it.
 *
 * The cost column is the one that changes a conversation with a partner, and the
 * pairing is exact rather than approximate: with a fixed price, margin is a strictly
 * decreasing function of cost, so the sample at the 10th margin percentile IS the
 * sample at the 90th cost percentile, and `p10MarginCents === priceCents − p90CostCents`
 * holds to the cent (`underwrite.ts:671`). Two independent sorts would disagree at
 * the edges and a founder would eventually notice.
 *
 * `mean` is printed BECAUSE it is not the median. On a skewed cost distribution the
 * two differ, and a reader who assumes "average margin" means p50 has misread the
 * band. It sits inside the same table, never alone, and carries its own
 * `data-percentile` so the D3 mechanism covers it too.
 */
function PercentileTable({ d, u, onOpenTrail }: { d: MarginDistribution; u: Underwriting; onOpenTrail: () => void }) {
  const pctCell = (v: number | null) => (v == null ? <span className="text-grey">—</span> : <span className="font-mono tabular-nums text-grey-dark">{v}%</span>);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-micro">
        <caption className="mb-1 text-left text-[10px] font-bold uppercase tracking-wider text-grey">
          Percentiles · margin, share of price, and the cost sample that produced it
        </caption>
        <thead>
          <tr className="border-b border-line text-grey">
            <Th className="w-16">Pctl</Th>
            <Th className="w-28 text-right">Margin</Th>
            <Th className="w-20 text-right">% of price</Th>
            <Th className="text-right">Matching cost sample</Th>
          </tr>
        </thead>
        <tbody>
          <Row label="p05" margin={d.p05MarginCents} pct={null} cost={null} />
          <Row label="p10" margin={d.p10MarginCents} pct={pctCell(d.p10MarginPct)} cost={<>p90 cost <span className="font-mono font-bold tabular-nums text-navy">{money(d.p90CostCents)}</span></>} strong />
          <Row label="p50" margin={d.p50MarginCents} pct={pctCell(d.p50MarginPct)} cost={<>p50 cost <span className="font-mono font-bold tabular-nums text-navy">{money(d.p50CostCents)}</span></>} strong />
          <Row label="p90" margin={d.p90MarginCents} pct={pctCell(d.p90MarginPct)} cost={<>p10 cost <span className="font-mono font-bold tabular-nums text-navy">{money(d.p10CostCents)}</span></>} strong />
          <Row label="p95" margin={d.p95MarginCents} pct={null} cost={null} />
          <Row label="mean" margin={d.meanMarginCents} pct={null} cost={<span className="text-grey">not the median — printed so it is not mistaken for one</span>} />
          <Row label="min" margin={d.minMarginCents} pct={null} cost={<span className="text-grey">worst sampled outcome</span>} />
          <Row label="max" margin={d.maxMarginCents} pct={null} cost={<span className="text-grey">best sampled outcome</span>} />
          <tr className="border-b border-line/50">
            <Td className="font-mono text-grey">width</Td>
            <Td className="text-right">
              {/* D1: the number opens. Not a margin estimate — a band WIDTH — so it is
                * deliberately not a `<Figure>`; marking a width with a percentile would
                * weaken the very mechanism it would be borrowing. */}
              <button
                onClick={onOpenTrail}
                data-testid="open-trail-spread"
                aria-label={`Band width ${money(d.spreadCents)} — open the driver trail that produced it`}
                className="font-mono text-label font-bold tabular-nums text-navy underline decoration-dotted hover:decoration-solid"
              >
                {money(d.spreadCents)}
              </button>
            </Td>
            <Td className="text-right text-grey">—</Td>
            <Td className="text-right text-grey">p90 − p10 · what the variance driver below explains</Td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[10px] leading-snug text-grey">
        {u.sampleCount.toLocaleString('en-US')} samples, seed {u.seed}, deterministic. Cost pairs with the matching
        sample: p10 margin = price − p90 cost, to the cent.
      </p>
    </div>
  );
}

function Row({ label, margin, pct, cost, strong }: {
  label: string; margin: number; pct: React.ReactNode; cost: React.ReactNode; strong?: boolean;
}) {
  return (
    <tr className={clsx('border-b border-line/50', strong && 'bg-ice-soft/30 dark:bg-ice-soft/[0.03]')}>
      <Td className="font-mono uppercase text-grey">{label}</Td>
      <Td className="text-right"><Figure percentile={label} cents={margin} /></Td>
      <Td className="text-right">{pct ?? <span className="text-grey">—</span>}</Td>
      <Td className="text-right text-grey-dark">{cost ?? <span className="text-grey">—</span>}</Td>
    </tr>
  );
}

/**
 * WHAT A SCOPE SLIP COSTS, BEFORE ANYONE SIGNS.
 *
 * At $10–25k an engagement a 25% effort overrun is not a dented quarter, it is the
 * whole margin — which is the entire argument for this table existing on the quote
 * screen rather than in the partner's invoice three months later.
 *
 * ONE TAB STOP (D6). Roving tabindex via `useListNavigation`: arrows move the cursor,
 * Enter selects that uplift as the displayed distribution, Home and End jump. The
 * same hook drives the origination queue and the BD lead list, deliberately — a
 * second movement grammar for a second ranked list is how an instrument becomes an
 * app.
 */
function SensitivityTable({ s, points, selectedIdx, setUplift }: {
  s: OverrunSensitivity; points: readonly OverrunPoint[]; selectedIdx: number; setUplift: (v: number) => void;
}) {
  const body = useRef<HTMLTableSectionElement>(null);
  const nav = useListNavigation({
    count: points.length,
    container: body,
    onActivate: (i) => setUplift(points[i]?.effortUpliftPct ?? 0),
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-micro">
        <caption className="mb-1 text-left text-[10px] font-bold uppercase tracking-wider text-grey">
          Overrun sensitivity · baseline first, then each tested uplift
        </caption>
        <thead>
          <tr className="border-b border-line text-grey">
            <Th className="w-16 text-right">Effort</Th>
            <Th className="w-24 text-right">p10</Th>
            <Th className="w-24 text-right">p50</Th>
            <Th className="w-24 text-right">p90</Th>
            <Th className="w-16 text-right">P(loss)</Th>
            <Th className="text-right">Δ p50 · Δ P(loss)</Th>
          </tr>
        </thead>
        <tbody ref={body} {...nav.containerProps} data-testid="sensitivity-body">
          {points.map((p, i) => (
            <tr
              key={p.effortUpliftPct}
              {...nav.rowProps(i)}
              onClick={() => setUplift(p.effortUpliftPct)}
              aria-selected={i === selectedIdx}
              data-testid={`sensitivity-row-${p.effortUpliftPct}`}
              className={clsx(
                'cursor-pointer border-b border-line/50 outline-none',
                i === selectedIdx && 'bg-cyan-500/10',
                nav.index === i && 'ring-1 ring-inset ring-cyan-500/40',
              )}
            >
              <Td className="text-right font-mono font-bold tabular-nums text-navy">{p.effortUpliftPct === 0 ? 'base' : `+${p.effortUpliftPct}%`}</Td>
              <Td className="text-right"><Figure percentile="p10" cents={p.p10MarginCents} /></Td>
              <Td className="text-right"><Figure percentile="p50" cents={p.p50MarginCents} /></Td>
              <Td className="text-right"><Figure percentile="p90" cents={p.p90MarginCents} /></Td>
              <Td className={clsx('text-right font-mono font-bold tabular-nums', p.pLoss > 0 ? 'text-red-600 dark:text-red-400' : 'text-navy')}>{prob(p.pLoss)}</Td>
              <Td className="text-right font-mono tabular-nums text-grey-dark">
                {p.effortUpliftPct === 0 ? (
                  <span className="text-grey">baseline</span>
                ) : (
                  <>
                    <span data-margin-figure="" data-percentile="p50-delta" className="font-bold text-red-600 dark:text-red-400">{signedMoney(p.deltaP50Cents)}</span>
                    {' · +'}{(p.deltaPLoss * 100).toFixed(1)}pp
                  </>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] leading-snug text-grey">
        ↑↓ move · ⏎ shows that uplift on the band above · {s.method}
      </p>
    </div>
  );
}

function Th({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <th title={title} className={clsx('px-2 py-1 text-[10px] font-bold uppercase tracking-wider', className)}>{children}</th>;
}

function Td({ children, className, colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={clsx('px-2 py-1', className)}>{children}</td>;
}

/* ── 5. THE VARIANCE DRIVER, AND THE TRAIL (D1) ─────────────────────────────── */

/**
 * WHICH INPUT OWNS THE SPREAD — because "the margin might be anywhere between $2k
 * and $11k" is not actionable, and "it is almost all the effort estimate, and that
 * estimate is a placeholder" is.
 *
 * `note` is rendered whenever it is present and it is not a footnote: it carries the
 * two caveats that make the attribution honest — that a single stochastic input
 * necessarily "dominates" (a statement about the model's shape, not evidence), and
 * that pinning is an approximation whose shares do not sum to 1 when inputs interact
 * multiplicatively, as cost and overrun do here.
 */
function Variance({ v, drivers, open, onToggle }: {
  v: VarianceAttribution | null; drivers: readonly UnderwriteDriver[]; open: boolean; onToggle: () => void;
}) {
  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-micro font-bold uppercase tracking-wider text-grey">Variance driver</span>
        {v == null || v.input == null ? (
          <span className="text-label font-bold text-amber-600 dark:text-amber-400" data-testid="variance-driver">
            {v?.label ?? 'Not reported'}
          </span>
        ) : (
          <>
            <span className="text-label font-bold text-navy" data-testid="variance-driver">{v.label}</span>
            <span className="font-mono text-label font-bold tabular-nums text-navy">{Math.round(v.contribution * 100)}%</span>
            <span className="font-mono text-micro text-grey">
              of a {money(v.totalSpreadCents)} band · {money(v.spreadExplainedCents)} disappears when it is pinned
            </span>
          </>
        )}
        <button
          onClick={onToggle}
          data-testid="toggle-trail"
          aria-expanded={open}
          className="ml-auto rounded border border-line px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-navy hover:bg-ice-soft"
        >
          {open ? 'hide' : 'open'} driver trail ({drivers.length})
        </button>
      </div>

      {v != null && v.all.length > 0 && (
        <table className="mt-2 w-full border-collapse text-left text-micro">
          <thead>
            <tr className="border-b border-line text-grey">
              <Th>Stochastic input</Th>
              <Th className="w-24 text-right">Share of band</Th>
              <Th className="w-32 text-right">Band if pinned</Th>
            </tr>
          </thead>
          <tbody>
            {v.all.map((c) => (
              <tr key={c.input} className="border-b border-line/50">
                <Td className="text-grey-dark">{c.label}</Td>
                {/* A NEGATIVE share is a real measurement, not a bug to hide: effort
                    and the overrun ratio multiply, so pinning one can WIDEN the band.
                    The engine used to clamp it to 0, which read as "this input does not
                    matter". Rendered as "widens" because a bare "-12%" of a share reads
                    as a typo. */}
                <Td className="text-right font-mono font-bold tabular-nums text-navy">
                  {c.contribution < 0
                    ? <span className="text-amber-700 dark:text-amber-400">widens ({Math.round(c.contribution * 100)}%)</span>
                    : `${Math.round(c.contribution * 100)}%`}
                </Td>
                <Td className="text-right font-mono tabular-nums text-grey-dark">{money(c.spreadIfPinnedCents)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {v?.note && (
        <p className="mt-2 text-micro leading-snug text-amber-700 dark:text-amber-400" data-testid="variance-note">{v.note}</p>
      )}
      {v && <p className="mt-1 text-[10px] leading-snug text-grey">{v.method}</p>}

      {open && <DriverTrail drivers={drivers} />}
    </section>
  );
}

/**
 * WHAT PRODUCED THIS NUMBER, in one interaction (D1).
 *
 * The unit comes from `driver.unit` and is rendered by `driverValue` — never
 * inferred from the magnitude. `UnderwriteDriver` extends the platform's `Driver`
 * (`alpha.ts:41`) so any existing trail renderer accepts it, but `Driver.points`
 * means SCORE POINTS on a 0–100 composite everywhere else, and here the same field
 * carries cents, days, a percent, a ratio or a count. A renderer that ignores the
 * unit prints "600000 points" for $6,000 and is visibly wrong rather than quietly
 * wrong; that is why the field is required (`underwrite.ts:640`).
 */
function DriverTrail({ drivers }: { drivers: readonly UnderwriteDriver[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded border border-line" data-testid="driver-trail">
      <table className="w-full border-collapse text-left text-micro">
        <thead>
          <tr className="border-b border-line bg-ice-soft/40 text-grey dark:bg-ice-soft/[0.04]">
            <Th>Driver</Th>
            <Th className="w-28 text-right">Value</Th>
            <Th className="w-14">Unit</Th>
            <Th>Formula · source · caveat</Th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((dr) => (
            <tr key={dr.label} className="border-b border-line/50 align-top">
              <Td className="text-grey-dark">{dr.label}</Td>
              <Td className={clsx('text-right font-mono font-bold tabular-nums', dr.points < 0 ? 'text-red-600 dark:text-red-400' : 'text-navy')}>
                {driverValue(dr)}
              </Td>
              <Td className="font-mono text-[10px] uppercase text-grey">{dr.unit}</Td>
              <Td className="text-[10px] leading-snug text-grey">{dr.detail ?? '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── 6. THE GATE — blocked, not discouraged (D4) ────────────────────────────── */

/**
 * THE ISSUE CONTROL, AND IT IS VISIBLY BLOCKED WHEN THE POLICY SAYS SO.
 *
 * `disabled` AND `aria-disabled` AND red AND a lock icon AND the reason quoted
 * verbatim from `IssueDecision.reason` — the plan's requirement is that P(loss) over
 * the threshold "blocks issuing the proposal through the governed action rather than
 * warning politely" (§3 slice 7.3), and a warning is a thing you click past at 23:00
 * to get a quote out.
 *
 * BOTH SIDES OF EVERY COMPARISON ARE PRINTED, failing and passing (D2). `IssueCheck`
 * carries `threshold` and `observed` precisely so a UI never has to reconstruct the
 * comparison, and the PASSED checks are shown too because "allowed" needs explaining
 * as much as "blocked" does.
 *
 * THE THRESHOLD IS NOT PRESENTED AS AGREED. `policyNotice` is `ISSUE_POLICY_IS_A_STATED_PRIOR`
 * verbatim: 20% is a shipped default so the block has a number to quote, not the
 * founder's risk appetite, and `statedBy: system:default` at the epoch is printed
 * beside it. A blocked proposal that turns out to have been fine is how that number
 * gets revisited, and that only works if the record says who set it.
 *
 * WHAT THIS CONTROL DOES WHEN IT IS *NOT* BLOCKED, stated plainly rather than faked:
 * nothing yet. GPS issues a proposal from an ENGAGEMENT (`issueGpsProposal`,
 * `lib/api/gps.ts`), and this screen underwrites a price before an engagement exists
 * — that is the whole point of underwriting before issue. So the permitted state is a
 * hand-off to the quote desk and says so. Wiring a governed `POST` from here would
 * mean inventing an engagement id, and a button that silently creates a record the
 * founder did not ask for is worse than a button that explains itself.
 */
function IssueGate({ issue, policyNotice }: { issue: IssueDecision; policyNotice: string }) {
  const blocked = issue.blocked;
  return (
    <section
      className={clsx('rounded-lg border-2 p-4 shadow-card', blocked ? 'border-red-500 bg-red-500/[0.05]' : 'border-emerald-600/50 bg-card')}
      data-testid="issue-gate"
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="issue-control"
          data-blocked={blocked ? 'true' : 'false'}
          disabled={blocked}
          aria-disabled={blocked}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-label font-bold',
            blocked
              ? 'cursor-not-allowed border-2 border-red-500 bg-red-500/15 text-red-600 dark:text-red-400'
              : 'bg-navy text-card hover:bg-navy-deep',
          )}
        >
          {blocked && <Lock size={13} />}
          {blocked ? 'Issue proposal — BLOCKED' : 'Issue proposal — permitted'}
        </button>
        <span className="font-mono text-micro uppercase text-grey">
          gate <span className={clsx('font-bold', blocked ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')} data-testid="issue-code">{issue.code}</span>
        </span>
        <p className={clsx('min-w-[18rem] flex-1 text-label leading-snug', blocked ? 'font-bold text-red-600 dark:text-red-400' : 'text-grey-dark')} data-testid="issue-reason">
          {issue.reason}
        </p>
      </div>

      {!blocked && (
        <p className="mt-2 text-[10px] leading-snug text-grey">
          Permitted is not the same as issued. GPS issues a proposal from an engagement on the quote desk; this screen
          underwrites a price before an engagement exists, which is the point of underwriting before issue. This
          control reports the gate that action must consult — it does not create a record here.
        </p>
      )}

      <CheckTable title="Failed" checks={issue.failed} tone="fail" />
      <CheckTable title="Passed" checks={issue.passed} tone="pass" />

      <p className="mt-2 text-[10px] leading-snug text-amber-700 dark:text-amber-400" data-testid="policy-notice">{policyNotice}</p>
      <p className="mt-1 font-mono text-[10px] text-grey">
        appetite P(loss) ≤ <span className="font-bold text-navy tabular-nums">{prob(issue.policy.maxPLoss)}</span>
        {' · margin floor '}
        <span className={clsx('font-bold', issue.policy.minP50MarginPct == null ? 'text-amber-600 dark:text-amber-400' : 'text-navy')}>
          {issue.policy.minP50MarginPct == null ? 'NOT SET — deliberately not invented' : `${issue.policy.minP50MarginPct}% of price`}
        </span>
        {' · stated by '}<span className="text-navy">{issue.policy.statedBy}</span>
        {' at '}
        {issue.policy.statedAt === NEVER_CONFIRMED
          ? <span className="font-bold text-amber-600 dark:text-amber-400">the epoch — never confirmed</span>
          : <span className="text-navy">{issue.policy.statedAt}</span>}
      </p>
    </section>
  );
}

function CheckTable({ title, checks, tone }: { title: string; checks: readonly IssueCheck[]; tone: 'fail' | 'pass' }) {
  if (checks.length === 0) return null;
  const fmt = (v: number | string, unit: IssueCheck['unit']) =>
    typeof v === 'string' ? v : unit === 'ratio' ? prob(v) : unit === 'pct' ? `${v}%` : String(v);
  return (
    <div className="mt-2">
      <div className={clsx('text-[10px] font-bold uppercase tracking-wider', tone === 'fail' ? 'text-red-600 dark:text-red-400' : 'text-grey')}>
        {title} ({checks.length})
      </div>
      <table className="w-full border-collapse text-left text-micro">
        <tbody>
          {checks.map((c) => (
            <tr key={c.code} className="border-b border-line/50">
              <Td className="text-grey-dark">{c.name}</Td>
              <Td className="w-40 text-right font-mono tabular-nums text-grey">threshold {fmt(c.threshold, c.unit)}</Td>
              {/* The testid sits on the span, not the `Td`: the local `Td` takes three
                * named props and forwards nothing, so an attribute passed to it is
                * silently dropped — which is how the first version of this row
                * typechecked, rendered correctly and still failed its own test. */}
              <Td className={clsx('w-40 text-right font-mono font-bold tabular-nums', tone === 'fail' ? 'text-red-600 dark:text-red-400' : 'text-navy')}>
                <span data-testid={`check-observed-${c.code}`}>observed {fmt(c.observed, c.unit)}</span>
              </Td>
              <Td className="w-32 font-mono text-[10px] uppercase text-grey">{c.code}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── 7. THE SYSTEM ARGUES BACK (D4) ─────────────────────────────────────────── */

/**
 * THE THREE MOST LIKELY REASONS THIS ENGAGEMENT RUNS OVER — and where the argument
 * came from, stated in words, always.
 *
 * `sourceStatement` is rendered ABOVE the arguments and never collapsed, because
 * "drawn from three recorded overruns" and "inferred from the offer's exclusions
 * because nothing has been recorded" are arguments of completely different weight and
 * a reader cannot tell them apart from the claims alone (`underwrite.ts:1533`).
 *
 * `whatWouldChangeThis` is the falsifier and it is printed. An argument with no
 * stated falsifier is an opinion, and this panel is the one place on the screen that
 * is allowed to be an argument rather than an arithmetic result — which is exactly
 * why it carries the heaviest labelling.
 *
 * An empty list is a RESULT, not a gap: `devilsAdvocate` refuses to promote a
 * zero-occurrence candidate to a "most likely reason" merely because its category
 * exists — "0 of 5 engagements ran late" is evidence FOR the quote.
 */
function Advocate({ d }: { d: DevilsAdvocate }) {
  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card" data-testid="devils-advocate">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <Swords size={15} className="text-navy" />
        <span className="text-micro font-bold uppercase tracking-wider text-grey">Devil's advocate · why this runs over</span>
        <span className="font-mono text-[10px] font-bold uppercase text-cyan-700 dark:text-cyan-400" data-testid="advocate-source">{d.source}</span>
      </div>
      <p className="mt-1.5 text-micro leading-snug text-grey-dark" data-testid="advocate-source-statement">{d.sourceStatement}</p>

      {d.arguments.length === 0 ? (
        <p className="mt-2 text-micro leading-snug text-grey">
          No argument reached the panel. That is a result and not an omission: a candidate with zero recorded
          occurrences is not promoted to a "most likely reason" because its category exists.
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {d.arguments.map((a) => (
            <li key={a.rank} className="flex gap-2.5" data-testid={`advocate-argument-${a.rank}`}>
              <span className="mt-0.5 font-mono text-label font-bold text-grey">{a.rank}</span>
              <div className="min-w-0">
                <p className="text-label leading-snug text-navy">{a.claim}</p>
                <p className="font-mono text-[10px] leading-snug text-grey">
                  {a.evidence}
                  {' · source '}<span className="uppercase text-grey-dark">{a.source}</span>
                  {a.denominator > 0 && <> · <span className="tabular-nums">{a.sampleSize}/{a.denominator}</span></>}
                  {a.denominator === 0 && ' · no sample at all — this is inferred from the offer, not measured'}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-2 text-micro leading-snug text-grey-dark">
        <span className="font-bold uppercase text-grey">What would change this: </span>{d.whatWouldChangeThis}
      </p>
    </section>
  );
}

/**
 * EVERY REASON THE MODULE ATTACHED, PRINTED IN FULL AND NEVER TRUNCATED.
 *
 * `reasons` is never empty on any path, and it is where the module argues: the loss
 * sentence, the prior warning, the placeholder warning, the fixed-fee note, the
 * coarse-sample note, and the disagreement between the quote's booked vendor cost and
 * the modelled median. Several of those are the only place a specific hazard is
 * stated, so a "show more" control here would hide the argument behind a click, which
 * is the polite version of not making it.
 */
function Reasons({ u }: { u: Underwriting }) {
  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="text-micro font-bold uppercase tracking-wider text-grey">
        What the model said about this quote ({u.reasons.length})
      </div>
      <ul className="mt-1.5 space-y-1" data-testid="reasons">
        {u.reasons.map((r) => (
          <li key={r} className="flex gap-2 text-micro leading-snug text-grey-dark">
            <span className="text-grey">—</span><span>{r}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * THE METHOD, READ OFF THE WIRE (D8).
 *
 * Not one sentence in this block is typed on this page. `underwriting.method`,
 * `percentileMethod` and `sensitivity.method` are shipped beside the numbers they
 * describe so that deleting the paragraph cannot leave the numbers standing without
 * their method — an imported constant can be forgotten by removing one import line,
 * whereas a field on the payload has to be actively ignored.
 */
function Method({ res }: { res: UnderwriteResponse }) {
  return (
    <section className="rounded-lg border border-line bg-ice-soft/40 p-4 dark:bg-ice-soft/[0.03]" data-testid="method">
      <div className="text-micro font-bold uppercase tracking-wider text-grey">Method</div>
      <p className="mt-1 text-[10px] leading-snug text-grey-dark">{res.underwriting.method}</p>
      <p className="mt-1.5 text-[10px] leading-snug text-grey-dark">{res.percentileMethod}</p>
      <p className="mt-1.5 text-[10px] leading-snug text-grey-dark">{res.sensitivity.method}</p>
      <p className="mt-1.5 font-mono text-[10px] text-grey">
        effort triples are placeholders: <span className={clsx('font-bold', res.effortTriplesArePlaceholders ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
          {String(res.effortTriplesArePlaceholders)}
        </span>
        {' · dated '}<span className="text-navy">{res.asOf}</span>
        {' · seed '}<span className="text-navy">{res.underwriting.seed}</span>
      </p>
    </section>
  );
}

/** Who stated the triple actually used, and when. The epoch is called what it is. */
function EffortProvenance({ effort }: { effort: EffortTriple }) {
  return (
    <p className="font-mono text-[10px] text-grey-dark" data-testid="effort-provenance">
      In force: <span className="font-bold text-navy tabular-nums">{effort.optimisticDays} / {effort.likelyDays} / {effort.pessimisticDays}</span> days
      {' · stated by '}<span className="text-navy">{effort.statedBy}</span>
      {' · '}
      {effort.statedAt === NEVER_CONFIRMED
        ? <span className="font-bold text-amber-600 dark:text-amber-400">never confirmed (epoch — a placeholder must not look fresh)</span>
        : <span className="text-navy">{effort.statedAt}</span>}
      {effort.isPlaceholder && <span className="ml-1 font-bold text-amber-600 dark:text-amber-400">· PLACEHOLDER, not founder-supplied and not measured</span>}
    </p>
  );
}
