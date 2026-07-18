import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* ──────────────────────────────────────────────
 *  projects
 * ────────────────────────────────────────────── */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    name: text('name').notNull(),
    website: text('website'),
    ticker: text('ticker'),
    chain: text('chain'),
    source: text('source').notNull(), // dominant origin: esma_main | esma_casp | esma_emt | potential | pre_tge | pipeline | closed | top100 | manual
    esmaTokenId: text('esma_token_id'),
    dti: text('dti'), // Digital Token Identifier
    jurisdiction: text('jurisdiction'),
    whitepaperUrl: text('whitepaper_url'),
    category: text('category'),
    marketCap: text('market_cap'), // legacy CSV string; typed columns below are authoritative
    listedOnLcx: boolean('listed_on_lcx').default(false).notNull(),
    // Typed market data (bulk enrichment refresh)
    marketCapUsd: numeric('market_cap_usd'),
    marketCapRank: integer('market_cap_rank'),
    volume24hUsd: numeric('volume_24h_usd'),
    priceUsd: numeric('price_usd'),
    priceChange30d: numeric('price_change_30d'),
    tokenAgeDays: integer('token_age_days'),
    lastEnrichedAt: timestamp('last_enriched_at', { withTimezone: true }),
    // Derived filter/blocking keys
    region: text('region'), // eu | us | other
    nameKey: text('name_key'), // squashEntity(name)
    domain: text('domain'), // extractDomain(website)
    tickerNorm: text('ticker_norm'), // cleanTicker(ticker)
    // Denormalized counts (trigger-maintained, see migration 0009)
    peopleCount: integer('people_count').default(0).notNull(),
    verifiedContactCount: integer('verified_contact_count').default(0).notNull(),
    raw: jsonb('raw').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_projects_listed').on(t.listedOnLcx),
    index('idx_projects_name').on(t.name),
    index('idx_projects_source').on(t.source),
    index('idx_projects_ticker').on(t.ticker),
    uniqueIndex('idx_projects_esma_token_id').on(t.esmaTokenId),
    index('idx_projects_created_at').on(t.createdAt),
    index('idx_projects_region').on(t.region),
    index('idx_projects_name_key').on(t.nameKey),
    index('idx_projects_domain').on(t.domain),
    index('idx_projects_ticker_norm').on(t.tickerNorm),
    index('idx_projects_people_count').on(t.peopleCount),
    index('idx_projects_last_enriched').on(t.lastEnrichedAt),
  ],
);

/* ──────────────────────────────────────────────
 *  project_sources — multi-source attribution
 * ────────────────────────────────────────────── */
export const projectSources = pgTable(
  'project_sources',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }), // null until mapped
    source: text('source').notNull(), // esma_main | ... | top100 | coinpaprika | coingecko | defillama | geckoterminal_new | esma_registry
    externalId: text('external_id'), // stable natural key per source
    payload: jsonb('payload').default({}).notNull(),
    contentHash: text('content_hash'),
    status: text('status').default('new').notNull(), // new | mapped | ignored
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
    lastChangedAt: timestamp('last_changed_at', { withTimezone: true }).defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_src_project').on(t.projectId),
    index('idx_src_source').on(t.source),
    uniqueIndex('idx_src_source_external').on(t.source, t.externalId),
    index('idx_src_status').on(t.status),
  ],
);

/* ──────────────────────────────────────────────
 *  job_runs — connector/batch job tracking + incremental cursors
 * ────────────────────────────────────────────── */
export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    jobName: text('job_name').notNull(),
    status: text('status').default('running').notNull(), // running | ok | failed
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    stats: jsonb('stats').default({}).notNull(),
    error: text('error'),
    cursor: jsonb('cursor'),
  },
  (t) => [index('idx_job_runs_name').on(t.jobName, t.startedAt)],
);

/* ──────────────────────────────────────────────
 *  people — contacts
 * ────────────────────────────────────────────── */
export const people = pgTable(
  'people',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    title: text('title'),
    role: text('role').default('other').notNull(),
    linkedin: text('linkedin'),
    email: text('email'),
    emailStatus: text('email_status').default('unverified').notNull(),
    telegram: text('telegram'),
    verified: boolean('verified').default(false).notNull(),
    contactabilityScore: integer('contactability_score').default(0).notNull(),
    linkedinStatus: text('linkedin_status').default('none').notNull(),
    enrichedBy: text('enriched_by').default('manual'),
    raw: jsonb('raw').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_people_project').on(t.projectId),
    index('idx_people_email').on(t.email),
    index('idx_people_role').on(t.role),
  ],
);

