import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/apiClient';
import * as marketingApi from '@/lib/api/marketing';
import { frame, instant, notPermitted, num, refusals, routeAbsent, rows, str } from '../narrow';
import { WireRefused } from '../DeskAtoms';
import { PerimeterPanel } from '../PerimeterPanel';
import { WatchPanel } from '../WatchPanel';
import { ExportBundlePanel } from '../ExportBundlePanel';
import type { AbusePerimeterState } from '../vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  A ROUTE THAT IS NOT THERE MUST NOT LOOK LIKE A WORLD THAT IS QUIET
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * These panels were built to call routes that mostly did not exist when they were written.
 * The one defect that would make the whole compartment worthless is the cheap one: a screen
 * that renders an unmounted endpoint, a forbidden read and a genuinely empty register
 * identically. All three produce a blank table, all three look calm, and only one of them
 * means what a reader will take it to mean.
 *
 * SO EVERY TEST BELOW ASSERTS THE SENTENCE A READER WOULD TAKE AWAY, not an internal flag.
 * A test that checked `state === 'absent'` would pass on a panel that then rendered nothing.
 *
 * ── HOW EACH TEST IS FALSIFIED ────────────────────────────────────────────────
 * Verified by reverting, not by inspection:
 *
 *  · Collapse `absent` into `failed` in `useDeskRead` → the two “opposite facts” tests fail,
 *    because the absent branch stops printing “not on this environment”.
 *  · Delete `notPermitted` and let 403 fall through to `failed` → the approver tests fail.
 *  · Change `num()` to return `0` instead of `null`, or `frame()` to return a partial frame
 *    instead of `null` → the narrowing tests fail on the exact substitution they forbid.
 *  · Render `matchesObserved` with `?? 0` → the null-versus-zero test fails.
 *  · Add a copy or download control to the production panel → the absence test fails.
 */

/* ════════ THE NARROWERS: A MISSING FIELD IS NEVER A ZERO ════════ */

describe('narrowing an uncontracted payload never invents a value', () => {
  it('a missing number is null, not 0', () => {
    // The single most common way an instrument lies. `usedInCount: 0` and "the ledger does
    // not count usages" are different claims and only one of them is true here.
    expect(num(undefined)).toBeNull();
    expect(num(null)).toBeNull();
    expect(num('7')).toBeNull();
    expect(num(Number.NaN)).toBeNull();
    expect(num(0)).toBe(0); // a real zero survives — this is not a coalescing bug
  });

  it('an unparseable instant is null rather than a NaN clock', () => {
    expect(instant('not a date')).toBeNull();
    expect(instant('')).toBeNull();
    expect(instant('2026-08-01T09:00:00.000Z')).toBe('2026-08-01T09:00:00.000Z');
  });

  it('an incomplete observation frame is refused whole, never partially rendered', () => {
    // A frame missing `doesNotCapture` reads as a channel with no blind spots, which is the
    // opposite of what a frame is for. So it is null, and the caller prints the figure as
    // unattributed instead.
    expect(frame({
      source: 'x_notification_email',
      captures: 'replies that generated a notification',
      completeness: 'unknown_no_denominator',
      windowFrom: '2026-08-01T00:00:00.000Z',
      windowTo: '2026-08-02T00:00:00.000Z',
      doesNotCapture: [],
    })).toBeNull();

    expect(frame({
      source: 'x_notification_email',
      captures: 'replies that generated a notification',
      completeness: 'unknown_no_denominator',
      windowFrom: '2026-08-01T00:00:00.000Z',
      windowTo: '2026-08-02T00:00:00.000Z',
      doesNotCapture: ['quote posts', 'anything muted'],
    })?.doesNotCapture).toEqual(['quote posts', 'anything muted']);
  });

  it('nobody-answered and answered-cleanly are different refusal states', () => {
    // The tri-state the drafting-room gates rest on. Collapsing null into [] turns a missing
    // endpoint into a green tick.
    expect(refusals(undefined)).toBeNull();
    expect(refusals([])).toEqual([]);
  });

  it('a refusal with no sentence gets an ugly substitute, never an invented one', () => {
    const [r] = refusals([{ code: 'MKT_TEST' }]) ?? [];
    expect(r?.sentence).toMatch(/sent no sentence/i);
    // And the substitute never claims a rule was cited.
    expect(r?.rule.text).toMatch(/cited no rule text/i);
  });

  it('empty strings and non-arrays do not become content', () => {
    expect(str('')).toBeNull();
    expect(rows('nope')).toEqual([]);
  });
});

