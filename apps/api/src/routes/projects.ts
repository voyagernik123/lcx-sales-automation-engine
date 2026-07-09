import { Hono } from 'hono';
import { sql, desc } from 'drizzle-orm';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { env } from '../lib/env.js';
import { scoreProject, CoinGeckoClient, enrichProject, generateDraft, getClaimLibrarySnapshot } from '@lcx/shared';
import { randomUUID } from 'node:crypto';

export const projectsRoutes = new Hono<{ Variables: AuthVariables }>();

/**
 * GET /v1/projects
 *
 * Query params:
 *   limit      (number, default 50, max 200)
 *   offset     (number, default 0)
 *   source     (string) — filter by source
 *   listed     (boolean) — filter listed_on_lcx
 *   band       (string) — filter by score band
 *   search     (string) — name / ticker / website fuzzy search
 *   sort       (string) — 'eu_score' | 'us_pre' | 'us_post' | 'name' | 'created'
 *   order      ('asc' | 'desc', default 'desc')
 *   minEu      (number) — minimum eu_score
 *   minUs      (number) — minimum us_post_score
 */
projectsRoutes.get('/', requireOperator, async (c) => {
  const db = getDb();
  const qs = c.req.query();

  const limit = Math.min(Number(qs.limit) || 50, 200);
  const offset = Number(qs.offset) || 0;
  const sortField = qs.sort || 'created';
  const sortOrder = qs.order === 'asc' ? 'asc' : 'desc';

  // Build WHERE clauses — use Drizzle SQL fragments for safety
  const conditions: ReturnType<typeof sql>[] = [];

  if (qs.source) {
    conditions.push(sql`p.source = ${qs.source}`);
  }
  if (qs.listed === 'true') {
    conditions.push(sql`p.listed_on_lcx = TRUE`);
  }
  if (qs.listed === 'false') {
    conditions.push(sql`p.listed_on_lcx = FALSE`);
  }
  if (qs.search) {
    const term = `%${qs.search}%`;
    conditions.push(
      sql`(p.name ILIKE ${term} OR p.ticker ILIKE ${term} OR p.website ILIKE ${term})`,
    );
  }
  if (qs.band) {
    conditions.push(sql`s.band = ${qs.band}`);
  }
  if (qs.minEu) {
    conditions.push(sql`s.eu_score >= ${Number(qs.minEu)}`);
  }
  if (qs.minUs) {
    conditions.push(sql`s.us_post_score >= ${Number(qs.minUs)}`);
  }
  if (qs.marketRecommendation) {
    conditions.push(sql`s.recommended_market = ${qs.marketRecommendation}`);
  }
  if (qs.hasContact === 'true') {
    conditions.push(sql`(SELECT COUNT(*) FROM people pl WHERE pl.project_id = p.id) > 0`);
  }
  if (qs.hasContact === 'false') {
    conditions.push(sql`(SELECT COUNT(*) FROM people pl WHERE pl.project_id = p.id) = 0`);
  }
  if (qs.verifiedContact === 'true') {
    conditions.push(sql`(SELECT COUNT(*) FROM people pl WHERE pl.project_id = p.id AND (pl.email IS NOT NULL AND pl.email_status != 'invalid' OR pl.linkedin IS NOT NULL)) > 0`);
  }
  if (qs.market === 'eu') {
    const euTerms = [
      'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'IE', 'PT', 'GR',
      'FI', 'SE', 'DK', 'PL', 'CZ', 'HU', 'RO', 'SK', 'BG', 'HR',
      'LT', 'LV', 'EE', 'SI', 'LU', 'CY', 'MT', 'GERMANY', 'FRANCE',
      'ITALY', 'SPAIN', 'NETHERLANDS', 'BELGIUM', 'AUSTRIA', 'IRELAND',
      'PORTUGAL', 'GREECE',
    ];
    const euClauses = euTerms.map(t => sql`p.jurisdiction ILIKE ${`%${t}%`}`);
    conditions.push(sql`(${sql.join(euClauses, sql` OR `)})`);
  }
  if (qs.market === 'us') {
    conditions.push(sql`p.jurisdiction ILIKE ${'%US%'}`);
  }

  const whereClause = conditions.length > 0
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const orderColumn = ({
    eu_score: 's.eu_score',
    us_pre: 's.us_pre_score',
    us_post: 's.us_post_score',
    name: 'p.name',
    created: 'p.created_at',
  } as Record<string, string>)[sortField] ?? 'p.created_at';

  const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
  const orderClause = sql.raw(`ORDER BY ${orderColumn} ${orderDir}`);

  try {
    const [listResult, countResult] = await Promise.all([
      db.execute(sql`
        SELECT
          p.id, p.name, p.website, p.ticker, p.chain, p.source, p.esma_token_id,
          p.jurisdiction, p.category, p.listed_on_lcx,
          p.created_at, p.updated_at,
          s.eu_score, s.us_pre_score, s.us_post_score, s.band, s.recommended_market,
          (SELECT COUNT(*) FROM people pl WHERE pl.project_id = p.id) AS people_count,
          (SELECT COUNT(*) FROM people pl WHERE pl.project_id = p.id AND (pl.email IS NOT NULL AND pl.email_status != 'invalid' OR pl.linkedin IS NOT NULL)) AS verified_contact_count
        FROM projects p
        LEFT JOIN scores s ON s.project_id = p.id
        ${whereClause}
        ${orderClause}
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(*) AS total
        FROM projects p
        LEFT JOIN scores s ON s.project_id = p.id
        ${whereClause}
      `),
    ]);

    const total = Number((countResult.rows?.[0] as Record<string, unknown> | undefined)?.total ?? 0);
    const results = (listResult.rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      website: r.website,
      ticker: r.ticker,
      chain: r.chain,
      source: r.source,
      esmaTokenId: r.esma_token_id,
      jurisdiction: r.jurisdiction,
      category: r.category,
      listedOnLcx: r.listed_on_lcx,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      euScore: r.eu_score ?? 0,
      usPreScore: r.us_pre_score ?? 0,
      usPostScore: r.us_post_score ?? 0,
      band: r.band ?? 'unscored',
      recommendedMarket: r.recommended_market ?? 'none',
      peopleCount: Number(r.people_count ?? 0),
      verifiedContactCount: Number(r.verified_contact_count ?? 0),
    }));

    return c.json({
      data: results,
      meta: { total, limit, offset, timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[projects] list error:', err);
    return c.json({ error: 'Failed to query projects', code: 'QUERY_ERROR' }, 500);
  }
});

/**
 * GET /v1/projects/:id — Single project with related records.
 */
projectsRoutes.get('/:id', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();

  try {
    const projectRows = await db
      .select()
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${id}`)
      .limit(1)
      .execute();

    if (projectRows.length === 0) {
      return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    }

    const project = projectRows[0];

    const [scoreRows, peopleRows, sourceRows, signalRows, dealRows] = await Promise.all([
      db.select().from(schema.scores).where(sql`${schema.scores.projectId} = ${id}`).limit(1).execute(),
      db.select().from(schema.people).where(sql`${schema.people.projectId} = ${id}`).execute(),
      db.select().from(schema.projectSources).where(sql`${schema.projectSources.projectId} = ${id}`).execute(),
      db.select().from(schema.signals).where(sql`${schema.signals.projectId} = ${id}`).orderBy(desc(schema.signals.observedAt)).limit(20).execute(),
      db.select().from(schema.deals).where(sql`${schema.deals.projectId} = ${id}`).execute(),
    ]);

    return c.json({
      data: {
        ...project,
        score: scoreRows[0] ?? null,
        people: peopleRows,
        sources: sourceRows,
        signals: signalRows,
        deals: dealRows,
      },
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[projects] get error:', err);
    return c.json({ error: 'Failed to load project', code: 'QUERY_ERROR' }, 500);
  }
});

/**
 * POST /v1/projects — Create a project manually.
 */
projectsRoutes.post('/', requireOperator, async (c) => {
  const db = getDb();
  const body = await c.req.json<{
    name: string;
    website?: string;
    ticker?: string;
    chain?: string;
    source?: string;
    jurisdiction?: string;
    category?: string;
    listingOnLcx?: boolean;
  }>();

  if (!body.name || body.name.trim() === '') {
    return c.json({ error: 'name is required', code: 'VALIDATION' }, 400);
  }

  try {
    const [inserted] = await db
      .insert(schema.projects)
      .values({
        name: body.name.trim(),
        website: body.website ?? null,
        ticker: body.ticker ?? null,
        chain: body.chain ?? null,
        source: body.source ?? 'manual',
        jurisdiction: body.jurisdiction ?? null,
        category: body.category ?? null,
        listedOnLcx: body.listingOnLcx ?? false,
        raw: {},
      })
      .returning()
      .execute();

    return c.json({ data: inserted, meta: { timestamp: new Date().toISOString(), version: env.version } }, 201);
  } catch (err) {
    console.error('[projects] create error:', err);
    return c.json({ error: 'Failed to create project', code: 'CREATE_ERROR' }, 500);
  }
});

/**
 * POST /v1/projects/score — Recompute scores for all projects.
 */
projectsRoutes.post('/score', requireOperator, async (c) => {
  const db = getDb();

  try {
    const projectRows = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        website: schema.projects.website,
        ticker: schema.projects.ticker,
        chain: schema.projects.chain,
        source: schema.projects.source,
        esmaTokenId: schema.projects.esmaTokenId,
        dti: schema.projects.dti,
        jurisdiction: schema.projects.jurisdiction,
        whitepaperUrl: schema.projects.whitepaperUrl,
        category: schema.projects.category,
        marketCap: schema.projects.marketCap,
        listedOnLcx: schema.projects.listedOnLcx,
      })
      .from(schema.projects)
      .execute();

    let scored = 0;
    let errors = 0;
    const bandCounts: Record<string, number> = {};

    for (const p of projectRows) {
      try {
        const peopleRows = await db
          .select({
            name: schema.people.name,
            email: schema.people.email,
            telegram: schema.people.telegram,
            linkedin: schema.people.linkedin,
          })
          .from(schema.people)
          .where(sql`${schema.people.projectId} = ${p.id}`)
          .execute();

        const signalRows = await db
          .select({
            kind: schema.signals.kind,
            payload: schema.signals.payload,
          })
          .from(schema.signals)
          .where(sql`${schema.signals.projectId} = ${p.id}`)
          .execute();

        const result = scoreProject(
          {
            name: p.name,
            website: p.website ?? undefined,
            ticker: p.ticker ?? undefined,
            chain: p.chain ?? undefined,
            jurisdiction: p.jurisdiction ?? undefined,
            whitepaperUrl: p.whitepaperUrl ?? undefined,
            category: p.category ?? undefined,
            marketCap: p.marketCap ?? undefined,
            source: p.source,
            esmaTokenId: p.esmaTokenId ?? undefined,
            dti: p.dti ?? undefined,
            listedOnLcx: p.listedOnLcx,
          },
          peopleRows.map((r) => ({
            name: r.name ?? undefined,
            email: r.email ?? undefined,
            telegram: r.telegram ?? undefined,
            linkedin: r.linkedin ?? undefined,
          })),
          signalRows.map((r) => ({
            kind: r.kind,
            payload: (r.payload ?? {}) as Record<string, unknown>,
          })),
        );

        const existing = await db
          .select({ id: schema.scores.id })
          .from(schema.scores)
          .where(sql`${schema.scores.projectId} = ${p.id}`)
          .limit(1)
          .execute();

        const scoreData = {
          euScore: result.euScore,
          usPreScore: result.usPreScore,
          usPostScore: result.usPostScore,
          band: result.band,
          reasons: result.reasons as unknown as Record<string, unknown>[],
          recommendedMarket: result.recommendedMarket ?? 'none',
          usIntelSignals: (result.usIntelSignals ?? {}) as unknown as Record<string, unknown>,
          computedAt: new Date(result.computedAt),
        };

        if (existing.length > 0) {
          await db
            .update(schema.scores)
            .set(scoreData)
            .where(sql`${schema.scores.id} = ${existing[0].id}`)
            .execute();
        } else {
          await db
            .insert(schema.scores)
            .values({ id: randomUUID(), projectId: p.id, ...scoreData })
            .execute();
        }

        scored++;
        bandCounts[result.band] = (bandCounts[result.band] || 0) + 1;
      } catch {
        errors++;
      }
    }

    return c.json({
      data: { scored, errors, bands: bandCounts },
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[projects] score all error:', err);
    return c.json({ error: 'Failed to score projects', code: 'SCORE_ERROR' }, 500);
  }
});

/**
 * POST /v1/projects/:id/score — Recompute score for a single project.
 */
projectsRoutes.post('/:id/score', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();

  try {
    const projectRows = await db
      .select()
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${id}`)
      .limit(1)
      .execute();

    if (projectRows.length === 0) {
      return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    }

    const p = projectRows[0];

    const peopleRows = await db
      .select({
        name: schema.people.name,
        email: schema.people.email,
        telegram: schema.people.telegram,
        linkedin: schema.people.linkedin,
      })
      .from(schema.people)
      .where(sql`${schema.people.projectId} = ${id}`)
      .execute();

    const signalRows = await db
      .select({
        kind: schema.signals.kind,
        payload: schema.signals.payload,
      })
      .from(schema.signals)
      .where(sql`${schema.signals.projectId} = ${id}`)
      .execute();

    const result = scoreProject(
      {
        name: p.name,
        website: p.website ?? undefined,
        ticker: p.ticker ?? undefined,
        chain: p.chain ?? undefined,
        jurisdiction: p.jurisdiction ?? undefined,
        whitepaperUrl: p.whitepaperUrl ?? undefined,
        category: p.category ?? undefined,
        marketCap: p.marketCap ?? undefined,
        source: p.source,
        esmaTokenId: p.esmaTokenId ?? undefined,
        dti: p.dti ?? undefined,
        listedOnLcx: p.listedOnLcx,
      },
      peopleRows.map((r) => ({
        name: r.name ?? undefined,
        email: r.email ?? undefined,
        telegram: r.telegram ?? undefined,
        linkedin: r.linkedin ?? undefined,
      })),
      signalRows.map((r) => ({
        kind: r.kind,
        payload: (r.payload ?? {}) as Record<string, unknown>,
      })),
    );

    const existing = await db
      .select({ id: schema.scores.id })
      .from(schema.scores)
      .where(sql`${schema.scores.projectId} = ${id}`)
      .limit(1)
      .execute();

    const scoreData = {
      euScore: result.euScore,
      usPreScore: result.usPreScore,
      usPostScore: result.usPostScore,
      band: result.band,
      reasons: result.reasons as unknown as Record<string, unknown>[],
      recommendedMarket: result.recommendedMarket ?? 'none',
      usIntelSignals: (result.usIntelSignals ?? {}) as unknown as Record<string, unknown>,
      computedAt: new Date(result.computedAt),
    };

    if (existing.length > 0) {
      await db
        .update(schema.scores)
        .set(scoreData)
        .where(sql`${schema.scores.id} = ${existing[0].id}`)
        .execute();
    } else {
      await db
        .insert(schema.scores)
        .values({ id: randomUUID(), projectId: id, ...scoreData })
        .execute();
    }

    return c.json({
      data: { projectId: id, ...scoreData, redFlag: result.redFlag, recommendedMarket: result.recommendedMarket },
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[projects] score single error:', err);
    return c.json({ error: 'Failed to score project', code: 'SCORE_ERROR' }, 500);
  }
});

/**
 * POST /v1/projects/:id/enrich — Enrich a project with CoinGecko market data.
 */
projectsRoutes.post('/:id/enrich', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();

  try {
    const projectRows = await db
      .select()
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${id}`)
      .limit(1)
      .execute();

    if (projectRows.length === 0) {
      return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    }

    const p = projectRows[0];
    const cgApiKey = env.coingeckoApiKey || undefined;
    const cg = new CoinGeckoClient({ apiKey: cgApiKey, keyType: env.coingeckoKeyType });

    const result = await enrichProject(
      {
        id: p.id,
        name: p.name,
        ticker: p.ticker ?? undefined,
        marketCap: p.marketCap ?? undefined,
        raw: (p.raw ?? {}) as Record<string, unknown>,
      },
      cg,
    );

    // Persist enrichment metadata and signals
    const currentRaw = (p.raw || {}) as Record<string, unknown>;
    const enrichMeta: Record<string, unknown> = {
      ...((currentRaw._enrichment || {}) as Record<string, unknown>),
      lastRunAt: new Date().toISOString(),
      coinId: result.coinId,
    };

    if (result.error) {
      enrichMeta.lastError = result.error;
      enrichMeta.errorCount = ((enrichMeta.errorCount as number) || 0) + 1;
    } else {
      enrichMeta.lastError = null;
      enrichMeta.errorCount = 0;
    }

    await db
      .update(schema.projects)
      .set({
        raw: { ...currentRaw, _enrichment: enrichMeta },
        updatedAt: new Date(),
      })
      .where(sql`${schema.projects.id} = ${id}`)
      .execute();

    for (const signal of result.signals) {
      await db
        .insert(schema.signals)
        .values({
          id: randomUUID(),
          projectId: id,
          kind: signal.kind,
          payload: signal.payload as Record<string, unknown>,
        })
        .execute();
    }

    return c.json({
      data: {
        projectId: id,
        coinId: result.coinId,
        matched: result.matched,
        marketData: result.marketData
          ? {
              marketCap: result.marketData.marketCap,
              marketCapRank: result.marketData.marketCapRank,
              totalVolume: result.marketData.totalVolume,
              currentPrice: result.marketData.currentPrice,
              priceChangePercent24h: result.marketData.priceChangePercent24h,
              categories: result.marketData.categories.slice(0, 5),
            }
          : null,
        signalsEmitted: result.signals.length,
        error: result.error ?? null,
      },
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[projects] enrich error:', err);
    return c.json({ error: 'Failed to enrich project', code: 'ENRICH_ERROR' }, 500);
  }
});

/**
 * POST /v1/projects/:id/approve — Mark a project as approved for outreach.
 */
projectsRoutes.post('/:id/approve', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();

  try {
    const rows = await db
      .select()
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${id}`)
      .limit(1)
      .execute();

    if (rows.length === 0) {
      return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    }

    const currentRaw = (rows[0].raw ?? {}) as Record<string, unknown>;
    await db
      .update(schema.projects)
      .set({
        raw: { ...currentRaw, _outreach: { approved: true, suppressed: false, approvedAt: new Date().toISOString() } },
        updatedAt: new Date(),
      })
      .where(sql`${schema.projects.id} = ${id}`)
      .execute();

    return c.json({ data: { projectId: id, status: 'approved' }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[projects] approve error:', err);
    return c.json({ error: 'Failed to approve project', code: 'APPROVE_ERROR' }, 500);
  }
});

/**
 * POST /v1/projects/:id/suppress — Suppress a project from outreach.
 */
projectsRoutes.post('/:id/suppress', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();

  try {
    const rows = await db
      .select()
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${id}`)
      .limit(1)
      .execute();

    if (rows.length === 0) {
      return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    }

    const currentRaw = (rows[0].raw ?? {}) as Record<string, unknown>;
    await db
      .update(schema.projects)
      .set({
        raw: { ...currentRaw, _outreach: { approved: false, suppressed: true, suppressedAt: new Date().toISOString() } },
        updatedAt: new Date(),
      })
      .where(sql`${schema.projects.id} = ${id}`)
      .execute();

    return c.json({ data: { projectId: id, status: 'suppressed' }, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[projects] suppress error:', err);
    return c.json({ error: 'Failed to suppress project', code: 'SUPPRESS_ERROR' }, 500);
  }
});

/**
 * POST /v1/projects/:id/people — Add a person contact.
 */
projectsRoutes.post('/:id/people', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const body = await c.req.json<{
    name: string;
    title?: string;
    role?: string;
    linkedin?: string;
    email?: string;
    telegram?: string;
  }>();

  if (!body.name || body.name.trim() === '') {
    return c.json({ error: 'name is required', code: 'VALIDATION' }, 400);
  }

  try {
    const projectRows = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${id}`)
      .limit(1)
      .execute();

    if (projectRows.length === 0) {
      return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    }

    const [inserted] = await db
      .insert(schema.people)
      .values({
        id: randomUUID(),
        projectId: id,
        name: body.name.trim(),
        title: body.title ?? null,
        role: body.role ?? 'other',
        linkedin: body.linkedin ?? null,
        email: body.email ?? null,
        telegram: body.telegram ?? null,
        enrichedBy: 'manual',
      })
      .returning()
      .execute();

    return c.json({ data: inserted, meta: { timestamp: new Date().toISOString(), version: env.version } }, 201);
  } catch (err) {
    console.error('[projects] add person error:', err);
    return c.json({ error: 'Failed to add person', code: 'PERSON_ERROR' }, 500);
  }
});

