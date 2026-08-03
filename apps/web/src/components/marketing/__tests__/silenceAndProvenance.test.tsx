import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/apiClient';
import * as marketingApi from '@/lib/api/marketing';
import type { MarketingReply } from '@/lib/api/marketing';
import { SilenceLog } from '../SilenceLog';
import { ProvenancePanel } from '../ProvenancePanel';
import type {
  CorroborationResult, ObservationFrame, ReplyProvenanceRecord, Refusal, SilenceLogEntry,
} from '../vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE TWO SURFACES THAT COULD NOT BE USED AT ALL
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Both panels were built against routes mounted by nobody, so both were `absent` on every
 * environment — and one of them, the silence log, had NO WRITE PATH ANYWHERE. `POST
 * /:id/silence` existed in the client and no component called it, which means an operator's
 * only way to record "we decided not to answer" was a status flip storing no reason. The panel
 * whose entire purpose is proving a silence was a decision could not record one.
 *
 * ── THE DISTINCTIONS THESE TESTS EXIST TO HOLD ────────────────────────────────
 *  · A silence with no rationale is refused, and NOTHING is written — not the ledger row and
 *    not the status change. A form that reported success on a 422 would leave an operator
 *    believing a decision was recorded when the item is still undecided.
 *  · The standing stored beside a silence is the standing AT THE DECISION, read from the
 *    ledger. A panel that showed today's priority would let a knowingly-ignored high-reach
 *    item read as a routine one.
 *  · `could_not_check` is not `disagrees`. An X outage, a deleted post and a lookup nobody ran
 *    are three facts, and only one of them is a forgery signal. `CorroborationState` has no
 *    member meaning "not corroborated" and this panel must not invent one.
 *  · `attempted: false` is not a failed button. Nothing was asked and nothing was written, so
 *    the row's state is unchanged — an outage must never mark a row unconfirmed.
 *
 * ── HOW EACH IS FALSIFIED ─────────────────────────────────────────────────────
 *  · Let the form submit with an empty rationale → the required-rationale test fails.
 *  · Render the write's rejection as a success note → the nothing-was-written test fails.
 *  · Render `could_not_check` with the `disagrees` sentence → the outage test fails.
 *  · Render `attempted: false` as a result block → the not-attempted test fails.
 *  · Print `sender_auth_evidence` → the raw-header test fails.
 */

vi.mock('@/lib/api/marketing', () => ({
  fetchSilenceLog: vi.fn(),
  recordSilenceDecision: vi.fn(),
  fetchReplyProvenance: vi.fn(),
  corroborateReply: vi.fn(),
}));

const api = () => marketingApi as unknown as {
  fetchSilenceLog: Mock;
  recordSilenceDecision: Mock;
  fetchReplyProvenance: Mock;
  corroborateReply: Mock;
};

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

const NOW = Date.parse('2026-08-03T09:00:00.000Z');

const FRAME: ObservationFrame = {
  source: 'x_notification_email',
  captures: 'replies that generated a notification',
  doesNotCapture: ['anything X did not email us about'],
  knownBiases: ['controversy-weighted delivery'],
  completeness: 'unknown_no_denominator',
  windowFrom: '2026-08-01T00:00:00.000Z',
  windowTo: '2026-08-03T00:00:00.000Z',
  lastSuccessfulPollAt: null,
};

const refusal = (code: string): Refusal => ({
  code: code as Refusal['code'],
  sentence: `refused: ${code}`,
  rule: { instrument: 'desk_policy', provision: 'doctrine rule 3', text: 'absent data refuses' },
  recovery: { kind: 'not_recoverable', why: 'nothing on screen changes this' },
  matched: null,
  ruleSetVersion: 1,
});

const queue: readonly MarketingReply[] = [{
  id: 12, x_comment_id: '1', x_post_id: null, author_handle: 'stranger', author_display: null,
  body: 'is LCX insolvent', posted_at: null, posted_at_source: null, posted_on_displayed: null,
  received_at: '2026-08-02T09:00:00.000Z', status: 'new', sentiment: null, source_grade: 'C3',
  source_kind: 'x_notification_email', parse_failed: false, raw_email_cleared_at: null,
  sender_from: null, sender_auth_state: 'unverified', sender_dkim_domain: null,
  sender_auth_evidence: null, quarantined: false, quarantine_code: null,
  collision_of_comment_id: null,
}];

