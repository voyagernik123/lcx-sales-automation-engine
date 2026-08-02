import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Marketing } from '../Marketing';
import { attachMeta } from '@/lib/api/meta';
import { ApiError } from '@/lib/apiClient';
import * as api from '@/lib/api/marketing';
import * as desk from '@/components/marketing/deskApi';
import { previewRefusals } from '@/components/marketing/preChecks';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE MARKETING DESK — the behaviours that are the point of the rebuild
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every assertion here fails if the corresponding behaviour is removed, and the ones
 * worth naming are the ones that guard against the desk becoming comfortable again:
 *
 *  · NOTHING LEAVES WITHOUT A RECORD. When the handoff route is absent the clipboard is
 *    NOT written. This is the test for defect 6, and it is written as an assertion about
 *    `navigator.clipboard` rather than about a button's disabled state, because the old
 *    page's Copy button was enabled and that was the whole problem.
 *  · A REFUSAL IS A SENTENCE WITH ITS RULE. Typing LCX's own brand line produces the
 *    ESMA citation, not a red border.
 *  · "NOTHING HERE" IS NOT "WE CANNOT SEE". Two different components, two different test
 *    ids, and both are asserted — an empty silence log and an undeployed silence log must
 *    never render the same.
 *  · THE CLOCK REFUSES. A row with no true post time reads "not measurable", and the
 *    aggregate says how many rows it covers.
 *  · AN UNANSWERED GATE IS NOT A PASS.
 *
 * `preChecks.ts` is NOT mocked — the live refusal mapping is the behaviour under test, so
 * mocking it would delete the test. Only the network is mocked, and `deskApi` is mocked
 * with `importOriginal` so `contentHash` stays real: a stubbed hash would make the
 * handoff test pass while proving nothing about what the record binds to.
 */

vi.mock('@/lib/api/marketing', () => ({
  fetchMarketingQueue: vi.fn(),
  fetchMarketingSummary: vi.fn(),
  draftForReply: vi.fn(),
  approveDraft: vi.fn(),
  ingestReply: vi.fn(),
  setReplyStatus: vi.fn(),
  fetchDrafts: vi.fn(),
  /* The two panels wired in the contract wave. They are mounted only when their tab is
     selected, so the suites above never touch them — which is exactly why they are mocked
     here rather than left out: a factory missing a name fails as `is not a function` at the
     moment somebody opens the tab, which is a worse signal than a red test. */
  fetchAbusePerimeter: vi.fn(),
  fetchMarketingWatch: vi.fn(),
  fetchClaimExpiry: vi.fn(),
}));

vi.mock('@/components/marketing/deskApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/marketing/deskApi')>();
  return {
    ...actual,
    reviewText: vi.fn(),
    recordHandoff: vi.fn(),
    listSilences: vi.fn(),
    findPrecedent: vi.fn(),
    recordTriage: vi.fn(),
  };
});

const NOW = new Date('2026-08-02T12:00:00.000Z');

const reply = (over: Partial<api.MarketingReply> = {}): api.MarketingReply => ({
  id: 1,
  x_comment_id: '1234567890123456789',
  x_post_id: null,
  author_handle: 'stranger',
  author_display: null,
  body: 'Is LCX solvent?',
  posted_at: '2026-08-02T09:00:00.000Z',
  received_at: '2026-08-02T09:05:00.000Z',
  status: 'new',
  sentiment: null,
  source_grade: 'C3',
  source_kind: 'x_notification_email',
  parse_failed: false,
  // No `raw_email`: the route names its columns (`service.ts REPLY_COLUMNS`) and the
  // body is not among them, so a fixture carrying it would model a payload the API
  // does not send.
  /*
   * The M0 columns. Spelled out rather than left optional on the interface: making them
   * `?:` would let a fixture omit them and let the page read `undefined` where the API
   * always sends a value, which is the mock-agrees-with-an-invented-shape failure that
   * `marketingContract.test.ts` exists to catch. The defaults below are the AUTHENTICATED,
   * un-quarantined case, so any test asserting a quarantine has to say so explicitly.
   */
  posted_at_source: 'oembed',
  posted_on_displayed: '2026-08-02',
  raw_email_cleared_at: null,
  sender_from: 'notify@x.com',
  sender_auth_state: 'dkim',
  sender_dkim_domain: 'x.com',
  sender_auth_evidence: null,
  quarantined: false,
  quarantine_code: null,
  collision_of_comment_id: null,
  ...over,
});

