import type { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PHASE 9 — THE CONFLICT WALL. Behaviour, and absence.
 *
 * WHAT IS ASSERTED HERE, and why each one is a defect that has actually shipped
 * somewhere in this programme:
 *
 *  · A perimeter position that expired GATES A QUOTE, and a jurisdiction nobody
 *    has classified gates it too — with the code, the reason and the remedy, never
 *    as a silently missing row (doctrine D2).
 *  · The disclosure VERSION is recorded, and the record is IMMUTABLE: no UPDATE
 *    statement is ever issued against `gps_disclosure_record`, a repeat is refused
 *    with the existing row rather than overwritten, and a pinned version that is
 *    not the compiled one refuses instead of returning newer words under an older
 *    number.
 *  · The words are never taken from the request. A caller who sends text gets the
 *    compiled template stored regardless.
 *  · The three acts that create a record are APPROVER-ONLY, because the shared
 *    machine key holds `gps` at `operate` (`access/entitlements.ts:39`) and the
 *    second-tier passcode is capped at `operator` (`middleware/auth.ts:94`).
 *  · Migration 0050 has NOWHERE TO WRITE BYTES, declares its own RLS, and seeds no
 *    placeholder position into a table whose rows carry an accountable human's name.
 *
 * ══ A NOTE ON RUNNING THIS BEFORE THE BARREL IS WIRED ══
 * `packages/shared/src/gps/perimeter.ts` and `disclosure.ts` are not yet exported
 * from `packages/shared/src/gps/index.ts` (a human wiring pass owns that barrel),
 * so the two modules under test cannot resolve their imports until those export
 * lines land. This file will fail at IMPORT time until then, and that failure is
 * the wiring reminder — not a defect in the code below.
 *
 * NO REAL POSTGRES. `serviceDb.test.ts` explains the standing position: CI has no
 * database for this compartment and a test that fails for want of one gets deleted
 * rather than fixed. The fake below is deliberately NOT a general SQL engine — it
 * answers exactly the statements these modules issue, and it RECORDS EVERY
 * STATEMENT, which is what makes the immutability claim checkable rather than
 * merely stated.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const API_SRC = resolve(HERE, '../..');
const MIGRATION = resolve(API_SRC, 'db/migrations/0050_gps_perimeter.sql');

/* ── The fake pool ────────────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;

const T_NOW = '2026-08-01T12:00:00.000Z';

class FakePool {
  perimeterExists = true;
  compartmentExists = true;
  profiles: Row[] = [];
  disclosures: Row[] = [];
  subjects: Row[] = [];
  log: { sql: string; params: readonly unknown[] }[] = [];

  private id = 0;
  private nextId(): string {
    this.id += 1;
    return `00000000-0000-0000-0000-${String(this.id).padStart(12, '0')}`;
  }

  released = 0;

  /**
   * Serve ONE locked read from this snapshot instead of the live row.
   *
   * A single-threaded fake cannot interleave two writers, and the defect being pinned
   * is precisely an interleaving: a supersede between the read that authorises a review
   * and the write that records it. This is the read half of that ordering.
   */
  staleReadOnce: Row | null = null;

  /**
   * `reviewPosition` runs in a TRANSACTION now (`FOR UPDATE` + a content predicate on
   * `updated_at`), so the fake has to hand out a client. Same `query`, so every branch
   * below is shared; BEGIN/COMMIT/ROLLBACK land in `log` and are asserted on.
   */
  async connect(): Promise<{ query: FakePool['query']; release: () => void }> {
    return {
      query: this.query.bind(this),
      release: () => { this.released += 1; },
    };
  }

  async query(sql: string, params: readonly unknown[] = []): Promise<{ rows: Row[] }> {
    this.log.push({ sql, params });
    const one = (rows: Row[]) => ({ rows });

    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return one([]);

    if (sql.includes("to_regclass('public.gps_jurisdiction_profile')")) {
      return one([{ ok: this.perimeterExists }]);
    }
    if (sql.includes("to_regclass('public.gps_engagement')")) {
      return one([{ ok: this.compartmentExists }]);
    }

    // ── gps_jurisdiction_profile
    if (/^SELECT[\s\S]*FROM gps_jurisdiction_profile/.test(sql)) {
      if (sql.includes('WHERE id = $1')) {
        if (this.staleReadOnce && this.staleReadOnce.id === params[0]) {
          const stale = this.staleReadOnce;
          this.staleReadOnce = null;
          return one([stale]);
        }
        return one(this.profiles.filter((p) => p.id === params[0]));
      }
      if (sql.includes('WHERE jurisdiction = $1 AND offer_key = $2')) {
        return one(this.profiles.filter((p) => p.jurisdiction === params[0] && p.offer_key === params[1]));
      }
      return one([...this.profiles]);
    }
    if (/^UPDATE gps_jurisdiction_profile\s+SET reviewed_by = \$2/.test(sql)) {
      const row = this.profiles.find((p) => p.id === params[0]);
      if (!row) return one([]);
      // The CONTENT PREDICATE. `updated_at = $4` is what makes a supersede between the
      // read and the write lose the race instead of silently stamping a reviewer's
      // name onto rewritten text.
      if (sql.includes('updated_at = $4') && row.updated_at !== params[3]) return one([]);
      row.reviewed_by = params[1];
      row.reviewed_at = T_NOW;
      row.review_by = params[2] ?? row.review_by;
      row.updated_at = T_NOW;
      return one([row]);
    }
    if (/^UPDATE gps_jurisdiction_profile/.test(sql)) {
      const row = this.profiles.find((p) => p.jurisdiction === params[0] && p.offer_key === params[1]);
      if (!row) return one([]);
      Object.assign(row, {
        service_class: params[2], source: params[3], source_url: params[4],
        entered_by: params[5], entered_at: T_NOW, review_by: params[6], note: params[7],
        // The property under test: superseding a position resets its review.
        reviewed_by: null, reviewed_at: null, updated_at: T_NOW,
      });
      return one([row]);
    }
    if (/^INSERT INTO gps_jurisdiction_profile/.test(sql)) {
      const row: Row = {
        id: this.nextId(),
        jurisdiction: params[0], offer_key: params[1], service_class: params[2],
        source: params[3], source_url: params[4], entered_by: params[5],
        entered_at: T_NOW, review_by: params[6], note: params[7],
        reviewed_by: null, reviewed_at: null, created_at: T_NOW, updated_at: T_NOW,
      };
      this.profiles.push(row);
      return one([row]);
    }

    // ── gps_disclosure_record
    if (/^SELECT[\s\S]*FROM gps_disclosure_record/.test(sql)) {
      if (sql.includes('ANY($1::uuid[])')) {
        const ids = params[0] as string[];
        return one(
          this.disclosures
            .filter((d) => ids.includes(d.engagement_id as string))
            .sort((a, b) => String(b.decided_at).localeCompare(String(a.decided_at))),
        );
      }
      return one(
        this.disclosures.filter(
          (d) => d.engagement_id === params[0]
            && d.template_id === params[1]
            && Number(d.template_version) === Number(params[2]),
        ),
      );
    }
    if (/^INSERT INTO gps_disclosure_record/.test(sql)) {
      const [client_id, engagement_id, template_id, template_version, library_version,
        text_used, unreviewed, lcx_adjacent, decided_by, decided_at] = params;
      const clash = this.disclosures.some(
        (d) => d.engagement_id === engagement_id
          && d.template_id === template_id
          && Number(d.template_version) === Number(template_version),
      );
      // ON CONFLICT ... DO NOTHING: no row comes back, and nothing is overwritten.
      if (clash) return one([]);
      const row: Row = {
        id: this.nextId(), client_id, engagement_id, template_id, template_version,
        library_version, text_used, unreviewed, lcx_adjacent, decided_by, decided_at,
      };
      this.disclosures.push(row);
      return one([row]);
    }

    // ── the wall's subject read
    if (/FROM gps_engagement e/.test(sql)) {
      if (sql.includes('WHERE e.id = $1')) {
        return one(this.subjects.filter((s) => s.engagement_id === params[0]));
      }
      let rows = [...this.subjects];
      let i = 0;
      if (sql.includes('e.client_id = $')) rows = rows.filter((s) => s.client_id === params[i++]);
      if (sql.includes('e.status = $')) rows = rows.filter((s) => s.status === params[i++]);
      return one(rows.slice(0, Number(params[params.length - 1] ?? 200)));
    }

    throw new Error(`FakePool has no answer for: ${sql.slice(0, 120)}`);
  }
}

