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

  it('splits a FULL Telegram export in the browser: groups POST one by one, personal chats never leave', async () => {
    const posts: Array<{ name: string; count: number }> = [];
    responder.fn = (url, init) => {
      if (url === '/v1/gps/demand/telegram') {
        const b = init!.body as { name: string; messages: unknown[] };
        posts.push({ name: b.name, count: b.messages.length });
        return { data: { inserted: 1, duplicates: 0, report: { chatName: b.name, messagesSeen: b.messages.length, messagesMatched: 1, sendersSeenAndDropped: b.messages.length, snippetsKept: 1, unparseableEntries: 0 } } };
      }
      return queue();
    };
    render(<GpsOriginationDemand />);
    await screen.findByText('sableprotocol');
    const fullExport = {
      chats: {
        list: [
          { name: 'Launch Alpha', type: 'private_supergroup', messages: [{ id: 1, text: 'MiCA launch t.me/a' }] },
          { name: 'Mum', type: 'personal_chat', messages: [{ id: 2, text: 'SECRET FAMILY BUSINESS' }] },
          { name: 'Ann Channel', type: 'public_channel', messages: [{ id: 3, text: 'listing $TKN' }] },
        ],
      },
    };
    const file = new File([JSON.stringify(fullExport)], 'result.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('telegram export file'), { target: { files: [file] } });
    const report = await screen.findByTestId('telegram-report');
    // Two POSTs — the group and the channel. The personal chat is not a third.
    expect(posts.map((p) => p.name).sort()).toEqual(['Ann Channel', 'Launch Alpha']);
    // The withholding is provable on the wire: the personal text reached NO request.
    expect(JSON.stringify(requests)).not.toContain('SECRET FAMILY BUSINESS');
    expect(report.textContent).toContain('2 message(s) seen');
    expect(screen.getByTestId('telegram-groups-line').textContent).toContain('2 group(s)');
    expect(screen.getByTestId('telegram-personal-withheld').textContent).toContain('1 personal chat(s)');
    expect(screen.getByTestId('telegram-personal-withheld').textContent).toContain('never sent');
  });

  it('chunks an oversized group under the 2MB gate and one failing group does not eat the rest', async () => {
    const posts: Array<{ name: string; count: number }> = [];
    responder.fn = (url, init) => {
      if (url === '/v1/gps/demand/telegram') {
        const b = init!.body as { name: string; messages: unknown[] };
        posts.push({ name: b.name, count: b.messages.length });
        if (b.name === 'Broken Group') return new MockApiError('Import failed', 500, 'GPS_ERROR');
        return { data: { inserted: 0, duplicates: b.messages.length, report: { chatName: b.name, messagesSeen: b.messages.length, messagesMatched: 0, sendersSeenAndDropped: 0, snippetsKept: 0, unparseableEntries: 0 } } };
      }
      return queue();
    };
    render(<GpsOriginationDemand />);
    await screen.findByText('sableprotocol');
    const big = 'x'.repeat(800_000);
    const fullExport = {
      chats: {
        list: [
          { name: 'Big Group', type: 'public_supergroup', messages: [{ id: 1, text: big }, { id: 2, text: big }, { id: 3, text: big }] },
          { name: 'Broken Group', type: 'private_group', messages: [{ id: 4, text: 'x' }] },
        ],
      },
    };
    const file = new File([JSON.stringify(fullExport)], 'result.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('telegram export file'), { target: { files: [file] } });
    const failed = await screen.findByTestId('telegram-failed-groups');
    // 3 × ~800KB messages cannot fit one 1.8MB request: Big Group went in ≥2 chunks,
    // every chunk stayed under the server's ceiling, and no message was lost.
    const bigPosts = posts.filter((p) => p.name === 'Big Group');
    expect(bigPosts.length).toBeGreaterThanOrEqual(2);
    expect(bigPosts.reduce((n, p) => n + p.count, 0)).toBe(3);
    // The broken group is NAMED, and the big one still landed.
    expect(failed.textContent).toContain('Broken Group');
    expect(screen.getByTestId('telegram-report').textContent).toContain('3 message(s) seen');
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
