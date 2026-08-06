/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE 07:00 READOUT — what it must never be able to say.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The readout is the one surface here that TELLS rather than waits to be asked, so
 * the failure worth guarding is not a missing field: it is the brief reading CALM
 * when the truthful answer is "there is material you cannot see", or "the read never
 * happened", or "this is a recency order and you are treating it as a severity one".
 *
 * ── WHAT EACH GROUP DEFENDS ──────────────────────────────────────────────────
 *  1. The withheld count is surfaced and correct for a reader with partial
 *     entitlements, and a reader who does not hold a compartment learns THAT items
 *     exist there without learning WHAT they are.
 *  2. Not-loaded, present-but-withheld and genuinely-empty are three distinguishable
 *     payloads, each under its own stable code. None of them is an empty list.
 *  3. The ranking basis is NAMED on the payload, it is recency, and the payload says
 *     what it deliberately is not.
 *  4. The ObservationFrame and the environment label are present, and an unnameable
 *     database refuses instead of guessing.
 *  5. The scope filter arrives at Postgres as BOUND PARAMETERS and is never
 *     concatenated — rendered through drizzle's own dialect, so this asserts what the
 *     database would actually receive rather than what a template looks like.
 *
 * The db module is mocked the same way `needToKnow.test.ts` mocks it, for the same
 * reason: the statements are captured as Postgres would see them.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { WORKSPACES } from '@lcx/shared';

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

/** What the fake ledger will answer with. Reset per test. */
const ledger: {
  items: LedgerRow[];
  unread: number;
  withheld: number;
  unattributed: number;
  /** When set, every statement throws this — the NOT LOADED path. */
  throws: (Error & { code?: string }) | null;
} = { items: [], unread: 0, withheld: 0, unattributed: 0, throws: null };

function row(over: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: 'n1',
    rule: 'deal_stalled',
    title: 'Deal stalled: Acme',
    detail: 'no movement for 9 days in diligence',
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
    return Promise.resolve({
      rows: [{ withheld: ledger.withheld, unattributed: ledger.unattributed }],
      rowCount: 1,
    });
  }
  if (flat.includes('COUNT(*) AS n')) {
    return Promise.resolve({ rows: [{ n: ledger.unread }], rowCount: 1 });
  }
  return Promise.resolve({ rows: ledger.items, rowCount: ledger.items.length });
}

vi.mock('../../db/index.js', () => ({
  getDb: () => ({ execute }),
  getPool: () => ({ query: () => Promise.resolve({ rows: [], rowCount: 0 }) }),
  closeDb: async () => {},
  checkDb: async () => ({ ok: true }),
}));

const { composeReadout, READOUT_CODES, READOUT_CONTRACT } = await import('../readout.js');
const { DESK_SCOPE } = await import('../service.js');

/** Fixed clock so the window boundaries in the assertions are arithmetic, not luck. */
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

const codes = (r: { refusals: readonly { code: string }[] }) => r.refusals.map((x) => x.code);
const sentence = (r: { refusals: readonly { code: string; sentence: string }[] }, code: string) =>
  r.refusals.find((x) => x.code === code)?.sentence ?? '';