/* ════════ THE THREE HTTP FACTS THAT ARE NOT THE SAME FACT ════════ */

describe('404, 403 and 500 are three different things', () => {
  it('classifies them apart', () => {
    expect(routeAbsent(new ApiError('gone', 404))).toBe(true);
    expect(routeAbsent(new ApiError('not built', 501))).toBe(true);
    expect(routeAbsent(new ApiError('no', 403))).toBe(false);
    expect(notPermitted(new ApiError('no', 403))).toBe(true);
    expect(notPermitted(new ApiError('boom', 500))).toBe(false);
    expect(routeAbsent(new ApiError('boom', 500))).toBe(false);
    // A network failure is not an absence either: `fetch` rejects with a plain Error.
    expect(routeAbsent(new Error('network'))).toBe(false);
    expect(notPermitted(new Error('network'))).toBe(false);
  });
});

/* ════════ THE WIRE REFUSAL IS A SENTENCE, NOT A CODE ════════ */

describe('a wire refusal reaches the operator as prose', () => {
  it('leads with the sentence and prints the code last', () => {
    render(<WireRefused r={{
      code: 'WATCH_SOURCE_UNREACHABLE',
      sentence: 'FMA’s warning sitemap did not answer, so no warning was checked this window.',
      rule: 'desk policy · absent data refuses',
      remedy: 'Check the sitemap by hand before telling anyone the week was quiet.',
    }} />);
    expect(screen.getByText(/did not answer/)).toBeTruthy();
    expect(screen.getByText(/Check the sitemap by hand/)).toBeTruthy();
    // The code is present — a person quotes it when they ask why — but it is not the message.
    expect(screen.getByTestId('mkt-wire-refusal-WATCH_SOURCE_UNREACHABLE')).toBeTruthy();
  });

  it('says so when the engine offered no remedy, rather than printing nothing', () => {
    // Silence where an action should be reads as "there is nothing to do", which is a claim.
    render(<WireRefused r={{ code: 'X', sentence: 'A thing failed.', rule: 'a rule' }} />);
    expect(screen.getByText(/stated nothing that would clear this/i)).toBeTruthy();
  });
});

/* ════════ THE PANELS ════════ */

vi.mock('@/lib/api/marketing', () => ({
  fetchAbusePerimeter: vi.fn(),
  fetchMarketingWatch: vi.fn(),
  fetchClaimExpiry: vi.fn(),
  fetchExportBundle: vi.fn(),
}));

/**
 * The mocked module, typed as mocks.
 *
 * `vi.mock` is hoisted above the static import, so `marketingApi` IS the mock factory's
 * object. The cast names what it is rather than reaching for `any`, and rather than reaching
 * for a lint suppression — a suppression in a test that exists to prove a compartment is
 * honest would be its own small joke.
 */
const api = () => marketingApi as unknown as {
  fetchAbusePerimeter: Mock;
  fetchMarketingWatch: Mock;
  fetchClaimExpiry: Mock;
  fetchExportBundle: Mock;
};

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

