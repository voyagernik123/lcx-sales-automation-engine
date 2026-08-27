import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * The four-eyes panel, pinned on its two honest sentences: the server's
 * SELF_REVIEW_REFUSED renders verbatim (the rule teaches with the enterer's name in
 * it), and a successful review that still refuses work SAYS SO — a review is a
 * second pair of eyes, not permission.
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

const { PerimeterReviewPanel } = await import('../PerimeterReviewPanel');

const CELL = {
  id: 'row-1', jurisdiction: 'germany', jurisdictionLabel: 'Germany',
  offerKey: 'mica_whitepaper', offerName: 'MiCA White Paper',
  entry: {
    serviceClass: 'partner_required',
    source: 'System proposal, UNVERIFIED (assistant knowledge…)',
    enteredBy: 'nik', enteredAt: '2026-08-26T00:00:00.000Z',
    reviewBy: '2027-02-26T00:00:00.000Z',
    note: 'Legal opinions in DE require licensed local counsel.',
  },
  reviewedBy: null, reviewedAt: null, defects: [],
  unconditional: { allowed: false, code: 'perimeter_unreviewed' },
};

const PLACEHOLDER_CELL = { ...CELL, id: null, jurisdictionLabel: 'Placeholder-land' };

const VIEW = {
  asOf: '2026-08-26T00:00:00.000Z', source: 'database',
  sourceReason: 'Positions entered by named humans…', storedRowCount: 1,
  reviewWarningDays: 30, placeholdersAreUnreviewed: false, unreviewedReason: '',
  cells: [CELL, PLACEHOLDER_CELL], holes: [], reviewDue: [],
};

beforeEach(() => {
  requests.length = 0;
  responder.fn = () => ({ data: VIEW });
});

describe('the perimeter review panel', () => {
  it('renders ONLY stored rows with the four-eyes state, never placeholders', async () => {
    render(<PerimeterReviewPanel />);
    expect(await screen.findByTestId('perimeter-row-row-1')).toBeTruthy();
    expect(screen.getByText('unreviewed — advisory')).toBeTruthy();
    // The placeholder cell (id null) is not this panel's business.
    expect(screen.queryByText('Placeholder-land')).toBeNull();
  });

  it('the SELF_REVIEW_REFUSED sentence renders verbatim, with the enterer named', async () => {
    responder.fn = (url) =>
      url.endsWith('/review')
        ? new MockApiError('nik entered this position and may not also review it — a second qualified human must', 409, 'SELF_REVIEW_REFUSED')
        : { data: VIEW };
    render(<PerimeterReviewPanel />);
    fireEvent.click(await screen.findByTestId('perimeter-review-row-1'));
    const alert = await screen.findByTestId('perimeter-review-error');
    expect(alert.textContent).toContain('SELF_REVIEW_REFUSED');
    expect(alert.textContent).toContain('nik entered this position');
    // The URL carried the row id — the panel reviews rows, not vibes.
    expect(requests.some((r) => r.url === '/v1/gps/conflict/perimeter/row-1/review')).toBe(true);
  });

  it('a review that still refuses work SAYS SO — review is not permission', async () => {
    responder.fn = (url) =>
      url.endsWith('/review')
        ? { data: { authorisesWorkNow: false, gate: { code: 'counsel_not_named', reason: 'counsel_required refuses until an engagement names its counsel' } } }
        : { data: VIEW };
    render(<PerimeterReviewPanel />);
    fireEvent.click(await screen.findByTestId('perimeter-review-row-1'));
    const line = await screen.findByTestId('perimeter-review-outcome');
    expect(line.textContent).toContain('STILL refuses');
    expect(line.textContent).toContain('counsel');
    expect(line.textContent).toContain('not permission');
  });

  it('a review that opens the cell says that, plainly', async () => {
    responder.fn = (url) =>
      url.endsWith('/review')
        ? { data: { authorisesWorkNow: true, gate: { code: 'ok' } } }
        : { data: VIEW };
    render(<PerimeterReviewPanel />);
    fireEvent.click(await screen.findByTestId('perimeter-review-row-1'));
    expect((await screen.findByTestId('perimeter-review-outcome')).textContent).toContain('now authorises work');
  });

  it('a reviewed row shows its reviewer and offers no button', async () => {
    responder.fn = () => ({
      data: { ...VIEW, cells: [{ ...CELL, reviewedBy: 'monty', reviewedAt: '2026-09-01T00:00:00.000Z' }] },
    });
    render(<PerimeterReviewPanel />);
    expect((await screen.findByTestId('perimeter-row-row-1')).textContent).toContain('reviewed by monty');
    expect(screen.queryByTestId('perimeter-review-row-1')).toBeNull();
  });

  it('zero stored rows is a stated fact, not an empty table', async () => {
    responder.fn = () => ({ data: { ...VIEW, storedRowCount: 0, cells: [PLACEHOLDER_CELL] } });
    render(<PerimeterReviewPanel />);
    expect((await screen.findByTestId('perimeter-review-intro')).textContent).toContain('No human-entered positions');
  });
});
