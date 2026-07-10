import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LeadDetail } from '../LeadDetail';
import * as bdApi from '@/lib/api/bd';
import { useFilterStore } from '@/stores';

vi.mock('@/lib/api/bd', () => ({
  fetchLead: vi.fn(),
  approveLead: vi.fn(),
  suppressLead: vi.fn(),
  triggerRescore: vi.fn(),
  triggerEnrich: vi.fn(),
  enqueueContactDiscovery: vi.fn(),
  runDiscoveryTick: vi.fn(),
  fetchProjectTimeline: vi.fn().mockResolvedValue([]),
}));

const mockLead = {
  id: 'lead-1',
  name: 'Test Protocol',
  website: 'https://testprotocol.io',
  ticker: 'TEST',
  chain: 'Ethereum',
  source: 'esma_main',
  esmaTokenId: 'TKN001',
  dti: null,
  jurisdiction: 'DE',
  whitepaperUrl: 'https://testprotocol.io/whitepaper.pdf',
  category: 'DeFi',
  marketCap: '$10M',
  listedOnLcx: false,
  raw: {},
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  score: {
    id: 'score-1',
    projectId: 'lead-1',
    euScore: 82,
    usPreScore: 45,
    usPostScore: 70,
    band: 'high' as const,
    reasons: [
      { code: 'eu_esma_registered', factor: 'ESMA Registered', points: 20, max: 20, note: 'Token is registered with ESMA under DE jurisdiction' },
      { code: 'eu_team_vc_backed', factor: 'VC Backed Team', points: 10, max: 15, note: 'Team has VC backing but no formal KYC' },
      { code: 'us_jurisdiction', factor: 'US Jurisdiction', points: 0, max: 10, note: 'No US presence detected' },
    ],
    computedAt: '2025-01-01T00:00:00Z',
  },
  people: [
    { id: 'p1', projectId: 'lead-1', name: 'Alice Founder', title: 'CEO', role: 'founder', linkedin: 'https://linkedin.com/in/alice', email: 'alice@testprotocol.io', emailStatus: 'verified', telegram: '@alice_tg', verified: true, contactabilityScore: 85, enrichedBy: 'manual', raw: {}, createdAt: '', updatedAt: '' },
    { id: 'p2', projectId: 'lead-1', name: 'Bob Dev', title: 'CTO', role: 'other', linkedin: null, email: null, emailStatus: 'unverified', telegram: null, verified: false, contactabilityScore: 0, enrichedBy: null, raw: {}, createdAt: '', updatedAt: '' },
  ],
  signals: [
    { id: 's1', projectId: 'lead-1', kind: 'enrichment', payload: { coinId: 'test-protocol', marketCap: 10000000 }, observedAt: '2025-01-02T00:00:00Z' },
    { id: 's2', projectId: 'lead-1', kind: 'price_movement', payload: { change24h: 5.2 }, observedAt: '2025-01-03T00:00:00Z' },
  ],
  sources: [
    { id: 'src1', projectId: 'lead-1', source: 'esma_main', externalId: '42', payload: { issuer: 'Test GmbH', country: 'DE' }, createdAt: '2025-01-01T00:00:00Z' },
  ],
  deals: [],
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/bd-pipeline/lead-1']}>
      <Routes>
        <Route path="bd-pipeline/:id" element={<LeadDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LeadDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFilterStore.setState({ clarityEnacted: false });
  });

  it('renders loading state initially', () => {
    vi.mocked(bdApi.fetchLead).mockReturnValue(new Promise(() => {}));
    renderDetail();
    expect(screen.getByText('Loading lead...')).toBeDefined();
  });

  it('renders lead header and identity after load', async () => {
    vi.mocked(bdApi.fetchLead).mockResolvedValue({ data: mockLead, meta: { timestamp: '', version: '' } });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Protocol')).toBeDefined();
    });

    expect(screen.getByText('TEST')).toBeDefined();
    expect(screen.getAllByText('High').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('EU')).toBeDefined();
    expect(screen.getByText('testprotocol.io')).toBeDefined();
    expect(screen.getByText('DE')).toBeDefined();
    expect(screen.getByText('Ethereum')).toBeDefined();
    expect(screen.getByText('DeFi')).toBeDefined();
  });

  it('renders score badges', async () => {
    vi.mocked(bdApi.fetchLead).mockResolvedValue({ data: mockLead, meta: { timestamp: '', version: '' } });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('82')).toBeDefined();
    });

    const euScores = screen.getAllByText('82');
    expect(euScores.length).toBeGreaterThanOrEqual(1);
  });

  it('renders ESMA registered evidence chip', async () => {
    vi.mocked(bdApi.fetchLead).mockResolvedValue({ data: mockLead, meta: { timestamp: '', version: '' } });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('ESMA Registered')).toBeDefined();
    });
  });

  it('renders whitepaper link when present', async () => {
    vi.mocked(bdApi.fetchLead).mockResolvedValue({ data: mockLead, meta: { timestamp: '', version: '' } });
    renderDetail();

    await waitFor(() => {
      const link = screen.getByText('View Whitepaper');
      expect(link).toBeDefined();
      expect(link.closest('a')?.getAttribute('href')).toBe('https://testprotocol.io/whitepaper.pdf');
    });
  });

  it('renders people section with contacts', async () => {
    vi.mocked(bdApi.fetchLead).mockResolvedValue({ data: mockLead, meta: { timestamp: '', version: '' } });
    renderDetail();

    await waitFor(() => {
      expect(screen.getAllByText('Alice Founder').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Bob Dev').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('CEO').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('CTO').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders signals timeline', async () => {
    vi.mocked(bdApi.fetchLead).mockResolvedValue({ data: mockLead, meta: { timestamp: '', version: '' } });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('enrichment')).toBeDefined();
      expect(screen.getByText('price movement')).toBeDefined();
    });
  });

  it('renders source payloads section', async () => {
    vi.mocked(bdApi.fetchLead).mockResolvedValue({ data: mockLead, meta: { timestamp: '', version: '' } });
    renderDetail();

    await waitFor(() => {
      expect(screen.getAllByText('esma_main').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders actions bar with buttons', async () => {
    vi.mocked(bdApi.fetchLead).mockResolvedValue({ data: mockLead, meta: { timestamp: '', version: '' } });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Approve for Outreach')).toBeDefined();
      expect(screen.getByText('Mark Suppress')).toBeDefined();
      expect(screen.getByText('Force Re-score')).toBeDefined();
      expect(screen.getByText('Force Enrich')).toBeDefined();
    });
  });

  it('shows error state when fetch fails', async () => {
    vi.mocked(bdApi.fetchLead).mockRejectedValue(new Error('API error'));
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Failed to load lead')).toBeDefined();
    });
  });
});

