import { useCallback, useEffect, useState } from 'react';
import { ListChecks, ShieldAlert } from 'lucide-react';
import { listingReadiness } from '@lcx/shared';
import { fetchCommandDeep, invokeCommandAction, type CommandDeep } from '@/lib/api/command';
import { toast } from '@/components/shared/Toast';
import { CacheAge } from '@/components/ui/CacheAge';
import { clsx } from 'clsx';

/**
 * Listing readiness (100X Phase 4) — the 12 blockers and 14 requirements as a
 * governed working surface. Every status flip is an audited registry action,
 * and the readiness score (the same engine behind the deck dial) recomputes
 * live. Path-aware (A = non-securities now; B = BD/ATS).
 */
const REQ_STATUSES = ['Not started', 'In progress', 'Done'] as const;
const BLK_STATUSES = ['open', 'mitigating', 'resolved'] as const;

export function ListingReadinessPanel() {
  const [deep, setDeep] = useState<CommandDeep | null>(null);
  const [path, setPath] = useState<'A' | 'B'>('A');
  const [busy, setBusy] = useState<string | null>(null);

  // `fresh` after a governed write: the read cache would otherwise serve the body from BEFORE
  // the write, and the panel would show the flip as not having happened (see fetchCommandDeep).
  const load = useCallback((fresh = false) => { fetchCommandDeep(fresh ? { cache: false } : undefined).then(setDeep).catch(() => setDeep(null)); }, []);
  useEffect(() => { load(); }, [load]);

  if (!deep) return null;
  const blockers = deep.blockers as Array<{ num: number; blocker: string; category: string | null; severity: string | null; status?: string; owner: string | null }>;
  const requirements = deep.requirements as Array<{ num: number; requirement: string; path: string | null; status: string | null; owner: string | null }>;
  const live = deep.live.requirements;

  const score = listingReadiness(
    blockers.map((b) => ({ num: b.num, severity: b.severity, category: b.category, status: b.status ?? 'open' })),
    requirements.map((r) => ({ num: r.num, path: r.path, status: r.status })),
    path,
  );

  const setReq = async (num: number, status: string) => {
    setBusy(`r${num}`);
    try { await invokeCommandAction('command_set_requirement_status', 'command_requirement', String(num), { status }); load(true); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Update failed'); }
    finally { setBusy(null); }
  };
  const setBlk = async (num: number, status: string) => {
    setBusy(`b${num}`);
    try { await invokeCommandAction('command_set_blocker_status', 'command_blocker', String(num), { status }); load(true); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Update failed'); }
    finally { setBusy(null); }
  };

  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-micro font-bold uppercase tracking-wider text-grey">
        <ListChecks size={13} /> Listing readiness — governed
        <span className={clsx('rounded px-1.5 py-0.5 font-mono text-label font-bold',
          score.score >= 70 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : score.score >= 40 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-red-500/10 text-red-600 dark:text-red-400')}>
          {score.score}/100
        </span>
        <span className="font-normal normal-case text-grey">blockers {score.blockerScore} · requirements {score.requirementScore}</span>
        {/* The score above is recomputed locally from /v1/command/deep, so it is
            only as current as that body: a colleague resolving a blocker moves the
            real number and this panel would show the old one with no hint. Every
            status flip here is an audited registry action, which makes acting on a
            stale verdict expensive. */}
        <CacheAge path="/v1/command/deep" className="font-normal normal-case" />

        <div className="ml-auto flex gap-1">
          {(['A', 'B'] as const).map((p) => (
            <button key={p} onClick={() => setPath(p)}
              className={clsx('rounded border px-1.5 py-0.5 text-micro font-bold', path === p ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : 'border-line text-grey')}>
              Path {p}
            </button>
          ))}
        </div>
        {!live && <span className="rounded bg-amber-500/10 px-1 text-[10px] font-semibold normal-case text-amber-600 dark:text-amber-400">read-only until 0041 seeded</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center gap-1 text-micro font-bold uppercase tracking-wider text-grey"><ShieldAlert size={11} /> Blockers (12)</div>
          <div className="space-y-1">
            {blockers.map((b) => (
              <div key={b.num} className="flex items-center gap-1.5 text-micro">
                <span className={clsx('w-14 shrink-0 rounded border px-1 text-center font-bold',
                  b.severity === 'Critical' ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400' : b.severity === 'High' ? 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400' : 'border-line text-grey-dark')}>
                  {b.severity}
                </span>
                <span className="min-w-0 flex-1 truncate text-grey-dark" title={b.blocker}>{b.blocker}</span>
                <select value={b.status ?? 'open'} disabled={!live || busy === `b${b.num}`}
                  onChange={(e) => void setBlk(b.num, e.target.value)}
                  className={clsx('shrink-0 rounded border border-line bg-card px-1 py-0.5 font-mono outline-none focus:border-cyan-500 disabled:opacity-50',
                    (b.status ?? 'open') === 'resolved' ? 'text-emerald-600 dark:text-emerald-400' : (b.status ?? 'open') === 'mitigating' ? 'text-amber-600 dark:text-amber-400' : 'text-grey-dark')}>
                  {BLK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">Requirements ({requirements.filter((r) => !r.path || r.path === 'Both' || r.path === path).length} on Path {path})</div>
          <div className="space-y-1">
            {requirements.filter((r) => !r.path || r.path === 'Both' || r.path === path).map((r) => (
              <div key={r.num} className="flex items-center gap-1.5 text-micro">
                <span className="w-8 shrink-0 text-center font-mono text-grey">{r.num}</span>
                <span className="min-w-0 flex-1 truncate text-grey-dark" title={r.requirement}>{r.requirement}</span>
                <select value={REQ_STATUSES.includes((r.status ?? '') as typeof REQ_STATUSES[number]) ? (r.status as string) : 'Not started'}
                  disabled={!live || busy === `r${r.num}`}
                  onChange={(e) => void setReq(r.num, e.target.value)}
                  className={clsx('shrink-0 rounded border border-line bg-card px-1 py-0.5 font-mono outline-none focus:border-cyan-500 disabled:opacity-50',
                    r.status === 'Done' ? 'text-emerald-600 dark:text-emerald-400' : r.status === 'In progress' ? 'text-cyan-700 dark:text-cyan-400' : 'text-grey-dark')}>
                  {REQ_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-grey">Every flip is an audited registry action; the score is the same engine behind the deck's readiness dial. Original authored statuses (e.g. "Select vendor") map to "Not started" until first touched.</p>
    </section>
  );
}