const draft = (over: Partial<api.MarketingDraft> = {}): api.MarketingDraft => ({
  id: 77,
  reply_id: 1,
  body: 'Withdrawals are processing normally.',
  used_llm: true,
  flagged: false,
  flag_reason: null,
  status: 'proposed',
  approved_by: null,
  approved_at: null,
  created_at: '2026-08-02T09:10:00.000Z',
  // Nobody has asserted this went out. On an approved draft that is a real state — the desk
  // cleared the text and no human has said they pasted it — and not a missing record.
  sent_asserted_by: null,
  sent_asserted_at: null,
  ...over,
});

const summary = (over: Partial<api.MarketingSummary> = {}): api.MarketingSummary => ({
  counts: { new: 1 },
  oldestUnansweredHours: 3,
  oldestObservedWaitingHours: 3,
  /*
   * A REFUSAL BY DEFAULT, because that is the common case rather than the exceptional one:
   * the post-time clock is withheld unless EVERY open row has a post date, and until oEmbed
   * has been run against each of them it has not. A fixture defaulting to a number would
   * let a page be written that never renders the refusal path.
   */
  oldestSincePostedHours: {
    code: 'MKT_CLOCK_POST_TIME_UNKNOWN',
    message: 'At least one open reply has no observed post date, so the wait since posting cannot be reported for the queue.',
    needs: 'an oEmbed lookup for every open reply',
  },
  /*
   * COVERAGE OVER THE POPULATION, matching the two-row fixture above.
   *
   * The panels used to divide by `queue.length`, which is a page capped at 50 — so a desk
   * with 120 open replies whose 50 oldest carried a post time rendered "100% — 50 of 50".
   * The figure now comes from the summary, and a fixture without this field exercises the
   * refusal path rather than a silent fallback to the page.
   */
  postTimeCoverage: { openRows: 2, withPostTime: 1 },
  suspicious: 0,
  unparsed: 0,
  quarantined: 0,
  collisions: 0,
  mailConfigured: true,
  migrated: true,
  ...over,
});

const clipboard = vi.fn<(t: string) => Promise<void>>();

/**
 * INSTALLED AFTER `userEvent.setup()`, ALWAYS.
 *
 * `userEvent.setup()` installs its own `navigator.clipboard` stub, so a spy defined in
 * `beforeEach` is silently replaced by it — and `expect(clipboard).not.toHaveBeenCalled()`
 * would then pass no matter what the page did. That is a green test for the single most
 * important guarantee in this compartment, which is worse than no test.
 */
function installClipboard() {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: clipboard, readText: async () => '' },
    configurable: true,
  });
}

function mount(queue: api.MarketingReply[] = [reply()], s: api.MarketingSummary = summary()) {
  vi.mocked(api.fetchMarketingQueue).mockResolvedValue(attachMeta(queue, { migrated: s.migrated }));
  vi.mocked(api.fetchMarketingSummary).mockResolvedValue(attachMeta(s, { migrated: s.migrated }));
  return render(<MemoryRouter><Marketing /></MemoryRouter>);
}

/** Open the drafting room on the first queue item, with a stored draft present. */
async function openDrafting(u: ReturnType<typeof userEvent.setup>, d = draft()) {
  vi.mocked(api.draftForReply).mockResolvedValue({ draft: d, usedLlm: true, suspiciousInput: false });
  await u.click(screen.getByRole('tab', { name: 'Drafting' }));
  await u.selectOptions(screen.getByLabelText('Item to draft for'), '1');
  await u.click(screen.getByRole('button', { name: /Ask for a draft/i }));
  return screen.findByLabelText('Our text');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);
  clipboard.mockReset().mockResolvedValue(undefined);
  vi.mocked(desk.reviewText).mockResolvedValue(null);
  vi.mocked(desk.listSilences).mockResolvedValue([]);
  vi.mocked(desk.findPrecedent).mockResolvedValue([]);
  vi.mocked(desk.recordTriage).mockResolvedValue(null);
  vi.mocked(desk.recordHandoff).mockResolvedValue(null);
});