const emptyPerimeter = (over: Partial<AbusePerimeterState> = {}): AbusePerimeterState => ({
  embargo: { registerPresent: true, detailWithheld: false, withheldReason: null, entries: [] },
  holdings: { registerPresent: true, detailWithheld: false, withheldReason: null, entries: [] },
  absenceIsNotClearance: 'Absence from an unattested register is absence of knowledge, not clearance.',
  writeActions: ['marketing.embargo.enter', 'marketing.embargo.lift', 'marketing.holdings.declare'],
  ...over,
});

describe('the perimeter keeps “no register” apart from “nothing embargoed”', () => {
  it('an unmounted route says the route is not here, and does not say the perimeter is clear', async () => {
    api().fetchAbusePerimeter.mockRejectedValue(new ApiError('nope', 404));
    render(<PerimeterPanel />);
    const note = await screen.findByTestId('mkt-empty-absent');
    expect(note.textContent).toMatch(/not on this environment/i);
    // The load-bearing half: it must tell the operator what NOT to conclude.
    expect(note.textContent).toMatch(/rather than as though it were clear/i);
    expect(screen.queryByTestId('mkt-empty-nothing')).toBeNull();
  });

  it('a 403 says you lack the role — not that the environment is broken', async () => {
    api().fetchAbusePerimeter.mockRejectedValue(new ApiError('approver only', 403));
    render(<PerimeterPanel />);
    const note = await screen.findByTestId('mkt-not-permitted');
    expect(note.textContent).toMatch(/requires an approver/i);
    expect(note.textContent).toMatch(/nothing needs retrying/i);
    // It must NOT be dressed as an absence, or the operator escalates a deployment bug.
    expect(screen.queryByTestId('mkt-empty-absent')).toBeNull();
  });

  it('an absent register and an empty register render differently', async () => {
    api().fetchAbusePerimeter.mockResolvedValue(emptyPerimeter({
      embargo: { registerPresent: false, detailWithheld: false, withheldReason: null, entries: [] },
    }));
    render(<PerimeterPanel />);
    // The embargo register does not exist → "we cannot see".
    const absent = await screen.findByTestId('mkt-empty-absent');
    expect(absent.textContent).toMatch(/does not exist on this environment/i);
    expect(absent.textContent).toMatch(/not an empty register — it is the absence of one/i);
    // The holdings register DOES exist and is empty → "nothing here". Both on one screen.
    expect(screen.getByTestId('mkt-empty-nothing')).toBeTruthy();
  });

  it('prints the server’s own absence-is-not-clearance sentence verbatim', async () => {
    api().fetchAbusePerimeter.mockResolvedValue(emptyPerimeter());
    render(<PerimeterPanel />);
    expect(await screen.findByText(
      'Absence from an unattested register is absence of knowledge, not clearance.',
    )).toBeTruthy();
  });

  it('offers no control that writes either register', async () => {
    api().fetchAbusePerimeter.mockResolvedValue(emptyPerimeter());
    render(<PerimeterPanel />);
    await screen.findByText(/Market-abuse perimeter/i);
    // Entering an embargo is a governed decision with a named owner, not a toggle on a
    // read-only panel. Zero buttons is the assertion.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

/* ════════ THE WATCH ════════ */

const watchFrame = {
  source: 'regulator_feed',
  captures: 'entries the publisher listed in this window',
  doesNotCapture: ['anything published outside the window', 'anything the publisher did not list'],
  knownBiases: ['sitemap lastmod is a change time, not a publication time'],
  completeness: 'complete_first_party',
  windowFrom: '2026-08-01T00:00:00.000Z',
  windowTo: '2026-08-02T00:00:00.000Z',
  lastSuccessfulPollAt: '2026-08-02T00:00:00.000Z',
} as const;

const observation = (over: Record<string, unknown> = {}) => ({
  sourceId: 'fma_warnings',
  label: 'FMA warning sitemap',
  locator: 'https://example.invalid/sitemap.warning_entry.xml',
  state: 'data',
  fetchedAt: '2026-08-02T00:00:00.000Z',
  windowFrom: '2026-08-01T00:00:00.000Z',
  windowTo: '2026-08-02T00:00:00.000Z',
  httpStatus: 200,
  bytes: 4096,
  grade: 'A3',
  confidence: 0.9,
  couldSee: ['listed warning entries'],
  couldNotSee: ['the body of any warning'],
  countsAreLowerBound: true,
  refusals: [],
  frame: watchFrame,
  ...over,
});

const digest = (over: Record<string, unknown> = {}) => ({
  asOf: '2026-08-02T00:00:00.000Z',
  warnings: {
    observation: observation(),
    usable: true, matches: [], matchesObserved: 0, entriesScanned: 120, locsRead: 120, locsUnparsed: [],
  },
  regulator: { observation: observation({ sourceId: 'spine', label: 'News spine' }), items: [], itemsObservedInWindow: 0, notWired: [] },
  press: { observation: observation({ sourceId: 'press', label: 'Press' }), usable: true, rows: [], refusals: [] },
  terms: { ownBrand: ['LCX'], partners: [], listedAssets: [], refusals: [] },
  sourcesUnreadable: [],
  refusals: [],
  ...over,
});

const ledger = (over: Record<string, unknown> = {}) => ({
  usable: false, asOf: '2026-08-02T00:00:00.000Z', dueSoonDays: 30, rows: [], counts: null,
  dependencyMethodNote: 'Dependencies are declared by the artefact where possible.',
  refusals: [], frame: watchFrame, ...over,
});

describe('the watch reports where it went blind before it reports a count', () => {
  it('zero matches and unobserved matches are different sentences', async () => {
    const a = api();
    a.fetchMarketingWatch.mockResolvedValue(digest());
    a.fetchClaimExpiry.mockResolvedValue(ledger());
    const first = render(<WatchPanel />);
    // 0 is a fact about FMA's published list.
    expect(await screen.findByText(/contains no entry matching our terms/i)).toBeTruthy();

    /* UNMOUNTED BEFORE THE SECOND RENDER. Two mounted trees in one document make every
       `getByText` ambiguous, and a test that passes because it found the OTHER render's node
       is worse than no test. */
    first.unmount();
    vi.clearAllMocks();
    a.fetchMarketingWatch.mockResolvedValue(digest({
      warnings: {
        observation: observation({ state: 'unknown', httpStatus: null, bytes: 0 }),
        usable: true, matches: [], matchesObserved: null, entriesScanned: null, locsRead: null, locsUnparsed: [],
      },
      sourcesUnreadable: ['fma_warnings'],
    }));
    a.fetchClaimExpiry.mockResolvedValue(ledger());
    render(<WatchPanel />);
    // null is a fact about our plumbing, and it must not read as 0.
    expect(await screen.findByText(/nobody looked/i)).toBeTruthy();
    // And the panel leads with the blindness before any count.
    expect(screen.getAllByTestId('mkt-empty-absent')
      .some((n) => /sources could not be read/i.test(n.textContent ?? ''))).toBe(true);
    expect(screen.queryByText(/contains no entry matching our terms/i)).toBeNull();
  });

  it('says an empty term list means nothing was searched for', async () => {
    const a = api();
    a.fetchMarketingWatch.mockResolvedValue(digest());
    a.fetchClaimExpiry.mockResolvedValue(ledger());
    render(<WatchPanel />);
    // The subtler trap: "no partner appears in an FMA warning" reads as reassurance when the
    // register that would supply partner names does not exist.
    expect(await screen.findByText(/no partner was searched for/i)).toBeTruthy();
  });

  it('an unusable claim ledger refuses instead of reporting 0 past due', async () => {
    const a = api();
    a.fetchMarketingWatch.mockResolvedValue(digest());
    a.fetchClaimExpiry.mockResolvedValue(ledger());
    render(<WatchPanel />);
    const notes = await screen.findAllByTestId('mkt-empty-absent');
    expect(notes.some((n) => /cannot answer whether anything is stale/i.test(n.textContent ?? ''))).toBe(true);
    expect(screen.getByText(/never as/i).textContent).toMatch(/nobody knows/i);
  });

  it('every source prints its own frame, so no count arrives unattributed', async () => {
    const a = api();
    a.fetchMarketingWatch.mockResolvedValue(digest());
    a.fetchClaimExpiry.mockResolvedValue(ledger());
    render(<WatchPanel />);
    // Three source panels plus the ledger.
    await waitFor(() => {
      expect(screen.getAllByTestId('mkt-observation-frame').length).toBeGreaterThanOrEqual(4);
    });
  });
});

/* ════════ THE PRODUCTION ════════ */

describe('the Art 8(2) production has a print path and no copy path', () => {
  const bundle = {
    digest: 'a'.repeat(64),
    renderedText: 'LCX MARKETING EXPORT BUNDLE\n\nrecord one',
    bundle: {
      kind: 'lcx_marketing_export_bundle', formatVersion: 1,
      request: {
        requestedBy: 'someone', authority: 'FMA',
        windowFrom: '2026-05-01T00:00:00.000Z', windowTo: '2026-08-01T00:00:00.000Z',
        jurisdiction: 'LI', generatedAt: '2026-08-02T00:00:00.000Z',
      },
      records: [], completeness: [], caveats: ['The five-year figure is inferred, not stated by MiCA.'],
      counts: {
        records: 0, published: 0, outstandingCloseOut: 3, withdrawn: 0, refusals: 0,
        refusalsOverridden: 0, integrityBroken: 0, integrityUnverifiable: 2, incompleteRecords: 0,
      },
    },
  };

  it('renders the digest, the caveat and the text, and offers print but not copy or download', async () => {
    api().fetchExportBundle.mockResolvedValue(bundle);
    render(<ExportBundlePanel />);
    // Produce it.
    fireEvent.change(await screen.findByLabelText('Item id to produce'), { target: { value: 'rec-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Produce the bundle/i }));

    const out = await screen.findByTestId('mkt-export-bundle');
    expect(out.textContent).toContain('a'.repeat(64));
    expect(out.textContent).toMatch(/inferred, not stated by MiCA/);
    expect(out.textContent).toContain('LCX MARKETING EXPORT BUNDLE');

    // THE ABSENCE THAT IS THE POINT. A download leaves no trace this side; a clipboard write
    // puts a stranger's data on a shared machine with nobody's name on it.
    const labels = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(labels.some((l) => /print/i.test(l))).toBe(true);
    expect(labels.some((l) => /copy|download|export file|send|publish|post/i.test(l))).toBe(false);
  });

  it('keeps integrity-broken and integrity-unverifiable as separate figures', async () => {
    api().fetchExportBundle.mockResolvedValue(bundle);
    render(<ExportBundlePanel />);
    fireEvent.change(await screen.findByLabelText('Item id to produce'), { target: { value: 'rec-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Produce the bundle/i }));
    await screen.findByTestId('mkt-export-bundle');
    // A hash that does not match is a finding; a hash that cannot be checked is an absence.
    // One number for both would let the second hide inside the first.
    expect(screen.getByText(/integrity BROKEN/)).toBeTruthy();
    expect(screen.getByText(/integrity UNVERIFIABLE/)).toBeTruthy();
  });

  it('an operator without the approver role is told so, not shown a failure', async () => {
    api().fetchExportBundle.mockRejectedValue(new ApiError('approver required', 403));
    render(<ExportBundlePanel />);
    fireEvent.change(await screen.findByLabelText('Item id to produce'), { target: { value: 'rec-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Produce the bundle/i }));
    const note = await screen.findByTestId('mkt-not-permitted');
    expect(note.textContent).toMatch(/requires an approver/i);
    expect(screen.queryByTestId('mkt-empty-absent')).toBeNull();
  });
});
