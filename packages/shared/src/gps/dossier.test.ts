import { describe, expect, it } from 'vitest';
import {
  DOSSIER_HEADINGS, DOSSIER_MAX_CHARS, MODEL_SECTION_CAVEAT, OUTREACH_MAX_CHARS,
  buildDossierPrompt, buildOutreachPrompt, dossierDefects, dossierFacts, outreachDefects,
  type DossierTargetView,
} from './dossier.js';

/**
 * G2's contract, tested from both directions: the prompt must hand out the numbered
 * facts and demand the shape, and the validator must refuse every way the shape can
 * silently rot — an invented citation, an uncited claim, a paraphrased caveat, a
 * section gone missing. The fixtures below are hand-written model responses, one
 * per failure mode, because the validator IS the product here: the difference
 * between "AI research" and "plausible essay" is only ever this function saying no.
 */

const VIEW: DossierTargetView = {
  id: 'tgt-1',
  name: 'Sable Protocol',
  jurisdiction: 'Germany',
  offerKey: 'mica_whitepaper',
  identifiedNeeds: ['mica_whitepaper', 'gtm_sprint'],
  introPath: 'warm_referral',
  statedBudgetCents: 1_800_000,
  evidenceGrade: 'B2',
  evidenceAgeDays: 12,
  screening: 'clear',
  perimeter: 'in_perimeter',
  conflict: 'cleared',
  deadlineIso: '2026-10-01T00:00:00.000Z',
  deadlineKind: 'regulatory',
  decisionMakerRole: 'CTO',
  decisionMakerIsBudgetHolder: true,
};

const SPARSE: DossierTargetView = {
  id: 'tgt-2', name: 'Helios', jurisdiction: null, offerKey: null, identifiedNeeds: null,
  introPath: null, statedBudgetCents: null, evidenceGrade: null, evidenceAgeDays: null,
  screening: null, perimeter: null, conflict: null, deadlineIso: null, deadlineKind: null,
  decisionMakerRole: null, decisionMakerIsBudgetHolder: null,
};

const compliant = (refs: readonly string[]) => [
  DOSSIER_HEADINGS[0],
  `- The target is Sable Protocol, based in Germany. [F1, F2]`,
  `- The register hypothesises a MiCA white paper need. [${refs[2] ?? 'F3'}]`,
  DOSSIER_HEADINGS[1],
  MODEL_SECTION_CAVEAT,
  'MiCA white paper obligations typically bind CASP-listed assets in the EU.',
  DOSSIER_HEADINGS[2],
  'The offer fits because a German project with a regulatory deadline needs the Annex work started now. [F1]',
  DOSSIER_HEADINGS[3],
  '- Confirmation of the deadline from the project itself.',
].join('\n');

describe('dossierFacts — the numbered register', () => {
  it('numbers sequentially, skips nulls, renders money and roles without names', () => {
    const facts = dossierFacts(VIEW);
    expect(facts.map((f) => f.ref)).toEqual(facts.map((_, i) => `F${i + 1}`));
    expect(facts.find((f) => f.field === 'target.statedBudget')!.value).toContain('$18,000');
    expect(facts.find((f) => f.field === 'target.decisionMakerRole')!.value).toBe('CTO');
    expect(facts.some((f) => f.field.toLowerCase().includes('name') && f.field !== 'target.name')).toBe(false);
  });

  it('a sparse view yields only the name fact — absence is absence, not prose', () => {
    const facts = dossierFacts(SPARSE);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ ref: 'F1', field: 'target.name', value: 'Helios' });
  });
});

describe('buildDossierPrompt', () => {
  it('hands out every fact, every heading, and the exact caveat line', () => {
    const p = buildDossierPrompt(VIEW);
    for (const ref of p.refs) expect(p.task).toContain(`[${ref}]`);
    for (const h of DOSSIER_HEADINGS) expect(p.task).toContain(h);
    expect(p.system).toContain(MODEL_SECTION_CAVEAT);
    expect(p.system).toContain('no personal names');
  });

  it('a sparse view still enumerates its one fact rather than the empty-register sentence', () => {
    const p = buildDossierPrompt(SPARSE);
    expect(p.refs).toEqual(['F1']);
    expect(p.task).toContain('[F1] target.name = Helios');
    expect(p.task).not.toContain('(the register shows nothing beyond the name)');
  });
});

