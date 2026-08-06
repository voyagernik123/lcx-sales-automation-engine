import { Hono } from 'hono';
import { sql, desc, and, eq } from 'drizzle-orm';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { env } from '../lib/env.js';
import { randomUUID } from 'node:crypto';
import { STAGES, canTransition, generateProposal, defaultPackageValue, getClaimLibrarySnapshot } from '@lcx/shared';
import type { DealStage } from '@lcx/shared';
import { createPostListingTriggers } from '../kpi/service.js';
import { createStageTask } from '../tasks/service.js';
import { createLaunchpadTasks } from '../tasks/launchpad.js';
import { notify } from '../notifications/service.js';
import { isUndefinedColumn } from '../lib/pg.js';

export const dealRoutes = new Hono<{ Variables: AuthVariables }>();

/** Valid deal-playbook step codes (Terms, KYB, Legal, Contract, Onboarding). */
const PLAYBOOK_STEPS = ['T', 'K', 'L', 'C', 'O'] as const;

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE BOOK — where a price comes from now                                         */
/* ══════════════════════════════════════════════════════════════════════════════ */

/**
 * LCX's closed contracts, joined to their projects' market features.
 *
 * WRITTEN WITH DRIZZLE, DELIBERATELY. `listing_labels` was absent from `db/schema.ts`
 * and every existing reader uses raw SQL (`labels/extract.ts:128`, `calibrate.ts:35`),
 * so declaring the table buys those nothing. It buys THIS query something real: a
 * mistyped column here does not become a wrong price, it becomes a compile error. That
 * is the only reason the declaration was worth adding.
 *
 * `source = 'closed'` AND `outcome = 'won'` — a closed row is a contract that was
 * signed. `stage_changed_at` is the closest thing the CRM export carries to a close
 * date; the mark engine derives its window from whichever rows actually have one and
 * says `unknown_no_dated_comparable` when none do, rather than borrowing a span.
 *
 * `liquidity_amount_usd` IS NOT SELECTED. It is not a fee. The column is right there on
 * the table and one careless line from re-entering the book — see the table comment in
 * `db/schema.ts`.
 *
 * NUMERIC comes back from pg as a string, so every money and market figure is converted
 * explicitly. `Number('')` is 0, which would be a fabricated zero, so blank goes to null.
 */
function num(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function loadClosedBook(db: ReturnType<typeof getDb>): Promise<{
  comparables: {
    recordName: string;
    listingFeeUsd: number | null;
    marketingFeeUsd: number | null;
    marketCapUsd: number | null;
    volume24hUsd: number | null;
    category: string | null;
    chain: string | null;
    closedAt: string | null;
  }[];
  /** Non-null ⇒ the book could not be READ. Not the same as the book being empty. */
  unreadableReason: string | null;
}> {
  try {
    const rows = await db
      .select({
        recordName: schema.listingLabels.recordName,
        listingFeeUsd: schema.listingLabels.listingFeeUsd,
        marketingFeeUsd: schema.listingLabels.marketingFeeUsd,
        closedAt: schema.listingLabels.stageChangedAt,
        marketCapUsd: schema.projects.marketCapUsd,
        volume24hUsd: schema.projects.volume24hUsd,
        category: schema.projects.category,
        chain: schema.projects.chain,
      })
      .from(schema.listingLabels)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.listingLabels.projectId))
      .where(and(eq(schema.listingLabels.source, 'closed'), eq(schema.listingLabels.outcome, 'won')))
      .execute();

    return {
      unreadableReason: null,
      comparables: rows.map((r) => ({
        recordName: r.recordName,
        listingFeeUsd: num(r.listingFeeUsd),
        marketingFeeUsd: num(r.marketingFeeUsd),
        marketCapUsd: num(r.marketCapUsd),
        volume24hUsd: num(r.volume24hUsd),
        category: r.category,
        chain: r.chain,
        closedAt: r.closedAt instanceof Date ? r.closedAt.toISOString() : r.closedAt ?? null,
      })),
    };
  } catch (err) {
    // A failed read must not answer the same way as an empty book. The engine emits
    // MARK_COMPARABLE_BOOK_UNREADABLE for this and never a stratum count.
    console.error('[deals] closed-book read failed:', err);
    return { comparables: [], unreadableReason: err instanceof Error ? err.message : 'unknown read failure' };
  }
}

/**
 * The project being priced, as the mark engine needs to see it.
 *
 * Every field may legitimately be absent. On production only 318 of 810 joined label
 * rows carry `market_cap_usd` and only 89 carry `projects.category`, so most targets
 * will fail to resolve a stratum and be refused — which is the correct answer, not a
 * bug to route around.
 */
function targetOf(project: { marketCapUsd: unknown; volume24hUsd: unknown; category: string | null; chain: string | null }) {
  return {
    marketCapUsd: num(project.marketCapUsd),
    volume24hUsd: num(project.volume24hUsd),
    category: project.category,
    chain: project.chain,
  };
}

