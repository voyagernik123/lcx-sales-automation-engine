import { DESTINATIONS, type Destination } from '@/lib/destinations';

/**
 * THE KEY ADDRESS — S6 of INSTRUMENT_100X_PLAN (the terminal).
 *
 * Every figure on a desk is one keystroke away: its desk's `g`-chord (from `lib/destinations.ts`, the one
 * table every navigation grammar is generated from) lands on the desk, and the figure's own anchor
 * (`#fig-<id>`) scrolls to it. The ⌘K palette lists each registered figure as a page command — "go to
 * figure" — so a reader who knows the figure's name reaches it without knowing where it lives.
 *
 * This is a REGISTRY, not an inference: a desk declares its figures here (id, label, desk) when it
 * renders them with `<Fig>`, and `lib/__tests__/oneTerminal.test.ts` pins that every `<Fig id>` on the
 * eight desks is registered — an unregistered figure is unreachable and that is a defect.
 */

export type DeskId = 'command' | 'sales' | 'intel' | 'regulatory' | 'distribution' | 'marketing' | 'gps' | 'governance';

export interface FigAddress {
  /** The `<Fig id>` — `${desk}.${name}`. */
  id: string;
  desk: DeskId;
  /** What the operator calls it, for the palette. */
  label: string;
}

/* The desk → destination map, by the destination ids `lib/destinations.ts` declares. */
const DESK_DESTINATION: Record<DeskId, string> = {
  command: 'go-ws-command', sales: 'go-ws-sales', intel: 'go-ws-intel', regulatory: 'go-ws-regulatory',
  distribution: 'go-ws-distribution', marketing: 'go-ws-marketing', gps: 'go-ws-gps', governance: 'go-ws-governance',
};

