/**
 * THE DESK FIXTURES — S6 of INSTRUMENT_100X_PLAN (the terminal).
 *
 * The S0 instrument aborts every `/v1/**` call by design, so its "numeric figures in the first viewport"
 * on a desk landing was the empty-state sentence's number (median 1) — a reading of the no-data state,
 * not of density. S6's claim is density (×3 figures per viewport on the eight desks), so the instrument
 * needs a mode in which each desk renders POPULATED, deterministically, under the frozen clock.
 *
 * WHAT THESE ARE, AND ARE NOT. Each fixture is the SMALLEST payload that makes its desk render its
 * figures — shapes mirror `apps/web/src/lib/api/*.ts` exactly (a drifted shape shows up as the desk's
 * own refusal text, which is the failure mode to want). NO NUMBER IN A REPORT IS READ OFF A FIXTURE
 * VALUE: the instrument counts elements carrying digits, never what the digits say. Density measured
 * with fixtures is a property of the LAYOUT, not of the data — every report that used them says so in
 * its header. The command and pipeline payloads follow `scripts/3d-audit-app.mjs` § FIXTURES, which
 * the app already parses; they are duplicated here rather than imported because that file runs its
 * sweep on import.
 *
 * WHICH ROUTES. Only the eight workspace landings (`WORKSPACES[].defaultLanding`, read from the
 * constitution on 2026-09-02) are answered; every other route keeps the no-API floor, and on the desks
 * every endpoint not listed here is still aborted — including the shell's own (health, watch, ticker),
 * so the shell contributes the same figures in the "before" and the "after".
 */

export const DESK_ROUTES = new Set([
  '/command-deck', '/bd-pipeline', '/command', '/regulatory-dashboard',
  '/distribution', '/marketing', '/gps', '/wbr',
]);

const envelope = (data, meta) => ({
  status: 200,
  contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify({ data, meta: meta ?? { timestamp: '2026-09-21T07:18:41.000Z', version: 'fixture' } }),
});

