import { describe, expect, it } from 'vitest';
import {
  CHASE_MAX_CHARS, INVOICE_STATUSES, OPEN_INVOICE_STATUSES,
  buildChaseText, formatInvoiceNumber, invoiceAging, type InvoiceAgingInput,
} from './invoicing.js';
import { outreachDefects } from './dossier.js';

/**
 * The pure parts of money. The number is the identity (immutable, padded); aging
 * mirrors the deposit brackets and refuses to sum across currencies; the chase is
 * deterministic and — the assertion that matters commercially — carries NO promise
 * language, checked against the same predicate the outbound gate's pre-flight uses.
 */

describe('the invoice number', () => {
  it('is the padded identity, so it cannot drift from its row', () => {
    expect(formatInvoiceNumber(1)).toBe('GPS-000001');
    expect(formatInvoiceNumber(42)).toBe('GPS-000042');
    expect(formatInvoiceNumber(1_234_567)).toBe('GPS-1234567');
  });
});

describe('the status sets', () => {
  it('name four states, of which two are still owed', () => {
    expect(INVOICE_STATUSES).toEqual(['issued', 'paid', 'disputed', 'void']);
    expect(OPEN_INVOICE_STATUSES).toEqual(['issued', 'disputed']);
  });
});

describe('invoiceAging', () => {
  const asOf = '2026-08-22T00:00:00.000Z';
  const inv = (over: Partial<InvoiceAgingInput>): InvoiceAgingInput => ({
    status: 'issued', amountCents: 100_000, currency: 'USD', issuedAtIso: '2026-08-20T00:00:00.000Z', ...over,
  });

  it('ages only open invoices, into the deposit brackets, summing amounts', () => {
    const a = invoiceAging([
      inv({ issuedAtIso: '2026-08-20T00:00:00.000Z', amountCents: 100_000 }), // 2d → d0_7
      inv({ issuedAtIso: '2026-08-01T00:00:00.000Z', amountCents: 250_000 }), // 21d → d8_30
      inv({ status: 'paid', issuedAtIso: '2026-01-01T00:00:00.000Z', amountCents: 999_999 }), // settled, excluded
      inv({ status: 'void', amountCents: 888_888 }),
    ], asOf);
    expect(a.openCount).toBe(2);
    expect(a.openAmountCents).toBe(350_000);
    expect(a.brackets.find((b) => b.key === 'd0_7')!.amountCents).toBe(100_000);
    expect(a.brackets.find((b) => b.key === 'd8_30')!.amountCents).toBe(250_000);
  });

  it('a disputed invoice still ages — a dispute is a state, not a disappearance', () => {
    const a = invoiceAging([inv({ status: 'disputed', issuedAtIso: '2026-05-01T00:00:00.000Z' })], asOf);
    expect(a.openCount).toBe(1);
    expect(a.brackets.find((b) => b.key === 'd90_plus')!.count).toBe(1);
  });

  it('reports every currency present so no surface sums dollars into euros', () => {
    const a = invoiceAging([inv({ currency: 'USD' }), inv({ currency: 'EUR' })], asOf);
    expect(a.currenciesPresent).toEqual(['EUR', 'USD']);
  });

  it('counts a future-dated issue as unaged rather than filing it in the freshest bracket', () => {
    const a = invoiceAging([inv({ issuedAtIso: '2027-01-01T00:00:00.000Z' })], asOf);
    expect(a.unagedCount).toBe(1);
    expect(a.brackets.every((b) => b.count === 0)).toBe(true);
  });
});

describe('buildChaseText', () => {
  const base = {
    invoiceNumber: 'GPS-000007', amountCents: 1_500_000, currency: 'USD',
    clientName: 'Sable Protocol', ageDays: 21, deliverableName: 'MiCA white paper — submission draft',
  };

  it('states the invoice’s own facts and asks a question, under the cap', () => {
    const t = buildChaseText(base);
    expect(t).toContain('GPS-000007');
    expect(t).toContain('$15,000');
    expect(t).toContain('21 days');
    expect(t).toContain('MiCA white paper');
    expect(t.length).toBeLessThanOrEqual(CHASE_MAX_CHARS);
  });

  it('carries NO promise or guarantee language — checked by the gate’s own predicate', () => {
    // The chase is outreach; the same pre-flight the outbound draft answers to must pass it.
    expect(outreachDefects(buildChaseText(base))).toEqual([]);
    expect(outreachDefects(buildChaseText({ ...base, ageDays: 0 }))).toEqual([]);
  });

  it('reads sanely on the day it is issued rather than claiming negative age', () => {
    expect(buildChaseText({ ...base, ageDays: 0 })).toContain('issued today');
  });
});
