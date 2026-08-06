import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const dialect = new PgDialect();
const rendered: { sql: string; params: unknown[] }[] = [];

interface LedgerRow {
  id: string;
  rule: string;
  title: string;
  detail: string | null;
  project_id: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
  workspace: string;
}

const ledger: {
  items: LedgerRow[];
  unread: number;
  withheld: number;
  unattributed: number;
  throws: (Error & { code?: string }) | null;
} = { items: [], unread: 0, withheld: 0, unattributed: 0, throws: null };

function row(over: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: 'n1',
    rule: 'deal_stalled',
    title: 'Deal stalled: Acme',
    detail: 'd',
    project_id: 'p1',
    href: '/deal-board',
    read_at: null,
    created_at: '2026-08-06T06:00:00.000Z',
    workspace: 'sales',
    ...over,
  };
}

function execute(q: SQL) {
  const { sql, params } = dialect.sqlToQuery(q);
  const flat = sql.replace(/\s+/g, ' ').trim();
  rendered.push({ sql: flat, params });
  if (ledger.throws) return Promise.reject(ledger.throws);
  if (flat.includes('FILTER (WHERE workspace IS NULL)')) {
    return Promise.resolve({ rows: [{ withheld: ledger.withheld, unattributed: ledger.unattributed }], rowCount: 1 });
  }
  if (flat.includes('COUNT(*) AS n')) return Promise.resolve({ rows: [{ n: ledger.unread }], rowCount: 1 });
  return Promise.resolve({ rows: ledger.items, rowCount: ledger.items.length });
}

vi.mock('../../db/index.js', () => ({
  getDb: () => ({ execute }),
  getPool: () => ({ query: () => Promise.resolve({ rows: [], rowCount: 0 }) }),
  closeDb: async () => {},
  checkDb: async () => ({ ok: true }),
}));

const { composeReadout, READOUT_CODES } = await import('../readout.js');
const { DESK_SCOPE } = await import('../service.js');

const NOW = new Date('2026-08-06T07:00:00.000Z');
const DSN = 'postgresql://lcx:secret@db.abcd.supabase.co:5432/postgres';

beforeEach(() => {
  rendered.length = 0;
  ledger.items = [];
  ledger.unread = 0;
  ledger.withheld = 0;
  ledger.unattributed = 0;
  ledger.throws = null;
});

describe('ATTACK', () => {
  it('A: unplaceable-only -> genuinely_empty claims the ledger holds no item for the reader', async () => {
    ledger.items = [row({ id: 'bad', created_at: 'not-a-date' })];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    console.log('A state =', r.state);
    console.log('A unplaceable count =', r.counts.unplaceable, 'len', r.unplaceable.length);
    console.log('A codes =', r.refusals.map((x) => x.code).join(','));
    console.log('A empty sentence =', r.refusals.find((x) => x.code === READOUT_CODES.WINDOW_GENUINELY_EMPTY)?.sentence);
    console.log('A redaction statement =', r.redaction.statement);
    expect(true).toBe(true);
  });

  it('B: a future-dated row vanishes with no count and no refusal', async () => {
    ledger.items = [row({ id: 'future', created_at: '2026-08-06T07:00:01.000Z' })];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    console.log('B state =', r.state);
    console.log('B fetched/inWindow/unplaceable =', r.counts.fetched, r.counts.inWindow, r.counts.unplaceable);
    console.log('B items =', JSON.stringify(r.items));
    console.log('B codes =', r.refusals.map((x) => x.code).join(','));
    console.log('B empty sentence =', r.refusals.find((x) => x.code === READOUT_CODES.WINDOW_GENUINELY_EMPTY)?.sentence?.slice(0, 160));
    expect(true).toBe(true);
  });

  it('C: scopes=[] -> a reader holding nothing gets genuinely_empty and unread 0', async () => {
    ledger.items = [];
    const r = await composeReadout([], { now: NOW, databaseUrl: DSN });
    console.log('C state =', r.state);
    console.log('C counts =', JSON.stringify(r.counts));
    console.log('C scopes on frame =', JSON.stringify(r.frame.scopes));
    console.log('C sentence =', r.refusals.find((x) => x.code === READOUT_CODES.WINDOW_GENUINELY_EMPTY)?.sentence?.slice(0, 200));
    console.log('C redaction statement =', r.redaction.statement.slice(0, 220));
    expect(true).toBe(true);
  });

  it('D: negative / huge / unicode-minus / Infinity fetch+window', async () => {
    ledger.items = [row()];
    for (const w of [-5, 1e21, Infinity, -Infinity, Number('−5'), 0.4, 719.9]) {
      const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, windowHours: w, databaseUrl: DSN });
      console.log(`D window=${String(w)} -> applied ${r.frame.windowHours} from ${r.frame.windowFrom} clamped=${r.refusals.some((x) => x.code === READOUT_CODES.OPTIONS_CLAMPED)}`);
    }
    for (const f of [-1, 0, 0.5, 1e9, NaN]) {
      const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, fetch: f, databaseUrl: DSN });
      console.log(`D fetch=${String(f)} -> clamped=${r.refusals.some((x) => x.code === READOUT_CODES.OPTIONS_CLAMPED)} truncated=${r.refusals.some((x) => x.code === READOUT_CODES.TRUNCATED)} fetched=${r.counts.fetched}`);
    }
    expect(true).toBe(true);
  });

  it('E: truncation relies on the service order; a non-DESC ledger mis-reports', async () => {
    // Same two rows the builder test uses, order reversed (oldest first).
    ledger.items = [
      row({ id: 'b', created_at: '2026-07-01T05:00:00.000Z' }),
      row({ id: 'a', created_at: '2026-08-06T06:00:00.000Z' }),
    ];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, fetch: 2, databaseUrl: DSN });
    console.log('E truncated =', r.refusals.some((x) => x.code === READOUT_CODES.TRUNCATED), 'inWindow', r.counts.inWindow);
    expect(true).toBe(true);
  });

  it('F: duplicate ids collapse in items (page keys) and rank', async () => {
    ledger.items = [row({ id: 'dup' }), row({ id: 'dup', title: 'second' })];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    console.log('F items =', r.items!.map((i) => `${i.rank}:${i.id}:${i.title}`).join(' | '));
    expect(true).toBe(true);
  });

  it('G: ageHours for an item exactly at windowFrom, and an unattributed-only ledger', async () => {
    ledger.items = [];
    ledger.unattributed = 4;
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    console.log('G state =', r.state, 'withheld', r.redaction.withheld, 'unattributed', r.redaction.unattributed);
    console.log('G codes =', r.refusals.map((x) => x.code).join(','));
    expect(true).toBe(true);
  });

  it('H: environment label edge inputs', async () => {
    ledger.items = [row()];
    for (const dsn of ['', '   ', 'postgres://u:p@/db', 'postgresql://u:p@localhost:5432/', 'javascript:alert(1)', 'postgres://u:p@1.2.3.4:5432/db?sslmode=require#frag']) {
      const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: dsn });
      console.log(`H dsn=${JSON.stringify(dsn)} -> ${JSON.stringify(r.frame.environment)} unnamed=${r.refusals.some((x) => x.code === READOUT_CODES.ENVIRONMENT_UNNAMED)}`);
    }
    expect(true).toBe(true);
  });
});