describe('the desk states what it cannot do', () => {
  it('renders no send, post, publish or schedule control anywhere on the page', async () => {
    mount();
    await screen.findByRole('tablist', { name: 'Marketing desk' });
    for (const b of screen.getAllByRole('button')) {
      expect(b.textContent ?? '').not.toMatch(/\b(send|post|publish|schedule|tweet)\b/i);
    }
  });

  it('says the compartment is awaiting its migration rather than showing an empty inbox', async () => {
    mount([], summary({ migrated: false }));
    const absent = await screen.findAllByTestId('mkt-empty-absent');
    expect(absent[0].textContent).toMatch(/awaiting migration 0046/i);
    expect(absent[0].textContent).toMatch(/empty shape rather than an empty inbox/i);
  });
});

describe('the clock refuses rather than flatters', () => {
  it('reads "not measurable" on a row with no true post time, and excludes it from the aggregate', async () => {
    mount([reply({ id: 1, posted_at: '2026-08-02T09:00:00.000Z' }), reply({ id: 2, posted_at: null })]);
    const noClock = await screen.findByTestId('mkt-triage-row-2');
    expect(within(noClock).getByText(/not measurable/i)).toBeTruthy();
    expect(noClock.textContent).toMatch(/not zero and it is not the time since the email arrived/i);

    // The one row that CAN be timed: 12:00 minus 09:00.
    expect(within(await screen.findByTestId('mkt-triage-row-1')).getByText(/3h/)).toBeTruthy();
    // And the aggregate names its coverage instead of averaging the two populations —
    // separating what was LOADED from how many are OPEN, which is the fix for the panel
    // that read "50 of 50 … Every open item carries one" over a 50-row page of 120.
    const said = screen.getByTestId('mkt-clock-coverage').textContent ?? '';
    expect(said).toMatch(/Measured over 1 of the 2 items loaded here/i);
    expect(said).toMatch(/2 open in total/i);
    expect(said).toMatch(/The other 1 are excluded/i);
  });
});

describe('an empty log and an undeployed log are different facts', () => {
  /* Scoped to the panel. Every tab stays mounted so a half-finished assessment survives a
     tab switch, which means several honest-empty states sit in the tree at once and a bare
     `getByTestId` would pick up another panel's. */
  const silence = () => within(screen.getByRole('region', { name: 'Silence log' }));

  it('shows "nothing here" when the silence route answers with no rows', async () => {
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('tab', { name: 'Silence' }));
    await waitFor(() => expect(silence().getByTestId('mkt-empty-nothing')).toBeTruthy());
    expect(silence().getByTestId('mkt-empty-nothing').textContent)
      .toMatch(/No decision not to answer has been recorded/i);
    expect(silence().queryByTestId('mkt-empty-absent')).toBeNull();
  });

  it('shows "we cannot see" when the silence route is not deployed', async () => {
    vi.mocked(desk.listSilences).mockResolvedValue(null);
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('tab', { name: 'Silence' }));
    await waitFor(() => expect(silence().getByTestId('mkt-empty-absent')).toBeTruthy());
    expect(silence().getByTestId('mkt-empty-absent').textContent)
      .toMatch(/no silence log on this environment/i);
    expect(silence().queryByTestId('mkt-empty-nothing')).toBeNull();
  });
});

