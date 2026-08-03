import { describe, expect, it } from 'vitest';
import { previewRefusals, composeGates, type EngineGateVerdicts } from '../preChecks';
import { UNANSWERED, buildBodies, missingDeclarations, type Declarations } from '../EngineVerdicts';
import type { GateReading, Refusal, RefusalCode } from '../vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  A GATE NOBODY ANSWERED, AND A REFUSAL NOBODY RENDERED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The drafting room called `POST /v1/marketing/review` for weeks against a router that never
 * declared it, so all four gates read `absent` on every environment. That was CORRECT
 * behaviour over a wrong path, which is the worst kind of defect available here: it looks like
 * caution. Repointing it at three live routes opens two new ways to be quietly wrong, and both
 * are what these tests hold shut.
 *
 *  1. A refusal that is COMPUTED AND NEVER RENDERED. Re-cutting the gate axes moved
 *     `ART_7_BOILERPLATE_DOES_NOT_FIT` off the regime gate and, for twenty minutes, onto
 *     nothing at all — `previewRefusals` produced it and no gate showed it.
 *  2. A DECLARATION CLEARED BY OMISSION. `/regime`'s validator throws on a missing boolean
 *     rather than reading it as `false`, and `giveawayRequiresPersonalDataOrBenefit` widens the
 *     regime set on `'unknown'`. A form that defaulted either would obtain a clearance by
 *     leaving a field blank, which is the failure mode the engine is built around.
 *
 * ── HOW EACH TEST IS FALSIFIED, verified by reverting rather than by inspection ──
 *  · Drop a code from `composeGates`'s `byCode` lists → the completeness test fails, naming it.
 *  · Change `gate()` to return `source: 'engine'` on a `null` engine answer → the
 *    unanswered-is-not-clean tests fail.
 *  · Coalesce `engine.claimSafety ?? []` anywhere → the same tests fail, because `[]` renders
 *    as an answered clean gate.
 *  · Make any field of `Declarations` default to `false` or `[]` → `buildBodies` starts
 *    returning a body from an incomplete declaration and the omission tests fail.
 *  · Send `authorisedServices: []` instead of `null` → the named-gap test fails.
 */

const COMPLETE: Declarations = {
  surface: 'reply',
  purpose: 'support_answer',
  consideration: 'none',
  art7Role: 'platform_operator',
  authorAccount: 'lcx_official',
  firstPartyLinkPresent: false,
  citesOwnRegulatoryStatus: false,
  employmentRelationshipDisclosed: true,
  giveawayRequiresPersonalDataOrBenefit: false,
  targetVerification: 'unverified',
};

const ABSENT_SENTENCES: Readonly<Record<GateReading['gate'], string>> = {
  claim_safety: 'claim safety was not checked',
  market_abuse: 'market abuse was not checked',
  regime: 'the regime was not classified',
  length_budget: 'the arithmetic did not run',
  adoption: 'the act was not assessed',
};

const engineRefusal = (code: RefusalCode): Refusal => ({
  code,
  sentence: `the engine refused: ${code}`,
  rule: { instrument: 'mica', provision: 'Art 66(2)', text: 'fair, clear and not misleading' },
  recovery: { kind: 'not_recoverable', why: 'no version of this passes' },
  matched: null,
  ruleSetVersion: 3,
});

const NO_ENGINE: EngineGateVerdicts = {
  claimSafety: null, marketAbuse: null, regime: null, lengthBudget: null, adoption: null,
};

const gatesFor = (engine: EngineGateVerdicts | null, pre: readonly Refusal[] = []) =>
  composeGates({ pre, engine, absentBecause: ABSENT_SENTENCES });

/* ════════ EVERY REFUSAL THIS SCREEN CAN PRODUCE REACHES A GATE ════════ */

