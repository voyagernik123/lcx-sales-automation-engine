import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * THREE DEFECTS THAT SHIPPED IN G4–G6, PINNED SHUT.
 *
 * All three were found by an adversarial read of my own already-merged code, and all
 * three are the same species: a surface quietly disagreeing with the server it reports
 * on. None would have been caught by the tests that shipped beside them, because each
 * of those asserted the happy path the component was written for.
 *
 *  1. INVOICE AMOUNTS WERE ROUNDED. `Math.round(cents / 100)` printed 1,500,049 cents
 *     as "$15,000". A rounded summary is fine on a dashboard and is a WRONG LEGAL
 *     CLAIM on an invoice.
 *  2. THE QA REVIEW OUTCOME WAS DISCARDED. `qaDecide` accepts the draft and separately
 *     tries to mark the deliverable reviewed; that second step can refuse. The panel
 *     threw the result away and rendered success, so a reviewer was told the waterfall
 *     had advanced when it had not.
 *  3. AN EXPIRED PORTAL LINK READ AS 'live'. The badge branched on `revokedAt` alone
 *     while `resolvePortalToken` refuses expired sessions — the desk would have told a
 *     client a dead link was working.
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
const { FactoryPanel } = await import('../../components/gps/FactoryPanel');
const { PortalInvitePanel } = await import('../../components/gps/PortalInvitePanel');

beforeEach(() => {
  requests.length = 0;
  responder.fn = () => ({ data: {} });
});

describe('1 · an invoice prints to the cent', () => {
  const invoice = (amountCents: number) => ({
    data: {
      registerPresent: true,
      aging: null,
      invoices: [{
        id: 1, number: 'GPS-000001', engagementId: 'e', deliverableId: 'd',
        amountCents, currency: 'USD', status: 'issued',
        issuedBy: 'nik', issuedAt: '2026-08-01T00:00:00.000Z',
        paidReference: null, disputedReason: null, voidedReason: null,
      }],
    },
  });

  it('does NOT round away cents — the pre-fix output was "$15,000"', async () => {
    responder.fn = () => invoice(1_500_049);
    render(<InvoicesPanel />);
    const row = await screen.findByTestId('invoice-1');
    expect(row.textContent).toContain('$15,000.49');
    expect(row.textContent).not.toMatch(/\$15,000(?!\.)/);
  });

  it('pads a trailing single cent rather than printing $15,000.5', async () => {
    responder.fn = () => invoice(1_500_005);
    render(<InvoicesPanel />);
    expect((await screen.findByTestId('invoice-1')).textContent).toContain('$15,000.05');
  });

  it('prints a whole amount with explicit .00, so precision is never ambiguous', async () => {
    responder.fn = () => invoice(1_500_000);
    render(<InvoicesPanel />);
    expect((await screen.findByTestId('invoice-1')).textContent).toContain('$15,000.00');
  });
});

describe('2 · a QA acceptance that did not advance the deliverable says so', () => {
  /* The real wire shape, copied from gpsFactoryWeb.test.tsx rather than guessed. */
  const draftList = {
    data: {
      registerPresent: true,
      slotState: {
        draftTitle: 'MiCA white paper — first draft (Annex structure)',
        sections: ['## PART A — THE ISSUER'],
        slots: [{ key: 'client:x', label: 'x', source: 'client_fact', required: true, filled: true }],
        gaps: [],
      },
      drafts: [{
        id: 5, deliverableId: 'del-1', version: 1, status: 'draft',
        draftText: '## PART A — THE ISSUER\ncontent', model: 'openrouter', slotsFilled: 6,
        generatedBy: 'nik', generatedAt: '2026-08-20T00:00:00.000Z',
        decidedBy: null, decidedAt: null, decisionNote: null,
      }],
      actuals: [],
      handover: null,
    },
  };

  it('surfaces the refusal when the review gate did not run', async () => {
    responder.fn = (url, init) =>
      init?.method === 'POST' && url.includes('/qa')
        ? { data: { reviewRecorded: false, reviewDetail: 'conflict position is declined for this engagement' } }
        : draftList;
    render(<FactoryPanel engagementId="e" />);
    await screen.findByTestId('draft-5');
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    const gap = await screen.findByTestId('factory-review-gap');
    expect(gap.textContent).toContain('conflict position is declined');
    expect(gap.textContent).toContain('client cannot accept');
  });

  it('stays silent when the review DID record — no false alarm', async () => {
    responder.fn = (url, init) =>
      init?.method === 'POST' && url.includes('/qa')
        ? { data: { reviewRecorded: true, reviewDetail: null } }
        : draftList;
    render(<FactoryPanel engagementId="e" />);
    await screen.findByTestId('draft-5');
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    await vi.waitFor(() => expect(requests.some((r) => r.url.includes('/qa'))).toBe(true));
    expect(screen.queryByTestId('factory-review-gap')).toBeNull();
  });
});

describe('3 · the desk reads a portal link the way the server does', () => {
  const sessions = (expiresAt: string, revokedAt: string | null = null) => ({
    data: {
      registerPresent: true,
      sessions: [{
        id: 'sess-1', label: 'founder@sable.example', mintedBy: 'nik',
        mintedAt: '2026-08-01T00:00:00.000Z', expiresAt,
        revokedAt, revokedBy: revokedAt ? 'nik' : null, lastSeenAt: null,
      }],
    },
  });

  it('shows an EXPIRED unrevoked link as expired, not live', async () => {
    responder.fn = () => sessions('2020-01-01T00:00:00.000Z');
    render(<PortalInvitePanel engagementId="e" />);
    const row = await screen.findByTestId('portal-session-sess-1');
    expect(row.textContent).toContain('expired');
    expect(row.textContent).not.toContain('live');
  });

  it('still shows a genuinely valid link as live', async () => {
    responder.fn = () => sessions('2099-01-01T00:00:00.000Z');
    render(<PortalInvitePanel engagementId="e" />);
    expect((await screen.findByTestId('portal-session-sess-1')).textContent).toContain('live');
  });

  it('a revoked link reads as revoked whatever its expiry says', async () => {
    responder.fn = () => sessions('2099-01-01T00:00:00.000Z', '2026-08-05T00:00:00.000Z');
    render(<PortalInvitePanel engagementId="e" />);
    const row = await screen.findByTestId('portal-session-sess-1');
    expect(row.textContent).toContain('revoked by nik');
    expect(row.textContent).not.toContain('expired');
  });
});
