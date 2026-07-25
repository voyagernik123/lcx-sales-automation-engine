import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DistributionListings } from '../DistributionListings';
import * as distApi from '@/lib/api/distribution';

/**
 * A BARE ARROW MUST NOT WRITE TO A GOVERNED RECORD — the Listing Ops status select.
 *
 * WHY THIS TEST EXISTS, and why it is a vitest test rather than a Playwright one.
 *
 * `e2e/keyboardday.spec.ts:903` already asserts that three ArrowDowns on this select
 * produce zero governed writes. It passed on macOS for two phases and was RED in CI
 * the whole time — run 30162940695, verbatim:
 *
 *   Error: three ArrowDowns produced a governed write
 *   Received length: 1
 *   Received array: [{"actionId":"dist_listing_set_status","params":{"status":"submitted"},
 *                    "subjectId":"srf_probe_one","subjectType":"dist_listing"}]
 *
 * The cause is a PLATFORM DIFFERENCE, which is why it cannot be caught by a browser
 * test on this machine: Chrome and WKWebView on macOS open the popup on an arrow and
 * fire `change` only on ↵ or a click, so the spec's premise is satisfied by the OS
 * rather than by our code. On Linux — CI's Chromium, and any Windows or Linux browser
 * on the web fallback — the arrow advances the selection immediately and `change`
 * fires per keypress. Tab-ing through the table and arrowing past a select advanced a
 * real listing's status, audited and attributed, with no confirmation.
 *
 * At the React level the two platforms differ in exactly one way: whether a `change`
 * event follows the arrow `keydown`. The keydown fires on both. So firing BOTH here
 * reproduces Linux faithfully on a Mac — which is the only way this behaviour can be
 * verified from this machine at all.
 *
 * WHAT IT DOES NOT COVER, stated plainly: this does not prove the shipping WKWebView
 * still opens the popup rather than advancing. It proves the app is correct EITHER
 * WAY, which is the property worth having — the e2e spec remains the check on the
 * real engine's behaviour.
 */

vi.mock('@/lib/api/distribution', () => ({
  fetchDistributionDeep: vi.fn(),
  setListingStatus: vi.fn().mockResolvedValue({}),
  draftListingPacket: vi.fn().mockResolvedValue({ packet: '', usedLlm: false }),
}));

const SURFACE = { id: 'srf_probe_one', name: 'Probe Surface One', category: 'wallet', submit: 'ask' };

/** The narrowest object the page reads. Anything more would be fixture theatre. */
const deep = {
  reference: {
    meta: { product: '', builtBy: '', thesis: '', asOf: '', dossier: '' },
    payAgent: { tagline: '', custody: '', fees: [], rewardLoop: '', chains: [], surfaces: [], roadmap: [], srcRefs: [] },
    rails: [], surfaces: [SURFACE], growthContext: [], competitors: [],
    funnel: { stages: [], params: {}, note: '' }, gaps: [], geoQuestions: [], personas: [], sources: [],
  },
  listings: [{
    surface_id: SURFACE.id, status: 'not_started', owner: null, rank_note: null,
    usage_note: null, url: null, updated_at: '2026-01-01T00:00:00Z',
  }],
  live: { listings: true },
} as unknown as distApi.DistributionDeep;

async function board(): Promise<HTMLSelectElement> {
  render(<MemoryRouter><DistributionListings /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(SURFACE.name)).toBeInTheDocument());
  return screen.getAllByRole('combobox')[0] as HTMLSelectElement;
}

/** What Linux does: the arrow moves the selection, so `change` follows the keydown. */
function arrowTo(select: HTMLSelectElement, value: string): void {
  fireEvent.keyDown(select, { key: 'ArrowDown' });
  fireEvent.change(select, { target: { value } });
}

describe('Listing Ops — the status select under arrow keys', () => {
  beforeEach(() => {
    vi.mocked(distApi.fetchDistributionDeep).mockResolvedValue(deep);
    vi.mocked(distApi.setListingStatus).mockClear();
  });

  it('an arrow-driven change STAGES the value and writes nothing', async () => {
    const select = await board();
    arrowTo(select, 'submitted');
    // The assertion CI was making, now provable on a Mac.
    expect(distApi.setListingStatus, 'an ArrowDown produced a governed write').not.toHaveBeenCalled();
    // And the operator is told the value on screen is not the value in the record —
    // a silent disagreement would be its own defect.
    expect(screen.getByText(/to apply/i)).toBeInTheDocument();
    expect(select.value, 'the staged value is not shown, so the arrow appears to do nothing').toBe('submitted');
  });

  it('three arrows in a row still write nothing — the exact CI sequence', async () => {
    const select = await board();
    arrowTo(select, 'submitted');
    arrowTo(select, 'live');
    arrowTo(select, 'ranked');
    expect(distApi.setListingStatus).not.toHaveBeenCalled();
  });

  it('↵ commits the staged value, once, with the staged status', async () => {
    const select = await board();
    arrowTo(select, 'live');
    fireEvent.keyDown(select, { key: 'Enter' });
    await waitFor(() => expect(distApi.setListingStatus).toHaveBeenCalledTimes(1));
    expect(distApi.setListingStatus).toHaveBeenCalledWith(SURFACE.id, { status: 'live' });
  });

  it('↵ with nothing staged writes nothing — "nothing changed" beats a false tick', async () => {
    const select = await board();
    fireEvent.keyDown(select, { key: 'Enter' });
    expect(distApi.setListingStatus).not.toHaveBeenCalled();
  });

  it('↵ after staging back to the stored status writes nothing', async () => {
    const select = await board();
    arrowTo(select, 'submitted');
    arrowTo(select, 'not_started'); // back where it started
    fireEvent.keyDown(select, { key: 'Enter' });
    expect(distApi.setListingStatus).not.toHaveBeenCalled();
  });

  it('esc discards the staged value and leaves the record alone', async () => {
    const select = await board();
    arrowTo(select, 'ranked');
    fireEvent.keyDown(select, { key: 'Escape' });
    expect(distApi.setListingStatus).not.toHaveBeenCalled();
    expect(select.value).toBe('not_started');
    expect(screen.queryByText(/to apply/i)).not.toBeInTheDocument();
  });

  it('leaving the select discards, like clicking away from an open macOS popup', async () => {
    const select = await board();
    arrowTo(select, 'ranked');
    fireEvent.blur(select);
    expect(distApi.setListingStatus).not.toHaveBeenCalled();
    expect(select.value).toBe('not_started');
  });

  /**
   * THE OTHER HALF OF THE CLAIM. Everything above proves the write is harder to
   * reach; this proves it is still reachable, because a fix that quietly broke the
   * pointer path would pass every assertion above.
   */
  it('a pointer selection still writes immediately — no arrow, no staging', async () => {
    const select = await board();
    fireEvent.change(select, { target: { value: 'submitted' } });
    await waitFor(() => expect(distApi.setListingStatus).toHaveBeenCalledTimes(1));
    expect(distApi.setListingStatus).toHaveBeenCalledWith(SURFACE.id, { status: 'submitted' });
    expect(screen.queryByText(/to apply/i), 'a committed value should not read as staged').not.toBeInTheDocument();
  });
});
