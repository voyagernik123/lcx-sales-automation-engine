/**
 * Custom report builder (Phase 6-8) — SAFE parameterized aggregation.
 *
 * SECURITY: user input NEVER reaches SQL as a string. Every entity, column and
 * operator is resolved through a fixed allowlist map to a hard-coded SQL
 * fragment; only filter *values* are bound as parameters via drizzle's sql
 * tagged template. An unknown entity/column/op is rejected before any query
 * runs.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';

/* ── Allowlist definition ── */

interface ColumnDef {
  /** actual SQL column expression (hard-coded, never user input) */
  expr: string;
  /** aggregatable numeric column? (enables sum/avg metric) */
  numeric?: boolean;
}

interface EntityDef {
  table: string;
  columns: Record<string, ColumnDef>;
}

const ENTITIES: Record<string, EntityDef> = {
  projects: {
    table: 'projects',
    columns: {
      region: { expr: 'region' },
      source: { expr: 'source' },
      chain: { expr: 'chain' },
      category: { expr: 'category' },
      listedOnLcx: { expr: 'listed_on_lcx' },
      marketCapUsd: { expr: 'market_cap_usd', numeric: true },
      volume24hUsd: { expr: 'volume_24h_usd', numeric: true },
      peopleCount: { expr: 'people_count', numeric: true },
      verifiedContactCount: { expr: 'verified_contact_count', numeric: true },
    },
  },
  deals: {
    table: 'deals',
    columns: {
      stage: { expr: 'stage' },
      packageType: { expr: 'package_type' },
      owner: { expr: 'owner' },
      lossCategory: { expr: 'loss_category' },
      packageValue: { expr: 'package_value', numeric: true },
    },
  },
  handoffs: {
    table: 'handoffs',
    columns: {
      status: { expr: 'status' },
      channel: { expr: 'channel' },
      assignedTo: { expr: 'assigned_to' },
      triggerReason: { expr: 'trigger_reason' },
    },
  },
};

const OPERATORS: Record<string, string> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
};

export interface ReportFilter {
  column: string;
  op: keyof typeof OPERATORS | string;
  value: string | number | boolean;
}

export interface ReportConfig {
  entity: string;
  groupBy?: string | null;
  /** 'count' | 'sum:<column>' | 'avg:<column>' */
  metric?: string;
  filters?: ReportFilter[];
}

export interface ReportResult {
  entity: string;
  groupBy: string | null;
  metric: string;
  rows: { group: string | null; value: number }[];
  total: number;
}

export class ReportConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportConfigError';
  }
}

/** Describe the allowlist so the UI can build valid configs. */
export function describeReportSchema() {
  return Object.entries(ENTITIES).map(([entity, def]) => ({
    entity,
    columns: Object.entries(def.columns).map(([name, c]) => ({ name, numeric: Boolean(c.numeric) })),
    numericColumns: Object.entries(def.columns).filter(([, c]) => c.numeric).map(([n]) => n),
    operators: Object.keys(OPERATORS),
  }));
}

export async function runReport(config: ReportConfig): Promise<ReportResult> {
  const entity = ENTITIES[config.entity];
  if (!entity) throw new ReportConfigError(`Unknown entity: ${String(config.entity)}`);

  // ── metric ──
  const metricRaw = (config.metric ?? 'count').trim();
  let metricSql;
  let metricLabel = 'count';
  if (metricRaw === 'count') {
    metricSql = sql`COUNT(*)`;
  } else {
    const [fn, colName] = metricRaw.split(':');
    if ((fn !== 'sum' && fn !== 'avg') || !colName) {
      throw new ReportConfigError(`Invalid metric: ${metricRaw}`);
    }
    const col = entity.columns[colName];
    if (!col || !col.numeric) throw new ReportConfigError(`Column not aggregatable: ${colName}`);
    metricSql = fn === 'sum' ? sql`COALESCE(SUM(${sql.raw(col.expr)}), 0)` : sql`COALESCE(AVG(${sql.raw(col.expr)}), 0)`;
    metricLabel = `${fn}:${colName}`;
  }

  // ── group by ──
  let groupExpr: string | null = null;
  if (config.groupBy) {
    const col = entity.columns[config.groupBy];
    if (!col) throw new ReportConfigError(`Unknown groupBy column: ${config.groupBy}`);
    groupExpr = col.expr;
  }

  // ── filters (values bound as params) ──
  const conditions = [];
  for (const f of config.filters ?? []) {
    const col = entity.columns[f.column];
    if (!col) throw new ReportConfigError(`Unknown filter column: ${f.column}`);
    const opSql = OPERATORS[f.op as string];
    if (!opSql) throw new ReportConfigError(`Unknown operator: ${String(f.op)}`);
    // sql.raw for the (allowlisted) column + operator; value stays a bound param.
    conditions.push(sql`${sql.raw(col.expr)} ${sql.raw(opSql)} ${f.value}`);
  }
  const whereSql = conditions.length > 0 ? sql` WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const selectGroup = groupExpr ? sql`${sql.raw(groupExpr)} AS group_key, ` : sql``;
  const groupClause = groupExpr ? sql` GROUP BY ${sql.raw(groupExpr)}` : sql``;
  const orderClause = sql` ORDER BY value DESC`;

  const query = sql`
    SELECT ${selectGroup}${metricSql} AS value
    FROM ${sql.raw(entity.table)}${whereSql}${groupClause}${orderClause}
    LIMIT 500
  `;

  const db = getDb();
  const result = await db.execute(query);
  const rawRows = (result.rows ?? []) as Record<string, unknown>[];

  const rows = rawRows.map((r) => ({
    group: groupExpr ? (r.group_key == null ? null : String(r.group_key)) : null,
    value: Number(r.value ?? 0),
  }));
  const total = rows.reduce((acc, r) => acc + r.value, 0);

  return { entity: config.entity, groupBy: config.groupBy ?? null, metric: metricLabel, rows, total };
}
