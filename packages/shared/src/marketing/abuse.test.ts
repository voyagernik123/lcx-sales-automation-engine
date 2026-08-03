import { describe, expect, it } from 'vitest';

import * as abuseModule from './abuse.js';
import {
  EMPTY_EMBARGO_REGISTER,
  EMPTY_HOLDINGS_REGISTER,
  MARKET_ABUSE_CITATIONS,
  MARKET_ABUSE_RULESET_VERSION,
  STANCE_MARKERS,
  assessDisclosureCure,
  assessMarketAbuse,
  assessStance,
  checkDisclosureMixedWithMarketing,
  checkEmbargo,
  checkRumourRestatement,
  checkUndisclosedHolding,
  instantMs,
  resolveEmbargo,
  resolveHoldings,
  stanceEngagesArt91_3_c,
  type ConflictDisclosure,
  type ContraryItem,
  type EmbargoRegister,
  type HoldingsRegister,
  type MarketAbuseInput,
  type RumourRestatement,
  type VerificationStep,
} from './abuse.js';
import { REFUSAL_CODES, VERB_INHERITS_TARGET_RISK, type EngagementAct } from './types.js';

/* ════════ fixtures ════════ */

const NOW = '2026-08-02T12:00:00.000Z';
const PAST = '2026-05-01T00:00:00.000Z';
const FUTURE = '2026-12-31T00:00:00.000Z';

/** An embargo register that positively clears everything not listed. */
function attestedEmbargoRegister(
  entries: EmbargoRegister['entries'] = [
    {
      asset: 'ETH',
      state: 'clear',
      basis: 'listed since 2021, publicly announced',
      recordedBy: 'ops@lcx.com',
      recordedAt: PAST,
      reviewBy: FUTURE,
      announcedAt: PAST,
    },
  ],
): EmbargoRegister {
  return {
    entries,
    completeness: {
      kind: 'attested',
      by: 'compliance@lcx.com',
      at: PAST,
      nextAttestationDue: FUTURE,
    },
  };
}

function holdingsRegister(entries: HoldingsRegister['entries']): HoldingsRegister {
  return {
    entries,
    completeness: {
      kind: 'attested',
      by: 'compliance@lcx.com',
      at: PAST,
      nextAttestationDue: FUTURE,
    },
  };
}

function act(overrides: Partial<EngagementAct> = {}): EngagementAct {
  return {
    verb: 'reply',
    targetPermalink: 'https://x.com/someone/status/1',
    targetHandle: 'someone',
    author: 'nik@lcx.com',
    surface: 'reply',
    namedAssets: ['ETH'],
    adoption: 'own_communication_only',
    ...overrides,
  };
}

function input(overrides: Partial<MarketAbuseInput> = {}): MarketAbuseInput {
  return {
    act: act(),
    text: 'ETH deposits and withdrawals are open on LCX.',
    attributedActors: [],
    declaredStance: null,
    intents: ['community_reply'],
    linkPresent: false,
    embargoRegister: attestedEmbargoRegister(),
    holdingsRegister: holdingsRegister([
      { actor: 'nik@lcx.com', asset: 'ETH', declared: 'declared_none', declaredAt: PAST, reviewBy: FUTURE, note: null },
    ]),
    disclosure: null,
    rumour: null,
    publishAt: NOW,
    now: NOW,
    ...overrides,
  };
}

function codes(verdict: { readonly refusals: readonly { readonly code: string }[] }): string[] {
  return verdict.refusals.map((r) => r.code);
}

/* ════════ THE WORKED EXAMPLES ════════ */

describe('worked example 1 — MiCA Art 90(1): the "coming soon" reply', () => {
  // A social coordinator answers "when XYZ??" with "something big coming for XYZ 👀".
  // The sentence is unremarkable. XYZ's listing is at diligence stage — Art 87(2)-(3)
  // put the intermediate steps of a protracted process inside inside information — and
  // has not been announced. Art 90(1): "No person in possession of inside information
  // shall unlawfully disclose inside information to any other person". A wording review
  // passes this every time; only the register catches it.
  const verdict = assessMarketAbuse(
    input({
      act: act({ namedAssets: ['XYZ'] }),
      text: 'Something big coming for XYZ 👀',
      embargoRegister: attestedEmbargoRegister([
        {
          asset: 'XYZ',
          state: 'mnpi_pending',
          basis: 'listing committee approved 2026-07-28, announcement not yet made',
          recordedBy: 'listings@lcx.com',
          recordedAt: PAST,
          reviewBy: FUTURE,
          announcedAt: null,
        },
      ]),
      holdingsRegister: holdingsRegister([
        { actor: 'nik@lcx.com', asset: 'XYZ', declared: 'declared_none', declaredAt: PAST, reviewBy: FUTURE, note: null },
      ]),
    }),
  );

  it('refuses, and does not merely warn', () => {
    expect(verdict.disposition).toBe('refused');
    expect(codes(verdict)).toContain('ART_90_ASSET_UNDER_EMBARGO');
  });

  it('cites Art 90(1) verbatim and names the asset', () => {
    const r = verdict.refusals.find((x) => x.code === 'ART_90_ASSET_UNDER_EMBARGO');
    expect(r?.rule.provision).toBe('Art 90(1)');
    expect(r?.rule.text).toContain('unlawfully disclose inside information');
    expect(r?.matched).toBe('XYZ');
  });

  it('offers no wording fix, because none exists — only waiting for the disclosure', () => {
    const r = verdict.refusals.find((x) => x.code === 'ART_90_ASSET_UNDER_EMBARGO');
    expect(r?.recovery.kind).toBe('wait_until');
  });

  it('is caught by the register join and not by the words: no stance marker fires', () => {
    expect(verdict.stance.findings).toEqual([]);
    expect(verdict.stance.stance).toBe('undetermined');
  });
});

describe('worked example 2 — MiCA Art 91(3)(c): the bullish post about a personal bag', () => {
  // The drafter holds SOL personally and posts "we are very bullish on SOL here". Art
  // 91(3)(c) catches "voicing an opinion about a crypto-asset, while having previously
  // taken positions on that crypto-asset ... without having simultaneously disclosed
  // that conflict of interest to the public in a proper and effective way". Art
  // 111(2)(d) sets fines for a NATURAL PERSON from EUR 700 000.
  const verdict = assessMarketAbuse(
    input({
      act: act({ namedAssets: ['SOL'] }),
      text: 'We are very bullish on SOL here.',
      embargoRegister: attestedEmbargoRegister(),
      holdingsRegister: holdingsRegister([
        { actor: 'nik@lcx.com', asset: 'SOL', declared: 'declared_holding', declaredAt: PAST, reviewBy: FUTURE, note: 'spot, personal account' },
      ]),
    }),
  );

  it('refuses on the holding, not on the wording', () => {
    expect(verdict.disposition).toBe('refused');
    expect(codes(verdict)).toEqual(['ART_91_3_C_UNDISCLOSED_HOLDING']);
  });

  it('cites Art 91(3)(c) and states the personal-fine floor', () => {
    const r = verdict.refusals[0];
    expect(r?.rule.provision).toBe('Art 91(3)(c)');
    expect(r?.rule.text).toContain('simultaneously disclosed that conflict of interest');
    expect(r?.sentence).toContain('EUR 700 000');
  });

  it('names the marker that made it an opinion, so the judgement is arguable', () => {
    expect(verdict.stance.stance).toBe('directional');
    expect(verdict.stance.findings.map((f) => f.markerId)).toContain('endorsement');
    expect(verdict.stance.findings.map((f) => f.matched)).toContain('bullish');
  });

  it('directs the fix into the artefact itself — a register entry does not cure it', () => {
    const r = verdict.refusals[0];
    expect(r?.recovery.kind).toBe('edit_text');
    expect(r?.recovery.kind === 'edit_text' && r.recovery.what).toContain('this artefact itself');
  });

  it('clears once the disclosure is public, in-artefact and names the asset', () => {
    const cured = assessMarketAbuse(
      input({
        act: act({ namedAssets: ['SOL'] }),
        text: 'We are very bullish on SOL here. Disclosure: the author holds SOL.',
        holdingsRegister: holdingsRegister([
          { actor: 'nik@lcx.com', asset: 'SOL', declared: 'declared_holding', declaredAt: PAST, reviewBy: FUTURE, note: null },
        ]),
        disclosure: {
          assets: ['SOL'],
          inArtefact: true,
          audience: 'public',
          text: 'Disclosure: the author holds SOL.',
          visibleFrom: null,
        },
      }),
    );
    expect(cured.disposition).toBe('clear');
  });
});

