import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { checkGate } from '@/lib/api/bd';
import type { GateCheck } from '@/types/bd';

/**
 * Outreach gate — surfaces GET /v1/projects/:id/gate ("why can't I outreach
 * this lead"). Blocked → amber banner with the exact reasons and what
 * unblocks each; passing → a subtle green "outreach eligible" line.
 */

export interface GateCheckState {
  gate: GateCheck | null;
  loading: boolean;
  failed: boolean;
}

export function useGateCheck(projectId: string | undefined): GateCheckState {
  const [gate, setGate] = useState<GateCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    let alive = true;
    setGate(null);
    setLoading(true);
    setFailed(false);
    // Promise.resolve() wrapper also catches synchronous throws so the page
    // degrades instead of crashing when the endpoint is unavailable.
    Promise.resolve()
      .then(() => checkGate(projectId))
      .then(res => {
        if (alive) setGate(res.data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  return { gate, loading, failed };
}

/** Maps a gate reason string to the action that clears it. */
function unblockHint(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes('suppressed')) return 'Lift suppression before any outreach.';
  if (r.includes('verified email') || r.includes('linkedin')) {
    return 'Add a contact with a valid email or LinkedIn URL, or run Find Contact Email.';
  }
  if (r.includes('below nurture') || r.includes('band')) {
    return 'Score must reach the nurture band — enrich the lead, then force a re-score.';
  }
  if (r.includes('red-flag') || r.includes('red flag')) {
    return 'Resolve the red flags, then force a re-score to unlock.';
  }
  return 'Resolve, then re-check the gate.';
}

export function GateBanner({ check, compact = false, id }: { check: GateCheckState; compact?: boolean; id?: string }) {
  const { gate, loading, failed } = check;

  if (loading) {
    return (
      <div id={id} className="flex items-center gap-1.5 text-micro text-grey" role="status">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
        Checking outreach gate…
      </div>
    );
  }

  if (failed || !gate) {
    return (
      <p id={id} className="text-micro text-grey italic">Outreach gate status unavailable.</p>
    );
  }

  if (gate.pass) {
    return (
      <div id={id} className="flex items-center gap-1.5 text-micro font-bold text-emerald-600 dark:text-emerald-400">
        <ShieldCheck size={12} className="shrink-0" />
        Outreach eligible — gate clear
        <span className="font-normal text-grey">
          (band {gate.band} · {gate.totalContacts} contact{gate.totalContacts === 1 ? '' : 's'})
        </span>
      </div>
    );
  }

  return (
    <div
      id={id}
      className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 overflow-hidden"
      role="alert"
    >
      <div className={`flex items-center gap-2 ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
        <ShieldAlert size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-micro font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          Outreach blocked
        </span>
        <span className="text-micro num-tabular text-amber-700/80 dark:text-amber-400/80">
          {gate.reasons.length} blocker{gate.reasons.length === 1 ? '' : 's'} · gate ×0
        </span>
      </div>
      <ul className={`space-y-1.5 border-t border-amber-200 dark:border-amber-800 ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
        {gate.reasons.map((reason, i) => (
          <li key={i} className="text-micro text-amber-800 dark:text-amber-300">
            <span className="font-semibold">{reason}</span>
            <span className="block text-micro text-amber-700/90 dark:text-amber-400/90">
              Unblock: {unblockHint(reason)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
