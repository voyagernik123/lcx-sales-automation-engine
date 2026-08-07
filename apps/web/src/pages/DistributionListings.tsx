import { AiProse } from '@/components/ai/AiProse';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTitle } from '@/components/ui';
import { CardSkeleton, ErrorNotice } from '@/components/shared';
import { toast } from '@/components/shared/Toast';
import {
  fetchDistributionDeep, setListingStatus, draftListingPacket,
  type DistributionDeep, type DistSurface,
} from '@/lib/api/distribution';

const STATUSES = ['not_started', 'submitted', 'live', 'ranked'] as const;
const STATUS_TONE: Record<string, string> = {
  not_started: 'text-grey',
  submitted: 'text-amber-600 dark:text-amber-400',
  live: 'text-cyan-700 dark:text-cyan-400',
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
  // `deep === null` is the LOADING sentinel — a failure must not reset to it, or
  // the skeleton pulses forever with no way back but a page reload.
  const [err, setErr] = useState<unknown>(null);

  const genPacket = async (id: string) => {
    setPacking(id);
    try { const r = await draftListingPacket(id); setPacket({ id, text: r.packet, usedLlm: r.usedLlm }); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Draft failed'); }
    finally { setPacking(null); }
  };

  const refresh = useCallback(() => {
    setErr(null);
    fetchDistributionDeep().then(setDeep).catch(setErr);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  /* ── A BARE ARROW MUST NOT WRITE TO A GOVERNED RECORD ─────────────────────
   *
   * Found by CI, and only by CI. `e2e/keyboardday.spec.ts:903` asserts that three
   * ArrowDowns on this select produce zero governed writes, and it had been passing
   * on macOS for a reason that is a platform accident: Chrome and WKWebView on macOS
   * OPEN the popup on an arrow and fire `change` only when you commit with ↵ or a
   * click. On Linux — CI's Chromium, and any Windows or Linux browser hitting the
   * web fallback — the arrow advances the selection immediately, so `change` fires
   * per keypress. Measured in run 30162940695:
   *
   *   Error: three ArrowDowns produced a governed write
   *   Received array: [{"actionId":"dist_listing_set_status",
   *                     "params":{"status":"submitted"}, "subjectId":"srf_probe_one"}]
   *
   * So Tab-ing through this table and arrowing past a select advanced a real listing's
   * status, audited and attributed, with no confirmation — the same defect class the
   * queue's `j`/`k` deliberately avoids by not being bound to movement at all.
   *
   * The spec's own comment said that if this ever went red, the BEHAVIOUR should be
   * corrected rather than the assertion softened. This is that correction: arrow
   * traversal only STAGES a value, and a write needs an explicit commit — ↵, or a
   * pointer selection, which is exactly macOS's own model. Escape and blur discard,
   * also matching macOS, where clicking away from an open popup reverts.
   *
   * Escape here calls preventDefault + stopPropagation, unlike the app's five other
   * inline editors — see the ledger note in `lib/dismiss.ts`. Their safety depends on
   * the dismiss stack being empty; this one does not rely on that. */
  const [staged, setStaged] = useState<Record<string, string>>({});
  const traversing = useRef(false);
  const ARROW_TRAVERSAL = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp']);

  const change = async (surfaceId: string, status: string) => {
    setStaged((s) => { const { [surfaceId]: _drop, ...rest } = s; return rest; });
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

      {err ? (
        <ErrorNotice error={err} onRetry={refresh} />
      ) : !deep ? (
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
                          value={staged[s.id] ?? st}
                          disabled={busy === s.id}
                          aria-describedby={staged[s.id] ? `staged-${s.id}` : undefined}
                          onKeyDown={(e) => {
                            if (ARROW_TRAVERSAL.has(e.key)) { traversing.current = true; return; }
                            if (e.key === 'Enter') {
                              const next = staged[s.id];
                              // Nothing staged, or staged back to where it started: not a
                              // change, so not a write. "Nothing changed" beats a tick.
                              if (next && next !== st) void change(s.id, next);
                              return;
                            }
                            if (e.key === 'Escape' && staged[s.id]) {
                              e.preventDefault();
                              e.stopPropagation();
                              setStaged((m) => { const { [s.id]: _drop, ...rest } = m; return rest; });
                            }
                          }}
                          onChange={(e) => {
                            if (traversing.current) {
                              traversing.current = false;
                              setStaged((m) => ({ ...m, [s.id]: e.target.value }));
                              return;
                            }
                            void change(s.id, e.target.value);
                          }}
                          // Leaving discards, like clicking away from an open macOS popup.
                          onBlur={() => setStaged((m) => { const { [s.id]: _drop, ...rest } = m; return rest; })}
                          className={clsx(
                            'rounded border px-1 py-0.5 font-mono text-micro font-semibold',
                            staged[s.id] ? 'border-amber-500 bg-amber-500/10' : 'border-line bg-card',
                            STATUS_TONE[staged[s.id] ?? st],
                          )}
                        >
                          {STATUSES.map((v) => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
                        </select>
                        {/* Staged, not written. Said out loud, because a value on screen
                            that is not the value in the record is exactly the kind of
                            silent disagreement this programme keeps finding. */}
                        {staged[s.id] ? (
                          <span id={`staged-${s.id}`} className="ml-1.5 font-mono text-micro text-amber-700 dark:text-amber-400">
                            ↵ to apply · esc to cancel
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => setOpenMechanic(openMechanic === s.id ? null : s.id)} className="text-micro text-cyan-700 hover:underline dark:text-cyan-400">
                          {openMechanic === s.id ? 'hide' : 'how to list'}
                        </button>
                        <button onClick={() => void genPacket(s.id)} disabled={packing === s.id} className="ml-2 text-micro text-cyan-700 hover:underline disabled:opacity-50 dark:text-cyan-400">
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
              <AiProse text={packet.text} validIds={[]} />
              <p className="mt-1 text-[10px] text-grey">{packet.usedLlm ? 'AI-drafted — review, then submit. AI never submits.' : 'Deterministic packet — no AI answer was produced; this engine does not report the cause.'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