describe('worked example 3 — MiCA Art 91(2)(c): quote-tweeting a rumour to rebut it', () => {
  // The desk quote-tweets "LCX has been hacked" in order to deny it. The desk's own
  // file already holds the security team's confirmation that no incident occurred. Art
  // 91(2)(c) catches "disseminating information ... including the dissemination of
  // rumours, where the person who engaged in the dissemination knew, or OUGHT TO HAVE
  // KNOWN, that the information was false or misleading". Rebutting by quoting still
  // disseminates.
  const contrary: ContraryItem = {
    what: 'security team confirmed no unauthorised access in the 24h window',
    source: 'internal incident log INC-4471',
    heldSince: '2026-08-02T09:00:00.000Z',
    cuts: 'against_the_rumour',
  };
  const rumour: RumourRestatement = {
    claimSummary: 'LCX has been hacked and withdrawals are frozen',
    priceRelevant: true,
    restatesClaim: true,
    verification: [],
    contraryMaterial: [contrary],
    beliefHeld: 'believed_false',
  };
  const check = checkRumourRestatement({ verb: 'quote', rumour, publishAt: NOW });

  it('refuses the quote-rebuttal and names the ought-to-have-known limb', () => {
    expect(check.basis).toBe('contrary_material_on_file');
    expect(check.refusals[0]?.code).toBe('ART_91_2_C_RUMOUR_RESTATED');
    expect(check.refusals[0]?.rule.provision).toBe('Art 91(2)(c)');
    expect(check.refusals[0]?.sentence).toContain('ought to have known');
  });

  it('quotes the desk’s own contrary material back at it', () => {
    expect(check.refusals[0]?.sentence).toContain('INC-4471');
  });

  it('the remedy is to correct without reproducing the claim', () => {
    const recovery = check.refusals[0]?.recovery;
    expect(recovery?.kind).toBe('edit_text');
    expect(recovery?.kind === 'edit_text' && recovery.what).toContain('do not restate the');
  });

  it('material acquired only AFTER publication cannot found the negligence finding', () => {
    const later = checkRumourRestatement({
      verb: 'quote',
      rumour: { ...rumour, contraryMaterial: [{ ...contrary, heldSince: '2026-08-03T09:00:00.000Z' }] },
      publishAt: NOW,
    });
    expect(later.basis).not.toBe('contrary_material_on_file');
  });
});

describe('worked example 4 — MiCA Art 88(1): the celebratory listing post', () => {
  // "XYZ is now live on LCX — trade it here, 0% fees this week 🎉" is one artefact that
  // both discloses the listing and markets the platform. Art 88(1): issuers, offerors
  // and persons seeking admission to trading "shall not combine the disclosure of
  // inside information to the public with the marketing of their activities". Breached
  // by construction, and no wording fixes it.
  const check = checkDisclosureMixedWithMarketing(
    ['inside_information_disclosure', 'promotional'],
    true,
  );

  it('refuses the combination outright', () => {
    expect(check.refusals[0]?.code).toBe('ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING');
    expect(check.refusals[0]?.rule.provision).toBe('Art 88(1)');
    expect(check.refusals[0]?.rule.text).toContain('shall not combine the disclosure of inside information');
  });

  it('requires two artefacts rather than a reword', () => {
    const recovery = check.refusals[0]?.recovery;
    expect(recovery?.kind).toBe('different_surface');
    expect(recovery?.kind === 'different_surface' && recovery.suggestion).toContain('separate artefact');
  });

  it('a first-party CTA alone combines them, on the ESMA analogy, flagged as an analogy', () => {
    const linkOnly = checkDisclosureMixedWithMarketing(['inside_information_disclosure'], true);
    expect(linkOnly.refusals[0]?.code).toBe('ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING');
    expect(linkOnly.refusals[0]?.matched).toBe('first_party_link');
    expect(linkOnly.refusals[0]?.sentence).toContain('not a direct duty');
  });

  it('a clean disclosure artefact passes, and is reminded of the five-year duty', () => {
    const clean = checkDisclosureMixedWithMarketing(['inside_information_disclosure'], false);
    expect(clean.refusals).toEqual([]);
    expect(clean.violations[0]?.remedy).toContain('five years');
  });
});

describe('worked example 5 — the empty register (the GPS perimeter pattern)', () => {
  // The state the desk is in TODAY: the owner owes the embargo list and the holdings
  // register, and neither exists. The instrument must not read that as clearance.
  const verdict = assessMarketAbuse(
    input({
      act: act({ namedAssets: ['LCX'] }),
      text: 'LCX is undervalued at these levels.',
      embargoRegister: EMPTY_EMBARGO_REGISTER,
      holdingsRegister: EMPTY_HOLDINGS_REGISTER,
    }),
  );

  it('refuses on both registers, with distinct codes', () => {
    expect(verdict.disposition).toBe('refused');
    expect(codes(verdict)).toContain('EMBARGO_REGISTER_ABSENT');
    expect(codes(verdict)).toContain('HOLDINGS_DECLARATION_MISSING');
  });

  it('says in words that emptiness is ignorance, not clearance', () => {
    const embargo = verdict.refusals.find((r) => r.code === 'EMBARGO_REGISTER_ABSENT');
    expect(embargo?.sentence).toContain('does not mean nothing is embargoed');
    expect(embargo?.sentence).toContain('the desk does not know');
  });

  it('names who owes the missing state rather than asking for "more information"', () => {
    const holdings = verdict.refusals.find((r) => r.code === 'HOLDINGS_DECLARATION_MISSING');
    expect(holdings?.recovery.kind).toBe('supply_data');
    expect(holdings?.recovery.kind === 'supply_data' && holdings.recovery.missing).toContain(
      'staff holdings declaration register',
    );
    expect(holdings?.recovery.kind === 'supply_data' && holdings.recovery.whoCanSupply).toContain('legal');
  });
});

/* ════════ resolveEmbargo — the Art 90 join ════════ */

