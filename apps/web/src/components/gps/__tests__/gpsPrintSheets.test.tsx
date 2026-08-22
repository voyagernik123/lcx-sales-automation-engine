import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DossierSheet, InvoiceSheet } from '../GpsPrintSheets';

/**
 * THE TWO SHEETS G7 ADDS, AND THE ONE THING EACH MUST NOT LOSE ON PAPER.
 *
 * The dossier's whole claim to being research rather than an essay is its [F#]
 * citations and its verbatim C3 caveat. A printed sheet is the copy most likely to be
 * forwarded outside the compartment, so if either is dropped in the render the sheet
 * becomes exactly the authoritative-looking fabrication the cite-or-refuse validator
 * exists to prevent. The invoice's is the opposite risk: an amount that reads as
 * approximate, or a state change with nobody's name against it.
 */

const ASOF = '2026-08-22T12:00:00.000Z';

const DOSSIER = {
  id: 11,
  targetName: 'Sable Protocol',
  offerKey: 'mica_whitepaper',
  status: 'accepted',
  dossierMd: [
    '## WHAT THE REGISTER SHOWS',
    '- Sable Protocol is a German-jurisdiction target. [F1, F2]',
    '## WHAT THE MODEL ADDS (UNVERIFIED, C3)',
    'Everything below this line is model knowledge with no register grounding: grade C3 — verify independently before acting on any of it.',
    'MiCA white papers follow the Annex structure.',
  ].join('\n'),
  model: 'openrouter',
  factRefsCited: 2,
  generatedBy: 'nik',
  generatedAt: '2026-08-22T09:00:00.000Z',
  decidedBy: 'nik',
  decidedAt: '2026-08-22T10:00:00.000Z',
  decisionNote: null,
};

const INVOICE = {
  number: 'GPS-000031',
  amountCents: 1_500_049,
  currency: 'USD',
  status: 'disputed',
  issuedBy: 'nik',
  issuedAt: '2026-08-01T00:00:00.000Z',
  deliverableId: 'del-1',
  engagementId: 'eng-1',
  paidAt: null, paidBy: null, paidReference: null,
  disputedAt: '2026-08-15T00:00:00.000Z', disputedBy: 'monty',
  disputedReason: 'scope contested',
  voidedAt: null, voidedBy: null, voidedReason: null,
};

describe('the dossier sheet', () => {
  it('prints the citations and the C3 caveat VERBATIM', () => {
    render(<DossierSheet dossier={DOSSIER} asOf={ASOF} />);
    const body = screen.getByTestId('dossier-sheet-text');
    expect(body.textContent).toContain('[F1, F2]');
    expect(body.textContent).toContain('grade C3 — verify independently');
    expect(body.textContent).toContain('## WHAT THE MODEL ADDS (UNVERIFIED, C3)');
  });

  it('labels itself a model draft that is not a client document', () => {
    render(<DossierSheet dossier={DOSSIER} asOf={ASOF} />);
    expect(screen.getByTestId('gps-print-artefact').textContent).toContain('never a client document');
  });

  it('shouts when the dossier was never accepted by a human', () => {
    render(<DossierSheet dossier={{ ...DOSSIER, status: 'draft', decidedBy: null, decidedAt: null }} asOf={ASOF} />);
    expect(screen.getByTestId('dossier-sheet-unaccepted').textContent).toContain('NOT been accepted');
  });

  it('dates the figures to the generation instant, not to the read', () => {
    render(<DossierSheet dossier={DOSSIER} asOf={ASOF} />);
    const computed = screen.getByTestId('gps-print-computed-at').textContent ?? '';
    expect(computed).not.toContain('NOT CARRIED');
    expect(computed).toContain('2026-08-22');
  });
});

describe('the invoice sheet', () => {
  it('prints the amount to the cent, never rounded', () => {
    render(<InvoiceSheet invoice={INVOICE} asOf={ASOF} />);
    expect(screen.getByTestId('invoice-sheet-amount').textContent).toContain('$15,000.49');
  });

  it('names the actor and instant of EVERY state change', () => {
    render(<InvoiceSheet invoice={INVOICE} asOf={ASOF} />);
    const history = screen.getByTestId('invoice-sheet-history');
    expect(history.textContent).toContain('Issued by nik on 2026-08-01');
    expect(history.textContent).toContain('Disputed by monty on 2026-08-15');
  });

  it('states the dispute as a live claim, not a withdrawal', () => {
    render(<InvoiceSheet invoice={INVOICE} asOf={ASOF} />);
    expect(screen.getByTestId('invoice-sheet-disputed').textContent).toContain('still stands and still ages');
  });

  it('says a void sheet must not be presented as payable', () => {
    render(<InvoiceSheet asOf={ASOF} invoice={{
      ...INVOICE, status: 'void', disputedBy: null, disputedReason: null, disputedAt: null,
      voidedBy: 'nik', voidedAt: '2026-08-20T00:00:00.000Z', voidedReason: 'issued in error',
    }} />);
    expect(screen.getByTestId('invoice-sheet-void').textContent).toContain('must not be presented as payable');
  });

  it('does NOT claim to carry the acceptance itself', () => {
    /* The row proves the server refused to insert without an acceptance. That is a
       weaker claim than "here is the acceptance", and the sheet says which it is. */
    render(<InvoiceSheet invoice={INVOICE} asOf={ASOF} />);
    const sheet = screen.getByTestId('gps-print-artefact');
    expect(sheet.textContent).toContain('not carried on this sheet');
    expect(sheet.textContent).toContain('provable on the delivery desk');
  });

  it('carries NO placeholder-price notice — the amount is a human’s figure', () => {
    render(<InvoiceSheet invoice={INVOICE} asOf={ASOF} />);
    expect(screen.getByTestId('gps-print-artefact').textContent).not.toContain('PLACEHOLDER PRICE');
  });
});