const entry = (over: Partial<SilenceLogEntry> = {}): SilenceLogEntry => ({
  id: 'oa_881',
  replyId: 12,
  subject: 'stranger',
  authorHandle: 'stranger',
  disposition: 'ignored',
  reasonCode: 'would amplify',
  rationale: 'A reply would hand a coordinated account the audience it is asking for.',
  decidedBy: 'nikhil',
  decidedAt: '2026-08-01T10:00:00.000Z',
  revisitBy: '2026-08-02T10:00:00.000Z',
  linesPrepared: 'Prepared: reserves are published monthly.',
  record: {
    rationale: 'A reply would amplify.',
    decidedBy: 'nikhil',
    decidedAt: '2026-08-01T10:00:00.000Z',
    priorityAtDecision: 'high',
    reachAtDecision: 'trending',
    verifiabilityAtDecision: 'verifiable_factual',
    signalsAtDecision: [],
  },
  priorityAtDecision: 'high',
  reachAtDecision: 'trending',
  verifiabilityAtDecision: 'verifiable_factual',
  source: 'silence_decision',
  queueStatusSet: 'ignored',
  ...over,
});

/* ════════ THE SILENCE LOG ════════ */

describe('the silence log can finally record a silence', () => {
  it('offers the write surface that did not exist, and refuses to send without a rationale', async () => {
    api().fetchSilenceLog.mockResolvedValue([]);
    const u = userEvent.setup();
    render(<SilenceLog now={NOW} queue={queue} />);
    await screen.findByTestId('mkt-silence-form');

    const button = screen.getByRole('button', { name: /Record the silence/i });
    expect(button).toBeDisabled();

    await u.selectOptions(screen.getByLabelText('Item to record a silence against'), '12');
    await u.type(screen.getByLabelText('Reason'), 'would amplify');
    // Still disabled: an item and a reason are not a rationale.
    expect(screen.getByRole('button', { name: /Record the silence/i })).toBeDisabled();

    await u.type(screen.getByLabelText('Rationale'), 'A reply hands them the audience.');
    expect(screen.getByRole('button', { name: /Record the silence/i })).toBeEnabled();
    expect(api().recordSilenceDecision).not.toHaveBeenCalled();
  });

  it('sends the rationale and does not invent a lines-prepared value', async () => {
    api().fetchSilenceLog.mockResolvedValue([]);
    api().recordSilenceDecision.mockResolvedValue(entry());
    const u = userEvent.setup();
    render(<SilenceLog now={NOW} queue={queue} />);
    await screen.findByTestId('mkt-silence-form');

    await u.selectOptions(screen.getByLabelText('Item to record a silence against'), '12');
    await u.type(screen.getByLabelText('Reason'), 'would amplify');
    await u.type(screen.getByLabelText('Rationale'), 'A reply hands them the audience.');
    await u.click(screen.getByRole('button', { name: /Record the silence/i }));

    await waitFor(() => expect(api().recordSilenceDecision).toHaveBeenCalledTimes(1));
    // Blank lines-prepared is `null`, not `''`: it records that nothing was drafted.
    expect(api().recordSilenceDecision).toHaveBeenCalledWith(12, {
      reason: 'would amplify',
      rationale: 'A reply hands them the audience.',
      linesPrepared: null,
    });
    const note = await screen.findByTestId('mkt-silence-recorded');
    expect(note.textContent).toMatch(/ledger row/i);
    expect(note.textContent).toMatch(/oa_881/);
    // And it says the basis came from the ledger rather than from what the form sent.
    expect(note.textContent).toMatch(/never from what this form sent/i);
  });

  it('says nothing was written when the write is refused', async () => {
    api().fetchSilenceLog.mockResolvedValue([]);
    api().recordSilenceDecision.mockRejectedValue(
      new Error('This silence was refused and nothing was recorded.'),
    );
    const u = userEvent.setup();
    render(<SilenceLog now={NOW} queue={queue} />);
    await screen.findByTestId('mkt-silence-form');

    await u.selectOptions(screen.getByLabelText('Item to record a silence against'), '12');
    await u.type(screen.getByLabelText('Reason'), 'x');
    await u.type(screen.getByLabelText('Rationale'), 'y');
    await u.click(screen.getByRole('button', { name: /Record the silence/i }));

    // The API's own sentence, and then the fact an operator needs: the item is still undecided.
    expect(await screen.findByText('This silence was refused and nothing was recorded.')).toBeTruthy();
    const block = screen.getByTestId('mkt-refusal-DATA_ABSENT_NOT_ZERO');
    expect(block.textContent).toMatch(/no half-written silence/i);
    expect(block.textContent).toMatch(/not now marked ignored/i);
    expect(screen.queryByTestId('mkt-silence-recorded')).toBeNull();
  });

  it('shows the standing as it was at the decision, not as it is now', async () => {
    api().fetchSilenceLog.mockResolvedValue([entry()]);
    render(<SilenceLog now={NOW} queue={queue} />);
    const row = await screen.findByTestId('mkt-silence-oa_881');
    // A knowingly-ignored high-reach item must not read as a routine one.
    expect(row.textContent).toMatch(/high/);
    expect(row.textContent).toMatch(/reach trending/);
    expect(row.textContent).toMatch(/verifiable factual/);
    // Which entry point wrote it: two surfaces append to one ledger.
    expect(row.textContent).toMatch(/via silence decision/);
    // Lines prepared but unused are shown, because the tier is defined by them.
    expect(row.textContent).toMatch(/lines prepared and not used/i);
  });

  it('names a row with no rationale as a defect in the row', async () => {
    api().fetchSilenceLog.mockResolvedValue([entry({ rationale: '' })]);
    render(<SilenceLog now={NOW} queue={queue} />);
    const row = await screen.findByTestId('mkt-silence-oa_881');
    expect(row.textContent).toMatch(/no rationale was recorded/i);
    expect(row.textContent).toMatch(/only question it exists to answer/i);
  });

  it('keeps an overdue revisit open rather than retiring it', async () => {
    api().fetchSilenceLog.mockResolvedValue([entry()]);
    render(<SilenceLog now={NOW} queue={queue} />);
    const row = await screen.findByTestId('mkt-silence-oa_881');
    expect(row.textContent).toMatch(/OVERDUE since 2026-08-02/);
    expect(row.textContent).toMatch(/Nothing closes it automatically/i);
  });

  it('an unmounted route is no log, not an empty one', async () => {
    api().fetchSilenceLog.mockRejectedValue(new ApiError('nope', 404));
    render(<SilenceLog now={NOW} queue={queue} />);
    const note = await screen.findByTestId('mkt-empty-absent');
    expect(note.textContent).toMatch(/not an empty log — it is\s+no log/i);
    expect(screen.queryByTestId('mkt-empty-nothing')).toBeNull();
  });
});

