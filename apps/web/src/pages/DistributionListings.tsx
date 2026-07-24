import { useCallback, useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTitle } from '@/components/ui';
import { CardSkeleton } from '@/components/shared';
import { toast } from '@/components/shared/Toast';
import {
  fetchDistributionDeep, setListingStatus, draftListingPacket,
  type DistributionDeep, type DistSurface,
} from '@/lib/api/distribution';

const STATUSES = ['not_started', 'submitted', 'live', 'ranked'] as const;
const STATUS_TONE: Record<string, string> = {
  not_started: 'text-grey',
  submitted: 'text-amber-600 dark:text-amber-400',
  live: 'text-cyan-600 dark:text-cyan-400',
  ranked: 'text-emerald-600 dark:text-emerald-400',
};

/**
 * Listing Ops (LCX ONE Phase 5) — the surface pipeline as a governed board.
 * Every status change flows through dist_listing_set_status (audited); the
 * submission mechanic for each surface is one click away.
 */
export function DistributionListings() {
  const [deep, setDeep] = useState<DistributionDeep | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openMechanic, setOpenMechanic] = useState<string | null>(null);
  const [packet, setPacket] = useState<{ id: string; text: string; usedLlm: boolean } | null>(null);
  const [packing, setPacking] = useState<string | null>(null);

  const genPacket = async (id: string) => {
    setPacking(id);
    try { const r = await draftListingPacket(id); setPacket({ id, text: r.packet, usedLlm: r.usedLlm }); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Draft failed'); }
    finally { setPacking(null); }
  };

  const refresh = useCallback(() => { fetchDistributionDeep().then(setDeep).catch(() => setDeep(null)); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const change = async (surfaceId: string, status: string) => {
    setBusy(surfaceId);
    try {
      await setListingStatus(surfaceId, { status });
      toast('success', `${surfaceId} → ${status}`);
      refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(null);
    }
  };

  const surfaces: DistSurface[] = deep?.reference.surfaces ?? [];
  const statusOf = (id: string) => deep?.listings.find((l) => l.surface_id === id)?.status ?? 'not_started';

  return (
    <div className="p-5">
      <PageTitle icon={<ListChecks size={20} />} subtitle="Get PayAgent listed across every discovery surface — governed, audited">
        Listing Ops
      </PageTitle>

      {!deep ? (
        <div className="mt-4"><CardSkeleton /></div>
      ) : !deep.live.listings ? (
        <p className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-label text-amber-700 dark:text-amber-400">
          Read-only until migration 0043 is applied on this environment.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-label">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-wider text-grey">
                <th className="py-1.5 pr-2">Surface</th>
                <th className="px-2 py-1.5">Category</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">Mechanic</th>
              </tr>
            </thead>
            <tbody>
              {surfaces.map((s) => {
                const st = statusOf(s.id);
                return (
                  <>
                    <tr key={s.id} className="border-b border-line/60">
                      <td className="py-1.5 pr-2 font-semibold text-navy">{s.name}</td>
                      <td className="px-2 py-1.5 font-mono text-micro text-grey">{s.category}</td>
                      <td className="px-2 py-1.5">
                        <select
                          value={st}
                          disabled={busy === s.id}
                          onChange={(e) => void change(s.id, e.target.value)}
                          className={clsx('rounded border border-line bg-card px-1 py-0.5 font-mono text-micro font-semibold', STATUS_TONE[st])}
                        >
                          {STATUSES.map((v) => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => setOpenMechanic(openMechanic === s.id ? null : s.id)} className="text-micro text-cyan-600 hover:underline dark:text-cyan-400">
                          {openMechanic === s.id ? 'hide' : 'how to list'}
                        </button>
                        <button onClick={() => void genPacket(s.id)} disabled={packing === s.id} className="ml-2 text-micro text-cyan-600 hover:underline disabled:opacity-50 dark:text-cyan-400">
                          {packing === s.id ? '…' : '🤖 packet'}
                        </button>
                      </td>
                    </tr>
                    {openMechanic === s.id && (
                      <tr className="bg-ice-soft/40 dark:bg-ice-soft/5">
                        <td colSpan={4} className="px-2 py-2 text-micro text-grey-dark">
                          <span className="font-semibold text-navy">Get listed:</span> {s.submit}
                          {s.constraint && <span className="ml-2 text-amber-600 dark:text-amber-400">⚠ {s.constraint}</span>}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-grey">Every status change is a governed action — audited and attributed.</p>
          {packet && (
            <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
              <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">Submission packet — {surfaces.find((s) => s.id === packet.id)?.name}</div>
              <pre className="whitespace-pre-wrap font-sans text-label text-navy">{packet.text}</pre>
              <p className="mt-1 text-[10px] text-grey">{packet.usedLlm ? 'AI-drafted — review, then submit. AI never submits.' : 'Deterministic packet — set an AI key for a tailored draft.'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
