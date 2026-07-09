import { describe, it, expect } from 'vitest';
import {
  getClaims,
  getClaimsByCategory,
  getClaimById,
  getClaimsForJurisdictionAndCategory,
  getClaimLibrarySnapshot,
  CLAIM_DISCLAIMER,
} from './claims.js';
import { getTemplates, getTemplateByTouch } from './templates.js';
import { generateDraft } from './draftEngine.js';
import { validateDraftOutput, validateClaimsUsed } from './messageRules.js';
import type { DraftInput, DraftOutput } from './types.js';

describe('Claim Library', () => {
  it('returns all active claims', () => {
    const claims = getClaims();
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every(c => c.active)).toBe(true);
  });

  it('returns claims by category', () => {
    const eu = getClaimsByCategory('eu_access');
    expect(eu.length).toBeGreaterThan(0);
    expect(eu.every(c => c.category === 'eu_access')).toBe(true);
  });

  it('returns a claim by id', () => {
    const claim = getClaimById('eu-access-001');
    expect(claim).toBeDefined();
    expect(claim!.id).toBe('eu-access-001');
    expect(claim!.category).toBe('eu_access');
  });

  it('returns undefined for unknown id', () => {
    expect(getClaimById('nonexistent')).toBeUndefined();
  });

  it('filters claims by jurisdiction', () => {
    const eu = getClaimsForJurisdictionAndCategory('eu', undefined);
    expect(eu.length).toBeGreaterThan(0);
    expect(eu.every(c => c.jurisdiction.includes('eu'))).toBe(true);
  });

  it('filters claims by both jurisdiction and category', () => {
    const claims = getClaimsForJurisdictionAndCategory('eu', 'eu_access');
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every(c => c.category === 'eu_access')).toBe(true);
  });

  it('returns valid snapshot structure', () => {
    const snap = getClaimLibrarySnapshot();
    expect(snap.version).toBe(1);
    expect(snap.claims.length).toBeGreaterThan(0);
    expect(snap.updatedAt).toBeTruthy();
  });

  it('every claim has required fields', () => {
    const claims = getClaims();
    for (const c of claims) {
      expect(c.id).toBeTruthy();
      expect(c.text).toBeTruthy();
      expect(c.category).toMatch(/^(eu_access|mica_awareness|us_path|listing_package|liquidity|marketing)$/);
      expect(c.jurisdiction.length).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(c.riskLevel);
      expect(typeof c.requiresHumanReview).toBe('boolean');
      expect(c.version).toBeGreaterThan(0);
    }
  });

  it('disclaimer is present', () => {
    expect(CLAIM_DISCLAIMER).toContain('not constitute legal advice');
  });
});

