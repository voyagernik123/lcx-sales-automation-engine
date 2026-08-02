import { describe, expect, it } from 'vitest';
import { X_CHANNEL_LIMIT, art7Budget } from './regime.js';
import { assessAmplification } from './adoption.js';
import { checkClaimSafety } from './claimSafety.js';
import type { AmplificationRequest, Speaker, TargetPost } from './adoption.js';
import type { DeskMode, InboundProvenance, Refusal } from './types.js';

/**
 * THE FOUR JOURNEYS THAT CROSS A MODULE BOUNDARY.
 *
 * Each lane proved its own arithmetic. What no lane could prove is that the pieces answer
 * a real question end to end — that the claim gate's refusal actually reaches the adoption
 * gate, and that the boilerplate arithmetic actually produces a number a human can act on.
 * These are the crossings, exercised rather than described.
 */

const GRADED: InboundProvenance = {
  state: 'graded',
  channel: 'oembed',
  reliability: 'B',
  credibility: 2,
  admiralty: 'B2',
  senderAuth: null,
  corroboration: [
    { channel: 'oembed', agrees: ['post_text', 'author_handle'], disagrees: [], observedAt: '2026-08-01T00:00:00Z', evidence: 'oembed json' },
  ],
  observedAt: '2026-08-01T00:00:00Z',
  collectedAt: '2026-08-01T00:00:00Z',
};

const PREDICTION = 'BTC hits $250,000 by December, easily.';

function target(overrides: Partial<TargetPost> = {}): TargetPost {
  return {
    permalink: 'https://x.com/someguy/status/1',
    handle: '@someguy',
    text: PREDICTION,
    provenance: GRADED,
    // Verified by a named human, so the refusal below cannot be attributed to the target
    // being unverified. The point under test is the CLAIM, not the provenance.
    verification: 'verified_by_desk',
    isLcxOwnAccount: false,
    partner: { state: 'not_a_partner', checkedAt: '2026-08-01T00:00:00Z' },
    ...overrides,
  };
}

const SPEAKER: Speaker = {
  actor: 'nik',
  capacity: 'official_account',
  handle: '@lcx',
  employmentDisclosedInProfileOnly: false,
  itemPromotesEmployer: false,
};

const NORMAL: DeskMode = { kind: 'normal' };
const codes = (rs: readonly Refusal[]): readonly string[] => rs.map((r) => r.code);

describe('an Art 7 promotion that cannot fit its boilerplate refuses with the shortfall', () => {
  /**
   * The finding that is architecture rather than style: Art 7(1)(d)+(e) mandate roughly
   * 330 characters of text no instrument may shorten, and an X post holds 280. The engine
   * can therefore PROVE the item is impossible on the surface before anybody drafts it.
   *
   * The number matters. "This might be too long" is advice; "short by 108 characters before
   * a single word of yours" is arithmetic a human can act on, and it forecloses the
   * negotiation where somebody trims the mandated text.
   */
  it('names the character shortfall and routes to a different surface', () => {
    const out = art7Budget({
      regime: 'offer_promo',
      role: 'platform_operator',
      disclosure: {
        whitePaperPublishedStatement: 'A crypto-asset white paper has been published.',
        websiteAddress: 'https://issuer.example',
        telephone: '+423 123 4567',
        email: 'ir@issuer.example',
      },
      body: 'New listing: TOKEN goes live Thursday. Trade it on LCX.',
      channel: X_CHANNEL_LIMIT,
    });

    expect(out.fits).toBe(false);
    expect(out.refusal?.code).toBe('ART_7_BOILERPLATE_DOES_NOT_FIT');
    // The mandated block alone exceeds the ceiling: 388 against 280.
    expect(out.block.totalChars).toBe(388);
    expect(out.limit).toBe(280);
    expect(out.remainingForEditorial).toBe(-108);
    expect(out.refusal?.sentence).toContain('short by 108 characters');
    // Not "shorten it": there is nothing here the desk is allowed to shorten.
    expect(out.refusal?.recovery.kind).toBe('different_surface');
    expect(JSON.stringify(out.refusal?.recovery)).toContain('landing page');
  });
});

describe('a like of a third-party price prediction refuses', () => {
  /**
   * THE VERB IS THE ACT. A like produces no words of ours, so a wording review sees
   * nothing at all — and FINRA's entanglement/adoption doctrine (RN 17-18) says the like
   * ADOPTS the target's claims. So the refusal cannot come from reading our text; it has to
   * come from the claim gate having been run on THEIRS and its verdict crossing the
   * boundary.
   *
   * This test is the crossing. `checkClaimSafety` refuses the prediction; those refusals
   * are handed to `assessAmplification` as `targetFindings`; and the like is refused with
   * the inherited code recorded as inherited rather than as something we said.
   */
  it('refuses on the target\'s claim-gate findings, and marks them inherited', () => {
    const gate = checkClaimSafety({
      text: PREDICTION,
      channel: 'x_public',
      verb: 'reply',
      claimIdsCited: [],
      topic: null,
      jurisdiction: 'eu',
      product: null,
      sourceText: null,
      substantiatedFigures: [],
      solvencyAttestationRef: null,
    });

    // The claim gate refuses a price call outright — it is a regulated promise, and there
    // is no version of it that survives being softened.
    expect(gate.verdict.disposition).toBe('refused');
    expect(codes(gate.verdict.refusals)).toContain('REGULATED_PROMISE_PRICE');
    // Doctrine rule 1: on a refusal there is no field left holding the softened promise.
    expect(gate.usableText).toBeNull();

    const request: AmplificationRequest = {
      verb: 'like',
      surface: 'reply',
      speaker: SPEAKER,
      target: target(),
      ownText: null,
      deskMode: NORMAL,
      targetFindings: gate.verdict.refusals,
    };
    const v = assessAmplification(request);

    expect(codes(v.refusals)).toContain('ADOPTION_OF_REFUSED_CONTENT');
    expect(v.inheritedRefusalCodes).toContain('REGULATED_PROMISE_PRICE');
    expect(v.adoption.effect).toBe('adopts_target_claims');
    expect(v.adoption.inheritsTargetRisk).toBe(true);

    /*
     * NOT RECOVERABLE, and this is the part a warning could not express. Every other
     * refusal in this compartment can be answered by editing something. A like has no
     * editable surface: the only way to not adopt the claim is to not press the button. If
     * this ever comes back as `edit_text` the surface will offer a rewrite box for an act
     * that has no text, and the operator will conclude the tool is broken.
     */
    const inherited = v.refusals.find((r) => r.code === 'ADOPTION_OF_REFUSED_CONTENT');
    expect(inherited?.recovery.kind).toBe('not_recoverable');
  });

  /**
   * The control condition. If the gate is not run at all, the answer is a refusal too —
   * `targetFindings: null` means nobody looked, and "nobody looked" must never render the
   * same as "looked and found nothing". An empty array is the clean result.
   */
  it('distinguishes a clean check from no check at all', () => {
    const base: AmplificationRequest = {
      verb: 'like', surface: 'reply', speaker: SPEAKER,
      target: target({ text: 'Great support experience today.' }),
      ownText: null, deskMode: NORMAL, targetFindings: [],
    };
    expect(codes(assessAmplification(base).refusals)).not.toContain('ADOPTION_OF_REFUSED_CONTENT');
    const unchecked = assessAmplification({ ...base, targetFindings: null });
    expect(unchecked.refusals.length).toBeGreaterThan(0);
    expect(unchecked.notChecked.length).toBeGreaterThan(0);
  });
});
