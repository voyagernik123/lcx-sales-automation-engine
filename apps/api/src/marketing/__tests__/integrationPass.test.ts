import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENDING_MIGRATIONS, REGISTERED_MIGRATIONS } from '../../db/migrationLedger.js';

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

  /**
   * THE 90-DAY SWEEP USED TO DESTROY THE FIVE-YEAR RECORD.
   *
   * `sweepExpired` was `DELETE FROM marketing_x_reply WHERE retention_expires_at < now()`
   * and `marketing_reply_draft` cascades on `reply_id` (0046), so at day 91 every draft LCX
   * had APPROVED against the row went with it — the record MiCA Art 68(9) wants for five
   * years. `retention.ts` had the careful sweep and REFUSES until 0064; the tick called the
   * blind one. A control in a file the live path does not call is this compartment's
   * recurring defect.
   */
  it('holds an expired row carrying an unrecorded LCX statement instead of deleting it', () => {
    const svc = strip(readFileSync(resolve(SRC, 'marketing/service.ts'), 'utf8'));
    const fn = svc.slice(svc.indexOf('export async function sweepExpired'));
    const body = fn.slice(0, fn.indexOf('\nexport ', 1) === -1 ? fn.length : fn.indexOf('\nexport ', 1));
    // The DELETE is conditional on NOT being in jeopardy. An unqualified delete is the bug.
    expect(body, 'sweepExpired deletes without a jeopardy guard').toMatch(/AND NOT \(\$\{jeopardy\}\)/);
    expect(body).toMatch(/d\.status = 'approved'/);
    expect(body).toMatch(/NOT EXISTS \(SELECT 1 FROM marketing_record m/);
    // And it FAILS CLOSED: a probe that throws deletes nothing.
    expect(body).toMatch(/guard: 'unavailable'/);
    expect(body).toMatch(/deleted: 0,/);
    /*
     * `heldInJeopardy: null` on the unavailable path, never 0 — "I could not look" is not
     * "there were none", and a 0 on a panel is indistinguishable from a clean sweep.
     */
    expect(body).toMatch(/heldInJeopardy: null/);
  });

  it('reports the held count on the tick rather than swallowing it', () => {
    const tick = routes.slice(routes.indexOf("'/tick'"), routes.indexOf("'/:id/draft'"));
    expect(tick).toContain('sweepExpired(pool)');
    // `swept` is now the whole result object, so heldInJeopardy reaches the caller with it.
    expect(tick).toMatch(/swept,/);
  });

  /**
   * `marketing/postTime.ts` is the only caller of `fetchOEmbed`, `gradeInboundBatch` and
   * `recordPostedOn`, and it had NO CALLER OF ITS OWN. The consequence was exact and
   * permanent: post-time coverage is 0 on every live environment forever, because the one
   * act that could raise it never ran — while `GET /summary` reported the 0 as a fact.
   *
   * A *scheduled* engine nothing schedules is worse than an unreachable one, because the
   * number it would have moved is published.
   */
  it('runs the post-time corroboration sweep on the same tick', () => {
    const tick = routes.slice(routes.indexOf("'/tick'"), routes.indexOf("'/:id/draft'"));
    expect(tick, 'nothing schedules runPostTimeSweep — coverage stays 0 forever')
      .toContain('runPostTimeSweep(pool)');
    // Reported on the response, not run and discarded.
    expect(tick).toMatch(/postTime,/);
    /*
     * BEFORE the `mailConfigured` early return. Corroborating rows already in the queue
     * does not need a mailbox, and putting the sweep after that return would have made it
     * dead on exactly the environments that have no mailbox yet — which is most of them.
     */
    expect(
      tick.indexOf('runPostTimeSweep(pool)'),
      'the sweep sits after the unconfigured-mail early return, so it never runs there',
    ).toBeLessThan(tick.indexOf('if (!mailConfigured())'));
  });

  /**
   * The sweep's one outbound call is a credential-free GET. Asserted at the route, because
   * this is the file a reader checks when they ask "can this thing post as LCX".
   */
  it('adds no credential and no publish path to the tick', () => {
    const tick = routes.slice(routes.indexOf("'/tick'"), routes.indexOf("'/:id/draft'"));
    expect(tick).not.toMatch(/X_API_KEY|bearer|Bearer|oauth|OAuth|access_token/);
    expect(tick).not.toMatch(/method:\s*'POST'/);
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
    /* Repointed 2026-08-04 from PENDING to REGISTERED: production turned out to have
     * these applied, so "is pending" became a false premise. The invariant that
     * matters — the ledger accounts for the file, and the order it must be applied in
     * is preserved — is unchanged. See migrationLedger.ts REGISTERED_MIGRATIONS. */
    for (const f of ['0059_marketing_m0.sql', '0060_marketing_abuse.sql', '0061_marketing_record.sql']) {
      expect(REGISTERED_MIGRATIONS, f).toContain(f);
    }
    const idx = (f: string) => REGISTERED_MIGRATIONS.indexOf(f);
    expect(idx('0059_marketing_m0.sql')).toBeLessThan(idx('0060_marketing_abuse.sql'));
    expect(idx('0060_marketing_abuse.sql')).toBeLessThan(idx('0061_marketing_record.sql'));
  });

  /** The constants the API refuses with must name files a human can actually run. */
  it('matches the file names the refusing surfaces quote', async () => {
    const { ABUSE_MIGRATION } = await import('../abuseRegister.js');
    const { RECORD_MIGRATION } = await import('../record.js');
    expect(REGISTERED_MIGRATIONS).toContain(ABUSE_MIGRATION);
    expect(REGISTERED_MIGRATIONS).toContain(RECORD_MIGRATION);
  });
});