describe('dossierDefects — the refusals', () => {
  const REFS = buildDossierPrompt(VIEW).refs;

  it('accepts the compliant fixture with zero defects', () => {
    expect(dossierDefects(compliant(REFS), REFS)).toEqual([]);
  });

  it('refuses empty and over-long responses', () => {
    expect(dossierDefects('   ', REFS)[0].code).toBe('EMPTY');
    const long = compliant(REFS) + '\nx'.repeat(DOSSIER_MAX_CHARS);
    expect(dossierDefects(long, REFS).some((d) => d.code === 'TOO_LONG')).toBe(true);
  });

  it('names each missing heading', () => {
    const text = compliant(REFS).replace(DOSSIER_HEADINGS[3], '## SOMETHING ELSE');
    const out = dossierDefects(text, REFS);
    expect(out.filter((d) => d.code === 'MISSING_SECTION')).toHaveLength(1);
    expect(out[0].detail).toContain(DOSSIER_HEADINGS[3]);
  });

  it('refuses reordered sections', () => {
    const text = [
      DOSSIER_HEADINGS[1], MODEL_SECTION_CAVEAT,
      DOSSIER_HEADINGS[0], '- A claim. [F1]',
      DOSSIER_HEADINGS[2], 'Angle. [F1]',
      DOSSIER_HEADINGS[3], '- Falsifier.',
    ].join('\n');
    expect(dossierDefects(text, REFS).some((d) => d.code === 'SECTIONS_OUT_OF_ORDER')).toBe(true);
  });

  it('refuses a citation that was never handed out, by name', () => {
    const text = compliant(REFS).replace('[F1, F2]', '[F1, F99]');
    const out = dossierDefects(text, REFS);
    expect(out.some((d) => d.code === 'UNKNOWN_FACT_REF' && d.detail.includes('F99'))).toBe(true);
  });

  it('refuses an uncited line in the register section, quoting it', () => {
    const text = compliant(REFS).replace(
      '- The target is Sable Protocol, based in Germany. [F1, F2]',
      '- The target raised $40M from Tier-1 funds last quarter.',
    );
    const out = dossierDefects(text, REFS);
    const hit = out.find((d) => d.code === 'UNCITED_REGISTER_LINE');
    expect(hit).toBeTruthy();
    expect(hit!.detail).toContain('$40M');
  });

  it('refuses a register section with no claims at all', () => {
    const text = [
      DOSSIER_HEADINGS[0],
      DOSSIER_HEADINGS[1], MODEL_SECTION_CAVEAT,
      DOSSIER_HEADINGS[2], 'Angle. [F1]',
      DOSSIER_HEADINGS[3], '- Falsifier.',
    ].join('\n');
    expect(dossierDefects(text, REFS).some((d) => d.code === 'REGISTER_SECTION_EMPTY')).toBe(true);
  });

  it('refuses a paraphrased caveat — the words are ours, not the model’s', () => {
    const text = compliant(REFS).replace(
      MODEL_SECTION_CAVEAT,
      'Note: the following is general knowledge, please verify.',
    );
    expect(dossierDefects(text, REFS).some((d) => d.code === 'MISSING_MODEL_CAVEAT')).toBe(true);
  });

  it('returns EVERY defect at once, not the first', () => {
    const text = [
      DOSSIER_HEADINGS[0],
      '- Uncited claim about funding.',
      DOSSIER_HEADINGS[1],
      'General knowledge without the caveat. [F77]',
    ].join('\n');
    const codes = dossierDefects(text, REFS).map((d) => d.code);
    expect(codes).toContain('MISSING_SECTION');
    expect(codes).toContain('UNCITED_REGISTER_LINE');
    expect(codes).toContain('UNKNOWN_FACT_REF');
    expect(codes).toContain('MISSING_MODEL_CAVEAT');
  });
});

describe('outreach — drafted here, sent nowhere', () => {
  it('the prompt forbids promises and personal names, and carries the register context', () => {
    const p = buildOutreachPrompt(VIEW, 'email', 'The angle text.');
    expect(p.system).toContain('Never promise');
    expect(p.system).toContain('no personal names');
    expect(p.task).toContain('Sable Protocol');
    expect(p.task).toContain('The angle text.');
  });

  it('accepts a clean draft and refuses promise language with the phrase quoted', () => {
    expect(outreachDefects('Short honest note from the LCX services desk. Open to a 20-minute call?')).toEqual([]);
    const out = outreachDefects('We guarantee your token will be listed, risk-free.');
    const codes = out.map((d) => d.code);
    expect(codes.filter((c) => c === 'PROMISE_LANGUAGE').length).toBeGreaterThanOrEqual(2);
    expect(out.some((d) => d.detail.includes('guarantee'))).toBe(true);
  });

  it('refuses empty and over-cap drafts', () => {
    expect(outreachDefects('')[0].code).toBe('EMPTY');
    expect(outreachDefects('a'.repeat(OUTREACH_MAX_CHARS + 1)).some((d) => d.code === 'TOO_LONG')).toBe(true);
  });
});