describe('resolveEmbargo', () => {
  it('an empty register resolves to unknown and says the desk does not know', () => {
    const r = resolveEmbargo('ETH', EMPTY_EMBARGO_REGISTER, NOW);
    expect(r.state).toBe('unknown');
    expect(r.reason).toBe('register_empty');
    expect(r.narrative).toContain('does not mean nothing is embargoed');
  });

  it('an empty register cannot be attested into clearance — there is no such path', () => {
    const attestedButEmpty: EmbargoRegister = {
      entries: [],
      completeness: { kind: 'attested', by: 'compliance@lcx.com', at: PAST, nextAttestationDue: FUTURE },
    };
    const r = resolveEmbargo('ETH', attestedButEmpty, NOW);
    expect(r.state).toBe('unknown');
    expect(r.reason).toBe('register_empty');
  });

  it('a STALE mnpi_pending row still blocks — staleness may never downgrade a block', () => {
    const r = resolveEmbargo(
      'XYZ',
      attestedEmbargoRegister([
        { asset: 'XYZ', state: 'mnpi_pending', basis: 'pending listing', recordedBy: 'a', recordedAt: PAST, reviewBy: PAST, announcedAt: null },
      ]),
      NOW,
    );
    expect(r.state).toBe('mnpi_pending');
    expect(r.reason).toBe('entry_found');
  });

  it('a mnpi_pending row with no review date at all still blocks', () => {
    const r = resolveEmbargo(
      'XYZ',
      attestedEmbargoRegister([
        { asset: 'XYZ', state: 'mnpi_pending', basis: 'pending', recordedBy: 'a', recordedAt: PAST, reviewBy: null, announcedAt: null },
      ]),
      NOW,
    );
    expect(r.state).toBe('mnpi_pending');
  });

  it('a clear row past its review date resolves to unknown, not clear', () => {
    const r = resolveEmbargo(
      'ETH',
      attestedEmbargoRegister([
        { asset: 'ETH', state: 'clear', basis: 'listed', recordedBy: 'a', recordedAt: PAST, reviewBy: PAST, announcedAt: PAST },
      ]),
      NOW,
    );
    expect(r.state).toBe('unknown');
    expect(r.reason).toBe('entry_stale');
    expect(r.narrative).toContain('fell due for review');
  });

  it('a clear row with no review date at all resolves to unknown', () => {
    const r = resolveEmbargo(
      'ETH',
      attestedEmbargoRegister([
        { asset: 'ETH', state: 'clear', basis: 'listed', recordedBy: 'a', recordedAt: PAST, reviewBy: null, announcedAt: PAST },
      ]),
      NOW,
    );
    expect(r.state).toBe('unknown');
    expect(r.narrative).toContain('never given a review date');
  });

  it('an unreadable review date resolves to unknown rather than comparing NaN', () => {
    const r = resolveEmbargo(
      'ETH',
      attestedEmbargoRegister([
        { asset: 'ETH', state: 'clear', basis: 'listed', recordedBy: 'a', recordedAt: PAST, reviewBy: 'not-a-date', announcedAt: PAST },
      ]),
      NOW,
    );
    expect(r.state).toBe('unknown');
    expect(r.narrative).toContain('not a readable instant');
  });

  it('a row recording state `unknown` resolves to unknown with its own reason', () => {
    const r = resolveEmbargo(
      'ETH',
      attestedEmbargoRegister([
        { asset: 'ETH', state: 'unknown', basis: 'listings desk has not answered', recordedBy: 'a', recordedAt: PAST, reviewBy: FUTURE, announcedAt: null },
      ]),
      NOW,
    );
    expect(r.state).toBe('unknown');
    expect(r.reason).toBe('entry_state_unknown');
  });

  it('absence from an UNATTESTED register is ignorance, not clearance', () => {
    const unattested: EmbargoRegister = {
      entries: [
        { asset: 'ETH', state: 'clear', basis: 'listed', recordedBy: 'a', recordedAt: PAST, reviewBy: FUTURE, announcedAt: PAST },
      ],
      completeness: { kind: 'not_attested' },
    };
    const r = resolveEmbargo('SOL', unattested, NOW);
    expect(r.state).toBe('unknown');
    expect(r.reason).toBe('absent_from_unattested_register');
  });

  it('absence from a register whose attestation has LAPSED is ignorance', () => {
    const lapsed: EmbargoRegister = {
      entries: [
        { asset: 'ETH', state: 'clear', basis: 'listed', recordedBy: 'a', recordedAt: PAST, reviewBy: FUTURE, announcedAt: PAST },
      ],
      completeness: { kind: 'attested', by: 'compliance@lcx.com', at: PAST, nextAttestationDue: PAST },
    };
    const r = resolveEmbargo('SOL', lapsed, NOW);
    expect(r.state).toBe('unknown');
    expect(r.reason).toBe('register_attestation_stale');
  });

  it('absence from an in-date ATTESTED register is the one path where absence means clear', () => {
    const r = resolveEmbargo('SOL', attestedEmbargoRegister(), NOW);
    expect(r.state).toBe('clear');
    expect(r.reason).toBe('absent_from_attested_register');
    expect(r.narrative).toContain('compliance@lcx.com');
  });

  it('matches the asset symbol case-insensitively and trimmed', () => {
    const r = resolveEmbargo('  eth ', attestedEmbargoRegister(), NOW);
    expect(r.reason).toBe('entry_found');
    expect(r.state).toBe('clear');
  });
});

/* ════════ resolveHoldings — the Art 91(3)(c) join ════════ */

describe('resolveHoldings', () => {
  const fresh = holdingsRegister([
    { actor: 'nik@lcx.com', asset: 'SOL', declared: 'declared_holding', declaredAt: PAST, reviewBy: FUTURE, note: null },
    { actor: 'nik@lcx.com', asset: 'ETH', declared: 'declared_none', declaredAt: PAST, reviewBy: FUTURE, note: null },
  ]);

  it('an empty register resolves to register_absent, not to declared_none', () => {
    const r = resolveHoldings('nik@lcx.com', 'SOL', EMPTY_HOLDINGS_REGISTER, NOW);
    expect(r.state).toBe('register_absent');
    expect(r.reason).toBe('register_empty');
    expect(r.narrative).toContain("owner's and legal's to produce");
  });

  it('returns a live declaration as declared', () => {
    expect(resolveHoldings('nik@lcx.com', 'SOL', fresh, NOW).state).toBe('declared_holding');
    expect(resolveHoldings('nik@lcx.com', 'ETH', fresh, NOW).state).toBe('declared_none');
  });

  it('a STALE declared_none is not a declaration — the January/August accident', () => {
    const stale = holdingsRegister([
      { actor: 'nik@lcx.com', asset: 'ETH', declared: 'declared_none', declaredAt: '2026-01-02T00:00:00.000Z', reviewBy: '2026-04-02T00:00:00.000Z', note: null },
    ]);
    const r = resolveHoldings('nik@lcx.com', 'ETH', stale, NOW);
    expect(r.state).toBe('not_declared');
    expect(r.reason).toBe('declaration_stale');
    expect(r.staleByDays).toBe(122);
    expect(r.narrative).toContain('A stale declaration is not a declaration');
  });

  it('a STALE declared_holding also resolves to not_declared, and says what it was', () => {
    const stale = holdingsRegister([
      { actor: 'nik@lcx.com', asset: 'SOL', declared: 'declared_holding', declaredAt: PAST, reviewBy: PAST, note: null },
    ]);
    const r = resolveHoldings('nik@lcx.com', 'SOL', stale, NOW);
    expect(r.state).toBe('not_declared');
    expect(r.narrative).toContain('declared_holding');
  });

  it('an attested-complete register does NOT turn absence into declared_none', () => {
    const r = resolveHoldings('newjoiner@lcx.com', 'SOL', fresh, NOW);
    expect(r.state).toBe('not_declared');
    expect(r.reason).toBe('actor_not_declared');
    expect(r.narrative).toContain("individual's answer");
  });

  it('distinguishes an unattested register from a merely-missing row', () => {
    const unattested: HoldingsRegister = { entries: fresh.entries, completeness: { kind: 'not_attested' } };
    const r = resolveHoldings('newjoiner@lcx.com', 'SOL', unattested, NOW);
    expect(r.reason).toBe('register_not_attested');
    expect(r.narrative).toContain('undeclared author is the dangerous case');
  });

  it('does not let one actor’s declaration clear another actor', () => {
    expect(resolveHoldings('other@lcx.com', 'ETH', fresh, NOW).state).toBe('not_declared');
  });

  it('does not let a declaration about one asset clear another asset', () => {
    expect(resolveHoldings('nik@lcx.com', 'BTC', fresh, NOW).state).toBe('not_declared');
  });
});

/* ════════ assessStance — the bullish/factual line ════════ */

