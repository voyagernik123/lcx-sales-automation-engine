import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, CardBody, CardHeader, Input, PageTitle, Select } from '@/components/ui';
import { CardSkeleton, ErrorNotice } from '@/components/shared';
import { ApiError, request } from '@/lib/apiClient';
import { attachMeta } from '@/lib/api/meta';
import { GpsMetaBanner } from '@/pages/GpsMetaBanner';
/**
 * THE RESPONSE TYPES COME FROM THE SHARED CONTRACT, BY PACKAGE NAME, AND THIS PAGE
 * DECLARES NONE OF ITS OWN.
 *
 * `apps/web/src/lib/api/gps.ts:60` is the post-mortem for the alternative: a
 * hand-written `GpsSummary` claiming three fields the API had never sent, believed by
 * `tsc`, agreed with by a test that mocked the boundary, and crashing in production.
 * `partnerRegistryDeskDefects` — declared beside these types — is run over a real
 * serialised response in the route test and over this page's fixture in
 * `__tests__/gpsPartnerRegistry.test.tsx`, so neither side merely describes the shape.
 *
 * `import type`, so nothing from that module reaches the bundle: the page carries the
 * SHAPE and no runtime dependency.
 */
import type {
  FloorRefusal,
  PartnerRegistryBenchMember,
  PartnerRegistryDesk,
  PartnerRegistryFloorView,
} from '@lcx/shared';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  GLOBAL SERVICES — THE PARTNER REGISTRY.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The screen the owner's 2026-08-07 decision produced: A NAMED HUMAN MAY ASSERT A
 * PARTNER NAME AND A RATE CARD, ATTRIBUTED TO THEM. Three things happen here and
 * nowhere else:
 *
 *  1. A PARTNER IS ASSERTED, with who / when / on what basis. Before this screen the
 *     only way to put a name into this system was to insert a `gps_rate_card` row by
 *     hand in the Supabase SQL editor — `POST /v1/gps/inputs/rate-cards` said so in
 *     its own refusal, because its partner list came from a compiled empty array.
 *  2. A RATE CARD IS ENTERED against an asserted partner, so the cost basis has an
 *     owner.
 *  3. THE FLOOR IS READ — the lowest price at which that partner delivering that
 *     offer does not lose money — or every reason there is not one.
 *
 * ── THIS PAGE MAKES NO JUDGEMENT ABOUT A VALUE ───────────────────────────────
 * There is no client-side validation here, on purpose, and no submit control is
 * disabled on the basis of what was typed. Every rule — a rate of zero, a metered
 * card with no unit count, a card with no expiry, a blank basis — is enforced by
 * `apps/api/src/gps/partnerRegistry.ts`, and this page renders the server's refusal
 * VERBATIM with the rule it cited. A browser-side copy of those rules would drift,
 * and the copy that drifted would be the one the operator saw.
 *
 * ── THE THREE ABSENCES DO NOT RENDER ALIKE ───────────────────────────────────
 * `not_loaded` (the migration is not applied), `withheld` (a clearance stops it) and
 * `empty` (nobody has been asked yet) each get their own panel and their own next
 * action. Collapsing them into "no partners" would send someone to hire a
 * subcontractor when the actual remedy is one SQL file.
 *
 * ── WHAT THIS SCREEN DOES NOT CLAIM ──────────────────────────────────────────
 * An assertion is a CLAIM. The caveat is rendered from `assertionIsAClaim` on the
 * payload rather than typed here, so it cannot be dropped by forgetting a sentence,
 * and the attribution is only as strong as the shared desk passcode — which the
 * footer says out loud.
 */

/** Option lists the `Select` component takes as data rather than as children. */
const SENIORITY_OPTIONS = [
  { value: 'principal', label: 'principal' },
  { value: 'senior', label: 'senior' },
  { value: 'associate', label: 'associate' },
];

const UNIT_OPTIONS = [
  { value: 'fixed', label: 'fixed' },
  { value: 'day_rate', label: 'day_rate' },
  { value: 'hourly', label: 'hourly' },
];

const FLOOR_POINT_HELP: Record<string, string> = {
  likely: 'The mode — what the work normally takes.',
  pessimistic: 'It goes wrong in the ordinary ways. Hold this line when an overrun would be fatal.',
};

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** A refusal as the server sent it, whatever shape of failure produced it. */
interface ShownRefusal {
  code: string;
  message: string;
  rule?: string | null;
  field?: string | null;
}