/* ──────────────────────────────────────────────
 *  scores — dual EU/US with reason trail
 * ────────────────────────────────────────────── */
export const scores = pgTable(
  'scores',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    euScore: integer('eu_score').default(0).notNull(),
    usPreScore: integer('us_pre_score').default(0).notNull(),
    usPostScore: integer('us_post_score').default(0).notNull(),
    band: text('band').default('unscored').notNull(), // immediate | high | nurture | watch | archive
    reasons: jsonb('reasons').default([]).notNull(),
    recommendedMarket: text('recommended_market').default('none'),
    usIntelSignals: jsonb('us_intel_signals').default({}).notNull(),
    propensityScore: integer('propensity_score').default(0).notNull(),
    propensityReasons: jsonb('propensity_reasons').default([]).notNull(),
    priorityScore: integer('priority_score').default(0).notNull(),
    modelVersion: text('model_version'),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_scores_project').on(t.projectId),
    index('idx_scores_band').on(t.band),
  ],
);

/* ──────────────────────────────────────────────
 *  signals — raw events that may trigger re-score
 * ────────────────────────────────────────────── */
export const signals = pgTable(
  'signals',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    kind: text('kind').notNull(), // enrichment | price_movement | news | outreach_event | manual
    payload: jsonb('payload').default({}).notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_sig_project_kind').on(t.projectId, t.kind)],
);

/* ──────────────────────────────────────────────
 *  outreach_sequences
 * ────────────────────────────────────────────── */
export const outreachSequences = pgTable(
  'outreach_sequences',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
    channel: text('channel').notNull().default('email'), // email | linkedin | telegram
    status: text('status').notNull().default('draft'), // draft | active | paused | completed | handoff
    steps: jsonb('steps').default([]).notNull(),
    currentStep: integer('current_step').default(0).notNull(),
    fromEmail: text('from_email'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    handoffId: text('handoff_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_os_project').on(t.projectId)],
);

/* ──────────────────────────────────────────────
 *  outreach_tasks — assisted-channel touches (LinkedIn/Telegram),
 *  executed by a human via the Send Queue; never auto-sent
 * ────────────────────────────────────────────── */
export const outreachTasks = pgTable(
  'outreach_tasks',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    sequenceId: uuid('sequence_id').references(() => outreachSequences.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
    stepIndex: integer('step_index').notNull(),
    touchIndex: integer('touch_index').notNull(),
    channel: text('channel').notNull(), // linkedin | telegram
    action: text('action').notNull(), // connection_request | message | telegram_dm
    subject: text('subject'),
    body: text('body').notNull(),
    editedBody: text('edited_body'),
    status: text('status').notNull().default('pending'), // pending | sent | skipped
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    sentMessageId: uuid('sent_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('idx_tasks_seq_step').on(t.sequenceId, t.stepIndex),
    index('idx_tasks_status_due').on(t.status, t.dueAt),
    index('idx_tasks_project').on(t.projectId),
  ],
);

/* ──────────────────────────────────────────────
 *  messages — sent email records
 * ────────────────────────────────────────────── */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    sequenceId: uuid('sequence_id').references(() => outreachSequences.id, { onDelete: 'set null' }),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    stepIndex: integer('step_index').default(0).notNull(),
    touchIndex: integer('touch_index').default(1).notNull(),
    toEmail: text('to_email').notNull(),
    toName: text('to_name'),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    provider: text('provider').notNull().default('resend'),
    providerMessageId: text('provider_message_id'),
    status: text('status').notNull().default('pending'),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    bouncedAt: timestamp('bounced_at', { withTimezone: true }),
    complainedAt: timestamp('complained_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_messages_project').on(t.projectId),
    index('idx_messages_sequence').on(t.sequenceId),
    index('idx_messages_status').on(t.status),
  ],
);

/* ──────────────────────────────────────────────
 *  sequence_enrollments
 * ────────────────────────────────────────────── */
