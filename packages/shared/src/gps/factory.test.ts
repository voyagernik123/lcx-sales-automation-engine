import { describe, expect, it } from 'vitest';
import {
  DRAFT_MAX_CHARS, FACTORY_STAGES, composeDraftPrompt, draftDefects, factoryTemplate, slotGaps,
} from './factory.js';
import { OFFER_KEYS, getOffer } from './index.js';

/**
 * Stage 1's contract: the slots are the CATALOGUE's own list (derivation, not
 * agreement), the refusal names every gap, the composer physically cannot run over
 * one, and the output validator holds the same shape-or-refuse bar the dossier
 * validator set. Fixtures derive from the modules they test — nothing retyped.
 */

const VALUES_FOR = (offerKey: (typeof OFFER_KEYS)[number]) => {
  const t = factoryTemplate(offerKey);
  const values: Record<string, string> = {};
  for (const s of t.slots) values[s.key] = `supplied: ${s.label.slice(0, 40)}`;
  return { t, values };
};

describe('the templates', () => {
  it('exist for every offer, with sections and the catalogue-derived slots', () => {
    for (const k of OFFER_KEYS) {
      const t = factoryTemplate(k);
      expect(t.sections.length).toBeGreaterThanOrEqual(5);
      const clientSlots = t.slots.filter((s) => s.source === 'client_fact');
      const catalogue = getOffer(k)!.requiredClientInputs;
      // DERIVED, not agreed: the slot labels ARE the catalogue sentences.
      expect(clientSlots.map((s) => s.label)).toEqual([...catalogue]);
      expect(clientSlots.every((s) => s.required)).toBe(true);
      // The dossier is the one optional slot — research helps, but its absence is
      // not a client obligation.
      expect(t.slots.find((s) => s.source === 'dossier')!.required).toBe(false);
    }
  });
});

describe('slotGaps — the D10 refusal, which is also the chase list', () => {
  it('names every missing required slot and ignores the optional dossier', () => {
    const t = factoryTemplate('mica_whitepaper');
    const gaps = slotGaps(t, { 'engagement.clientName': 'Sable', 'engagement.offerName': 'MiCA white paper' });
    expect(gaps.length).toBe(getOffer('mica_whitepaper')!.requiredClientInputs.length);
    expect(gaps.every((g) => g.source === 'client_fact')).toBe(true);
  });

  it('treats blank and whitespace values as gaps — an empty answer is not an answer', () => {
    const { t, values } = VALUES_FOR('diagnostic');
    values[t.slots[2].key] = '   ';
    expect(slotGaps(t, values).map((g) => g.key)).toEqual([t.slots[2].key]);
  });
});

describe('composeDraftPrompt', () => {
  it('THROWS over a gap — the refusal cannot be skipped by calling the composer directly', () => {
    const t = factoryTemplate('mica_whitepaper');
    expect(() => composeDraftPrompt(t, {})).toThrow(/required gap/);
  });

  it('carries every supplied fact, every heading, the marker rule and the no-promise rule', () => {
    const { t, values } = VALUES_FOR('mica_whitepaper');
    const p = composeDraftPrompt(t, values);
    for (const h of t.sections) expect(p.task).toContain(h);
    for (const s of t.slots) expect(p.task).toContain(`supplied: ${s.label.slice(0, 40)}`);
    expect(p.system).toContain('[FACT REQUIRED:');
    expect(p.system).toContain('Never assert or imply that LCX guarantees');
    expect(p.system).toContain(t.guidance);
  });
});

describe('draftDefects — shape or refuse; truth is Stage 2', () => {
  const t = factoryTemplate('diagnostic');
  const compliant = t.sections.map((h) => `${h}\nContent under the heading.`).join('\n');

  it('accepts the compliant shape with zero defects', () => {
    expect(draftDefects(compliant, t)).toEqual([]);
  });

  it('refuses empty, over-long, missing and reordered sections', () => {
    expect(draftDefects('  ', t)[0].code).toBe('EMPTY');
    expect(draftDefects(compliant + 'x'.repeat(DRAFT_MAX_CHARS), t).some((d) => d.code === 'TOO_LONG')).toBe(true);
    const missing = draftDefects(compliant.replace(t.sections[3], '## SOMETHING ELSE'), t);
    expect(missing.some((d) => d.code === 'MISSING_SECTION' && d.detail.includes(t.sections[3]))).toBe(true);
    const reordered = [t.sections[1], 'x', t.sections[0], 'y', ...t.sections.slice(2)].join('\n');
    expect(draftDefects(reordered, t).some((d) => d.code === 'SECTIONS_OUT_OF_ORDER')).toBe(true);
  });
});

describe('the stages', () => {
  it('are the waterfall the owner chose, in order', () => {
    expect(FACTORY_STAGES).toEqual(['ai_draft', 'internal_qa', 'partner']);
  });
});
