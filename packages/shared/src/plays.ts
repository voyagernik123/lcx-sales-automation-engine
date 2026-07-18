/**
 * The Play library (Wave 4) — signal-based selling.
 *
 * A play is a codified outreach angle: a condition on the target's signals + a
 * composer that writes a personalized, evidence-backed draft grounded in the
 * facts (why LCX, why now). selectPlay picks the strongest angle; renderPlay
 * fills it. Pure + deterministic (free-tier); the output is a DRAFT for human
 * review — never auto-sent (the desk's assisted-only rule holds). An LLM can
 * later polish the body behind the existing seam without changing selection.
 */

import type { TimingWindow } from './alpha.js';

export interface PlayFacts {
  name: string;
  ticker?: string | null;
  listedOnLcx?: boolean;
  timingWindow?: TimingWindow | null;
  achVerdict?: string | null;
  priceChange30d?: number | null;
  competitorCount?: number | null;
  topVenue?: string | null;
  euScore?: number | null;
  recommendedMarket?: string | null;
  tvlUsd?: number | null;
  githubCommits30d?: number | null;
  dealValueUsd?: number | null;
  contactName?: string | null;
}

export interface Draft {
  subject: string;
  body: string;
}

export interface PlayResult {
  playId: string;
  playLabel: string;
  rationale: string;
  draft: Draft;
  evidence: string[];
}

const firstName = (full?: string | null): string => (full ? full.trim().split(/\s+/)[0] : 'there');
const isEuPath = (m?: string | null): boolean => m === 'eu' || m === 'eu_first' || m === 'dual';
const usd = (v?: number | null): string => {
  if (v == null) return '';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
};

const SIGNOFF = '\n\nBest,\nThe LCX Listings desk\n(Regulated in the EU · MiCA-compliant)';

interface PlayDef {
  id: string;
  label: string;
  /** Higher wins when multiple plays match. */
  priority: (f: PlayFacts) => number;
  compose: (f: PlayFacts) => { rationale: string; draft: Draft; evidence: string[] };
}