/* ════════ PROVENANCE ════════ */

const provenance = (over: Partial<ReplyProvenanceRecord> = {}): ReplyProvenanceRecord => ({
  replyId: 12,
  xCommentId: '1900000000000000001',
  xPostId: null,
  claimedAuthorHandle: 'stranger',
  claimedAuthorDisplay: 'LCX Support (official)',
  quarantined: false,
  quarantineCode: null,
  quarantineMessage: null,
  quarantineRule: null,
  senderAuth: {
    dkimPass: false,
    dkimDomain: null,
    arcPass: false,
    arcSealerDomain: null,
    rawAuthenticationResults: 'dkim=fail (body hash did not verify) header.d=x.com',
  },
  senderRefusal: refusal('MKT_PROV_SENDER_UNVERIFIED'),
  grade: { kind: 'absent', refusal: refusal('MKT_PROV_GRADE_UNAVAILABLE') },
  corroboration: {
    kind: 'never_attempted', rows: [], lastObservedAt: null,
    sentence: 'No channel has been consulted for this reply.',
    refusal: refusal('MKT_PROV_NEVER_CHECKED'),
  },
  postedOnDisplayed: null,
  postedAtSource: null,
  postDateRefusal: refusal('MKT_CLOCK_POST_TIME_UNKNOWN'),
  receivedAt: '2026-08-02T09:00:00.000Z',
  readAt: '2026-08-03T09:00:00.000Z',
  frame: FRAME,
  ...over,
});

