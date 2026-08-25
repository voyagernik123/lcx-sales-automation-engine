import { useRef, useState } from 'react';
import { Button, Card, CardBody, CardHeader } from '@/components/ui';
import { ApiError, request } from '@/lib/apiClient';
import { ProposalSheet, type ProposalSheetInput } from './GpsPrintSheets';

/**
 * The proposal sheet's loader — fetches ON OPEN, never on page load.
 *
 * The delivery response deliberately does not carry price or scope (its ref type is
 * about identity, not commercial terms), so this component asks
 * `GET /v1/gps/engagements/:id` — the route that already serves both, PLUS the
 * conflict check the sheet refuses to print without mentioning. Fetch-on-open
 * because the sheet is an occasional artefact, not a panel: loading commercial
 * terms on every delivery-desk visit would put the price on screen for work
 * sessions that are about milestones.
 *
 * THE SNAPSHOT IS WHITELISTED HERE, at the fetch boundary — same discipline as
 * `portal/service.ts`: `scopeSnapshot` is unknown-typed jsonb on the wire, and only
 * the three fields the sheet declares survive the mapping. Whatever else the
 * snapshot holds or grows never reaches a printable page by accident.
 */

interface EngagementWire {
  engagement: {
    id: string; offerKey: string; status: string; priceCents: number; currency: string;
    depositRequiredCents: number; depositPaidAt: string | null;
    contractingEntity: string; createdAt: string;
    scopeSnapshot: unknown;
  };
  conflictCheck: { decision?: string; decidedBy?: string } | null;
}

const strList = (v: unknown): readonly string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];

export function ProposalSheetLoader({ engagementId, clientName }: {
  engagementId: string;
  clientName: string | null;
}) {
  const [proposal, setProposal] = useState<ProposalSheetInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const readAt = useRef<string>();
  readAt.current ??= new Date().toISOString();

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await request<{ data: EngagementWire | null }>(`/v1/gps/engagements/${engagementId}`);
      if (res.data === null) {
        setError('The engagement register is not migrated on this environment — there is no proposal to print.');
        return;
      }
      const e = res.data.engagement;
      const snap = (e.scopeSnapshot ?? {}) as Record<string, unknown>;
      setProposal({
        engagementId: e.id,
        offerKey: e.offerKey,
        status: e.status,
        priceCents: e.priceCents,
        currency: e.currency,
        depositRequiredCents: e.depositRequiredCents,
        depositPaidAt: e.depositPaidAt,
        contractingEntity: e.contractingEntity,
        createdAt: e.createdAt,
        offerName: typeof snap.offerName === 'string' ? snap.offerName : null,
        exclusions: strList(snap.exclusions),
        requiredClientInputs: strList(snap.requiredClientInputs),
        conflictDecision: res.data.conflictCheck?.decision ?? null,
        conflictDecidedBy: res.data.conflictCheck?.decidedBy ?? null,
      });
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code ?? 'ERROR'}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <span>The proposal, as sold — printable</span>
        {proposal === null ? (
          <Button variant="secondary" onClick={() => void open()} disabled={busy} data-testid="proposal-print-open">
            {busy ? 'Opening…' : 'Open proposal sheet'}
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setProposal(null)}>Close</Button>
        )}
      </CardHeader>
      <CardBody className="space-y-2 text-xs">
        {error !== null && (
          <p role="alert" className="font-mono text-status-blocked" data-testid="proposal-print-error">{error}</p>
        )}
        {proposal !== null && (
          <ProposalSheet proposal={proposal} clientName={clientName} asOf={readAt.current!} sources={[proposal]} />
        )}
        {proposal === null && error === null && (
          <p className="text-grey">
            Prints the sealed scope, the quoted price (or the fact that none was quoted), the deposit
            state, and whether the conflict wall was consulted — every value cited to its wire field.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