const pool = new FakePool();

/**
 * The fake stands in for the real pool at the seam the routes use. `db` is the
 * same object typed as a `Pool` for the direct service-layer calls — one cast, in
 * one place, rather than a cast at every call site.
 */
vi.mock('../../db/index.js', () => ({ getPool: () => pool }));
const db = pool as unknown as Pool;

// The desk credentials the auth middleware compares against are read from the
// environment when `lib/env.ts` loads, so they are set BEFORE the dynamic imports
// below. Same values `routes/__tests__/rbac.test.ts` uses.
process.env.OPERATOR_API_KEY ??= 'dev-operator-key-change-me';
process.env.DESK_PASSCODE ??= 'test#1234';

const {
  conflictWall, engagementDisclosureView, enterPosition, gateQuote, loadPerimeter,
  perimeterView, recordDisclosure, reviewPosition, secondTierView,
  _resetPerimeterMigrated,
} = await import('../conflict.js');
const { _resetMigrated } = await import('../service.js');
const { gpsConflictRoutes } = await import('../../routes/gpsConflict.js');

/* ── Fixtures ─────────────────────────────────────────────────────────────────── */

/** Reviewed, well-formed, and current. The only shape that can authorise work. */
function position(over: Row = {}): Row {
  return {
    id: `p-${Math.random().toString(36).slice(2, 8)}`,
    jurisdiction: 'us',
    offer_key: 'mica_whitepaper',
    service_class: 'permitted',
    source: 'Memo from LCX legal, 2026-07-01, reviewed by outside counsel.',
    source_url: null,
    entered_by: 'nik',
    entered_at: '2026-07-01T00:00:00.000Z',
    review_by: '2027-07-01T00:00:00.000Z',
    note: 'Documentary work product only; no advice given.',
    reviewed_by: 'monty',
    reviewed_at: '2026-07-02T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    ...over,
  };
}

/** Path parameters are uuid-checked at the route, so the fixtures use real ones. */
const E1 = 'a1111111-1111-1111-1111-111111111111';
const C1 = 'c1111111-1111-1111-1111-111111111111';

function subject(over: Row = {}): Row {
  return {
    engagement_id: E1,
    client_id: C1,
    offer_key: 'mica_whitepaper',
    contracting_entity: 'lcx',
    status: 'draft',
    price_cents: '1500000',
    currency: 'USD',
    owner: 'nik',
    client_name: 'Nexera',
    client_jurisdiction: 'United States',
    check_id: null,
    check_performed: null,
    decision: null,
    check_decided_by: null,
    disclosure_text_used: null,
    check_decided_at: null,
    ...over,
  };
}

beforeEach(() => {
  pool.perimeterExists = true;
  pool.compartmentExists = true;
  pool.profiles = [];
  pool.disclosures = [];
  pool.subjects = [];
  pool.log = [];
  _resetPerimeterMigrated();
  _resetMigrated();
});

/* ── The perimeter refuses, and says why ─────────────────────────────────────── */

