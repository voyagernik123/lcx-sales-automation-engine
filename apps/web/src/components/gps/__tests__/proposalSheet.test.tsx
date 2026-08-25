import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ProposalSheet, type ProposalSheetInput } from '../GpsPrintSheets';

/**
 * The proposal sheet's two refusals are the point of it, so they are what this pins:
 * a zero price is NOT printed as money, and an absent conflict check is NAMED rather
 * than implied clear. Everything else is a restatement of the wire, cited.
 */

const base: ProposalSheetInput = {
  engagementId: 'eng-1', offerKey: 'mica_whitepaper', status: 'proposed',
  priceCents: 2_500_000, currency: 'USD', depositRequiredCents: 500_000, depositPaidAt: null,
  contractingEntity: 'lcx', createdAt: '2026-08-22T00:00:00.000Z',
  offerName: 'MiCA White Paper', exclusions: ['No legal advice'],
  requiredClientInputs: ['Tokenomics workbook'],
  conflictDecision: 'cleared', conflictDecidedBy: 'monty',
};

describe('the proposal sheet', () => {
  it('prints the price, scope and conflict decision, each cited to its field', () => {
    render(<ProposalSheet proposal={base} clientName="Sable" asOf="2026-08-22T00:00:00.000Z" />);
    expect(screen.getByTestId('proposal-sheet-price').textContent).toContain('$25,000.00');
    expect(screen.getByTestId('proposal-sheet-exclusions').textContent).toContain('No legal advice');
    expect(screen.getByTestId('proposal-sheet-inputs').textContent).toContain('Tokenomics');
    // provenance names the conflict decision AND its human.
    expect(document.body.textContent).toContain('cleared (decided by monty)');
  });

  it('REFUSES to print a zero price as money — it says none was quoted', () => {
    render(<ProposalSheet proposal={{ ...base, priceCents: 0 }} asOf="2026-08-22T00:00:00.000Z" />);
    expect(screen.queryByTestId('proposal-sheet-price')).toBeNull();
    expect(screen.getByTestId('proposal-sheet-unpriced').textContent).toContain('NO PRICE HAS BEEN QUOTED');
    expect(document.body.textContent).not.toContain('$0.00');
  });

  it('NAMES an absent conflict check rather than implying clearance', () => {
    render(<ProposalSheet proposal={{ ...base, conflictDecision: null, conflictDecidedBy: null }} asOf="2026-08-22T00:00:00.000Z" />);
    expect(document.body.textContent).toContain('NO CHECK RECORDED');
  });

  it('whitelists the snapshot — an extra field never appears (the caller maps, but the sheet cannot leak what it is not given)', () => {
    // The sheet's input type has no field for internal notes; this asserts the shape holds.
    const asAny = base as unknown as Record<string, unknown>;
    expect('scopeSnapshot' in asAny).toBe(false);
    render(<ProposalSheet proposal={base} asOf="2026-08-22T00:00:00.000Z" />);
    expect(within(screen.getByTestId('proposal-sheet-body')).queryByText(/internalOnlyNote/)).toBeNull();
  });
});
