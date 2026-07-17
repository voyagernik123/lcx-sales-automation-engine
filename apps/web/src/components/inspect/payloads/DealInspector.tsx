import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Boxes, FileText, FolderOpen, KanbanSquare, ListChecks, ShieldAlert, TrendingUp } from 'lucide-react';
import { clsx } from 'clsx';
import { fetchDealBoard, fetchDealEvents, updateDeal, type BoardDeal } from '@/lib/api/bd';
import { fetchDealPlaybook, saveDealPlaybook, type DealPlaybookState, type PlaybookKey } from '@/lib/api/deals100x';
import { fetchForecast } from '@/lib/api/kpi';
import type { DealEvent } from '@/types/bd';
import { Derived } from '@/components/lineage';
import { playbookLineage } from '@/lib/lineage';
import { RelationRail } from '../RelationRail';
import {
  computeDealHealthSet,
  LIKELIHOOD_BAND_CLS,
  MOMENTUM_GLYPH,
  type DealHealth,
} from '@/lib/salesIntel';
import { useInspectorStore } from '@/stores';
import { CardSkeleton, EmptyState, toast } from '@/components/shared';
import { Button, InlineEdit } from '@/components/ui';
import { PlaybookChecklist } from '@/components/deals/PlaybookChips';
import { DealReviewMemo } from '@/components/deals/DealReviewMemo';
import { ScenarioValue, ScenarioWinProb } from '@/components/deals/ScenarioControls';
import { severityChipCls } from '@/components/deals/warningDisplay';
import { packageLabel, relativeTime } from '@/components/deals/dealFormat';
import type { InspectorPayloadProps } from './ProjectInspector';

/** Section header shared by every block in the panel. */
function SectionHead({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
      {icon}
      {children}
    </div>
  );
}

const SEVERITY_WORD: Record<number, string> = { 1: 'advisory', 2: 'attention', 3: 'critical' };

/** Preloaded context the Deal Board hands over so the panel renders instantly. */
interface DealSeed {
  board?: BoardDeal[];
  events?: DealEvent[];
  playbookDone?: PlaybookKey[];
  playbookSource?: 'api' | 'local';
}

/**
 * Deal entity inspector — the full why-panel behind every judgment chip on
 * the board: likelihood score with its signed signal trail, warnings with
 * mitigations, momentum + stage dwell vs median, the editable listing
 * playbook, forecast win probability, the recent events timeline, the deal
 * review memo launcher, and hops to the project inspector / the board.
 */
