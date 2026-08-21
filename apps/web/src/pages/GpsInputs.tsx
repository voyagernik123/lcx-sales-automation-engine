import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Badge, Button, Card, CardBody, CardHeader, Input, PageTitle, Select } from '@/components/ui';
import { ApiError, request } from '@/lib/apiClient';
import { attachMeta } from '@/lib/api/meta';
import { GpsMetaBanner } from '@/pages/GpsMetaBanner';
import { GpsInputsPackets } from '@/pages/GpsInputsPackets';
/**
 * THE RESPONSE TYPES COME FROM THE SHARED CONTRACT, BY PACKAGE NAME.
 *
 * This was a relative specifier into `packages/shared/src/gps/contracts/inputs.js` while
 * `src/gps/index.ts` re-exported nothing from `contracts/` — `@lcx/shared` publishes exactly
 * one entry point (`"."` → `src/index.ts`), so a symbol outside the barrel is invisible to
 * `tsc` and to Vite no matter what its own file says. The barrel line has landed, so this is
 * now the ordinary import and there is no path in this file that production code could not
 * also use.
 *
 * It stays `import type`, so nothing from that module reaches the bundle — the page carries
 * the SHAPE and no runtime dependency, which is what keeps it inside the 22KB of perf
 * headroom as a lazily-loaded chunk.
 *
 * WHAT IS NOT DONE HERE, deliberately: this page declares no interface of its own.
 * `lib/api/gps.ts:60` is the post-mortem for the alternative — a hand-written
 * `GpsSummary` claiming three fields the API has never sent, believed by `tsc`,
 * agreed with by a test that mocked the boundary, and crashing in production.
 */
import type {
  EffortTripleRow,
  GpsInputsDesk,
  PartnerOption,
  PriceBandRow,
  RateCardRow,
} from '@lcx/shared';

/**
 * GLOBAL SERVICES — THE INPUT DESK.
 *
 * The screen for the three inputs only a human can supply, over the two tables that
 * now exist and the one that does not:
 *
 *  1. PRICE BANDS — low / mid / high per offer. Every row says whether the number is
 *     an ENTERED band or still the COMPILED PLACEHOLDER, because a screen that
 *     rendered both identically would make the placeholder invisible, which is worse
 *     than showing no price at all.
 *  2. EFFORT TRIPLES — optimistic / likely / pessimistic person-days per offer. Every
 *     row says MEASURED or PRIOR, because a distribution built on a prior is a guess
 *     with error bars and must not read as a model.
 *  3. NAMED PARTNER + RATE CARD per offer, chosen from the names this system already
 *     has. The bench is empty, so that list is empty, and the server's refusal is
 *     rendered instead of an empty dropdown.
 *
 * ── THIS PAGE MAKES NO JUDGEMENT ABOUT A VALUE ───────────────────────────────
 * There is no client-side validation on this screen, on purpose. Every rule — a rate
 * of zero, a sub-cent rate, a transposed triple, a four-letter currency — is enforced
 * by `apps/api/src/routes/gpsInputs.ts`, and this page renders the server's refusal
 * VERBATIM, with the rule it cited. A browser-side copy of those rules would be a
 * second opinion about what counts as a refusal, it would drift, and the copy that
 * drifted would be the one the operator saw.
 *
 * That is also why no submit control is disabled on the basis of what was typed. The
 * only thing this page decides is what to show.
 *
 * ── ROUTED, LAZILY, AT /gps/inputs ───────────────────────────────────────────
 * `router.tsx` imports this with `lazy(() => import('@/pages/GpsInputs'))` and the
 * sidebar's Global Services group links to it. LAZY IS LOAD-BEARING: the initial bundle
 * measures 828KB against an 850KB budget, so a static import would break `perf-budget`,
 * and the fix for that is never to raise the budget. It is deliberately NOT added to
 * `pages/index.ts` — that barrel is the eager list, and the newer surfaces
 * (MarketingCrisis, GpsLoop, this one) stay out of it so each keeps its own chunk. The
 * build emits `GpsInputs-*.js` separately; that is the check.
 *
 * NOTHING ON THIS SCREEN IS REACHABLE WITHOUT THE SERVER SAYING SO. An operator without
 * `gps:view` gets a page whose every fetch 403s, and the three writes demand
 * `gps:operate` — the route table cannot express either, and `app.ts:requiresOperate`
 * plus `__tests__/gpsInputsMount.test.ts` are where that lives.
 */