describe('provenance keeps an outage apart from a forgery', () => {
  it('never prints the provider’s raw Authentication-Results header', async () => {
    // It names third-party infrastructure and this is a shared screen. What appears is the
    // derived state — and the two passes separately, because forwarding kills SPF and a single
    // "authenticated" would hide which channel carried the row.
    api().fetchReplyProvenance.mockResolvedValue(provenance());
    render(<ProvenancePanel replyId={12} />);
    const auth = await screen.findByTestId('mkt-sender-auth');
    expect(auth.textContent).toMatch(/dkim no pass/);
    expect(auth.textContent).toMatch(/arc no pass/);
    expect(document.body.textContent).not.toMatch(/body hash did not verify/);
  });

  it('shows the display name as a claim and not as the author', async () => {
    api().fetchReplyProvenance.mockResolvedValue(provenance());
    render(<ProvenancePanel replyId={12} />);
    // An attacker-chosen display name is exactly the field a forgery would dress up.
    expect(await screen.findByText(/claims to be @stranger/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/display name as supplied: LCX Support \(official\)/);
  });

  it('“nobody looked” is an honest empty, not an uncorroborated verdict', async () => {
    api().fetchReplyProvenance.mockResolvedValue(provenance());
    render(<ProvenancePanel replyId={12} />);
    const nothing = await screen.findByTestId('mkt-empty-nothing');
    expect(nothing.textContent).toMatch(/No corroboration has been attempted/i);
    expect(nothing.textContent).toMatch(/not about whether the post is real/i);
    // The engine's own sentence for the state, verbatim, beside this screen's framing of it.
    expect(nothing.textContent).toMatch(/No channel has been consulted for this reply\./);
  });

  it('a channel that could not answer says nothing about the post', async () => {
    api().fetchReplyProvenance.mockResolvedValue(provenance({
      corroboration: {
        kind: 'could_not_check',
        rows: [{
          field: 'posted_at', channel: 'oembed', outcome: 'could_not_check',
          observedValue: null, detail: 'The endpoint timed out.', undocumented: false,
          observedAt: '2026-08-03T08:00:00.000Z',
        }],
        lastObservedAt: '2026-08-03T08:00:00.000Z',
        sentence: 'The channel was asked at 08:00 and did not answer.',
      },
    }));
    render(<ProvenancePanel replyId={12} />);
    const block = await screen.findByTestId('mkt-corroboration-could_not_check');
    expect(block.textContent).toMatch(/says nothing about the post/i);
    expect(block.textContent).toMatch(/none of them is evidence that the post does not exist/i);
    // And it must NOT borrow the disagreement sentence.
    expect(block.textContent).not.toMatch(/DISAGREES/);
  });

  it('a disagreement demands a human and says re-running will not fix it', async () => {
    api().fetchReplyProvenance.mockResolvedValue(provenance({
      corroboration: {
        kind: 'disagrees',
        rows: [{
          field: 'author_handle', channel: 'oembed', outcome: 'disagrees',
          observedValue: 'someone_else', detail: 'oEmbed reports a different author.',
          undocumented: false, observedAt: '2026-08-03T08:00:00.000Z',
        }],
        lastObservedAt: '2026-08-03T08:00:00.000Z',
        sentence: 'oEmbed names a different author from the one this row claims.',
      },
    }));
    render(<ProvenancePanel replyId={12} />);
    const block = await screen.findByTestId('mkt-corroboration-disagrees');
    expect(block.textContent).toMatch(/named human has to read both texts/i);
    expect(block.textContent).toMatch(/not resolved by re-running/i);
    expect(block.textContent).toMatch(/oEmbed names a different author/);
  });

  it('an absent storage table is unknowable, not uncorroborated', async () => {
    api().fetchReplyProvenance.mockResolvedValue(provenance({
      corroboration: {
        kind: 'storage_absent', rows: [], lastObservedAt: null,
        sentence: 'The corroboration table does not exist on this environment.',
        refusal: refusal('MKT_POSTTIME_NOT_MIGRATED'),
      },
    }));
    render(<ProvenancePanel replyId={12} />);
    const note = await screen.findByTestId('mkt-empty-absent');
    expect(note.textContent).toMatch(/unknowable on this environment, not absent/i);
    expect(note.textContent).toMatch(/Do not read this as an uncorroborated row/i);
  });

  it('a lookup that was never attempted is not a failed lookup', async () => {
    api().fetchReplyProvenance.mockResolvedValue(provenance());
    const result: CorroborationResult = {
      replyId: 12, attempted: false, refusal: refusal('MKT_OEMBED_BREAKER_OPEN'),
      status: null, code: null, message: null, observedAt: null, wrote: [],
      postDateRecorded: false, postedOnDisplayed: null,
      grade: { kind: 'absent', refusal: refusal('MKT_PROV_GRADE_UNAVAILABLE') },
      quarantinedByLadder: false, disagreements: 0, degraded: null,
      requestedBy: 'nikhil', requestedAt: '2026-08-03T09:00:00.000Z',
    };
    api().corroborateReply.mockResolvedValue(result);
    const u = userEvent.setup();
    render(<ProvenancePanel replyId={12} />);
    await u.click(await screen.findByRole('button', { name: /Corroborate through/i }));

    // The breaker's own refusal, and NOT a result block claiming an observation was made.
    await screen.findByTestId('mkt-corroborate-not-attempted');
    expect(screen.queryByTestId('mkt-corroborate-result')).toBeNull();
    expect(screen.getByTestId('mkt-refusal-MKT_OEMBED_BREAKER_OPEN')).toBeTruthy();
  });

  it('a confirmed lookup reports what it wrote, including that no post date was written', async () => {
    api().fetchReplyProvenance.mockResolvedValue(provenance());
    api().corroborateReply.mockResolvedValue({
      replyId: 12, attempted: true, refusal: null, status: 'confirmed',
      code: 'OEMBED_OK', message: 'X returned the post.', observedAt: '2026-08-03T09:01:00.000Z',
      wrote: [{
        field: 'author_handle', channel: 'oembed', outcome: 'agrees', observedValue: 'stranger',
        detail: 'author matches', undocumented: false, observedAt: '2026-08-03T09:01:00.000Z',
      }],
      postDateRecorded: false, postedOnDisplayed: null,
      grade: { kind: 'absent', refusal: refusal('MKT_PROV_GRADE_UNAVAILABLE') },
      quarantinedByLadder: false, disagreements: 0, degraded: null,
      requestedBy: 'nikhil', requestedAt: '2026-08-03T09:01:00.000Z',
    } satisfies CorroborationResult);
    const u = userEvent.setup();
    render(<ProvenancePanel replyId={12} />);
    await u.click(await screen.findByRole('button', { name: /Corroborate through/i }));

    const block = await screen.findByTestId('mkt-corroborate-result');
    expect(block.textContent).toMatch(/1 observation written/);
    // A confirmed post is not the same as a recorded post date, and the two are stated apart.
    expect(block.textContent).toMatch(/no post date was written by this call/i);
    expect(block.textContent).toMatch(/X returned the post\./);
  });

  it('an absent grade refuses rather than printing a false ladder sentence', async () => {
    api().fetchReplyProvenance.mockResolvedValue(provenance());
    render(<ProvenancePanel replyId={12} />);
    // The ladder's unchecked rung would read "Corroboration has not been attempted", which is
    // false where a stored lookup exists — so the grade refuses instead of emitting it.
    expect(await screen.findByTestId('mkt-refusal-MKT_PROV_GRADE_UNAVAILABLE')).toBeTruthy();
    expect(screen.queryByTestId('mkt-provenance-grade')).toBeNull();
  });

  it('a quarantined row is held out of the queue and carries no grade', async () => {
    api().fetchReplyProvenance.mockResolvedValue(provenance({
      quarantined: true,
      quarantineCode: 'MKT_PROV_ID_COLLISION',
      quarantineMessage: 'This comment id was already claimed by different content.',
      quarantineRule: 'M0 defect 7 — a collision preserves the genuine reply',
    }));
    render(<ProvenancePanel replyId={12} />);
    const notes = await screen.findAllByTestId('mkt-empty-absent');
    const held = notes.find((n) => /quarantined/i.test(n.textContent ?? ''));
    expect(held?.textContent).toMatch(/not in the queue and not in any count/i);
    // The engine's own code and rule, untranslated: no mapping between the two quarantine
    // vocabularies exists anywhere, and inventing one on a screen would be a second
    // classification of why a row is held.
    expect(held?.textContent).toMatch(/MKT_PROV_ID_COLLISION/);
    expect(held?.textContent).toMatch(/a collision preserves the genuine reply/);
  });

  it('an unmounted provenance route does not claim the row is clean', async () => {
    api().fetchReplyProvenance.mockRejectedValue(new ApiError('nope', 404));
    render(<ProvenancePanel replyId={12} />);
    const note = await screen.findByTestId('mkt-empty-absent');
    expect(note.textContent).toMatch(/not on this environment/i);
    expect(note.textContent).toMatch(/not what this panel proved/i);
  });
});