describe('nothing leaves without a record', () => {
  it('does not write the clipboard when the handoff cannot be recorded', async () => {
    const u = userEvent.setup();
    installClipboard();
    mount();
    await openDrafting(u);
    await u.click(screen.getByRole('button', { name: /Record the handoff, then take the text/i }));

    await waitFor(() => expect(screen.getByTestId('mkt-handoff-absent')).toBeTruthy());
    expect(clipboard).not.toHaveBeenCalled();
    expect(screen.getByTestId('mkt-handoff-absent').textContent).toMatch(/the text was not copied/i);
  });

  it('writes the clipboard only after a record bound to the hash of exactly that text', async () => {
    vi.mocked(desk.recordHandoff).mockImplementation(async (draftId, hash) => ({
      id: 'h-1', draftId, contentHash: hash, takenBy: 'nik@lcx.com',
      takenAt: '2026-08-02T12:00:00.000Z', notice: null,
    }));
    const u = userEvent.setup();
    installClipboard();
    mount();
    const box = await openDrafting(u);
    await u.click(screen.getByRole('button', { name: /Record the handoff, then take the text/i }));

    await waitFor(() => expect(screen.getByTestId('mkt-handoff-recorded')).toBeTruthy());
    expect(clipboard).toHaveBeenCalledWith((box as HTMLTextAreaElement).value);
    const [, hash] = vi.mocked(desk.recordHandoff).mock.calls[0];
    // A real SHA-256, not a stub: 64 lowercase hex characters.
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('refusals arrive live, citing their rule', () => {
  it('refuses LCX\'s own brand line and cites the ESMA statement', async () => {
    const u = userEvent.setup();
    mount();
    const box = await openDrafting(u);
    await u.clear(box);
    await u.type(box, 'LCX is fully regulated, so you are safe.');

    const refusal = await screen.findByTestId('mkt-refusal-ESMA_REGULATORY_STATUS_AS_PROMOTION');
    expect(refusal.textContent).toMatch(/ESMA35-1872330276-2329/);
    expect(refusal.textContent).toMatch(/Name the specific product or service/i);
    // A refusal is not a warning: the act is unreachable while it stands.
    expect(screen.getByRole('button', { name: /Record the handoff/i })).toBeDisabled();
  });

  it('refuses an Art 7 promotion on arithmetic, not on wording', async () => {
    const u = userEvent.setup();
    mount();
    await openDrafting(u);
    await u.click(screen.getByRole('checkbox', { name: /Ticking it pulls in the Art 7 mandatory elements/ }));

    const refusal = await screen.findByTestId('mkt-refusal-ART_7_BOILERPLATE_DOES_NOT_FIT');
    expect(refusal.textContent).toMatch(/286 characters and the post holds 280/);
    expect(refusal.textContent).toMatch(/no wording that gets past it/i);
  });

  it('shows an unanswered gate as unchecked rather than as clean', async () => {
    const u = userEvent.setup();
    mount();
    await openDrafting(u);
    const gate = await screen.findByTestId('mkt-gate-claim_safety');
    expect(gate.textContent).toMatch(/not checked/i);
    expect(gate.textContent).not.toMatch(/no refusal on this text/i);
  });
});

describe('the triage board is a decision, not a workflow', () => {
  it('closes the correction path when the message is an opinion', async () => {
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: 'Assess' }));
    await u.click(screen.getByRole('radio', { name: /cannot be verifiably false/ }));
    const gate = await screen.findByTestId('mkt-opinion-gate-closed');
    expect(gate.textContent).toMatch(/nothing here to debunk/i);
    expect(gate.textContent).toMatch(/not the arbiter of public debate/i);
  });

  it('refuses to claim a decision was recorded when the route is absent', async () => {
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('button', { name: 'Assess' }));
    await u.click(screen.getByRole('radio', { name: /Eligible for a correction/ }));
    await u.click(screen.getByRole('radio', { name: /Trending: some discussion online/ }));
    await u.type(screen.getByLabelText('Basis for the reach estimate'), 'four quote posts in an hour');
    await u.click(screen.getByRole('radio', { name: /Negative effect on reputation/ }));
    await u.selectOptions(screen.getByLabelText('Response action'), 'reply_public');
    await u.click(screen.getByRole('button', { name: /Record this decision/i }));

    const absent = await screen.findByTestId('mkt-empty-absent');
    expect(absent.textContent).toMatch(/cannot record a triage decision/i);
    expect(absent.textContent).toMatch(/still undecided/i);
  });

  it('presents LOW as a decision with work in it', async () => {
    mount();
    const low = await screen.findByRole('heading', { name: /LOW — a decision, not neglect/i });
    const column = low.parentElement as HTMLElement;
    expect(column.textContent).toMatch(/prepared, unused line is the artefact of triage/i);
  });
});

