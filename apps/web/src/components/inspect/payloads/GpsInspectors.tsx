import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boxes, Building2, HeartHandshake, PenLine, Target as TargetIcon } from 'lucide-react';
import { AiProse } from '@/components/ai/AiProse';
import type { GpsClient, PartnerRegistryDesk, TargetRecord } from '@lcx/shared';
import { fetchGpsClients, fetchGpsEngagements, type GpsEngagementRow } from '@/lib/api/gps';
import { fetchTargetRecords } from '@/lib/api/gpsOrigination';
import { request } from '@/lib/apiClient';
import { formatDate } from '@/lib/format';
import { CardSkeleton, EmptyState } from '@/components/shared';
import { Button } from '@/components/ui';
import { useInspectorStore } from '@/stores';
import { RelationRail } from '../RelationRail';
import type { InspectorPayloadProps } from './ProjectInspector';

/**
 * L3 payloads for the GPS compartment — S5 of INSTRUMENT_100X_PLAN (the join).
 *
 * Until S5 the inspector knew eleven object types and all of them were sales: an engagement, a
 * target, a partner, a client or a deliverable draft could be NAMED by a related-group chip and
 * then dead-end, because nothing could render it. These five payloads close that. Each is small
 * on purpose — identity, the facts the register already holds, relation pivots, one action — and
 * every one reads through the API clients the GPS desks already use (no new endpoints): a payload
 * is a reading of the record, never a second source of truth about it.
 *
 * ENTITLEMENT IS THE SERVER'S. These render whatever `/v1/gps/*` returns; an operator without the
 * gps compartment never reaches this drawer with a gps chip (the related groups arrive withheld),
 * and if a payload is opened by a direct call anyway, the API refuses and the empty state says so.
 */

const FACT_ROW = 'flex items-baseline justify-between gap-3 text-label';
function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <div className={FACT_ROW}>
      <span className="text-grey">{label}</span>
      <span className="num-tabular min-w-0 truncate text-right font-semibold text-navy">{value}</span>
    </div>
  );
}
const money = (cents: number | null | undefined, currency: string | null | undefined) =>
  cents == null ? null : `${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${currency ?? ''}`.trim();
const notFound = (what: string) => (
  <EmptyState variant="error" title={`${what} not found`} description="It may have been removed, or it sits in a compartment this desk does not hold — the API refused rather than guessing." />
);

/* ─────────────────────────── Engagement ─────────────────────────── */

export function EngagementInspector({ id }: InspectorPayloadProps) {
  const navigate = useNavigate();
  const push = useInspectorStore((s) => s.push);
  const [row, setRow] = useState<GpsEngagementRow | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchGpsEngagements()
      .then((rows) => { if (cancelled) return; const found = rows.find((r) => r.id === id); if (found) setRow(found); else setMissing(true); })
      .catch(() => !cancelled && setMissing(true));
    return () => { cancelled = true; };
  }, [id]);
  if (missing) return notFound('Engagement');
  if (!row) return <CardSkeleton count={2} />;
  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-bold text-navy">{row.offerKey.replace(/_/g, ' ')}</div>
        <p className="mt-1 text-label text-grey">{row.clientName} · {row.status.replace(/_/g, ' ')}</p>
      </div>
      <RelationRail
        items={[
          { label: 'client', count: 1, icon: Building2, onClick: () => push('client', row.clientId) },
          { label: 'project', count: row.projectId ? 1 : 0, icon: Boxes, onClick: () => row.projectId && push('project', row.projectId) },
        ]}
      />
      <div className="space-y-1.5">
        <Fact label="Price" value={money(row.priceCents, row.currency)} />
        <Fact label="Vendor cost" value={money(row.vendorCostCents, row.currency)} />
        <Fact label="Deposit required" value={money(row.depositRequiredCents, row.currency)} />
        <Fact label="Deposit paid" value={row.depositPaidAt ? formatDate(row.depositPaidAt) : 'not yet'} />
        <Fact label="Accepted" value={row.acceptedAt ? formatDate(row.acceptedAt) : 'not yet'} />
        <Fact label="Conflict check" value={row.conflict ? `${row.conflict.decision} · ${row.conflict.decidedBy}` : 'none recorded'} />
        <Fact label="Contracting entity" value={row.contractingEntity} />
        <Fact label="Owner" value={row.owner} />
        <Fact label="Updated" value={formatDate(row.updatedAt)} />
      </div>
      <Button size="sm" variant="secondary" onClick={() => navigate('/gps/delivery')}>Open delivery desk</Button>
    </div>
  );
}

