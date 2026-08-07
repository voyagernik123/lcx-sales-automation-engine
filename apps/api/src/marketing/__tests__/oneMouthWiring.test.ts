/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  ONE MOUTH — the wiring, which is the whole defect
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `oneMouth.ts` was a complete shadow-mode Title VI engine with NO CALLER. `grep -rn
 * observeOneMouth apps/` returned seven hits and every one was inside the module itself —
 * the definition plus six comments, one of which told the reader that outbound text on
 * any path not calling it is uncovered, and another of which told them to wire a send
 * path in before reading anything into a zero.
 *
 * ── WHY THAT IS WORSE THAN NO CONTROL ────────────────────────────────────────
 * A shadow control that is never called reports `recording_nothing_observed` forever, and
 * `loadOneMouthShadowReport` renders that as "nothing here" — the same shape a desk with
 * genuinely clean copy produces. An UNEVALUATED path and a CLEAN one must not produce the
 * same number, and until this pass they did. The engine's three-state discipline was
 * meticulous everywhere except at the one place it mattered: whether anything had ever
 * been put through it.
 *
 * ── WHAT THIS FILE DEFENDS ───────────────────────────────────────────────────
 *  1. THERE IS A LIVE CALLER, and the assertion fails if the wiring is reverted. This is
 *     the test the whole file exists for; everything else describes how it behaves.
 *  2. IT CANNOT BLOCK AND IT CANNOT THROW. Shadow mode's entire premise is that it
 *     changes no outcome, and it is now called from inside a governed write path where a
 *     throw would turn a completed transition into a 500.
 *  3. THE DIGEST JOINS THE WARRANT'S. The observation and the emission warrant over the
 *     same campaign are about the same bytes, or the two ledgers silently stop joining.
 *  4. OBSERVED-AND-NOT-RECORDED IS ITS OWN STATE. A measurement this process made and the
 *     ledger did not take is not the same as one that was never made, and the count will
 *     under-report by an amount nothing can recover.
 *  5. THE ACTOR IS THE CAMPAIGN'S AUTHOR, not the principal who pressed the button.
 *
 * ── WHAT IS STILL NOT WIRED, STATED HERE SO IT IS NOT LOST ───────────────────
 * Two of the three mouths still call nothing: `sales_email` (the send is
 * `outreach/scheduler.ts`) and `assisted_touch` (`outreach/queue.ts markTaskSent`). Both
 * files belong to another lane. Every number this module publishes today is about
 * campaign copy, and `knownBiases` on the report says so in words.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetAbuseRegisterMigrated } from '../abuseRegister.js';
import { _resetGateLedgerMigrated, gateTextSha256 } from '../outboundGate.js';
import { composeCampaignPublicText } from '../emissionWarrant.js';
import {
  ONE_MOUTH_MODE,
  SOURCE_COLUMNS,
  UNATTRIBUTED_ACTOR,
  _resetOneMouthLedgerMigrated,
  observeAndRecordOneMouth,
  oneMouthCampaignSubject,
} from '../oneMouth.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAMPAIGN = '11111111-2222-3333-4444-555555555555';

interface Recorded { sql: string; params: unknown[] }

