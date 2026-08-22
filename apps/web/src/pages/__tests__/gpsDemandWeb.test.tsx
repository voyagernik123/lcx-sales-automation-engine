import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * THE DEMAND PANEL AND THE PUBLIC FORM, AS THEIR READERS MEET THEM.
 *
 * The panel's promises: sources and grades visible, reasons verbatim, refusal requires a
 * typed reason, and the Telegram import renders the SIEVE'S OWN REPORT — the minimisation
 * is a table row, not a claim in a docstring. The public form's promises: the data-use
 * sentence is beside the button, the honeypot is in the DOM but out of the tab ring, and
 * the wire carries auth:false with the six known fields.
 */

const requests = vi.hoisted(() => [] as Array<{ url: string; init?: { method?: string; body?: unknown; auth?: boolean } }>);
const responder = vi.hoisted(() => ({ fn: null as null | ((url: string, init?: { method?: string; body?: unknown }) => unknown) }));

class MockApiError extends Error {
  status: number; code?: string; data?: unknown;
  constructor(message: string, status: number, code?: string, data?: unknown) {
    super(message); this.status = status; this.code = code; this.data = data;
  }
}

vi.mock('@/lib/apiClient', () => ({
  ApiError: MockApiError,
  request: async (url: string, init?: { method?: string; body?: unknown; auth?: boolean }) => {
    requests.push({ url, init });
    const out = responder.fn?.(url, init);
    if (out instanceof MockApiError) throw out;
    return out;
  },
}));

const { GpsOriginationDemand } = await import('../GpsOriginationDemand');
const { LaunchServices } = await import('../LaunchServices');

const ROW = {
  id: 7, source: 'telegram_import', projectName: 'sableprotocol', url: 't.me/sableprotocol',
  jurisdiction: null, offerHypothesis: 'mica_whitepaper',
  reason: 'Telegram signal in "Launch Alpha Group": matched a t.me handle beside "MiCA".',
  snippet: 'preparing our MiCA white paper ahead of the EU listing',
  provenanceGrade: 'C3', status: 'proposed', refusalReason: null, promotedTargetId: null,
  createdAt: '2026-08-21T15:00:00.000Z',
};

const queue = (over: Partial<Record<string, unknown>> = {}) => ({
  data: { candidates: [ROW], registerPresent: true, ...over },
});

beforeEach(() => {
  requests.length = 0;
  responder.fn = () => queue();
});

describe('the demand panel', () => {
  it('renders source, grade, verbatim reason and the minimised snippet', async () => {
    render(<GpsOriginationDemand />);
    expect(await screen.findByText('sableprotocol')).toBeTruthy();
    expect(screen.getByText('telegram')).toBeTruthy();
    expect(screen.getByText('C3')).toBeTruthy();
    expect(screen.getByText(/matched a t\.me handle beside/)).toBeTruthy();
    expect(screen.getByText(/preparing our MiCA white paper/)).toBeTruthy();
  });

  it('refusal demands a typed reason before the record button arms', async () => {
    render(<GpsOriginationDemand />);
    await screen.findByText('sableprotocol');
    fireEvent.click(screen.getByRole('button', { name: /refuse…/i }));
    const record = screen.getByRole('button', { name: /record refusal/i });
    expect(record).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('refusal reason 7'), { target: { value: 'shill account, no team' } });
    expect(screen.getByRole('button', { name: /record refusal/i })).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('button', { name: /record refusal/i }));
    const post = await vi.waitFor(() => {
      const p = requests.find((r) => r.url === '/v1/gps/demand/7/refuse');
      expect(p).toBeTruthy();
      return p!;
    });
    expect((post.init!.body as { reason: string }).reason).toBe('shill account, no team');
  });

  it('promote posts to the right row and reports the action error verbatim on refusal', async () => {
    responder.fn = (url) =>
      url === '/v1/gps/demand/7/promote'
        ? new MockApiError('candidate 7 is already promoted — a decision is not re-decided by promoting over it.', 409, 'ALREADY_DECIDED')
        : queue();
    render(<GpsOriginationDemand />);
    await screen.findByText('sableprotocol');
    fireEvent.click(screen.getByRole('button', { name: /^promote$/i }));
    const alert = await screen.findByTestId('demand-action-error');
    expect(alert.textContent).toContain('ALREADY_DECIDED');
    expect(alert.textContent).toContain('not re-decided');
  });

  it('renders the sieve’s report after an import — the minimisation as numbers, on screen', async () => {
    responder.fn = (url) =>
      url === '/v1/gps/demand/telegram'
        ? { data: { inserted: 2, duplicates: 1, refusedByValidator: 0, validatorDefects: [], report: { chatName: 'G', messagesSeen: 40, messagesMatched: 3, sendersSeenAndDropped: 40, snippetsKept: 3, unparseableEntries: 0 } } }
        : queue();
    render(<GpsOriginationDemand />);
    await screen.findByText('sableprotocol');
    const file = new File([JSON.stringify({ name: 'G', messages: [] })], 'result.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('telegram export file'), { target: { files: [file] } });
    const report = await screen.findByTestId('telegram-report');
    expect(report.textContent).toContain('40 message(s) seen');
    expect(report.textContent).toContain('40 sender identit(ies) — none stored');
    expect(report.textContent).toContain('2 new candidate(s)');
  });

  it('says the true sentence when the register is absent, and a DIFFERENT one when unprobeable', async () => {
    responder.fn = () => queue({ candidates: [], registerPresent: false });
    const { unmount } = render(<GpsOriginationDemand />);
    expect((await screen.findByTestId('demand-register-absent')).textContent).toContain('0077_gps_demand.sql');
    unmount();
    responder.fn = () => queue({ candidates: [], registerPresent: null });
    render(<GpsOriginationDemand />);
    expect(await screen.findByText(/could not be probed/)).toBeTruthy();
  });
});

describe('the public services form', () => {
  it('sends auth:false with exactly the six fields, and shows the received state', async () => {
    responder.fn = (url) => (url === '/v1/services/intake' ? { received: true } : queue());
    render(<LaunchServices />);
    fireEvent.change(screen.getByLabelText('project name'), { target: { value: 'Sable Protocol' } });
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'founder@sable.example' } });
    fireEvent.change(screen.getByLabelText('message'), { target: { value: 'Need a MiCA paper.' } });
    fireEvent.click(screen.getByRole('button', { name: /start the conversation/i }));
    expect(await screen.findByTestId('intake-received')).toBeTruthy();
    const post = requests.find((r) => r.url === '/v1/services/intake')!;
    expect(post.init!.auth).toBe(false);
    expect(Object.keys(post.init!.body as object).sort()).toEqual(
      ['email', 'jurisdiction', 'message', 'offerInterest', 'projectName', 'url', 'website'].sort(),
    );
  });

  it('labels every range indicative and never prints a bare price as THE price', () => {
    render(<LaunchServices />);
    const section = screen.getByTestId('launch-services');
    expect(section.textContent).toContain('indicative');
    expect(section.textContent).toContain('priced individually');
  });

  it('keeps the honeypot out of the tab ring and off the visible page', () => {
    render(<LaunchServices />);
    const trap = screen.getByPlaceholderText('website');
    expect(trap.getAttribute('tabindex')).toBe('-1');
    expect(trap.getAttribute('aria-hidden')).toBe('true');
  });

  it('states what happens to the email, beside the button', () => {
    render(<LaunchServices />);
    expect(screen.getByText(/collected to respond to this request/)).toBeTruthy();
  });
});
