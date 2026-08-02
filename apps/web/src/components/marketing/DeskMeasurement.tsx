import { useMemo } from 'react';
import { SectionLabel } from '@/components/ui';
import type { MarketingReply, MarketingSummary } from '@/lib/api/marketing';
import { LowerBoundTile, ObservationFrameNote, Th, Td } from './DeskAtoms';
import {
  MARKETING_MEASUREMENT_IS_ABOUT_THE_DESK,
  PROCESS_METRIC_KEYS,
  REFUSED_METRICS,
  notificationCensusFrame,
  ownRecordsFrame,
  type ProcessMetricKey,
  type RefusedMetricKey,
} from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  MEASUREMENT — the desk, not the market
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Share of voice is a ratio. Its denominator is every item covering the issue, and with no
 * X credential the observable population is "items that mentioned us and triggered a
 * notification email" — a census of one edge type in a graph centred on ourselves. The
 * ratio would be our_items / items_that_mentioned_us, which trivially approaches 1 and
 * means nothing. Sentiment is worse: notification delivery is controversy-weighted, so the
 * corpus is systematically negative-skewed before anybody scores it, and
 * `marketing_reply.sentiment` is a declared column nothing writes.
 *
 * SO THE TWO TABLES BELOW ARE BOTH READ OUT OF THE SHARED ENGINE, not restated here:
 * `REFUSED_METRICS` is the refusal list AS DATA, with the reason and the substitute for
 * each — which is the difference between a dashboard that is missing things and an
 * instrument that tells you what it cannot know. `PROCESS_METRIC_KEYS` is what CAN be
 * measured. The per-key sentences in this file are the UI's copy over the engine's keys,
 * declared as exhaustive `Record`s, so a key added to the engine is a compile error here
 * rather than a metric that silently stops being shown.
 */

/** What each process metric measures, and — honestly — what it needs before it can. */
const PROCESS_METRIC_COPY: Record<ProcessMetricKey, { measures: string; needs: string }> = {
  time_to_first_statement: {
    measures: 'from an incident being detected to the first thing the desk said, against the severity budget',
    needs: 'an incident record carrying a detection time. No route on this environment.',
  },
  clearance_latency_by_role: {
    measures: 'how long each CERC lane held a statement — it names the bottleneck before a crisis proves it',
    needs: 'stored clearances. The crisis room checklist stores nothing.',
  },
  precleared_derivation_rate: {
    measures: 'published items derived from prepared language rather than improvised on the night',
    needs: 'a handoff record naming the prepared statement it came from.',
  },
  claim_provenance_rate: {
    measures: 'quantitative claims in published items that carry a source reference',
    needs: 'claim ids recorded against a draft. Nothing links drafts to the claim library yet.',
  },
  contradiction_debt: {
    measures: 'live claim pairs that overlap and differ with nothing marking one as superseding the other',
    needs: 'the precedent table. Not deployed here.',
  },
  line_staleness: {
    measures: 'cleared language past its review date, and claims used after they expired',
    needs: 'a claim-expiry ledger. The holding statements carry their own review dates and the crisis room already marks the overdue ones.',
  },
  not_known_non_empty_rate: {
    measures: 'first statements that admitted what was not yet known — the anti-over-reassurance proxy',
    needs: 'stored statements carrying the three-part template.',
  },
  refusal_rate_by_code: {
    measures: 'which gates actually refuse things — the only honest read on whether this compartment is getting safer, and on whether a gate that has never fired is perfect or dead',
    needs: 'refusals recorded at the moment they fire. Today the desk computes them in the browser and throws them away when the tab closes.',
  },
  retraction_count: {
    measures: 'linked corrections, never deletions — the one accuracy metric the desk can compute about itself',
    needs: 'a correction link on the handoff record.',
  },
  next_update_breach_count: {
    measures: 'committed update times the desk missed — "be credible" as a countable failure',
    needs: 'stored commitments with their deadline.',
  },
  ignore_with_rationale_rate: {
    measures: 'items closed as a decision not to answer that carry a rationale',
    needs: 'the silence log. Not deployed here.',
  },
  question_coverage: {
    measures: 'anticipated questions that have a live, cleared line ready before the day they are asked',
    needs: 'the precedent index joined to the question set. The crisis room shows the contagion half of it already.',
  },
};

/** Human labels for the refused metrics, in the engine's key order. */
const REFUSED_LABEL: Record<RefusedMetricKey, string> = {
  impressions: 'impressions',
  reach: 'reach',
  follower_delta: 'follower delta',
  engagement_rate: 'engagement rate',
  repost_count: 'repost count',
  bookmark_count: 'bookmark count',
  click_through_rate: 'click-through rate',
  share_of_voice: 'share of voice',
  audience_sentiment: 'audience sentiment',
  mention_volume: 'mention volume',
  best_time_to_post: 'best time to post',
  audience_demographics: 'audience demographics',
  high_follower_author_triage: 'triage by author follower count',
  competitor_social_performance: 'competitor social performance',
};