/* ─────────────────────────── Client ─────────────────────────── */

export function ClientInspector({ id }: InspectorPayloadProps) {
  const navigate = useNavigate();
  const [client, setClient] = useState<GpsClient | null>(null);
  const [engagements, setEngagements] = useState<GpsEngagementRow[] | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchGpsClients(), fetchGpsEngagements()])
      .then(([clients, rows]) => {
        if (cancelled) return;
        const found = clients.find((c) => c.id === id);
        if (!found) { setMissing(true); return; }
        setClient(found);
        setEngagements(rows.filter((r) => r.clientId === id));
      })
      .catch(() => !cancelled && setMissing(true));
    return () => { cancelled = true; };
  }, [id]);
  if (missing) return notFound('Client');
  if (!client) return <CardSkeleton count={2} />;
  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-bold text-navy">{client.name}</div>
        <p className="mt-1 text-label text-grey">{[client.legalEntity, client.jurisdiction, client.status].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="space-y-1.5">
        <Fact label="Primary contact" value={client.primaryContact} />
        <Fact label="Engagements" value={engagements ? String(engagements.length) : null} />
        <Fact label="Since" value={formatDate(client.createdAt)} />
      </div>
      <Button size="sm" variant="secondary" onClick={() => navigate('/gps/book')}>Open the book</Button>
    </div>
  );
}

/* ─────────────────────────── Target ─────────────────────────── */

export function TargetInspector({ id }: InspectorPayloadProps) {
  const navigate = useNavigate();
  const push = useInspectorStore((s) => s.push);
  const [rec, setRec] = useState<TargetRecord | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchTargetRecords()
      .then((rows) => { if (cancelled) return; const found = rows.find((r) => r.target.id === id); if (found) setRec(found); else setMissing(true); })
      .catch(() => !cancelled && setMissing(true));
    return () => { cancelled = true; };
  }, [id]);
  if (missing) return notFound('Target');
  if (!rec) return <CardSkeleton count={2} />;
  const t = rec.target;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5 text-base font-bold text-navy"><TargetIcon size={14} className="text-grey" />{t.name}</div>
        <p className="mt-1 text-label text-grey">{[rec.status, t.jurisdiction ?? undefined, t.offerKey?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}</p>
      </div>
      <RelationRail
        items={[
          { label: 'client', count: rec.clientId ? 1 : 0, icon: Building2, onClick: () => rec.clientId && push('client', rec.clientId) },
        ]}
      />
      <div className="space-y-1.5">
        <Fact label="Decision maker" value={t.decisionMaker ? `${t.decisionMaker.name}${t.decisionMaker.role ? ` · ${t.decisionMaker.role}` : ''}` : 'not identified'} />
        <Fact label="Stated budget" value={money(t.statedBudgetCents ?? null, null)} />
        <Fact label="Quoted price" value={money(t.quotedPriceCents ?? null, null)} />
        <Fact label="Deadline" value={t.deadlineIso ? `${formatDate(t.deadlineIso)}${t.deadlineKind ? ` · ${String(t.deadlineKind).replace(/_/g, ' ')}` : ''}` : null} />
        <Fact label="Intro path" value={t.introPath?.replace(/_/g, ' ')} />
        <Fact label="Conflict" value={String(t.conflict).replace(/_/g, ' ')} />
        <Fact label="Perimeter" value={String(t.perimeter).replace(/_/g, ' ')} />
        <Fact label="Guaranteed outcome demanded" value={t.demandsGuaranteedOutcome ? 'yes — refuse' : 'no'} />
        <Fact label="Evidence observed" value={rec.evidenceObservedIso ? formatDate(rec.evidenceObservedIso) : 'never'} />
        <Fact label="Updated" value={formatDate(rec.updatedIso)} />
      </div>
      <Button size="sm" variant="secondary" onClick={() => navigate('/gps/origination')}>Open origination</Button>
    </div>
  );
}

/* ─────────────────────────── Partner ─────────────────────────── */

interface Envelope<T> { data: T }

