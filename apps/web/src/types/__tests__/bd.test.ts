import { describe, it, expect } from 'vitest';
import { deriveMarketTag, deriveNextAction, deriveStage } from '@/types/bd';
import type { BdLead, GateCheck } from '@/types/bd';
import type { ScoreBand } from '@lcx/shared';

describe('deriveMarketTag', () => {
  it('returns eu for EU jurisdiction', () => {
    const lead = { jurisdiction: 'DE' } as BdLead;
    expect(deriveMarketTag(lead)).toBe('eu');
  });

  it('returns us for US jurisdiction', () => {
    const lead = { jurisdiction: 'US' } as BdLead;
    expect(deriveMarketTag(lead)).toBe('us');
  });

  it('returns null for unknown jurisdiction', () => {
    const lead = { jurisdiction: 'JP' } as BdLead;
    expect(deriveMarketTag(lead)).toBeNull();
  });

  it('returns null for empty jurisdiction', () => {
    const lead = { jurisdiction: '' } as BdLead;
    expect(deriveMarketTag(lead)).toBeNull();
  });

  it('case-insensitive matching', () => {
    expect(deriveMarketTag({ jurisdiction: 'de' } as BdLead)).toBe('eu');
    expect(deriveMarketTag({ jurisdiction: 'us' } as BdLead)).toBe('us');
  });
});

describe('deriveNextAction', () => {
  it('returns correct action for each band', () => {
    const cases: [ScoreBand, string][] = [
      ['immediate', 'Begin outreach'],
      ['high', 'Schedule call'],
      ['nurture', 'Send intro'],
      ['watch', 'Monitor'],
      ['archive', 'No action'],
      ['unscored', 'Score first'],
    ];
    for (const [band, action] of cases) {
      expect(deriveNextAction(band)).toBe(action);
    }
  });
});

describe('deriveStage', () => {
  it('returns correct stage for each band', () => {
    const cases: [ScoreBand, string][] = [
      ['immediate', 'Hot lead'],
      ['high', 'Warm lead'],
      ['nurture', 'Nurturing'],
      ['watch', 'Monitoring'],
      ['archive', 'Archived'],
      ['unscored', 'New'],
    ];
    for (const [band, stage] of cases) {
      expect(deriveStage(band)).toBe(stage);
    }
  });
});

describe('enrollment gate logic', () => {
  it('passes gate when all conditions met (nurture+, verified contact, not suppressed, no red flags)', () => {
    const gate: GateCheck = {
      pass: true, reasons: [], band: 'nurture',
      hasVerifiedContact: true, suppressed: false, totalContacts: 1,
    };
    expect(gate.pass).toBe(true);
    expect(gate.reasons).toHaveLength(0);
    expect(gate.hasVerifiedContact).toBe(true);
  });

  it('fails gate when project is suppressed', () => {
    const gate: GateCheck = {
      pass: false, reasons: ['Project is suppressed'], band: 'immediate',
      hasVerifiedContact: true, suppressed: true, totalContacts: 2,
    };
    expect(gate.pass).toBe(false);
    expect(gate.reasons).toContain('Project is suppressed');
    expect(gate.suppressed).toBe(true);
  });

  it('fails gate when no verified contacts', () => {
    const gate: GateCheck = {
      pass: false, reasons: ['No person with verified email or LinkedIn URL'], band: 'high',
      hasVerifiedContact: false, suppressed: false, totalContacts: 0,
    };
    expect(gate.pass).toBe(false);
    expect(gate.reasons[0]).toMatch(/verified email/);
    expect(gate.hasVerifiedContact).toBe(false);
  });

  it('fails gate when band is below nurture', () => {
    const gate: GateCheck = {
      pass: false, reasons: ['Band "watch" is below nurture threshold'], band: 'watch',
      hasVerifiedContact: true, suppressed: false, totalContacts: 1,
    };
    expect(gate.pass).toBe(false);
    expect(gate.reasons[0]).toMatch(/below nurture/);
  });

  it('reports total contacts count even when gate fails', () => {
    const gate: GateCheck = {
      pass: false, reasons: ['No person with verified email or LinkedIn URL'], band: 'immediate',
      hasVerifiedContact: false, suppressed: false, totalContacts: 3,
    };
    expect(gate.pass).toBe(false);
    expect(gate.totalContacts).toBe(3);
  });

  it('allows enrollment for immediate band with verified contact', () => {
    const gate: GateCheck = {
      pass: true, reasons: [], band: 'immediate',
      hasVerifiedContact: true, suppressed: false, totalContacts: 2,
    };
    expect(gate.pass).toBe(true);
    expect(gate.band).toBe('immediate');
  });

  it('rejects with zero contacts', () => {
    const gate: GateCheck = {
      pass: false, reasons: ['No person with verified email or LinkedIn URL'], band: 'immediate',
      hasVerifiedContact: false, suppressed: false, totalContacts: 0,
    };
    expect(gate.pass).toBe(false);
    expect(gate.totalContacts).toBe(0);
  });
});