/** Fixture instants are anchored to the frozen clock so ages never drift between runs. */
export function deskFixtures(frozenAtIso) {
  const at = Date.parse(frozenAtIso);
  const iso = (msAgo) => new Date(at - msAgo).toISOString();
  const day = 86_400_000;

  /* ── command (/command-deck) — the sweep's own shape, so the deck renders rather than its EmptyState ── */
  const overview = {
    generatedAt: iso(0),
    counts: { products: 4, partners: 9, workstreams: 5, tasks: 41, decisions: 7, risks: 9 },
    workstreams: [
      { id: 'w1', name: 'Liquidity', owner: 'Nik', total: 10, done: 4, open: 5, blocked: 1 },
      { id: 'w2', name: 'Payment rails', owner: null, total: 8, done: 2, open: 6, blocked: 0 },
      { id: 'w3', name: 'Listing policy', owner: 'Ops', total: 6, done: 3, open: 3, blocked: 0 },
    ],
    partnersByType: [
      { type: 'Market maker', total: 4, recommended: 2, inProgress: 1 },
      { type: 'Payment rail', total: 5, recommended: 1, inProgress: 2 },
    ],
    riskHeat: [
      { impact: 'Critical', likelihood: 'High', count: 2 },
      { impact: 'High', likelihood: 'Medium', count: 3 },
    ],
    topRisks: [
      { id: 'r1', title: 'Anchor date unconfirmed', category: 'Programme', likelihood: 'High', impact: 'Critical', mitigation: 'Confirm with the board' },
      { id: 'r2', title: 'Rail provider terms open', category: 'Commercial', likelihood: 'Medium', impact: 'High', mitigation: 'Issue the RFI' },
    ],
    launch: {
      anchor: 'Unconfirmed', anchorConfirmed: false,
      targets: [{ id: 't1', name: 'US launch', targetDate: null, confirmed: false, note: null }],
      gating: [
        { id: 'g1', title: 'Licence', status: 'in_progress', done: false },
        { id: 'g2', title: 'Rails', status: 'open', done: true },
        { id: 'g3', title: 'Listing policy', status: 'open', done: true },
      ],
      gatingDone: 2, gatingTotal: 3,
    },
    decisions: { open: 3, total: 7, byPhase: { P1: 3, P2: 4 } },
    gaps: { partnersMissingContact: 2, partnersMissingTerms: 3, planningAssumptions: 4, unconfirmedTargets: 1, notes: ['instrument fixture'] },
  };
  const command = [
    ['**/v1/command/overview*', () => envelope(overview)],
    ['**/v1/command/partners*', () => envelope([{ id: 'pa1', name: 'ALPHA MM', type: 'Market maker', subtype: null, pipeline_stage: 'rfi', capability_score: 4, tier: 'A', primary_contact: null, terms: null, notes: null, updated_at: iso(2 * day) }])],
    ['**/v1/command/tasks*', () => envelope([{ id: 'tk1', workstream: 'Liquidity', title: 'Sign the market maker', owner: 'Nik', target_date: null, status: 'open', depends_on: [], notes: null, updated_at: iso(day) }])],
    ['**/v1/command/decisions*', () => envelope([{ id: 'd1', phase: 'P1', decision: 'Rail choice', recommendation: null, status: 'open', chosen: null }])],
    ['**/v1/command/risks*', () => envelope([{ id: 'r1', category: 'Programme', title: 'Anchor unconfirmed', likelihood: 'High', impact: 'Critical', mitigation: 'Confirm', phase: 'P1' }])],
    ['**/v1/command/financials*', () => envelope([{ id: 'f1', area: 'Rails', item: 'Setup', value: '50000', unit: 'USD', assumption: true, source: 'fixture' }])],
    // Full `LaunchSim` shape (command.ts): the deck reads `sim.warnings.length`; a fixture without `warnings` threw
    // four page errors and the deck rendered its error state — caught by the first before-capture.
    ['**/v1/command/launch-sim*', () => envelope({
      runs: 2000, p10Days: 41, p50Days: 63, p90Days: 97, meanDays: 66,
      p10Date: iso(-41 * day), p50Date: iso(-63 * day), p90Date: iso(-97 * day),
      criticality: [
        { id: 'g1', title: 'Licence', status: 'in_progress', criticality: 0.62, meanDuration: 38 },
        { id: 'g2', title: 'Rails', status: 'open', criticality: 0.31, meanDuration: 21 },
      ],
      warnings: [], disclaimer: 'fixture — a simulation over stated assumptions, not a forecast',
      assumptions: [
        { id: 'a1', title: 'Licence review', status: 'stated', min: 20, mode: 35, max: 60 },
        { id: 'a2', title: 'Rail integration', status: 'stated', min: 10, mode: 20, max: 40 },
      ],
    })],
  ];

  /* ── sales (/bd-pipeline) — the sweep's lead shape, one page ── */
  const lead = (i) => ({
    id: `fixture-lead-${String(i).padStart(2, '0')}`, name: `PROBE CHAIN ${String(i).padStart(2, '0')}`, ticker: `PC${i}`, website: null,
    source: 'fixture', chain: 'ethereum', jurisdiction: 'US', category: 'defi', listedOnLcx: false,
    euScore: 40 + i, usPreScore: 35 + i, usPostScore: 45 + i, band: 'watch',
    marketCapUsd: 250_000 + i * 40_000, peopleCount: 2, verifiedContactCount: 1, tier: 'tracked',
    createdAt: iso(90 * day), updatedAt: iso(i * day), hasContact: true, marketTag: null,
  });
  const sales = [
    ['**/v1/projects?*', () => envelope(Array.from({ length: 14 }, (_, i) => lead(i)), { total: 14, limit: 50, offset: 0, timestamp: iso(0), version: 'fixture' })],
    ['**/v1/handoffs?*', () => envelope(
      Array.from({ length: 3 }, (_, i) => ({ id: `fixture-handoff-${i}`, projectId: `fixture-lead-0${i}`, personId: null, channel: 'telegram', triggerMessageId: null, triggerReason: 'reply received', status: i === 0 ? 'open' : 'in_progress', assignedTo: null, summary: null, projectName: `PROBE CHAIN 0${i}`, createdAt: iso((i + 1) * day), updatedAt: iso(i * 3_600_000) })),
      { total: 3, timestamp: iso(0), version: 'fixture' })],
    ['**/v1/tasks?*', () => envelope(
      Array.from({ length: 4 }, (_, i) => ({ id: `fixture-task-${i}`, projectId: `fixture-lead-0${i}`, projectName: `PROBE CHAIN 0${i}`, dealId: null, handoffId: null, title: `Follow up ${i + 1}`, detail: null, kind: 'follow_up', status: 'open', dueAt: iso(-(i + 1) * day), createdAt: iso(5 * day) })))],
  ];

  /* ── intel (/command) ── */
  const slice = (key, count) => ({ key, count, evUsd: count * 125_000, avgConviction: 0.55 });
  const intel = [
    ['**/v1/kpis/forecast*', () => envelope({
      runs: 5000, p10: 180_000, p50: 420_000, p90: 910_000, expected: 468_000,
      deals: Array.from({ length: 5 }, (_, i) => ({ id: `fixture-deal-${i}`, projectName: `PROBE CHAIN 0${i}`, stage: ['qualified', 'proposal', 'negotiation', 'proposal', 'qualified'][i], value: 60_000 + i * 35_000, winProbability: 0.25 + i * 0.1, daysSinceUpdate: i * 3 })),
    })],
    ['**/v1/intel/portfolio*', () => envelope({
      totalTargets: 54, totalEvUsd: 6_750_000, avgConviction: 0.52,
      byBand: [slice('act', 9), slice('watch', 27), slice('ignore', 18)],
      byRegion: [slice('us', 22), slice('eu', 19), slice('apac', 13)],
      byCategory: [slice('defi', 21), slice('infra', 17), slice('gaming', 16)],
      byTiming: [slice('now', 11), slice('quarter', 24), slice('later', 19)],
      concentration: { top20Share: 0.61, top20EvUsd: 4_117_500 },
      pipeline: { openDeals: 5, openValueUsd: 650_000 },
    })],
    ['**/v1/intel/slo*', () => envelope({
      generatedAt: iso(0), anyBreach: false, anyWarn: true,
      slos: [
        { key: 'ingest_lag', label: 'Ingest lag', description: 'signal to desk', unit: 'hours', target: 24, current: 6, higherIsBetter: false, status: 'ok', budgetBurnPct: 12, window: '7d', detail: 'fixture' },
        { key: 'api_p95', label: 'API p95', description: 'read latency', unit: 'ms', target: 800, current: 640, higherIsBetter: false, status: 'warn', budgetBurnPct: 71, window: '7d', detail: 'fixture' },
        { key: 'scoring_coverage', label: 'Scoring coverage', description: 'scored share of universe', unit: 'pct', target: 95, current: 97, higherIsBetter: true, status: 'ok', budgetBurnPct: 4, window: '7d', detail: 'fixture' },
      ],
    })],
  ];

  /* ── distribution (/distribution) ── */
  const distribution = [
    ['**/v1/distribution/campaigns*', () => envelope(Array.from({ length: 3 }, (_, i) => ({ id: `fixture-camp-${i}`, name: `Campaign ${i + 1}`, surface_id: 's1', kind: 'listing', token_incentivized: i === 1, budget_lcx: i === 1 ? '12000' : null, status: ['draft', 'live', 'paused'][i], detail: null, owner: 'Ops', created_at: iso((i + 2) * day) })))],
    ['**/v1/distribution/deep*', () => envelope({
      reference: {
        meta: { product: 'PayAgent', builtBy: 'fixture', thesis: 'distribution is the moat', asOf: iso(0), dossier: 'fixture' },
        payAgent: { tagline: 'pay any agent', custody: 'self', fees: [{ mode: 'card', fee: '1.5%', creatorReward: '0.5%', assets: 'USDC' }], rewardLoop: 'creator', chains: ['ethereum'], surfaces: ['wallet'], roadmap: ['Q4'], srcRefs: [] },
        rails: [{ id: 'r1', name: 'Rail One', governance: 'foundation', model: 'fee', traction: 'growing', cost: 'low', fitForLcx: 4, lcxNote: 'fixture', srcRefs: [] }],
        surfaces: [{ id: 's1', name: 'Wallet directory', category: 'directory', audience: 'retail', submit: 'form', telemetry: null, constraint: null, srcRefs: [] }],
        growthContext: [{ id: 'g1', headline: 'Agents pay agents', implication: 'rails matter', srcRefs: [] }],
        competitors: [{ id: 'c1', name: 'Competitor A', focus: 'payments', funding: '$40M', playbook: 'partnerships', threat: 3, srcRefs: [] }],
        funnel: { stages: ['aware', 'listed', 'active', 'paying'], params: { aware: 12_000, listed: 3_100, active: 940, paying: 210 }, note: 'fixture' },
        gaps: [{ id: 'gap1', title: 'No partner telemetry', gap: 'usage unknown', lcxAngle: 'ask for it' }, { id: 'gap2', title: 'Two rails untested', gap: 'no pilot', lcxAngle: 'pilot one' }],
        geoQuestions: [{ id: 'q1', query: 'best crypto payment agent', intent: 'commercial', priority: 'high' }],
        personas: [{ id: 'p1', name: 'Builder', channel: 'x', cadence: 'weekly', beat: 'agents' }],
        sources: [{ id: 'src1', grade: 'A', label: 'fixture', url: null }],
      },
      listings: [{ surface_id: 's1', status: 'listed', owner: 'Ops', rank_note: null, usage_note: null, url: null, updated_at: iso(day) }],
      live: { listings: true },
    })],
    ['**/v1/distribution/engines/presence*', () => envelope({ presenceScore: 0.42, surfaces: [{ surfaceId: 's1', label: 'Wallet directory', score: 0.7 }, { surfaceId: 's2', label: 'Agent index', score: 0.2 }] })],
  ];

  /* ── gps (/gps) ── */
  const engagement = (i, status) => ({
    id: `0191abcd-ef01-4345-8789-abcdef01230${i}`, clientId: `fixture-client-${i % 2}`, projectId: null, offerKey: ['diagnostic', 'gtm_sprint', 'mica_whitepaper'][i % 3],
    contractingEntity: 'lcx_ag', scopeSnapshot: {}, priceCents: 1_800_000 + i * 250_000, vendorCostCents: 600_000 + i * 90_000, currency: 'EUR', status,
    owner: 'nik', depositRequiredCents: 540_000, depositPaidAt: status === 'accepted' ? iso(3 * day) : null, acceptedAt: status === 'accepted' ? iso(4 * day) : null,
    createdAt: iso((i + 6) * day), updatedAt: iso(i * day), clientName: i % 2 ? 'Beta Labs' : 'Aster Labs', conflict: null,
  });
  const total = (currency, count, price, cost) => ({ currency, count, priceCents: price, vendorCostCents: cost, marginCents: price - cost });
  const gps = [
    ['**/v1/gps/clients*', () => envelope([
      { id: 'fixture-client-0', name: 'Aster Labs', legalEntity: 'Aster Labs GmbH', jurisdiction: 'DE', primaryContact: 'a@aster.example', status: 'active', createdAt: iso(40 * day), updatedAt: iso(2 * day) },
      { id: 'fixture-client-1', name: 'Beta Labs', legalEntity: 'Beta Labs Ltd', jurisdiction: 'UK', primaryContact: 'b@beta.example', status: 'prospect', createdAt: iso(20 * day), updatedAt: iso(day) },
    ])],
    ['**/v1/gps/engagements*', () => envelope([engagement(0, 'accepted'), engagement(1, 'proposed'), engagement(2, 'draft')])],
    ['**/v1/gps/summary*', () => envelope({
      migrated: true,
      clients: { total: 2, byStatus: { active: 1, prospect: 1 } },
      engagements: { total: 3, byStatus: { accepted: 1, proposed: 1, draft: 1 }, byOffer: { diagnostic: 1, gtm_sprint: 1, mica_whitepaper: 1 } },
      openByCurrency: [total('EUR', 2, 4_100_000, 1_380_000)],
      collectedByCurrency: [total('EUR', 1, 1_800_000, 600_000)],
      awaitingDeposit: { count: 1, byCurrency: [{ currency: 'EUR', depositRequiredCents: 540_000 }], oldestAcceptedDays: 4 },
      gaps: { missingConflictCheck: 2, conflictDeclined: 0, unpriced: 1, depositWithoutAcceptance: 0, unstaffable: 1 },
      catalogue: { priceBandsArePlaceholders: false, depositPolicyIsPlaceholder: false, blockingTodoCount: 0 },
    })],
  ];

  /* ── governance (/wbr) ── */
  const metric = (key, label, current, previous, kind, unit, higherIsBetter = true) => ({ key, label, current, previous, delta: current - previous, kind, unit, higherIsBetter });
  const wbr = [
    ['**/v1/wbr*', () => envelope({
      weeks: [iso(21 * day).slice(0, 10), iso(14 * day).slice(0, 10), iso(7 * day).slice(0, 10)],
      report: {
        weekStart: iso(7 * day).slice(0, 10), generatedAt: iso(0), live: true,
        inputs: [metric('outreach_sent', 'Outreach sent', 48, 41, 'flow', 'count'), metric('replies', 'Replies', 9, 6, 'flow', 'count'), metric('meetings', 'Meetings', 4, 3, 'flow', 'count')],
        outputs: [metric('deals_won', 'Deals won', 1, 0, 'flow', 'count'), metric('pipeline_value', 'Pipeline value', 65_000_000, 58_000_000, 'stock', 'usd_cents'), metric('win_rate', 'Win rate', 22, 18, 'stock', 'pct')],
        sparklines: [{ key: 'replies', label: 'Replies', points: [4, 5, 6, 6, 8, 9], unit: 'count' }, { key: 'pipeline_value', label: 'Pipeline', points: [51, 53, 55, 58, 61, 65].map((n) => n * 1_000_000), unit: 'usd_cents' }],
        exceptions: [{ kind: 'stalled_deal', label: 'PROBE CHAIN 03 stalled', detail: '19 days without an update', severity: 'warn', href: '/deal-board' }],
        commitments: [{ id: 'c1', title: 'Send the revised proposal', owner: 'nik', ownerLabel: 'Nik', dueAt: iso(-2 * day), overdue: false, projectName: 'PROBE CHAIN 01' }],
        narrative: 'Replies up on a smaller send; one deal stalled past its SLA.',
      },
    })],
  ];

  /* ── marketing (/marketing) — the landing renders MarketingDesk, whose panels read the queue, the summary and
     the abuse perimeter (the honesty ceiling is a plain unwrap, so a shaped payload passes it). ── */
  const reply = (i, status) => ({
    id: 100 + i, x_comment_id: `c-${1000 + i}`, x_post_id: `p-${500 + i}`, author_handle: `@probe_${i}`, author_display: `Probe ${i}`,
    body: `Is the ${['listing', 'staking', 'bridge'][i % 3]} live yet?`, posted_at: iso((i + 1) * 3_600_000), posted_at_source: 'header',
    posted_on_displayed: null, received_at: iso(i * 3_600_000), status, sentiment: null, source_grade: 'C', source_kind: 'mailbox',
    parse_failed: false, raw_email_cleared_at: null,
  });
  const marketing = [
    ['**/v1/marketing/queue*', () => envelope([reply(0, 'new'), reply(1, 'new'), reply(2, 'triaged'), reply(3, 'drafted'), reply(4, 'answered'), reply(5, 'ignored')])],
    ['**/v1/marketing/summary*', () => envelope({
      counts: { new: 2, triaged: 1, drafted: 1, answered: 1, ignored: 1 },
      oldestUnansweredHours: 5, oldestObservedWaitingHours: 5, oldestSincePostedHours: 6,
      postTimeCoverage: { openRows: 4, withPostTime: 4 }, suspicious: 0, unparsed: 0, quarantined: 0, collisions: 0,
      mailConfigured: true, migrated: true,
    })],
    ['**/v1/marketing/perimeter*', () => envelope({
      embargo: { registerPresent: true, detailWithheld: false, withheldReason: null, entries: [
        { assetSymbol: 'LCX', state: 'embargoed', reviewBy: iso(-14 * day), enteredBy: 'nik', enteredAt: iso(2 * day), eventRef: 'fixture-event', sourceRef: null },
      ] },
      holdings: { registerPresent: true, detailWithheld: false, withheldReason: null, entries: [
        { memberId: 'nik', assetSymbol: 'LCX', holds: true, declaredAt: iso(10 * day), renewBy: iso(-80 * day) },
      ] },
      absenceIsNotClearance: 'A register with no row about an asset is a question, not a clearance.',
      writeActions: ['marketing_embargo_enter', 'marketing_embargo_lift', 'marketing_holdings_declare'],
    })],
  ];

  /* /regulatory-dashboard reads no API on its landing: compiled state data. */
  return { command, sales, intel, distribution, gps, wbr, marketing };
}

/** Every fixture pair, flat — the instrument registers all of them on a desk route (unmatched paths stay aborted). */
export function allDeskFixtures(frozenAtIso) {
  return Object.values(deskFixtures(frozenAtIso)).flat();
}
