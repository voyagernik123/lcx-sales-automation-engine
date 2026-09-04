/**
 * THE WATCH — composer (S4 of INSTRUMENT_100X_PLAN.md). See packages/shared/src/watch.ts for the shape
 * and the ranking prior; this file only READS registers the platform already keeps and files each
 * change under the compartment the operator holds. It never infers: every item's `detail` is the
 * record's own field values, and every column named here was checked against its migration.
 *
 * ENTITLEMENT IS THE FIRST FILTER, NOT THE LAST. Sources are queried only for compartments the
 * operator holds at 'view' (`loadEntitlements` + `capAtLeast`, the same pair routes/audit.ts uses),
 * so a distribution-only operator's watch never even asks the gps tables — and the response's
 * `byWorkspace` has no key for a room they do not hold, rather than a zero that reads as "quiet".
 *
 * ABSENT IS A SENTENCE. A register that is not migrated on this environment, a compartment with no
 * rows since the watermark, or a probe that failed: each becomes one line in `absent`. The composer
 * never returns an empty watch with nothing in `absent` — silence must always say what it is
 * silent about.
 *
 * TWO KINDS OF SOURCE. Deltas are rows whose own timestamp moved past the watermark. Deadlines are
 * a STATE, not a delta — a task due tomorrow was due tomorrow yesterday too — so they are read
 * against `asOf` with a stated horizon (48 h for tasks, 7 d for milestones and decision reviews)
 * regardless of the watermark. Both are labelled by `source` and dated by the record's own instant.
 */
import type pg from 'pg';
import {
  WATCH_CAP,
  capAtLeast,
  nothingRecordedSince,
  rankWatchItems,
  type EntitlementMap,
  type WatchItem,
  type WatchKind,
  type WatchResponse,
  type WorkspaceId,
} from '@lcx/shared';
import { loadEntitlements } from '../access/entitlements.js';
import { invoiceAgingSummary, isInvoiceMigrated } from '../gps/invoicing.js';
import { loadPerimeter, perimeterView } from '../gps/conflict.js';

type Draft = Omit<WatchItem, 'rank'>;
type Row = Record<string, unknown>;

const iso = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && v) { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; }
  return null;
};
const stamp = (isoStr: string) => `${isoStr.slice(0, 16).replace('T', ' ')} UTC`;
const money = (cents: unknown, currency: unknown) =>
  `${(Number(cents) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${String(currency ?? '')}`.trim();

/* Compartment by audit entity, EXACTLY as routes/audit.ts classifies its rows (gps_/marketing_), widened
   to the other prefixes the schema actually has. Anything unmatched is governance's — the audit log itself
   is a governance surface. */
const ENTITY_WORKSPACE: ReadonlyArray<readonly [RegExp, WorkspaceId]> = [
  [/^gps_/, 'gps'],
  [/^marketing_/, 'marketing'],
  [/^command_/, 'command'],
  [/^dist_/, 'distribution'],
  [/^(deals?|projects?|handoffs?|tasks?|deal_|project_|outreach_|sequence_|linkedin_)/, 'sales'],
  [/^(intel_|plays?|signals?|watchlist)/, 'intel'],
];
const workspaceOf = (entity: string | null): WorkspaceId => {
  if (!entity) return 'governance';
  for (const [re, ws] of ENTITY_WORKSPACE) if (re.test(entity)) return ws;
  return 'governance';
};

/* Kind by action / entity. Money and liability are named patterns in the record's own vocabulary
   (registry action ids, gps/marketing action names); everything else is activity. */
const MONEY_RE = /invoice|paid|dispute|won|lost|stage|deposit|accepted|price|quote|proposal_issue/i;
const LIABILITY_RE = /conflict|perimeter|refus|withheld|gate|abuse|lockout|purpose:|entitlement|grant|revoke|amended|crisis|sanction/i;
const kindOf = (action: string, entity: string | null): WatchKind =>
  LIABILITY_RE.test(action) || LIABILITY_RE.test(entity ?? '') ? 'liability'
    : MONEY_RE.test(action) || MONEY_RE.test(entity ?? '') ? 'money'
      : 'activity';

async function has(pool: pg.Pool, table: string): Promise<boolean> {
  try { const r = await pool.query(`SELECT to_regclass($1) AS rel`, [table]); return r.rows[0]?.rel !== null; } catch { return false; }
}

interface Source {
  ws: WorkspaceId;
  table: string;
  /** Distinguishes two readings of one table (decisions: changed vs review due). */
  tag?: string;
  cols: string;
  /** SQL over $1 = since, $2 = asOf. CONSTANTS ONLY — never caller input. */
  where: string;
  orderBy: string;
  kind: WatchKind;
  title: (r: Row) => string;
  detail: (r: Row) => string;
  href: string;
  at: (r: Row) => string | null;
}