export function PartnerInspector({ id }: InspectorPayloadProps) {
  const navigate = useNavigate();
  const [desk, setDesk] = useState<PartnerRegistryDesk | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    request<Envelope<PartnerRegistryDesk>>('/v1/gps/partner-registry', { auth: true })
      .then((res) => { if (!cancelled) setDesk(res.data); })
      .catch(() => !cancelled && setMissing(true));
    return () => { cancelled = true; };
  }, [id]);
  if (missing) return notFound('Partner');
  if (!desk) return <CardSkeleton count={2} />;
  const member = desk.bench.members.find((m) => m.partner.id === id);
  if (!member) {
    return (
      <EmptyState
        variant="error"
        title="Partner not on the bench"
        description={desk.bench.state === 'loaded' ? `No registry row carries partner_id ${id}.` : `The bench is ${desk.bench.state}: ${'note' in desk.bench ? desk.bench.note : ''}`}
      />
    );
  }
  const p = member.partner;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5 text-base font-bold text-navy"><HeartHandshake size={14} className="text-grey" />{p.name}</div>
        <p className="mt-1 text-label text-grey">{p.active ? 'active' : 'inactive'} · {desk.assertionIsAClaim}</p>
      </div>
      <div className="space-y-1.5">
        <Fact label="Asserted by" value={`${p.assertion.assertedBy} · ${formatDate(p.assertion.assertedAt)}`} />
        <Fact label="Capabilities" value={p.capabilities.length ? p.capabilities.map((c) => String(c.offerKey).replace(/_/g, ' ')).join(', ') : 'none asserted'} />
        <Fact label="Rate cards" value={String(p.rateCards.length)} />
        <Fact label="Capacity stated" value={member.capacityStated ? 'yes' : 'no — un-quotable until stated'} />
        <Fact label="BD partner link" value={member.bdPartnerId} />
        {p.notes && <Fact label="Notes" value={p.notes} />}
      </div>
      <Button size="sm" variant="secondary" onClick={() => navigate('/gps/partner-registry')}>Open partner registry</Button>
    </div>
  );
}

/* ─────────────────────────── Deliverable draft ─────────────────────────── */

interface FactoryDraft {
  id: number;
  engagementId: string;
  offerKey: string;
  version: number;
  status: 'draft' | 'accepted' | 'rework' | 'superseded';
  draftText: string;
  model: string;
  slotsFilled: number;
  generatedBy: string;
  generatedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}
interface FactoryView { registerPresent: boolean; drafts: FactoryDraft[] }

export function DraftInspector({ id, seed }: InspectorPayloadProps) {
  const navigate = useNavigate();
  const push = useInspectorStore((s) => s.push);
  const engagementId = typeof seed?.engagementId === 'string' ? seed.engagementId : null;
  const [draft, setDraft] = useState<FactoryDraft | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!engagementId) return;
    let cancelled = false;
    request<Envelope<FactoryView>>(`/v1/gps/factory/engagements/${encodeURIComponent(engagementId)}`, { auth: true })
      .then((res) => { if (cancelled) return; const found = res.data.drafts.find((d) => String(d.id) === id); if (found) setDraft(found); else setMissing(true); })
      .catch(() => !cancelled && setMissing(true));
    return () => { cancelled = true; };
  }, [id, engagementId]);
  if (!engagementId) {
    // A draft has no endpoint of its own; without its engagement the record cannot be read. Said, not guessed.
    return <EmptyState title="Draft without its engagement" description="This draft was opened without the engagement it belongs to, and the factory is read per engagement. Open it from the engagement's related groups." />;
  }
  if (missing) return notFound('Draft');
  if (!draft) return <CardSkeleton count={2} />;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5 text-base font-bold text-navy"><PenLine size={14} className="text-grey" />{draft.offerKey.replace(/_/g, ' ')} · v{draft.version}</div>
        <p className="mt-1 text-label text-grey">{draft.status} · {draft.slotsFilled} slots filled · {draft.model}</p>
      </div>
      <RelationRail items={[{ label: 'engagement', count: 1, icon: HeartHandshake, onClick: () => push('engagement', draft.engagementId) }]} />
      <div className="space-y-1.5">
        <Fact label="Generated" value={`${draft.generatedBy} · ${formatDate(draft.generatedAt)}`} />
        <Fact label="Decided" value={draft.decidedAt ? `${draft.decidedBy ?? ''} · ${formatDate(draft.decidedAt)}` : 'not yet'} />
        {draft.decisionNote && <Fact label="Decision note" value={draft.decisionNote} />}
      </div>
      {/* Model output is DATA, never markup (aiProse.test): the draft is prose the operator reads, not HTML it runs. */}
      <div className="max-h-64 overflow-auto rounded border border-line bg-page p-2 text-label text-grey-dark">
        {/* validIds={[]}: a factory draft carries no resolvable citation set, so an [[id]] the model invented
            must not render as a source marker (aiProseValidIds.test). Say none, do not guess a set. */}
        <AiProse text={draft.draftText} validIds={[]} />
      </div>
      <Button size="sm" variant="secondary" onClick={() => navigate('/gps/delivery')}>Open delivery desk</Button>
    </div>
  );
}