describe('assessStance', () => {
  it('proves `directional` from marker evidence', () => {
    const s = assessStance('Very bullish on ETH.', null);
    expect(s.stance).toBe('directional');
    expect(s.findings.length).toBeGreaterThan(0);
  });

  it('never concludes `factual_verifiable` on its own — silence is `undetermined`', () => {
    const s = assessStance('ETH deposits are open.', null);
    expect(s.findings).toEqual([]);
    expect(s.stance).toBe('undetermined');
    expect(s.rationale).toContain('may never prove that one was not');
  });

  it('a human may complete `undetermined` into `factual_verifiable` WITH a public source', () => {
    const s = assessStance('ETH deposits are open.', {
      stance: 'factual_verifiable',
      by: 'nik@lcx.com',
      at: NOW,
      basis: 'status page shows deposits enabled',
      publicSourceRef: 'https://lcx.com/status',
    });
    expect(s.stance).toBe('factual_verifiable');
  });

  it('a `factual_verifiable` declaration with NO public source stays undetermined', () => {
    const s = assessStance('ETH deposits are open.', {
      stance: 'factual_verifiable',
      by: 'nik@lcx.com',
      at: NOW,
      basis: 'I know it is',
      publicSourceRef: null,
    });
    expect(s.stance).toBe('undetermined');
    expect(s.rationale).toContain('named no public source');
  });

  it('marker evidence is one-way: a human cannot declare an opinion factual', () => {
    const s = assessStance('Very bullish on ETH.', {
      stance: 'factual_verifiable',
      by: 'nik@lcx.com',
      at: NOW,
      basis: 'this is just a fact',
      publicSourceRef: 'https://lcx.com',
    });
    expect(s.stance).toBe('directional');
    expect(s.declarationOverriddenByEvidence).toBe(true);
    expect(s.rationale).toContain('not overridable by declaration');
  });

  it('a declaration may always ESCALATE to directional', () => {
    const s = assessStance('ETH is at 3000.', {
      stance: 'directional',
      by: 'nik@lcx.com',
      at: NOW,
      basis: 'reads as a nudge in context',
      publicSourceRef: null,
    });
    expect(s.stance).toBe('directional');
    expect(s.declarationOverriddenByEvidence).toBe(false);
  });

  it('MIXED is directional: exposure is set by the worst clause, not the average', () => {
    const s = assessStance('ETH deposits are live, and this one is going to run.', null);
    expect(s.stance).toBe('directional');
    expect(s.findings.map((f) => f.matched)).toContain('going to run');
  });

  it('is direction-neutral, because the Article says "an opinion"', () => {
    const s = assessStance('Frankly we are bearish on ABC.', null);
    expect(s.stance).toBe('directional');
    expect(s.findings.some((f) => f.direction === 'bearish')).toBe(true);
  });

  it('matches on word boundaries, so a longer word does not trip a marker', () => {
    expect(assessStance('The bullishness of the market is not our view.', null).findings).toEqual([]);
  });

  it('normalises punctuation, so "Bullish!" still matches', () => {
    expect(assessStance('Bullish!', null).stance).toBe('directional');
  });

  it('folds the typographic apostrophe, so a pasted "don’t miss" is caught', () => {
    const s = assessStance('Don’t miss XYZ.', null);
    expect(s.stance).toBe('directional');
    expect(s.findings.map((f) => f.markerId)).toContain('inducement');
  });

  it('does NOT fire on "you can buy ETH on LCX" — a fact about our own service', () => {
    expect(assessStance('You can buy ETH on LCX with EUR.', null).findings).toEqual([]);
  });

  it('does NOT fire on "deposits go live soon" — that is the Art 90 gate, not this one', () => {
    expect(assessStance('ETH deposits go live soon.', null).findings).toEqual([]);
  });

  it('carries the reason each marker evidences an opinion, so a refusal is arguable', () => {
    for (const finding of assessStance('Undervalued and going to run.', null).findings) {
      expect(finding.why.length).toBeGreaterThan(40);
    }
  });

  it('every marker in the table is reachable and self-consistent', () => {
    for (const marker of STANCE_MARKERS) {
      expect(marker.phrases.length).toBeGreaterThan(0);
      for (const phrase of marker.phrases) {
        const s = assessStance(`Some context ${phrase} more context.`, null);
        expect(s.stance, `${marker.id}: "${phrase}"`).toBe('directional');
        expect(s.findings.some((f) => f.markerId === marker.id && f.matched === phrase)).toBe(true);
      }
    }
  });

  it('stanceEngagesArt91_3_c is true for everything except a proven fact', () => {
    expect(stanceEngagesArt91_3_c('directional')).toBe(true);
    expect(stanceEngagesArt91_3_c('undetermined')).toBe(true);
    expect(stanceEngagesArt91_3_c('factual_verifiable')).toBe(false);
  });
});

/* ════════ assessDisclosureCure — "simultaneously ... to the public" ════════ */

describe('assessDisclosureCure', () => {
  const good: ConflictDisclosure = {
    assets: ['SOL'],
    inArtefact: true,
    audience: 'public',
    text: 'Disclosure: the author holds SOL.',
    visibleFrom: null,
  };

  it('an in-artefact public disclosure naming the asset cures', () => {
    expect(assessDisclosureCure('SOL', good, NOW).cures).toBe(true);
  });

  it('no disclosure at all does not cure', () => {
    const c = assessDisclosureCure('SOL', null, NOW);
    expect(c.cures).toBe(false);
    expect(c.failures).toEqual(['absent']);
  });

  it('a disclosure held OUTSIDE the artefact does not cure', () => {
    const c = assessDisclosureCure('SOL', { ...good, inArtefact: false }, NOW);
    expect(c.failures).toContain('not_in_artefact');
    expect(c.narrative).toContain('proper and effective way');
  });

  it('a disclosure filed with compliance rather than published does not cure', () => {
    const c = assessDisclosureCure('SOL', { ...good, audience: 'internal' }, NOW);
    expect(c.failures).toContain('not_public');
    expect(c.narrative).toContain('register filed with compliance does not satisfy it');
  });

  it('a disclosure about a different asset does not cure this one', () => {
    expect(assessDisclosureCure('SOL', { ...good, assets: ['ETH'] }, NOW).failures).toContain(
      'asset_not_covered',
    );
  });

  it('a disclosure made LATER than the opinion does not cure — Art 91(3)(c) says simultaneously', () => {
    const c = assessDisclosureCure(
      'SOL',
      { ...good, visibleFrom: '2026-08-02T12:00:01.000Z' },
      NOW,
    );
    expect(c.cures).toBe(false);
    expect(c.failures).toEqual(['later_than_the_opinion']);
    expect(c.narrative).toContain('a disclosure made later does not cure');
  });

  it('a disclosure visible at the same instant cures', () => {
    expect(assessDisclosureCure('SOL', { ...good, visibleFrom: NOW }, NOW).cures).toBe(true);
  });

  it('an unreadable disclosure timestamp counts as later, not as earlier', () => {
    expect(assessDisclosureCure('SOL', { ...good, visibleFrom: 'whenever' }, NOW).cures).toBe(false);
  });

  it('an unknown opinion instant cannot be used to claim simultaneity', () => {
    expect(assessDisclosureCure('SOL', { ...good, visibleFrom: PAST }, null).cures).toBe(false);
  });

  it('reports every failure at once rather than only the first', () => {
    const c = assessDisclosureCure(
      'SOL',
      { assets: ['ETH'], inArtefact: false, audience: 'internal', text: 'x', visibleFrom: null },
      NOW,
    );
    expect(c.failures).toEqual(['not_in_artefact', 'not_public', 'asset_not_covered']);
  });
});

/* ════════ checkEmbargo and checkUndisclosedHolding as gates ════════ */

describe('checkEmbargo', () => {
  it('uses two different codes for two different fixers', () => {
    const empty = checkEmbargo(['ETH'], EMPTY_EMBARGO_REGISTER, NOW);
    expect(empty.refusals[0]?.code).toBe('EMBARGO_REGISTER_ABSENT');

    const unattested: EmbargoRegister = {
      entries: [
        { asset: 'BTC', state: 'clear', basis: 'listed', recordedBy: 'a', recordedAt: PAST, reviewBy: FUTURE, announcedAt: PAST },
      ],
      completeness: { kind: 'not_attested' },
    };
    expect(checkEmbargo(['ETH'], unattested, NOW).refusals[0]?.code).toBe('ASSET_STATE_UNKNOWN');
  });

  it('refuses once per unknown asset, so a three-asset post gets three refusals', () => {
    const c = checkEmbargo(['A', 'B', 'C'], EMPTY_EMBARGO_REGISTER, NOW);
    expect(c.refusals).toHaveLength(3);
    expect(c.refusals.map((r) => r.matched)).toEqual(['A', 'B', 'C']);
  });

  it('flags an exempt_offer asset toward the Art 4(4) check rather than silently clearing it', () => {
    const c = checkEmbargo(
      ['NEW'],
      attestedEmbargoRegister([
        { asset: 'NEW', state: 'exempt_offer', basis: 'Art 4(2) exemption', recordedBy: 'a', recordedAt: PAST, reviewBy: FUTURE, announcedAt: null },
      ]),
      NOW,
    );
    expect(c.refusals).toEqual([]);
    expect(c.violations[0]?.remedy).toContain('Art 4(4)');
  });

  it('names no asset, runs no check — and says nothing rather than passing', () => {
    expect(checkEmbargo([], EMPTY_EMBARGO_REGISTER, NOW)).toEqual({
      refusals: [],
      violations: [],
      resolutions: [],
    });
  });
});