describe('LeadDetail actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFilterStore.setState({ clarityEnacted: false });
    vi.mocked(bdApi.fetchLead).mockResolvedValue({ data: mockLead, meta: { timestamp: '', version: '' } });
  });

  it('calls approveLead on approve click', async () => {
    vi.mocked(bdApi.approveLead).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Approve for Outreach')).toBeDefined();
    });

    await user.click(screen.getByText('Approve for Outreach'));
    await waitFor(() => {
      expect(bdApi.approveLead).toHaveBeenCalledWith('lead-1');
    });
  });

  it('calls suppressLead on suppress click', async () => {
    vi.mocked(bdApi.suppressLead).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Mark Suppress')).toBeDefined();
    });

    await user.click(screen.getByText('Mark Suppress'));
    await waitFor(() => {
      expect(bdApi.suppressLead).toHaveBeenCalledWith('lead-1');
    });
  });

  it('calls triggerRescore on re-score click', async () => {
    vi.mocked(bdApi.triggerRescore).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Force Re-score')).toBeDefined();
    });

    await user.click(screen.getByText('Force Re-score'));
    await waitFor(() => {
      expect(bdApi.triggerRescore).toHaveBeenCalledWith('lead-1');
    });
  });

  it('calls triggerEnrich on enrich click', async () => {
    vi.mocked(bdApi.triggerEnrich).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Force Enrich')).toBeDefined();
    });

    await user.click(screen.getByText('Force Enrich'));
    await waitFor(() => {
      expect(bdApi.triggerEnrich).toHaveBeenCalledWith('lead-1');
    });
  });
});
