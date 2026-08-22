import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * THE FACTORY PANEL, AS THE DESK MEETS IT. Pinned: the slot board shows every
 * input's state and calls the gap list the CHASE LIST out loud; a D10 refusal from
 * the server renders the missing sentences verbatim; rework demands a typed note
 * before it arms; a QA acceptance posts to the right draft; and the handover
 * packet is a read with no send affordance.
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

const { FactoryPanel } = await import('../../components/gps/FactoryPanel');

const SLOT = (label: string, filled: boolean, required = true) => ({
  key: `client:${label}`, label, source: 'client_fact', required, filled,
});

const DATA = {
  registerPresent: true,
  slotState: {
    draftTitle: 'MiCA white paper — first draft (Annex structure)',
    sections: ['## PART A — THE ISSUER'],
    slots: [SLOT('Tokenomics workbook: supply, allocations, unlocks, treasury policy.', true), SLOT('Corporate and issuer details.', false)],
    gaps: [SLOT('Corporate and issuer details.', false)],
  },
  drafts: [{
    id: 31, deliverableId: 'del-1', version: 2, status: 'draft',
    draftText: '## PART A — THE ISSUER\n[FACT REQUIRED: registered entity]',
    model: 'openrouter', slotsFilled: 6, generatedBy: 'nik',
    generatedAt: '2026-08-22T15:00:00.000Z', decidedBy: null, decidedAt: null, decisionNote: null,
  }],
  actuals: [{ id: 41, stage: 'ai_draft', hours: 0.5, costCents: 0, note: null, recordedBy: 'nik', recordedAt: '2026-08-22T15:30:00.000Z' }],
  handover: {
    engagement: { clientName: 'Sable Protocol', offerKey: 'mica_whitepaper', status: 'in_delivery', deadlineIso: null },
    facts: [{ label: 'Tokenomics workbook: supply, allocations, unlocks, treasury policy.', value: 'Fixed supply.' }],
    latestAcceptedDraft: null,
    rateCardNote: 'No live partner rate card is attached: the bench is empty by decision D5.',
  },
};

beforeEach(() => {
  requests.length = 0;
  responder.fn = () => ({ data: DATA });
});

describe('the factory panel', () => {
  it('renders the slot board with the chase-list sentence and the draft with its markers', async () => {
    render(<FactoryPanel engagementId="eng-1" />);
    const slots = await screen.findByTestId('factory-slots');
    expect(slots.textContent).toContain('1/2');
    expect(screen.getByTestId('factory-chase-list').textContent).toContain('chase list');
    expect(screen.getByTestId('draft-text-31').textContent).toContain('[FACT REQUIRED: registered entity]');
    expect(screen.getByTestId('factory-actuals').textContent).toContain('ai_draft: 0.5h');
  });

  it('a D10 refusal renders the missing sentences verbatim', async () => {
    responder.fn = (url, init) =>
      init?.method === 'POST' && url.endsWith('/draft')
        ? new MockApiError('refuses to run ahead of the client', 409, 'SLOTS_MISSING', {
            gaps: [{ label: 'Corporate and issuer details.' }],
          })
        : { data: DATA };
    render(<FactoryPanel engagementId="eng-1" />);
    await screen.findByTestId('factory-slots');
    fireEvent.click(screen.getByRole('button', { name: /generate draft/i }));
    const refusal = await screen.findByTestId('factory-refusal');
    expect(refusal.textContent).toContain('D10');
    expect(refusal.textContent).toContain('Corporate and issuer details.');
  });

  it('QA accept posts to the draft; rework demands its note before arming', async () => {
    render(<FactoryPanel engagementId="eng-1" />);
    await screen.findByTestId('draft-31');
    fireEvent.click(screen.getByRole('button', { name: /rework…/i }));
    const record = screen.getByRole('button', { name: /record rework/i });
    expect(record).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('rework note 31'), { target: { value: 'Part F is thin' } });
    fireEvent.click(screen.getByRole('button', { name: /record rework/i }));
    const post = await vi.waitFor(() => {
      const p = requests.find((r) => r.url === '/v1/gps/factory/drafts/31/qa');
      expect(p).toBeTruthy();
      return p!;
    });
    expect(post.init!.body).toEqual({ decision: 'rework', note: 'Part F is thin' });
  });

  it('the handover packet is a read: rate-card honesty shown, no send control anywhere', async () => {
    render(<FactoryPanel engagementId="eng-1" />);
    await screen.findByTestId('handover-toggle');
    fireEvent.click(screen.getByTestId('handover-toggle'));
    const packet = await screen.findByTestId('handover-packet');
    expect(packet.textContent).toContain('bench is empty by decision D5');
    expect(packet.textContent).toContain('a handover without one is a scope, not a package');
    for (const b of screen.getAllByRole('button')) {
      expect(b.textContent ?? '').not.toMatch(/send/i);
    }
  });

  it('says the true sentence when 0081 is absent and keeps the slot board readable', async () => {
    responder.fn = () => ({ data: { ...DATA, registerPresent: false, drafts: [], actuals: [], handover: null } });
    render(<FactoryPanel engagementId="eng-1" />);
    expect((await screen.findByTestId('factory-register-absent')).textContent).toContain('0081_gps_factory.sql');
    expect(screen.getByTestId('factory-slots')).toBeTruthy();
    expect(screen.getByRole('button', { name: /generate draft/i })).toHaveProperty('disabled', true);
  });
});