/**
 * PATCH /v1/projects/:id/people/:personId — Update a person contact.
 */
projectsRoutes.patch('/:id/people/:personId', requireOperator, async (c) => {
  const db = getDb();
  const { personId } = c.req.param();

  const body = await c.req.json<{
    name?: string;
    title?: string;
    role?: string;
    linkedin?: string;
    email?: string;
    telegram?: string;
    emailStatus?: string;
  }>();

  try {
    const existing = await db
      .select()
      .from(schema.people)
      .where(sql`${schema.people.id} = ${personId}`)
      .limit(1)
      .execute();

    if (existing.length === 0) {
      return c.json({ error: 'Person not found', code: 'NOT_FOUND' }, 404);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.title !== undefined) updates.title = body.title;
    if (body.role !== undefined) updates.role = body.role;
    if (body.linkedin !== undefined) updates.linkedin = body.linkedin;
    if (body.email !== undefined) updates.email = body.email;
    if (body.telegram !== undefined) updates.telegram = body.telegram;
    if (body.emailStatus !== undefined) updates.emailStatus = body.emailStatus;

    const [updated] = await db
      .update(schema.people)
      .set(updates)
      .where(sql`${schema.people.id} = ${personId}`)
      .returning()
      .execute();

    return c.json({ data: updated, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[projects] update person error:', err);
    return c.json({ error: 'Failed to update person', code: 'PERSON_ERROR' }, 500);
  }
});

/**
 * GET /v1/projects/:id/gate — Check enrollment gate for a project.
 */
projectsRoutes.get('/:id/gate', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();

  try {
    const projectRows = await db
      .select()
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${id}`)
      .limit(1)
      .execute();

    if (projectRows.length === 0) {
      return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    }

    const p = projectRows[0];

    const [scoreRows, peopleRows] = await Promise.all([
      db.select().from(schema.scores).where(sql`${schema.scores.projectId} = ${id}`).limit(1).execute(),
      db.select().from(schema.people).where(sql`${schema.people.projectId} = ${id}`).execute(),
    ]);

    const score = scoreRows[0] ?? null;
    const outreach = (p.raw as Record<string, unknown>)?._outreach as Record<string, unknown> | undefined;
    const suppressed = outreach?.suppressed === true;
    const band = score?.band ?? 'unscored';
    const hasVerifiedContact = peopleRows.some(
      (person) => (person.email && person.emailStatus !== 'invalid') || person.linkedin,
    );

    const bandRank: Record<string, number> = {
      immediate: 5, high: 4, nurture: 3, watch: 2, archive: 1, unscored: 0,
    };

    const reasons: string[] = [];
    let pass = true;

    if (suppressed) { pass = false; reasons.push('Project is suppressed'); }
    if (!hasVerifiedContact) { pass = false; reasons.push('No person with verified email or LinkedIn URL'); }
    if ((bandRank[band] ?? 0) < 3) { pass = false; reasons.push(`Band "${band}" is below nurture threshold`); }
    if (score?.reasons) {
      const redFlags = (score.reasons as Array<{ code: string }>).filter((r) => r.code.startsWith('red_flag'));
      if (redFlags.length > 0) { pass = false; reasons.push(`Red-flag locked (${redFlags.length} flags)`); }
    }

    return c.json({
      data: {
        pass,
        reasons,
        band,
        hasVerifiedContact,
        suppressed,
        totalContacts: peopleRows.length,
      },
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[projects] gate error:', err);
    return c.json({ error: 'Failed to check gate', code: 'GATE_ERROR' }, 500);
  }
});

/**
 * POST /v1/projects/:id/drafts/generate — Generate a draft message.
 */
projectsRoutes.post('/:id/drafts/generate', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const body = await c.req.json<{
    contactName: string;
    contactTitle?: string;
    contactRole?: string;
    touchIndex?: number;
    channel?: string;
    jurisdiction?: string;
    clarityEnacted?: boolean;
    market?: string;
  }>();

  try {
    const projectRows = await db
      .select()
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${id}`)
      .limit(1)
      .execute();

    if (projectRows.length === 0) {
      return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    }

    const p = projectRows[0];

    const [scoreRows] = await Promise.all([
      db.select().from(schema.scores).where(sql`${schema.scores.projectId} = ${id}`).limit(1).execute(),
    ]);

    const score = scoreRows[0] ?? null;
    const reasons = (score?.reasons ?? []) as Array<{ code: string; factor: string; points: number; note: string }>;

    if (!body.contactName || body.contactName.trim() === '') {
      return c.json({ error: 'contactName is required', code: 'VALIDATION' }, 400);
    }

    const draftInput = {
      projectName: p.name,
      projectTicker: p.ticker,
      projectWebsite: p.website,
      projectChain: p.chain,
      projectEuScore: score?.euScore ?? null,
      projectUsPreScore: score?.usPreScore ?? null,
      projectUsPostScore: score?.usPostScore ?? null,
      projectBand: score?.band ?? 'unscored',
      scoreReasons: reasons,
      contactName: body.contactName,
      contactTitle: body.contactTitle ?? null,
      contactRole: body.contactRole ?? 'other',
      jurisdiction: (body.jurisdiction ?? 'eu') as 'eu' | 'us',
      clarityEnacted: body.clarityEnacted ?? false,
      touchIndex: body.touchIndex ?? 1,
      channel: (body.channel ?? 'email') as 'email' | 'linkedin' | 'telegram',
      market: body.market ?? null,
    };

    const { draft, warnings } = generateDraft(draftInput);

    return c.json({
      data: draft,
      warnings,
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[projects] draft generate error:', err);
    return c.json({ error: 'Failed to generate draft', code: 'DRAFT_ERROR' }, 500);
  }
});

/**
 * POST /v1/projects/:id/drafts/save — Save a draft (operator-edited or generated).
 */
projectsRoutes.post('/:id/drafts/save', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();
  const body = await c.req.json<{
    contactName: string;
    subject: string;
    body: string;
    channel?: string;
    touchIndex?: number;
    claimsUsed?: string[];
    requiresHumanReview?: boolean;
    operatorEdited?: boolean;
  }>();

  if (!body.contactName || !body.subject || !body.body) {
    return c.json({ error: 'contactName, subject, and body are required', code: 'VALIDATION' }, 400);
  }

  try {
    const [inserted] = await db
      .insert(schema.drafts)
      .values({
        id: randomUUID(),
        projectId: id,
        contactName: body.contactName,
        subject: body.subject,
        body: body.body,
        channel: body.channel ?? 'email',
        touchIndex: body.touchIndex ?? 1,
        claimsUsed: (body.claimsUsed ?? []) as unknown as Record<string, unknown>[],
        requiresHumanReview: body.requiresHumanReview ?? false,
        operatorEdited: body.operatorEdited ?? false,
      })
      .returning()
      .execute();

    return c.json({ data: inserted, meta: { timestamp: new Date().toISOString(), version: env.version } }, 201);
  } catch (err) {
    console.error('[projects] save draft error:', err);
    return c.json({ error: 'Failed to save draft', code: 'DRAFT_ERROR' }, 500);
  }
});

/**
 * GET /v1/projects/:id/drafts — List drafts for a project.
 */
projectsRoutes.get('/:id/drafts', requireOperator, async (c) => {
  const db = getDb();
  const { id } = c.req.param();

  try {
    const rows = await db
      .select()
      .from(schema.drafts)
      .where(sql`${schema.drafts.projectId} = ${id}`)
      .orderBy(desc(schema.drafts.createdAt))
      .execute();

    return c.json({
      data: rows,
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[projects] list drafts error:', err);
    return c.json({ error: 'Failed to list drafts', code: 'DRAFT_ERROR' }, 500);
  }
});

/**
 * PATCH /v1/projects/:id/drafts/:draftId — Update a draft (approve, edit, etc.).
 */
projectsRoutes.patch('/:id/drafts/:draftId', requireOperator, async (c) => {
  const db = getDb();
  const { draftId } = c.req.param();
  const body = await c.req.json<{
    subject?: string;
    body?: string;
    approved?: boolean;
    operatorEdited?: boolean;
  }>();

  try {
    const existing = await db
      .select()
      .from(schema.drafts)
      .where(sql`${schema.drafts.id} = ${draftId}`)
      .limit(1)
      .execute();

    if (existing.length === 0) {
      return c.json({ error: 'Draft not found', code: 'NOT_FOUND' }, 404);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.subject !== undefined) updates.subject = body.subject;
    if (body.body !== undefined) updates.body = body.body;
    if (body.approved !== undefined) updates.approved = body.approved;
    if (body.operatorEdited !== undefined) updates.operatorEdited = body.operatorEdited;

    const [updated] = await db
      .update(schema.drafts)
      .set(updates)
      .where(sql`${schema.drafts.id} = ${draftId}`)
      .returning()
      .execute();

    return c.json({ data: updated, meta: { timestamp: new Date().toISOString(), version: env.version } });
  } catch (err) {
    console.error('[projects] update draft error:', err);
    return c.json({ error: 'Failed to update draft', code: 'DRAFT_ERROR' }, 500);
  }
});

/**
 * GET /v1/claims — Return the full claim library snapshot.
 */
projectsRoutes.get('/claims', requireOperator, async (c) => {
  try {
    const snapshot = getClaimLibrarySnapshot();
    return c.json({
      data: snapshot,
      meta: { timestamp: new Date().toISOString(), version: env.version },
    });
  } catch (err) {
    console.error('[claims] list error:', err);
    return c.json({ error: 'Failed to load claims', code: 'CLAIMS_ERROR' }, 500);
  }
});