/* ════════════════════════════════════════════════════════════════════════════
 *  1. THE VISIBLE REDACTION
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the redaction is visible', () => {
  it('surfaces the withheld count for a reader with partial entitlements', async () => {
    ledger.items = [row()];
    ledger.withheld = 3;
    ledger.unread = 1;

    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });

    expect(r.redaction.withheld).toBe(3);
    expect(codes(r)).toContain(READOUT_CODES.ITEMS_WITHHELD);
    // "3 items withheld", not a shorter list. The number is in the sentence a human reads.
    expect(sentence(r, READOUT_CODES.ITEMS_WITHHELD)).toMatch(/3 item\(s\) exist in compartments you do not hold/);
    // And the compartments the reader lacks are NAMED, from the public constitution.
    expect(r.redaction.compartmentsNotHeld).toContain('gps');
    expect(r.redaction.compartmentsNotHeld).toContain('marketing');
    expect(r.redaction.compartmentsNotHeld).not.toContain('sales');
  });

  it('states that the withheld count is ledger-wide and NOT window-scoped', async () => {
    // The frames differ, and the payload says so rather than letting a reader
    // subtract one figure from the other. `service.ts` counts withheld rows over the
    // whole table on purpose, "so they do not move when `limit` does".
    ledger.items = [row()];
    ledger.withheld = 2;
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    expect(r.redaction.countFrame).toBe('whole_ledger');
    expect(sentence(r, READOUT_CODES.ITEMS_WITHHELD)).toMatch(/WHOLE LEDGER, NOT THIS WINDOW/);
  });

  it('counts unattributed rows separately from withheld ones — they are not the same fact', async () => {
    ledger.items = [row()];
    ledger.withheld = 4;
    ledger.unattributed = 2;
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    expect(r.redaction.withheld).toBe(4);
    expect(r.redaction.unattributed).toBe(2);
    expect(codes(r)).toContain(READOUT_CODES.UNATTRIBUTED_ITEMS);
    expect(sentence(r, READOUT_CODES.UNATTRIBUTED_ITEMS)).toMatch(/withheld from EVERYONE/);
    // '_desk' and NULL are deliberately distinct in the service and must not be merged here.
    expect(sentence(r, READOUT_CODES.UNATTRIBUTED_ITEMS)).toMatch(/different fact from/);
  });

  it('a reader who does not hold a compartment learns THAT items exist, never WHAT they are', async () => {
    /*
     * THE LEAK SIMULATION. The scoped query cannot return this row in a correct
     * system — that is 0067's whole point — so the fake ledger hands one back anyway,
     * which is what the pre-0067 read path did in production. The readout must be the
     * surface that drops it and says so, not the surface that republishes it.
     */
    ledger.items = [row(), row({ id: 'leak', workspace: 'gps', title: 'GPS quote for Client X at 42% discount' })];
    ledger.withheld = 5;

    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });

    // The count is published.
    expect(r.redaction.withheld).toBe(5);
    expect(r.redaction.droppedOutOfScope).toBe(1);
    expect(codes(r)).toContain(READOUT_CODES.SCOPE_MISMATCH);
    // The content is nowhere in the payload — not in items, not in a refusal sentence,
    // not in the unplaceable bucket. Asserted over the whole serialised brief.
    const whole = JSON.stringify(r);
    expect(whole).not.toContain('Client X');
    expect(whole).not.toContain('42% discount');
    expect(r.items!.every((i) => i.workspace === 'sales' || i.workspace === DESK_SCOPE)).toBe(true);
  });

  it('says plainly when nothing is withheld, rather than leaving silence to mean it', async () => {
    ledger.items = [row()];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    expect(r.redaction.withheld).toBe(0);
    expect(r.redaction.statement).toMatch(/Nothing is being withheld from you/);
    expect(codes(r)).not.toContain(READOUT_CODES.ITEMS_WITHHELD);
  });

  /*
   * THE CHANNEL THE COUNT OPENS, WHICH THE FIRST VERSION DID NOT NAME ANYWHERE.
   * "3 items withheld" is information leaving compartments the reader does not hold.
   * The trade is the constitution's and it is deliberate, but three properties of the
   * count were nowhere on the payload: it is an aggregate, it has no time bound, and
   * it moves. `redaction.channelStatement` states all three, on every payload.
   */
  it('names the channel the withheld count opens, on every payload including a quiet one', async () => {
    ledger.items = [row()];
    const quiet = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    ledger.withheld = 9;
    const noisy = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });

    for (const r of [quiet, noisy]) {
      // The aggregate, the missing time bound and the pollable delta, all three.
      expect(r.redaction.channelStatement).toMatch(/AGGREGATE/);
      expect(r.redaction.channelStatement).toMatch(/NO time bound/);
      expect(r.redaction.channelStatement).toMatch(/comparing two reads minutes apart yields a delta/);
    }
    // `withheld: 0` is a statement about other compartments too, so the quiet payload
    // carries the same sentence rather than omitting it as uninteresting.
    expect(quiet.redaction.withheld).toBe(0);
    expect(quiet.redaction.channelStatement).toBe(noisy.redaction.channelStatement);
  });

  it('says the aggregate is one compartment’s own counter when only one is unheld', async () => {
    /*
     * THE DEGENERATE CASE, WHICH IS THE SHARP ONE. A reader holding every compartment
     * but one is not reading an aggregate at all — they are reading that compartment's
     * exact ledger-wide alert count, and its delta. Naming the compartment is safe
     * (WORKSPACES is the public constitution and `compartmentsNotHeld` already lists
     * it); NOT naming what the number becomes is what left the reader mis-reading it.
     */
    const all = WORKSPACES.map((w) => w.id);
    const allButGps = all.filter((id) => id !== 'gps');
    ledger.items = [row()];
    ledger.withheld = 4;

    const r = await composeReadout([...allButGps, DESK_SCOPE], { now: NOW, databaseUrl: DSN });

    expect(r.redaction.compartmentsNotHeld).toEqual(['gps']);
    expect(r.redaction.channelStatement).toMatch(/NOT an aggregate/);
    expect(r.redaction.channelStatement).toMatch(/gps's own alert count, read directly/);
  });

  it('publishes the channel statement even when the counts could not be read', async () => {
    // NOT LOADED closes the channel — it carried nothing — but what it WOULD carry is
    // part of reading the brief, and must not depend on a number arriving.
    ledger.throws = new Error('connection terminated unexpectedly');
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    expect(r.redaction.withheld).toBeNull();
    expect(r.redaction.channelStatement).toMatch(/NO time bound/);
  });

  it('never prints an empty compartment list into a sentence a human reads', async () => {
    /*
     * `[].join(', ')` is the empty string, and it reached three sentences: "no item for
     * your compartments () between …" reads as an unknown set rather than an empty one.
     * A reader holding nothing is also a fourth case that must not be filed as a quiet
     * window — the item query is not even run for them.
     */
    ledger.items = [];
    const r = await composeReadout([], { now: NOW, databaseUrl: DSN });

    expect(codes(r)).toContain(READOUT_CODES.NO_COMPARTMENTS_HELD);
    expect(sentence(r, READOUT_CODES.NO_COMPARTMENTS_HELD)).toMatch(/fact about your entitlements/);
    const whole = JSON.stringify(r);
    expect(whole).not.toMatch(/compartments \(\)/);
    expect(whole).not.toMatch(/scopes \(\)/);
    expect(r.redaction.channelStatement).toMatch(/you do not hold \(/);
  });

  it('does not cry NO_COMPARTMENTS_HELD at a reader who holds one', async () => {
    ledger.items = [row()];
    const r = await composeReadout([DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    expect(codes(r)).not.toContain(READOUT_CODES.NO_COMPARTMENTS_HELD);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  2. THE THREE STATES
 * ════════════════════════════════════════════════════════════════════════════ */
describe('not-loaded, withheld-only and genuinely-empty are three payloads', () => {
  it('NOT LOADED: an absent relation gives items null and every count null, never 0', async () => {
    const err = new Error('relation "notifications" does not exist') as Error & { code?: string };
    err.code = '42P01';
    ledger.throws = err;

    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });

    expect(r.state).toBe('not_loaded');
    expect(r.items).toBeNull();
    expect(codes(r)).toContain(READOUT_CODES.LEDGER_ABSENT);
    // A fabricated zero here would be a claim that the window was examined.
    expect(Object.values(r.counts).every((v) => v === null)).toBe(true);
    expect(r.redaction.withheld).toBeNull();
    expect(r.redaction.unattributed).toBeNull();
    expect(sentence(r, READOUT_CODES.LEDGER_ABSENT)).toMatch(/not a report that nothing happened/i);
    expect(codes(r)).not.toContain(READOUT_CODES.WINDOW_GENUINELY_EMPTY);
  });

  it('NOT LOADED: any other read fault gets its own code, not the migration one', async () => {
    ledger.throws = new Error('connection terminated unexpectedly');
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    expect(r.state).toBe('not_loaded');
    expect(codes(r)).toContain(READOUT_CODES.READ_FAILED);
    expect(codes(r)).not.toContain(READOUT_CODES.LEDGER_ABSENT);
    expect(sentence(r, READOUT_CODES.READ_FAILED)).toMatch(/absence of items below is the absence of a read/i);
  });

  it('PRESENT-BUT-WITHHELD: an empty window with withheld rows is not an empty window', async () => {
    ledger.items = [];
    ledger.withheld = 7;

    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });

    expect(r.state).toBe('withheld_only');
    expect(r.items).toEqual([]);
    expect(r.redaction.withheld).toBe(7);
    expect(codes(r)).toContain(READOUT_CODES.ITEMS_WITHHELD);
    // It must NOT also claim the window was genuinely quiet.
    expect(codes(r)).not.toContain(READOUT_CODES.WINDOW_GENUINELY_EMPTY);
  });

  it('GENUINELY EMPTY: the claim names the window and refuses to mean anything else', async () => {
    ledger.items = [];

    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });

    expect(r.state).toBe('genuinely_empty');
    expect(codes(r)).toContain(READOUT_CODES.WINDOW_GENUINELY_EMPTY);
    const s = sentence(r, READOUT_CODES.WINDOW_GENUINELY_EMPTY);
    // The window is IN the claim. "Nothing happened" is only interpretable beside it.
    expect(s).toContain('2026-08-05T07:00:00.000Z');
    expect(s).toContain('2026-08-06T07:00:00.000Z');
    expect(s).toMatch(/CLAIM ABOUT THIS WINDOW/);
    expect(s).not.toMatch(/all clear/i);
  });

  it('an item OUTSIDE the window does not make the window non-empty', async () => {
    // 30 hours old against a 24-hour window: the read succeeded, the window is empty,
    // and the item is not silently promoted into it to avoid an empty list.
    ledger.items = [row({ created_at: '2026-08-05T01:00:00.000Z' })];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    expect(r.state).toBe('genuinely_empty');
    expect(r.counts.fetched).toBe(1);
    expect(r.counts.inWindow).toBe(0);
  });

  it('an unreadable instant is held unranked rather than dropped or placed', async () => {
    ledger.items = [row(), row({ id: 'bad', created_at: 'not-a-date' })];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    expect(r.counts.unplaceable).toBe(1);
    expect(r.unplaceable[0]!.rawCreatedAt).toBe('not-a-date');
    expect(codes(r)).toContain(READOUT_CODES.ITEM_INSTANT_UNREADABLE);
    expect(r.items!.map((i) => i.id)).toEqual(['n1']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  3. THE RANK, WHICH IS NAMED
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the ranking basis is on the payload and it does not lie', () => {
  it('names recency as the basis, the direction and the column', async () => {
    ledger.items = [row()];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    expect(r.ranking.basis).toBe('recency');
    expect(r.ranking.direction).toBe('newest_first');
    expect(r.ranking.field).toBe('notifications.created_at');
    expect(r.ranking.statement).toMatch(/NOT a severity order/);
  });

  it('publishes what it is NOT ranked by, with reasons, including frequency-as-magnitude', async () => {
    ledger.items = [row()];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    const keys = r.ranking.notRankedBy.map((b) => b.key);
    expect(keys).toContain('severity');
    expect(keys).toContain('frequency_as_magnitude');
    expect(keys).toContain('consequence_score');
    // The one this platform already shipped once must carry its reason, not just its name.
    expect(r.ranking.notRankedBy.find((b) => b.key === 'frequency_as_magnitude')!.why)
      .toMatch(/criticality as a frequency/);
    for (const b of r.ranking.notRankedBy) expect(b.why.length).toBeGreaterThan(40);
  });

  it('orders newest first and ranks from 1, with unread NOT moving the order', async () => {
    ledger.items = [
      row({ id: 'old', created_at: '2026-08-06T01:00:00.000Z', read_at: null }),
      row({ id: 'new', created_at: '2026-08-06T06:30:00.000Z', read_at: '2026-08-06T06:40:00.000Z' }),
    ];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    // The READ item is newer, so it is first. Unread-first would invert this, and the
    // payload says unread is a fact about the reader rather than about the item.
    expect(r.items!.map((i) => i.id)).toEqual(['new', 'old']);
    expect(r.items!.map((i) => i.rank)).toEqual([1, 2]);
    expect(r.items![0]!.unread).toBe(false);
    expect(r.items![1]!.unread).toBe(true);
    expect(r.items![0]!.ageHours).toBe(0.5);
  });

  it('admits when the order is over a subset instead of implying it is the whole window', async () => {
    // Cap of 2, both fetched items inside the window: the window may hold more.
    ledger.items = [
      row({ id: 'a', created_at: '2026-08-06T06:00:00.000Z' }),
      row({ id: 'b', created_at: '2026-08-06T05:00:00.000Z' }),
    ];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, fetch: 2, databaseUrl: DSN });
    expect(codes(r)).toContain(READOUT_CODES.TRUNCATED);
    expect(sentence(r, READOUT_CODES.TRUNCATED)).toMatch(/recency order over a SUBSET/);
  });

  it('does NOT cry truncation when the cap was reached with older rows outside the window', async () => {
    // The oldest fetched row predates the window, so the window is complete. Firing
    // here would make the admission meaningless by firing on every full page.
    ledger.items = [
      row({ id: 'a', created_at: '2026-08-06T06:00:00.000Z' }),
      row({ id: 'b', created_at: '2026-07-01T05:00:00.000Z' }),
    ];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, fetch: 2, databaseUrl: DSN });
    expect(r.counts.inWindow).toBe(1);
    expect(codes(r)).not.toContain(READOUT_CODES.TRUNCATED);
  });

  it('refuses when the cap was reached and NOTHING fetched had a readable instant', async () => {
    /*
     * THE CASE COMPLETENESS WAS ASSERTED BY SILENCE IN. The evidence that the fetch
     * reached back past the start of the window is the OLDEST INSTANT fetched. When
     * every fetched row has an unreadable timestamp there is no such evidence, and the
     * first version required `oldestPlaced !== null` before it would refuse — so a full
     * page of unreadable rows produced a brief presenting an unexamined window as an
     * examined one. Unknown is not complete, and it is not "subset" either: there may be
     * no further items at all, so the sentence says UNKNOWN rather than picking a side.
     */
    ledger.items = [
      row({ id: 'x', created_at: 'not-a-date' }),
      row({ id: 'y', created_at: 'also-not-a-date' }),
    ];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, fetch: 2, databaseUrl: DSN });

    expect(r.counts.unplaceable).toBe(2);
    expect(codes(r)).toContain(READOUT_CODES.TRUNCATED);
    const s = sentence(r, READOUT_CODES.TRUNCATED);
    expect(s).toMatch(/NOT ONE of the items fetched carries a readable instant/);
    expect(s).toMatch(/UNKNOWN — not known to be complete and not known to be short/);
    // It must not claim a subset, which would assert further items exist.
    expect(s).not.toMatch(/recency order over a SUBSET/);
  });

  it('does not fire the unknown-reach refusal when the cap was NOT reached', async () => {
    // Same unreadable rows, cap not reached: the reader's whole history came back, so
    // the window IS complete and the only fault is that the rows cannot be ranked.
    ledger.items = [row({ id: 'x', created_at: 'not-a-date' })];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, fetch: 5, databaseUrl: DSN });
    expect(codes(r)).toContain(READOUT_CODES.ITEM_INSTANT_UNREADABLE);
    expect(codes(r)).not.toContain(READOUT_CODES.TRUNCATED);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  4. THE FRAME, THE LABEL, AND THE 07:00 THAT IS NOT TRUE
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the observation frame', () => {
  it('carries what was observed, when, over what window, and from which database', async () => {
    ledger.items = [row()];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, windowHours: 12, databaseUrl: DSN });
    expect(r.contract).toBe(READOUT_CONTRACT);
    expect(r.frame.observedAt).toBe('2026-08-06T07:00:00.000Z');
    expect(r.frame.windowFrom).toBe('2026-08-05T19:00:00.000Z');
    expect(r.frame.windowTo).toBe('2026-08-06T07:00:00.000Z');
    expect(r.frame.windowHours).toBe(12);
    expect(r.frame.source).toBe('notifications');
    expect(r.frame.scopes).toEqual(['sales', DESK_SCOPE]);
    // The label names the environment and the database, and CREDENTIALS DO NOT SURVIVE.
    expect(r.frame.environment).toMatch(/supabase:db\.abcd\.supabase\.co\/postgres$/);
    expect(r.frame.environment).not.toContain('secret');
  });

  it('refuses to name a database it cannot read, instead of labelling it "unknown"', async () => {
    ledger.items = [row()];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: 'not a url' });
    expect(r.frame.environment).toBeNull();
    expect(codes(r)).toContain(READOUT_CODES.ENVIRONMENT_UNNAMED);
  });

  it('says on EVERY payload that nothing fires it at 07:00', async () => {
    ledger.items = [row()];
    const busy = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    ledger.items = [];
    const quiet = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    for (const r of [busy, quiet]) {
      expect(r.frame.scheduled).toBe(false);
      expect(r.frame.deliveredBy).toBe('request');
      expect(codes(r)).toContain(READOUT_CODES.NOT_SCHEDULED);
      expect(r.frame.scheduleStatement).toMatch(/NOTHING FIRES THIS AT 07:00/);
      // And it names what would have to exist for the name to be true.
      expect(r.frame.scheduleStatement).toMatch(/delivery channel/);
    }
  });

  /*
   * THE CLAIM THAT WAS FALSE, PINNED SO IT CANNOT COME BACK.
   *
   * The first version of `scheduleStatement` — on the wire and rendered on screen —
   * said "the jobs CLI that already runs the daily alert sweep is the obvious host".
   * It does not run it. `evaluateAlertRules` is reachable only through
   * `jobs/cli.ts daily_rules`; the one cron naming it is `ops/github-workflows/jobs.yml`,
   * which is not under `.github/workflows/` (that holds `ci.yml` alone), and
   * `render.yaml` declares one web service with no cron. So this surface refused its own
   * cadence in the same sentence that asserted one for the ledger it reads — `wbr_reports`
   * one level down. The assertions below are BOTH limbs: the sweep's absence is stated,
   * and the old sentence cannot return.
   */
  it('does not claim the alert sweep that fills the ledger runs on a cadence', async () => {
    ledger.items = [row()];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    expect(r.frame.scheduleStatement).toMatch(/ALERT SWEEP THAT FILLS THIS LEDGER IS NOT SCHEDULED EITHER/);
    expect(r.frame.scheduleStatement).toMatch(/uninstalled template/);
    // The exact overclaim, which read as a live daily job to anybody who saw it.
    expect(r.frame.scheduleStatement).not.toMatch(/already runs the daily alert sweep/);
  });

  it('an empty window says the ledger was quiet, never that the platform was', async () => {
    // With no sweep on a cadence, "no row written" and "no rule evaluated" are the same
    // observation from this chair. The empty state is where a reader supplies the
    // cheerful reading, so it is the state that has to say which one it can support.
    ledger.items = [];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    const s = sentence(r, READOUT_CODES.WINDOW_GENUINELY_EMPTY);
    expect(s).toMatch(/CLAIM ABOUT THE LEDGER, NOT ABOUT THE PLATFORM/);
    expect(s).toMatch(/no alert WAS RECORDED for you in this window/);
    expect(s).toMatch(/not that no condition arose/);
  });

  it('reports a clamped window rather than silently describing a different one', async () => {
    ledger.items = [row()];
    // 0 clamps to the BOUND (1), not to the default (24): a request that named a window
    // is honoured as closely as the bounds allow, and only an ABSENT parameter takes the
    // default. Either way the substitution is stated.
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, windowHours: 0, databaseUrl: DSN });
    expect(r.frame.windowHours).toBe(1);
    expect(codes(r)).toContain(READOUT_CODES.OPTIONS_CLAMPED);
    expect(sentence(r, READOUT_CODES.OPTIONS_CLAMPED)).toMatch(/requested as 0 and applied as 1/);
    // And the frame describes the window that was READ, not the one that was asked for.
    expect(r.frame.windowFrom).toBe('2026-08-06T06:00:00.000Z');
  });

  it('falls back to the default only when nothing was asked for, and then does not refuse', async () => {
    ledger.items = [row()];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    expect(r.frame.windowHours).toBe(24);
    expect(codes(r)).not.toContain(READOUT_CODES.OPTIONS_CLAMPED);
  });

  it('a non-numeric window is refused by name rather than quietly defaulted', async () => {
    ledger.items = [row()];
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, windowHours: Number('abc'), databaseUrl: DSN });
    expect(r.frame.windowHours).toBe(24);
    expect(sentence(r, READOUT_CODES.OPTIONS_CLAMPED)).toMatch(/requested as not a number/);
  });

  it('returns EVERY refusal that applies, not the first one found', async () => {
    ledger.items = [row({ id: 'bad', created_at: 'not-a-date' })];
    ledger.withheld = 1;
    ledger.unattributed = 1;
    const r = await composeReadout(['sales', DESK_SCOPE], { now: NOW, windowHours: 99999, databaseUrl: 'nope' });
    for (const c of [
      READOUT_CODES.NOT_SCHEDULED,
      READOUT_CODES.OPTIONS_CLAMPED,
      READOUT_CODES.ENVIRONMENT_UNNAMED,
      READOUT_CODES.ITEM_INSTANT_UNREADABLE,
      READOUT_CODES.ITEMS_WITHHELD,
      READOUT_CODES.UNATTRIBUTED_ITEMS,
    ]) {
      expect(codes(r)).toContain(c);
    }
    // And every one of them cites a rule with an instrument and a provision.
    for (const ref of r.refusals) {
      expect(ref.rule.instrument.length).toBeGreaterThan(0);
      expect(ref.rule.provision.length).toBeGreaterThan(0);
      expect(ref.rule.text.length).toBeGreaterThan(40);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  5. THE SCOPE FILTER IS PARAMETERISED
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the compartment filter reaches Postgres as bound parameters', () => {
  it('filters the item read to the reader’s scopes, with one bound parameter per scope', async () => {
    ledger.items = [row()];
    await composeReadout(['sales', 'gps', DESK_SCOPE], { now: NOW, databaseUrl: DSN });

    const items = rendered.filter((r) => r.sql.includes('FROM notifications WHERE workspace IN'));
    expect(items).toHaveLength(1);
    // The scopes are the leading params (LIMIT is bound too). If this ever renders as
    // inlined literals the query is string-built and one step from injection.
    expect(items[0]!.params.slice(0, 3)).toEqual(['sales', 'gps', '_desk']);
    expect(items[0]!.sql).not.toContain("'sales'");
    expect(items[0]!.sql).not.toContain("'_desk'");
  });

  it('applies the LIMIT AFTER the scope filter, so a short page is not a second channel', async () => {
    /*
     * THE SUBTLER CHANNEL, PINNED. Nothing in this lane noticed which order these two
     * clauses came in, and everything downstream depends on it:
     *
     *   filter-then-limit (what it does)  the cap counts rows the reader MAY see, so a
     *                                    full page means their own history is exhausted
     *                                    and a short page means the ledger held no more
     *                                    of THEIRS.
     *   limit-then-filter (the danger)   take n rows platform-wide, drop the ones that
     *                                    are not theirs. The SHORTFALL would then tell
     *                                    the reader exactly how many of the most recent
     *                                    n rows across every compartment were not theirs
     *                                    — per request, with no aggregation to hide
     *                                    behind, and far sharper than the withheld count.
     *
     * `counts.fetched`, the truncation arithmetic and the tile that says the window is
     * complete all read as lies under the second arrangement. This asserts the rendered
     * statement, so a refactor into JS-side filtering fails here rather than in review.
     */
    ledger.items = [row()];
    await composeReadout(['sales', DESK_SCOPE], { now: NOW, fetch: 7, databaseUrl: DSN });

    const items = rendered.filter((r) => r.sql.includes('FROM notifications WHERE workspace IN'));
    expect(items).toHaveLength(1);
    expect(items[0]!.sql).toMatch(/WHERE workspace IN \([^)]*\) ORDER BY created_at DESC LIMIT/);
    // The cap is bound, not inlined, and it is the one that was asked for.
    expect(items[0]!.params.at(-1)).toBe(7);
  });

  it('runs no second query path of its own — every statement is the service’s', async () => {
    ledger.items = [row()];
    await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    // The three statements `listNotifications` issues, and nothing else. A fourth would
    // mean this module had grown its own read into the table 0067 fixed.
    expect(rendered).toHaveLength(3);
    for (const r of rendered) {
      if (r.sql.includes('workspace NOT IN')) continue; // the hidden-count read
      expect(r.sql).toMatch(/workspace (NOT )?IN|FILTER \(WHERE workspace IS NULL\)/);
    }
  });

  it('never mutates anything — a brief is a read', async () => {
    ledger.items = [row()];
    await composeReadout(['sales', DESK_SCOPE], { now: NOW, databaseUrl: DSN });
    for (const r of rendered) {
      expect(r.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  6. THE MIRRORED CONTRACT
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the web mirror of this contract has not drifted', () => {
  /**
   * `apps/web/src/lib/api/readout.ts` hand-copies these interfaces because
   * `packages/shared/src/index.ts` is another lane's file this pass. A copy is
   * syntactically perfect, so `tsc` cannot notice it claiming a field the API never
   * returns — which is exactly what `lib/api/gps.ts:60` records happening.
   *
   * BOTH DIRECTIONS, AND COMMENTS STRIPPED, because the first version of the same
   * ratchet on the control register guarded neither and passed while a web mirror
   * reinstated two phantom fields.
   */
  it('declares the same field names on both sides', async () => {
    const fs = await import('node:fs');
    /**
     * ONLY BETWEEN THE MARKERS, AND COMMENTS STRIPPED. The markers keep the comparison
     * off things that are legitimately one-sided — `ReadoutOptions` (`now`,
     * `databaseUrl`) is a server argument and has no business on the wire — so the
     * ratchet cannot be defeated by moving a field, and cannot be satisfied by a field
     * name that only appears inside a comment.
     */
    const between = (src: string) => {
      const parts = src.split('CONTRACT:BEGIN');
      // EXACTLY ONE MARKER PER FILE. A second mention — in a doc comment explaining the
      // markers, which is where it happened — silently moves the slice and the
      // comparison then runs against a fragment. It reported parity over 3 characters.
      expect(parts).toHaveLength(2);
      const inner = parts[1]!.split('CONTRACT:END')[0]!;
      expect(inner.length).toBeGreaterThan(500);
      return inner;
    };
    const strip = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const fields = (src: string) =>
      new Set(
        [...strip(between(src)).matchAll(/^ {2}(?:readonly )?([A-Za-z][A-Za-z0-9]*)\??:/gm)]
          .map((m) => m[1]),
      );

    const api = fields(fs.readFileSync(new URL('../readout.ts', import.meta.url), 'utf8'));
    const web = fields(
      fs.readFileSync(
        new URL('../../../../web/src/lib/api/readout.ts', import.meta.url),
        'utf8',
      ),
    );

    expect([...api].filter((f) => !web.has(f))).toEqual([]);
    expect([...web].filter((f) => !api.has(f))).toEqual([]);
    // A guard that matched nothing would pass silently.
    expect(api.size).toBeGreaterThan(20);
  });
});