const SOURCES: readonly Source[] = [
  { ws: 'sales', table: 'deals', cols: 'id, stage, won_at, updated_at', where: 'updated_at > $1', orderBy: 'updated_at DESC', kind: 'money',
    title: (r) => `deal ${String(r.stage)}`, detail: (r) => `deals · stage ${String(r.stage)}${r.won_at ? ` · won ${stamp(iso(r.won_at) ?? '')}` : ''}`, href: '/deal-board', at: (r) => iso(r.updated_at) },
  { ws: 'sales', table: 'handoffs', cols: 'id, status, updated_at', where: 'updated_at > $1', orderBy: 'updated_at DESC', kind: 'activity',
    title: (r) => `reply ${String(r.status).replace(/_/g, ' ')}`, detail: (r) => `handoffs · ${String(r.status)}`, href: '/outreach', at: (r) => iso(r.updated_at) },
  { ws: 'sales', table: 'tasks', cols: 'id, title, due_at', where: "completed_at IS NULL AND due_at IS NOT NULL AND due_at <= $2::timestamptz + interval '48 hours'", orderBy: 'due_at ASC', kind: 'deadline',
    title: (r) => `task due: ${String(r.title ?? '').slice(0, 60)}`, detail: (r) => `tasks · due ${stamp(iso(r.due_at) ?? '')} (horizon 48 h)`, href: '/tasks', at: (r) => iso(r.due_at) },
  { ws: 'gps', table: 'gps_engagement', cols: 'id, status, accepted_at, deposit_paid_at, updated_at', where: 'updated_at > $1', orderBy: 'updated_at DESC', kind: 'money',
    title: (r) => `engagement ${String(r.status).replace(/_/g, ' ')}`, detail: (r) => `gps_engagement · ${String(r.status)}${r.deposit_paid_at ? ` · deposit paid ${stamp(iso(r.deposit_paid_at) ?? '')}` : ''}${r.accepted_at ? ` · accepted ${stamp(iso(r.accepted_at) ?? '')}` : ''}`, href: '/gps', at: (r) => iso(r.updated_at) },
  { ws: 'gps', table: 'gps_demand_candidate', cols: 'id, project_name, status, created_at, decided_at', where: 'COALESCE(decided_at, created_at) > $1', orderBy: 'COALESCE(decided_at, created_at) DESC', kind: 'activity',
    title: (r) => `demand candidate ${String(r.status)}: ${String(r.project_name ?? '').slice(0, 50)}`, detail: (r) => `gps_demand_candidate · ${String(r.status)}`, href: '/gps/origination', at: (r) => iso(r.decided_at) ?? iso(r.created_at) },
  { ws: 'gps', table: 'gps_invoice', cols: 'id, status, amount_cents, currency, issued_at, paid_at, disputed_at, voided_at', where: 'GREATEST(issued_at, COALESCE(paid_at, issued_at), COALESCE(disputed_at, issued_at), COALESCE(voided_at, issued_at)) > $1', orderBy: 'GREATEST(issued_at, COALESCE(paid_at, issued_at), COALESCE(disputed_at, issued_at), COALESCE(voided_at, issued_at)) DESC', kind: 'money',
    title: (r) => `invoice ${String(r.status)} · ${money(r.amount_cents, r.currency)}`, detail: (r) => `gps_invoice · ${String(r.status)}`, href: '/gps/delivery',
    at: (r) => iso(r.voided_at) ?? iso(r.disputed_at) ?? iso(r.paid_at) ?? iso(r.issued_at) },
  { ws: 'gps', table: 'gps_milestone', cols: 'id, name, due_by', where: "completed_at IS NULL AND due_by IS NOT NULL AND due_by <= $2::timestamptz + interval '7 days'", orderBy: 'due_by ASC', kind: 'deadline',
    title: (r) => `milestone due: ${String(r.name ?? '').slice(0, 60)}`, detail: (r) => `gps_milestone · due ${stamp(iso(r.due_by) ?? '')} (horizon 7 d)`, href: '/gps/delivery', at: (r) => iso(r.due_by) },
  { ws: 'marketing', table: 'marketing_record', cols: 'id, cleared_at, published_at, withdrawn_at, close_out_state, updated_at', where: 'updated_at > $1', orderBy: 'updated_at DESC', kind: 'liability',
    title: (r) => `marketing record ${r.withdrawn_at ? 'withdrawn' : r.published_at ? 'published' : r.cleared_at ? 'cleared' : 'drafted'}`, detail: (r) => `marketing_record${r.close_out_state ? ` · close-out ${String(r.close_out_state)}` : ''}`, href: '/marketing/record', at: (r) => iso(r.updated_at) },
  { ws: 'governance', table: 'decisions', cols: 'id, title, outcome_at, updated_at', where: 'updated_at > $1', orderBy: 'updated_at DESC', kind: 'liability',
    title: (r) => `decision: ${String(r.title ?? '').slice(0, 60)}`, detail: (r) => `decisions${r.outcome_at ? ` · outcome recorded ${stamp(iso(r.outcome_at) ?? '')}` : ' · open'}`, href: '/decisions', at: (r) => iso(r.updated_at) },
  { ws: 'governance', table: 'decisions', tag: 'review', cols: 'id, title, review_by', where: "outcome_at IS NULL AND review_by IS NOT NULL AND review_by <= $2::timestamptz + interval '7 days'", orderBy: 'review_by ASC', kind: 'deadline',
    title: (r) => `decision review due: ${String(r.title ?? '').slice(0, 60)}`, detail: (r) => `decisions · review by ${stamp(iso(r.review_by) ?? '')} (horizon 7 d)`, href: '/decisions', at: (r) => iso(r.review_by) },
];

