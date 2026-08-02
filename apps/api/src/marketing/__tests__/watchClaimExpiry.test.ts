import { getClaims } from '@lcx/shared';
import type { Claim } from '@lcx/shared';
import { describe, expect, it } from 'vitest';
import {
  buildClaimExpiryLedger,
  distinctivePhrase,
  type ClaimReviewRecord,
  type LiveCopyArtefact,
} from '../watch.js';

/**
 * The claim expiry ledger. A claim true in March is a liability in August, and
 * the failure mode this is written against is the comfortable one: a blank panel
 * that reads as "nothing is overdue" when the truth is "nobody ever booked a
 * review".
 *
 * `Claim` (packages/shared/src/claims/types.ts:15-24) has no review date, so the
 * dates are an input. Every test below checks that an absence produces a refusal
 * rather than a zero.
 */

const ASOF = new Date('2026-08-02T00:00:00Z');

const claim = (over: Partial<Claim> = {}): Claim => ({
  id: 'mica-001',
  category: 'mica_awareness',
  text: 'LCX AG is registered with the FMA Liechtenstein under register number 288159 and its MiCA CASP application is in progress.',
  jurisdiction: ['eu'],
  riskLevel: 'high',
  requiresHumanReview: true,
  version: 1,
  active: true,
  ...over,
});

const review = (over: Partial<ClaimReviewRecord> = {}): ClaimReviewRecord => ({
  claimId: 'mica-001',
  claimVersionReviewed: 1,
  reviewedAt: '2026-06-01T00:00:00Z',
  reviewDueAt: '2026-12-01T00:00:00Z',
  reviewedBy: 'compliance@lcx.com',
  basis: 'FMA register No. 288159 confirmed active',
  ...over,
});

const copy = (over: Partial<LiveCopyArtefact> = {}): LiveCopyArtefact => ({
  id: 'x-bio',
  surface: 'x_profile_bio',
  body: 'Regulated crypto exchange. LCX AG is registered with the FMA Liechtenstein under register number 288159 and its MiCA CASP application is in progress.',
  publishedAt: '2026-03-01T00:00:00Z',
  ...over,
});

describe('an empty review register refuses instead of reporting a clean library', () => {
  it('is unusable, counts nothing, and says why', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [claim()],
      reviews: [],
      liveCopy: [copy()],
      asOf: ASOF,
    });
    expect(ledger.usable).toBe(false);
    expect(ledger.counts).toBeNull();
    expect(ledger.rows).toHaveLength(0);
    expect(ledger.refusals.map((r) => r.code)).toContain('WATCH_CLAIM_REVIEW_REGISTER_EMPTY');
    expect(ledger.refusals[0].sentence).toContain('not because the library is fresh');
  });

  it('cites that Claim carries no review date, so the register is the only source of one', () => {
    const ledger = buildClaimExpiryLedger({ claims: [claim()], reviews: [], liveCopy: [], asOf: ASOF });
    expect(ledger.refusals[0].rule).toContain('no review date');
  });
});

describe('buckets', () => {
  it('a claim past its review date is past_due with negative days', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [claim()],
      reviews: [review({ reviewDueAt: '2026-07-01T00:00:00Z' })],
      liveCopy: [copy()],
      asOf: ASOF,
    });
    expect(ledger.rows[0].bucket).toBe('past_due');
    expect(ledger.rows[0].pastDue).toBe(true);
    expect(ledger.rows[0].daysUntilDue).toBe(-32);
    expect(ledger.counts?.past_due).toBe(1);
  });

  it('a claim inside the warning horizon is due_soon, and outside it is current', () => {
    const soon = buildClaimExpiryLedger({
      claims: [claim()],
      reviews: [review({ reviewDueAt: '2026-08-20T00:00:00Z' })],
      liveCopy: [copy()],
      asOf: ASOF,
      dueSoonDays: 30,
    });
    expect(soon.rows[0].bucket).toBe('due_soon');

    const later = buildClaimExpiryLedger({
      claims: [claim()],
      reviews: [review({ reviewDueAt: '2026-11-20T00:00:00Z' })],
      liveCopy: [copy()],
      asOf: ASOF,
      dueSoonDays: 30,
    });
    expect(later.rows[0].bucket).toBe('current');
    expect(later.rows[0].pastDue).toBe(false);
  });

  it('a claim reviewed at an older version is version_drift even when the date is fine', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [claim({ version: 3 })],
      reviews: [review({ claimVersionReviewed: 1, reviewDueAt: '2027-01-01T00:00:00Z' })],
      liveCopy: [copy()],
      asOf: ASOF,
    });
    expect(ledger.rows[0].bucket).toBe('version_drift');
    expect(ledger.rows[0].versionDrift).toBe(true);
    expect(ledger.rows[0].refusals.map((r) => r.code)).toContain('WATCH_CLAIM_REVIEW_INCOMPLETE');
  });

  it('keeps pastDue visible when a claim is both drifted and overdue', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [claim({ version: 2 })],
      reviews: [review({ claimVersionReviewed: 1, reviewDueAt: '2026-01-01T00:00:00Z' })],
      liveCopy: [copy()],
      asOf: ASOF,
    });
    expect(ledger.rows[0].bucket).toBe('version_drift');
    expect(ledger.rows[0].pastDue).toBe(true);
  });

  it('an active claim with no review record is unreviewed, never current', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [claim(), claim({ id: 'eu-access-001' })],
      reviews: [review()],
      liveCopy: [copy()],
      asOf: ASOF,
    });
    const row = ledger.rows.find((r) => r.claimId === 'eu-access-001');
    expect(row?.bucket).toBe('unreviewed');
    expect(row?.reviewDueAt).toBeNull();
    expect(row?.daysUntilDue).toBeNull();
    expect(ledger.counts?.current).toBe(1);
    expect(ledger.counts?.unreviewed).toBe(1);
    expect(ledger.refusals.map((r) => r.code)).toContain('WATCH_CLAIM_REVIEW_INCOMPLETE');
  });

  it('an unparseable review date counts as unreviewed rather than silently current', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [claim()],
      reviews: [review({ reviewDueAt: 'when we get round to it' })],
      liveCopy: [copy()],
      asOf: ASOF,
    });
    expect(ledger.rows[0].bucket).toBe('unreviewed');
    expect(ledger.rows[0].daysUntilDue).toBeNull();
  });

  it('the latest review supersedes an earlier one', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [claim()],
      reviews: [
        review({ reviewedAt: '2025-01-01T00:00:00Z', reviewDueAt: '2025-07-01T00:00:00Z' }),
        review({ reviewedAt: '2026-06-01T00:00:00Z', reviewDueAt: '2027-06-01T00:00:00Z' }),
      ],
      liveCopy: [copy()],
      asOf: ASOF,
    });
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].bucket).toBe('current');
    expect(ledger.rows[0].reviewedAt).toBe('2026-06-01T00:00:00Z');
  });

  it('sorts the claims a human must act on to the top', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [
        claim({ id: 'a-current' }),
        claim({ id: 'b-overdue' }),
        claim({ id: 'c-unreviewed' }),
      ],
      reviews: [
        review({ claimId: 'a-current', reviewDueAt: '2027-01-01T00:00:00Z' }),
        review({ claimId: 'b-overdue', reviewDueAt: '2026-01-01T00:00:00Z' }),
      ],
      liveCopy: [copy()],
      asOf: ASOF,
    });
    expect(ledger.rows.map((r) => r.claimId)).toEqual(['c-unreviewed', 'b-overdue', 'a-current']);
  });
});

