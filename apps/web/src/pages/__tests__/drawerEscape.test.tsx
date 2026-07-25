import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccessControl } from '../AccessControl';
import { DistributionCampaigns } from '../DistributionCampaigns';
import { useOperatorStore } from '@/stores';
import { _resetDismiss, dismissStack, topTraps } from '@/lib/dismiss';
import * as accessApi from '@/lib/api/access';
import * as distApi from '@/lib/api/distribution';

/**
 * Escape on the two drawers that were never on the stack (P7 ledger T1 #15).
 *
 * `lib/__tests__/dismissRegistration.test.ts` is the completeness ratchet — it enumerates,
 * so the NEXT overlay is caught too. It is also a static scan, and a static scan cannot
 * tell `useDismissible(open, …)` from `useDismissible(false, …)`: it would pass on a
 * registration wired to the wrong flag. These two tests press the key on the rendered page
 * and watch the drawer go, which is the only claim that matters to the operator.
 *
 * Both drawers looked modal — backdrop, `role="dialog"`, close button — and Escape did
 * nothing on either. The mouse was the only way out, and the `?` manual, which reads the
 * stack and reports it as fact, could not name them.
 */

vi.mock('@/lib/api/access', () => ({
  fetchAccessRequests: vi.fn(),
  fetchAccessMatrix: vi.fn(),
  fetchAccessActivity: vi.fn(),
  fetchMemberDossier: vi.fn(),
  decideAccessRequest: vi.fn(),
  grantEntitlement: vi.fn(),
  revokeEntitlement: vi.fn(),
  setMemberProfile: vi.fn(),
}));

vi.mock('@/lib/api/distribution', () => ({
  fetchDistCampaigns: vi.fn(),
  createCampaign: vi.fn(),
  setCampaignStatus: vi.fn(),
  runEmission: vi.fn(),
  runQuestCac: vi.fn(),
  fetchDistributionDeep: vi.fn(),
  fetchCampaignReviews: vi.fn(),
  fileCampaignReview: vi.fn(),
  exportCampaign: vi.fn(),
}));

beforeEach(() => {
  _resetDismiss();
});

afterEach(() => {
  _resetDismiss();
  vi.restoreAllMocks();
});

describe('the Access Control member dossier', () => {
  beforeEach(() => {
    // The matrix and the dossier button are approver-only.
    useOperatorStore.setState({
      operator: { id: 'nik', name: 'Nik', email: 'nik@lcx.com', initials: 'N', colorVar: 'var(--chart-1)', role: 'approver' },
    });
    vi.mocked(accessApi.fetchAccessRequests).mockResolvedValue([]);
    vi.mocked(accessApi.fetchAccessActivity).mockResolvedValue([]);
    vi.mocked(accessApi.fetchAccessMatrix).mockResolvedValue({
      dbLive: true,
      members: [{ id: 'm1', name: 'Sam Probe', email: 's@lcx.com', role: 'operator', entitlements: [], profile: null } as never],
    });
    vi.mocked(accessApi.fetchMemberDossier).mockResolvedValue({
      member: { id: 'm1', name: 'Sam Probe', email: 's@lcx.com', role: 'operator' },
      profile: null,
      entitlements: [],
      activity: [],
      dbLive: true,
    });
  });

  async function openDossier() {
    render(<AccessControl />);
    // Explicit timeouts throughout: the default is 1000ms, and this file renders two whole
    // pages. A test that passes or fails on how loaded the machine is teaches nothing.
    const member = await screen.findByRole('button', { name: /Sam Probe/ }, { timeout: 10_000 });
    // The read is purpose-gated: ≥8 characters or the drawer never opens.
    vi.spyOn(window, 'prompt').mockReturnValue('auditing entitlement drift');
    fireEvent.click(member);
    return screen.findByRole('dialog', { name: /Member dossier/i }, { timeout: 10_000 });
  }

  it('is on the stack under a label the manual can report, and traps Tab', async () => {
    await openDossier();
    expect(dismissStack().map((d) => d.label)).toEqual(['member dossier']);
    // The container ref is what licenses the modal presentation: without it Tab walks out
    // into the entitlement matrix behind a purpose-gated read.
    expect(topTraps(), 'the drawer does not confine Tab').toBe(true);
  });

  it('closes on Escape', async () => {
    const drawer = await openDossier();
    // Dispatched at the document, where lib/dismiss's single listener lives. Nothing in
    // this page listens for Escape — that is the house rule.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(drawer).not.toBeInTheDocument(), { timeout: 10_000 });
    expect(dismissStack()).toEqual([]);
  });
});

describe('the Campaign Ops compliance drawer', () => {
  beforeEach(() => {
    vi.mocked(distApi.fetchDistCampaigns).mockResolvedValue([
      {
        id: 'c1', name: 'Quest One', surface_id: null, kind: 'quest', token_incentivized: true,
        budget_lcx: '1000', status: 'draft', detail: null, owner: null, created_at: '2026-01-01T00:00:00Z',
      },
    ]);
    vi.mocked(distApi.fetchCampaignReviews).mockResolvedValue([]);
    // Live pricing and the MiCA checklist are garnish the page renders around; absent is a
    // legitimate rendering and this test is about the key, not the numbers.
    vi.mocked(distApi.fetchDistributionDeep).mockRejectedValue(new Error('offline'));
    vi.mocked(distApi.runEmission).mockRejectedValue(new Error('offline'));
    vi.mocked(distApi.runQuestCac).mockRejectedValue(new Error('offline'));
  });

  async function openDrawer() {
    render(<DistributionCampaigns />);
    fireEvent.click(await screen.findByRole('button', { name: /Compliance/i }, { timeout: 10_000 }));
    return screen.findByRole('dialog', { name: /Compliance detail/i }, { timeout: 10_000 });
  }

  it('is on the stack under a label the manual can report, and traps Tab', async () => {
    await openDrawer();
    expect(dismissStack().map((d) => d.label)).toEqual(['campaign compliance']);
    // Tab leaking past the drawer's buttons reaches the lifecycle <select> behind it, where
    // a stray keystroke advances a campaign's status.
    expect(topTraps(), 'the drawer does not confine Tab').toBe(true);
  });

  it('closes on Escape', async () => {
    const drawer = await openDrawer();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(drawer).not.toBeInTheDocument(), { timeout: 10_000 });
    expect(dismissStack()).toEqual([]);
  });
});