describe('checkUndisclosedHolding', () => {
  const base = {
    namedAssets: ['SOL'],
    attributedActors: [{ actor: 'nik@lcx.com', role: 'author' as const }],
    disclosure: null,
    opinionVisibleFrom: NOW,
    now: NOW,
  };

  it('grants the factual exemption, and records WHY no refusal fired', () => {
    const c = checkUndisclosedHolding({
      ...base,
      stance: assessStance('SOL trades against EUR on LCX.', {
        stance: 'factual_verifiable',
        by: 'nik@lcx.com',
        at: NOW,
        basis: 'market page',
        publicSourceRef: 'https://lcx.com/markets',
      }),
      holdings: holdingsRegister([
        { actor: 'nik@lcx.com', asset: 'SOL', declared: 'declared_holding', declaredAt: PAST, reviewBy: FUTURE, note: null },
      ]),
    });
    expect(c.refusals).toEqual([]);
    expect(c.factualExemptionApplied).toBe(true);
    expect(c.violations[0]?.remedy).toContain('If that assessment is wrong, the exemption is wrong');
    // The resolutions are still recorded, so a reviewer can check both halves.
    expect(c.resolutions[0]?.state).toBe('declared_holding');
  });

  it('an UNDETERMINED stance plus a live declared_none still clears — one unknown, not two', () => {
    const c = checkUndisclosedHolding({
      ...base,
      stance: assessStance('SOL deposits are open.', null),
      holdings: holdingsRegister([
        { actor: 'nik@lcx.com', asset: 'SOL', declared: 'declared_none', declaredAt: PAST, reviewBy: FUTURE, note: null },
      ]),
    });
    expect(c.refusals).toEqual([]);
    expect(c.factualExemptionApplied).toBe(false);
  });

  it('an UNDETERMINED stance plus no declaration refuses — two unknowns stacked', () => {
    const c = checkUndisclosedHolding({
      ...base,
      stance: assessStance('SOL deposits are open.', null),
      holdings: EMPTY_HOLDINGS_REGISTER,
    });
    expect(c.refusals[0]?.code).toBe('HOLDINGS_DECLARATION_MISSING');
  });

  it('a clean drafter does not clear a holding APPROVER', () => {
    const c = checkUndisclosedHolding({
      ...base,
      attributedActors: [
        { actor: 'nik@lcx.com', role: 'author' },
        { actor: 'boss@lcx.com', role: 'approver' },
      ],
      stance: assessStance('Very bullish on SOL.', null),
      holdings: holdingsRegister([
        { actor: 'nik@lcx.com', asset: 'SOL', declared: 'declared_none', declaredAt: PAST, reviewBy: FUTURE, note: null },
        { actor: 'boss@lcx.com', asset: 'SOL', declared: 'declared_holding', declaredAt: PAST, reviewBy: FUTURE, note: null },
      ]),
    });
    expect(c.refusals).toHaveLength(1);
    expect(c.refusals[0]?.code).toBe('ART_91_3_C_UNDISCLOSED_HOLDING');
    expect(c.refusals[0]?.sentence).toContain('approver (boss@lcx.com)');
  });

  it('an item with no attributed actor at all cannot be cleared against Art 91(3)(c)', () => {
    const c = checkUndisclosedHolding({
      ...base,
      attributedActors: [],
      stance: assessStance('Very bullish on SOL.', null),
      holdings: holdingsRegister([
        { actor: 'nik@lcx.com', asset: 'SOL', declared: 'declared_none', declaredAt: PAST, reviewBy: FUTURE, note: null },
      ]),
    });
    expect(c.refusals[0]?.code).toBe('HOLDINGS_DECLARATION_MISSING');
    expect(c.refusals[0]?.sentence).toContain('no author or approver is attributed');
  });

  it('the composite adds the act author automatically, so a caller cannot omit the drafter', () => {
    const verdict = assessMarketAbuse(
      input({
        act: act({ namedAssets: ['SOL'], author: 'nik@lcx.com' }),
        text: 'Very bullish on SOL.',
        attributedActors: [],
        holdingsRegister: holdingsRegister([
          { actor: 'nik@lcx.com', asset: 'SOL', declared: 'declared_holding', declaredAt: PAST, reviewBy: FUTURE, note: null },
        ]),
      }),
    );
    expect(codes(verdict)).toContain('ART_91_3_C_UNDISCLOSED_HOLDING');
    expect(verdict.holdings.map((h) => h.actor)).toContain('nik@lcx.com');
  });
});

/* ════════ checkRumourRestatement — the negligence standard ════════ */

describe('checkRumourRestatement', () => {
  const confirmed: VerificationStep = {
    what: 'checked the partnership claim',
    source: 'the counterparty, in writing',
    at: '2026-08-02T10:00:00.000Z',
    outcome: 'confirmed_true',
  };
  const rumour: RumourRestatement = {
    claimSummary: 'a major partnership is about to be announced',
    priceRelevant: true,
    restatesClaim: true,
    verification: [confirmed],
    contraryMaterial: [],
    beliefHeld: 'believed_true',
  };

  it('a verb that republishes with NO assessment refuses as adoption of an unverified target', () => {
    const c = checkRumourRestatement({ verb: 'like', rumour: null, publishAt: NOW });
    expect(c.refusals[0]?.code).toBe('ADOPTION_OF_UNVERIFIED_TARGET');
    expect(c.republishes).toBe(true);
  });

  it('a verb that does not republish needs no assessment', () => {
    expect(checkRumourRestatement({ verb: 'reply', rumour: null, publishAt: NOW }).refusals).toEqual([]);
  });

  it('defers to VERB_INHERITS_TARGET_RISK, so a repost republishes even with restatesClaim false', () => {
    expect(VERB_INHERITS_TARGET_RISK.repost).toBe(true);
    const c = checkRumourRestatement({
      verb: 'repost',
      rumour: { ...rumour, restatesClaim: false, verification: [] },
      publishAt: NOW,
    });
    expect(c.republishes).toBe(true);
    expect(c.basis).toBe('no_verification');
  });

  it('our own words that do not restate the claim are not dissemination', () => {
    const c = checkRumourRestatement({
      verb: 'reply',
      rumour: { ...rumour, restatesClaim: false, verification: [] },
      publishAt: NOW,
    });
    expect(c.republishes).toBe(false);
    expect(c.refusals).toEqual([]);
  });

  it('belief is not the standard: believed_true with no verification still refuses', () => {
    const c = checkRumourRestatement({
      verb: 'quote',
      rumour: { ...rumour, verification: [] },
      publishAt: NOW,
    });
    expect(c.basis).toBe('no_verification');
    expect(c.refusals[0]?.sentence).toContain('belief is not the standard');
    expect(c.refusals[0]?.sentence).toContain('ought to have known');
  });

  it('verification dated AFTER publication is not verification', () => {
    const c = checkRumourRestatement({
      verb: 'quote',
      rumour: { ...rumour, verification: [{ ...confirmed, at: '2026-08-03T10:00:00.000Z' }] },
      publishAt: NOW,
    });
    expect(c.basis).toBe('no_verification');
    expect(c.refusals[0]?.sentence).toContain('dated after it');
  });

  it('only-inconclusive verification refuses: an unverified price claim is a misleading signal', () => {
    const c = checkRumourRestatement({
      verb: 'quote',
      rumour: { ...rumour, verification: [{ ...confirmed, outcome: 'inconclusive' }] },
      publishAt: NOW,
    });
    expect(c.basis).toBe('verification_inconclusive');
  });

  it('a claim verified FALSE and restated anyway refuses on the stronger, knowledge limb', () => {
    const c = checkRumourRestatement({
      verb: 'quote',
      rumour: { ...rumour, verification: [{ ...confirmed, outcome: 'confirmed_false' }] },
      publishAt: NOW,
    });
    expect(c.basis).toBe('verified_false');
    expect(c.refusals[0]?.sentence).toContain('KNEW was false');
  });

  it('a claim verified TRUE before publication passes, with the amplification cost recorded', () => {
    const c = checkRumourRestatement({ verb: 'quote', rumour, publishAt: NOW });
    expect(c.refusals).toEqual([]);
    expect(c.basis).toBeNull();
    expect(c.violations[0]?.remedy).toContain('amplifies');
  });

  it('a non-price-relevant claim is outside Art 91(2)(c), and says so', () => {
    const c = checkRumourRestatement({
      verb: 'repost',
      rumour: { ...rumour, priceRelevant: false, verification: [] },
      publishAt: NOW,
    });
    expect(c.refusals).toEqual([]);
    expect(c.violations[0]?.rule).toBe('art_91_2_c.amplification_without_price_relevance');
  });

  it('an unknown publication instant does not buy the desk a defence', () => {
    const c = checkRumourRestatement({
      verb: 'quote',
      rumour: {
        ...rumour,
        contraryMaterial: [
          { what: 'internal denial', source: 'INC-1', heldSince: '2099-01-01T00:00:00.000Z', cuts: 'against_the_rumour' },
        ],
      },
      publishAt: null,
    });
    expect(c.basis).toBe('contrary_material_on_file');
  });

  it('material that cuts against OUR RESTATEMENT is not the ought-to-have-known limb', () => {
    const c = checkRumourRestatement({
      verb: 'quote',
      rumour: {
        ...rumour,
        contraryMaterial: [
          { what: 'our draft overstates the denial', source: 'legal note', heldSince: PAST, cuts: 'against_our_restatement' },
        ],
      },
      publishAt: NOW,
    });
    expect(c.basis).toBeNull();
  });
});