describe('the crisis room hands over words and claims nothing about them', () => {
  it('states that the statements are not counsel-reviewed, and withholds nothing behind that', async () => {
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('tab', { name: 'Crisis' }));
    expect((await screen.findByTestId('mkt-crisis-not-reviewed')).textContent)
      .toMatch(/not counsel-reviewed text/i);

    await u.click(screen.getByTestId('mkt-holding-hs-are-you-solvent'));
    // The known / not-known / next-update template, and the brief the engine composes
    // from `mustNotSay` — so a future editor cannot delete a protection by rewording.
    const room = within(screen.getByRole('region', { name: 'Crisis room' }));
    expect(room.getByText(/^known ·/)).toBeTruthy();
    expect(room.getByText(/^not known ·/)).toBeTruthy();
    expect((await screen.findByTestId('mkt-statement-guidance')).textContent?.length ?? 0)
      .toBeGreaterThan(80);
  });
});

describe('measurement measures the desk, not the market', () => {
  it('never renders a figure that needs a denominator, and names each one it refuses', async () => {
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('tab', { name: 'Measurement' }));
    const panel = await screen.findByRole('region', { name: 'Measurement' });
    expect(panel.textContent).toMatch(/Figures this compartment refuses to show/i);
    for (const key of ['share_of_voice', 'engagement_rate', 'click_through_rate', 'audience_sentiment']) {
      // Present as a REFUSAL row, read out of the engine's own registry...
      expect(screen.getByTestId(`mkt-refused-metric-${key}`)).toBeTruthy();
    }
    // ...and never as a value. No digit may sit beside one of these names.
    expect(panel.textContent).not.toMatch(/(impressions|reach|engagement rate)\s*[:·]?\s*\d/i);
  });

  it('says which read a metric needs instead of rendering a zero', async () => {
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('tab', { name: 'Measurement' }));
    const row = await screen.findByTestId('mkt-metric-refusal_rate_by_code');
    expect(row.textContent).toMatch(/not computable here/i);
    expect(row.textContent).toMatch(/throws them away when the tab closes/i);
    expect(row.textContent).not.toMatch(/\b0\b/);
  });

  it('labels every observed count as a lower bound', async () => {
    const u = userEvent.setup();
    mount();
    await u.click(await screen.findByRole('tab', { name: 'Measurement' }));
    // Two panels each hold one: the triage board's queue tile and this one's.
    expect((await screen.findAllByText('≥ 1')).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('mkt-observation-frame').length).toBeGreaterThan(0);
  });
});

describe('the pre-checks themselves', () => {
  it('refuses a like on the adoption table rather than on the words', () => {
    const codes = previewRefusals({ text: '', verb: 'like', promotesOfferOrListing: false }).map((r) => r.code);
    expect(codes).toContain('ADOPTION_OF_UNVERIFIED_TARGET');
    // A correction adopts nothing (RN 17-18 Q11), so it must NOT carry the refusal.
    const corr = previewRefusals({ text: '', verb: 'correction', promotesOfferOrListing: false }).map((r) => r.code);
    expect(corr).not.toContain('ADOPTION_OF_UNVERIFIED_TARGET');
  });

  it('refuses on the invisible axis whenever an asset is named', () => {
    const r = previewRefusals({ text: 'Great week for $LCX', verb: 'reply', promotesOfferOrListing: false });
    const perimeter = r.find((x) => x.code === 'ASSET_STATE_UNKNOWN');
    expect(perimeter?.rule.provision).toMatch(/Art 91\(3\)\(c\)/);
    expect(perimeter?.sentence).toMatch(/\$LCX/);
  });

  it('leaves a bare ticker alone rather than flagging ordinary words', () => {
    // sanitise.ts:73 redacted `ETH` as a bare word and let scam handles through. A
    // matcher that fires on the safe thing manufactures the fatigue that makes a
    // reviewer stop reading, so this detector is cashtags only and says so on screen.
    const codes = previewRefusals({ text: 'ETH deposits are live', verb: 'reply', promotesOfferOrListing: false })
      .map((r) => r.code);
    expect(codes).not.toContain('ASSET_STATE_UNKNOWN');
  });
});