export const linkedinUsage = pgTable(
  'linkedin_usage',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    date: text('date').notNull().default(sql`CURRENT_DATE`),
    action: text('action').notNull(),
    count: integer('count').default(0).notNull(),
    weekStart: text('week_start').notNull().default(sql`(date_trunc('week', CURRENT_DATE)::date)`),
  },
  (t) => [index('idx_lu_date_action').on(t.date, t.action)],
);

export const sequenceEnrollments = pgTable(
  'sequence_enrollments',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    sequenceId: uuid('sequence_id')
      .references(() => outreachSequences.id, { onDelete: 'cascade' })
      .notNull(),
    enrolledBy: text('enrolled_by').notNull().default('operator'),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).defaultNow().notNull(),
    status: text('status').notNull().default('active'),
    providerCampaignId: text('provider_campaign_id'),
    provider: text('provider').default('internal'),
  },
  (t) => [
    index('idx_enrollments_project').on(t.projectId),
    index('idx_enrollments_sequence').on(t.sequenceId),
  ],
);

/* ──────────────────────────────────────────────
 *  deals — stub pipeline
 * ────────────────────────────────────────────── */
export const deals = pgTable(
  'deals',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    stage: text('stage').notNull().default('not_started'), // contacted | discovery | proposal | negotiating | won | lost
    packageType: text('package_type').default('listing'), // listing | marketing | liquidity | dual | emt | custom
    packageValue: integer('package_value'), // cents or USD (whole dollars * 100)
    proposalSnapshot: jsonb('proposal_snapshot'),
    proposalGeneratedAt: timestamp('proposal_generated_at', { withTimezone: true }),
    winReason: text('win_reason'),
    lossReason: text('loss_reason'),
    lossCategory: text('loss_category'),
    handoffId: uuid('handoff_id'),
    owner: text('owner').default('operator'),
    notes: text('notes'),
    wonAt: timestamp('won_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_deals_project').on(t.projectId), index('idx_deals_stage').on(t.stage)],
);

export const dealEvents = pgTable(
  'deal_events',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'cascade' }).notNull(),
    eventType: text('event_type').notNull(),
    actor: text('actor').notNull().default('operator'),
    oldStage: text('old_stage'),
    newStage: text('new_stage'),
    content: text('content'),
    meta: jsonb('meta').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_deal_events_deal').on(t.dealId)],
);

export const dealObjections = pgTable(
  'deal_objections',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'cascade' }).notNull(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    severity: text('severity').notNull().default('medium'),
    resolved: boolean('resolved').default(false).notNull(),
    resolution: text('resolution'),
    raisedBy: text('raised_by').default('operator'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('idx_deal_objections_deal').on(t.dealId)],
);

/* ──────────────────────────────────────────────
 *  suppression — opt-out / bounce
 * ────────────────────────────────────────────── */
export const suppression = pgTable(
  'suppression',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    email: text('email'),
    linkedin: text('linkedin'),
    reason: text('reason'), // bounce | complaint | unsubscribe | manual
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_supp_email').on(t.email)],
);

/* ──────────────────────────────────────────────
 *  audit_log — compliance trail
 * ────────────────────────────────────────────── */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    actor: text('actor').notNull().default('system'), // operator | system | seed
    action: text('action').notNull(), // project_created | project_merged | score_computed | outreach_paused | etc.
    entity: text('entity'), // projects | scores | deals | outreach_sequences | suppression
    entityId: text('entity_id'),
    meta: jsonb('meta').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_audit_entity').on(t.entity, t.entityId), index('idx_audit_actor')],
);

/* ──────────────────────────────────────────────
 *  drafts — saved operator drafts
 * ────────────────────────────────────────────── */
export const drafts = pgTable(
  'drafts',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    contactName: text('contact_name').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    channel: text('channel').notNull().default('email'),
    touchIndex: integer('touch_index').default(1).notNull(),
    claimsUsed: jsonb('claims_used').default([]).notNull(),
    requiresHumanReview: boolean('requires_human_review').default(false).notNull(),
    operatorEdited: boolean('operator_edited').default(false).notNull(),
    approved: boolean('approved').default(false).notNull(),
    sent: boolean('sent').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_drafts_project').on(t.projectId),
    index('idx_drafts_sent').on(t.sent),
  ],
);

/* ──────────────────────────────────────────────
 *  handoffs — human takeover when reply detected
 * ────────────────────────────────────────────── */
