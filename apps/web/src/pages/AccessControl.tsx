import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Check, X, ShieldCheck } from 'lucide-react';
import { WORKSPACES, capAtLeast, type Capability, type WorkspaceId } from '@lcx/shared';
import {
  fetchAccessMatrix, fetchAccessRequests, decideAccessRequest,
  grantEntitlement, revokeEntitlement,
  type AccessMatrixMember, type AccessRequestRow,
} from '@/lib/api/access';
import { useAccessStore } from '@/stores/useAccessStore';
import { useOperatorStore } from '@/stores';
import { PageTitle, Button } from '@/components/ui';
import { CardSkeleton } from '@/components/shared';
import { toast } from '@/components/shared/Toast';

/**
 * Access Control (LCX OS, Phase 1) — the Directorate's need-to-know desk.
 * Everyone sees their own access; approvers additionally hold the request
 * inbox and the member × workspace matrix. Every change flows through the
 * governed actions (grant/revoke/decide) — audited, attributed, justified.
 * The full console (profiles, dossiers, purpose logs) arrives in Phase 2.
 */
export function AccessControl() {
  const operator = useOperatorStore((s) => s.operator);
  const me = useAccessStore((s) => s.me);
  const reloadAccess = useAccessStore((s) => s.load);
  const isApprover = operator?.role === 'approver';

  const [requests, setRequests] = useState<AccessRequestRow[] | null>(null);
  const [matrix, setMatrix] = useState<{ members: AccessMatrixMember[]; dbLive: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchAccessRequests().then(setRequests).catch(() => setRequests([]));
    if (isApprover) fetchAccessMatrix().then(setMatrix).catch(() => setMatrix(null));
  }, [isApprover]);

  useEffect(() => { refresh(); }, [refresh]);

  const decide = async (req: AccessRequestRow, decision: 'approved' | 'denied') => {
    setBusyId(req.id);
    try {
      await decideAccessRequest(req.id, decision);
      toast('success', `${decision === 'approved' ? 'Approved' : 'Denied'} — ${req.member_id} → ${req.workspace}`);
      refresh();
      void reloadAccess();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Decision failed');
    } finally {
      setBusyId(null);
    }
  };

  const setCell = async (member: AccessMatrixMember, ws: WorkspaceId, capability: Capability | 'none') => {
    const justification = window.prompt(
      capability === 'none'
        ? `Revoke ${member.name}'s access to ${ws} — why? (audited)`
        : `Grant ${member.name} '${capability}' on ${ws} — why? (audited)`,
    );
    if (!justification || justification.trim().length === 0) return;
    setBusyId(`${member.id}:${ws}`);
    try {
      if (capability === 'none') await revokeEntitlement(member.id, ws, justification.trim());
      else await grantEntitlement(member.id, ws, capability, justification.trim());
      toast('success', 'Entitlement updated');
      refresh();
      void reloadAccess();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const pending = (requests ?? []).filter((r) => r.status === 'pending');
  const decided = (requests ?? []).filter((r) => r.status !== 'pending').slice(0, 10);

  return (
    <div className="space-y-5 p-5">
      <PageTitle
        icon={<KeyRound size={20} />}
        subtitle="Need-to-know, made visible — entitlements, requests, and the audited grant trail (LCX OS)"
      >
        Access Control
      </PageTitle>

      {/* My access — everyone */}
      <section className="rounded-lg border border-line bg-card p-4 shadow-card">
        <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-grey">My access</h2>
        <div className="flex flex-wrap gap-2">
          {WORKSPACES.map((w) => {
            const cap = me?.entitlements[w.id];
            return (
              <span
                key={w.id}
                className={
                  cap
                    ? 'rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 font-mono text-micro font-semibold text-cyan-700 dark:text-cyan-300'
                    : 'rounded border border-line bg-page px-2 py-1 font-mono text-micro text-grey'
                }
              >
                {w.name} · {cap ?? 'no access'}
              </span>
            );
          })}
        </div>
      </section>

      {/* Request inbox — approvers */}
      {isApprover && (
        <section className="rounded-lg border border-line bg-card p-4 shadow-card">
          <h2 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-grey">
            <ShieldCheck size={12} /> Pending requests {pending.length > 0 && <span className="rounded bg-amber-500/15 px-1.5 font-bold text-amber-600 dark:text-amber-400">{pending.length}</span>}
          </h2>
          {requests === null ? (
            <CardSkeleton />
          ) : pending.length === 0 ? (
            <p className="text-label text-grey">No pending requests — the compartments are quiet.</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((r) => (
                <li key={r.id} className="flex items-start gap-3 rounded border border-line bg-page p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-label font-semibold text-navy">
                      {r.member_id} → {r.workspace} <span className="font-mono text-micro text-grey">({r.capability})</span>
                    </p>
                    <p className="mt-0.5 text-micro text-grey-dark">“{r.justification}”</p>
                    <p className="mt-0.5 font-mono text-[10px] text-grey">{new Date(r.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="xs" disabled={busyId === r.id} onClick={() => void decide(r, 'approved')}>
                      <Check size={12} /> Approve
                    </Button>
                    <Button size="xs" variant="secondary" disabled={busyId === r.id} onClick={() => void decide(r, 'denied')}>
                      <X size={12} /> Deny
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {decided.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-micro text-grey hover:text-navy">Recently decided ({decided.length})</summary>
              <ul className="mt-1.5 space-y-1">
                {decided.map((r) => (
                  <li key={r.id} className="text-micro text-grey-dark">
                    <span className={r.status === 'approved' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{r.status}</span>
                    {' — '}{r.member_id} → {r.workspace} · by {r.decided_by}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {/* Entitlement matrix — approvers */}
      {isApprover && (
        <section className="rounded-lg border border-line bg-card p-4 shadow-card">
          <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-grey">Entitlement matrix</h2>
          {matrix === null ? (
            <CardSkeleton />
          ) : (
            <>
              {!matrix.dbLive && (
                <p className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-micro text-amber-700 dark:text-amber-400">
                  Read-only until migration 0042 is applied — showing the compiled no-lockout defaults.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-label">
                  <thead>
                    <tr className="border-b border-line font-mono text-[10px] uppercase tracking-wider text-grey">
                      <th className="py-1.5 pr-2">Member</th>
                      {WORKSPACES.map((w) => <th key={w.id} className="px-2 py-1.5">{w.id}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.members.map((m) => (
                      <tr key={m.id} className="border-b border-line/60">
                        <td className="py-1.5 pr-2">
                          <span className="font-semibold text-navy">{m.name}</span>{' '}
                          <span className="font-mono text-[10px] text-grey">{m.role}</span>
                        </td>
                        {WORKSPACES.map((w) => {
                          const ent = m.entitlements.find((e) => e.workspace === w.id);
                          const cellBusy = busyId === `${m.id}:${w.id}`;
                          return (
                            <td key={w.id} className="px-2 py-1.5">
                              <select
                                value={ent?.capability ?? 'none'}
                                disabled={cellBusy || !matrix.dbLive}
                                onChange={(e) => void setCell(m, w.id, e.target.value as Capability | 'none')}
                                title={ent ? `granted by ${ent.granted_by}${ent.justification ? ` — ${ent.justification}` : ''}` : 'no entitlement'}
                                className={`rounded border px-1 py-0.5 font-mono text-micro ${
                                  ent && capAtLeast(ent.capability, 'approve')
                                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                                    : ent ? 'border-line bg-card text-navy' : 'border-line bg-page text-grey'
                                }`}
                              >
                                <option value="none">—</option>
                                <option value="view">view</option>
                                <option value="operate">operate</option>
                                <option value="approve">approve</option>
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10px] text-grey">
                Every change is a governed action — justification required, audited, attributed. You cannot revoke your own governance access.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
