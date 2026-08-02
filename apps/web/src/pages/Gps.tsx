import { useCallback, useEffect, useMemo, useState } from 'react';
import { Globe, ShieldAlert, ShieldCheck, Send, Ban, CircleDollarSign, ListChecks } from 'lucide-react';
import { clsx } from 'clsx';
import {
  CATALOGUE_TODOS, ENGAGEMENT_STATUS_LABELS, OFFERS, PRICE_BANDS_ARE_PLACEHOLDERS,
  bandMidpointCents, getOffer, isTerminalEngagementStatus, marginCents, marginPct,
  type CatalogueTodo, type ConflictDecision, type ContractingEntity,
  type EngagementStatus, type OfferKey, type ServiceOffer,
} from '@lcx/shared';
import { PageTitle, Button, Badge, Input, Select, SectionLabel } from '@/components/ui';
import { CardSkeleton, ErrorNotice, EmptyState } from '@/components/shared';
import { toast } from '@/components/shared/Toast';
import { formatMoney } from '@/lib/format';
import {
  createGpsClient, createGpsEngagement, fetchGpsClients, fetchGpsEngagements,
  fetchGpsSummary, issueGpsProposal, recordGpsConflictCheck,
  type GpsEngagementRow, type GpsSummary,
} from '@/lib/api/gps';
import { GpsMetaBanner } from './GpsMetaBanner';
import { LegalPositionStamp } from '@/components/gps/LegalPositionStamp';
import { readLegalPosition } from '@/components/gps/legalPosition';
import type { GpsClient } from '@lcx/shared';

/**
 * GLOBAL SERVICES — the quote desk (the eighth compartment's first instrument).
 *
 * THE ONE SCREEN THAT MATTERS, and it is one screen on purpose. Pick a client,
 * pick an offer, read what is IN and what is explicitly OUT, set the price
 * against the vendor cost, see the margin BEFORE anything is sent, record the
 * conflict check, then issue. ~$250k of this work has been sold by hand with no
 * system (`GPS_IMPLEMENTATION_PLAN.md` §0); the only thing this surface has to
 * beat is a Google Doc, and it beats it by showing three things a document
 * cannot: the exclusions, the margin, and whether the conflict check exists.
 *
 * WHAT THIS SURFACE DELIBERATELY CANNOT DO — each one is a gate, not a gap:
 *
 *  1. ACCEPT A CLIENT DOCUMENT ON THIS SCREEN. No upload control, no file input,
 *     no drop zone, and no function behind one — `lib/api/gps.ts` has no upload
 *     export and `__tests__/gps.test.tsx` fails if one appears.
 *     WHAT CHANGED ON 2026-08-02: decision D2 (whether LCX legal/DPO accepts
 *     third-party confidential material on LCX infrastructure) was answered YES, so
 *     GPS does now store client documents — against an ENGAGEMENT, on the delivery
 *     desk (`components/gps/ArtifactIntake.tsx`, mounted by `GpsDelivery.tsx`). It
 *     stays off the quote desk because there is nothing to attach a document to
 *     until an engagement exists: a file dropped beside a half-built quote has no
 *     row to belong to, and the natural fix for that is a temporary holding area
 *     for client confidential material, which is the one thing nobody asked for.
 *  2. SEND ANYTHING TO A CLIENT. "Issue proposal" records that a proposal was
 *     issued and by when; it does not email, publish or deliver. Same shape as
 *     the reply desk, which approves text and never posts (`pages/Marketing.tsx:20`).
 *  3. PRESENT A PRICE AS AGREED. `PRICE_BANDS_ARE_PLACEHOLDERS` is `true`
 *     (`packages/shared/src/gps/catalogue.ts:58`) until D4, so every band on
 *     this page is badged as a placeholder and the quote field opens EMPTY
 *     rather than pre-filled from a number nobody decided. A system that
 *     quietly invents the founder's prices is worse than the document it
 *     replaces.
 *  4. STAFF AN ENGAGEMENT. `partnerOwner` is null on all five offers (no bench
 *     yet, decision D5), which the offer panel states as "cannot be staffed"
 *     rather than as an empty field.
 *
 * MARGIN IS DERIVED, NEVER STORED — here, in the API, and in `0047_gps.sql`.
 * The screen computes it from price and vendor cost with `marginCents()` so the
 * number a human reads cannot drift from the arithmetic. It is allowed to show
 * negative, in red, at quote time: at $10–25k with a partner delivering, one
 * scope overrun eats the engagement, and there is no margin column in 47
 * migrations (plan §6.4, §9).
 */