/** The book input the shared quoting functions take. `env.databaseUrl` is stripped of
 *  credentials by `environmentLabelFromDatabaseUrl` before anything is persisted. */
async function bookFor(
  db: ReturnType<typeof getDb>,
  project: { marketCapUsd: unknown; volume24hUsd: unknown; category: string | null; chain: string | null },
) {
  const { comparables, unreadableReason } = await loadClosedBook(db);
  return {
    target: targetOf(project),
    comparables,
    databaseUrl: env.databaseUrl,
    bookUnreadableReason: unreadableReason,
  };
}

/**
 * Refusals as an operator reads them: the code, the sentence, the rule cited — AND THE
 * ENVIRONMENT.
 *
 * `environment` was being dropped here. `MarkRefusal` carries that field for one reason,
 * stated in `marks/mark.ts`: an earlier pass reported laptop numbers as LCX's book. This
 * function mapped every other field and silently discarded the one the lane is named
 * after, so every refusal that reached the desk was unlabelled and the only surviving
 * copy was inside `stratumCensus`. `null` is a real answer here — it means no database
 * was involved (a package-type or hand-price refusal) or the connection string could not
 * be parsed — and it is NOT the word 'unknown'.
 */
function refusalPayload(refusals: readonly { code: string; sentence: string; rule: { provision: string; text: string }; stratum: unknown; stratumN: number | null; environment: string | null }[]) {
  return refusals.map((r) => ({
    code: r.code,
    sentence: r.sentence,
    rule: { provision: r.rule.provision, text: r.rule.text },
    stratum: r.stratum,
    stratumN: r.stratumN,
    environment: r.environment,
  }));
}

/**
 * GET /v1/deals/:id/playbook — completed playbook steps for a deal.
 * Reads deals.playbook->'done' (migration 0028). When the column is missing
 * (production lagging the migration) degrades to 200 { done: [], persisted: false }.
 */