describe('a perimeter position that expired gates the quote', () => {
  it('refuses with perimeter_stale, a remedy, and the staleness on the record', async () => {
    pool.profiles = [position({ review_by: '2026-06-01T00:00:00.000Z' })];

    const { decision, perimeterSource } = await gateQuote(db, {
      jurisdiction: 'United States',
      offer: 'mica_whitepaper',
      asOf: T_NOW,
    });

    expect(perimeterSource).toBe('database');
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('perimeter_stale');
    // D2: the refusal is reasoned and recoverable, and it names what would clear it.
    expect(decision.reason).toMatch(/expired/i);
    expect(decision.remedy).toMatch(/re-review/i);
    expect(decision.recoverable).toBe(true);
    expect(decision.classification.stale).toBe(true);
    // The class the human recorded is still visible — expiry does not erase it.
    expect(decision.classification.serviceClass).toBe('permitted');
    expect(decision.classification.permitted).toBe(false);
  });

  it('the same position, current, allows it — so the refusal is the expiry and nothing else', async () => {
    pool.profiles = [position()];
    const { decision } = await gateQuote(db, {
      jurisdiction: 'US',
      offer: 'mica_whitepaper',
      asOf: T_NOW,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBeNull();
    expect(decision.classification.status).toBe('ok');
  });

  it('every gate is reported, including the ones never reached', async () => {
    pool.profiles = [position({ review_by: '2026-06-01T00:00:00.000Z' })];
    const { decision } = await gateQuote(db, {
      jurisdiction: 'us', offer: 'mica_whitepaper', asOf: T_NOW,
    });
    // Reporting an unevaluated check as passed is how a gate becomes theatre.
    const skipped = decision.gates.filter((g) => g.skipped);
    expect(skipped.map((g) => g.code)).toContain('perimeter_unreviewed');
    expect(skipped.every((g) => g.passed === false)).toBe(true);
    expect(decision.gates).toHaveLength(8);
  });
});

describe('a jurisdiction nobody has classified gates it', () => {
  it('refuses as unknown_jurisdiction and does NOT call it prohibited', async () => {
    pool.profiles = [position()];
    const { decision } = await gateQuote(db, {
      jurisdiction: 'Singapore', offer: 'mica_whitepaper', asOf: T_NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('perimeter_unknown_jurisdiction');
    // The whole point: absence of a finding is not a finding. Calling it
    // prohibited would be inventing a legal conclusion in the safe-looking
    // direction, which is still inventing one.
    expect(decision.classification.serviceClass).toBe('unknown');
    expect(decision.reason).toMatch(/absence of a finding/i);
    expect(decision.remedy).toMatch(/qualified human/i);
  });

  it('refuses a blank jurisdiction rather than evaluating against nothing', async () => {
    pool.profiles = [position()];
    const { decision } = await gateQuote(db, {
      jurisdiction: null, offer: 'mica_whitepaper', asOf: T_NOW,
    });
    expect(decision.code).toBe('perimeter_unknown_jurisdiction');
    expect(decision.reason).toMatch(/blank jurisdiction|No jurisdiction was recorded/i);
  });

  it('a classified jurisdiction with an unclassified OFFER refuses on the offer', async () => {
    pool.profiles = [position({ offer_key: 'gtm_sprint' })];
    const { decision } = await gateQuote(db, {
      jurisdiction: 'us', offer: 'mica_whitepaper', asOf: T_NOW,
    });
    expect(decision.code).toBe('perimeter_unknown_offer');
    expect(decision.reason).toMatch(/not a position on another/i);
  });
});

describe('the compiled fallback is a fallback, never a merge', () => {
  it('an empty table enforces the compiled placeholders, badged, and refuses', async () => {
    const loaded = await loadPerimeter(db);
    expect(loaded.source).toBe('compiled_placeholder');
    expect(loaded.stored).toHaveLength(0);
    expect(loaded.sourceReason).toMatch(/expired on arrival|authorise nothing/i);

    const { decision } = await gateQuote(db, {
      jurisdiction: 'Liechtenstein', offer: 'mica_whitepaper', asOf: T_NOW,
    });
    expect(decision.allowed).toBe(false);
  });

  it('0050 absent behaves exactly like an empty table — never like permission', async () => {
    pool.perimeterExists = false;
    const loaded = await loadPerimeter(db);
    expect(loaded.source).toBe('compiled_placeholder');
    const { decision } = await gateQuote(db, {
      jurisdiction: 'eu', offer: 'diagnostic', asOf: T_NOW,
    });
    expect(decision.allowed).toBe(false);
  });

  it('one real row does NOT let placeholders fill that jurisdiction\'s other offers', async () => {
    pool.profiles = [position({ jurisdiction: 'liechtenstein', offer_key: 'gtm_sprint' })];
    const view = perimeterView(await loadPerimeter(db), T_NOW);

    expect(view.source).toBe('database');
    expect(view.storedRowCount).toBe(1);
    expect(view.cells).toHaveLength(1);
    // Four holes, named — not four placeholder rows that make the grid look full.
    expect(view.holes).toHaveLength(4);
    for (const hole of view.holes) {
      expect(hole.refusal.code).toBe('perimeter_unknown_offer');
    }
  });

  it('flags a position whose review is due, using the engine\'s own classification', async () => {
    pool.profiles = [
      position({ jurisdiction: 'us', offer_key: 'diagnostic', review_by: '2026-08-10T00:00:00.000Z' }),
    ];
    const view = perimeterView(await loadPerimeter(db), T_NOW);
    expect(view.reviewDue).toHaveLength(1);
    expect(view.reviewDue[0].unconditional.classification.expiringSoon).toBe(true);
    expect(view.reviewWarningDays).toBe(30);
  });
});

/* ── Entry and review are two acts, by two people ────────────────────────────── */

describe('a position arrives unreviewed and a second human must review it', () => {
  it('a freshly entered position authorises nothing', async () => {
    const entered = await enterPosition(db, {
      jurisdiction: 'Liechtenstein',
      offerKey: 'mica_whitepaper',
      serviceClass: 'permitted',
      source: 'Opinion of a named firm, 2026-07-30.',
      note: 'Documentary work only.',
      reviewBy: '2027-07-30T00:00:00.000Z',
      enteredBy: 'nik',
    });
    expect(entered.ok).toBe(true);
    if (!entered.ok) return;
    // There is no `reviewed` parameter to send, so this cannot be otherwise.
    expect(entered.position.entry.reviewed).toBe(false);
    expect(entered.position.reviewedBy).toBeNull();

    const { decision } = await gateQuote(db, {
      jurisdiction: 'li', offer: 'mica_whitepaper', asOf: T_NOW,
    });
    expect(decision.code).toBe('perimeter_unreviewed');
    expect(decision.reason).toMatch(/draft/i);
  });

  it('refuses self-review, then allows a different approver', async () => {
    pool.profiles = [position({ id: 'p1', entered_by: 'nik', reviewed_by: null, reviewed_at: null })];

    const self = await reviewPosition(db, 'p1', 'nik');
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.reason).toBe('self_review');

    const other = await reviewPosition(db, 'p1', 'monty');
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect(other.position.entry.reviewed).toBe(true);
    expect(other.position.reviewedBy).toBe('monty');

    const { decision } = await gateQuote(db, {
      jurisdiction: 'us', offer: 'mica_whitepaper', asOf: T_NOW,
    });
    expect(decision.allowed).toBe(true);
  });

  /**
   * THE INTERLEAVING THAT PUT A REVIEWER'S NAME ON WORDS THEY NEVER READ.
   *
   * The read was an unlocked SELECT and the write an UPDATE keyed on `id` alone.
   * `enterPosition`'s supersede path is a bare UPDATE that rewrites `service_class`,
   * `source` and `note` and NULLS the review columns — correct, because a superseded
   * position must be re-reviewed. Interleave a supersede-to-`permitted` between B's
   * read and B's write, and the final row was `permitted` with a fresh `reviewed_at`
   * and `reviewed_by = B`, and `gateService` returned `allowed: true` on text B never
   * saw. That is the exact outcome the reset exists to prevent.
   */
  it('refuses to complete a review whose row was superseded mid-flight', async () => {
    pool.profiles = [position({
      id: 'p1', jurisdiction: 'us', service_class: 'prohibited',
      entered_by: 'nik', reviewed_by: null, reviewed_at: null,
    })];

    // B reads the PROHIBITED position it is about to review…
    const before = pool.profiles[0]!.updated_at;
    // …and nik supersedes it to `permitted` before B's write lands. The supersede
    // bumps `updated_at`, which is the content predicate B's UPDATE now carries.
    pool.profiles[0]!.service_class = 'permitted';
    pool.profiles[0]!.note = 'Rewritten by the supersede.';
    pool.profiles[0]!.updated_at = '2026-08-01T12:00:00.000Z';
    expect(pool.profiles[0]!.updated_at).not.toBe(before);

    // `staleReadOnce` serves B the row AS IT WAS on the locked read while the stored
    // row has already moved — which is exactly the interleaving, and the only way a
    // single-threaded fake can express it.
    pool.staleReadOnce = { ...pool.profiles[0]!, service_class: 'prohibited', updated_at: before };
    const raced = await reviewPosition(db, 'p1', 'monty');
    expect(raced.ok).toBe(false);
    if (!raced.ok) expect(raced.reason).toBe('concurrent_modification');

    // The row is STILL unreviewed, so the gate still refuses.
    expect(pool.profiles[0]!.reviewed_by).toBeNull();
    const { decision } = await gateQuote(db, {
      jurisdiction: 'us', offer: 'mica_whitepaper', asOf: T_NOW,
    });
    expect(decision.allowed).toBe(false);
  });

  it('runs the review inside a transaction with FOR UPDATE, and releases the client', async () => {
    pool.profiles = [position({ id: 'p1', entered_by: 'nik', reviewed_by: null, reviewed_at: null })];
    pool.log = [];
    const releasedBefore = pool.released;

    const ok = await reviewPosition(db, 'p1', 'monty');
    expect(ok.ok).toBe(true);

    const sqls = pool.log.map((l) => l.sql.trim());
    expect(sqls).toContain('BEGIN');
    expect(sqls).toContain('COMMIT');
    // The lock, not just the transaction: without FOR UPDATE the two writers do not
    // serialise and the predicate is the only thing left.
    expect(sqls.some((q) => /FROM gps_jurisdiction_profile WHERE id = \$1 FOR UPDATE/.test(q))).toBe(true);
    expect(pool.released).toBe(releasedBefore + 1);
  });

  it('superseding a reviewed position RESETS the review, so it refuses again', async () => {
    pool.profiles = [position({ id: 'p1' })];
    const before = await gateQuote(db, {
      jurisdiction: 'us', offer: 'mica_whitepaper', asOf: T_NOW,
    });
    expect(before.decision.allowed).toBe(true);

    const again = await enterPosition(db, {
      jurisdiction: 'us',
      offerKey: 'mica_whitepaper',
      serviceClass: 'counsel_required',
      source: 'Superseding memo, 2026-08-01.',
      note: 'Now requires counsel.',
      reviewBy: '2027-08-01T00:00:00.000Z',
      enteredBy: 'nik',
      supersede: true,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.superseded).toBe(true);
    // A reviewer's name must never travel onto words they never read.
    expect(again.position.reviewedBy).toBeNull();
    expect(again.position.entry.reviewed).toBe(false);

    const after = await gateQuote(db, {
      jurisdiction: 'us', offer: 'mica_whitepaper', asOf: T_NOW,
    });
    expect(after.decision.allowed).toBe(false);
    expect(after.decision.code).toBe('perimeter_unreviewed');
  });

  it('refuses a second position for the same cell unless supersede is explicit', async () => {
    pool.profiles = [position({ id: 'p1' })];
    const clash = await enterPosition(db, {
      jurisdiction: 'US', offerKey: 'mica_whitepaper', serviceClass: 'prohibited',
      source: 's', note: 'n', reviewBy: '2027-01-01T00:00:00.000Z', enteredBy: 'monty',
    });
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.existing.id).toBe('p1');
    // And nothing was written: one row, still the reviewed one.
    expect(pool.profiles).toHaveLength(1);
    expect(pool.profiles[0].service_class).toBe('permitted');
  });

  it('no combination of conditions clears a prohibition', async () => {
    pool.profiles = [position({ service_class: 'prohibited' })];
    const { decision } = await gateQuote(db, {
      jurisdiction: 'us',
      offer: 'mica_whitepaper',
      asOf: T_NOW,
      counselEngaged: 'A named firm',
      localPartnerId: 'partner-1',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('service_prohibited');
    // A wall, not a task: there is no remedy and it is not recoverable.
    expect(decision.recoverable).toBe(false);
    expect(decision.remedy).toBeNull();
  });
});

/* ── The disclosure version is recorded, and the record is immutable ─────────── */

const STANDING = 'gps-standing-employee-conflict';

describe('the disclosure version is recorded', () => {
  beforeEach(() => {
    pool.subjects = [subject()];
  });

  it('stores the template id, its version, the library version and the exact words', async () => {
    const result = await recordDisclosure(db, {
      engagementId: E1,
      templateId: STANDING,
      lcxAdjacent: true,
      decidedBy: 'nik',
      asOf: T_NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { record } = result.stored;
    expect(record.templateId).toBe(STANDING);
    expect(record.version).toBeGreaterThanOrEqual(1);
    expect(record.libraryVersion).toBeGreaterThanOrEqual(record.version);
    // Text AND version: text alone cannot be audited against policy, and a
    // version alone cannot be reproduced once the wording is edited.
    expect(record.text).toBe(result.rendered.text);
    expect(record.text.length).toBeGreaterThan(200);
    // The wording is not counsel-reviewed, and that fact is STORED rather than
    // recomputed later from a constant that will one day flip.
    expect(record.unreviewed).toBe(true);
    expect(result.stored.decidedBy).toBe('nik');
  });

  it('the four things GPS may never promise are all in the standing statement', async () => {
    const result = await recordDisclosure(db, {
      engagementId: E1, templateId: STANDING, lcxAdjacent: false,
      decidedBy: 'nik', asOf: T_NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const phrase of [/listing/i, /admission|venue/i, /regulator|approval/i, /market.?mak/i]) {
      expect(result.stored.record.text).toMatch(phrase);
    }
  });

  it('the date inside the words and the date on the row are the same instant', async () => {
    const result = await recordDisclosure(db, {
      engagementId: E1, templateId: STANDING, lcxAdjacent: false,
      decidedBy: 'nik', asOf: T_NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stored.decidedAt).toBe(T_NOW);
    expect(result.stored.record.renderedAt).toBe(T_NOW);
    // The client-facing wording carries the DATE (the template interpolates
    // `{{asOf}}` as one), while the row keeps the instant. Both derive from the
    // same `asOf`, which is the property that matters: they cannot disagree.
    expect(result.stored.record.text).toContain(T_NOW.slice(0, 10));
  });

  it('the words come from the library and cannot be supplied by the caller', async () => {
    // There is no text parameter to pass — the type system refuses it — so the
    // check that matters is the SOURCE-LEVEL one: neither module reads a text or
    // wording field off a request body anywhere.
    const files = [
      readFileSync(resolve(API_SRC, 'gps/conflict.ts'), 'utf8'),
      readFileSync(resolve(API_SRC, 'routes/gpsConflict.ts'), 'utf8'),
    ].map((s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' '));
    for (const code of files) {
      expect(code).not.toMatch(/body\s*\.\s*(?:text|wording|disclosureText|textUsed|disclosure_text_used)\b/);
    }
  });
});

describe('a recorded disclosure is immutable', () => {
  beforeEach(() => {
    pool.subjects = [subject()];
  });

  it('a repeat at the same version is REFUSED with the existing row, never overwritten', async () => {
    const first = await recordDisclosure(db, {
      engagementId: E1, templateId: STANDING, lcxAdjacent: true,
      decidedBy: 'nik', asOf: T_NOW,
    });
    expect(first.ok).toBe(true);

    const second = await recordDisclosure(db, {
      engagementId: E1, templateId: STANDING, lcxAdjacent: false,
      decidedBy: 'monty', asOf: '2026-08-02T00:00:00.000Z',
    });
    expect(second.ok).toBe(false);
    if (second.ok || second.reason !== 'already_recorded') {
      throw new Error(`expected already_recorded, got ${JSON.stringify(second)}`);
    }
    // The original survives untouched: the first decider, the first date, the
    // first assertion. Correcting a disclosure means issuing another one.
    expect(second.existing.decidedBy).toBe('nik');
    expect(second.existing.decidedAt).toBe(T_NOW);
    expect(second.existing.lcxAdjacent).toBe(true);
    expect(pool.disclosures).toHaveLength(1);
  });

  it('no UPDATE or DELETE is ever issued against gps_disclosure_record', async () => {
    await recordDisclosure(db, {
      engagementId: E1, templateId: STANDING, lcxAdjacent: true, decidedBy: 'nik', asOf: T_NOW,
    });
    await recordDisclosure(db, {
      engagementId: E1, templateId: STANDING, lcxAdjacent: true, decidedBy: 'nik', asOf: T_NOW,
    });
    await conflictWall(db, T_NOW);

    // The behavioural half of 0050's BEFORE UPDATE trigger: the trigger makes an
    // edit impossible, and this proves the code never even attempts one.
    const writes = pool.log.filter(
      (q) => /gps_disclosure_record/.test(q.sql) && /^\s*(UPDATE|DELETE)/i.test(q.sql),
    );
    expect(writes).toHaveLength(0);
    expect(pool.log.some((q) => /^INSERT INTO gps_disclosure_record/.test(q.sql))).toBe(true);
  });

  it('a version pin that is not the compiled version REFUSES rather than serving newer words', async () => {
    const { DisclosureError } = await import('@lcx/shared');
    await expect(
      recordDisclosure(db, {
        engagementId: E1, templateId: STANDING, version: 999,
        lcxAdjacent: true, decidedBy: 'nik', asOf: T_NOW,
      }),
    ).rejects.toBeInstanceOf(DisclosureError);
    expect(pool.disclosures).toHaveLength(0);
  });

  it('an unknown template refuses instead of recording an empty disclosure', async () => {
    await expect(
      recordDisclosure(db, {
        engagementId: E1, templateId: 'gps-made-up', lcxAdjacent: true,
        decidedBy: 'nik', asOf: T_NOW,
      }),
    ).rejects.toThrow(/Unknown disclosure template/);
    expect(pool.disclosures).toHaveLength(0);
  });

  it('an unknown engagement is refused before anything is rendered or written', async () => {
    const result = await recordDisclosure(db, {
      engagementId: 'nope', templateId: STANDING, lcxAdjacent: true,
      decidedBy: 'nik', asOf: T_NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('engagement_not_found');
    expect(pool.disclosures).toHaveLength(0);
  });
});

/* ── The wall ─────────────────────────────────────────────────────────────────── */

describe('the wall shows the position, including when there is none', () => {
  it('missing is a position, and it BLOCKS on a client-facing engagement', async () => {
    pool.subjects = [
      subject({ engagement_id: 'draft', status: 'draft' }),
      subject({ engagement_id: 'live', status: 'proposed' }),
    ];
    const wall = await conflictWall(db, T_NOW);

    const draft = wall.rows.find((r) => r.engagementId === 'draft');
    const live = wall.rows.find((r) => r.engagementId === 'live');
    expect(draft?.position).toBe('missing');
    expect(draft?.blocking).toBe(false);
    expect(live?.position).toBe('missing');
    // `proposed` is in REQUIRES_CONFLICT_CLEARANCE, which the DB path already
    // refuses to enter without a check. The wall must make that visible, not
    // re-derive it: the screen and the gate cannot be allowed to disagree.
    expect(live?.clientFacing).toBe(true);
    expect(live?.blocking).toBe(true);
    expect(wall.counts.missing).toBe(2);
    expect(wall.counts.blocking).toBe(1);
  });

  it('counts are taken BEFORE the filter, so a narrowed view cannot shrink the gap', async () => {
    pool.subjects = [
      subject({ engagement_id: 'a', status: 'proposed' }),
      subject({
        engagement_id: 'b', status: 'accepted', check_id: 'k1', decision: 'cleared',
        check_performed: 'Checked the listing pipeline.', check_decided_by: 'monty',
        check_decided_at: '2026-07-20T00:00:00.000Z',
      }),
    ];
    const wall = await conflictWall(db, T_NOW, { position: 'missing' });
    expect(wall.rows).toHaveLength(1);
    expect(wall.filterApplied).toBe(true);
    expect(wall.counts.total).toBe(2);
    expect(wall.counts.cleared).toBe(1);
    expect(wall.counts.missing).toBe(1);
  });

  it('flags a conflict check whose wording is not any version on record', async () => {
    pool.subjects = [
      subject({
        engagement_id: E1, check_id: 'k1', decision: 'cleared_with_disclosure',
        check_performed: 'Checked.', check_decided_by: 'nik',
        check_decided_at: '2026-07-20T00:00:00.000Z',
        disclosure_text_used: 'Something a human typed by hand in a hurry.',
      }),
    ];
    const wall = await conflictWall(db, T_NOW);
    // FALSE is the finding: a client was given wording that is not a version of
    // the compiled policy, and nothing else in the platform would ever notice.
    expect(wall.rows[0].checkTextMatchesRecord).toBe(false);
  });

  it('reports unasserted LCX-adjacency and errs toward MORE disclosure', async () => {
    pool.subjects = [subject()];
    const wall = await conflictWall(db, T_NOW);
    const row = wall.rows[0];
    expect(row.lcxAdjacent).toBeNull();
    expect(row.lcxAdjacentAssumed).toBe(true);
    expect(wall.counts.adjacencyUnasserted).toBe(1);
    // Assuming adjacency requires the cleared-with-disclosure wording as well as
    // the standing statement. Erring the other way would silently drop a
    // disclosure a client was owed.
    expect(row.context.lcxAdjacent).toBe(true);
    expect(row.missingDisclosureIds).toContain('gps-conflict-cleared-with-disclosure');
    expect(row.missingDisclosureIds).toContain(STANDING);
  });

  it('carries the perimeter refusal on the row, with no conditions asserted', async () => {
    pool.subjects = [subject({ client_jurisdiction: 'Singapore' })];
    const wall = await conflictWall(db, T_NOW);
    expect(wall.rows[0].perimeter.allowed).toBe(false);
    expect(wall.rows[0].perimeter.code).toBe('perimeter_unknown_jurisdiction');
    // Nothing records which counsel or which partner an engagement engaged, so
    // the wall says so rather than implying it checked.
    expect(wall.rows[0].perimeter.conditionsAsserted).toEqual({ counsel: null, localPartner: null });
    expect(wall.counts.perimeterRefused).toBe(1);
  });

  it('a requirement that cannot be rendered is reported with its reason, not dropped', async () => {
    // No jurisdiction on file: the "position not established" notice names the
    // jurisdiction, so it cannot be produced — and that is a finding.
    pool.subjects = [subject({ client_jurisdiction: null })];
    const view = await engagementDisclosureView(db, E1, T_NOW);
    const draft = view?.drafts.find((d) => d.templateId === 'gps-perimeter-unestablished');
    expect(draft).toBeDefined();
    expect(draft?.text).toBeNull();
    expect(draft?.errorCode).toBe('missing_field');
    expect(view?.missingDisclosureIds).toContain('gps-perimeter-unestablished');
  });

  it('renders the words on a read WITHOUT recording them', async () => {
    pool.subjects = [subject()];
    const view = await engagementDisclosureView(db, E1, T_NOW);
    const standing = view?.drafts.find((d) => d.templateId === STANDING);
    expect(standing?.text?.length).toBeGreaterThan(200);
    expect(standing?.recorded).toBe(false);
    expect(pool.disclosures).toHaveLength(0);
    expect(pool.log.some((q) => /^INSERT/.test(q.sql))).toBe(false);
  });

  it('degrades honestly before 0047, and before 0050 records everything as missing', async () => {
    pool.subjects = [subject()];
    pool.perimeterExists = false;
    const wall = await conflictWall(db, T_NOW);
    expect(wall.perimeterMigrated).toBe(false);
    expect(wall.rows[0].disclosures).toHaveLength(0);
    expect(wall.rows[0].missingDisclosureIds.length).toBeGreaterThan(0);
    expect(wall.library.templates.length).toBeGreaterThanOrEqual(4);
    expect(wall.disclosuresAreUnreviewed).toBe(true);
  });
});

/* ── Second-tier sessions ─────────────────────────────────────────────────────── */

describe('the second door is observable, and honest about what it cannot do', () => {
  it('reports usage, the non-roster population, and its own limits', () => {
    const view = secondTierView(T_NOW);
    expect(view.rosterEmailCount).toBe(3);
    expect(Array.isArray(view.usage)).toBe(true);
    expect(view.rotateAdvised).toBe(view.unexpected.length > 0);
    expect(view.limits.join(' ')).toMatch(/in-memory/i);
    expect(view.limits.join(' ')).toMatch(/unattributable/i);
    expect(view.limits.join(' ')).toMatch(/never approver/i);
  });
});

/* ── The routes: who may create a record ─────────────────────────────────────── */

const OPERATOR_KEY = 'dev-operator-key-change-me';
const AS_APPROVER = 'nik@lcx.com:test#1234';
const AS_OPERATOR_HUMAN = 'sam@lcx.com:test#1234';

const call = (path: string, cred: string, body?: unknown) =>
  gpsConflictRoutes.request(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${cred}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const POSITION_BODY = {
  jurisdiction: 'Liechtenstein',
  offerKey: 'mica_whitepaper',
  serviceClass: 'permitted',
  source: 'Opinion of a named firm, 2026-07-30.',
  note: 'Documentary work product only.',
  reviewBy: '2027-07-30T00:00:00.000Z',
};

describe('creating a record is approver-only', () => {
  beforeEach(() => {
    pool.subjects = [subject()];
  });

  it('the SHARED MACHINE KEY cannot record a disclosure', async () => {
    // `machineMap()` (access/entitlements.ts:39) grants the shared key `operate`
    // on every workspace, so `operate` alone would let a cron job author the
    // record that says a client was told something.
    const res = await call(`/engagements/${E1}/disclosures`, OPERATOR_KEY, {
      templateId: STANDING, lcxAdjacent: true,
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FORBIDDEN_REQUIRES_APPROVER');
    expect(pool.disclosures).toHaveLength(0);
  });

  it('a roster OPERATOR cannot record a disclosure either', async () => {
    const res = await call(`/engagements/${E1}/disclosures`, AS_OPERATOR_HUMAN, {
      templateId: STANDING, lcxAdjacent: true,
    });
    expect(res.status).toBe(403);
    expect(pool.disclosures).toHaveLength(0);
  });

  it('an approver can, and the attribution comes from the session', async () => {
    const res = await call(`/engagements/${E1}/disclosures`, AS_APPROVER, {
      templateId: STANDING,
      lcxAdjacent: true,
      // Ignored on purpose: attribution is never a body field.
      decidedBy: 'someone-else',
    });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.stored.decidedBy).toBe('nik');
    expect(data.stored.record.version).toBeGreaterThanOrEqual(1);
    expect(data.unreviewedReason).toMatch(/not been reviewed|not counsel/i);
  });

  it('refuses to default LCX-adjacency', async () => {
    const res = await call(`/engagements/${E1}/disclosures`, AS_APPROVER, { templateId: STANDING });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION');
    expect(body.error).toMatch(/asserted by a human/i);
  });

  it('a stale version pin comes back as a 409 with the engine\'s own reason', async () => {
    const res = await call(`/engagements/${E1}/disclosures`, AS_APPROVER, {
      templateId: STANDING, lcxAdjacent: false, version: 999,
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('DISCLOSURE_VERSION_MISMATCH');
    expect(body.error).toMatch(/compiled at version/i);
  });

  it('entering a perimeter position is approver-only, and says it authorises nothing yet', async () => {
    const denied = await call('/perimeter', OPERATOR_KEY, POSITION_BODY);
    expect(denied.status).toBe(403);
    expect(pool.profiles).toHaveLength(0);

    const res = await call('/perimeter', AS_APPROVER, POSITION_BODY);
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.position.entry.reviewed).toBe(false);
    expect(data.position.entry.enteredBy).toBe('nik');
    // D4 — the system argues back at the moment of entry.
    expect(data.authorisesWorkNow).toBe(false);
    expect(data.gate.code).toBe('perimeter_unreviewed');
  });

  it('reviewing is approver-only and still refuses self-review over HTTP', async () => {
    pool.profiles = [position({
      id: '00000000-0000-0000-0000-000000000001',
      entered_by: 'nik', reviewed_by: null, reviewed_at: null,
    })];
    const denied = await call('/perimeter/00000000-0000-0000-0000-000000000001/review', OPERATOR_KEY, {});
    expect(denied.status).toBe(403);

    const self = await call('/perimeter/00000000-0000-0000-0000-000000000001/review', AS_APPROVER, {});
    expect(self.status).toBe(409);
    expect((await self.json()).code).toBe('SELF_REVIEW_REFUSED');
  });

  it('the session view is approver-only; the wall and the gate are not', async () => {
    expect((await call('/sessions', OPERATOR_KEY)).status).toBe(403);
    expect((await call('/sessions', AS_APPROVER)).status).toBe(200);
    expect((await call('/wall', OPERATOR_KEY)).status).toBe(200);
    expect((await call('/policy', OPERATOR_KEY)).status).toBe(200);

    const gate = await call('/quote-gate', OPERATOR_KEY, {
      offerKey: 'mica_whitepaper', jurisdiction: 'Singapore',
    });
    expect(gate.status).toBe(200);
    const { data } = await gate.json();
    expect(data.decision.allowed).toBe(false);
    expect(data.decision.code).toBe('perimeter_unknown_jurisdiction');
  });

  it('an unauthenticated request reaches nothing', async () => {
    const res = await gpsConflictRoutes.request('/wall');
    expect(res.status).toBe(401);
  });

  it('names the MISSING migration rather than answering 500', async () => {
    pool.perimeterExists = false;
    const res = await call('/perimeter', AS_APPROVER, POSITION_BODY);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('MIGRATION_PENDING_PERIMETER');

    pool.compartmentExists = false;
    _resetMigrated();
    const wall = await call('/wall', OPERATOR_KEY);
    // A read degrades to a shaped, empty body — never a 500, which the desk reads
    // as "the platform is down" rather than "run one migration".
    expect(wall.status).toBe(200);
    const body = await wall.json();
    expect(body.meta.migrated).toBe(false);
    expect(body.data.rows).toEqual([]);
  });

  it('validation runs before the probe: a bad payload is bad in every environment', async () => {
    pool.perimeterExists = false;
    const res = await call('/perimeter', AS_APPROVER, { ...POSITION_BODY, serviceClass: 'unknown' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/absence of a row/i);
  });
});

/* ── Migration 0050: nowhere to write bytes, and nothing seeded ──────────────── */

describe('0050 has no byte-doors and ships empty', () => {
  const raw = readFileSync(MIGRATION, 'utf8');
  const sql = raw.replace(/^\s*--.*$/gm, ' ');

  it('declares no byte-bearing column type, and no new jsonb', () => {
    // `intakeLockout.test.ts` freezes the set of json/jsonb columns across every
    // gps_ migration at exactly `scope_snapshot`; this is the local half of that
    // claim, stated where the file is written.
    for (const type of [/\bbytea\b/i, /\bblob\b/i, /\bxml\b/i, /\bvarbit\b/i, /\boid\b/i, /\bjsonb?\b/i]) {
      expect(sql).not.toMatch(type);
    }
  });

  it('declares no column named like an artifact, and no upload path', () => {
    for (const name of [
      /base64/i, /\bbytes\b/i, /\bbinary\b/i, /encoded/i, /\bpayload\b/i,
      /attachment/i, /upload/i, /artifact/i, /file_(name|path|url|size|type)/i,
      /storage_(path|key|bucket|url)/i, /\bmime\b/i, /pg_largeobject/i, /lo_import/i,
    ]) {
      expect(sql).not.toMatch(name);
    }
  });

  it('seeds NO position: an empty table is the honest state', () => {
    // A placeholder row in a table with an `entered_by` column would look like a
    // human position with an accountable name against it.
    expect(sql).not.toMatch(/INSERT\s+INTO\s+gps_jurisdiction_profile/i);
    // And it does not re-grant the compartment: 0047 already did, and re-seeding
    // would imply Phase 9 widened access when it did not.
    expect(sql).not.toMatch(/INSERT\s+INTO\s+entitlements/i);
  });

  it('the perimeter carries no client dimension', () => {
    const table = sql.slice(
      sql.indexOf('CREATE TABLE IF NOT EXISTS gps_jurisdiction_profile'),
      sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS gps_jurisdiction_profile_cell_idx'),
    );
    expect(table.length).toBeGreaterThan(200);
    // Policy, not client data. A perimeter that can be scoped per client is a
    // perimeter that gets negotiated per client.
    expect(table).not.toMatch(/\bclient_id\b/);
    // And `reviewed` is derived, so there is no boolean to flip.
    expect(table).not.toMatch(/\breviewed\s+boolean\b/);
    expect(table).toMatch(/reviewed_by\s+text/);
    expect(table).toMatch(/reviewed_at\s+timestamptz/);
  });

  it('declares its own RLS on both tables rather than leaving it to a dashboard click', () => {
    expect(sql).toMatch(/ALTER TABLE gps_jurisdiction_profile\s+ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE gps_disclosure_record\s+ENABLE ROW LEVEL SECURITY/);
  });

  it('makes the disclosure record append-only in the database', () => {
    // The claim "immutable" needs a mechanism, and RLS cannot be it: the API
    // connects as the owner and owners bypass RLS. Triggers fire for owners.
    expect(sql).toMatch(/BEFORE UPDATE ON gps_disclosure_record/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
    // DELETE is deliberately NOT blocked: ON DELETE CASCADE from gps_client is
    // how erasure works, and breaking that would turn a GDPR obligation into a
    // migration.
    expect(sql).not.toMatch(/BEFORE DELETE ON gps_disclosure_record/);
  });

  it('is idempotent, statement by statement', () => {
    const creates = raw.match(/^CREATE (TABLE|UNIQUE INDEX|INDEX)([^\n]*)$/gm) ?? [];
    expect(creates.length).toBeGreaterThanOrEqual(6);
    for (const line of creates) expect(line).toMatch(/IF NOT EXISTS/);
    expect(raw).toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(raw).toMatch(/DROP TRIGGER IF EXISTS/);
  });

  it('says in the file that the source link is never followed', () => {
    // Read RAW: the comment IS the control. The next engineer's default reading of
    // a url column is "resolve it".
    expect(raw).toMatch(/NOTHING IN GPS FETCHES, RESOLVES, MIRRORS OR\s*--\s*VALIDATES IT/);
    expect(raw).toMatch(/human/i);
  });

  it('no route in the conflict wall names an artifact intake shape', () => {
    const routes = readFileSync(resolve(API_SRC, 'routes/gpsConflict.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');
    const paths = [...routes.matchAll(/\.\s*(?:get|post|put|patch|delete)\s*\(\s*'([^']*)'/g)]
      .map((m) => m[1]);
    expect(paths.length).toBeGreaterThanOrEqual(9);
    for (const p of paths) {
      expect(p).not.toMatch(/upload|attach|\bfiles?\b|document|blob|artifact|media|\basset/i);
    }
    // One reader, and `c.req.json` cannot return a file.
    const readers = routes.match(/c\.req\.[a-zA-Z]+/g) ?? [];
    expect(readers.length).toBeGreaterThan(0);
    for (const r of readers) {
      expect(['c.req.json', 'c.req.param', 'c.req.query', 'c.req.header']).toContain(r);
    }
  });
});