/* ════════ assessMarketAbuse — the composite ════════ */

describe('assessMarketAbuse', () => {
  it('clears the fully-clean path, so the gate is not simply always refusing', () => {
    const verdict = assessMarketAbuse(input());
    expect(verdict.disposition).toBe('clear');
    expect(verdict.refusals).toEqual([]);
    expect(verdict.violations).toEqual([]);
  });

  it('is `flagged`, not `clear`, when only non-blocking findings were raised', () => {
    const verdict = assessMarketAbuse(
      input({ intents: ['inside_information_disclosure'], linkPresent: false }),
    );
    expect(verdict.refusals).toEqual([]);
    expect(verdict.violations.length).toBeGreaterThan(0);
    expect(verdict.disposition).toBe('flagged');
  });

  it('is never `stripped`: nothing in Title VI can be stripped into safety', () => {
    for (const verdict of [
      assessMarketAbuse(input()),
      assessMarketAbuse(input({ embargoRegister: EMPTY_EMBARGO_REGISTER })),
      assessMarketAbuse(input({ intents: ['inside_information_disclosure', 'promotional'] })),
    ]) {
      expect(verdict.disposition).not.toBe('stripped');
    }
  });

  it('stacks every gate that fires rather than short-circuiting on the first', () => {
    const verdict = assessMarketAbuse(
      input({
        act: act({ verb: 'quote', namedAssets: ['XYZ'] }),
        text: 'Very bullish on XYZ, something big coming.',
        embargoRegister: EMPTY_EMBARGO_REGISTER,
        holdingsRegister: EMPTY_HOLDINGS_REGISTER,
        intents: ['inside_information_disclosure', 'promotional'],
        rumour: null,
      }),
    );
    expect(new Set(codes(verdict))).toEqual(
      new Set([
        'EMBARGO_REGISTER_ABSENT',
        'HOLDINGS_DECLARATION_MISSING',
        'ADOPTION_OF_UNVERIFIED_TARGET',
        'ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING',
      ]),
    );
  });

  it('reports that the asset limbs could not run when the act names no asset', () => {
    const verdict = assessMarketAbuse(
      input({ act: act({ namedAssets: [] }), text: 'Very bullish here.' }),
    );
    expect(verdict.assetLimbsEvaluated).toBe(false);
    expect(verdict.violations.map((v) => v.rule)).toContain('title_vi.directional_with_no_named_asset');
    expect(verdict.violations[0]?.remedy).toContain('two most dangerous');
  });

  it('does not raise the no-named-asset finding when the stance is not directional', () => {
    const verdict = assessMarketAbuse(
      input({ act: act({ namedAssets: [] }), text: 'Support hours are 09:00-17:00 CET.' }),
    );
    expect(verdict.violations.map((v) => v.rule)).not.toContain(
      'title_vi.directional_with_no_named_asset',
    );
  });

  it('runs the Art 88(1) gate even when no asset is named', () => {
    const verdict = assessMarketAbuse(
      input({
        act: act({ namedAssets: [] }),
        text: 'A statement.',
        intents: ['inside_information_disclosure', 'promotional'],
      }),
    );
    expect(codes(verdict)).toContain('ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING');
  });

  it('carries the resolved state on the verdict, so the record shows what was joined', () => {
    const verdict = assessMarketAbuse(input());
    expect(verdict.embargo).toHaveLength(1);
    expect(verdict.embargo[0]?.narrative.length).toBeGreaterThan(20);
    expect(verdict.holdings).toHaveLength(1);
    expect(verdict.stance.rationale.length).toBeGreaterThan(20);
  });

  it('does not mutate its inputs', () => {
    const arg = input({ attributedActors: [] });
    const snapshot = JSON.parse(JSON.stringify(arg));
    assessMarketAbuse(arg);
    expect(JSON.parse(JSON.stringify(arg))).toEqual(snapshot);
  });

  it('is deterministic: same input, same verdict', () => {
    const arg = input({ embargoRegister: EMPTY_EMBARGO_REGISTER });
    expect(assessMarketAbuse(arg)).toEqual(assessMarketAbuse(arg));
  });
});

/* ════════ the invariants: no way past, and every refusal is answerable ════════ */