export const handoffs = pgTable(
  'handoffs',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
    personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
    channel: text('channel').notNull().default('email'),
    triggerMessageId: uuid('trigger_message_id').references(() => messages.id, { onDelete: 'set null' }),
    triggerReason: text('trigger_reason').notNull().default('reply'),
    status: text('status').notNull().default('open'),
    assignedTo: text('assigned_to'),
    summary: text('summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_handoffs_project').on(t.projectId),
    index('idx_handoffs_status').on(t.status),
    index('idx_handoffs_assigned').on(t.assignedTo),
  ],
);

export const handoffEvents = pgTable(
  'handoff_events',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    handoffId: uuid('handoff_id').references(() => handoffs.id, { onDelete: 'cascade' }).notNull(),
    eventType: text('event_type').notNull(),
    actor: text('actor').notNull().default('system'),
    content: text('content'),
    oldStatus: text('old_status'),
    newStatus: text('new_status'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_he_handoff').on(t.handoffId),
    index('idx_he_type').on(t.eventType),
  ],
);

/* ──────────────────────────────────────────────
 *  kpi_daily_snapshots
 * ────────────────────────────────────────────── */
export const kpiDailySnapshots = pgTable(
  'kpi_daily_snapshots',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    snapshotDate: text('snapshot_date').notNull().default(sql`CURRENT_DATE`),
    newHighScoreLeadsWeek: integer('new_high_score_leads_week').default(0),
    replyRateEmailSent: integer('reply_rate_email_sent').default(0),
    replyRateEmailReplied: integer('reply_rate_email_replied').default(0),
    replyRateLinkedinSent: integer('reply_rate_linkedin_sent').default(0),
    replyRateLinkedinReplied: integer('reply_rate_linkedin_replied').default(0),
    avgHoursFirstTouchToHandoff: integer('avg_hours_first_touch_to_handoff'),
    avgHoursHandoffToProposal: integer('avg_hours_handoff_to_proposal'),
    avgHoursProposalToWon: integer('avg_hours_proposal_to_won'),
    funnelEnrolled: integer('funnel_enrolled').default(0),
    funnelReplied: integer('funnel_replied').default(0),
    funnelProposal: integer('funnel_proposal').default(0),
    funnelWon: integer('funnel_won').default(0),
    revenueListing: integer('revenue_listing').default(0),
    revenueMarketing: integer('revenue_marketing').default(0),
    revenueLiquidity: integer('revenue_liquidity').default(0),
    revenueDual: integer('revenue_dual').default(0),
    revenueEmt: integer('revenue_emt').default(0),
    revenueCustom: integer('revenue_custom').default(0),
    topObjections: jsonb('top_objections').default([]),
    stalledDealCount: integer('stalled_deal_count').default(0),
    totalWon: integer('total_won').default(0),
    withExpansion: integer('with_expansion').default(0),
    expansionRevenue: integer('expansion_revenue').default(0),
    hotDeals: integer('hot_deals').default(0),
    stalledDeals: integer('stalled_deals').default(0),
    overdueActions: integer('overdue_actions').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_kpi_snapshots_date').on(t.snapshotDate),
  ],
);

/* ──────────────────────────────────────────────
 *  post_listing_triggers
 * ────────────────────────────────────────────── */
export const postListingTriggers = pgTable(
  'post_listing_triggers',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    dealId: uuid('deal_id').notNull().references(() => deals.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    triggerDay: integer('trigger_day').notNull(),
    triggerType: text('trigger_type').notNull(),
    status: text('status').notNull().default('pending'),
    draftContent: text('draft_content'),
    taskSummary: text('task_summary'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_triggers_deal').on(t.dealId),
    index('idx_triggers_due').on(t.dueAt),
    index('idx_triggers_status').on(t.status),
  ],
);

/* ──────────────────────────────────────────────
 *  discovery_jobs — contact discovery crawl queue
 * ────────────────────────────────────────────── */
export const discoveryJobs = pgTable(
  'discovery_jobs',
  {
    id: uuid('id')
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').default('pending').notNull(), // pending | running | done | failed | blocked_robots
    attempts: integer('attempts').default(0).notNull(),
    error: text('error'),
    result: jsonb('result').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('idx_djobs_status').on(t.status)],
);

/* ──────────────────────────────────────────────
 *  Wave 0 — the intelligence spine (migration 0029)
 * ────────────────────────────────────────────── */

/** orgs — tenancy seam. Default LCX org id is fixed (see DEFAULT_ORG_ID). */
export const orgs = pgTable('orgs', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('idx_orgs_slug').on(t.slug)]);