describe('which live copy depends on an expiring claim', () => {
  it('is null with an empty copy register, not an empty list', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [claim()],
      reviews: [review()],
      liveCopy: [],
      asOf: ASOF,
    });
    expect(ledger.rows[0].dependentCopy).toBeNull();
    expect(ledger.refusals.map((r) => r.code)).toContain('WATCH_LIVE_COPY_REGISTER_EMPTY');
  });

  it('finds copy that quotes the claim verbatim', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [claim()],
      reviews: [review({ reviewDueAt: '2026-07-01T00:00:00Z' })],
      liveCopy: [copy(), copy({ id: 'unrelated', body: 'Trade over 100 assets.' })],
      asOf: ASOF,
    });
    expect(ledger.rows[0].dependentCopy).toHaveLength(1);
    expect(ledger.rows[0].dependentCopy?.[0]).toMatchObject({ artefactId: 'x-bio', basis: 'phrase_match' });
  });

  it('prefers a declared link and does not double-count it', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [claim()],
      reviews: [review()],
      liveCopy: [copy({ claimIdsDeclared: ['mica-001'] })],
      asOf: ASOF,
    });
    expect(ledger.rows[0].dependentCopy).toHaveLength(1);
    expect(ledger.rows[0].dependentCopy?.[0].basis).toBe('declared');
  });

  it('misses a paraphrase, and the ledger says the list is a lower bound', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [claim()],
      reviews: [review()],
      liveCopy: [copy({ id: 'paraphrase', body: 'We are FMA-registered in Liechtenstein and our MiCA licence is being processed.' })],
      asOf: ASOF,
    });
    expect(ledger.rows[0].dependentCopy).toEqual([]);
    expect(ledger.dependencyMethodNote).toContain('lower bound');
  });

  it('refuses rather than reporting zero when a claim is too short to match on', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [claim({ id: 'short-001', text: 'Regulated.' })],
      reviews: [review({ claimId: 'short-001' })],
      liveCopy: [copy()],
      asOf: ASOF,
    });
    expect(ledger.rows[0].dependentCopy).toBeNull();
    expect(ledger.rows[0].refusals.map((r) => r.code)).toContain('WATCH_COPY_LINK_NOT_DERIVABLE');
  });

  it('still lists a declared link for a claim too short to phrase-match', () => {
    const ledger = buildClaimExpiryLedger({
      claims: [claim({ id: 'short-001', text: 'Regulated.' })],
      reviews: [review({ claimId: 'short-001' })],
      liveCopy: [copy({ claimIdsDeclared: ['short-001'] })],
      asOf: ASOF,
    });
    expect(ledger.rows[0].dependentCopy).toHaveLength(1);
    expect(ledger.rows[0].refusals.map((r) => r.code)).toContain('WATCH_COPY_LINK_NOT_DERIVABLE');
  });

  it('will not match on a phrase too short to be evidence of anything', () => {
    expect(distinctivePhrase('Regulated.')).toBeNull();
    expect(distinctivePhrase('   ')).toBeNull();
    expect(distinctivePhrase('LCX is registered with the FMA in Liechtenstein.')).toContain('lcx is registered');
  });
});

describe('against the real claim library', () => {
  it('reports the whole active library as unreviewed when the register is partial', () => {
    const claims = getClaims();
    expect(claims.length).toBeGreaterThan(5);
    const ledger = buildClaimExpiryLedger({
      claims,
      reviews: [review({ claimId: claims[0].id, claimVersionReviewed: claims[0].version })],
      liveCopy: [copy()],
      asOf: ASOF,
    });
    expect(ledger.rows).toHaveLength(claims.length);
    expect(ledger.counts?.unreviewed).toBe(claims.length - 1);
    const incomplete = ledger.refusals.find((r) => r.code === 'WATCH_CLAIM_REVIEW_INCOMPLETE');
    expect(incomplete?.sentence).toContain(`${claims.length - 1} of ${claims.length}`);
  });
});