describe('Templates', () => {
  it('returns all 5 templates', () => {
    const templates = getTemplates();
    expect(templates.length).toBe(5);
    expect(templates.map(t => t.touchIndex).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns correct template for touch 1 email', () => {
    const t = getTemplateByTouch(1, 'email');
    expect(t).toBeDefined();
    expect(t!.id).toBe('touch-1-email');
  });

  it('returns undefined for unknown touch', () => {
    expect(getTemplateByTouch(99, 'email')).toBeUndefined();
  });
});

describe('Draft Engine (Deterministic Path)', () => {
  const baseInput: DraftInput = {
    projectName: 'Solana',
    projectTicker: 'SOL',
    projectWebsite: 'https://solana.com',
    projectChain: 'SOL',
    projectEuScore: 82,
    projectUsPreScore: 75,
    projectUsPostScore: 80,
    projectBand: 'high',
    scoreReasons: [
      { code: 'EU-TEAM-01', factor: 'Team Quality', points: 15, note: 'Strong team' },
    ],
    contactName: 'Alice',
    contactTitle: 'CEO',
    contactRole: 'ceo',
    jurisdiction: 'eu',
    clarityEnacted: false,
    touchIndex: 1,
    channel: 'email',
    market: 'EU',
  };

  it('generates touch 1 email draft', () => {
    const { draft } = generateDraft(baseInput);
    expect(draft.touchIndex).toBe(1);
    expect(draft.channel).toBe('email');
    expect(draft.subject).toContain('SOL');
    expect(draft.body).toContain('Alice');
    expect(draft.body).toContain('Solana');
    expect(draft.body).toContain('?');
    expect(draft.claimsUsed.length).toBe(1);
    expect(draft.templateId).toBe('touch-1-email');
  });

  it('generates all 5 touch drafts', () => {
    const channels: Array<'email' | 'linkedin' | 'telegram'> = ['email', 'email', 'linkedin', 'telegram', 'email'];
    for (let i = 1; i <= 5; i++) {
      const input = { ...baseInput, touchIndex: i, channel: channels[i - 1] };
      const { draft } = generateDraft(input);
      expect(draft.touchIndex).toBe(i);
      expect(draft.channel).toBe(channels[i - 1]);
      expect(draft.body).toContain('Alice');
      expect(draft.body).toContain('Solana');
      expect(draft.claimsUsed.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('includes a question in all drafts', () => {
    const channels: Array<'email' | 'linkedin' | 'telegram'> = ['email', 'email', 'linkedin', 'telegram', 'email'];
    for (let i = 1; i <= 5; i++) {
      const input = { ...baseInput, touchIndex: i, channel: channels[i - 1] };
      const { draft } = generateDraft(input);
      expect(draft.body).toContain('?');
    }
  });

  it('populates claimsUsed field', () => {
    const { draft } = generateDraft(baseInput);
    expect(draft.claimsUsed.length).toBeGreaterThan(0);
    for (const id of draft.claimsUsed) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it('uses US claims for US jurisdiction', () => {
    const usInput = { ...baseInput, jurisdiction: 'us' as const, clarityEnacted: true };
    const { draft } = generateDraft(usInput);
    const usClaims = draft.claimsUsed.filter(id => id.startsWith('us-'));
    expect(usClaims.length).toBeGreaterThan(0);
  });

  it('handles fallback for unknown touch', () => {
    const badInput = { ...baseInput, touchIndex: 99, channel: 'email' as const };
    const { draft, warnings } = generateDraft(badInput);
    expect(warnings.length).toBeGreaterThan(0);
    expect(draft.body).toContain('Alice');
    expect(draft.body).toContain('Solana');
  });

  it('draft never invents licenses not in the claim library', () => {
    const { draft } = generateDraft(baseInput);
    const inventedPhrases = ['SEC registered', 'SEC approved', 'SEC licensed', 'FINRA approved', 'NYDFS licensed'];
    for (const phrase of inventedPhrases) {
      expect(draft.body.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });
});

describe('Message Rules', () => {
  it('rejects draft missing contact name', () => {
    const draft: DraftOutput = {
      subject: 'Test',
      body: 'Body without name',
      channel: 'email',
      touchIndex: 1,
      claimsUsed: ['eu-access-001'],
      requiresHumanReview: false,
      templateId: 'touch-1-email',
      operatorEdited: false,
    };
    const input: DraftInput = {
      projectName: 'Solana',
      projectTicker: 'SOL',
      projectWebsite: null,
      projectChain: null,
      projectEuScore: null,
      projectUsPreScore: null,
      projectUsPostScore: null,
      projectBand: 'high',
      scoreReasons: [],
      contactName: 'Alice',
      contactTitle: null,
      contactRole: 'ceo',
      jurisdiction: 'eu',
      clarityEnacted: false,
      touchIndex: 1,
      channel: 'email',
      market: null,
    };
    const result = validateDraftOutput(draft, input);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.rule === 'tag_person')).toBe(true);
  });

  it('rejects draft missing project hook', () => {
    const draft: DraftOutput = {
      subject: 'Test',
      body: 'Hi Alice, \n\nWould you like to chat?',
      channel: 'email',
      touchIndex: 1,
      claimsUsed: ['eu-access-001'],
      requiresHumanReview: false,
      templateId: 'touch-1-email',
      operatorEdited: false,
    };
    const input: DraftInput = {
      projectName: 'Solana',
      projectTicker: 'SOL',
      projectWebsite: null,
      projectChain: null,
      projectEuScore: null,
      projectUsPreScore: null,
      projectUsPostScore: null,
      projectBand: 'high',
      scoreReasons: [],
      contactName: 'Alice',
      contactTitle: null,
      contactRole: 'ceo',
      jurisdiction: 'eu',
      clarityEnacted: false,
      touchIndex: 1,
      channel: 'email',
      market: null,
    };
    const result = validateDraftOutput(draft, input);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.rule === 'project_hook')).toBe(true);
  });

  it('rejects draft missing question', () => {
    const draft: DraftOutput = {
      subject: 'Test',
      body: 'Hi Alice, I wanted to reach out about Solana.',
      channel: 'email',
      touchIndex: 1,
      claimsUsed: ['eu-access-001'],
      requiresHumanReview: false,
      templateId: 'touch-1-email',
      operatorEdited: false,
    };
    const input: DraftInput = {
      projectName: 'Solana',
      projectTicker: 'SOL',
      projectWebsite: null,
      projectChain: null,
      projectEuScore: null,
      projectUsPreScore: null,
      projectUsPostScore: null,
      projectBand: 'high',
      scoreReasons: [],
      contactName: 'Alice',
      contactTitle: null,
      contactRole: 'ceo',
      jurisdiction: 'eu',
      clarityEnacted: false,
      touchIndex: 1,
      channel: 'email',
      market: null,
    };
    const result = validateDraftOutput(draft, input);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.rule === 'has_question')).toBe(true);
  });

  it('rejects empty claimsUsed', () => {
    const draft: DraftOutput = {
      subject: 'Test',
      body: 'Hi Alice, about Solana. Would you like to chat?',
      channel: 'email',
      touchIndex: 1,
      claimsUsed: [],
      requiresHumanReview: false,
      templateId: 'touch-1-email',
      operatorEdited: false,
    };
    const input: DraftInput = {
      projectName: 'Solana',
      projectTicker: 'SOL',
      projectWebsite: null,
      projectChain: null,
      projectEuScore: null,
      projectUsPreScore: null,
      projectUsPostScore: null,
      projectBand: 'high',
      scoreReasons: [],
      contactName: 'Alice',
      contactTitle: null,
      contactRole: 'ceo',
      jurisdiction: 'eu',
      clarityEnacted: false,
      touchIndex: 1,
      channel: 'email',
      market: null,
    };
    const result = validateDraftOutput(draft, input);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.rule === 'has_benefit')).toBe(true);
  });

  it('rejects deal-closing language', () => {
    const draft: DraftOutput = {
      subject: 'Test',
      body: 'Hi Alice, about Solana. Please sign up today! Would you like to chat?',
      channel: 'email',
      touchIndex: 1,
      claimsUsed: ['eu-access-001'],
      requiresHumanReview: false,
      templateId: 'touch-1-email',
      operatorEdited: false,
    };
    const input: DraftInput = {
      projectName: 'Solana',
      projectTicker: 'SOL',
      projectWebsite: null,
      projectChain: null,
      projectEuScore: null,
      projectUsPreScore: null,
      projectUsPostScore: null,
      projectBand: 'high',
      scoreReasons: [],
      contactName: 'Alice',
      contactTitle: null,
      contactRole: 'ceo',
      jurisdiction: 'eu',
      clarityEnacted: false,
      touchIndex: 1,
      channel: 'email',
      market: null,
    };
    const result = validateDraftOutput(draft, input);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.rule === 'no_deal_closing')).toBe(true);
  });

  it('validates claimsUsed against approved prefixes', () => {
    const good = validateClaimsUsed(['eu-access-001', 'listing-002']);
    expect(good.valid).toBe(true);

    const bad = validateClaimsUsed(['fake-claim-001']);
    expect(bad.valid).toBe(false);
  });

  it('approves a correctly constructed draft', () => {
    const draft: DraftOutput = {
      subject: 'Test',
      body: 'Hi Alice, I came across Solana (SOL) and was impressed by what you are building on SOL. At LCX, we provide regulated access. Would you like to chat?',
      channel: 'email',
      touchIndex: 1,
      claimsUsed: ['eu-access-001'],
      requiresHumanReview: false,
      templateId: 'touch-1-email',
      operatorEdited: false,
    };
    const input: DraftInput = {
      projectName: 'Solana',
      projectTicker: 'SOL',
      projectWebsite: null,
      projectChain: 'SOL',
      projectEuScore: null,
      projectUsPreScore: null,
      projectUsPostScore: null,
      projectBand: 'high',
      scoreReasons: [],
      contactName: 'Alice',
      contactTitle: null,
      contactRole: 'ceo',
      jurisdiction: 'eu',
      clarityEnacted: false,
      touchIndex: 1,
      channel: 'email',
      market: null,
    };
    const result = validateDraftOutput(draft, input);
    expect(result.valid).toBe(true);
  });
});
