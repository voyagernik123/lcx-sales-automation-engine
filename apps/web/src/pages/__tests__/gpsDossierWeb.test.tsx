import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

/**
 * THE DOSSIER DRAWER, AS ITS READER MEETS IT. What is pinned here is the surface's
 * honesty, not its plumbing: citations render as stored, a failed generation shows
 * its defect bill AND the rejected text, rejection demands a typed reason before it
 * arms, the gate verdict travels with every outreach draft, and — the one-mouth rule
 * as a DOM assertion — there is no send button anywhere in the drawer.
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

const { GpsTargetDossierDrawer } = await import('../GpsTargetDossier');

const DOSSIER = {
  id: 11, targetId: 'tgt-1', offerKey: 'mica_whitepaper', status: 'draft',
  dossierMd: '## WHAT THE REGISTER SHOWS\n- Sable is a German target. [F1, F2]\n## WHAT THE MODEL ADDS (UNVERIFIED, C3)\nEverything below this line is model knowledge…',
  model: 'openrouter', factRefsCited: 2, generatedBy: 'nik',
  generatedAt: '2026-08-22T09:00:00.000Z', decidedBy: null, decidedAt: null, decisionNote: null,
};

const DRAFT = {
  id: 21, targetId: 'tgt-1', dossierId: 11, channel: 'email',
  draftText: 'Honest note from the LCX services desk.', model: 'openrouter',
  gateAllowed: false, gateDisposition: 'blocked', gateRefusalCodes: 'ART_90_SCOPED',
  gateReference: 'gateref99', createdBy: 'nik', createdAt: '2026-08-22T09:30:00.000Z',
};

const envelope = (over: Partial<Record<string, unknown>> = {}) => ({
  data: { dossiers: [DOSSIER], outreachDrafts: [DRAFT], registerPresent: true, ...over },
});

beforeEach(() => {
  requests.length = 0;
  responder.fn = () => envelope();
});

describe('the dossier drawer', () => {
  it('renders the dossier as stored — citations, count, provenance — and the gate verdict beside the draft', async () => {
    render(<GpsTargetDossierDrawer targetId="tgt-1" onClose={() => {}} />);
    const text = await screen.findByTestId('dossier-text-11');
    expect(text.textContent).toContain('[F1, F2]');
    expect(text.textContent).toContain('UNVERIFIED, C3');
    expect(screen.getByText(/cites 2 register fact\(s\)/)).toBeTruthy();
    const verdict = screen.getByTestId('outreach-verdict-21');
    expect(verdict.textContent).toContain('ART_90_SCOPED');
    expect(verdict.textContent).toContain('gateref99');
    expect(screen.getByText('gate: refused')).toBeTruthy();
  });

  it('has NO send button — the one-mouth rule as a DOM fact', async () => {
    render(<GpsTargetDossierDrawer targetId="tgt-1" onClose={() => {}} />);
    await screen.findByTestId('dossier-text-11');
    const drawer = screen.getByTestId('dossier-drawer');
    for (const b of within(drawer).getAllByRole('button')) {
      expect(b.textContent ?? '').not.toMatch(/send/i);
    }
    expect(screen.getByTestId('one-mouth-note').textContent).toContain('no send button');
  });

  it('generate posts the targetId; a 422 renders the defect bill and the rejected text', async () => {
    responder.fn = (url) =>
      url === '/v1/gps/dossiers/generate'
        ? new MockApiError('failed the citation contract', 422, 'DOSSIER_INVALID', {
            defects: [
              { code: 'UNCITED_REGISTER_LINE', detail: 'Uncited register claim: "raised $40M"' },
              { code: 'MISSING_MODEL_CAVEAT', detail: 'The caveat is missing.' },
            ],
            rejectedText: 'A confident essay.',
          })
        : envelope();
    render(<GpsTargetDossierDrawer targetId="tgt-1" onClose={() => {}} />);
    await screen.findByTestId('dossier-text-11');
    fireEvent.click(screen.getByRole('button', { name: /generate dossier/i }));
    const panel = await screen.findByTestId('generation-rejected');
    expect(panel.textContent).toContain('nothing was stored');
    expect(screen.getAllByTestId('generation-defect')).toHaveLength(2);
    expect(panel.textContent).toContain('UNCITED_REGISTER_LINE');
    expect(panel.textContent).toContain('A confident essay.');
    const post = requests.find((r) => r.url === '/v1/gps/dossiers/generate')!;
    expect((post.init!.body as { targetId: string }).targetId).toBe('tgt-1');
  });

  it('acceptance is one click with a name behind it; rejection demands a typed reason first', async () => {
    render(<GpsTargetDossierDrawer targetId="tgt-1" onClose={() => {}} />);
    await screen.findByTestId('dossier-text-11');
    fireEvent.click(screen.getByRole('button', { name: /reject…/i }));
    const record = screen.getByRole('button', { name: /record rejection/i });
    expect(record).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('rejection note 11'), { target: { value: 'reads as marketing' } });
    fireEvent.click(screen.getByRole('button', { name: /record rejection/i }));
    const post = await vi.waitFor(() => {
      const p = requests.find((r) => r.url === '/v1/gps/dossiers/11/decide');
      expect(p).toBeTruthy();
      return p!;
    });
    expect(post.init!.body).toEqual({ decision: 'rejected', note: 'reads as marketing' });
  });

  it('outreach posts the chosen channel and surfaces an AI refusal verbatim', async () => {
    responder.fn = (url) =>
      url === '/v1/gps/dossiers/outreach'
        ? new MockApiError('No AI provider is configured.', 503, 'AI_NO_PROVIDER')
        : envelope();
    render(<GpsTargetDossierDrawer targetId="tgt-1" onClose={() => {}} />);
    await screen.findByTestId('dossier-text-11');
    fireEvent.change(screen.getByLabelText('outreach channel'), { target: { value: 'linkedin' } });
    fireEvent.click(screen.getByRole('button', { name: /draft outreach/i }));
    const alert = await screen.findByTestId('dossier-action-error');
    expect(alert.textContent).toContain('AI_NO_PROVIDER');
    const post = requests.find((r) => r.url === '/v1/gps/dossiers/outreach')!;
    expect(post.init!.body).toEqual({ targetId: 'tgt-1', channel: 'linkedin' });
  });

  it('says the true sentence when 0078 is absent, and a DIFFERENT one when unprobeable', async () => {
    responder.fn = () => envelope({ dossiers: [], outreachDrafts: [], registerPresent: false });
    const { unmount } = render(<GpsTargetDossierDrawer targetId="tgt-1" onClose={() => {}} />);
    expect((await screen.findByTestId('dossier-register-absent')).textContent).toContain('0078_gps_dossier.sql');
    unmount();
    responder.fn = () => envelope({ dossiers: [], outreachDrafts: [], registerPresent: null });
    render(<GpsTargetDossierDrawer targetId="tgt-1" onClose={() => {}} />);
    expect(await screen.findByText(/could not be probed/)).toBeTruthy();
  });
});
