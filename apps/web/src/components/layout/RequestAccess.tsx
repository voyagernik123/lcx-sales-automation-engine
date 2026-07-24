import { useEffect, useState } from 'react';
import { Lock, Send } from 'lucide-react';
import { getWorkspace, type WorkspaceId } from '@lcx/shared';
import { fetchAccessRequests, submitAccessRequest } from '@/lib/api/access';
import { useAccessStore } from '@/stores/useAccessStore';
import { Button } from '@/components/ui';
import { toast } from '@/components/shared/Toast';

/**
 * LCX OS request-access surface (Phase 1) — what a guarded route renders
 * instead of a dead 403. Purpose-based access: the justification is the
 * request; an approver decides; the trail is permanent.
 */
export function RequestAccess({ workspace }: { workspace: WorkspaceId }) {
  const def = getWorkspace(workspace);
  const memberId = useAccessStore((s) => s.me?.memberId);
  const [justification, setJustification] = useState('');
  const [pending, setPending] = useState<'loading' | 'none' | 'pending' | 'denied'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchAccessRequests()
      .then((rows) => {
        if (!alive) return;
        const mine = rows.filter((r) => r.workspace === workspace && (!memberId || r.member_id === memberId));
        if (mine.some((r) => r.status === 'pending')) setPending('pending');
        else if (mine[0]?.status === 'denied') setPending('denied');
        else setPending('none');
      })
      .catch(() => alive && setPending('none'));
    return () => { alive = false; };
  }, [workspace, memberId]);

  const submit = async () => {
    setBusy(true);
    try {
      await submitAccessRequest(workspace, justification.trim());
      setPending('pending');
      toast('success', `Request sent — an approver will decide on ${def.name}`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-card p-6 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-page">
          <Lock size={18} className="text-grey" />
        </div>
        <h2 className="font-mono text-[13px] font-bold uppercase tracking-wider text-navy">{def.name}</h2>
        <p className="mt-1 text-label text-grey-dark">{def.mission}</p>
        <p className="mt-3 text-micro text-grey">
          This workspace is need-to-know. You don’t hold an entitlement yet — state your purpose and an
          approver will decide. Every grant is audited.
        </p>

        {pending === 'pending' ? (
          <p className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-label font-medium text-amber-700 dark:text-amber-400">
            Request pending — an approver has been notified.
          </p>
        ) : (
          <>
            {pending === 'denied' && (
              <p className="mt-3 text-micro text-red-600 dark:text-red-400">A previous request was denied — you may submit a new one.</p>
            )}
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              placeholder="Why do you need this workspace? (≥10 characters — this lands in the audit trail)"
              className="mt-4 w-full rounded border border-line bg-page px-2.5 py-2 text-label text-navy outline-none focus:border-cyan-500"
            />
            <Button
              className="mt-3"
              disabled={busy || justification.trim().length < 10 || pending === 'loading'}
              onClick={() => void submit()}
            >
              <Send size={13} /> {busy ? 'Sending…' : 'Request access'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