describe('the page no longer makes the claims the backend cannot support', () => {
  /* THE POST-MORTEM IS ALLOWED TO QUOTE THE OLD CLAIMS; the page is not allowed to make
     them. So block comments are stripped before matching — otherwise the file could only
     be cleaned by deleting the record of what was wrong with it, which is the opposite of
     what this compartment is for. */
  const src = readFileSync(join(__dirname, '..', 'Marketing.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('has no ungated copy path left in it', () => {
    expect(src).not.toMatch(/navigator\.clipboard/);
    expect(src).not.toMatch(/Copy it into X|copy it into X/);
  });

  it('does not describe the queue as AI-triaged, or approval as sending', () => {
    expect(src).not.toMatch(/triaged, drafted by AI/);
    expect(src).not.toMatch(/copy it into X to send/i);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  REACHABILITY — the defect this repository has now found three times
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Nine engines in this compartment had no caller. `apps/api/src/marketing/watch.ts` had no
 * importer anywhere in `apps/api/src`; `/v1/marketing/perimeter` had no reader, so the three
 * governed writes that populate the embargo register could be used and never seen.
 *
 * A panel that exists and cannot be REACHED is the same defect one level up, and it is
 * invisible to a unit test of the panel. So this block opens the desk the way a person does
 * — clicking the tab — and asserts the panel answered.
 *
 * FALSIFIED BY: deleting either tab from `TABS`, or rendering the panel behind a condition
 * that is false on a fresh mount. Both leave the panel's own tests green.
 */
describe('the two panels wired in the contract wave are reachable from the desk', () => {
  it('Watch opens, calls the watch routes, and says so when they are not mounted', async () => {
    vi.mocked(api.fetchMarketingWatch).mockRejectedValue(new ApiError('no route', 404));
    vi.mocked(api.fetchClaimExpiry).mockRejectedValue(new ApiError('no route', 404));
    const u = userEvent.setup();
    await mount();
    await u.click(screen.getByRole('tab', { name: 'Watch' }));

    expect(api.fetchMarketingWatch).toHaveBeenCalled();
    expect(api.fetchClaimExpiry).toHaveBeenCalled();
    const notes = await screen.findAllByTestId('mkt-empty-absent');
    // Both halves refuse, and neither renders as a quiet week.
    expect(notes.some((n) => /watch route is not on this environment/i.test(n.textContent ?? ''))).toBe(true);
    expect(notes.some((n) => /claim-expiry route is not on this environment/i.test(n.textContent ?? ''))).toBe(true);
  });

  it('Perimeter opens and calls the register read', async () => {
    vi.mocked(api.fetchAbusePerimeter).mockResolvedValue({
      embargo: { registerPresent: false, detailWithheld: false, withheldReason: null, entries: [] },
      holdings: { registerPresent: false, detailWithheld: false, withheldReason: null, entries: [] },
      absenceIsNotClearance: 'Absence from an unattested register is absence of knowledge, not clearance.',
      writeActions: ['marketing.embargo.enter'],
    });
    const u = userEvent.setup();
    await mount();
    await u.click(screen.getByRole('tab', { name: 'Perimeter' }));

    expect(api.fetchAbusePerimeter).toHaveBeenCalled();
    expect(await screen.findByText(/absence of knowledge, not clearance/i)).toBeTruthy();
  });

  it('neither new panel is fetched before its tab is opened', async () => {
    // The reason they are conditionally rendered rather than kept mounted: four network reads
    // on every visit to the desk, for panels nobody opened, on environments where all four
    // answer 404. Nothing is preserved by keeping a failed read warm.
    await mount();
    expect(api.fetchMarketingWatch).not.toHaveBeenCalled();
    expect(api.fetchAbusePerimeter).not.toHaveBeenCalled();
  });
});
