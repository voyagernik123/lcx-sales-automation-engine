import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENDING_MIGRATIONS } from '../../db/migrationLedger.js';

/**
 * THE INTEGRATION PASS — the defects that only existed BETWEEN the lanes.
 *
 * Six lanes built the marketing compartment in parallel and each one reported, honestly,
 * a list of things it could not do because it did not own the file. Every item on those
 * lists was a real defect: not a stylistic gap, but a control that existed in one file
 * and was reachable from nowhere. This suite pins the joins.
 *
 * SOURCE-LEVEL, for the same reason `deploySafety.test.ts` is: the failure mode here is
 * "a function exists and nothing calls it", which no behavioural test can see. A test
 * that exercised `assertSent` directly would pass happily while the route stayed
 * unwritten — which is exactly the state this pass found.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const routesSrc = readFileSync(resolve(SRC, 'routes/marketing.ts'), 'utf8');
const routes = strip(routesSrc);

describe('the M0 controls that existed but were reachable from no route', () => {
  /**
   * `assertSent` is the ONLY way `answered` can become true, and it was callable from
   * nowhere. That left the M0 split — approve yields `approved_pending_send` — as a state
   * machine with no transition out of pending: strictly worse than the defect it replaced,
   * because the surface would show drafts stuck forever.
   */
  it('exposes the send assertion, attributed to the principal and not to the body', () => {
    expect(routes).toContain('assertSent');
    expect(routes).toMatch(/marketingRoutes\.post\(\s*'\/draft\/:id\/sent'/);
    // requireOperator, and the id comes from the authenticated principal.
    const block = routes.slice(routes.indexOf("'/draft/:id/sent'"));
    expect(block.slice(0, 900)).toContain('requireOperator');
    expect(block).toMatch(/assertSent\(getPool\(\), id, operator\?\.id \?\? 'unknown'\)/);
    // A body field naming the sender would make the testimony worthless.
    expect(block.slice(0, 900)).not.toMatch(/assertSent\([^)]*body/);
  });

  /**
   * The quarantine lane. An unauthenticated row is graded F6 and excluded from the queue,
   * the counts and every SLA — correct, and also the reason a forgery attempt is INVISIBLE
   * unless some surface lists it. "We are being attacked" has to be observable.
   */
  it('exposes the quarantine lane, read-only, with no path back into the queue', () => {
    expect(routes).toContain('listQuarantined');
    expect(routes).toMatch(/marketingRoutes\.get\(\s*'\/quarantined'/);
    // No route may un-quarantine: authentication is evidence, not a preference.
    expect(routes).not.toMatch(/quarantined[^\n]*=\s*false/);
    expect(routes).not.toContain('unquarantine');
  });

  /**
   * `sweepRawEmail` is the code that makes 0046's retention comment true. It ran nowhere.
   * A retention promise nothing executes is the same class of defect as the comment that
   * claimed it — one layer up.
   */
  it('runs the per-field raw_email sweep on the same tick as the row sweep', () => {
    expect(routes).toContain('sweepRawEmail');
    const tick = routes.slice(routes.indexOf("'/tick'"));
    expect(tick).toContain('sweepRawEmail(pool)');
    expect(tick).toContain('sweepExpired(pool)');
    // Reported, not silent: a sweep whose count nobody sees cannot be audited.
    expect(tick).toContain('rawCleared');
  });
});

describe('the comments that asserted guarantees the code did not keep', () => {
  /**
   * The tick handler claimed the compartment opened no inbound surface anyone could write
   * fabricated replies into. It polls a MAILBOX. Anyone who learns the address can write
   * to it, with an attacker-chosen handle, comment id and body. Authentication on the
   * route protects the trigger, not the content.
   */
  it('no longer claims the tick prevents fabricated inbound', () => {
    expect(routesSrc).toContain('BUT IT IS NOT AN ANTI-FORGERY CONTROL');
    /*
     * The old sentence survives in the file as a QUOTATION of what was wrong, which is
     * how this compartment corrects a false comment rather than deleting it. So the
     * assertion is not "the words are gone" — it is that every occurrence sits inside the
     * clause that retracts it. The first draft of this very test failed for exactly this
     * reason, which is the behaviour working.
     */
    const claim = 'opens an inbound endpoint that the public';
    let at = routesSrc.indexOf(claim);
    expect(at).toBeGreaterThan(-1);
    while (at !== -1) {
      expect(routesSrc.slice(Math.max(0, at - 400), at)).toContain('used to claim');
      at = routesSrc.indexOf(claim, at + 1);
    }
    // And it names what actually makes a forgery harmless, so the reader can go check.
    expect(routesSrc).toContain('X_MAIL_TRUSTED_AUTHSERV');
    expect(routesSrc).toMatch(/quarantin/i);
  });

  /**
   * Approve was documented as "the governed act" in the route index while writing no
   * audit row. M0 added the audit row; this pass fixed the sentence that had also implied
   * approval meant the text was sent.
   */
  it('does not describe approve as meaning the text was sent', () => {
    const index = routesSrc.slice(0, routesSrc.indexOf('import '));
    expect(index).toContain('does NOT mean sent');
    expect(index).toContain('/draft/:id/sent');
  });
});

describe('the migration ledger accounts for the marketing files', () => {
  /**
   * `PENDING_MIGRATIONS` is a MANIFEST, deliberately not derived from the directory, and
   * `db/__tests__/migrationImmutability.test.ts` fails when a file is in neither list.
   * All three marketing migrations were unregistered, so that test was red — and a red
   * ledger test is how an unapplied migration stops being announced to the operator who
   * has to run it.
   */
  it('lists 0059, 0060 and 0061 as pending, in order', () => {
    for (const f of ['0059_marketing_m0.sql', '0060_marketing_abuse.sql', '0061_marketing_record.sql']) {
      expect(PENDING_MIGRATIONS, f).toContain(f);
    }
    const idx = (f: string) => PENDING_MIGRATIONS.indexOf(f);
    expect(idx('0059_marketing_m0.sql')).toBeLessThan(idx('0060_marketing_abuse.sql'));
    expect(idx('0060_marketing_abuse.sql')).toBeLessThan(idx('0061_marketing_record.sql'));
  });

  /** The constants the API refuses with must name files a human can actually run. */
  it('matches the file names the refusing surfaces quote', async () => {
    const { ABUSE_MIGRATION } = await import('../abuseRegister.js');
    const { RECORD_MIGRATION } = await import('../record.js');
    expect(PENDING_MIGRATIONS).toContain(ABUSE_MIGRATION);
    expect(PENDING_MIGRATIONS).toContain(RECORD_MIGRATION);
  });
});