describe('market-abuse invariants', () => {
  const allVerdicts = [
    assessMarketAbuse(input({ embargoRegister: EMPTY_EMBARGO_REGISTER, holdingsRegister: EMPTY_HOLDINGS_REGISTER })),
    assessMarketAbuse(
      input({
        act: act({ namedAssets: ['XYZ'], verb: 'like' }),
        text: 'Very bullish on XYZ.',
        embargoRegister: attestedEmbargoRegister([
          { asset: 'XYZ', state: 'mnpi_pending', basis: 'pending listing', recordedBy: 'a', recordedAt: PAST, reviewBy: FUTURE, announcedAt: null },
        ]),
        holdingsRegister: holdingsRegister([
          { actor: 'nik@lcx.com', asset: 'XYZ', declared: 'declared_holding', declaredAt: PAST, reviewBy: FUTURE, note: null },
        ]),
        intents: ['inside_information_disclosure', 'promotional'],
        linkPresent: true,
      }),
    ),
  ];

  it('every emitted refusal code is a member of REFUSAL_CODES in types.ts', () => {
    for (const verdict of allVerdicts) {
      for (const r of verdict.refusals) {
        expect(REFUSAL_CODES, r.code).toContain(r.code);
      }
    }
  });

  it('every refusal carries a sentence, a citation from the table, and a recovery', () => {
    const known = Object.values(MARKET_ABUSE_CITATIONS);
    for (const verdict of allVerdicts) {
      for (const r of verdict.refusals) {
        expect(r.sentence.length).toBeGreaterThan(40);
        expect(known).toContain(r.rule);
        expect(r.recovery.kind).toBeTruthy();
        expect(r.ruleSetVersion).toBe(MARKET_ABUSE_RULESET_VERSION);
      }
    }
  });

  it('every violation carries a citation, a remedy and the ruleset version', () => {
    const verdict = assessMarketAbuse(input({ intents: ['inside_information_disclosure'] }));
    for (const v of verdict.violations) {
      expect(v.remedy.length).toBeGreaterThan(20);
      expect(v.rule_citation.provision).toBeTruthy();
      expect(v.ruleVersion).toBe(MARKET_ABUSE_RULESET_VERSION);
    }
  });

  it('`disposition` is derived from refusals and is not an input the caller can set', () => {
    // A refusal is present, so no combination of the remaining fields may clear it.
    const embargoed = attestedEmbargoRegister([
      { asset: 'XYZ', state: 'mnpi_pending', basis: 'pending', recordedBy: 'a', recordedAt: PAST, reviewBy: FUTURE, announcedAt: null },
    ]);
    const base = input({ act: act({ namedAssets: ['XYZ'] }), embargoRegister: embargoed });
    const variations: MarketAbuseInput[] = [
      base,
      { ...base, declaredStance: { stance: 'factual_verifiable', by: 'a', at: NOW, basis: 'b', publicSourceRef: 'https://lcx.com' } },
      { ...base, disclosure: { assets: ['XYZ'], inArtefact: true, audience: 'public', text: 'd', visibleFrom: null } },
      { ...base, intents: ['correction'] },
      { ...base, attributedActors: [{ actor: 'ceo@lcx.com', role: 'named_spokesperson' }] },
      { ...base, publishAt: null },
    ];
    for (const variation of variations) {
      const verdict = assessMarketAbuse(variation);
      expect(codes(verdict)).toContain('ART_90_ASSET_UNDER_EMBARGO');
      expect(verdict.disposition).toBe('refused');
    }
  });

  it('exports no override, force, suppress, waive or bypass affordance', () => {
    const offenders = Object.keys(abuseModule).filter((name) =>
      /override|force|suppress|waive|bypass|ignore|skip|allowAnyway/i.test(name),
    );
    expect(offenders).toEqual([]);
  });

  it('exposes no mutator: every export is a type, a constant or a pure function', () => {
    for (const [name, value] of Object.entries(abuseModule)) {
      const kind = typeof value;
      expect(['function', 'object', 'number', 'string'], name).toContain(kind);
    }
  });

  it('instantMs refuses to guess: junk and empty strings are null, not 0 or NaN', () => {
    expect(instantMs(null)).toBeNull();
    expect(instantMs('')).toBeNull();
    expect(instantMs('   ')).toBeNull();
    expect(instantMs('tomorrow')).toBeNull();
    expect(instantMs(NOW)).toBe(Date.parse(NOW));
  });

  it('instantMs rejects a non-string, so a drifted JSON column cannot be coerced', () => {
    // Reachable only from the API boundary, where a row arrives as parsed JSON and the
    // compiler is no longer standing guard. `Date.parse(0)` would otherwise coerce.
    expect(instantMs(0 as unknown as string)).toBeNull();
    expect(instantMs(1_754_136_000_000 as unknown as string)).toBeNull();
    expect(instantMs({} as unknown as string)).toBeNull();
  });

  it('every citation in the table names a provision and carries its text', () => {
    for (const [key, citation] of Object.entries(MARKET_ABUSE_CITATIONS)) {
      expect(citation.instrument, key).toBe('mica');
      expect(citation.provision, key).toMatch(/^Art /);
      expect(citation.text.length, key).toBeGreaterThan(80);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════ */
/*  W4 — the two findings that survived the concurrent waves                     */
/* ════════════════════════════════════════════════════════════════════════════ */

describe('a symbol-scoped register slice is not an empty register', () => {
  /*
   * `loadEmbargoRegister` (abuseRegister.ts) selects `WHERE asset_symbol = ANY($1)`, so a
   * register holding 500 rows returns `entries: []` for one unlisted symbol.
   * `resolveEmbargo` read that as `register_empty` and told the desk to supply an embargo
   * register it had already supplied — while `absent_from_unattested_register`, the
   * correct reason with the correct remedy (the listings desk, not the owner), was
   * unreachable in production and covered only by tests that built the register by hand.
   *
   * Both outcomes still refuse. What changes is which fact the refusal names.
   */
  const scoped = (entries: EmbargoRegister['entries'], anyRows: boolean): EmbargoRegister => ({
    entries,
    completeness: { kind: 'not_attested' },
    scopedToSymbols: true,
    anyRowsInRegister: anyRows,
  });

  it('reports absence from an unattested register when the table holds other rows', () => {
    const r = resolveEmbargo('SOL', scoped([], true), NOW);
    expect(r.reason).toBe('absent_from_unattested_register');
    expect(r.state).toBe('unknown');
    expect(r.narrative).not.toContain('register is empty');
  });

  it('still reports an empty register when the table really is empty', () => {
    const r = resolveEmbargo('SOL', scoped([], false), NOW);
    expect(r.reason).toBe('register_empty');
    expect(r.narrative).toContain('empty');
  });

  it('treats an unscoped load with no entries as empty, so an omission cannot soften it', () => {
    // `scopedToSymbols` absent means the caller did not say. The conservative reading is
    // that these entries ARE the register.
    const r = resolveEmbargo('SOL', { entries: [], completeness: { kind: 'not_attested' } }, NOW);
    expect(r.reason).toBe('register_empty');
  });

  it('makes ASSET_STATE_UNKNOWN reachable, which it was not on the production path', () => {
    const verdict = assessMarketAbuse(input({
      act: act({ namedAssets: ['SOL'] }),
      text: 'SOL deposits are open on LCX.',
      embargoRegister: scoped([], true),
      holdingsRegister: holdingsRegister([
        { actor: 'nik@lcx.com', asset: 'SOL', declared: 'declared_none', declaredAt: PAST, reviewBy: FUTURE, note: null },
      ]),
    }));
    expect(codes(verdict)).toContain('ASSET_STATE_UNKNOWN');
    expect(codes(verdict)).not.toContain('EMBARGO_REGISTER_ABSENT');
  });
});

describe('the no-named-asset finding is error severity, because it says a gate did not run', () => {
  it('raises it at error severity so a blocking caller can see it', () => {
    // As a `warning` it was raised, carried and dropped: `outboundGate.ts` cleared the
    // draft, answered 201 and wrote `allowed: true`. The two limbs carrying unlawful
    // disclosure and a EUR 700 000 personal fine had both no-opped.
    const verdict = assessMarketAbuse(
      input({ act: act({ namedAssets: [] }), text: 'Very bullish here.' }),
    );
    const found = verdict.violations.find((v) => v.rule === 'title_vi.directional_with_no_named_asset');
    expect(found).toBeDefined();
    expect(found!.severity).toBe('error');
  });

  it('leaves the satisfied-Art-88(1) finding at warning, so compliance is not refused', () => {
    const verdict = assessMarketAbuse(input({
      intents: ['inside_information_disclosure'],
      linkPresent: false,
    }));
    const found = verdict.violations.find(
      (v) => v.rule === 'art_88_1.disclosure_artefact_must_stay_clean',
    );
    expect(found).toBeDefined();
    expect(found!.severity).toBe('warning');
  });
});

/* ════════ §11 NEED TO KNOW — THE REFUSAL WAS ITSELF A DISCLOSURE ════════ */

describe('the Art 90 explanation is scoped, and the refusal is not', () => {
  const REF = 'gate:0123456789abcdef';
  const RECORDER = 'listings@lcx.com';

  /** One draft, one asset, three register states. Only the register varies. */
  const embargoedInput = (): MarketAbuseInput => input({
    act: act({ namedAssets: ['XYZ'], author: 'drafter@lcx.com' }),
    text: 'XYZ deposits are open.',
    embargoRegister: attestedEmbargoRegister([{
      asset: 'XYZ',
      state: 'mnpi_pending',
      basis: 'listing committee approved, announcement not yet made',
      recordedBy: RECORDER,
      recordedAt: PAST,
      reviewBy: FUTURE,
      announcedAt: null,
    }]),
    holdingsRegister: holdingsRegister([
      { actor: 'drafter@lcx.com', asset: 'XYZ', declared: 'declared_none', declaredAt: PAST, reviewBy: FUTURE, note: null },
    ]),
  });

  /** Benign case 1: the desk holds no register at all → `EMBARGO_REGISTER_ABSENT`. */
  const emptyRegisterInput = (): MarketAbuseInput => ({
    ...embargoedInput(),
    embargoRegister: EMPTY_EMBARGO_REGISTER,
  });

  /** Benign case 2: rows exist, none for XYZ, nobody attested → `ASSET_STATE_UNKNOWN`. */
  const symbolAbsentInput = (): MarketAbuseInput => ({
    ...embargoedInput(),
    embargoRegister: {
      entries: [{
        asset: 'ETH',
        state: 'clear',
        basis: 'listed since 2021',
        recordedBy: RECORDER,
        recordedAt: PAST,
        reviewBy: FUTURE,
        announcedAt: PAST,
      }],
      completeness: { kind: 'not_attested' },
    },
  });

  const scopedFor = (i: MarketAbuseInput) =>
    abuseModule.scopeEmbargoDisclosure(assessMarketAbuse(i), {
      clearance: 'not_cleared',
      reference: REF,
    });

  it('produces the three codes it is scoping, so the premise of the split is real', () => {
    // If these ever collapsed on their own there would be nothing to scope, and this whole
    // section would be dead code claiming to close a hole that had closed itself.
    expect(codes(assessMarketAbuse(embargoedInput()))).toContain('ART_90_ASSET_UNDER_EMBARGO');
    expect(codes(assessMarketAbuse(emptyRegisterInput()))).toContain('EMBARGO_REGISTER_ABSENT');
    expect(codes(assessMarketAbuse(symbolAbsentInput()))).toContain('ASSET_STATE_UNKNOWN');
  });

  it('makes all three indistinguishable to a reader who is not cleared', () => {
    /*
     * THE ASSERTION THE CHANGE RESTS ON. Two of these three are benign, so any observable
     * difference between them identifies the one that is not. Deep equality over the whole
     * scoped verdict is the only form of this test a partial redaction cannot pass.
     */
    const a = scopedFor(embargoedInput()).verdict;
    const b = scopedFor(emptyRegisterInput()).verdict;
    const c = scopedFor(symbolAbsentInput()).verdict;
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });

  it('still refuses, and says nothing about which asset', () => {
    const scoped = scopedFor(embargoedInput());
    expect(scoped.verdict.disposition).toBe('refused');
    expect(codes(scoped.verdict)).toEqual(['ASSET_STATE_UNKNOWN']);
    const r = scoped.verdict.refusals[0]!;
    // `matched` is the offending span everywhere else in this module, and here the offending
    // span IS the secret. A sentence that redacts and a `matched` that does not has redacted
    // nothing — every surface renders both.
    expect(r.matched).toBeNull();
    expect(r.sentence).not.toContain('XYZ');
    expect(r.sentence).toContain(REF);
    expect(r.rule.provision).toBe('Art 90(1)');
    expect(r.recovery).toEqual({
      kind: 'supply_data',
      missing: expect.stringContaining('approver'),
      whoCanSupply: abuseModule.EMBARGO_BASIS_RING,
    });
  });

  it('keeps the unscoped codes on the wrapper, for the record only', () => {
    // Without these the desk's own ledger would agree with the redaction, the approver the
    // drafter was told to ask would find nothing, and the remedy would be a dead end.
    const scoped = scopedFor(embargoedInput());
    expect(scoped.unscopedRefusalCodes).toContain('ART_90_ASSET_UNDER_EMBARGO');
    expect(scoped.explanationWithheld).toBe(true);
  });

  it('leaves a refusal from another limb exactly as it was', () => {
    // Only the Art 90 explanation is inside information. Scoping the holdings refusal too
    // would be redaction as a habit rather than as a rule.
    const withHolding = assessMarketAbuse(input({
      act: act({ namedAssets: ['XYZ'], author: 'drafter@lcx.com' }),
      text: 'We are very bullish on XYZ.',
      embargoRegister: EMPTY_EMBARGO_REGISTER,
      holdingsRegister: EMPTY_HOLDINGS_REGISTER,
    }));
    const scoped = abuseModule.scopeEmbargoDisclosure(withHolding, {
      clearance: 'not_cleared', reference: REF,
    });
    const holding = withHolding.refusals.find((r) => r.code === 'HOLDINGS_DECLARATION_MISSING');
    expect(holding).toBeDefined();
    expect(scoped.verdict.refusals).toContain(holding);
  });

  it('empties the per-asset resolutions, including the ones that came back clear', () => {
    // An array showing `clear` for two symbols and nothing for the third names the third.
    const three = assessMarketAbuse(input({
      act: act({ namedAssets: ['XYZ', 'ETH'], author: 'drafter@lcx.com' }),
      text: 'XYZ and ETH deposits are open.',
      embargoRegister: attestedEmbargoRegister([
        {
          asset: 'XYZ', state: 'mnpi_pending', basis: 'not yet announced',
          recordedBy: RECORDER, recordedAt: PAST, reviewBy: FUTURE, announcedAt: null,
        },
        {
          asset: 'ETH', state: 'clear', basis: 'listed since 2021',
          recordedBy: RECORDER, recordedAt: PAST, reviewBy: FUTURE, announcedAt: PAST,
        },
      ]),
      holdingsRegister: holdingsRegister([
        { actor: 'drafter@lcx.com', asset: 'XYZ', declared: 'declared_none', declaredAt: PAST, reviewBy: FUTURE, note: null },
        { actor: 'drafter@lcx.com', asset: 'ETH', declared: 'declared_none', declaredAt: PAST, reviewBy: FUTURE, note: null },
      ]),
    }));
    expect(three.embargo).toHaveLength(2);
    const scoped = abuseModule.scopeEmbargoDisclosure(three, {
      clearance: 'not_cleared', reference: REF,
    });
    expect(scoped.verdict.embargo).toEqual([]);
    expect(codes(scoped.verdict)).toEqual(['ASSET_STATE_UNKNOWN']);
  });

  it('hands a cleared reader the verdict object untouched', () => {
    // Not a copy with the same fields — the same object. A projection that rebuilt the
    // verdict for approvers could drift from the one the engines produced.
    const full = assessMarketAbuse(embargoedInput());
    const scoped = abuseModule.scopeEmbargoDisclosure(full, {
      clearance: 'cleared', reference: REF,
    });
    expect(scoped.verdict).toBe(full);
    expect(scoped.explanationWithheld).toBe(false);
  });

  it('enumerates every code the Art 90 limb can emit, so a fourth cannot leak past it', () => {
    /*
     * `EMBARGO_LIMB_REFUSAL_CODES` is the filter. If a future branch of `checkEmbargo` emits
     * a code that is not on that list, the scoping would pass it through verbatim and the
     * oracle would reopen silently. So the list is checked against the limb itself, over
     * every register state that refuses.
     */
    const states: EmbargoRegister[] = [
      attestedEmbargoRegister([{
        asset: 'XYZ', state: 'mnpi_pending', basis: 'b',
        recordedBy: RECORDER, recordedAt: PAST, reviewBy: FUTURE, announcedAt: null,
      }]),
      EMPTY_EMBARGO_REGISTER,
      { entries: [{
        asset: 'ETH', state: 'clear', basis: 'b',
        recordedBy: RECORDER, recordedAt: PAST, reviewBy: FUTURE, announcedAt: PAST,
      }], completeness: { kind: 'not_attested' } },
      attestedEmbargoRegister([{
        asset: 'XYZ', state: 'unknown', basis: 'b',
        recordedBy: RECORDER, recordedAt: PAST, reviewBy: FUTURE, announcedAt: null,
      }]),
      attestedEmbargoRegister([{
        asset: 'XYZ', state: 'clear', basis: 'b',
        recordedBy: RECORDER, recordedAt: PAST, reviewBy: PAST, announcedAt: null,
      }]),
    ];
    const emitted = new Set<string>();
    for (const register of states) {
      for (const r of checkEmbargo(['XYZ'], register, NOW).refusals) emitted.add(r.code);
    }
    expect(emitted.size).toBeGreaterThan(0);
    for (const code of emitted) {
      expect(abuseModule.EMBARGO_LIMB_REFUSAL_CODES, `${code} is not scoped`).toContain(code);
    }
  });
});

describe('who is inside the ring for the Art 90 basis', () => {
  const RECORDER = 'listings@lcx.com';
  const resolution = (over: Partial<abuseModule.EmbargoResolution> = {}): abuseModule.EmbargoResolution => ({
    asset: 'XYZ',
    state: 'mnpi_pending',
    reason: 'entry_found',
    entry: {
      asset: 'XYZ', state: 'mnpi_pending', basis: 'b',
      recordedBy: RECORDER, recordedAt: PAST, reviewBy: FUTURE, announcedAt: null,
    },
    narrative: 'n',
    ...over,
  });

  it('clears an approver', () => {
    expect(abuseModule.embargoBasisClearance({
      viewer: 'anyone@lcx.com', viewerIsApprover: true, resolutions: [resolution()],
    })).toBe('cleared');
  });

  it('clears anybody when there is nothing to withhold', () => {
    // A verdict with no restricted state has no secret in it, so redacting it would be
    // theatre — and would hide the `clear` rows a drafter can legitimately see.
    expect(abuseModule.embargoBasisClearance({
      viewer: 'drafter@lcx.com',
      viewerIsApprover: false,
      resolutions: [resolution({ state: 'clear', entry: null })],
    })).toBe('cleared');
  });

  it('clears the person who recorded every restriction in play', () => {
    expect(abuseModule.embargoBasisClearance({
      viewer: RECORDER, viewerIsApprover: false, resolutions: [resolution()],
    })).toBe('cleared');
  });

  it('does NOT clear a recorder when somebody else\'s row is also in play', () => {
    /*
     * PER-ASSET CLEARANCE LEAKS BY OMISSION: if the recorder of XYZ saw XYZ and not the
     * other asset, the missing entry would name it. So the clearance is all-or-nothing.
     */
    expect(abuseModule.embargoBasisClearance({
      viewer: RECORDER,
      viewerIsApprover: false,
      resolutions: [
        resolution(),
        resolution({ asset: 'ABC', entry: { ...resolution().entry!, asset: 'ABC', recordedBy: 'someone@lcx.com' } }),
      ],
    })).toBe('not_cleared');
  });

  it('does NOT clear anyone on a state nobody recorded', () => {
    // An empty register, or an asset absent from one, has no `entry` and therefore no
    // recorder. That is the state this desk is in today, so in practice only approvers.
    expect(abuseModule.embargoBasisClearance({
      viewer: RECORDER,
      viewerIsApprover: false,
      resolutions: [resolution({ state: 'unknown', reason: 'register_empty', entry: null })],
    })).toBe('not_cleared');
  });

  it('compares actors exactly, so a near-match does not read inside information', () => {
    expect(abuseModule.embargoBasisClearance({
      viewer: ' listings@lcx.com', viewerIsApprover: false, resolutions: [resolution()],
    })).toBe('not_cleared');
  });

  it('names a role and never a person', () => {
    // This module holds no directory. A name here would be an invented fact about a real
    // person, and confirming who recorded a row is most of the secret anyway.
    expect(abuseModule.EMBARGO_BASIS_RING).toContain('approver');
    expect(abuseModule.EMBARGO_BASIS_RING).not.toMatch(/@/);
  });
});