export function DeskMeasurement({ queue, summary, now }: {
  queue: readonly MarketingReply[];
  summary: MarketingSummary | null;
  now: number;
}) {
  const clock = useMemo(() => {
    const withPosted = queue.filter((r) => r.posted_at != null && !Number.isNaN(Date.parse(r.posted_at)));
    return {
      covered: withPosted.length,
      total: queue.length,
      pct: queue.length === 0 ? null : Math.round((withPosted.length / queue.length) * 100),
    };
  }, [queue]);

  const inboundFrame = notificationCensusFrame(
    new Date(now - 7 * 86_400_000).toISOString(), new Date(now).toISOString(), null,
  );
  const ownFrame = ownRecordsFrame(
    new Date(now - 90 * 86_400_000).toISOString(), new Date(now).toISOString(),
    { truncatedByRetention: true },
  );

  return (
    <section aria-label="Measurement" className="space-y-3">
      <p className="border-l-2 border-line px-2 py-1.5 text-micro leading-snug text-grey">
        {MARKETING_MEASUREMENT_IS_ABOUT_THE_DESK}
      </p>

      {/* ── WHAT IS ACTUALLY OBSERVABLE TODAY ─────────────────────────────────── */}
      <div>
        <SectionLabel as="h3">What this environment can observe</SectionLabel>
        <p className="mt-0.5 text-[10px] leading-snug text-grey">
          Every count here is a lower bound and is labelled as one. None of them measures how LCX is being
          talked about; they measure what arrived in one mailbox.
        </p>
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          <LowerBoundTile label="Open items observed" value={queue.length} frame={inboundFrame} />
          <LowerBoundTile
            label="Replies that tried to steer the model"
            value={summary ? summary.suspicious : null}
            tone={summary && summary.suspicious > 0 ? 'warn' : undefined}
          />
          <LowerBoundTile
            label="Emails the parser could not read"
            value={summary ? summary.unparsed : null}
            tone={summary && summary.unparsed > 0 ? 'warn' : undefined}
          />
          <div className="border-l-2 border-line px-2 py-1.5">
            <div className="font-mono text-[10px] uppercase tracking-wider text-grey">Post-time coverage</div>
            <div className="mt-0.5 text-[20px] font-bold tabular-nums text-navy">
              {clock.pct === null ? '—' : `${clock.pct}%`}
            </div>
            <p className="text-[10px] leading-snug text-grey">
              {clock.total === 0
                ? 'No open items, so there is nothing to measure coverage over.'
                : `${clock.covered} of ${clock.total} open items carry a true post time. Any latency figure quoted for this desk covers only those, and the rest are excluded rather than timed from when the email arrived.`}
            </p>
          </div>
        </div>
      </div>

      {/* ── THE PROCESS METRICS ───────────────────────────────────────────────── */}
      <div>
        <SectionLabel as="h3">The process metrics</SectionLabel>
        <p className="mt-0.5 text-[10px] leading-snug text-grey">
          None of these can be computed on this environment yet, and each says which read it needs —
          deliberately, because a metric rendered as 0 while its table does not exist is the most damaging
          thing a measurement panel can do.
        </p>
        <table className="mt-1 w-full border-collapse">
          <caption className="sr-only">Process metrics and what each one needs before it can be computed.</caption>
          <thead>
            <tr>
              <Th className="w-44">Metric</Th>
              <Th>What it measures</Th>
              <Th className="w-56">The read it needs</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {PROCESS_METRIC_KEYS.map((k) => (
              <tr key={k} data-testid={`mkt-metric-${k}`}>
                <Td className="font-mono text-[10px] font-semibold text-navy">{k.replace(/_/g, ' ')}</Td>
                <Td className="text-grey">{PROCESS_METRIC_COPY[k].measures}</Td>
                <Td>
                  <span className="block font-semibold leading-snug text-status-conditional">not computable here</span>
                  <span className="leading-snug text-grey">{PROCESS_METRIC_COPY[k].needs}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        <ObservationFrameNote frame={ownFrame} />
      </div>

      {/* ── THE CEILING, AS DATA ──────────────────────────────────────────────── */}
      <div>
        <SectionLabel as="h3">Figures this compartment refuses to show</SectionLabel>
        <p className="mt-0.5 text-[10px] leading-snug text-grey">
          Not &ldquo;not yet&rdquo;. Each of these needs something no keyless desk can obtain, and a panel
          showing one would be a defect rather than a feature. Where there is an honest substitute it is named;
          where there is not, saying so is a better answer than a proxy nobody can defend.
        </p>
        <table className="mt-1 w-full border-collapse">
          <caption className="sr-only">Metrics refused, with the reason and any honest substitute.</caption>
          <thead>
            <tr>
              <Th className="w-40">Figure</Th>
              <Th>Why it is refused</Th>
              <Th className="w-56">Substitute</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(Object.keys(REFUSED_METRICS) as RefusedMetricKey[]).map((k) => (
              <tr key={k} data-testid={`mkt-refused-metric-${k}`}>
                <Td className="font-mono text-[10px] font-semibold text-status-blocked">{REFUSED_LABEL[k]}</Td>
                <Td className="text-grey">{REFUSED_METRICS[k].reason}</Td>
                <Td className="text-grey">
                  {REFUSED_METRICS[k].substitute === ''
                    ? <span className="font-semibold">nothing. There is no honest proxy for this one.</span>
                    : REFUSED_METRICS[k].substitute}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