const PLAYS: PlayDef[] = [
  {
    id: 'competitive_parity',
    label: 'Competitive parity',
    priority: (f) => (!f.listedOnLcx && (f.competitorCount ?? 0) >= 3 ? 90 + Math.min(9, f.competitorCount ?? 0) : 0),
    compose: (f) => ({
      rationale: `${f.name} trades on ${f.competitorCount} competitor venues but not LCX — lead with the parity gap.`,
      evidence: [
        `On ${f.competitorCount} competitor venue${f.competitorCount === 1 ? '' : 's'}${f.topVenue ? ` (incl. ${f.topVenue})` : ''}, not LCX`,
        isEuPath(f.recommendedMarket) ? 'EU/MiCA path fits LCX’s regulatory edge' : 'Regulated-venue positioning',
      ],
      draft: {
        subject: `${f.ticker ?? f.name} — a regulated EU venue you’re missing`,
        body:
          `Hi ${firstName(f.contactName)},\n\n` +
          `${f.name} already trades on ${f.competitorCount} exchanges${f.topVenue ? `, including ${f.topVenue}` : ''} — but not on a MiCA-regulated EU venue. ` +
          `That’s the gap we’d close. LCX gives ${f.ticker ?? f.name} regulated EU access and the compliance story your holders (and their institutions) increasingly ask for.\n\n` +
          `Worth a 20-minute call this week to walk through listing?` +
          SIGNOFF,
      },
    }),
  },
  {
    id: 'momentum_strike',
    label: 'Momentum strike',
    priority: (f) => (!f.listedOnLcx && (f.timingWindow === 'hot' || (f.priceChange30d ?? 0) >= 20) ? 80 : 0),
    compose: (f) => ({
      rationale: `${f.name} is heating up (${f.priceChange30d != null ? `${f.priceChange30d > 0 ? '+' : ''}${Math.round(f.priceChange30d)}% 30d` : 'strong momentum'}) — strike while attention is high.`,
      evidence: [
        f.priceChange30d != null ? `${f.priceChange30d > 0 ? '+' : ''}${Math.round(f.priceChange30d)}% over 30 days` : 'Positive momentum',
        f.timingWindow === 'hot' ? 'Timing window: hot' : 'Timing window: warming',
      ],
      draft: {
        subject: `${f.ticker ?? f.name} is having a moment — let’s add a regulated venue`,
        body:
          `Hi ${firstName(f.contactName)},\n\n` +
          `${f.name}’s momentum has caught our desk’s attention${f.priceChange30d != null ? ` (${f.priceChange30d > 0 ? '+' : ''}${Math.round(f.priceChange30d)}% in 30 days)` : ''}. ` +
          `Moments like this are exactly when a regulated EU listing compounds — new, compliance-sensitive demand you can’t reach on DEXs or offshore venues.\n\n` +
          `We can move fast. Open to a quick call while the window’s open?` +
          SIGNOFF,
      },
    }),
  },
  {
    id: 'eu_regulatory',
    label: 'EU / MiCA edge',
    priority: (f) => (!f.listedOnLcx && (f.euScore ?? 0) >= 60 && isEuPath(f.recommendedMarket) ? 70 : 0),
    compose: (f) => ({
      rationale: `${f.name} scores well on EU readiness — lead with LCX’s core MiCA advantage.`,
      evidence: [`EU readiness ${f.euScore}`, 'Recommended market: EU-first', 'LCX is MiCA-regulated'],
      draft: {
        subject: `${f.ticker ?? f.name} + LCX — your MiCA-compliant EU gateway`,
        body:
          `Hi ${firstName(f.contactName)},\n\n` +
          `As MiCA reshapes crypto access across the EU, projects that list on a regulated European venue early get a real edge. ` +
          `${f.name} looks well-positioned for it, and LCX is built for exactly this — a fully regulated, MiCA-compliant exchange in the EU.\n\n` +
          `Could we compare notes on an EU listing this week?` +
          SIGNOFF,
      },
    }),
  },
  {
    id: 'traction_proof',
    label: 'Traction proof',
    priority: (f) => (!f.listedOnLcx && ((f.tvlUsd ?? 0) >= 1e7 || (f.githubCommits30d ?? 0) >= 20) ? 55 : 0),
    compose: (f) => ({
      rationale: `${f.name} shows real fundamentals — lead with the "we list serious projects" angle.`,
      evidence: [
        f.tvlUsd ? `TVL ${usd(f.tvlUsd)}` : null,
        f.githubCommits30d ? `${f.githubCommits30d} commits in 30d` : null,
      ].filter(Boolean) as string[],
      draft: {
        subject: `${f.ticker ?? f.name} — the fundamentals stood out`,
        body:
          `Hi ${firstName(f.contactName)},\n\n` +
          `Our desk screens for real traction, and ${f.name} came up${f.tvlUsd ? ` (${usd(f.tvlUsd)} TVL)` : ''}${f.githubCommits30d ? ` with an active build cadence` : ''}. ` +
          `LCX curates the tokens it lists, and this profile is the kind we want on a regulated EU venue.\n\n` +
          `Would a short intro call make sense?` +
          SIGNOFF,
      },
    }),
  },
  {
    id: 'nurture',
    label: 'Nurture',
    priority: () => 1,
    compose: (f) => ({
      rationale: 'No sharp trigger yet — a light, relationship-building touch.',
      evidence: ['No urgent trigger — nurture'],
      draft: {
        subject: `Introducing LCX to the ${f.name} team`,
        body:
          `Hi ${firstName(f.contactName)},\n\n` +
          `I run listings at LCX, a MiCA-regulated exchange in the EU. I’ve been following ${f.name} and wanted to open a line — if a regulated European venue is ever on your roadmap, we’d love to be the first call.\n\n` +
          `No agenda today; happy to share how our process works whenever useful.` +
          SIGNOFF,
      },
    }),
  },
];

/** Choose the strongest-matching play for a target. */
export function selectPlay(f: PlayFacts): PlayDef {
  return [...PLAYS].sort((a, b) => b.priority(f) - a.priority(f))[0];
}

/** Select + render the evidence-backed draft for a target. */
export function renderPlay(f: PlayFacts): PlayResult {
  const play = selectPlay(f);
  const c = play.compose(f);
  return { playId: play.id, playLabel: play.label, rationale: c.rationale, draft: c.draft, evidence: c.evidence };
}

export const PLAY_IDS = PLAYS.map((p) => p.id);