function stubPool(opts: { ledger?: boolean; insertFails?: boolean; gateThrows?: boolean } = {}) {
  const queries: Recorded[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (/to_regclass\('public\.marketing_one_mouth_shadow'\)/.test(sql)) {
        return { rows: [{ ok: opts.ledger ?? true }], rowCount: 1 };
      }
      if (/to_regclass/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
      if (/INSERT INTO marketing_one_mouth_shadow/.test(sql)) {
        if (opts.insertFails) throw new Error('ledger write refused');
        return { rows: [], rowCount: 1 };
      }
      if (opts.gateThrows && /marketing_asset_embargo/.test(sql)) {
        throw new Error('embargo register exploded');
      }
      if (/EXISTS \(SELECT 1 FROM marketing_asset_embargo/.test(sql)) {
        return { rows: [{ any_rows: false }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  return { pool: pool as unknown as Pool, queries };
}

const campaign = {
  id: CAMPAIGN,
  name: 'PayAgent launch quest',
  detail: 'Create a payment link and get it paid.',
  createdBy: 'nik',
};

const ledgerWrite = (queries: Recorded[]) =>
  queries.find((q) => /INSERT INTO marketing_one_mouth_shadow/.test(q.sql));

beforeEach(() => {
  _resetAbuseRegisterMigrated();
  _resetGateLedgerMigrated();
  _resetOneMouthLedgerMigrated();
});

/* ════════ 1. THERE IS A LIVE CALLER ════════ */

describe('the engine is wired into a path that actually publishes', () => {
  it('has at least one caller outside its own module', () => {
    /*
     * THE ASSERTION THIS FILE EXISTS FOR. Before this pass the correct answer was an
     * empty list, and `emissionWarrant.test.ts` has a ratchet asserting exactly that —
     * built so it would FAIL the day somebody wired the engine in, because the
     * `not_applicable` narrative next door tells a human the engine is NOT WIRED.
     *
     * THAT RATCHET DOES NOT FIRE ON THIS CHANGE AND IT SHOULD HAVE. It greps for
     * `observeOneMouth(` and `sweepOneMouth(`; the call site uses the wrapper
     * `observeAndRecordOneMouth(`, whose name contains neither substring. So the ratchet
     * is now BLIND — it will not fire when `outreach/scheduler.ts` is wired either — and
     * the disclosure it guards has gone stale. Both are reported to the lead as
     * out-of-lane edits. THIS assertion is the replacement that is not blind: it names
     * the wrapper too.
     */
    const roots = [resolve(HERE, '..', '..')];
    const callers: string[] = [];
    let scanned = 0;
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'dist') continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry.name) && !/oneMouth/.test(entry.name)) {
          scanned += 1;
          if (/\b(observeAndRecordOneMouth|observeOneMouth|sweepOneMouth)\s*\(/
            .test(readFileSync(full, 'utf8'))) {
            callers.push(full);
          }
        }
      }
    };
    for (const root of roots) walk(root);

    // NON-VACUITY FIRST. An empty walk would make the assertion below pass for free.
    expect(scanned, 'the source walk read nothing, so it proves nothing').toBeGreaterThan(50);
    expect(
      callers,
      'the shadow engine has no caller outside its own module again — it measures nothing, '
      + 'and its report reads recording_nothing_observed, which on a screen is '
      + 'indistinguishable from a desk whose copy is clean',
    ).not.toEqual([]);
    expect(callers.some((f) => /actions\/registry\.ts$/.test(f))).toBe(true);
  });

  it('is called from the campaign launch transition specifically', () => {
    // WHICH path matters: the observation has to be on something that publishes.
    const registry = readFileSync(resolve(HERE, '..', '..', 'actions', 'registry.ts'), 'utf8');
    expect(registry).toMatch(/observeAndRecordOneMouth\s*\(/);
    expect(registry).toMatch(/oneMouthCampaignSubject\s*\(/);
  });

  it('is still shadow mode and still cannot claim to have blocked anything', async () => {
    const { pool } = stubPool();
    const out = await observeAndRecordOneMouth(pool, oneMouthCampaignSubject(campaign));
    expect(out?.observation.mode).toBe(ONE_MOUTH_MODE);
    expect(ONE_MOUTH_MODE).toBe('shadow');
    // The literal false, from the type and at runtime.
    expect(out?.observation.blocked).toBe(false);
    expect(out?.observation).not.toHaveProperty('allowed');
    expect(out?.observation).not.toHaveProperty('usableText');
  });
});

/* ════════ 2. IT CANNOT BLOCK AND IT CANNOT THROW ════════ */

describe('a measurement can never break the path it measures', () => {
  it('resolves rather than throwing when the ledger write fails', async () => {
    const { pool } = stubPool({ insertFails: true });
    const out = await observeAndRecordOneMouth(pool, oneMouthCampaignSubject(campaign));
    expect(out).not.toBeNull();
    expect(out?.recorded).toBe(false);
  });

  it('resolves rather than throwing when the gate itself explodes', async () => {
    const { pool } = stubPool({ gateThrows: true });
    const out = await observeAndRecordOneMouth(pool, oneMouthCampaignSubject(campaign));
    // The observation still exists, and it says the check did not complete rather than
    // reporting a clean pass — which would understate the base rate.
    expect(out?.observation.wouldBlock).toBe(true);
    expect(out?.observation.disposition).toBe('refused');
  });

  it('records nothing at all when there is no text to observe', async () => {
    /*
     * A campaign with an empty name and no detail would otherwise ledger a digest over
     * near-zero bytes as though the desk had published it, and the base rate would then
     * include rows for text that does not exist. `null` is the honest answer.
     */
    const { pool, queries } = stubPool();
    const out = await observeAndRecordOneMouth(pool, {
      surface: 'dist_campaign',
      locator: { table: 'dist_campaigns', rowId: CAMPAIGN, columns: 'name' },
      text: '   \n  ',
      actor: 'nik',
    });
    expect(out).toBeNull();
    expect(ledgerWrite(queries)).toBeUndefined();
  });
});

/* ════════ 3. THE DIGEST JOINS THE WARRANT'S ════════ */

describe('the observation and the warrant are about the same bytes', () => {
  it('composes exactly composeCampaignPublicText and nothing of its own', () => {
    const subject = oneMouthCampaignSubject(campaign);
    expect(subject.text).toBe(composeCampaignPublicText({
      name: campaign.name, detail: campaign.detail,
    }));
  });

  it('produces the digest the warrant would produce over the same campaign', async () => {
    const { pool } = stubPool();
    const out = await observeAndRecordOneMouth(pool, oneMouthCampaignSubject(campaign));
    const warrantDigest = await gateTextSha256(composeCampaignPublicText({
      name: campaign.name, detail: campaign.detail,
    }));
    // THE JOIN. If these drift, a warrant and a shadow row about the same launch stop
    // being connectable and nothing anywhere reports that they have.
    expect(out?.observation.textSha256).toBe(warrantDigest);
  });

  it('covers a NULL detail with the sentence the export actually publishes', () => {
    // `campaignPublicDescription` substitutes a real sentence for a NULL detail, and the
    // observation must be over that — not over a missing line.
    const subject = oneMouthCampaignSubject({ ...campaign, detail: null });
    expect(subject.text).toContain('PayAgent distribution campaign — PayAgent launch quest');
  });

  it('states which bytes it read, using the sweep\'s own vocabulary', () => {
    const subject = oneMouthCampaignSubject(campaign);
    expect(subject.locator.columns).toBe(SOURCE_COLUMNS.dist_campaign);
    expect(subject.locator.table).toBe('dist_campaigns');
    expect(subject.locator.rowId).toBe(CAMPAIGN);
  });
});

/* ════════ 4. NOT-RECORDED IS ITS OWN STATE ════════ */

describe('three ways to have no row, and they are not the same fact', () => {
  it('observed-and-recorded', async () => {
    const { pool, queries } = stubPool({ ledger: true });
    const out = await observeAndRecordOneMouth(pool, oneMouthCampaignSubject(campaign));
    expect(out?.recorded).toBe(true);
    expect(ledgerWrite(queries)).toBeDefined();
  });

  it('observed-and-NOT-recorded, because 0073 is not applied here', async () => {
    /*
     * The dangerous one. The engine ran, this process knows what it found, and the ledger
     * does not — so the shadow count under-reports by an amount nothing can recover. It
     * must be distinguishable from "nothing was observed", which is why the call site
     * returns the observation AND the write result rather than a boolean.
     */
    const { pool, queries } = stubPool({ ledger: false });
    const out = await observeAndRecordOneMouth(pool, oneMouthCampaignSubject(campaign));
    expect(out).not.toBeNull();
    expect(out?.recorded).toBe(false);
    expect(ledgerWrite(queries)).toBeUndefined();
  });

  it('not observed at all', async () => {
    const { pool } = stubPool();
    const out = await observeAndRecordOneMouth(pool, { ...oneMouthCampaignSubject(campaign), text: '' });
    expect(out).toBeNull();
  });

  it('gives the three outcomes three distinguishable shapes', async () => {
    /*
     * Asserted directly, so collapsing two of them fails here.
     *
     * THE RESET BETWEEN EACH CALL IS LOAD-BEARING and the first version of this test did
     * not have it: `oneMouthLedgerMigrated` caches the `to_regclass` probe per PROCESS,
     * so the second pool never got asked whether it had the table and inherited the
     * first pool's answer. Two of the three shapes came back identical and the test
     * failed for a reason that had nothing to do with the code under test. In a real API
     * process the cache is correct — one process, one database — and it is only three
     * pools in one test that makes it visible.
     */
    _resetOneMouthLedgerMigrated();
    const { pool: a } = stubPool({ ledger: true });
    const recorded = await observeAndRecordOneMouth(a, oneMouthCampaignSubject(campaign));
    _resetOneMouthLedgerMigrated();
    const { pool: b } = stubPool({ ledger: false });
    const unrecorded = await observeAndRecordOneMouth(b, oneMouthCampaignSubject(campaign));
    _resetOneMouthLedgerMigrated();
    const { pool: c } = stubPool();
    const none = await observeAndRecordOneMouth(c, { ...oneMouthCampaignSubject(campaign), text: '' });
    const shape = (r: { recorded: boolean } | null) => r === null ? 'none' : String(r.recorded);
    expect(new Set([shape(recorded), shape(unrecorded), shape(none)]).size).toBe(3);
  });
});

/* ════════ 5. WHOSE MOUTH IT IS ════════ */

describe('the actor is the campaign author, never the principal pressing the button', () => {
  it('takes created_by as the actor', () => {
    expect(oneMouthCampaignSubject(campaign).actor).toBe('nik');
  });

  it('reports an unattributed actor rather than inventing one', async () => {
    /*
     * A campaign with no `created_by` is observed with a placeholder that LOOKS like one.
     * The Art 91(3)(c) limb still runs and still refuses against it — text whose author
     * this desk cannot identify cannot have its holdings limb cleared — but
     * `actorAttributed: false` keeps that refusal from being read as a finding about a
     * named colleague.
     */
    const { pool } = stubPool();
    const subject = oneMouthCampaignSubject({ ...campaign, createdBy: null });
    expect(subject.actor).toBeNull();
    const out = await observeAndRecordOneMouth(pool, subject);
    expect(out?.observation.actor).toBe(UNATTRIBUTED_ACTOR);
    expect(out?.observation.actorAttributed).toBe(false);
  });

  it('treats a whitespace-only created_by as no author rather than as one', () => {
    expect(oneMouthCampaignSubject({ ...campaign, createdBy: '   ' }).actor).toBeNull();
  });
});