function readRefusal(err: unknown): ShownRefusal {
  if (err instanceof ApiError) {
    const detail = (err.data?.refusal ?? {}) as Record<string, unknown>;
    return {
      code: err.code ?? `HTTP_${err.status}`,
      message: err.message,
      rule: typeof detail.rule === 'string' ? detail.rule : null,
      field: typeof detail.field === 'string' ? detail.field : null,
    };
  }
  return { code: 'UNKNOWN', message: String(err), rule: null, field: null };
}

function RefusalPanel({ refusal }: { refusal: ShownRefusal }) {
  return (
    <div data-testid={`refusal-${refusal.code}`} className="rounded border border-red-500/40 bg-red-500/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-600">{refusal.code}</p>
      <p className="mt-1 text-sm text-navy">{refusal.message}</p>
      {refusal.field && <p className="mt-1 text-xs text-grey">Field: {refusal.field}</p>}
      {refusal.rule && <p className="mt-2 border-l-2 border-line pl-2 text-xs italic text-grey">{refusal.rule}</p>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */

export function GpsPartnerRegistry() {
  const [desk, setDesk] = useState<PartnerRegistryDesk | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request<Envelope<PartnerRegistryDesk>>('/v1/gps/partner-registry');
      // RE-ATTACH THE ENVELOPE, exactly as `GpsInputs.tsx` does. This page unpacks
      // `{ data, meta }` by hand, and without the re-attach `metaNotices` would
      // correctly report `envelope-not-carried` on every render — the screen saying it
      // cannot tell what it is missing while the envelope is right there. What travels
      // in `meta` and not in `data` is `migrated: false`, which is the difference
      // between "no partner has been asserted" and "the table does not exist here".
      setDesk(attachMeta(res.data, res.meta ?? {}));
      // The failure gets its OWN state. Resetting `desk` to null here would make the
      // skeleton below pulse forever, with no retry and nothing said.
      setLoadError(null);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Who delivers, what they charge, and the floor that follows from it. Every partner here was asserted by a named human.">
        GPS partner registry
      </PageTitle>

      {loading && desk === null && loadError === null && <CardSkeleton />}
      {loadError !== null && <ErrorNotice error={loadError} onRetry={load} />}

      {desk !== null && (
        <>
          {/* What this read declared about itself, above everything derived from it. */}
          <GpsMetaBanner of={[desk]} className="mt-0" />
          <BenchPanel desk={desk} onChanged={load} />
          <AssertPartnerPanel onChanged={load} />
          <RateCardPanel desk={desk} onChanged={load} />
          <FloorPanel desk={desk} />
          <footer className="border-t border-line pt-3 text-xs text-grey">
            <p>
              Read at {desk.asOf} · contract {desk.contract} · registers: registry{' '}
              {String(desk.registers.registry)}, capabilities {String(desk.registers.capabilities)}, rate cards{' '}
              {String(desk.registers.rateCards)}, effort triples {String(desk.registers.effortTriples)}.
            </p>
            <p className="mt-1" data-testid="assertion-caveat">{desk.assertionIsAClaim}</p>
            <p className="mt-1">
              Attribution here is only as strong as the shared desk passcode: it is a dated record of what
              was stated and by which session, not evidence of which human stated it.
            </p>
          </footer>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE BENCH — and the three ways it can be absent                             */
/* ══════════════════════════════════════════════════════════════════════════ */

function BenchPanel({ desk, onChanged }: { desk: PartnerRegistryDesk; onChanged: () => void }) {
  const bench = desk.bench;
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-navy">The bench</h2>
      </CardHeader>
      <CardBody>
        {bench.state === 'not_loaded' && (
          <div data-testid="bench-not-loaded" className="rounded border border-amber-500/40 bg-amber-500/5 p-3">
            <Badge status="unverified">Not loaded</Badge>
            <p className="mt-2 text-sm text-navy">{bench.note}</p>
            <p className="mt-2 text-xs text-grey">
              This is not an empty bench. Nobody has been asked yet, because there is nowhere to record an
              answer: apply <code>{desk.migration}</code> and read this screen again.
            </p>
          </div>
        )}
        {bench.state === 'withheld' && (
          <div data-testid="bench-withheld" className="rounded border border-amber-500/40 bg-amber-500/5 p-3">
            <Badge status="deferred">Withheld</Badge>
            <p className="mt-2 text-sm text-navy">{bench.note}</p>
            <p className="mt-2 text-xs text-grey">
              The bench exists and this session may not see it. Nothing is missing from the record — do not
              enter a second copy to work around it.
            </p>
          </div>
        )}
        {bench.state === 'empty' && (
          <div data-testid="bench-empty" className="rounded border border-line bg-card p-3">
            <Badge status="unverified">No partners asserted</Badge>
            <p className="mt-2 text-sm text-navy">{bench.note}</p>
            <p className="mt-2 text-xs text-grey">
              The register exists and holds nothing. This is a conversation to have, not a migration to run.
            </p>
          </div>
        )}
        {bench.state === 'loaded' && (
          <ul className="space-y-3" data-testid="bench-loaded">
            {bench.members.map((m) => <BenchRow key={m.partner.id} member={m} onChanged={onChanged} desk={desk} />)}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function BenchRow({
  member,
  desk,
  onChanged,
}: {
  member: PartnerRegistryBenchMember;
  desk: PartnerRegistryDesk;
  onChanged: () => void;
}) {
  const p = member.partner;
  return (
    <li className="rounded border border-line p-3" data-partner={p.id}>
      <div className="flex flex-wrap items-baseline gap-2">
        <strong className="text-sm text-navy">{p.name}</strong>
        <code className="text-xs text-grey">{p.id}</code>
        {p.active ? <Badge status="ready">On the bench</Badge> : <Badge status="deferred">Off the bench</Badge>}
      </div>

      {/* THE ATTRIBUTION IS THE ROW, not a tooltip on it. */}
      <p className="mt-2 text-xs text-grey" data-testid={`assertion-${p.id}`}>
        Asserted by <strong>{p.assertion.assertedBy}</strong> on {p.assertion.assertedAt}
      </p>
      <p className="mt-1 text-sm text-navy">{p.assertion.basis}</p>

      <div className="mt-2 flex flex-wrap gap-3 text-xs text-grey">
        <span data-testid={`capacity-${p.id}`}>
          {member.capacityStated
            ? `Concurrency cap: ${p.capacity.maxConcurrent} (stated by ${p.capacity.statedBy})`
            : 'Concurrency cap: NOBODY HAS STATED ONE — this is not zero, and it is not unlimited'}
        </span>
        <span>{p.rateCards.length} rate card(s)</span>
        <span>{p.capabilities.length} capability(ies)</span>
        {member.bdPartnerId === null
          ? <span>No link to the BD bench stated</span>
          : <span>Linked to BD partner {member.bdPartnerId}</span>}
      </div>

      <CapabilityForm partnerId={p.id} desk={desk} onChanged={onChanged} />
    </li>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* ASSERTING A PARTNER                                                         */
/* ══════════════════════════════════════════════════════════════════════════ */

function AssertPartnerPanel({ onChanged }: { onChanged: () => void }) {
  const [partnerId, setPartnerId] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [assertionBasis, setBasis] = useState('');
  const [maxConcurrent, setMax] = useState('');
  const [refusal, setRefusal] = useState<ShownRefusal | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    setBusy(true);
    try {
      await request<Envelope<unknown>>('/v1/gps/partner-registry/partners', {
        method: 'POST',
        body: {
          partnerId,
          partnerName,
          assertionBasis,
          // Empty means NOBODY STATED A CAP. It is sent as absent rather than as 0,
          // because 0 means the partner is full.
          maxConcurrent: maxConcurrent.trim() === '' ? null : Number(maxConcurrent),
        },
      });
      setRefusal(null);
      onChanged();
    } catch (err) {
      setRefusal(readRefusal(err));
    } finally {
      setBusy(false);
    }
  }, [partnerId, partnerName, assertionBasis, maxConcurrent, onChanged]);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-navy">Assert a partner</h2>
      </CardHeader>
      <CardBody>
        <p className="mb-3 text-xs text-grey">
          You are the named human this record will carry. The basis is not paperwork: when this partner
          misses a delivery it is the only thing a reviewer can argue with.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-grey">
            Partner id
            <Input value={partnerId} onChange={(e) => setPartnerId(e.target.value)} placeholder="counsel-one" />
          </label>
          <label className="text-xs text-grey">
            Name
            <Input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder="Counsel One AG" />
          </label>
          <label className="text-xs text-grey sm:col-span-2">
            On what basis
            <Input
              value={assertionBasis}
              onChange={(e) => setBasis(e.target.value)}
              placeholder="Delivered the notification pack in March; rate confirmed by email on 6 Aug."
            />
          </label>
          <label className="text-xs text-grey">
            Concurrency cap (leave blank if nobody has stated one)
            <Input value={maxConcurrent} onChange={(e) => setMax(e.target.value)} placeholder="" />
          </label>
        </div>
        <Button className="mt-3" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Recording…' : 'Assert this partner'}
        </Button>
        {refusal !== null && <div className="mt-3"><RefusalPanel refusal={refusal} /></div>}
      </CardBody>
    </Card>
  );
}

function CapabilityForm({
  partnerId,
  desk,
  onChanged,
}: {
  partnerId: string;
  desk: PartnerRegistryDesk;
  onChanged: () => void;
}) {
  const [offerKey, setOfferKey] = useState<string>(desk.offerKeys[0] ?? '');
  const [seniority, setSeniority] = useState('senior');
  const [jurisdictions, setJurisdictions] = useState('');
  const [refusal, setRefusal] = useState<ShownRefusal | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    setBusy(true);
    try {
      await request<Envelope<unknown>>(`/v1/gps/partner-registry/partners/${encodeURIComponent(partnerId)}/capabilities`, {
        method: 'POST',
        body: {
          offerKey,
          seniority,
          // Split on commas and nothing else. No expansion, no inference: "EU" is
          // stored as "EU" and does not cover Liechtenstein anywhere in this system.
          jurisdictions: jurisdictions.split(',').map((j) => j.trim()).filter((j) => j !== ''),
        },
      });
      setRefusal(null);
      onChanged();
    } catch (err) {
      setRefusal(readRefusal(err));
    } finally {
      setBusy(false);
    }
  }, [partnerId, offerKey, seniority, jurisdictions, onChanged]);

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-grey">Record what {partnerId} can deliver</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Select
          value={offerKey}
          onChange={(e) => setOfferKey(e.target.value)}
          aria-label={`Offer for ${partnerId}`}
          options={desk.offerKeys.map((k) => ({ value: k, label: k }))}
        />
        <Select
          value={seniority}
          onChange={(e) => setSeniority(e.target.value)}
          aria-label={`Seniority for ${partnerId}`}
          options={SENIORITY_OPTIONS}
        />
        <Input
          value={jurisdictions}
          onChange={(e) => setJurisdictions(e.target.value)}
          placeholder="Liechtenstein, Germany"
          aria-label={`Jurisdictions for ${partnerId}`}
        />
      </div>
      <p className="mt-1 text-[11px] text-grey">
        Jurisdictions are matched by exact, case-insensitive equality against what you type. Nothing is
        inferred: &quot;EU&quot; does not cover Liechtenstein.
      </p>
      <Button className="mt-2" onClick={() => void submit()} disabled={busy}>
        {busy ? 'Recording…' : 'Record capability'}
      </Button>
      {refusal !== null && <div className="mt-2"><RefusalPanel refusal={refusal} /></div>}
    </details>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE RATE CARD                                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE SELECTED PARTNER, AND WHY IT IS NOT PLAIN `useState`.
 *
 * These panels mount while the bench is EMPTY — that is the whole point of the
 * screen, since before it there was no way to assert a first partner at all. A
 * `useState(members[0]?.partner.id ?? '')` initialiser runs ONCE, on that empty
 * bench, and keeps `''` after the operator asserts their first partner and the list
 * reloads. The `<select>` then shows the new partner's name (a controlled select
 * whose value matches no option falls back to the first one in the DOM) while the
 * page holds `''`, so the rate-card POST goes to `/partners//rate-cards` — a 404 —
 * and the floor is asked for `partnerId=` — a 400. The operator sees a name selected
 * and a failure that names nothing they typed.
 *
 * So the chosen id is DERIVED: whatever was picked, if it is still on the bench, and
 * otherwise the first member. What the select displays and what the request carries
 * are then the same value by construction rather than by remembering to sync them.
 */
function useSelectedPartner(
  members: readonly PartnerRegistryBenchMember[],
): [string, (id: string) => void] {
  const [picked, setPicked] = useState('');
  const selected = members.some((m) => m.partner.id === picked) ? picked : (members[0]?.partner.id ?? '');
  return [selected, setPicked];
}

function RateCardPanel({ desk, onChanged }: { desk: PartnerRegistryDesk; onChanged: () => void }) {
  const members = desk.bench.state === 'loaded' ? desk.bench.members : [];
  const [partnerId, setPartnerId] = useSelectedPartner(members);
  const [offerKey, setOfferKey] = useState<string>(desk.offerKeys[0] ?? '');
  const [unit, setUnit] = useState('day_rate');
  const [amountCents, setAmount] = useState('');
  const [expectedUnits, setUnits] = useState('');
  const [hoursPerDay, setHours] = useState('');
  const [fixedCostCents, setFixedCost] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [validUntil, setValidUntil] = useState('');
  const [refusal, setRefusal] = useState<ShownRefusal | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    setBusy(true);
    try {
      await request<Envelope<unknown>>(`/v1/gps/partner-registry/partners/${encodeURIComponent(partnerId)}/rate-cards`, {
        method: 'POST',
        body: {
          offerKey,
          unit,
          // Sent as typed. The server decides what a rate of zero, a blank expiry or
          // a four-letter currency means — this page has no opinion about a value.
          amountCents: amountCents.trim() === '' ? null : Number(amountCents),
          expectedUnits: expectedUnits.trim() === '' ? null : Number(expectedUnits),
          hoursPerDay: hoursPerDay.trim() === '' ? null : Number(hoursPerDay),
          fixedCostCents: fixedCostCents.trim() === '' ? null : Number(fixedCostCents),
          currency,
          validUntil,
        },
      });
      setRefusal(null);
      onChanged();
    } catch (err) {
      setRefusal(readRefusal(err));
    } finally {
      setBusy(false);
    }
  }, [partnerId, offerKey, unit, amountCents, expectedUnits, hoursPerDay, fixedCostCents, currency, validUntil, onChanged]);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-navy">Enter a rate card</h2>
      </CardHeader>
      <CardBody>
        {members.length === 0 ? (
          <p className="text-sm text-grey" data-testid="rate-card-needs-a-partner">
            No partner has been asserted, so there is nobody for a rate to belong to. Assert one above
            first — a card that creates its own partner is how a typo becomes a second partner and a
            margin gets attributed to nobody.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-grey">
                Partner
                <Select
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  aria-label="Rate card partner"
                  options={members.map((m) => ({ value: m.partner.id, label: m.partner.name }))}
                />
              </label>
              <label className="text-xs text-grey">
                Offer
                <Select
                  value={offerKey}
                  onChange={(e) => setOfferKey(e.target.value)}
                  aria-label="Rate card offer"
                  options={desk.offerKeys.map((k) => ({ value: k, label: k }))}
                />
              </label>
              <label className="text-xs text-grey">
                Unit
                <Select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  aria-label="Rate card unit"
                  options={UNIT_OPTIONS}
                />
              </label>
              <label className="text-xs text-grey">
                Amount (cents per unit)
                <Input value={amountCents} onChange={(e) => setAmount(e.target.value)} aria-label="Rate amount in cents" />
              </label>
              <label className="text-xs text-grey">
                Units per engagement
                <Input value={expectedUnits} onChange={(e) => setUnits(e.target.value)} aria-label="Expected units" />
              </label>
              <label className="text-xs text-grey">
                Hours per day (hourly cards only)
                <Input value={hoursPerDay} onChange={(e) => setHours(e.target.value)} aria-label="Hours per day" />
              </label>
              <label className="text-xs text-grey">
                Pass-through (cents)
                <Input value={fixedCostCents} onChange={(e) => setFixedCost(e.target.value)} aria-label="Pass-through cents" />
              </label>
              <label className="text-xs text-grey">
                Currency
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency" />
              </label>
              <label className="text-xs text-grey">
                Confirmed until
                <Input value={validUntil} onChange={(e) => setValidUntil(e.target.value)} placeholder="2027-01-01" aria-label="Valid until" />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-grey">
              Enter the pass-through even when it is nothing: a stated 0 means &quot;no pass-through&quot;, a blank
              one means nobody said, and on legal-opinion coordination the pass-through is counsel&apos;s whole
              fee. A card with no expiry can never produce a floor.
            </p>
            <Button className="mt-3" onClick={() => void submit()} disabled={busy}>
              {busy ? 'Recording…' : 'Record rate card'}
            </Button>
          </>
        )}
        {refusal !== null && <div className="mt-3"><RefusalPanel refusal={refusal} /></div>}
      </CardBody>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE FLOOR                                                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

function FloorPanel({ desk }: { desk: PartnerRegistryDesk }) {
  const members = desk.bench.state === 'loaded' ? desk.bench.members : [];
  const [partnerId, setPartnerId] = useSelectedPartner(members);
  const [offerKey, setOfferKey] = useState<string>(desk.offerKeys[0] ?? '');
  const [effortPoint, setEffortPoint] = useState<string>(desk.effortPoints[0] ?? 'likely');
  const [currency, setCurrency] = useState('USD');
  const [view, setView] = useState<PartnerRegistryFloorView | null>(null);
  const [refusal, setRefusal] = useState<ShownRefusal | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = useCallback(async () => {
    setBusy(true);
    try {
      const q = new URLSearchParams({ partnerId, offerKey, effortPoint, currency });
      const res = await request<Envelope<PartnerRegistryFloorView>>(`/v1/gps/partner-registry/floor?${q.toString()}`);
      setView(res.data);
      setRefusal(null);
    } catch (err) {
      // The floor answers 200 with refusals; a throw here is a malformed request or a
      // transport failure, and it gets its own panel rather than being folded into
      // "no floor" — which would read as a commercial fact.
      setRefusal(readRefusal(err));
      setView(null);
    } finally {
      setBusy(false);
    }
  }, [partnerId, offerKey, effortPoint, currency]);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-navy">The floor</h2>
      </CardHeader>
      <CardBody>
        <p className="mb-3 text-xs text-grey">
          The lowest price at which this offer, delivered by this partner, does not lose money. There is
          deliberately no optimistic floor: a floor computed from the best case loses money in the
          ordinary case.
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Select
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            aria-label="Floor partner"
            options={members.map((m) => ({ value: m.partner.id, label: m.partner.name }))}
          />
          <Select
            value={offerKey}
            onChange={(e) => setOfferKey(e.target.value)}
            aria-label="Floor offer"
            options={desk.offerKeys.map((k) => ({ value: k, label: k }))}
          />
          <Select
            value={effortPoint}
            onChange={(e) => setEffortPoint(e.target.value)}
            aria-label="Effort point"
            options={desk.effortPoints.map((p) => ({ value: p, label: p }))}
          />
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Floor currency" />
        </div>
        <p className="mt-1 text-[11px] text-grey">{FLOOR_POINT_HELP[effortPoint] ?? ''}</p>
        <Button className="mt-3" onClick={() => void ask()} disabled={busy}>
          {busy ? 'Reading…' : 'Read the floor'}
        </Button>

        {refusal !== null && <div className="mt-3"><RefusalPanel refusal={refusal} /></div>}

        {view !== null && view.floor !== null && (
          <div className="mt-4 rounded border border-line p-3" data-testid="floor-figure">
            <p className="text-lg font-semibold text-navy">
              {view.floor.floorCents} cents {view.floor.currency}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-navy">
              {view.floor.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <dl className="mt-3 grid gap-1 text-xs text-grey sm:grid-cols-2" data-testid="floor-frame">
              <div>Environment: {view.floor.frame.environment}</div>
              <div>As of: {view.floor.frame.asOf}</div>
              <div>Rate: {view.floor.frame.rateAmountCents} cents / {view.floor.frame.rateUnit}, stated by {view.floor.frame.rateStatedBy}</div>
              <div>Card valid until: {view.floor.frame.rateValidUntil}</div>
              <div>
                Effort: {view.floor.frame.effortDays === null
                  ? 'not used — this is a fixed fee'
                  : `${view.floor.frame.effortDays} day(s) at the ${view.floor.frame.effortPoint} point, stated by ${view.floor.frame.effortStatedBy}`}
              </div>
              <div>Pass-through: {view.floor.frame.passThroughCents} cents</div>
              <div className="sm:col-span-2">
                Partner asserted by {view.floor.frame.assertedBy} on {view.floor.frame.assertedAt}
              </div>
            </dl>
            <div className="mt-3 border-t border-line pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-grey">What this floor excludes</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-grey">
                {view.floor.frame.excludes.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          </div>
        )}

        {view !== null && view.floor === null && (
          <div className="mt-4 space-y-2" data-testid="floor-refusals">
            <p className="text-sm text-navy">
              No floor is quoted. Every reason is listed — fixing one is not enough.
            </p>
            {view.refusals.map((r: FloorRefusal) => (
              <div key={r.code} data-testid={`floor-refusal-${r.code}`} className="rounded border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{r.code}</p>
                <p className="mt-1 text-sm text-navy">{r.sentence}</p>
                <p className="mt-1 text-xs text-grey">
                  Missing: {r.missing} · to be supplied by {r.remedyOwner}
                </p>
                <p className="mt-1 border-l-2 border-line pl-2 text-xs italic text-grey">{r.rule.text}</p>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default GpsPartnerRegistry;