export function DealInspector({ id, seed }: InspectorPayloadProps) {
  const navigate = useNavigate();
  const push = useInspectorStore(s => s.push);
  const closeInspector = useInspectorStore(s => s.close);

  // The board seeds us with everything it already fetched (see inspectDeal on
  // DealBoard) — the panel paints from it instantly and a background refresh
  // upgrades it. Opened from elsewhere (project hop), seed is absent and we
  // fetch everything.
  const seeded = seed as DealSeed | undefined;
  const seededHasDeal = Boolean(seeded?.board?.some(d => d.id === id));

  const [board, setBoard] = useState<BoardDeal[]>(seeded?.board ?? []);
  const [events, setEvents] = useState<DealEvent[]>(seeded?.events ?? []);
  const [playbook, setPlaybook] = useState<DealPlaybookState | null>(
    seeded?.playbookDone ? { done: seeded.playbookDone, source: seeded.playbookSource ?? 'local' } : null,
  );
  const [winProb, setWinProb] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(seededHasDeal);
  const [error, setError] = useState<string | null>(null);
  const [memoOpen, setMemoOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const s = seed as DealSeed | undefined;
    const hasSeed = Boolean(s?.board?.some(d => d.id === id));
    setBoard(s?.board ?? []);
    setEvents(s?.events ?? []);
    setPlaybook(s?.playbookDone ? { done: s.playbookDone, source: s.playbookSource ?? 'local' } : null);
    setLoaded(hasSeed);
    setError(null);
    setWinProb(null);
    setMemoOpen(false);
    (async () => {
      try {
        // Board + this deal's context; the health set needs the full board
        // for stage medians and the percentile rank.
        const [boardRes, ev, pb] = await Promise.all([
          fetchDealBoard(),
          fetchDealEvents(id),
          fetchDealPlaybook(id),
        ]);
        if (cancelled) return;
        setBoard(boardRes);
        setEvents(ev.data);
        setPlaybook(pb);
        setLoaded(true);
      } catch (err) {
        if (cancelled) return;
        // With a seed we keep rendering the board's data (e.g. transient API
        // rate-limit); without one there is nothing to show but the error.
        if (!hasSeed) setError(err instanceof Error ? err.message : 'Failed to load');
        setLoaded(true);
      }
    })();
    // Forecast is best-effort enrichment — the panel renders fine without it.
    fetchForecast()
      .then(f => {
        if (cancelled) return;
        const match = f.deals.find(d => d.id === id);
        setWinProb(match ? match.winProbability : null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // seed identity is stable per inspector-stack entry (stored in zustand).
  }, [id, seed]);

  const deal = useMemo(() => board.find(b => b.id === id) ?? null, [board, id]);

  // Health recomputes live as playbook steps toggle.
  const health: DealHealth | null = useMemo(() => {
    if (!deal) return null;
    const set = computeDealHealthSet(board, { [id]: { events, playbookDone: playbook?.done ?? [] } });
    return set.get(id) ?? null;
  }, [board, deal, id, events, playbook]);

  /** Toggle a playbook step: optimistic, PATCH w/ localStorage fallback. */
  const togglePlaybook = useCallback(
    async (key: PlaybookKey) => {
      const prev = playbook?.done ?? [];
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      setPlaybook(p => ({ done: next, source: p?.source ?? 'local' }));
      const saved = await saveDealPlaybook(id, next);
      setPlaybook(saved);
    },
    [id, playbook],
  );

  if (error) return <EmptyState variant="error" title="Failed to load deal" description={error} />;
  if (!loaded) return <CardSkeleton count={3} />;
  if (!deal) {
    return <EmptyState variant="error" title="Deal not found" description="This deal is no longer on the board." />;
  }

  const closed = deal.stage === 'won' || deal.stage === 'lost';
  const recentEvents = [...events]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);

  return (
    <div className="space-y-4">
      {/* Identity header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-navy">{deal.projectName}</span>
          {deal.projectTicker && (
            <span className="rounded bg-ice-soft px-1.5 py-0.5 font-mono text-micro font-bold text-grey dark:bg-ice-soft/10">
              {deal.projectTicker}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-label text-grey">
          <span className="capitalize">{deal.stage.replace(/_/g, ' ')}</span>
          <span>· {packageLabel(deal.packageType)}</span>
          <InlineEdit
            ariaLabel="Package value"
            type="number"
            initial={deal.packageValue != null ? String(Math.round(deal.packageValue / 100)) : ''}
            display={<ScenarioValue cents={deal.packageValue} className="num-tabular font-semibold text-navy" />}
            onSave={raw => {
              const usd = Math.max(0, Math.round(Number(raw)));
              if (!Number.isFinite(usd)) return;
              const cents = usd * 100;
              const prev = deal.packageValue;
              // Optimistic: apply now, roll back with a toast if the write fails.
              setBoard(b => b.map(x => (x.id === deal.id ? { ...x, packageValue: cents } : x)));
              updateDeal(deal.id, { packageValue: cents }).catch(err => {
                setBoard(b => b.map(x => (x.id === deal.id ? { ...x, packageValue: prev } : x)));
                toast('error', err instanceof Error ? err.message : 'Value update failed — reverted');
              });
            }}
          />
          <span>· updated {relativeTime(deal.updatedAt)}</span>
        </div>
      </div>

      {/* Relation pivots — the graph is the navigation */}
      <RelationRail
        items={[
          { label: 'project', count: 1, icon: Boxes, onClick: () => push('project', deal.projectId) },
          {
            label: events.length === 1 ? 'event' : 'events',
            count: events.length,
            icon: Activity,
            onClick: () => document.getElementById('insp-deal-events')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
          },
        ]}
      />

      {/* Likelihood why-panel */}
      {health && (
        <div>
          <SectionHead icon={<TrendingUp size={11} className="text-cyan-500" />}>Likelihood — the why</SectionHead>
          <div className="flex items-center gap-2">
            <span
              className={clsx('num-tabular derived rounded px-1.5 py-0.5 font-mono text-label font-bold', LIKELIHOOD_BAND_CLS[health.likelihood.band])}
              title="Derived value — the signed signals below are its evidence trail"
            >
              {health.likelihood.percentile}th percentile
            </span>
            <span className="text-micro text-grey">
              {health.likelihood.band} · score {Math.round(health.likelihood.score)}/100 among open deals
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {health.likelihood.signals.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-micro">
                <span
                  className={clsx(
                    'shrink-0 font-mono font-bold',
                    s.direction > 0 ? 'text-status-ready' : 'text-status-blocked',
                  )}
                  aria-label={s.direction > 0 ? 'helps' : 'hurts'}
                >
                  {s.direction > 0 ? '▲' : '▼'} {s.direction > 0 ? '+' : '−'}{s.weight}
                </span>
                <span className="min-w-0">
                  <span className="font-semibold text-navy">{s.label}</span>
                  <span className="text-grey"> — {s.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {winProb != null && (
            <p className="mt-2 flex items-baseline gap-1.5 text-micro text-grey">
              Forecast win probability
              <ScenarioWinProb pct={winProb} className="text-label font-bold text-navy" />
              <span>(Monte-Carlo forecast model)</span>
            </p>
          )}
        </div>
      )}

      {/* Warnings + mitigations */}
      {health && (
        <div>
          <SectionHead icon={<ShieldAlert size={11} className="text-cyan-500" />}>
            Warnings ({health.warnings.length})
          </SectionHead>
          {health.warnings.length === 0 ? (
            <p className="text-micro italic text-grey">No active warnings on this deal.</p>
          ) : (
            <div className="space-y-1.5">
              {health.warnings.map(w => (
                <div key={w.code} className="rounded-lg border border-line/70 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className={clsx('rounded px-1 py-0.5 text-[9px] font-bold', severityChipCls(w.severity))}>
                      {SEVERITY_WORD[w.severity]}
                    </span>
                    <span className="text-label font-semibold text-navy">{w.label}</span>
                  </div>
                  <p className="mt-0.5 text-micro text-grey">{w.detail}</p>
                  <p className="mt-0.5 text-micro text-navy">
                    <span className="font-bold">Do next:</span> {w.mitigation}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Momentum + stage dwell */}
      {health && (
        <div>
          <SectionHead icon={<Activity size={11} className="text-cyan-500" />}>Momentum &amp; stage dwell</SectionHead>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label">
            <span className={clsx('inline-flex items-center gap-1 font-mono font-bold', MOMENTUM_GLYPH[health.momentum].cls)}>
              {MOMENTUM_GLYPH[health.momentum].glyph} {health.momentum}
            </span>
            <span className="text-micro text-grey">{health.momentumDetail}</span>
          </div>
          <p className="mt-1 text-micro text-grey">
            <span className="num-tabular font-mono font-bold text-navy">{Math.floor(health.daysInStage)}d</span> in{' '}
            {deal.stage.replace(/_/g, ' ')}
            {health.stageMedianDays != null && (
              <>
                {' '}
                vs <span className="num-tabular font-mono font-bold text-navy">{Math.round(health.stageMedianDays)}d</span> median for
                the stage
              </>
            )}
            .
          </p>
        </div>
      )}

      {/* Editable listing playbook */}
      {health && !closed && (
        <div>
          <SectionHead icon={<ListChecks size={11} className="text-cyan-500" />}>
            Listing playbook ·{' '}
            <Derived lineage={playbookLineage(health.playbook)}>
              {health.playbook.filter(s => s.status === 'done').length}/{health.playbook.length}
            </Derived>
          </SectionHead>
          <PlaybookChecklist
            playbook={health.playbook}
            onToggle={key => void togglePlaybook(key)}
            local={playbook?.source === 'local'}
          />
        </div>
      )}

      {/* Recent events */}
      <div id="insp-deal-events">
        <SectionHead icon={<Activity size={11} className="text-cyan-500" />}>Recent events</SectionHead>
        {recentEvents.length === 0 ? (
          <p className="text-micro italic text-grey">No events recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {recentEvents.map(ev => (
              <div key={ev.id} className="flex items-start gap-2 text-micro">
                <span className="shrink-0 rounded bg-ice-soft px-1.5 py-0.5 text-[8px] font-bold uppercase text-grey dark:bg-ice-soft/10">
                  {ev.eventType.replace(/_/g, ' ')}
                </span>
                <div className="min-w-0 flex-1">
                  {ev.oldStage && ev.newStage && (
                    <span className="font-semibold text-navy">
                      {ev.oldStage.replace(/_/g, ' ')} → {ev.newStage.replace(/_/g, ' ')}{' '}
                    </span>
                  )}
                  <span className="text-grey">{ev.content ?? ''}</span>
                </div>
                <span className="shrink-0 text-[9px] text-grey">{relativeTime(ev.createdAt)}</span>
              </div>
            ))}
            {events.length > recentEvents.length && (
              <p className="text-[9px] text-grey">+ {events.length - recentEvents.length} earlier events in the memo</p>
            )}
          </div>
        )}
      </div>

      {/* Hops + memo */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setMemoOpen(true)}>
          <FileText size={12} /> Review memo
        </Button>
        <Button size="sm" variant="secondary" onClick={() => push('project', deal.projectId)}>
          <FolderOpen size={12} /> Inspect project
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            closeInspector();
            navigate('/deal-board');
          }}
        >
          <KanbanSquare size={12} /> Open board
        </Button>
      </div>

      {memoOpen && (
        <DealReviewMemo
          deal={deal}
          health={health}
          events={events}
          winProbability={winProb}
          onClose={() => setMemoOpen(false)}
        />
      )}
    </div>
  );
}