describe('no refusal this screen computes is dropped on the floor', () => {
  it('routes every code previewRefusals can emit onto some gate', () => {
    /*
     * Generated from the pre-check pass rather than from a hand-written list, over inputs
     * chosen to fire each branch: an adopting verb, the halo phrase that is LCX's own brand
     * line, second-person advice, a cashtag, an Art 7 promotion, and text past the ceiling.
     * A hand-written list of codes would agree with itself forever.
     */
    const emitted = new Set<RefusalCode>();
    const cases: readonly Parameters<typeof previewRefusals>[0][] = [
      { text: 'we are fully regulated in Liechtenstein', verb: 'reply', promotesOfferOrListing: false },
      { text: 'you should buy $LCX now', verb: 'reply', promotesOfferOrListing: false },
      { text: 'listing soon', verb: 'reply', promotesOfferOrListing: true },
      { text: 'x'.repeat(400), verb: 'reply', promotesOfferOrListing: false },
      { text: '', verb: 'like', promotesOfferOrListing: false },
      { text: '', verb: 'repost', promotesOfferOrListing: false },
      { text: 'see this', verb: 'quote', promotesOfferOrListing: false },
    ];
    for (const c of cases) for (const r of previewRefusals(c)) emitted.add(r.code);
    expect(emitted.size, 'the pre-check pass emitted nothing, so this test proves nothing').toBeGreaterThan(3);

    const rendered = new Set(
      gatesFor(null, [...emitted].map(engineRefusal)).flatMap((g) => g.refusals.map((r) => r.code)),
    );
    for (const code of emitted) {
      expect(
        rendered.has(code),
        `${code} is produced by previewRefusals and appears on NO gate, so an operator never sees it. `
        + 'A refusal computed and silently dropped is worse than one never computed.',
      ).toBe(true);
    }
  });

  it('the Art 7 arithmetic refusal lands on the length gate and not on the regime gate', () => {
    // Its own test because it is the one that was actually lost. The mandated block alone can
    // exceed the ceiling, so presenting it as a wording finding invites an operator to edit
    // their sentence when nothing they write can help.
    const pre = previewRefusals({ text: 'listing soon', verb: 'reply', promotesOfferOrListing: true });
    const gates = gatesFor(null, pre);
    const on = (g: GateReading['gate']) =>
      gates.find((x) => x.gate === g)?.refusals.map((r) => r.code) ?? [];
    expect(on('length_budget')).toContain('ART_7_BOILERPLATE_DOES_NOT_FIT');
    expect(on('regime')).not.toContain('ART_7_BOILERPLATE_DOES_NOT_FIT');
  });
});

/* ════════ AN UNANSWERED GATE IS NOT A CLEAN ONE ════════ */

describe('a gate with no engine answer never reads as passed', () => {
  it('renders all five as absent when no engine answered', () => {
    const gates = gatesFor(null);
    expect(gates.map((g) => g.gate)).toEqual([
      'claim_safety', 'market_abuse', 'regime', 'length_budget', 'adoption',
    ]);
    for (const g of gates) {
      expect(g.source, `${g.gate} claimed an engine verdict with no engine`).toBe('absent');
      expect(g.absentBecause, `${g.gate} gave no reason`).toBe(ABSENT_SENTENCES[g.gate]);
    }
  });

  it('keeps null and [] apart per axis, so a live verdict and a dead route look different', () => {
    // The exact shape `/review` returns on an environment where the words gate ran and the
    // register gate could not: one answered cleanly, one did not complete.
    const gates = gatesFor({ ...NO_ENGINE, claimSafety: [] });
    const claim = gates.find((g) => g.gate === 'claim_safety');
    const abuse = gates.find((g) => g.gate === 'market_abuse');
    expect(claim?.source).toBe('engine');
    expect(claim?.refusals).toEqual([]);
    expect(claim?.absentBecause).toBeNull();
    // And the axis nobody answered is still absent, with its own sentence.
    expect(abuse?.source).toBe('absent');
    expect(abuse?.absentBecause).toBe(ABSENT_SENTENCES.market_abuse);
  });

  it('an engine answer and a local preview are both rendered, and the source is the engine', () => {
    const pre = previewRefusals({ text: 'x'.repeat(400), verb: 'reply', promotesOfferOrListing: false });
    const gates = gatesFor({ ...NO_ENGINE, lengthBudget: [engineRefusal('ART_7_BOILERPLATE_DOES_NOT_FIT')] }, pre);
    const len = gates.find((g) => g.gate === 'length_budget');
    expect(len?.source).toBe('engine');
    const codes = len?.refusals.map((r) => r.code) ?? [];
    expect(codes).toContain('ART_7_BOILERPLATE_DOES_NOT_FIT');
    // The screen's own count is kept beside the engine's, not replaced by it.
    expect(codes).toContain('LENGTH_BUDGET_EXCEEDED');
  });

  it('marks a preview-only gate advisory rather than clean', () => {
    const pre = previewRefusals({ text: 'x'.repeat(400), verb: 'reply', promotesOfferOrListing: false });
    const len = gatesFor(null, pre).find((g) => g.gate === 'length_budget');
    expect(len?.source).toBe('preview');
    // Advisory means it still carries the reason the authoritative answer is missing.
    expect(len?.absentBecause).toBe(ABSENT_SENTENCES.length_budget);
  });
});

/* ════════ NOTHING IS CLEARED BY LEAVING A FIELD BLANK ════════ */