/** What the API sends back on both the read and every write. */
interface DeskEnvelope {
  data: GpsInputsDesk;
  meta?: { priceBandRegisterDdl?: string } | null;
}

/**
 * THE PROVENANCE ENVELOPE, RE-ATTACHED SO THE BANNER CAN READ IT.
 *
 * This page calls `request<DeskEnvelope>` and unpacks `{ data, meta }` itself, rather than
 * going through `unwrapWithMeta` — it needs `meta.priceBandRegisterDdl` as an ordinary value
 * to print inside a refusal. The cost of doing that is that `data` arrives with no
 * non-enumerable envelope on it, and `metaNotices` correctly reports `envelope-not-carried`
 * for such a value: it cannot tell "this read declared nothing" from "the envelope was
 * dropped between the wire and here", and it must not guess.
 *
 * So the envelope is put back. `attachMeta` is the same function `unwrapWithMeta` uses, and
 * it never throws — a frozen payload simply keeps the old behaviour.
 *
 * WHY THIS SCREEN NEEDS THE BANNER AT ALL, given it already prints server refusals: those
 * refusals are about the REGISTERS. The envelope is about the READ — `migrated: false` says
 * the effort-triple and rate-card tables are absent on this environment, which is the
 * difference between "no triple has been typed" and "there is nowhere to type one", and the
 * two look identical in an empty panel. `gpsMetaNotices.test.ts` enforces this on every GPS
 * surface rather than on the ones that remembered.
 */
function withEnvelope(res: DeskEnvelope): GpsInputsDesk {
  return attachMeta(res.data, res.meta ?? null);
}

/** A refusal, unpacked from an `ApiError` without inventing any part of it. */
interface ShownRefusal {
  code: string;
  message: string;
  rule: string | null;
  field: string | null;
}

/**
 * Turn a thrown error into the refusal the server actually sent.
 *
 * `apiClient` captures everything except `error` and `code` on `ApiError.data`
 * (`lib/apiClient.ts:404`), and the desk's own citation travels inside that on `data`
 * — so the path is `err.data.data.rule`. The double nesting is the house envelope
 * (`{ error, code, data }`) meeting the client's name for "the rest of the body"; it
 * is read explicitly here rather than flattened, because flattening it would be a
 * second shape for one refusal.
 *
 * When the citation is absent this returns `rule: null` and the surface SAYS the rule
 * was not carried. It does not fabricate one, and it does not swallow the refusal.
 */
function readRefusal(err: unknown): ShownRefusal {
  if (err instanceof ApiError) {
    const detail = err.data as { data?: { rule?: unknown; field?: unknown } } | undefined;
    const rule = typeof detail?.data?.rule === 'string' ? detail.data.rule : null;
    const field = typeof detail?.data?.field === 'string' ? detail.data.field : null;
    return { code: err.code ?? `HTTP_${err.status}`, message: err.message, rule, field };
  }
  return {
    code: 'REQUEST_FAILED',
    message: err instanceof Error ? err.message : 'The request did not complete.',
    rule: null,
    field: null,
  };
}

/**
 * Cents → a readable amount in the row's own currency.
 *
 * Nothing here converts between currencies, and a currency this browser does not
 * recognise falls back to `1234.56 XYZ` rather than throwing or silently printing a
 * dollar sign over a euro amount.
 */
function money(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** The refusal block. One component, so a refusal always looks like a refusal. */
function RefusalPanel({ refusal, ddl }: { refusal: ShownRefusal; ddl?: string | null }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-status-blocked bg-status-blocked-bg p-3 text-sm"
      data-testid={`refusal-${refusal.code}`}
    >
      <p className="font-mono text-xs font-semibold text-status-blocked">REFUSED · {refusal.code}</p>
      <p className="mt-1 text-navy">{refusal.message}</p>
      <p className="mt-2 text-xs text-grey">
        {refusal.rule === null
          ? 'The server did not carry a rule citation on this refusal.'
          : <>Rule: <span className="font-mono">{refusal.rule}</span></>}
        {refusal.field !== null && <> · Field: <span className="font-mono">{refusal.field}</span></>}
      </p>
      {typeof ddl === 'string' && ddl.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-navy">
            A human pastes this into the Supabase SQL editor, then lands it as the next free numbered
            migration:
          </p>
          <pre className="mt-1 max-h-64 overflow-auto rounded bg-card p-2 text-[11px] leading-snug">{ddl}</pre>
        </div>
      )}
    </div>
  );
}