dealRoutes.get('/:id/playbook', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();

  try {
    const result = await db.execute(sql`SELECT playbook FROM deals WHERE id = ${id}`);
    if (!result.rows || result.rows.length === 0) {
      return c.json({ error: 'Deal not found', code: 'NOT_FOUND' }, 404);
    }
    const playbook = ((result.rows[0] as Record<string, unknown>).playbook ?? {}) as { done?: unknown };
    const done = Array.isArray(playbook.done)
      ? playbook.done.filter((s): s is string => typeof s === 'string')
      : [];
    return c.json({ data: { done }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    if (isUndefinedColumn(err)) {
      return c.json({ data: { done: [], persisted: false }, meta: { timestamp: new Date().toISOString(), version: env.version } });
    }
    throw err; // onError maps pg codes (bad UUID → 400 etc.)
  }
});

/**
 * PATCH /v1/deals/:id/playbook — set completed playbook steps.
 * Body: { done: string[] } — subset of T/K/L/C/O. When the playbook column is
 * missing → 409 PLAYBOOK_UNAVAILABLE (nothing to persist to).
 */
dealRoutes.patch('/:id/playbook', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const operator = c.get('operator');
  const body = await c.req.json<{ done?: unknown }>().catch(() => ({} as { done?: unknown }));

  if (!Array.isArray(body.done) || body.done.some((s) => typeof s !== 'string')) {
    return c.json({ error: 'done must be an array of step codes', code: 'VALIDATION' }, 400);
  }
  const done = Array.from(new Set(body.done as string[]));
  const invalid = done.filter((s) => !(PLAYBOOK_STEPS as readonly string[]).includes(s));
  if (invalid.length > 0) {
    return c.json({
      error: `Invalid step code(s): ${invalid.join(', ')} — allowed: ${PLAYBOOK_STEPS.join(', ')}`,
      code: 'VALIDATION',
    }, 400);
  }

  try {
    const result = await db.execute(sql`
      UPDATE deals
      SET playbook = COALESCE(playbook, '{}'::jsonb) || jsonb_build_object('done', ${JSON.stringify(done)}::jsonb)
      WHERE id = ${id}
      RETURNING id
    `);
    if (!result.rows || result.rows.length === 0) {
      return c.json({ error: 'Deal not found', code: 'NOT_FOUND' }, 404);
    }

    await db.insert(schema.auditLog).values({
      id: randomUUID(), actor: operator.id, action: 'deal_playbook_updated', entity: 'deals', entityId: id,
      meta: { done },
    }).execute();

    return c.json({ data: { done }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    if (isUndefinedColumn(err)) {
      return c.json({ error: 'Playbook column not available yet', code: 'PLAYBOOK_UNAVAILABLE' }, 409);
    }
    throw err; // onError maps pg codes (bad UUID → 400 etc.)
  }
});


/** GET /v1/deals/board — every deal with project context, for the kanban board. */
dealRoutes.get('/board', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      SELECT d.id, d.project_id, d.stage, d.package_type, d.package_value,
             d.owner, d.notes, d.updated_at, d.created_at, d.won_at,
             p.name AS project_name, p.ticker AS project_ticker,
             s.band, s.priority_score,
             EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400 AS days_since_update
      FROM deals d
      JOIN projects p ON p.id = d.project_id
      LEFT JOIN scores s ON s.project_id = d.project_id
      ORDER BY d.updated_at DESC
    `);
    return c.json({
      data: (result.rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        projectId: r.project_id,
        projectName: r.project_name,
        projectTicker: r.project_ticker,
        stage: r.stage,
        packageType: r.package_type,
        packageValue: r.package_value != null ? Number(r.package_value) : null,
        owner: r.owner,
        band: r.band ?? 'unscored',
        priorityScore: Number(r.priority_score ?? 0),
        daysSinceUpdate: Math.floor(Number(r.days_since_update ?? 0)),
        updatedAt: r.updated_at,
        wonAt: r.won_at,
      })),
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[deals] board error:', err);
    return c.json({ error: 'Failed to load board', code: 'BOARD_ERROR' }, 500);
  }
});

dealRoutes.get('/projects/:projectId', requireOperator, async (c) => {
  const db = getDb();
  const { projectId } = c.req.param();
  try {
    const [deal] = await db.select().from(schema.deals).where(sql`${schema.deals.projectId} = ${projectId}`).limit(1).execute();
    if (!deal) return c.json({ data: null, meta: { timestamp: new Date().toISOString(), version: env.version } });
    return c.json({ data: deal, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] get error:', err);
    return c.json({ error: 'Failed to get deal', code: 'DEAL_GET_ERROR' }, 500);
  }
});

dealRoutes.post('/projects/:projectId', requireOperator, async (c) => {
  const db = getDb();
  const { projectId } = c.req.param();
  const body = await c.req.json<{ packageType?: string; packageValue?: number }>();
  const pkgType = body.packageType ?? 'listing';

  if (body.packageValue !== undefined &&
      (typeof body.packageValue !== 'number' || !Number.isFinite(body.packageValue) || body.packageValue < 0)) {
    return c.json({ error: 'packageValue must be a non-negative number', code: 'VALIDATION' }, 400);
  }

  try {
    const [existing] = await db.select().from(schema.deals).where(sql`${schema.deals.projectId} = ${projectId}`).limit(1).execute();
    if (existing) return c.json({ error: 'Deal already exists', code: 'DEAL_EXISTS' }, 409);

    const [project] = await db.select().from(schema.projects).where(sql`${schema.projects.id} = ${projectId}`).limit(1).execute();
    if (!project) return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);

    /*
     * THE OPENING NUMBER.
     *
     * Was `body.packageValue ?? defaultPackageValue(pkgType)`, and that fallback was a
     * hardcoded $20,000 — 60% above LCX's real median fee of $12,500. It is now a mark
     * against the closed book, or nothing.
     *
     * A REFUSAL LEAVES `package_value` NULL. It does not become 0 and the creation does
     * not fail: opening a deal before it has a price is ordinary commercial sequence,
     * and the column is nullable (0006/0033). What must not happen is a number appearing
     * with no contract behind it. The refusals ride back in `meta` so the desk sees why
     * the field is empty and what would fill it, rather than an unexplained blank.
     */
    const quote = body.packageValue !== undefined
      ? null
      : defaultPackageValue(pkgType, await bookFor(db, project));
    const pkgValue = body.packageValue !== undefined
      ? body.packageValue
      : quote?.kind === 'quoted' ? quote.valueCents : null;

    const priceNote = body.packageValue !== undefined
      ? `operator-supplied $${(body.packageValue / 100).toLocaleString('en-US')}`
      : quote?.kind === 'quoted'
        ? `marked at $${(quote.valueCents / 100).toLocaleString('en-US')} from ${quote.frame.stratumN} `
          + `comparable closed contracts on ${quote.frame.environment}`
        : `UNPRICED — ${quote?.refusals.map((r) => r.code).join(', ') ?? 'no mark'}`;

    // Deal row + its creation event commit together (or not at all) — no deal
    // without its opening history entry.
    const [deal] = await db.transaction(async (tx) => {
      const rows = await tx.insert(schema.deals).values({
        id: randomUUID(), projectId, stage: 'not_started', packageType: pkgType, packageValue: pkgValue,
      }).returning().execute();
      await tx.insert(schema.dealEvents).values({
        id: randomUUID(), dealId: rows[0].id, eventType: 'stage_change', actor: 'system', newStage: 'not_started',
        content: `Deal created — ${priceNote}`,
        // The frame, or the refusals, on the record from the first event. A price whose
        // provenance is only in a log line is a price nobody can defend later.
        meta: quote == null
          ? { priceSource: 'operator_supplied' }
          : quote.kind === 'quoted'
            ? { priceSource: 'mark_to_contract', frame: quote.frame }
            : { priceSource: 'refused', refusals: refusalPayload(quote.refusals) },
      }).execute();
      return rows;
    });

    return c.json({
      data: deal,
      meta: {
        timestamp: new Date().toISOString(),
        version: env.version,
        ...(quote == null ? {} : quote.kind === 'quoted'
          ? { priceSource: 'mark_to_contract', mark: quote.frame }
          : { priceSource: 'refused', refusals: refusalPayload(quote.refusals), stratumCensus: quote.census }),
      },
    }, 201);
  } catch (err) {
    console.error('[deals] create error:', err);
    return c.json({ error: 'Failed to create deal', code: 'DEAL_CREATE_ERROR' }, 500);
  }
});

dealRoutes.patch('/:id', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const body = await c.req.json<{ packageType?: string; packageValue?: number; notes?: string; owner?: string }>();

  try {
    const [deal] = await db.select().from(schema.deals).where(sql`${schema.deals.id} = ${id}`).limit(1).execute();
    if (!deal) return c.json({ error: 'Deal not found', code: 'NOT_FOUND' }, 404);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.packageType) update.packageType = body.packageType;
    if (body.packageValue !== undefined) {
      // Money is integer cents — never trust the client's clamp. Reject
      // NaN / negative / non-integer / absurd values rather than corrupt it.
      const v = body.packageValue;
      if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v) || v > 1_000_000_000_00) {
        return c.json({ error: 'packageValue must be a non-negative integer (cents)', code: 'INVALID_VALUE' }, 400);
      }
      update.packageValue = v;
    }
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.owner) update.owner = body.owner;

    const [updated] = await db.update(schema.deals).set(update).where(sql`${schema.deals.id} = ${id}`).returning().execute();

    return c.json({ data: updated, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] update error:', err);
    return c.json({ error: 'Failed to update deal', code: 'DEAL_UPDATE_ERROR' }, 500);
  }
});

dealRoutes.post('/:id/stage', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const operator = c.get('operator');
  const body = await c.req.json<{ stage: DealStage; winReason?: string; lossReason?: string; lossCategory?: string; overridePremortem?: boolean; overrideReason?: string }>();
  const newStage = body.stage;

  if (!STAGES.includes(newStage)) return c.json({ error: `Invalid stage: ${newStage}`, code: 'INVALID_STAGE' }, 400);

  try {
    const [deal] = await db.select().from(schema.deals).where(sql`${schema.deals.id} = ${id}`).limit(1).execute();
    if (!deal) return c.json({ error: 'Deal not found', code: 'NOT_FOUND' }, 404);

    const oldStage = deal.stage as DealStage;
    if (!canTransition(oldStage, newStage)) {
      return c.json({ error: `Cannot transition from ${oldStage} to ${newStage}`, code: 'INVALID_TRANSITION' }, 400);
    }

    // Premortem gate (Phase 2.3): a high-value deal can't close out of
    // negotiating without a structured premortem — governance meets tradecraft.
    // Soft-block: the desk can override with a reason, which is audited.
    /*
     * `?? 0` IS GONE FROM THE GATE'S CONDITION, WITHOUT CHANGING WHAT THE GATE DOES.
     *
     * `(deal.packageValue ?? 0) > THRESHOLD` read an ABSENT price as $0 and therefore as
     * "below the gate". Since a refused mark now leaves `package_value` NULL — which the
     * builder expects to be the common case — that collapse would have become the normal
     * path through this control, with the inference invisible.
     *
     * The behaviour is deliberately IDENTICAL: an unpriced deal is still not blocked. What
     * changed is that it is not blocked because there is no value to test, which is stated,
     * rather than because absence was silently ranked below $25,000. Whether an UNPRICED
     * close should require a premortem is a governance decision for the desk and is named
     * in this lane's handover, not decided here.
     */
    const PREMORTEM_THRESHOLD_CENTS = 2_500_000; // $25k
    let premortemOverridden = false;
    if (oldStage === 'negotiating' && newStage === 'won'
      && deal.packageValue != null && deal.packageValue > PREMORTEM_THRESHOLD_CENTS) {
      const { hasActivePremortem } = await import('./reviews.js');
      const covered = await hasActivePremortem(id, deal.projectId);
      if (!covered) {
        if (!body.overridePremortem) {
          return c.json({
            error: 'A premortem is required before closing a deal over $25k. Add one on the deal, or override with a reason.',
            code: 'PREMORTEM_REQUIRED',
          }, 409);
        }
        if (!body.overrideReason?.trim()) {
          return c.json({ error: 'Override requires a reason.', code: 'OVERRIDE_REASON_REQUIRED' }, 400);
        }
        premortemOverridden = true;
      }
    }

    // Win/loss reason required on close
    if (newStage === 'won' && !body.winReason?.trim()) return c.json({ error: 'Win reason required', code: 'MISSING_REASON' }, 400);
    if (newStage === 'lost' && !body.lossReason?.trim()) return c.json({ error: 'Loss reason required', code: 'MISSING_REASON' }, 400);

    const update: Record<string, unknown> = { stage: newStage, updatedAt: new Date() };
    if (newStage === 'won') {
      update.wonAt = new Date();
      update.winReason = body.winReason;
    }
    if (newStage === 'lost') {
      update.lossReason = body.lossReason;
      update.lossCategory = body.lossCategory ?? null;
    }

    // A close (out of negotiating) is a consequential call: capture a decision
    // memo in the same transaction so the institutional log is guaranteed to
    // have it (Phase 4.2 acceptance: every stage-advance past negotiating has
    // a memo). Prefilled from context; the desk can enrich it later on /decisions.
    const closingPastNegotiating = oldStage === 'negotiating' && (newStage === 'won' || newStage === 'lost');

    /*
     * WHY THIS DEAL HAS NO PRICE, read BEFORE the transaction opens.
     *
     * It feeds the `decisions` row below, where an absent value used to be written as
     * "$0". It is a plain read and it is deliberately NOT inside the transaction: a
     * failed statement inside a pg transaction aborts the whole thing, so a catch here
     * would swallow the JS error and every later statement in the close would then fail
     * with "current transaction is aborted" — the close would be lost to a lookup that
     * only supplies context.
     */
    let unpricedBecause: string[] = [];
    if (closingPastNegotiating && deal.packageValue == null) {
      try {
        const ev = await db.execute(sql`
          SELECT meta FROM deal_events
          WHERE deal_id = ${id} AND meta->>'priceSource' = 'refused'
          ORDER BY created_at DESC LIMIT 1
        `);
        const meta = ((ev.rows?.[0] ?? {}) as { meta?: { refusals?: { code?: unknown }[] } }).meta;
        unpricedBecause = (meta?.refusals ?? [])
          .map((r) => (typeof r.code === 'string' ? r.code : null))
          .filter((s): s is string => s != null);
      } catch (refErr) {
        // The codes are context. Their absence must not become a fabricated price, and
        // must not block a legitimate close.
        console.error('[deals] refusal-code lookup for the decision record failed:', refErr instanceof Error ? refErr.message : refErr);
      }
    }

    // Core state change is ATOMIC: project flag (won), the deal row, the
    // stage-change event, the audit entry, and the decision memo commit together
    // or not at all — no half-closed deal with a missing history/audit/decision.
    const [updated] = await db.transaction(async (tx) => {
      if (newStage === 'won') {
        await tx.update(schema.projects).set({ listedOnLcx: true, updatedAt: new Date() }).where(sql`${schema.projects.id} = ${deal.projectId}`).execute();
      }
      const rows = await tx.update(schema.deals).set(update).where(sql`${schema.deals.id} = ${id}`).returning().execute();
      await tx.insert(schema.dealEvents).values({
        id: randomUUID(), dealId: id, eventType: 'stage_change', actor: operator.id,
        oldStage, newStage, content: `${oldStage} → ${newStage}`,
      }).execute();
      await tx.insert(schema.auditLog).values({
        id: randomUUID(), actor: operator.id, action: 'deal_stage_change', entity: 'deals', entityId: id,
        meta: { from: oldStage, to: newStage },
      }).execute();
      if (premortemOverridden) {
        await tx.insert(schema.auditLog).values({
          id: randomUUID(), actor: operator.id, action: 'premortem_gate_override', entity: 'deals', entityId: id,
          meta: { reason: body.overrideReason, packageValue: deal.packageValue },
        }).execute();
      }
      if (closingPastNegotiating) {
        const projName = await tx.execute(sql`SELECT name, ticker FROM projects WHERE id = ${deal.projectId} LIMIT 1`)
          .then((r) => {
            const row = (r.rows?.[0] ?? {}) as { name?: string; ticker?: string };
            return row.ticker ? `${row.name} (${row.ticker})` : (row.name ?? 'the deal');
          })
          .catch(() => 'the deal');
        const reason = (newStage === 'won' ? body.winReason : body.lossReason)?.trim() ?? '';

        /*
         * ══ A WON CONTRACT WAS BEING RECORDED FOREVER AS WORTH ZERO DOLLARS ══
         *
         * This line was
         *   const valueUsd = Math.round((deal.packageValue ?? 0) / 100).toLocaleString('en-US');
         * interpolated below as `$${valueUsd}`. A deal whose mark REFUSED carries
         * `package_value = NULL`, so the `?? 0` wrote the literal string "$0" into a
         * `decisions` row — a PERMANENT institutional record, not a screen that can be
         * re-rendered — saying a closed contract was worth nothing. It is the worst place
         * in this lane for an absence to become a zero, and it is inside the lane's own
         * file.
         *
         * An unmarked value now says so, and the record names WHY it is absent: the
         * refusal codes from the deal's own creation event, so a reader of the decision a
         * year from now can tell "nobody priced this" from "this closed at zero".
         */
        const valueClause = deal.packageValue != null
          ? `$${Math.round(deal.packageValue / 100).toLocaleString('en-US')}`
          : 'VALUE NOT MARKED — no price was ever derived from LCX\'s closed book for this deal'
            + (unpricedBecause.length > 0 ? ` (${unpricedBecause.join(', ')})` : '')
            + ', and this record does not substitute one';
        // Won deals get a +90d review (did the listing perform?); losses need none.
        const reviewBy = newStage === 'won' ? new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10) : null;
        // Wrapped in a SAVEPOINT: if the decisions table isn't present yet
        // (prod lagging migration 0039), only this savepoint rolls back — the
        // deal close still commits. Migrations degrade gracefully by design.
        try {
          await tx.transaction(async (tx2) => {
            await tx2.execute(sql`
              INSERT INTO decisions (title, context, decision, rationale, owner, subject_type, subject_id, review_by, source)
              VALUES (
                ${`Deal ${newStage}: ${projName}`},
                ${`Advanced ${oldStage} → ${newStage}. ${deal.packageType ?? 'listing'} package, ${valueClause}.${premortemOverridden ? ' Premortem gate overridden.' : ''}`},
                ${newStage === 'won' ? 'Closed the deal.' : 'Walked away.'},
                ${reason},
                ${deal.owner ?? operator.id},
                ${'project'}, ${deal.projectId}, ${reviewBy}, ${'deal_close'}
              )
            `);
          });
        } catch (capErr) {
          console.error('[deals] decision capture skipped (decisions table missing?):', capErr instanceof Error ? capErr.message : capErr);
        }
      }
      return rows;
    });

    // Best-effort side effects run AFTER the commit — a flaky trigger/notify
    // must never roll back a legitimate close, and must only fire once the
    // close is durably persisted.
    if (newStage === 'won') {
      try {
        await createPostListingTriggers(id, deal.projectId, new Date());
      } catch (triggerErr) {
        console.error('[deals] trigger creation error:', triggerErr);
      }
      try {
        await createLaunchpadTasks(id, deal.projectId);
      } catch (launchErr) {
        console.error('[deals] launchpad creation error:', launchErr);
      }
    }

    // Auto next-action task for the new stage (idempotent)
    try {
      await createStageTask(id, deal.projectId, newStage);
    } catch (taskErr) {
      console.error('[deals] stage task error:', taskErr);
    }

    // Live bell update (deduped per deal+stage so replays stay quiet)
    try {
      await notify({
        rule: 'deal_stage_change',
        // /deal-board is a sales webPath (packages/shared/src/workspaces.ts)
        workspace: 'sales',
        title: `Deal moved to ${newStage.replace(/_/g, ' ')}`,
        detail: `${oldStage} → ${newStage}`,
        projectId: deal.projectId,
        href: '/deal-board',
        dedupKey: `stage:${id}:${newStage}`,
      });
    } catch (notifyErr) {
      console.error('[deals] stage notify error:', notifyErr);
    }

    // (audit entry is written inside the transaction above)

    return c.json({ data: updated, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] stage error:', err);
    return c.json({ error: 'Failed to update stage', code: 'STAGE_ERROR' }, 500);
  }
});

dealRoutes.post('/:id/proposal', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const operator = c.get('operator');

  /*
   * THE HAND-PRICED ESCAPE HATCH, AND WHY IT IS A REQUEST FIELD.
   *
   * This handler reads the deal's package TYPE and nothing else about its money — it
   * never read `deal.packageValue`. So an operator who had PATCHed a negotiated $50,000
   * onto the deal got one of two things: a 422 (the common case, since most projects on
   * production cannot resolve a stratum), leaving them with NO document at ANY price; or
   * a 200 that overwrote their $50,000 with the stratum median. The endpoint would
   * neither use their number nor let them past it.
   *
   * `deals.package_value` carries no provenance column, so the stored number could be a
   * hand-negotiated price, a median from an earlier run, or the $20,000 literal this wave
   * deleted. Inferring which is exactly the collapse this lane removes, so the operator
   * states it in the REQUEST — the price and the reason — and the document then says on
   * its face that a human set it and what the book said when asked. A body is optional;
   * with none, the behaviour is unchanged (mark, or 422).
   */
  const body = await c.req.json<{ priceCents?: unknown; priceRationale?: unknown }>().catch(() => ({} as { priceCents?: unknown; priceRationale?: unknown }));
  const wantsHandPrice = body.priceCents !== undefined;
  if (wantsHandPrice) {
    const v = body.priceCents;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 1_000_000_000_00) {
      return c.json({
        error: 'priceCents must be a whole number of cents of at least 1 (and under $1bn). A hand price is a '
          + 'price a human negotiated; it is not a rounding of one.',
        code: 'VALIDATION',
      }, 400);
    }
    if (typeof body.priceRationale !== 'string' || body.priceRationale.trim() === '') {
      return c.json({
        error: 'priceRationale is required with priceCents: state why this price was negotiated. A hand price '
          + 'with no recorded reason is indistinguishable from the unsourced literal this desk deleted.',
        code: 'VALIDATION',
      }, 400);
    }
  }
  const operatorPrice = wantsHandPrice
    ? {
      priceCents: body.priceCents as number,
      operatorId: operator.id,
      rationale: (body.priceRationale as string).trim(),
    }
    : null;

  try {
    const [deal] = await db.select().from(schema.deals).where(sql`${schema.deals.id} = ${id}`).limit(1).execute();
    if (!deal) return c.json({ error: 'Deal not found', code: 'NOT_FOUND' }, 404);

    const [project] = await db.select().from(schema.projects).where(sql`${schema.projects.id} = ${deal.projectId}`).limit(1).execute();
    if (!project) return c.json({ error: 'Project not found', code: 'NOT_FOUND' }, 404);

    // Get approved claims
    const library = getClaimLibrarySnapshot();
    const approvedClaimTexts = library.claims.filter(c => c.active).map(c => c.text);

    /*
     * A REFUSAL STOPS THE QUOTE. It does not become a 0.
     *
     * What this replaced: `packageValue: deal.packageValue ?? defaultPackageValue(...)`
     * fed a number into `generateProposal`, which built tiers as
     * `essentialPrice > 0 ? essentialPrice : packageValue` — so a 0 arriving there
     * collapsed all three tiers to $0 and the proposal was WRITTEN AND PERSISTED,
     * ready to be sent to a counterparty. There is no worse output than a signed-looking
     * document quoting nothing.
     *
     * `generateProposal` now returns a discriminated union and there is no numeric path
     * out of a refusal. 422 with every refusal and the stratum census, so the desk can
     * see whether the answer is "enrich this project's category" or "this counterparty
     * is genuinely a new kind and needs a hand-priced deal".
     */
    const outcome = generateProposal({
      projectName: project.name,
      projectTicker: project.ticker,
      packageType: deal.packageType ?? 'listing',
      jurisdiction: project.jurisdiction,
      claimsUsed: approvedClaimTexts,
      book: await bookFor(db, project),
      operatorPrice,
    });

    if (outcome.kind === 'refused') {
      return c.json({
        error: 'No proposal was generated: this deal cannot be priced from LCX\'s closed book. '
          + outcome.refusals.map((r) => r.sentence).join(' ')
          + ' If this deal was priced by hand, re-send with { "priceCents": <whole cents>, "priceRationale":'
          + ' "<why>" } and the proposal will quote that figure, labelled as operator-supplied and NOT as a'
          + ' market rate.',
        code: 'PROPOSAL_UNPRICEABLE',
        refusals: refusalPayload(outcome.refusals),
        stratumCensus: outcome.census,
        /*
         * WHAT IS ALREADY STORED ON THE DEAL, shown so the operator can see the number
         * they would be re-supplying. It is NOT used as a price and NOT defaulted to 0 —
         * `null` here means the deal has never carried a value.
         */
        dealPackageValue: deal.packageValue ?? null,
        meta: { timestamp: new Date().toISOString(), version: env.version },
      }, 422);
    }

    const proposal = outcome.snapshot;
    const handPriced = proposal.pricing.basis === 'operator_supplied';

    const [updated] = await db.transaction(async (tx) => {
      const rows = await tx.update(schema.deals).set({
        proposalSnapshot: proposal as unknown as Record<string, unknown>,
        proposalGeneratedAt: new Date(),
        /*
         * The deal's own value is brought onto the quote, so the board and the proposal
         * cannot show two different prices for the same deal. On the MARKED path this
         * OVERWRITES whatever was stored, including an earlier hand price — which is why
         * the hand-priced path above exists: an operator who wants their figure kept asks
         * for it explicitly, and then this writes their figure, not a median.
         */
        packageValue: proposal.packageValue,
        updatedAt: new Date(),
      }).where(sql`${schema.deals.id} = ${id}`).returning().execute();
      await tx.insert(schema.dealEvents).values({
        id: randomUUID(), dealId: id, eventType: 'proposal_generated', actor: operator.id,
        content: `Proposal generated — ${deal.packageType ?? 'listing'} / `
          + `$${(proposal.packageValue / 100).toLocaleString('en-US')} — ${proposal.priceBasis}`,
        meta: {
          packageType: deal.packageType,
          packageValue: proposal.packageValue,
          priceSource: proposal.pricing.basis,
          // `frame` only exists where a mark set the price. On the hand-priced path it is
          // absent rather than an empty object, and the refusals the book gave are
          // recorded instead — so no reader can mistake a negotiated number for a marked one.
          ...(proposal.pricing.basis === 'mark_to_contract'
            ? { frame: proposal.pricing.mark.frame, spreadObserved: proposal.pricing.spreadObserved }
            : {
              operatorId: proposal.pricing.operator.operatorId,
              rationale: proposal.pricing.operator.rationale,
              bookRefusals: refusalPayload(proposal.pricing.markRefusals),
            }),
        },
      }).execute();
      return rows;
    });

    return c.json({
      data: updated,
      meta: {
        timestamp: new Date().toISOString(),
        version: env.version,
        priceSource: proposal.pricing.basis,
        // Null, not omitted and not `{}`: a hand-priced document HAS no observation frame,
        // and saying so is different from having failed to attach one.
        mark: handPriced ? null : proposal.mark?.frame ?? null,
        ...(handPriced
          ? { operatorPriceRefusalsFromBook: refusalPayload(
            proposal.pricing.basis === 'operator_supplied' ? proposal.pricing.markRefusals : [],
          ) }
          : {}),
        stratumCensus: outcome.census,
      },
    });
  } catch (err) {
    console.error('[deals] proposal error:', err);
    return c.json({ error: 'Failed to generate proposal', code: 'PROPOSAL_ERROR' }, 500);
  }
});

dealRoutes.get('/:id/events', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  try {
    const rows = await db.select().from(schema.dealEvents).where(sql`${schema.dealEvents.dealId} = ${id}`).orderBy(desc(schema.dealEvents.createdAt)).execute();
    return c.json({ data: rows, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] events error:', err);
    return c.json({ error: 'Failed to load events', code: 'EVENTS_ERROR' }, 500);
  }
});

dealRoutes.get('/:id/objections', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  try {
    const rows = await db.select().from(schema.dealObjections).where(sql`${schema.dealObjections.dealId} = ${id}`).orderBy(desc(schema.dealObjections.createdAt)).execute();
    return c.json({ data: rows, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] objections error:', err);
    return c.json({ error: 'Failed to load objections', code: 'OBJECTIONS_ERROR' }, 500);
  }
});

dealRoutes.post('/:id/objections', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const operator = c.get('operator');
  const body = await c.req.json<{ category: string; description: string; severity?: string }>();

  if (!body.category || !body.description?.trim()) {
    return c.json({ error: 'Category and description required', code: 'MISSING_FIELDS' }, 400);
  }

  try {
    const [existing] = await db.select().from(schema.deals).where(sql`${schema.deals.id} = ${id}`).limit(1).execute();
    if (!existing) return c.json({ error: 'Deal not found', code: 'NOT_FOUND' }, 404);

    const [obj] = await db.transaction(async (tx) => {
      const rows = await tx.insert(schema.dealObjections).values({
        id: randomUUID(), dealId: id, category: body.category, description: body.description,
        severity: body.severity ?? 'medium', raisedBy: operator.id,
      }).returning().execute();
      await tx.insert(schema.dealEvents).values({
        id: randomUUID(), dealId: id, eventType: 'objection', actor: operator.id,
        content: `Objection: ${body.category} — ${body.description}`,
        meta: { objectionId: rows[0].id, category: body.category, severity: body.severity },
      }).execute();
      return rows;
    });

    return c.json({ data: obj, meta: { timestamp: new Date().toISOString(), version: env.version } }, 201);
  } catch (err) {
    console.error('[deals] objection create error:', err);
    return c.json({ error: 'Failed to create objection', code: 'OBJECTION_ERROR' }, 500);
  }
});

dealRoutes.patch('/:id/objections/:objId', requireOperator, async (c) => {
  const db = getDb();
  const { id, objId } = c.req.param();
  const operator = c.get('operator');
  const body = await c.req.json<{ resolution?: string }>();

  try {
    const updated = await db.transaction(async (tx) => {
      const rows = await tx.update(schema.dealObjections).set({
        resolved: true, resolution: body.resolution ?? null, resolvedAt: new Date(),
      }).where(sql`${schema.dealObjections.id} = ${objId} AND ${schema.dealObjections.dealId} = ${id}`).returning().execute();
      if (!rows[0]) return null;
      await tx.insert(schema.dealEvents).values({
        id: randomUUID(), dealId: id, eventType: 'note', actor: operator.id,
        content: `Objection resolved: ${rows[0].description}`,
        meta: { objectionId: objId, resolution: body.resolution },
      }).execute();
      return rows[0];
    });

    if (!updated) return c.json({ error: 'Objection not found', code: 'NOT_FOUND' }, 404);

    return c.json({ data: updated, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[deals] objection resolve error:', err);
    return c.json({ error: 'Failed to resolve objection', code: 'OBJECTION_RESOLVE_ERROR' }, 500);
  }
});