export function Gps() {
  const [summary, setSummary] = useState<GpsSummary | null>(null);
  const [clients, setClients] = useState<GpsClient[] | null>(null);
  const [engagements, setEngagements] = useState<GpsEngagementRow[] | null>(null);
  const [err, setErr] = useState<unknown>(null);

  const refresh = useCallback(() => {
    setErr(null);
    void Promise.all([fetchGpsSummary(), fetchGpsClients(), fetchGpsEngagements()])
      .then(([s, c, e]) => { setSummary(s); setClients(c); setEngagements(e); })
      .catch(setErr);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // `migrated: false` is the deploy-before-migration window, not an error. Every
  // write is declined by the API in that window, so the quote builder is hidden
  // rather than left there to fail on submit.
  const enabled = summary?.migrated !== false;

  return (
    <div className="p-5">
      <PageTitle
        icon={<Globe size={20} />}
        subtitle="Offer → proposal → deposit for the services business. Exclusions and margin are visible before anything is issued. The desk never sends to a client, and no price here is legally cleared."
      >
        Global Services
      </PageTitle>

      {/* Above everything, including the migration banner: a placeholder price
          rendered as a real one is the specific failure this build must avoid,
          and a banner below the fold does not prevent it. */}
      {PRICE_BANDS_ARE_PLACEHOLDERS && <PlaceholderPriceBanner />}

      {summary && !summary.migrated && <MigrationBanner />}

      {/* THE THREE READS, EACH DECLARING ITSELF. `summary.migrated` is a field on the
          summary payload and covers only the summary: `/clients` and `/engagements`
          report their own state in `meta` (routes/gps.ts:346, :409), and before this
          banner an unmigrated environment returned `[]` from both and the lists
          rendered "no clients yet" — a claim about the business made from a fact about
          the environment. */}
      <GpsMetaBanner of={[summary, clients, engagements]} />

      {summary && summary.migrated && <SummaryStrip s={summary} />}

      <CatalogueGaps todos={CATALOGUE_TODOS} />

      {err ? (
        <ErrorNotice error={err} onRetry={refresh} />
      ) : !summary || !clients || !engagements ? (
        <div className="mt-4"><CardSkeleton /></div>
      ) : (
        <>
          {/* `reads` is every payload this page is holding, handed down so the stamp
              can be derived from what the SERVER said rather than from what a child
              component assumed. If `legalPositionOnFile` lands on the summary, the
              client list or the engagement list — or in any of their envelopes — it is
              found. If it lands nowhere, the stamp fires, which is the safe direction
              (`components/gps/legalPosition.ts`). */}
          {enabled && (
            <QuoteBuilder clients={clients} onCreated={refresh} reads={[summary, clients, engagements]} />
          )}
          <EngagementList
            rows={engagements} onChanged={refresh} enabled={enabled}
            clients={clients} reads={[summary, clients, engagements]}
          />
        </>
      )}
    </div>
  );
}

export default Gps;

/**
 * THE BANNER THAT MUST NEVER BE REMOVED WITHOUT REMOVING THE PLACEHOLDERS.
 *
 * Rendered from `PRICE_BANDS_ARE_PLACEHOLDERS` rather than from a local flag, so
 * it disappears in the same commit that supplies real bands (D4) and cannot be
 * dismissed, snoozed or collapsed away before then. Vendor costs are placeholders
 * for the same reason (D5, no rate cards because no named partners), which is why
 * the wording says the margin arithmetic is correct but UNCALIBRATED — those are
 * different claims and only one of them is a defect.
 */
function PlaceholderPriceBanner() {
  return (
    <p
      role="note"
      data-testid="gps-placeholder-prices"
      className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-label text-amber-700 dark:text-amber-400"
    >
      <ShieldAlert size={12} className="mr-1.5 inline" />
      <strong>Every price on this page is a PLACEHOLDER — do not quote it to a client.</strong>{' '}
      Decision D4 is unanswered: the bands below were derived only from the stated $10–25k
      engagement range, and the vendor costs from no rate card at all (D5). The margin
      arithmetic is correct and <strong>uncalibrated</strong>. Real bands replace them in one
      place — <span className="font-mono text-micro">packages/shared/src/gps/catalogue.ts</span> —
      and this banner disappears with them.
    </p>
  );
}

/** Mirrors the reply desk's 0046 banner (`pages/Marketing.tsx:134`). GPS is 0047. */
function MigrationBanner() {
  return (
    <p className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-label text-amber-700 dark:text-amber-400">
      <strong>Awaiting migration 0047 on this environment.</strong> The compartment is deployed
      but its tables do not exist yet, so there are no clients or engagements and every write is
      declined. Apply <span className="font-mono text-micro">0047_gps.sql</span> and reload —
      nothing else in LCX OS is affected.
    </p>
  );
}

/**
 * REWRITTEN 2026-08-01 to match the server's actual payload.
 *
 * This read `s.counts`, `s.clientCount`, `s.openValueCents`, `s.openMarginCents`
 * and `s.missingConflictChecks` — none of which the API has ever returned. The
 * whole strip was built against an interface that described a payload nobody
 * served, so `Object.entries(s.counts)` threw
 * `Cannot convert undefined or null to object` and the compartment showed a Module
 * Error. It only surfaced when 0047 landed: until then the page returned early on
 * `migrated: false` and never reached here.
 *
 * Every field below is now read from `GpsSummary`, which mirrors `DeskSummary`
 * (apps/api/src/gps/service.ts:1053).
 *
 * MULTI-CURRENCY IS NOT A FLOURISH. The server groups money BY CURRENCY because a
 * partner may invoice in EUR against a USD price; summing them into one number
 * would state a total that is not true in any currency. So the strip shows the
 * dominant currency's figures and says how many others exist rather than adding
 * them up.
 */
function SummaryStrip({ s }: { s: GpsSummary }) {
  const live = Object.entries(s.engagements.byStatus)
    .filter(([k]) => !isTerminalEngagementStatus(k as EngagementStatus))
    .reduce((n, [, v]) => n + (v ?? 0), 0);

  // Largest open currency by price. Sorted rather than assumed: with no rows this
  // is undefined, which is why every read below is guarded.
  const open = [...s.openByCurrency].sort((a, b) => b.priceCents - a.priceCents)[0];
  const others = Math.max(0, s.openByCurrency.length - 1);
  const pct = open ? marginPct(open.priceCents, open.vendorCostCents) : null;
  const gaps = s.gaps;

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Live engagements" value={String(live)} />
      <Stat label="Clients" value={String(s.clients.total)} />
      <Stat
        label={open ? `Open value (${open.currency})` : 'Open value'}
        value={open ? formatMoney(open.priceCents / 100) : '—'}
        hint={others > 0 ? `+${others} other ${others === 1 ? 'currency' : 'currencies'}` : undefined}
      />
      {/* Margin, not revenue, is the number that decides whether this business
          works — partners deliver, so revenue with an unknown cost is noise. */}
      <Stat
        label={pct == null ? 'Open margin' : `Open margin (${pct}%)`}
        value={open ? formatMoney(open.marginCents / 100) : '—'}
        tone={open && open.marginCents < 0 ? 'bad' : undefined}
      />

      {/* Surfaced as a first-class number rather than buried in a detail view:
          a proposal issued with no recorded conflict check is the one failure an
          LCX employee's services business cannot explain after the fact (plan §5). */}
      {gaps.missingConflictCheck > 0 && (
        <p
          role="alert"
          className="sm:col-span-2 lg:col-span-4 rounded border border-status-blocked/40 bg-status-blocked-bg px-3 py-2 text-label text-status-blocked"
        >
          <ShieldAlert size={12} className="mr-1.5 inline" />
          <strong>
            {gaps.missingConflictCheck} live engagement{gaps.missingConflictCheck === 1 ? '' : 's'} with
            no recorded conflict check.
          </strong>{' '}
          Record one on each below. The record is what makes an exchange employee selling adjacent
          services defensible; it cannot be back-dated honestly.
        </p>
      )}

      {/* Sold on an offer with no named partner. Not cosmetic: with partners
          delivering, an unstaffable engagement is a promise nobody can keep. */}
      {gaps.unstaffable > 0 && (
        <p className="sm:col-span-2 lg:col-span-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-label text-amber-700 dark:text-amber-400">
          <strong>{gaps.unstaffable} engagement{gaps.unstaffable === 1 ? '' : 's'} with no named
          partner.</strong> The bench is empty until the partner-per-offer decision (D5) is made, so
          nothing here can be accepted for delivery yet.
        </p>
      )}
    </div>
  );
}

function Stat({
  label, value, tone, hint,
}: { label: string; value: string; tone?: 'bad'; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-grey">{label}</div>
      <div className={clsx('mt-1 text-[22px] font-bold tabular-nums',
        tone === 'bad' ? 'text-status-blocked' : 'text-navy')}>{value}</div>
      {/* Says "there is money in other currencies" without adding currencies
          together, which would state a total that is true in none of them. */}
      {hint && <div className="mt-0.5 font-mono text-[10px] text-grey">{hint}</div>}
    </div>
  );
}

/**
 * WHAT THE CATALOGUE IS STILL MISSING, shown rather than commented.
 *
 * `CATALOGUE_TODOS` (`packages/shared/src/gps/catalogue.ts:477`) is exported
 * precisely so a surface can render the gaps instead of a finished-looking
 * catalogue. The two that carry `blocksQuoting` are separated out and listed
 * first: those are the ones that make a number on this page unsendable, and
 * flattening them into one list of eight would let the important two hide.
 *
 * Every item's `owner` is founder, founder+counsel or partner — never ours. That
 * is why this is a checklist for a human and not a ticket queue.
 */
function CatalogueGaps({ todos }: { todos: readonly CatalogueTodo[] }) {
  const blocking = todos.filter((t) => t.blocksQuoting);
  const rest = todos.filter((t) => !t.blocksQuoting);
  return (
    <section className="mt-5" data-testid="gps-catalogue-todos">
      <SectionLabel>Catalogue is incomplete — {todos.length} open decisions, {blocking.length} block quoting</SectionLabel>
      <div className="mt-2 grid gap-2 lg:grid-cols-2">
        {[...blocking, ...rest].map((t) => (
          <div
            key={t.what}
            className={clsx('rounded-lg border bg-card p-3',
              t.blocksQuoting ? 'border-status-blocked/40' : 'border-line')}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {t.decision && (
                <span className="rounded border border-line px-1.5 py-0.5 font-mono text-micro text-grey">
                  {t.decision}
                </span>
              )}
              <span className="rounded bg-ice-soft/60 px-1.5 py-0.5 font-mono text-micro text-grey dark:bg-ice-soft/10">
                {t.owner}
              </span>
              {t.blocksQuoting && (
                <span className="rounded bg-status-blocked-bg px-1.5 py-0.5 font-mono text-micro font-bold text-status-blocked">
                  blocks quoting
                </span>
              )}
            </div>
            <p className="mt-1.5 text-label font-semibold text-navy">{t.what}</p>
            <p className="mt-1 text-micro text-grey">{t.consequence}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Whole dollars typed by a human → integer cents.
 *
 * Money is integer cents everywhere (`gps/types.ts:24`, `payment_milestones`),
 * and the ONLY float in the system is the string in this input. `Math.round`
 * closes it immediately: `17_500.1 * 100` is 1750010.0000000002 in IEEE-754, and
 * a bigint column would reject it. Returns null for empty or unparseable rather
 * than 0 — "no price yet" is not "$0", and the two must not collapse, because
 * `marginPct` returns null for one and a number for the other.
 */
function dollarsToCents(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

const money = (cents: number) => formatMoney(cents / 100, { exact: true });

/**
 * The quote builder. Client → offer → scope → price → margin → conflict → issue.
 *
 * The price field OPENS EMPTY, and that is the single most deliberate decision on
 * this page. `bandMidpointCents` exists and would be the obvious default, but
 * pre-filling a placeholder band's midpoint produces a screen where a number the
 * founder never chose looks chosen — and the whole failure mode this programme
 * guards against is a placeholder presented as real. The midpoint is offered as a
 * one-click fill instead, labelled as a placeholder, so using it is an act.
 */
function QuoteBuilder({ clients, onCreated, reads }: {
  clients: GpsClient[]; onCreated: () => void; reads: readonly unknown[];
}) {
  const [clientId, setClientId] = useState('');
  const [offerKey, setOfferKey] = useState<OfferKey>(OFFERS[0].key);
  const [entity, setEntity] = useState<ContractingEntity>('lcx');
  const [price, setPrice] = useState('');
  const [vendor, setVendor] = useState('');
  const [deposit, setDeposit] = useState('');
  const [busy, setBusy] = useState(false);

  const offer = useMemo(() => getOffer(offerKey), [offerKey]);
  const priceCents = dollarsToCents(price);
  // Vendor cost falls back to the catalogue's placeholder rather than to zero: a
  // blank cost silently reading as $0 would show a 100% margin on partner-
  // delivered work, which is the most flattering possible lie about this business.
  const vendorCents = dollarsToCents(vendor) ?? offer.expectedVendorCostCents;
  const vendorIsPlaceholder = dollarsToCents(vendor) == null;

  const belowBand = priceCents != null && priceCents < offer.priceBandCents.min;
  const aboveBand = priceCents != null && priceCents > offer.priceBandCents.max;

  /**
   * THE JURISDICTION IS THE CLIENT'S, AND IT IS FREE TEXT A HUMAN TYPED
   * (`0047_gps.sql:67` stores it that way on purpose, and `NewClientForm` below says
   * so). The stamp names it verbatim rather than mapping it to a code, because a
   * mapping is where "Liechtenstein" quietly becomes a jurisdiction the perimeter has
   * a row for. When no client is selected there is no jurisdiction at all, and the
   * stamp says that too — it is the strongest version of the sentence, not the weakest.
   */
  const selected = clients.find((c) => c.id === clientId) ?? null;
  const legal = readLegalPosition(reads, { jurisdiction: selected?.jurisdiction ?? null });

  const submit = async () => {
    if (!clientId) { toast('error', 'Pick a client first'); return; }
    if (priceCents == null) { toast('error', 'Set a price — the quote cannot open at nothing'); return; }
    setBusy(true);
    try {
      await createGpsEngagement({
        clientId,
        offerKey,
        contractingEntity: entity,
        priceCents,
        vendorCostCents: vendorCents,
        depositRequiredCents: dollarsToCents(deposit) ?? 0,
      });
      toast('success', 'Draft engagement created — record the conflict check, then issue.');
      setPrice(''); setVendor(''); setDeposit('');
      onCreated();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not create the engagement');
    } finally { setBusy(false); }
  };

  return (
    <section className="mt-5" data-testid="gps-quote-builder">
      <SectionLabel>Build a quote</SectionLabel>

      {clients.length === 0
        ? <NewClientForm onCreated={onCreated} />
        : (
          <div className="mt-2 rounded-lg border border-line bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)}
                options={[{ value: '', label: 'Select a client…' },
                  ...clients.map((c) => ({ value: c.id, label: c.name }))]}
              />
              <Select
                label="Offer" value={offerKey} onChange={(e) => setOfferKey(e.target.value as OfferKey)}
                options={OFFERS.map((o) => ({ value: o.key, label: o.name }))}
              />
              {/* D1 is deliberately undecided, so this is a field with a default
                  and never a constant (plan §3 D1). Four things derive from it:
                  disclosure text, invoice header, artifact storage target and
                  referral wording. */}
              <Select
                label="Contracting entity"
                value={entity} onChange={(e) => setEntity(e.target.value as ContractingEntity)}
                options={[
                  { value: 'lcx', label: 'LCX (default — D1 undecided)' },
                  { value: 'external', label: 'External entity' },
                ]}
              />
            </div>

            <OfferPanel offer={offer} />

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <Input
                  label="Price (USD)" inputMode="decimal" placeholder="e.g. 17500"
                  value={price} onChange={(e) => setPrice(e.target.value)}
                />
                <p className="mt-1 text-micro text-grey">
                  Placeholder band {money(offer.priceBandCents.min)}–{money(offer.priceBandCents.max)}.{' '}
                  <button
                    type="button" className="underline focus-ring"
                    onClick={() => setPrice(String(bandMidpointCents(offer) / 100))}
                  >
                    fill midpoint
                  </button>
                </p>
                {belowBand && (
                  <p className="mt-1 text-micro text-status-conditional">
                    Below the band floor — a real exception someone signs off on, not a discount slider.
                  </p>
                )}
                {aboveBand && (
                  <p className="mt-1 text-micro text-grey">Above the placeholder band ceiling.</p>
                )}
              </div>
              <div>
                <Input
                  label="Expected vendor cost (USD)" inputMode="decimal"
                  placeholder={String(offer.expectedVendorCostCents / 100)}
                  value={vendor} onChange={(e) => setVendor(e.target.value)}
                />
                <p className="mt-1 text-micro text-grey">
                  {vendorIsPlaceholder
                    ? `Using the catalogue placeholder ${money(offer.expectedVendorCostCents)} — no rate card exists (D5).`
                    : 'Partners deliver, so this is the real cost of the work.'}
                </p>
              </div>
              <Input
                label="Deposit required (USD)" inputMode="decimal" placeholder="0"
                value={deposit} onChange={(e) => setDeposit(e.target.value)}
              />
            </div>

            {/* BESIDE THE MONEY, ABOVE IT, AND BEFORE THE BUTTON THAT COMMITS IT.
                The quote gate stopped refusing on 2026-08-02 and this sentence is what
                the desk accepted in exchange, so it cannot sit under the fold or after
                the create control. */}
            <LegalPositionStamp reading={legal} subject="quote" className="mt-4" />

            <MarginReadout priceCents={priceCents} vendorCents={vendorCents} />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void submit()} disabled={busy || !clientId || priceCents == null}>
                <CircleDollarSign size={13} /> Create draft engagement
              </Button>
              <span className="text-micro text-grey">
                Creates a draft. Nothing is sent to the client, and the proposal cannot be issued
                until a conflict check is recorded against it.
              </span>
            </div>
          </div>
        )}
    </section>
  );
}

/**
 * Margin at quote time, in the three states that matter and no fourth.
 *
 * There is no margin column anywhere in 47 migrations (plan §6.4). Negative is
 * rendered loudly and never clamped — `marginCents` is deliberately allowed to go
 * negative (`gps/types.ts:268`) so a quote under vendor cost reads as −$2,000
 * here rather than as a surprise at invoice time.
 */
function MarginReadout({ priceCents, vendorCents }: { priceCents: number | null; vendorCents: number }) {
  if (priceCents == null) {
    return (
      <p className="mt-3 rounded border border-line bg-ice-soft/40 px-3 py-2 text-label text-grey dark:bg-ice-soft/5">
        Margin appears once a price is set. It is not zero yet — it is unknown.
      </p>
    );
  }
  const m = marginCents(priceCents, vendorCents);
  const pct = marginPct(priceCents, vendorCents);
  const bad = m <= 0;
  return (
    <div
      data-testid="gps-margin"
      className={clsx('mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded border px-3 py-2',
        bad ? 'border-status-blocked/40 bg-status-blocked-bg' : 'border-line bg-ice-soft/40 dark:bg-ice-soft/5')}
    >
      <span className="font-mono text-[10px] uppercase tracking-wider text-grey">Margin</span>
      <span className={clsx('text-[22px] font-bold tabular-nums', bad ? 'text-status-blocked' : 'text-navy')}>
        {money(m)}
      </span>
      {pct != null && (
        <span className={clsx('text-label font-semibold tabular-nums', bad ? 'text-status-blocked' : 'text-grey')}>
          {pct}% of price
        </span>
      )}
      <span className="text-micro text-grey">
        {money(priceCents)} price − {money(vendorCents)} vendor cost. Gross margin on price, not
        markup on cost. Uncalibrated while vendor costs are placeholders.
      </span>
      {bad && (
        <span className="w-full text-micro font-semibold text-status-blocked">
          This quote does not pay for the work it buys.
        </span>
      )}
    </div>
  );
}

/**
 * The scope, as the client will read it — with EXCLUSIONS given equal visual
 * weight to inclusions, which is the entire argument for this panel.
 *
 * The existing proposal snapshot has no exclusions field at all
 * (`packages/shared/src/deals/index.ts:69` emits inclusions, tiers, claimsUsed,
 * disclaimer only). For an exchange employee selling adjacent services, an
 * unstated exclusion is an implied promise about a listing or a regulatory
 * outcome that nobody ever made — so they are rendered in full, never truncated
 * and never behind a disclosure triangle.
 */
function OfferPanel({ offer }: { offer: ServiceOffer }) {
  return (
    <div className="mt-4 rounded-lg border border-line bg-ice-soft/30 p-3 dark:bg-ice-soft/5">
      <p className="text-label text-navy"><strong>Outcome.</strong> {offer.outcome}</p>

      {/* `partnerOwner` is null on every offer today and honestly so: no bench
          exists (D5). A null means the engagement CANNOT be staffed — not that it
          is merely unassigned — so it is stated, not left blank. */}
      <p className="mt-2 rounded border border-status-conditional/40 bg-status-conditional-bg px-2 py-1 text-micro text-status-conditional">
        {offer.partnerOwner
          ? <>Delivered by <strong>{offer.partnerOwner}</strong>.</>
          : <>No named partner for this offer, so it <strong>cannot be staffed yet</strong> (decision D5).
            Partners deliver; selling before a name exists is how a referral network gets burned.</>}
        {offer.creditableAgainstEngagement && ' This fee is creditable against a follow-on engagement.'}
      </p>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ScopeList title={`Included (${offer.inclusions.length})`} items={offer.inclusions} />
        <ScopeList
          title={`NOT included (${offer.exclusions.length})`}
          items={offer.exclusions}
          tone="exclusion"
        />
        <ScopeList title="Client must supply" items={offer.requiredClientInputs} note="Collected in conversation — this desk has no intake path by construction (D2)." />
        <ScopeList title="Acceptance criteria" items={offer.acceptanceCriteria} note="A partner is paid against these, not against effort." />
      </div>

      <p className="mt-3 text-micro text-grey"><strong>Renewal path.</strong> {offer.renewalPath}</p>
    </div>
  );
}

function ScopeList({ title, items, tone, note }: {
  title: string; items: readonly string[]; tone?: 'exclusion'; note?: string;
}) {
  return (
    <div>
      <div className={clsx('font-mono text-[10px] font-bold uppercase tracking-wider',
        tone === 'exclusion' ? 'text-status-blocked' : 'text-grey')}>{title}</div>
      <ul className="mt-1 space-y-1">
        {items.map((it) => (
          <li key={it} className={clsx('flex gap-1.5 text-micro',
            tone === 'exclusion' ? 'text-navy' : 'text-grey')}>
            <span aria-hidden className={clsx('mt-[3px] shrink-0',
              tone === 'exclusion' ? 'text-status-blocked' : 'text-grey-light')}>
              {tone === 'exclusion' ? <Ban size={10} /> : <ListChecks size={10} />}
            </span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-1 text-micro italic text-grey-light">{note}</p>}
    </div>
  );
}

/** The desk cannot quote with no clients, so the empty state IS the form. */
function NewClientForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast('error', 'A client needs a name'); return; }
    setBusy(true);
    try {
      await createGpsClient({ name: name.trim(), jurisdiction: jurisdiction.trim() || undefined });
      setName(''); setJurisdiction('');
      onCreated();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not add the client');
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-2 rounded-lg border border-line bg-card p-4">
      <p className="text-label text-grey">No clients yet. Add the one you are talking to.</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Input label="Client name" value={name} onChange={(e) => setName(e.target.value)} />
        {/* Free text, not an enum: every jurisdiction rule in this programme is
            unverified recalled training data (plan §0), so the system records
            what a human typed and refuses to infer a perimeter from it. */}
        <Input
          label="Jurisdiction (free text)" value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value)}
        />
      </div>
      <div className="mt-3">
        <Button size="sm" onClick={() => void submit()} disabled={busy}>Add client</Button>
      </div>
    </div>
  );
}

/**
 * The engagement list: status and margin on every row, because those are the two
 * facts that decide what to do next and neither is visible on a proposal PDF.
 *
 * Terminal engagements (`collected`, `closed_lost`, `cancelled`) are kept in the
 * list rather than filtered away — a services business dies of
 * delivered-and-never-collected, so the collected ones are the evidence and the
 * lost ones are the calibration.
 */
function EngagementList({ rows, onChanged, enabled, clients, reads }: {
  rows: GpsEngagementRow[]; onChanged: () => void; enabled: boolean;
  /** For the jurisdiction only: `GpsEngagementRow` joins the client NAME, not its
   *  jurisdiction (`lib/api/gps.ts:60`), and the stamp has to name a place. */
  clients: GpsClient[];
  reads: readonly unknown[];
}) {
  return (
    <section className="mt-6" data-testid="gps-engagements">
      <SectionLabel>Engagements</SectionLabel>
      {rows.length === 0 ? (
        <div className="mt-2">
          <EmptyState
            title="No engagements yet"
            description="Build a quote above. A draft engagement freezes the offer as quoted, so editing the catalogue later never rewrites what a client agreed to."
          />
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          {rows.map((r) => (
            <EngagementCard
              key={r.id} row={r} onChanged={onChanged} enabled={enabled} reads={reads}
              jurisdiction={clients.find((c) => c.id === r.clientId)?.jurisdiction ?? null}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Engagement status → badge tone.
 *
 * `conflict_pending` is `blocked` and not `conditional` on purpose: it is not a
 * slow stage, it is a stop. Terminal-but-lost is `deferred` rather than blocked —
 * a lost deal is information, not a fault.
 */
function statusTone(s: EngagementStatus): 'ready' | 'conditional' | 'blocked' | 'deferred' | 'unverified' {
  if (s === 'collected') return 'ready';
  if (s === 'conflict_pending') return 'blocked';
  if (s === 'closed_lost' || s === 'cancelled') return 'deferred';
  if (s === 'draft') return 'unverified';
  return 'conditional';
}

function EngagementCard({ row, onChanged, enabled, jurisdiction, reads }: {
  row: GpsEngagementRow; onChanged: () => void; enabled: boolean;
  jurisdiction: string | null; reads: readonly unknown[];
}) {
  const [busy, setBusy] = useState(false);
  const offer = getOffer(row.offerKey);
  // Per card, because the jurisdiction is per client: one row on this list may have a
  // position on file and the next may not, and a page-level banner would flatten that
  // into one sentence that is wrong about half the rows.
  const legal = readLegalPosition([row, ...reads], { jurisdiction });
  const m = marginCents(row.priceCents, row.vendorCostCents);
  const pct = marginPct(row.priceCents, row.vendorCostCents);

  /*
   * THE GATE. A proposal may not be issued before the conflict check is recorded.
   *
   * The API enforces this too, and the duplication is deliberate: a disabled
   * button with a stated reason TEACHES the rule, and the server check ENFORCES
   * it. Only the second one is a control; without the first, the desk learns the
   * rule by being refused, which is how people learn to work around it.
   */
  const canIssue = row.conflict != null && (row.status === 'draft' || row.status === 'conflict_pending');

  const issue = async () => {
    setBusy(true);
    try {
      await issueGpsProposal(row.id);
      toast('success', 'Proposal issued and recorded. Sending it is still a human act.');
      onChanged();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not issue');
    } finally { setBusy(false); }
  };

  return (
    <div data-juice className="rounded-lg border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-navy">{row.clientName}</span>
        <span className="text-label text-grey">{offer.name}</span>
        <Badge status={statusTone(row.status)}>{ENGAGEMENT_STATUS_LABELS[row.status]}</Badge>
        <span
          className="rounded border border-line px-1.5 py-0.5 font-mono text-micro text-grey"
          title="Who contracts with the client (decision D1, deliberately undecided)"
        >
          {row.contractingEntity}
        </span>
        <span className="ml-auto font-mono text-micro text-grey">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Figure label="Price" value={money(row.priceCents)} />
        <Figure label="Vendor cost" value={money(row.vendorCostCents)} />
        <Figure
          label={pct == null ? 'Margin' : `Margin (${pct}%)`}
          value={money(m)}
          tone={m <= 0 ? 'bad' : undefined}
        />
        {row.depositRequiredCents > 0 && (
          <Figure
            label={row.depositPaidAt ? 'Deposit paid' : 'Deposit due'}
            value={money(row.depositRequiredCents)}
            tone={row.depositPaidAt ? undefined : 'warn'}
          />
        )}
      </div>

      {/* THE STAMP ON THE PROPOSAL. Above the conflict record and above the issue
          control, because this card is the proposal surface: the button below it is
          what marks a proposal issued, and the sentence has to be read first. */}
      <LegalPositionStamp reading={legal} subject="proposal" className="mt-3" />

      {row.conflict ? (
        <p className="mt-3 rounded border border-line bg-ice-soft/40 px-2.5 py-2 text-micro text-grey dark:bg-ice-soft/5">
          <ShieldCheck size={11} className="mr-1 inline text-status-ready" />
          Conflict check <strong>{row.conflict.decision.replace(/_/g, ' ')}</strong> by{' '}
          <span className="font-mono">{row.conflict.decidedBy}</span> on{' '}
          {new Date(row.conflict.decidedAt).toLocaleDateString()}.{' '}
          {/* Do not let this record imply more than it is. Attribution across the
              whole platform rests on a shared DESK_PASSCODE (plan §1.5:
              "per-person attribution you could show a client: ABSENT"). The
              record is real, dated and verbatim; it is not proof of WHO. */}
          <span className="italic">Attribution is desk-level — the passcode is shared, so this names
          the desk, not a verified individual.</span>
        </p>
      ) : (
        <ConflictForm engagementId={row.id} onRecorded={onChanged} disabled={!enabled} />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* At most ONE control on this card carries primary weight, and which one
            it is moves with the state: while the check is missing the only real
            write is recording it (inside ConflictForm), and once it exists the
            write is issuing. They are never both loud, which is what keeps the
            card from having two primaries — the defect
            `__tests__/sendQueueAuthority.test.tsx` was written for. */}
        {row.conflict != null && !isTerminalEngagementStatus(row.status) && (
          <Button size="xs" onClick={() => void issue()} disabled={busy || !canIssue || !enabled}>
            <Send size={12} /> Issue proposal
          </Button>
        )}
        {row.status !== 'draft' && row.status !== 'conflict_pending' && (
          <span className="text-micro text-grey">
            Already issued — status is moved by hand from here (Phase 1 ships no delivery surfaces).
          </span>
        )}
        {row.conflict == null && (
          <span className="text-micro text-status-blocked">
            Cannot be issued until the conflict check above is recorded.
          </span>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'warn' }) {
  return (
    <span className="inline-flex flex-col">
      <span className="font-mono text-[10px] uppercase tracking-wider text-grey">{label}</span>
      <span className={clsx('text-label font-bold tabular-nums',
        tone === 'bad' ? 'text-status-blocked'
          : tone === 'warn' ? 'text-status-conditional' : 'text-navy')}>{value}</span>
    </span>
  );
}

/**
 * Record the conflict check — one row per engagement, and the one piece of
 * compliance machinery that genuinely did not exist anywhere in the platform
 * (plan §5).
 *
 * `cleared_with_disclosure` is the realistic common case rather than an edge: an
 * LCX employee selling adjacent services will usually proceed WITH a disclosure,
 * and the value of the record is the exact text used, stored verbatim — not a
 * template id, because the template will be edited and the defensible record is
 * what the client was actually told on the day (`gps/types.ts:356`).
 */
function ConflictForm({ engagementId, onRecorded, disabled }: {
  engagementId: string; onRecorded: () => void; disabled: boolean;
}) {
  const [checkPerformed, setCheckPerformed] = useState('');
  const [decision, setDecision] = useState<ConflictDecision>('cleared_with_disclosure');
  const [disclosure, setDisclosure] = useState('');
  const [busy, setBusy] = useState(false);

  const needsDisclosure = decision === 'cleared_with_disclosure';
  const ready = checkPerformed.trim().length > 0 && (!needsDisclosure || disclosure.trim().length > 0);

  const submit = async () => {
    if (!ready) {
      toast('error', needsDisclosure
        ? 'Both what was checked and the disclosure text used are required'
        : 'Say what was checked');
      return;
    }
    setBusy(true);
    try {
      await recordGpsConflictCheck(engagementId, {
        checkPerformed: checkPerformed.trim(),
        decision,
        disclosureTextUsed: needsDisclosure ? disclosure.trim() : undefined,
      });
      toast('success', 'Conflict check recorded.');
      onRecorded();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not record the check');
    } finally { setBusy(false); }
  };

  const cls = 'w-full rounded border border-line bg-card px-2.5 py-2 text-label text-navy focus-ring';
  return (
    <div className="mt-3 rounded-lg border border-status-blocked/40 bg-status-blocked-bg/40 p-3">
      <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-status-blocked">
        <ShieldAlert size={12} /> Conflict check required before issuing
      </div>
      <p className="mt-1 text-micro text-grey">
        The founder is an LCX employee and LCX is a regulated exchange. Record what was checked, the
        decision, and — if proceeding with a disclosure — the exact words the client was given.
      </p>
      <textarea
        className={`${cls} mt-2 min-h-[56px]`} value={checkPerformed}
        onChange={(e) => setCheckPerformed(e.target.value)}
        aria-label="What was checked"
        placeholder="What was checked, in your own words (e.g. no LCX listing application open or expected; no LCX commercial relationship; sanctions screen run on the entity and its directors)."
      />
      <div className="mt-2">
        <Select
          label="Decision" value={decision}
          onChange={(e) => setDecision(e.target.value as ConflictDecision)}
          options={[
            { value: 'cleared_with_disclosure', label: 'Cleared with disclosure (usual)' },
            { value: 'cleared', label: 'Cleared — no disclosure needed' },
            { value: 'declined', label: 'Declined — do not proceed' },
          ]}
        />
      </div>
      {needsDisclosure && (
        <textarea
          className={`${cls} mt-2 min-h-[56px]`} value={disclosure}
          onChange={(e) => setDisclosure(e.target.value)}
          aria-label="Disclosure text used, verbatim"
          placeholder="The disclosure text actually given to the client, verbatim. No standard text exists yet (that gap is listed above), so it is drafted here and stored as written."
        />
      )}
      <div className="mt-2">
        <Button size="xs" onClick={() => void submit()} disabled={busy || disabled || !ready}>
          <ShieldCheck size={12} /> Record conflict check
        </Button>
      </div>
    </div>
  );
}