export function GpsInputs() {
  const [desk, setDesk] = useState<GpsInputsDesk | null>(null);
  const [ddl, setDdl] = useState<string | null>(null);
  const [loadRefusal, setLoadRefusal] = useState<ShownRefusal | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request<DeskEnvelope>('/v1/gps/inputs');
      setDesk(withEnvelope(res));
      setDdl(res.meta?.priceBandRegisterDdl ?? res.data.priceBandRegisterDdl ?? null);
      setLoadRefusal(null);
    } catch (err) {
      setDesk(null);
      setLoadRefusal(readRefusal(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every write returns the whole desk, so the screen is never patched locally. */
  const accept = useCallback((res: DeskEnvelope) => {
    setDesk(withEnvelope(res));
    if (typeof res.meta?.priceBandRegisterDdl === 'string') setDdl(res.meta.priceBandRegisterDdl);
  }, []);

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Price bands, effort triples and the named partner — the three inputs only a human can supply.">
        GPS input desk
      </PageTitle>

      {/* G0: the founder packets sit ABOVE the manual desks — the proposals that fill them.
          onApplied re-reads the desk below so an applied packet flips its rows to 'entered'
          without a reload, from data rather than from optimism. */}
      <GpsInputsPackets onApplied={() => void load()} />

      {loading && <p className="text-sm text-grey">Loading the desk…</p>}

      {loadRefusal !== null && <RefusalPanel refusal={loadRefusal} />}

      {desk !== null && (
        <>
          {/* What this read declared about itself, above everything derived from it. */}
          <GpsMetaBanner of={[desk]} className="mt-0" />
          <AwaitingHuman desk={desk} />
          {desk.refusals.map((r) => (
            <RefusalPanel
              key={r.code}
              refusal={{ code: r.code, message: r.reason, rule: r.rule, field: r.field }}
              ddl={r.code === 'PRICE_BAND_REGISTER_ABSENT' ? ddl : null}
            />
          ))}
          <PriceBandPanel rows={desk.priceBands} onAccept={accept} />
          <EffortPanel rows={desk.effortTriples} onAccept={accept} />
          <RateCardPanel rows={desk.rateCards} options={desk.partnerOptions} onAccept={accept} />
          <footer className="border-t border-line pt-3 text-xs text-grey">
            <p>
              Read at {desk.asOf} · contract {desk.contract} · registers:
              {' '}price bands {String(desk.registers.priceBands)},
              {' '}effort triples {String(desk.registers.effortTriples)},
              {' '}rate cards {String(desk.registers.rateCards)}.
            </p>
            <p className="mt-1">
              Everything typed here is attributed to the desk session that typed it. That attribution is
              only as strong as a shared passcode: it is a dated record of what was stated, not evidence
              of which human stated it.
            </p>
          </footer>
        </>
      )}
    </div>
  );
}

/** WHAT ONLY A HUMAN CAN SUPPLY — the server's sentences, not the page's. */
function AwaitingHuman({ desk }: { desk: GpsInputsDesk }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-navy">What a human must still type</h2>
      </CardHeader>
      <CardBody>
        <div className="mb-3 flex flex-wrap gap-4 text-sm">
          <span data-testid="count-placeholder-bands">
            <strong>{desk.counts.offersOnPlaceholderBand}</strong> offers priced from a placeholder
          </span>
          <span data-testid="count-prior-effort">
            <strong>{desk.counts.offersOnPriorEffort}</strong> offers on a prior effort triple
          </span>
          <span data-testid="count-no-partner">
            <strong>{desk.counts.offersWithNoPartner}</strong> offers with no named partner
          </span>
        </div>
        {desk.awaitingHuman.length === 0 ? (
          <p className="text-sm text-grey">Nothing outstanding on this desk.</p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-sm text-navy">
            {desk.awaitingHuman.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* PANEL 1 — PRICE BANDS                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE BADGE IS THE POINT OF THIS PANEL.
 *
 * `compiled_placeholder` renders as an UNVERIFIED badge with the server's notice
 * underneath; `entered` renders as READY with the author and date. The two rows do
 * not look alike, and the placeholder's numbers are struck through so nobody reads
 * one off the screen into a proposal.
 */
function PriceBandPanel({
  rows,
  onAccept,
}: {
  rows: readonly PriceBandRow[];
  onAccept: (res: DeskEnvelope) => void;
}) {
  const [offerKey, setOfferKey] = useState<string>(rows[0]?.offerKey ?? '');
  const [lowCents, setLow] = useState('');
  const [midCents, setMid] = useState('');
  const [highCents, setHigh] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [refusal, setRefusal] = useState<ShownRefusal | null>(null);
  const [ddl, setDdl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await request<DeskEnvelope>('/v1/gps/inputs/price-bands', {
        method: 'POST',
        body: { offerKey, lowCents, midCents, highCents, currency },
      });
      setRefusal(null);
      setDdl(null);
      onAccept(res);
    } catch (err) {
      setRefusal(readRefusal(err));
      const detail = err instanceof ApiError
        ? (err.data as { meta?: { priceBandRegisterDdl?: unknown } } | undefined)
        : undefined;
      setDdl(typeof detail?.meta?.priceBandRegisterDdl === 'string' ? detail.meta.priceBandRegisterDdl : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>Price bands — what LCX sells an offer for</CardHeader>
      <CardBody className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-grey">
                <th className="py-1 pr-3">Offer</th>
                <th className="py-1 pr-3">Low</th>
                <th className="py-1 pr-3">Mid</th>
                <th className="py-1 pr-3">High</th>
                <th className="py-1 pr-3">On file</th>
                <th className="py-1">Stated by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const placeholder = row.source === 'compiled_placeholder';
                return (
                  <tr key={row.offerKey} className="border-t border-line align-top" data-testid={`band-${row.offerKey}`}>
                    <td className="py-2 pr-3 font-medium text-navy">{row.offerName}</td>
                    <td className={clsx('py-2 pr-3 tabular-nums', placeholder && 'line-through text-grey')}>
                      {money(row.lowCents, row.currency)}
                    </td>
                    <td className={clsx('py-2 pr-3 tabular-nums', placeholder && 'line-through text-grey')}>
                      {money(row.midCents, row.currency)}
                      {row.midIsDerived && (
                        <span className="ml-1 text-[10px] uppercase text-grey" data-testid={`mid-derived-${row.offerKey}`}>
                          derived
                        </span>
                      )}
                    </td>
                    <td className={clsx('py-2 pr-3 tabular-nums', placeholder && 'line-through text-grey')}>
                      {money(row.highCents, row.currency)}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge status={placeholder ? 'unverified' : 'ready'}>
                        {placeholder ? 'PLACEHOLDER' : 'ENTERED'}
                      </Badge>
                      {row.placeholderNotice !== null && (
                        <p className="mt-1 max-w-md text-xs text-status-unverified" data-testid={`band-notice-${row.offerKey}`}>
                          {row.placeholderNotice}
                        </p>
                      )}
                    </td>
                    <td className="py-2 text-xs text-grey">
                      {row.statedBy === null ? 'nobody' : `${row.statedBy}${row.statedAt === null ? '' : ` · ${row.statedAt}`}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-5">
          <Select
            label="Offer"
            value={offerKey}
            onChange={(e) => setOfferKey(e.target.value)}
            options={rows.map((r) => ({ value: r.offerKey, label: r.offerName }))}
          />
          <Input label="Low (integer cents)" value={lowCents} onChange={(e) => setLow(e.target.value)} inputMode="numeric" />
          <Input label="Mid (integer cents)" value={midCents} onChange={(e) => setMid(e.target.value)} inputMode="numeric" />
          <Input label="High (integer cents)" value={highCents} onChange={(e) => setHigh(e.target.value)} inputMode="numeric" />
          <Input label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={8} />
        </div>
        <p className="text-xs text-grey">
          Integer cents, so 1200000 is $12,000.00. Nothing here rounds or converts: a fraction of a cent
          and a four-letter currency are both refused by the server, with the rule.
        </p>
        <Button onClick={submit} disabled={busy}>
          {busy ? 'Recording…' : 'Record this band'}
        </Button>
        {refusal !== null && <RefusalPanel refusal={refusal} ddl={ddl} />}
      </CardBody>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* PANEL 2 — EFFORT TRIPLES                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * MEASURED OR PRIOR, per offer, with the server's reason on every prior.
 *
 * The distinction is not cosmetic: until a triple is on record the Monte Carlo runs
 * on the shipped placeholder and everything downstream is labelled `basis: prior`.
 */
function EffortPanel({
  rows,
  onAccept,
}: {
  rows: readonly EffortTripleRow[];
  onAccept: (res: DeskEnvelope) => void;
}) {
  const [offerKey, setOfferKey] = useState<string>(rows[0]?.offerKey ?? '');
  const [optimisticDays, setO] = useState('');
  const [likelyDays, setL] = useState('');
  const [pessimisticDays, setP] = useState('');
  const [refusal, setRefusal] = useState<ShownRefusal | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await request<DeskEnvelope>('/v1/gps/inputs/effort-triples', {
        method: 'POST',
        body: { offerKey, optimisticDays, likelyDays, pessimisticDays },
      });
      setRefusal(null);
      onAccept(res);
    } catch (err) {
      setRefusal(readRefusal(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>Effort triples — partner-days per engagement</CardHeader>
      <CardBody className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-grey">
                <th className="py-1 pr-3">Offer</th>
                <th className="py-1 pr-3">Optimistic</th>
                <th className="py-1 pr-3">Likely</th>
                <th className="py-1 pr-3">Pessimistic</th>
                <th className="py-1 pr-3">Basis</th>
                <th className="py-1">Stated by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const prior = row.basis === 'prior';
                return (
                  <tr key={row.offerKey} className="border-t border-line align-top" data-testid={`effort-${row.offerKey}`}>
                    <td className="py-2 pr-3 font-medium text-navy">{row.offerName}</td>
                    <td className={clsx('py-2 pr-3 tabular-nums', prior && 'text-grey')}>{row.optimisticDays}</td>
                    <td className={clsx('py-2 pr-3 tabular-nums', prior && 'text-grey')}>{row.likelyDays}</td>
                    <td className={clsx('py-2 pr-3 tabular-nums', prior && 'text-grey')}>{row.pessimisticDays}</td>
                    <td className="py-2 pr-3">
                      <Badge status={prior ? 'unverified' : 'ready'}>{prior ? 'PRIOR' : 'MEASURED'}</Badge>
                      {row.priorNotice !== null && (
                        <p className="mt-1 max-w-md text-xs text-status-unverified" data-testid={`effort-notice-${row.offerKey}`}>
                          {row.priorNotice}
                        </p>
                      )}
                    </td>
                    <td className="py-2 text-xs text-grey">
                      {row.statedBy === null ? 'nobody' : `${row.statedBy}${row.statedAt === null ? '' : ` · ${row.statedAt}`}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-4">
          <Select
            label="Offer for effort"
            value={offerKey}
            onChange={(e) => setOfferKey(e.target.value)}
            options={rows.map((r) => ({ value: r.offerKey, label: r.offerName }))}
          />
          <Input label="Optimistic days" value={optimisticDays} onChange={(e) => setO(e.target.value)} inputMode="decimal" />
          <Input label="Likely days" value={likelyDays} onChange={(e) => setL(e.target.value)} inputMode="decimal" />
          <Input label="Pessimistic days" value={pessimisticDays} onChange={(e) => setP(e.target.value)} inputMode="decimal" />
        </div>
        <p className="text-xs text-grey">
          A transposed triple is refused, not corrected. Downstream it would be silently CLAMPED, so the
          model would run on a triple nobody stated.
        </p>
        <Button onClick={submit} disabled={busy}>
          {busy ? 'Recording…' : 'Record this triple'}
        </Button>
        {refusal !== null && <RefusalPanel refusal={refusal} />}
      </CardBody>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* PANEL 3 — THE NAMED PARTNER AND WHAT THEY CHARGE                             */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE PARTNER PICKER IS THE SERVER'S LIST, AND IT IS EMPTY.
 *
 * `partnerOptions` comes from the compiled bench plus every partner already on a rate
 * card. Both are empty today (decision D5), so the select has nothing in it and the
 * desk-level `PARTNER_BENCH_EMPTY` refusal at the top of the screen says who has to
 * fix it and where. There is no free-text partner field: a card that creates its own
 * partner is how a typo becomes a second partner and a margin gets attributed to
 * nobody.
 *
 * The submit control stays ENABLED with an empty list, on purpose. The server decides
 * every refusal on this screen — including this one — and a button greyed out by the
 * browser is a judgement this page is not entitled to make.
 */
function RateCardPanel({
  rows,
  options,
  onAccept,
}: {
  rows: readonly RateCardRow[];
  options: readonly PartnerOption[];
  onAccept: (res: DeskEnvelope) => void;
}) {
  const [offerKey, setOfferKey] = useState<string>('diagnostic');
  const [partnerId, setPartnerId] = useState<string>(options[0]?.partnerId ?? '');
  const [unit, setUnit] = useState('day_rate');
  const [amountCents, setAmount] = useState('');
  const [expectedUnits, setUnits] = useState('');
  const [hoursPerDay, setHours] = useState('');
  const [fixedCostCents, setFixedCost] = useState('0');
  const [currency, setCurrency] = useState('USD');
  const [validUntil, setValidUntil] = useState('');
  const [refusal, setRefusal] = useState<ShownRefusal | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await request<DeskEnvelope>('/v1/gps/inputs/rate-cards', {
        method: 'POST',
        body: {
          offerKey, partnerId, unit, amountCents, expectedUnits, hoursPerDay,
          fixedCostCents, currency, validUntil,
        },
      });
      setRefusal(null);
      onAccept(res);
    } catch (err) {
      setRefusal(readRefusal(err));
    } finally {
      setBusy(false);
    }
  };

  const statusTone = (status: RateCardRow['status']) => (status === 'usable' ? 'ready' : 'blocked');

  return (
    <Card>
      <CardHeader>Named partner and rate card — what an offer costs LCX</CardHeader>
      <CardBody className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-grey" data-testid="no-rate-cards">
            No rate card is on file for any offer, so no partner is on the hook for any of them and every
            cost basis is the catalogue placeholder. This is not a display problem.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-grey">
                  <th className="py-1 pr-3">Offer</th>
                  <th className="py-1 pr-3">Partner</th>
                  <th className="py-1 pr-3">Rate</th>
                  <th className="py-1 pr-3">Cost of one engagement</th>
                  <th className="py-1 pr-3">Validity</th>
                  <th className="py-1">Stated by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.partnerId}|${row.offerKey}`}
                    className="border-t border-line align-top"
                    data-testid={`card-${row.partnerId}-${row.offerKey}`}
                  >
                    <td className="py-2 pr-3 font-medium text-navy">{row.offerName}</td>
                    <td className="py-2 pr-3">{row.partnerLabel ?? row.partnerId}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {money(row.amountCents, row.currency)}
                      <span className="ml-1 text-xs text-grey">{row.unit}</span>
                    </td>
                    <td className="py-2 pr-3 tabular-nums" data-testid={`cost-${row.partnerId}-${row.offerKey}`}>
                      {row.engagementCostCents === null ? (
                        // NULL is not 0. A zero cost would print 100% margin and P(loss) 0.
                        <span className="text-status-blocked">cannot be derived</span>
                      ) : (
                        money(row.engagementCostCents, row.currency)
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge status={statusTone(row.status)}>{row.status.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="py-2 text-xs text-grey">{row.statedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-3">
          <Select
            label="Offer for the card"
            value={offerKey}
            onChange={(e) => setOfferKey(e.target.value)}
            options={[
              { value: 'diagnostic', label: 'diagnostic' },
              { value: 'mica_whitepaper', label: 'mica_whitepaper' },
              { value: 'legal_opinion_coordination', label: 'legal_opinion_coordination' },
              { value: 'gtm_sprint', label: 'gtm_sprint' },
              { value: 'marketing_activation', label: 'marketing_activation' },
            ]}
          />
          <Select
            label="Partner"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            options={options.map((o) => ({ value: o.partnerId, label: `${o.label} (${o.origin})` }))}
          />
          <Select
            label="Unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            options={[
              { value: 'fixed', label: 'fixed' },
              { value: 'day_rate', label: 'day_rate' },
              { value: 'hourly', label: 'hourly' },
            ]}
          />
          <Input label="Amount (integer cents)" value={amountCents} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
          <Input label="Expected units" value={expectedUnits} onChange={(e) => setUnits(e.target.value)} inputMode="decimal" />
          <Input label="Hours per day (hourly only)" value={hoursPerDay} onChange={(e) => setHours(e.target.value)} inputMode="decimal" />
          <Input label="Pass-through (integer cents)" value={fixedCostCents} onChange={(e) => setFixedCost(e.target.value)} inputMode="numeric" />
          <Input label="Card currency" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={8} />
          <Input label="Valid until" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} placeholder="2027-01-01" />
        </div>
        {options.length === 0 && (
          <p className="text-xs text-status-blocked" data-testid="partner-picker-empty">
            The partner list is empty because this system knows no partner names. See the refusal at the
            top of this desk — it names both places a human can supply the first one.
          </p>
        )}
        <p className="text-xs text-grey">
          A rate with no validity is treated as UNUSABLE rather than valid forever, so the server refuses a
          card saved without one. Nothing here assumes an 8-hour day or a unit count of 1.
        </p>
        <Button onClick={submit} disabled={busy}>
          {busy ? 'Recording…' : 'Record this rate card'}
        </Button>
        {refusal !== null && <RefusalPanel refusal={refusal} />}
      </CardBody>
    </Card>
  );
}

export default GpsInputs;