export async function composeWatch(pool: pg.Pool, actorId: string, sinceIso: string, asOfIso: string): Promise<WatchResponse> {
  const ents: EntitlementMap = await loadEntitlements(pool, actorId);
  const holds = (ws: WorkspaceId) => capAtLeast(ents[ws], 'view');
  const drafts: Draft[] = [];
  const absent: string[] = [];
  const since = new Date(sinceIso);
  const asOf = new Date(asOfIso);

  /* 1 · AUDIT — every governed write and purpose access since the watermark, filed by entity. */
  if (await has(pool, 'audit_log')) {
    try {
      const r = await pool.query(
        `SELECT id, actor, action, entity, entity_id, created_at FROM audit_log WHERE created_at > $1 ORDER BY created_at DESC LIMIT 500`, [since]);
      for (const row of r.rows as Array<{ id: unknown; actor: string; action: string; entity: string | null; entity_id: string | null; created_at: unknown }>) {
        const ws = workspaceOf(row.entity);
        if (!holds(ws)) continue;
        const at = iso(row.created_at); if (!at) continue;
        drafts.push({
          id: `audit:${ws}:${row.entity ?? '-'}:${String(row.id)}`, workspace: ws,
          kind: kindOf(row.action, row.entity),
          title: row.action.replace(/[._:]/g, ' '),
          detail: `${row.actor} · ${row.entity ?? 'no entity'}${row.entity_id ? ` ${String(row.entity_id).slice(0, 8)}` : ''}`,
          href: row.entity === 'projects' && row.entity_id ? `/bd-pipeline/${row.entity_id}` : null,
          at, source: 'audit',
        });
      }
    } catch (err) { absent.push(`audit_log could not be read: ${(err as Error).message.slice(0, 80)}`); }
  } else absent.push('audit_log does not exist on this environment — governed writes cannot be watched.');

  /* 2 · TABLE READINGS — deltas past the watermark, and deadlines within their stated horizon. */
  const missing = new Set<string>();
  for (const s of SOURCES) {
    if (!holds(s.ws)) continue;
    if (missing.has(s.table)) continue;
    if (!(await has(pool, s.table))) { missing.add(s.table); absent.push(`${s.table} does not exist on this environment.`); continue; }
    try {
      /* BIND EXACTLY WHAT THE CLAUSE REFERENCES (2026-09-04). Every source was bound [since, asOf]; seven of ten clauses reference only
         $1 and Postgres refuses: "bind message supplies 2 parameters, but prepared statement requires 1" — the top bar carried that
         sentence on every desk. The three deadline clauses reference only $2, which leaves $1 unused and untyped — refused as well.
         So: a clause that uses $2 alone is rewritten to $1 and bound [asOf]; one that uses both is bound [since, asOf]; the rest [since]. */
      const usesSince = /\$1\b/.test(s.where), usesAsOf = /\$2\b/.test(s.where);
      const where = usesAsOf && !usesSince ? s.where.replace(/\$2\b/g, '$1') : s.where;
      const params = usesAsOf && usesSince ? [since, asOf] : usesAsOf ? [asOf] : [since];
      const r = await pool.query(`SELECT ${s.cols} FROM ${s.table} WHERE ${where} ORDER BY ${s.orderBy} LIMIT 100`, params);
      for (const row of r.rows as Row[]) {
        const at = s.at(row); if (!at) continue;
        drafts.push({ id: `table:${s.ws}:${s.table}${s.tag ? `#${s.tag}` : ''}:${String(row.id)}`, workspace: s.ws, kind: s.kind, title: s.title(row), detail: s.detail(row), href: s.href, at, source: 'table' });
      }
    } catch (err) { absent.push(`${s.table} could not be read: ${(err as Error).message.slice(0, 80)}`); }
  }

  /* 3 · NOTIFICATIONS — the bus's own alerts, carrying their compartment since 0067. */
  if (await has(pool, 'notifications')) {
    try {
      const r = await pool.query(`SELECT id, rule, title, detail, href, workspace, created_at FROM notifications WHERE created_at > $1 ORDER BY created_at DESC LIMIT 100`, [since]);
      for (const row of r.rows as Array<{ id: unknown; rule: string; title: string; detail: string | null; href: string | null; workspace: string | null; created_at: unknown }>) {
        const ws = (row.workspace ?? 'sales') as WorkspaceId;
        if (!holds(ws)) continue;
        const at = iso(row.created_at); if (!at) continue;
        drafts.push({ id: `notification:${ws}:${row.rule}:${String(row.id)}`, workspace: ws, kind: /stalled|deadline|due|overdue/.test(row.rule) ? 'deadline' : 'activity', title: row.title, detail: row.detail ?? row.rule, href: row.href, at, source: 'notification' });
      }
    } catch (err) { absent.push(`notifications could not be read: ${(err as Error).message.slice(0, 80)}`); }
  }

  if (holds('gps')) {
    /* 4 · LIABILITY THAT WRITES NO ROW — perimeter reviews expiring, read from the view the wall uses. */
    try {
      const view = perimeterView(await loadPerimeter(pool), asOfIso);
      const warnMs = view.reviewWarningDays * 86_400_000;
      for (const cell of view.cells) {
        if (cell.id === null) continue; // compiled placeholder — not a position anyone entered
        const reviewBy = Date.parse(cell.entry.reviewBy);
        if (!Number.isFinite(reviewBy)) continue;
        const left = reviewBy - asOf.getTime();
        if (left > warnMs) continue;
        drafts.push({
          id: `perimeter:gps:${cell.jurisdiction}:${cell.offerKey}`, workspace: 'gps', kind: 'liability',
          title: left < 0
            ? `perimeter review OVERDUE: ${cell.jurisdictionLabel} · ${cell.offerName}`
            : `perimeter review due in ${Math.ceil(left / 86_400_000)} d: ${cell.jurisdictionLabel} · ${cell.offerName}`,
          detail: `entered by ${cell.entry.enteredBy}; review by ${cell.entry.reviewBy.slice(0, 10)}${cell.reviewedBy ? `; reviewed by ${cell.reviewedBy}` : '; NOT yet reviewed'}`,
          href: '/gps/conflict', at: cell.entry.reviewBy, source: 'perimeter',
        });
      }
    } catch (err) { absent.push(`perimeter could not be read: ${(err as Error).message.slice(0, 80)}`); }

    /* 5 · MONEY THAT WRITES NO ROW — open invoices aging, from the register's own summary. */
    const migrated = await isInvoiceMigrated(pool);
    if (migrated === true) {
      try {
        const aging = await invoiceAgingSummary(pool, asOfIso);
        if (aging.openCount > 0) {
          const brackets = aging.brackets.filter((b) => b.count > 0).map((b) => `${b.count} ${b.label}`).join(', ');
          drafts.push({
            id: 'invoice:gps:aging', workspace: 'gps', kind: 'money',
            title: `${aging.openCount} open invoice${aging.openCount === 1 ? '' : 's'} · ${brackets}`,
            detail: aging.currenciesPresent.length > 1
              ? `outstanding across ${aging.currenciesPresent.join(', ')} — not summed`
              : `${money(aging.openAmountCents, aging.currenciesPresent[0])} outstanding${aging.unagedCount > 0 ? ` · ${aging.unagedCount} could not be aged` : ''}`,
            href: '/gps/delivery', at: asOfIso, source: 'invoice',
          });
        }
      } catch (err) { absent.push(`invoice aging could not be read: ${(err as Error).message.slice(0, 80)}`); }
    } else if (migrated === false) absent.push('gps_invoice does not exist on this environment.');
  }

  /* RANK, CAP, ROOM. */
  const ranked = rankWatchItems(drafts);
  const byWorkspace: WatchResponse['byWorkspace'] = {};
  for (const ws of Object.keys(ents) as WorkspaceId[]) {
    if (!holds(ws)) continue;
    const mine = ranked.filter((it) => it.workspace === ws);
    byWorkspace[ws] = { changed: mine.length, top: mine[0] ?? null };
  }
  if (ranked.length === 0) absent.push(nothingRecordedSince(sinceIso));
  return {
    since: sinceIso,
    asOf: asOfIso,
    items: ranked.slice(0, WATCH_CAP),
    byWorkspace,
    unranked: Math.max(0, ranked.length - WATCH_CAP),
    absent,
    rankingBasis: 'stated_prior',
  };
}