export const FIG_ADDRESSES: readonly FigAddress[] = [
  /* distribution — the growth cockpit */
  { id: 'distribution.presence', desk: 'distribution', label: 'Machine-economy presence' },
  { id: 'distribution.listings-live', desk: 'distribution', label: 'Listings live' },
  { id: 'distribution.listings-total', desk: 'distribution', label: 'Listings tracked' },
  { id: 'distribution.campaigns-live', desk: 'distribution', label: 'Campaigns live' },
  { id: 'distribution.campaigns-token', desk: 'distribution', label: 'Token-incentivised campaigns' },
  { id: 'distribution.funnel-aware', desk: 'distribution', label: 'Funnel · aware' },
  { id: 'distribution.funnel-listed', desk: 'distribution', label: 'Funnel · listed' },
  { id: 'distribution.funnel-active', desk: 'distribution', label: 'Funnel · active' },
  { id: 'distribution.funnel-paying', desk: 'distribution', label: 'Funnel · paying' },
  { id: 'distribution.conv-listed', desk: 'distribution', label: 'Conversion · aware → listed' },
  { id: 'distribution.conv-active', desk: 'distribution', label: 'Conversion · listed → active' },
  { id: 'distribution.conv-paying', desk: 'distribution', label: 'Conversion · active → paying' },
  { id: 'distribution.emitted', desk: 'distribution', label: 'LCX emitted @ 10k paid links' },
  { id: 'distribution.fee-revenue', desk: 'distribution', label: 'Fee revenue (LCX)' },
  { id: 'distribution.net-treasury', desk: 'distribution', label: 'Net treasury (LCX)' },
  { id: 'distribution.budget-utilisation', desk: 'distribution', label: 'Emission budget utilisation' },
  { id: 'distribution.gaps', desk: 'distribution', label: 'Gap register size' },
  { id: 'distribution.rails', desk: 'distribution', label: 'Rails mapped' },
  { id: 'distribution.surfaces', desk: 'distribution', label: 'Surfaces mapped' },
  { id: 'distribution.competitors', desk: 'distribution', label: 'Competitors tracked' },
  /* governance — the weekly business review */
  { id: 'governance.exceptions', desk: 'governance', label: 'WBR exceptions' },
  { id: 'governance.exceptions-critical', desk: 'governance', label: 'WBR critical exceptions' },
  { id: 'governance.commitments', desk: 'governance', label: 'Commitments carried forward' },
  { id: 'governance.commitments-overdue', desk: 'governance', label: 'Overdue commitments' },
  { id: 'governance.inputs', desk: 'governance', label: 'WBR input metrics' },
  { id: 'governance.outputs', desk: 'governance', label: 'WBR output metrics' },
  /* intel — the command center */
  { id: 'intel.universe', desk: 'intel', label: 'Targetable universe' },
  { id: 'intel.universe-ev', desk: 'intel', label: 'Universe EV' },
  { id: 'intel.conviction', desk: 'intel', label: 'Average conviction' },
  { id: 'intel.open-pipeline', desk: 'intel', label: 'Open pipeline value' },
  { id: 'intel.open-deals', desk: 'intel', label: 'Open deals' },
  { id: 'intel.top20', desk: 'intel', label: 'Top-20 concentration' },
  { id: 'intel.top20-ev', desk: 'intel', label: 'Top-20 EV' },
  { id: 'intel.forecast-p50', desk: 'intel', label: 'Forecast P50' },
  { id: 'intel.forecast-p10', desk: 'intel', label: 'Forecast P10' },
  { id: 'intel.forecast-p90', desk: 'intel', label: 'Forecast P90' },
  { id: 'intel.forecast-expected', desk: 'intel', label: 'Forecast expected value' },
  { id: 'intel.forecast-runs', desk: 'intel', label: 'Forecast simulation runs' },
  /* gps — the services book */
  { id: 'gps.live', desk: 'gps', label: 'Live engagements' },
  { id: 'gps.clients', desk: 'gps', label: 'GPS clients' },
  { id: 'gps.engagements', desk: 'gps', label: 'Engagements, all statuses' },
  { id: 'gps.open-value', desk: 'gps', label: 'Open value' },
  { id: 'gps.open-margin', desk: 'gps', label: 'Open margin' },
  { id: 'gps.open-vendor-cost', desk: 'gps', label: 'Open vendor cost' },
  { id: 'gps.collected', desk: 'gps', label: 'Collected' },
  { id: 'gps.awaiting-deposit', desk: 'gps', label: 'Awaiting deposit' },
  { id: 'gps.oldest-accepted', desk: 'gps', label: 'Oldest accepted, unpaid' },
  { id: 'gps.gap-conflict', desk: 'gps', label: 'Engagements with no conflict check' },
  { id: 'gps.gap-unpriced', desk: 'gps', label: 'Unpriced engagements' },
  { id: 'gps.gap-unstaffable', desk: 'gps', label: 'Unstaffable engagements' },
  /* command — the US launch deck */
  { id: 'command.products', desk: 'command', label: 'Products' },
  { id: 'command.partners', desk: 'command', label: 'Partners' },
  { id: 'command.workstreams', desk: 'command', label: 'Workstreams' },
  { id: 'command.tasks', desk: 'command', label: 'Tasks' },
  { id: 'command.decisions-open', desk: 'command', label: 'Open decisions' },
  { id: 'command.decisions-total', desk: 'command', label: 'Decisions recorded' },
  { id: 'command.risks', desk: 'command', label: 'Risks' },
  { id: 'command.gating-done', desk: 'command', label: 'Gates passed' },
  { id: 'command.gating-total', desk: 'command', label: 'Gates total' },
  { id: 'command.gating-pct', desk: 'command', label: 'Gating complete' },
  { id: 'command.targets-unconfirmed', desk: 'command', label: 'Unconfirmed targets' },
  { id: 'command.assumptions', desk: 'command', label: 'Planning assumptions' },
  { id: 'command.gap-partners-contact', desk: 'command', label: 'Partners missing contact' },
  { id: 'command.gap-partners-terms', desk: 'command', label: 'Partners missing terms' },
  { id: 'command.gap-assumptions', desk: 'command', label: 'Planning assumptions (gap register)' },
  { id: 'command.gap-targets', desk: 'command', label: 'Unconfirmed targets (gap register)' },
  /* regulatory — the compiled research cockpit */
  { id: 'regulatory.researched', desk: 'regulatory', label: 'Researched jurisdictions' },
  { id: 'regulatory.jurisdictions', desk: 'regulatory', label: 'Jurisdictions in scope' },
  { id: 'regulatory.launchable', desk: 'regulatory', label: 'Launchable states' },
  { id: 'regulatory.blockers', desk: 'regulatory', label: 'Blocked requirements' },
  { id: 'regulatory.products', desk: 'regulatory', label: 'Listed products' },
  { id: 'regulatory.coverage', desk: 'regulatory', label: 'Research coverage' },
  /* sales — the pipeline */
  { id: 'sales.leads', desk: 'sales', label: 'Tracked leads' },
  { id: 'sales.universe', desk: 'sales', label: 'Projects in universe' },
  /* marketing — the desk's measurement strip (lower bounds over one mailbox, each with its frame) */
  { id: 'marketing.open-observed', desk: 'marketing', label: 'Open items observed (lower bound)' },
  { id: 'marketing.suspicious', desk: 'marketing', label: 'Replies that tried to steer the model' },
  { id: 'marketing.unparsed', desk: 'marketing', label: 'Emails the parser could not read' },
  { id: 'marketing.post-time-coverage', desk: 'marketing', label: 'Post-time coverage' },
];

/**
 * Figures whose ids are DATA-KEYED (a WBR metric per `m.key`, an SLO per `s.key`) cannot be listed one by one:
 * the registry names their PREFIX, and the palette offers the group. The ratchet accepts an id that starts
 * with a registered prefix.
 */
export const FIG_ID_PREFIXES: readonly { prefix: string; desk: DeskId; label: string }[] = [
  { prefix: 'governance.', desk: 'governance', label: 'WBR metric' },
  { prefix: 'intel.slo-', desk: 'intel', label: 'SLO' },
];

export function destinationForDesk(desk: DeskId): Destination | undefined {
  return DESTINATIONS.find((d) => d.id === DESK_DESTINATION[desk]);
}

/** The chord chip a `<Fig>` shows: `g5` for a distribution figure. Undefined when the desk has no chord. */
export function chordFor(desk: DeskId): string | undefined {
  const d = destinationForDesk(desk);
  return d ? `g${d.key}` : undefined;
}

/** DOM id for the anchor a palette entry lands on. */
export const figAnchor = (id: string) => `fig-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

/** Palette rows — one per registered figure — in the shape `CommandBody`'s page commands use. */
export function figPaletteItems(): Array<{ id: string; label: string; sublabel: string; to: string; type: 'page' }> {
  return FIG_ADDRESSES.flatMap((f) => {
    const d = destinationForDesk(f.desk);
    if (!d) return [];
    return [{ id: `fig:${f.id}`, label: f.label, sublabel: `${d.label} figure · g${d.key}`, to: `${d.path}#${figAnchor(f.id)}`, type: 'page' as const }];
  });
}
