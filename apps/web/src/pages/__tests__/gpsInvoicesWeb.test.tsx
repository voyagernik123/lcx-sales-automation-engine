import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * THE INVOICES PANEL, AS THE BOOK SHOWS IT. Pinned: aging refuses to sum across
 * currencies; pay demands its rail reference and dispute/void their reasons; the
 * chase opens a gated draft with NO send control; and an absent 0082 says the true
 * sentence rather than an empty list.
 */

const requests = vi.hoisted(() => [] as Array<{ url: string; init?: { method?: string; body?: unknown } }>);
const responder = vi.hoisted(() => ({ fn: null as null | ((url: string, init?: { method?: string; body?: unknown }) => unknown) }));

class MockApiError extends Error {
  status: number; code?: string; data?: unknown;
  constructor(message: string, status: number, code?: string, data?: unknown) {
    super(message); this.status = status; this.code = code; this.data = data;
  }
}

vi.mock('@/lib/apiClient', () => ({
  ApiError: MockApiError,
  request: async (url: string, init?: { method?: string; body?: unknown }) => {
    requests.push({ url, init });
    const out = responder.fn?.(url, init);
    if (out instanceof MockApiError) throw out;
    return out;
  },
}));

const { InvoicesPanel } = await import('../../components/gps/InvoicesPanel');

const INVOICE = {
  id: 31, number: 'GPS-000031', engagementId: 'eng-1', deliverableId: 'del-1',
  amountCents: 1_500_000, currency: 'USD', status: 'issued',
  issuedBy: 'nik', issuedAt: '2026-08-01T00:00:00.000Z',
  paidReference: null, disputedReason: null, voidedReason: null,
};

const data = (over: Partial<Record<string, unknown>> = {}) => ({
  data: {
    invoices: [INVOICE],
    aging: { brackets: [{ key: 'd8_30', label: '8–30d', count: 1, amountCents: 1_500_000 }], openCount: 1, openAmountCents: 1_500_000, unagedCount: 0, currenciesPresent: ['USD'] },
    registerPresent: true,
    ...over,
  },
});

beforeEach(() => {
  requests.length = 0;
  responder.fn = () => data();
});

describe('the invoices panel', () => {
  it('renders the aging and the invoice with its identity-number', async () => {
    render(<InvoicesPanel />);
    expect(await screen.findByTestId('invoice-31')).toBeTruthy();
    expect(screen.getByTestId('invoice-31').textContent).toContain('GPS-000031');
    expect(screen.getByTestId('aging-d8_30').textContent).toContain('8–30d: 1');
  });

  it('refuses to print one total across currencies, and says why', async () => {
    responder.fn = () => data({
      aging: { brackets: [], openCount: 2, openAmountCents: 3_000_000, unagedCount: 0, currenciesPresent: ['EUR', 'USD'] },
    });
    render(<InvoicesPanel />);
    const note = await screen.findByTestId('invoices-multi-currency');
    expect(note.textContent).toContain('EUR, USD');
    expect(note.textContent).toContain('made-up number');
  });

  it('pay requires a rail reference before it records', async () => {
    responder.fn = (_url, init) =>
      init?.method === 'POST' ? { data: { invoice: { ...INVOICE, status: 'paid', paidReference: 'SEPA-1' } } } : data();
    render(<InvoicesPanel />);
    await screen.findByTestId('invoice-31');
    fireEvent.click(screen.getByRole('button', { name: /mark paid/i }));
    const record = screen.getByRole('button', { name: /record payment/i });
    expect(record).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('pay input 31'), { target: { value: 'SEPA-2026-88' } });
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));
    const post = await vi.waitFor(() => {
      const p = requests.find((r) => r.url === '/v1/gps/invoices/31/pay');
      expect(p).toBeTruthy();
      return p!;
    });
    expect(post.init!.body).toEqual({ reference: 'SEPA-2026-88' });
  });

  it('the chase opens a gated draft with a verdict and NO send control', async () => {
    responder.fn = (url, init) =>
      url === '/v1/gps/invoices/31/chase' && init?.method === 'POST'
        ? { data: { draft: 'Subject: LCX invoice GPS-000031 — $15,000\n\nHello,', verdict: { allowed: true, disposition: 'clear', refusals: [], reference: 'gateref42' } } }
        : data();
    render(<InvoicesPanel />);
    await screen.findByTestId('invoice-31');
    fireEvent.click(screen.getByRole('button', { name: /^chase$/i }));
    const draft = await screen.findByTestId('chase-draft');
    expect(draft.textContent).toContain('gate: cleared');
    expect(screen.getByTestId('chase-text').textContent).toContain('GPS-000031');
    expect(draft.textContent).toContain('it does not send');
    for (const b of screen.getAllByRole('button')) {
      expect(b.textContent ?? '').not.toMatch(/^send/i);
    }
  });

  it('says the true sentence when 0082 is absent', async () => {
    responder.fn = () => data({ invoices: [], aging: null, registerPresent: false });
    render(<InvoicesPanel />);
    expect((await screen.findByTestId('invoices-register-absent')).textContent).toContain('0082_gps_invoice.sql');
  });
});
