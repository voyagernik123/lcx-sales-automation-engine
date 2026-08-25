import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

/**
 * THE PORTAL, AS THE CLIENT MEETS IT — and the invite panel, as the desk does.
 *
 * The client-side promises pinned here: the token is read from the HASH and
 * stripped from the address bar before anything else happens; every request rides
 * an Authorization header with auth:false (never the desk credential); milestone
 * honesty survives the trip (blocked shows its reason, the page renders no percent
 * and no staffing name); the upload section prints the gate's own sentence and
 * offers no upload control; and a dead link renders its exact refusal.
 *
 * The desk-side promise: the minted URL renders inside a copy-it-now block that
 * says it will not be shown again, and revocation posts to the right session.
 */

const requests = vi.hoisted(() => [] as Array<{ url: string; init?: { method?: string; body?: unknown; auth?: boolean; headers?: Record<string, string> } }>);
const responder = vi.hoisted(() => ({ fn: null as null | ((url: string, init?: { method?: string; body?: unknown }) => unknown) }));

class MockApiError extends Error {
  status: number; code?: string; data?: unknown;
  constructor(message: string, status: number, code?: string, data?: unknown) {
    super(message); this.status = status; this.code = code; this.data = data;
  }
}

vi.mock('@/lib/apiClient', () => ({
  ApiError: MockApiError,
  request: async (url: string, init?: { method?: string; body?: unknown; auth?: boolean; headers?: Record<string, string> }) => {
    requests.push({ url, init });
    const out = responder.fn?.(url, init);
    if (out instanceof MockApiError) throw out;
    return out;
  },
}));

const { Portal } = await import('../Portal');
const { PortalInvitePanel } = await import('../../components/gps/PortalInvitePanel');

const TOKEN = 'a'.repeat(64);

const VIEW = {
  engagement: {
    id: 'eng-1', clientName: 'Sable Protocol', offerKey: 'mica_whitepaper',
    offerName: 'MiCA White Paper — Drafting & Submission', status: 'in_delivery',
    priceCents: 2_500_000, currency: 'USD', depositRequiredCents: 500_000, depositPaidAt: null,
    exclusions: ['No legal advice'],
    requiredClientInputs: ['Tokenomics workbook: supply, allocations, unlocks, treasury policy.'],
  },
  milestones: [{
    id: 'm1', ordinal: 0, name: 'Draft delivered', status: 'blocked',
    dueBy: null, completedAt: null, blockedReason: 'waiting on tokenomics from the client CFO',
  }],
  deliverables: [{
    id: 'del-1', name: 'Submission draft', status: 'in_review',
    reviewRequired: true, reviewedAt: null, acceptedAt: null,
  }],
  facts: [],
  uploadGate: {
    state: 'undecided',
    detail: 'The DPO decision (dpo_memo packet, G0) has not been approved. Until a named human decides the controller/processor question, this system refuses to hold client files.',
  },
  sessionLabel: 'founder@sable.example',
  sessionExpiresAt: '2026-09-05T00:00:00.000Z',
};

beforeEach(() => {
  requests.length = 0;
  responder.fn = () => ({ data: VIEW });
  window.history.replaceState(null, '', '/portal');
});