describe('the engines are not asked until every judgement is declared', () => {
  it('names every unanswered declaration as a sentence, not a field name', () => {
    const missing = missingDeclarations(UNANSWERED);
    expect(missing.length).toBe(9);
    // A field name on screen tells a reader nothing about what to do next.
    for (const m of missing) expect(m.length, `"${m}" is too terse to act on`).toBeGreaterThan(20);
    expect(missingDeclarations(COMPLETE)).toEqual([]);
  });

  it('refuses to build a request while any declaration is unanswered', () => {
    expect(buildBodies({
      replyId: 1, verb: 'reply', text: 'hello', targetText: 'hi', declarations: UNANSWERED, verbHasTarget: false,
    })).toBeNull();

    // One field at a time: every one of the nine must block on its own, because a validator
    // that only checks the first would let the other eight through.
    const keys: readonly (keyof Declarations)[] = [
      'surface', 'purpose', 'consideration', 'art7Role', 'authorAccount',
      'firstPartyLinkPresent', 'citesOwnRegulatoryStatus', 'employmentRelationshipDisclosed',
      'giveawayRequiresPersonalDataOrBenefit',
    ];
    for (const k of keys) {
      const one = { ...COMPLETE, [k]: null };
      expect(
        buildBodies({ replyId: 1, verb: 'reply', text: 'hello', targetText: '', declarations: one, verbHasTarget: false }),
        `${k} unanswered still produced a request body, so the engine would clear it by omission`,
      ).toBeNull();
    }
  });

  it('sends a complete declaration through without inventing a value', () => {
    const b = buildBodies({
      replyId: 7, verb: 'reply', text: 'hello', targetText: 'their words',
      declarations: COMPLETE, verbHasTarget: false,
    });
    expect(b).not.toBeNull();
    // `false` survives as `false` — this is not a truthiness filter.
    expect(b?.regime.firstPartyLinkPresent).toBe(false);
    expect(b?.regime.giveawayRequiresPersonalDataOrBenefit).toBe(false);
    // NOT `[]`. An empty list reads as "authorised for nothing", which is a confident wrong
    // answer where `null` is the named gap the owner has to close.
    expect(b?.regime.authorisedServices).toBeNull();
    expect(b?.review).toEqual({ verb: 'reply', text: 'hello', replyId: 7 });
  });

  it("'unknown' on the giveaway question is sent as 'unknown', never as false", () => {
    // The engine widens the regime set on `'unknown'`. Coercing it to `false` would narrow it,
    // which clears a check by mistranslation rather than by omission.
    const b = buildBodies({
      replyId: 1, verb: 'reply', text: '', targetText: '',
      declarations: { ...COMPLETE, giveawayRequiresPersonalDataOrBenefit: 'unknown' },
      verbHasTarget: false,
    });
    expect(b?.regime.giveawayRequiresPersonalDataOrBenefit).toBe('unknown');
  });

  it('an unread target is sent as null and not as an empty string', () => {
    // The adoption verdict reports `adoptsUnreadText` — "LCX cannot adopt what it has not
    // read". An empty string is that same sentence with a confident zero in it.
    const b = buildBodies({
      replyId: 1, verb: 'quote', text: 'see this', targetText: '',
      declarations: COMPLETE, verbHasTarget: true,
    });
    expect(b?.adoption.target).not.toBeNull();
    expect(b?.adoption.target?.text).toBeNull();
    expect(b?.regime.targetBody).toBeNull();
  });

  it('sends no target at all for a verb that has none', () => {
    const b = buildBodies({
      replyId: 1, verb: 'reply', text: 'hello', targetText: 'their words',
      declarations: COMPLETE, verbHasTarget: false,
    });
    expect(b?.adoption.target).toBeNull();
  });

  it('inverts the disclosure declaration rather than forwarding it', () => {
    /*
     * The form asks whether the relationship is disclosed IN THE ITEM.
     * `employmentDisclosedInProfileOnly` asserts that the only disclosure is in the profile.
     * Forwarding one as the other records the opposite fact, and Commission Guidance §4.2.6 is
     * precisely that a profile-only disclosure is never sufficient — so a pass-through would
     * turn a compliant item into a flagged one and, worse, the reverse.
     */
    const disclosed = buildBodies({
      replyId: 1, verb: 'reply', text: 'x', targetText: '',
      declarations: { ...COMPLETE, employmentRelationshipDisclosed: true }, verbHasTarget: false,
    });
    const not = buildBodies({
      replyId: 1, verb: 'reply', text: 'x', targetText: '',
      declarations: { ...COMPLETE, employmentRelationshipDisclosed: false }, verbHasTarget: false,
    });
    expect(disclosed?.adoption.speaker.employmentDisclosedInProfileOnly).toBe(false);
    expect(not?.adoption.speaker.employmentDisclosedInProfileOnly).toBe(true);
  });

  it('derives the speaker capacity from the account, and staff promoting the employer is flagged as such', () => {
    const official = buildBodies({
      replyId: 1, verb: 'reply', text: 'x', targetText: '',
      declarations: { ...COMPLETE, authorAccount: 'lcx_official' }, verbHasTarget: false,
    });
    const staff = buildBodies({
      replyId: 1, verb: 'reply', text: 'x', targetText: '',
      declarations: { ...COMPLETE, authorAccount: 'staff_personal' }, verbHasTarget: false,
    });
    expect(official?.adoption.speaker.capacity).toBe('official_account');
    expect(official?.adoption.speaker.itemPromotesEmployer).toBe(false);
    expect(staff?.adoption.speaker.capacity).toBe('staff_personal_account');
    expect(staff?.adoption.speaker.itemPromotesEmployer).toBe(true);
  });
});
