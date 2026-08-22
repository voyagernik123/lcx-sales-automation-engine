import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { buildFounderPackets } from '@lcx/shared';

/**
 * THE PACKET INBOX, AS THE OWNER MEETS IT.
 *
 * The section's one promise: what he approves is what was shown, with its grades and its
 * caveats beside it, and the two decisions — "as proposed" vs "with these edits" — never
 * blur. The server owns validation and authority; this page renders refusals verbatim.
 * So the tests here are about TRUTHFUL PRESENTATION and WIRE HONESTY, not about rules.
 */

const requests = vi.hoisted(() => [] as Array<{ url: string; init?: { method?: string; body?: unknown } }>);
const responder = vi.hoisted(() => ({ fn: null as null | ((url: string, init?: { method?: string; body?: unknown }) => unknown) }));

class MockApiError extends Error {
  status: number; code?: string; data?: unknown;
  constructor(status: number, code: string, message: string, data?: unknown) {
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

const { GpsInputsPackets } = await import('../GpsInputsPackets');

const PACKETS = buildFounderPackets('2026-08-21T12:00:00.000Z');

const okList = (over: Partial<Record<string, unknown>> = {}) => ({
  data: {
    packets: PACKETS,
    decisions: [],
    registerPresent: true,
    registerNotice: null,
    ...over,
  },
});

beforeEach(() => {
  requests.length = 0;
  responder.fn = () => okList();
});

describe('presentation is the proposal, grades attached', () => {
  it('renders all five packets with the evidence grades and the caveats beside the claims', async () => {
    render(<GpsInputsPackets />);
    expect(await screen.findByText(/Sell-side price bands/)).toBeTruthy();
    expect(screen.getByText(/Effort triples — person-days/)).toBeTruthy();
    expect(screen.getByText(/Partner rate cards/)).toBeTruthy();
    expect(screen.getByText(/Jurisdiction perimeter — 30 proposed positions/)).toBeTruthy();
    expect(screen.getByText(/DPO decision/)).toBeTruthy();
    /* The honesty markers: C3 badges exist, and the verification caveat is on screen,
       not in a tooltip. */
    expect(screen.getAllByText('C3').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/verified against nothing/i).length).toBeGreaterThan(0);
  });

  it('states the second-human dependency on the perimeter packet — approval is not review', async () => {
    render(<GpsInputsPackets />);
    const dep = await screen.findByTestId('dependency-perimeter_seed');
    expect(dep.textContent).toMatch(/second human|review/i);
  });

  it('register ABSENT and register UNPROBEABLE render different sentences', async () => {
    responder.fn = () => okList({ registerPresent: false, registerNotice: 'Decisions cannot be recorded yet: apply 0076_gps_packets.sql. The packets below are readable and editable meanwhile.' });
    const { unmount } = render(<GpsInputsPackets />);
    expect((await screen.findByTestId('packets-register-notice')).textContent).toMatch(/0076/);
    unmount();
    responder.fn = () => okList({ registerPresent: null, registerNotice: 'The decision register could not be probed just now — decisions may exist that are not shown. Retry before treating any packet as undecided.' });
    render(<GpsInputsPackets />);
    expect((await screen.findByTestId('packets-register-notice')).textContent).toMatch(/could not be probed/);
  });
});

describe('the two decisions never blur', () => {
  it('an untouched packet posts decision "approved" with the exact built proposal', async () => {
    responder.fn = (_url, init) => {
      if (init?.method === 'POST') {
        return { data: { kind: 'price_bands', decision: 'approved', applyState: 'applied', applyDetail: '5 written.', decisions: [] } };
      }
      return okList();
    };
    render(<GpsInputsPackets />);
    await screen.findByText(/Sell-side price bands/);
    fireEvent.click(screen.getAllByRole('button', { name: /approve as proposed/i })[0]);
    const post = await vi.waitFor(() => {
      const p = requests.find((r) => r.init?.method === 'POST');
      expect(p).toBeTruthy();
      return p!;
    });
    expect(post.url).toBe('/v1/gps/packets/price_bands/decide');
    const body = post.init!.body as Record<string, any>;
    expect(body.decision).toBe('approved');
    expect(body.proposal).toEqual(JSON.parse(JSON.stringify(PACKETS[0].proposal)));
  });

  it('one edited cell flips the button label AND the wire decision to approved_with_edits', async () => {
    responder.fn = (_url, init) => {
      if (init?.method === 'POST') {
        return { data: { kind: 'price_bands', decision: 'approved_with_edits', applyState: 'applied', applyDetail: '5 written.', decisions: [] } };
      }
      return okList();
    };
    render(<GpsInputsPackets />);
    await screen.findByText(/Sell-side price bands/);
    const cell = screen.getByLabelText('diagnostic midCents') as HTMLInputElement;
    fireEvent.change(cell, { target: { value: '450000' } });
    const btn = await screen.findByRole('button', { name: /approve with these edits/i });
    fireEvent.click(btn);
    const post = await vi.waitFor(() => {
      const p = requests.find((r) => r.init?.method === 'POST');
      expect(p).toBeTruthy();
      return p!;
    });
    const body = post.init!.body as Record<string, any>;
    expect(body.decision).toBe('approved_with_edits');
    const diag = body.proposal.rows.find((r: { offerKey: string }) => r.offerKey === 'diagnostic');
    expect(diag.midCents).toBe(450000);
  });

  it('excluding a perimeter row also counts as an edit on the wire', async () => {
    responder.fn = (_url, init) => {
      if (init?.method === 'POST') {
        return { data: { kind: 'perimeter_seed', decision: 'approved_with_edits', applyState: 'applied', applyDetail: '29 entered.', decisions: [] } };
      }
      return okList();
    };
    render(<GpsInputsPackets />);
    await screen.findByText(/Jurisdiction perimeter/);
    fireEvent.click(screen.getByLabelText('include Liechtenstein|diagnostic'));
    // The perimeter card's approve button — scoped inside the perimeter packet's card.
    const card = screen.getByTestId('packet-perimeter').closest('[class*="Card"], div')!;
    const buttons = screen.getAllByRole('button', { name: /approve/i });
    // Click the one whose card contains the perimeter table.
    const target = buttons.find((b) => b.closest('div.space-y-3')?.querySelector('[data-testid="packet-perimeter"]')) ?? buttons[3];
    fireEvent.click(target);
    const post = await vi.waitFor(() => {
      const p = requests.find((r) => r.init?.method === 'POST');
      expect(p).toBeTruthy();
      return p!;
    });
    const body = post.init!.body as Record<string, any>;
    expect(body.decision).toBe('approved_with_edits');
    expect(body.proposal.rows).toHaveLength(29);
    expect(card).toBeTruthy();
  });
});

describe('refusals and outcomes arrive verbatim', () => {
  it('renders the server’s defect list word for word', async () => {
    responder.fn = (_url, init) => {
      if (init?.method === 'POST') {
        return new MockApiError(400, 'PACKET_PROPOSAL_DEFECTIVE', 'The proposal has defects and was not recorded or applied.', {
          defects: ['price band for "diagnostic" must ascend low ≤ mid ≤ high.'],
        });
      }
      return okList();
    };
    render(<GpsInputsPackets />);
    await screen.findByText(/Sell-side price bands/);
    fireEvent.click(screen.getAllByRole('button', { name: /approve as proposed/i })[0]);
    const panel = await screen.findByTestId('refusal-price_bands');
    expect(panel.textContent).toContain('PACKET_PROPOSAL_DEFECTIVE');
    expect(panel.textContent).toContain('must ascend low ≤ mid ≤ high');
  });

  it('a standing decision renders who, when, and the apply detail — including apply_failed', async () => {
    responder.fn = () => okList({
      decisions: [{
        packetKind: 'price_bands', decision: 'approved', applyState: 'apply_failed',
        applyDetail: 'gps_price_band does not exist on this environment — apply 0076_gps_packets.sql, then re-approve.',
        decidedBy: 'nik', decidedAt: '2026-08-21T14:00:00.000Z', notes: null,
      }],
    });
    render(<GpsInputsPackets />);
    const line = await screen.findByTestId('decision-price_bands');
    expect(line.textContent).toMatch(/nik/);
    expect(line.textContent).toMatch(/apply 0076/);
    expect(screen.getByText('approved · apply_failed')).toBeTruthy();
  });

  it('reject posts without a proposal and with the notes', async () => {
    responder.fn = (_url, init) => {
      if (init?.method === 'POST') {
        return { data: { kind: 'dpo_memo', decision: 'rejected', applyState: 'recorded_only', applyDetail: 'Rejected.', decisions: [] } };
      }
      return okList();
    };
    render(<GpsInputsPackets />);
    await screen.findByText(/DPO decision/);
    fireEvent.change(screen.getByLabelText('notes dpo_memo'), { target: { value: 'not yet' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^reject$/i })[4]);
    const post = await vi.waitFor(() => {
      const p = requests.find((r) => r.init?.method === 'POST');
      expect(p).toBeTruthy();
      return p!;
    });
    expect(post.url).toBe('/v1/gps/packets/dpo_memo/decide');
    const body = post.init!.body as Record<string, any>;
    expect(body.decision).toBe('rejected');
    expect(body.proposal).toBeUndefined();
    expect(body.notes).toBe('not yet');
  });
});

describe('the pricing policy packet (G3)', () => {
  it('renders both dials with the veto sentence, and an edited dial travels as approved_with_edits', async () => {
    responder.fn = (_url, init) => {
      if (init?.method === 'POST') {
        return { data: { kind: 'pricing_policy', decision: 'approved_with_edits', applyState: 'applied', applyDetail: 'appended.', decisions: [] } };
      }
      return okList();
    };
    render(<GpsInputsPackets />);
    await screen.findByText(/Pricing policy — the two dials/);
    const panel = screen.getByTestId('packet-pricing');
    // The consequence of each dial in words, and the guard's veto named beside them.
    expect(panel.textContent).toContain('45%');
    expect(panel.textContent).toContain('issue guard blocks at 20%');

    fireEvent.change(screen.getByLabelText('pricing targetMarginPct'), { target: { value: '0.5' } });
    fireEvent.click(await screen.findByRole('button', { name: /approve with these edits/i }));
    const post = await vi.waitFor(() => {
      const p = requests.find((r) => r.init?.method === 'POST');
      expect(p).toBeTruthy();
      return p!;
    });
    expect(post.url).toBe('/v1/gps/packets/pricing_policy/decide');
    const body = post.init!.body as Record<string, any>;
    expect(body.decision).toBe('approved_with_edits');
    expect(body.proposal.kind).toBe('pricing_policy');
    expect(body.proposal.policy.targetMarginPct).toBe(0.5);
    expect(body.proposal.policy.pLossCeiling).toBe(0.1);
  });
});
