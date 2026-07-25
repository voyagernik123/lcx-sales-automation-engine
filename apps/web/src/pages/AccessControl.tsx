import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, Check, X, ShieldCheck } from 'lucide-react';
import { useDismissible } from '@/hooks/useDismissible';
import { WORKSPACES, capAtLeast, type Capability, type WorkspaceId } from '@lcx/shared';
import {
  fetchAccessMatrix, fetchAccessRequests, decideAccessRequest,
  grantEntitlement, revokeEntitlement, setMemberProfile,
  fetchMemberDossier, fetchAccessActivity,
  type AccessMatrixMember, type AccessRequestRow, type MemberDossier, type AccessActivityRow,
} from '@/lib/api/access';
import { useAccessStore } from '@/stores/useAccessStore';
import { useOperatorStore } from '@/stores';
import { PageTitle, Button } from '@/components/ui';
import { CardSkeleton, ErrorNotice } from '@/components/shared';
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
  const [activity, setActivity] = useState<AccessActivityRow[] | null>(null);
  const [dossier, setDossier] = useState<MemberDossier | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Two separate failures, because they read as two different facts on screen:
  // an empty request list renders "the compartments are quiet" (a lie if the
  // request never landed), and `matrix === null` is the matrix's LOADING
  // sentinel — catching into it left the skeleton pulsing forever.
  const [requestsErr, setRequestsErr] = useState<unknown>(null);
  const [matrixErr, setMatrixErr] = useState<unknown>(null);

  /**
   * The dossier drawer joins the one Escape owner (lib/dismiss).
   *
   * It shipped with a backdrop, a `role="dialog"` and a close button, and Escape did
   * NOTHING on it — the only ways out were the mouse and a route change. That is not a
   * missing nicety on this particular panel: the stack is what the `?` manual READS to
   * tell the operator what Escape will close, so an unregistered overlay makes the
   * manual wrong as well as the key dead.
   *
   * The ref is what makes it modal — it confines Tab to the drawer. Without it Tab
   * walks out into the entitlement matrix behind a purpose-gated read, which is the
   * one surface on this page where wandering focus is a governance problem rather than
   * an annoyance.
   */
  const dossierRef = useRef<HTMLDivElement>(null);
  useDismissible(dossier !== null, () => setDossier(null), 'member dossier', dossierRef);

  const refresh = useCallback(() => {
    setRequestsErr(null);
    fetchAccessRequests().then(setRequests).catch(setRequestsErr);
    if (isApprover) {
      setMatrixErr(null);
      fetchAccessMatrix().then(setMatrix).catch(setMatrixErr);
      // Activity is telemetry garnish: the section hides itself when absent.
      fetchAccessActivity().then(setActivity).catch(() => setActivity([]));
    }
  }, [isApprover]);

  const openDossier = async (memberId: string) => {
    const purpose = window.prompt('State your purpose for viewing this member’s access dossier (audited, ≥8 chars):');
    if (!purpose || purpose.trim().length < 8) return;
    try {
      setDossier(await fetchMemberDossier(memberId, purpose.trim()));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Dossier unavailable');
    }
  };

  const editProfile = async (member: AccessMatrixMember) => {
    const unit = window.prompt(`Unit for ${member.name} (Exec / BD / AI Labs / Legal / Ops):`, member.profile?.unit ?? '');
    if (unit === null) return;
    const title = window.prompt(`Title for ${member.name}:`, member.profile?.title ?? '');
    if (title === null) return;
    setBusyId(`profile:${member.id}`);
    try {
      await setMemberProfile(member.id, unit.trim(), title.trim());
      toast('success', 'Profile updated');
      refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

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
    // Step-up re-auth for the destructive path (revoke): re-enter the passcode.
    let stepUp = '';
    if (capability === 'none') {
      const p = window.prompt('Step-up: re-enter the desk passcode to revoke this access:');
      if (!p) return;
      stepUp = p;
    }
    setBusyId(`${member.id}:${ws}`);
    try {
      if (capability === 'none') await revokeEntitlement(member.id, ws, justification.trim(), stepUp);
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
          {requestsErr ? (
            <ErrorNotice error={requestsErr} onRetry={refresh} compact />
          ) : requests === null ? (
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
          {matrixErr ? (
            <ErrorNotice error={matrixErr} onRetry={refresh} />
          ) : matrix === null ? (
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
                          <button onClick={() => void openDossier(m.id)} className="font-semibold text-navy underline-offset-2 hover:text-cyan-700 hover:underline dark:hover:text-cyan-400" title="View access dossier (purpose-gated)">{m.name}</button>{' '}
                          <span className="font-mono text-[10px] text-grey">{m.role}</span>
                          {m.profile?.unit && <span className="ml-1 font-mono text-[10px] text-grey">· {m.profile.unit}</span>}
                          <button onClick={() => void editProfile(m)} disabled={busyId === `profile:${m.id}`} className="ml-1.5 text-[10px] text-grey hover:text-navy" title="Edit unit/title">edit</button>
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
                Every change is a governed action — justification required, audited, attributed. Revocation demands a passcode step-up; you cannot revoke your own governance access.
              </p>
            </>
          )}
        </section>
      )}

      {/* Access activity telemetry — approvers */}
      {isApprover && activity && activity.length > 0 && (
        <section className="rounded-lg border border-line bg-card p-4 shadow-card">
          <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-grey">Access activity</h2>
          <ul className="space-y-1">
            {activity.slice(0, 15).map((a, i) => (
              <li key={i} className="flex items-baseline gap-2 text-micro">
                <span className="font-mono text-[10px] text-grey">{new Date(a.created_at).toLocaleString()}</span>
                <span className="font-semibold text-navy">{a.actor}</span>
                <span className="text-grey-dark">{a.action.replace('action:', '').replace('purpose:access', 'viewed')}</span>
                {a.entity && <span className="font-mono text-[10px] text-grey">{a.entity}{a.entity_id && a.entity_id !== a.entity ? `/${a.entity_id}` : ''}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Member dossier drawer — purpose-gated read */}
      {dossier && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setDossier(null)}>
          <div
            ref={dossierRef}
            // Focus has somewhere to land when the trap has nothing tabbable to offer,
            // and when the stack hands focus back on close.
            tabIndex={-1}
            role="dialog"
            aria-label={`Member dossier: ${dossier.member.name}`}
            className="h-full w-full max-w-lg overflow-y-auto border-l border-line bg-card p-4 shadow-card outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-h3 font-bold text-navy">{dossier.member.name}</h2>
              <span className="rounded border border-line px-1.5 py-0.5 font-mono text-micro text-grey">{dossier.member.role}</span>
              <button onClick={() => setDossier(null)} className="text-grey hover:text-navy" aria-label="Close"><X size={16} /></button>
            </div>
            <p className="mb-3 text-micro text-grey">{dossier.member.email}{dossier.profile?.unit ? ` · ${dossier.profile.unit}` : ''}{dossier.profile?.title ? ` · ${dossier.profile.title}` : ''}</p>

            <div className="mb-4">
              <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">Holds access to</div>
              <div className="flex flex-wrap gap-1.5">
                {dossier.entitlements.length === 0 ? <span className="text-micro text-grey">No entitlements.</span> : dossier.entitlements.map((e) => (
                  <span key={e.workspace} className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-micro text-cyan-700 dark:text-cyan-300" title={e.justification ?? undefined}>
                    {e.workspace} · {e.capability}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">Recent footprint</div>
              {dossier.activity.length === 0 ? (
                <p className="text-micro text-grey">No recorded actions.</p>
              ) : (
                <ul className="space-y-1">
                  {dossier.activity.map((a, i) => (
                    <li key={i} className="flex items-baseline gap-2 text-micro">
                      <span className="font-mono text-[10px] text-grey">{new Date(a.created_at).toLocaleDateString()}</span>
                      <span className="text-navy">{a.action}</span>
                      <span className="font-mono text-[10px] text-grey">{a.subject_type}/{a.subject_id}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