/** observations — provenance spine: every fact carries source/reliability/confidence. */
export const observations = pgTable('observations', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  orgId: uuid('org_id').notNull().default('11111111-1111-1111-1111-111111111111'),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  predicate: text('predicate').notNull(),
  valueJson: jsonb('value_json').default({}).notNull(),
  valueNum: numeric('value_num'),
  unit: text('unit'),
  source: text('source').notNull(),
  sourceUrl: text('source_url'),
  reliability: text('reliability').default('C').notNull(),
  credibility: integer('credibility').default(3).notNull(),
  confidence: integer('confidence').default(50).notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).defaultNow().notNull(),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow().notNull(),
  jobRunId: uuid('job_run_id'),
  actor: text('actor'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_obs_subject').on(t.subjectType, t.subjectId),
  index('idx_obs_pred').on(t.subjectType, t.subjectId, t.predicate, t.observedAt),
  index('idx_obs_source').on(t.source),
  index('idx_obs_predicate').on(t.predicate),
]);

/** object_actions — governed action ledger (complements the hash-chained audit_log). */
export const objectActions = pgTable('object_actions', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  orgId: uuid('org_id').notNull().default('11111111-1111-1111-1111-111111111111'),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  action: text('action').notNull(),
  params: jsonb('params').default({}).notNull(),
  result: jsonb('result').default({}).notNull(),
  actor: text('actor').default('operator').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_oact_subject').on(t.subjectType, t.subjectId, t.createdAt),
  index('idx_oact_action').on(t.action),
]);

/** watchlist — a per-org pin on any ontology object (first Action target). */
export const watchlist = pgTable('watchlist', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  orgId: uuid('org_id').notNull().default('11111111-1111-1111-1111-111111111111'),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  note: text('note'),
  addedBy: text('added_by').default('operator').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('idx_watchlist_uniq').on(t.orgId, t.subjectType, t.subjectId),
  index('idx_watchlist_subject').on(t.subjectType, t.subjectId),
]);

/* ──────────────────────────────────────────────
 *  Wave 1 — the collection apparatus (migration 0030)
 * ────────────────────────────────────────────── */

/** project_identifiers — resolved external handles that target the free connectors. */
export const projectIdentifiers = pgTable('project_identifiers', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  kind: text('kind').notNull(),
  value: text('value').notNull(),
  source: text('source').default('internal').notNull(),
  confidence: integer('confidence').default(60).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('idx_pid_project_kind').on(t.projectId, t.kind),
  index('idx_pid_project').on(t.projectId),
  index('idx_pid_kind_value').on(t.kind, t.value),
]);

/** model_calibrations — Wave 6 learning-loop snapshots (how well each score predicted wins). */
export const modelCalibrations = pgTable('model_calibrations', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  orgId: uuid('org_id').notNull().default('11111111-1111-1111-1111-111111111111'),
  snapshotDate: text('snapshot_date').notNull().default(sql`(CURRENT_DATE::text)`),
  metricKey: text('metric_key').notNull(),
  kind: text('kind').default('score').notNull(),
  lift: numeric('lift'),
  quintileCapture: numeric('quintile_capture'),
  wonMedian: numeric('won_median'),
  universeMedian: numeric('universe_median'),
  sampleWon: integer('sample_won').default(0).notNull(),
  sampleUniverse: integer('sample_universe').default(0).notNull(),
  meta: jsonb('meta').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_calib_metric_date').on(t.metricKey, t.snapshotDate),
  index('idx_calib_date').on(t.snapshotDate),
]);

/** collection_state — per (object, source) freshness + intelligence-gap ledger. */
export const collectionState = pgTable('collection_state', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  source: text('source').notNull(),
  status: text('status').default('pending').notNull(),
  lastOkAt: timestamp('last_ok_at', { withTimezone: true }),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  lastError: text('last_error'),
  runs: integer('runs').default(0).notNull(),
  nextDueAt: timestamp('next_due_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('idx_cstate_uniq').on(t.subjectType, t.subjectId, t.source),
  index('idx_cstate_source_due').on(t.source, t.nextDueAt),
  index('idx_cstate_subject').on(t.subjectType, t.subjectId),
  index('idx_cstate_status').on(t.status),
]);