describe('the client portal', () => {
  it('reads the token from the hash, STRIPS it from the address bar, and sends it as a bearer', async () => {
    window.history.replaceState(null, '', `/portal#t=${TOKEN}`);
    render(<Portal />);
    expect(await screen.findByTestId('portal-engagement')).toBeTruthy();
    // The credential is gone from the URL the instant the page exists.
    expect(window.location.hash).toBe('');
    const req = requests.find((r) => r.url === '/v1/portal/engagement')!;
    expect(req.init!.auth).toBe(false);
    expect(req.init!.headers!.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('renders honest milestone states — the blocked reason, no percent, no staffing name', async () => {
    window.history.replaceState(null, '', `/portal#t=${TOKEN}`);
    render(<Portal />);
    const milestones = await screen.findByTestId('portal-milestones');
    expect(milestones.textContent).toContain('blocked');
    expect(milestones.textContent).toContain('waiting on tokenomics');
    expect(document.body.textContent).not.toMatch(/%|percent/i);
  });

  it('prints the upload gate’s own sentence and offers NO upload control', async () => {
    window.history.replaceState(null, '', `/portal#t=${TOKEN}`);
    render(<Portal />);
    const upload = await screen.findByTestId('portal-upload');
    expect(within(upload).getByTestId('portal-upload-gate').textContent).toContain('refuses to hold client files');
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(within(upload).queryByRole('button', { name: /upload/i })).toBeNull();
  });

  it('acceptance posts to the deliverable and a desk refusal renders verbatim', async () => {
    responder.fn = (url) =>
      url === '/v1/portal/deliverables/del-1/accept'
        ? new MockApiError('Acceptance refused (review_pending): the review gate has not run.', 409, 'acceptance_refused')
        : { data: VIEW };
    window.history.replaceState(null, '', `/portal#t=${TOKEN}`);
    render(<Portal />);
    fireEvent.click(await screen.findByTestId('portal-accept-del-1'));
    const alert = await screen.findByTestId('portal-action-error');
    expect(alert.textContent).toContain('review gate');
  });

  it('submits facts under the keys the desk asked for', async () => {
    window.history.replaceState(null, '', `/portal#t=${TOKEN}`);
    render(<Portal />);
    const key = VIEW.engagement.requiredClientInputs[0];
    fireEvent.change(await screen.findByLabelText(key), { target: { value: 'Fixed supply of 100M.' } });
    fireEvent.click(screen.getByRole('button', { name: /send answers/i }));
    await screen.findByTestId('portal-facts-saved');
    const post = requests.find((r) => r.url === '/v1/portal/facts')!;
    expect(post.init!.body).toEqual({ facts: [{ factKey: key, factValue: 'Fixed supply of 100M.' }] });
  });

  it('prints the proposal on demand, with every interactive control off the paper', async () => {
    window.history.replaceState(null, '', `/portal#t=${TOKEN}`);
    render(<Portal />);
    await screen.findByTestId('portal-engagement');
    // The affordance G4 asked for: the printable proposal, on screen.
    const printBtn = screen.getByTestId('portal-print');
    const called: number[] = [];
    const original = window.print;
    window.print = () => { called.push(1); };
    try {
      fireEvent.click(printBtn);
      expect(called).toHaveLength(1);
    } finally {
      window.print = original;
    }
    // The print stylesheet exists and every interactive control opts out of paper:
    // the button itself, the accept control, the facts inputs and the upload section.
    expect(document.querySelector('style')?.textContent).toContain('.portal-no-print');
    expect(printBtn.className).toContain('portal-no-print');
    expect(screen.getByTestId('portal-accept-del-1').className).toContain('portal-no-print');
    expect(screen.getByTestId('portal-upload').className).toContain('portal-no-print');
  });

  it('a dead link renders its own sentence; a bare visit renders the no-token one', async () => {
    responder.fn = () => new MockApiError('This link has expired. Ask the desk for a fresh invite — nothing you submitted is lost.', 401, 'SESSION_EXPIRED');
    window.history.replaceState(null, '', `/portal#t=${TOKEN}`);
    const { unmount } = render(<Portal />);
    expect((await screen.findByTestId('portal-session-error')).textContent).toContain('expired');
    unmount();
    window.history.replaceState(null, '', '/portal');
    render(<Portal />);
    expect(screen.getByTestId('portal-no-token').textContent).toContain('invitation link');
  });
});

describe('the invite panel', () => {
  const SESSIONS = {
    data: {
      sessions: [{
        id: 'sess-1', label: 'founder@sable.example', mintedBy: 'nik',
        mintedAt: '2026-08-22T00:00:00.000Z', expiresAt: '2026-09-05T00:00:00.000Z',
        revokedAt: null, revokedBy: null, lastSeenAt: null,
      }],
      registerPresent: true,
    },
  };

  it('mints with a label and renders the one-time URL with the never-again sentence', async () => {
    responder.fn = (_url, init) =>
      init?.method === 'POST'
        ? { data: { url: `/portal#t=${TOKEN}`, expiresAt: '2026-09-05T00:00:00.000Z', shownOnce: true } }
        : SESSIONS;
    render(<PortalInvitePanel engagementId="eng-1" />);
    await screen.findByTestId('portal-session-sess-1');
    fireEvent.change(screen.getByLabelText('invite label'), { target: { value: 'founder@sable.example' } });
    fireEvent.click(screen.getByRole('button', { name: /mint portal link/i }));
    const block = await screen.findByTestId('portal-minted');
    expect(block.textContent).toContain('will not be shown again');
    expect(screen.getByTestId('portal-minted-url').textContent).toContain(`/portal#t=${TOKEN}`);
    const post = requests.find((r) => r.url.endsWith('/invite'))!;
    expect((post.init!.body as { label: string }).label).toBe('founder@sable.example');
  });

  it('revokes the named session', async () => {
    responder.fn = (_url, init) =>
      init?.method === 'POST' ? { data: { revoked: true } } : SESSIONS;
    render(<PortalInvitePanel engagementId="eng-1" />);
    await screen.findByTestId('portal-session-sess-1');
    fireEvent.click(screen.getByRole('button', { name: /revoke/i }));
    await vi.waitFor(() => {
      expect(requests.some((r) => r.url === '/v1/gps/portal-admin/sessions/sess-1/revoke')).toBe(true);
    });
  });

  it('says the true sentence when 0080 is absent and disables minting', async () => {
    responder.fn = () => ({ data: { sessions: [], registerPresent: false } });
    render(<PortalInvitePanel engagementId="eng-1" />);
    expect((await screen.findByTestId('portal-admin-register-absent')).textContent).toContain('0080_gps_portal.sql');
    expect(screen.getByRole('button', { name: /mint portal link/i })).toHaveProperty('disabled', true);
  });
});
