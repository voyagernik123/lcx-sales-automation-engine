import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApiError } from '@/lib/apiClient';
import * as marketingApi from '@/lib/api/marketing';
import type { MarketingReply } from '@/lib/api/marketing';
import { PostTimeMark, PostTimePanel } from '../PostTimePanel';
import type { ObservationFrame, PostTimeCoverageReport } from '../vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  "WE HAVE NOT LOOKED" AND "WE LOOKED AND COULD NOT CONFIRM" ARE NOT ONE FACT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The post-time fraction is the only corroboration rate this compartment has, because
 * oEmbed is the only channel independent of the mailbox — and the mailbox has no sender
 * check, so a fabricated reply arrives graded identically to a real one. Three defects are
 * available here and all three look calm on screen:
 *
 *  1. Rendering the fraction as a percentage. 3 of 4 and 750 of 1 000 are both "75%".
 *  2. Rendering an unmeasurable corpus as `0 of 0`, which is indistinguishable from full
 *     coverage.
 *  3. Rendering "nobody has looked" as "oEmbed could not confirm", which blames a channel
 *     that was never called and makes a frozen number read as a low one.
 *
 * ── HOW EACH TEST BELOW IS FALSIFIED, verified by reverting rather than by inspection ──
 *  · Collapse `PostTimeMark`'s three branches into one → the row-distinction tests fail,
 *    because a confirmed row and an unconfirmed row stop having different test ids and
 *    different sentences.
 *  · Drop the `sweepHasRun` argument and always print one of the two sentences → the pair of
 *    "frozen versus tried" tests fails on whichever sentence was dropped.
 *  · Compute `Math.round(numerator / denominator * 100)` anywhere in the measured branch →
 *    the no-percentage test fails.
 *  · Render `coverage === null` or `kind === 'absent'` as a `0 of 0` figure → the
 *    absent-population tests fail.
 *  · Stop passing `coverage.frame` to `ObservationFrameNote` → the every-figure-carries-its
 *    -frame test fails.
 */

vi.mock('@/lib/api/marketing', () => ({
  fetchCorroborationCoverage: vi.fn(),
}));

const api = () => marketingApi as unknown as { fetchCorroborationCoverage: Mock };

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

/* ════════ FIXTURES — every field the payload really carries ════════ */

const FRAME: ObservationFrame = {
  source: 'x_notification_email',
  captures: 'every non-quarantined reply the store still holds',
  doesNotCapture: ['replies X never emailed us about', 'anything on another platform'],
  knownBiases: ['controversy-weighted notification delivery'],
  completeness: 'census_of_own_corpus',
  windowFrom: '2026-05-05T00:00:00.000Z',
  windowTo: '2026-08-03T00:00:00.000Z',
  lastSuccessfulPollAt: null,
};

const reply = (over: Partial<MarketingReply> = {}): MarketingReply => ({
  id: 41,
  x_comment_id: '1900000000000000001',
  x_post_id: null,
  author_handle: 'someone',
  author_display: null,
  body: 'when is the listing',
  posted_at: null,
  posted_at_source: null,
  posted_on_displayed: null,
  received_at: '2026-08-02T09:00:00.000Z',
  status: 'new',
  sentiment: null,
  source_grade: 'C3',
  source_kind: 'x_notification_email',
  parse_failed: false,
  raw_email_cleared_at: null,
  sender_from: null,
  sender_auth_state: 'unverified',
  sender_dkim_domain: null,
  sender_auth_evidence: null,
  quarantined: false,
  quarantine_code: null,
  collision_of_comment_id: null,
  ...over,
});

const report = (over: Partial<PostTimeCoverageReport> = {}): PostTimeCoverageReport => ({
  migrated: true,
  evidenceTablePresent: true,
  coverage: {
    kind: 'measured',
    value: {
      numerator: 3,
      denominator: 4,
      ofWhat: 'non-quarantined replies still held',
      statement: 'Three of four held replies carry the date X published.',
      lookupEligible: 4,
      notLookupEligible: 0,
    },
    frame: FRAME,
  },
  channel: 'oembed',
  raisedBy: 'POST /v1/marketing/tick — runPostTimeSweep',
  refusals: [],
  readPerformsNoLookup: false,
  ...over,
});

/* ════════ THE PER-ROW SIGNAL — the anti-forgery difference ════════ */

describe('a corroborated row does not look like an uncorroborated one', () => {
  it('an unconfirmed post time says nothing independent confirms the post exists', () => {
    render(<PostTimeMark reply={reply()} />);
    const note = screen.getByTestId('mkt-posttime-unconfirmed-41');
    expect(note.textContent).toMatch(/no independent channel/i);
    // The load-bearing half: it names WHY that matters, not merely that a field is null.
    expect(note.textContent).toMatch(/fabricated row looks exactly like this one/i);
    expect(screen.queryByTestId('mkt-posttime-confirmed-41')).toBeNull();
  });

  it('a row oEmbed confirmed names the channel and says it is independent of the mailbox', () => {
    render(<PostTimeMark reply={reply({
      posted_at: '2026-08-01T00:00:00.000Z',
      posted_at_source: 'oembed',
      posted_on_displayed: '2026-08-01',
    })} />);
    const note = screen.getByTestId('mkt-posttime-confirmed-41');
    expect(note.textContent).toMatch(/oembed/);
    expect(note.textContent).toMatch(/independent of the mailbox/i);
    expect(screen.queryByTestId('mkt-posttime-unconfirmed-41')).toBeNull();
  });

  it('a date with no stated channel is its own third state, not a confirmation', () => {
    // Defect 5's exact shape: the email `Date:` header written into the column and then
    // read as X's timestamp. A row like this must not earn the confirmed tone.
    render(<PostTimeMark reply={reply({ posted_at: '2026-08-01T00:00:00.000Z' })} />);
    const note = screen.getByTestId('mkt-posttime-unsourced-41');
    expect(note.textContent).toMatch(/does not say which channel supplied it/i);
    expect(note.textContent).toMatch(/read it as unconfirmed/i);
    expect(screen.queryByTestId('mkt-posttime-confirmed-41')).toBeNull();
  });

  it('never prints a time of day for a date X published without one', () => {
    render(<PostTimeMark reply={reply({
      posted_at: '2026-08-01T13:45:00.000Z',
      posted_at_source: 'oembed',
      posted_on_displayed: '2026-08-01',
    })} />);
    const text = screen.getByTestId('mkt-posttime-confirmed-41').textContent ?? '';
    expect(text).toContain('2026-08-01');
    // X prints a DATE on an embed. A time of day here would be a fabricated observation.
    expect(text).not.toMatch(/13:45/);
    expect(text).toMatch(/no time of day on an embed/i);
  });
});

/* ════════ THE PANEL: FIVE READ STATES ════════ */

describe('the coverage read distinguishes a missing route from zero coverage', () => {
  it('an unmounted route says nothing measured, and does not claim coverage is zero', async () => {
    api().fetchCorroborationCoverage.mockRejectedValue(new ApiError('nope', 404));
    render(<PostTimePanel />);
    const note = await screen.findByTestId('mkt-empty-absent');
    expect(note.textContent).toMatch(/not on this environment/i);
    expect(note.textContent).toMatch(/Do not read this as zero coverage/i);
    expect(screen.queryByTestId('mkt-posttime-measured')).toBeNull();
  });

  it('a 403 says the reader lacks the role rather than that the read failed', async () => {
    api().fetchCorroborationCoverage.mockRejectedValue(new ApiError('approver only', 403));
    render(<PostTimePanel />);
    const note = await screen.findByTestId('mkt-not-permitted');
    expect(note.textContent).toMatch(/requires an approver/i);
    expect(screen.queryByTestId('mkt-empty-absent')).toBeNull();
  });

  it('a failed read refuses in the API’s own words and claims no rate in either direction', async () => {
    api().fetchCorroborationCoverage.mockRejectedValue(new Error('the corpus query timed out'));
    render(<PostTimePanel />);
    expect(await screen.findByText('the corpus query timed out')).toBeTruthy();
    expect(screen.getByTestId('mkt-refusal-DATA_ABSENT_NOT_ZERO').textContent)
      .toMatch(/is not a corroboration rate of zero, and it is not a full one/i);
  });
});

/* ════════ THE PANEL: THREE PAYLOAD STATES ════════ */

describe('an absent population is never rendered as a fraction', () => {
  it('no queue table means an absent corpus, not zero of zero', async () => {
    api().fetchCorroborationCoverage.mockResolvedValue(report({ migrated: false, coverage: null }));
    render(<PostTimePanel />);
    const note = await screen.findByTestId('mkt-empty-absent');
    expect(note.textContent).toMatch(/no corpus to measure/i);
    expect(note.textContent).toMatch(/absent population and not zero coverage/i);
    expect(screen.queryByTestId('mkt-posttime-measured')).toBeNull();
  });

  it('an absent Figure prints the engine’s refusal instead of a figure', async () => {
    api().fetchCorroborationCoverage.mockResolvedValue(report({
      coverage: {
        kind: 'absent',
        refusal: {
          code: 'DATA_ABSENT_NOT_ZERO',
          sentence: 'There are no non-quarantined replies held, so there is no fraction to report.',
          rule: {
            instrument: 'desk_policy',
            provision: 'absent data produces a refusal, never a zero',
            text: 'A zero and an absence look identical on a panel and mean opposite things.',
          },
          recovery: { kind: 'not_recoverable', why: 'An empty corpus is not a defect to clear.' },
          matched: null,
          ruleSetVersion: 1,
        },
      },
    }));
    render(<PostTimePanel />);
    expect(await screen.findByText(
      'There are no non-quarantined replies held, so there is no fraction to report.',
    )).toBeTruthy();
    expect(screen.queryByTestId('mkt-posttime-measured')).toBeNull();
  });
});

describe('the measured figure is a fraction and carries its frame', () => {
  it('renders numerator and denominator separately and computes no percentage', async () => {
    api().fetchCorroborationCoverage.mockResolvedValue(report());
    render(<PostTimePanel />);
    const block = await screen.findByTestId('mkt-posttime-measured');
    const text = block.textContent ?? '';
    expect(text).toMatch(/3\s*of\s*4/);
    // 3 of 4 and 750 of 1 000 are both "75%". No ratio may appear anywhere.
    expect(text).not.toContain('%');
    expect(text).not.toMatch(/\b75\b/);
    // The engine's own sentence about its own count, verbatim.
    expect(text).toContain('Three of four held replies carry the date X published.');
    expect(text).toContain('non-quarantined replies still held');
  });

  it('every figure carries its observation frame', async () => {
    api().fetchCorroborationCoverage.mockResolvedValue(report());
    render(<PostTimePanel />);
    const frame = await screen.findByTestId('mkt-observation-frame');
    expect(frame.textContent).toMatch(/census of own corpus/i);
    expect(frame.textContent).toMatch(/replies X never emailed us about/);
    // `null` last-poll must read as a pipeline caveat, never as a blank.
    expect(frame.textContent).toMatch(/never/i);
  });

  it('names the route that raises the number, so a low figure is actionable', async () => {
    api().fetchCorroborationCoverage.mockResolvedValue(report());
    render(<PostTimePanel />);
    expect((await screen.findByText(/runPostTimeSweep/)).textContent).toBeTruthy();
    expect(screen.getByText(/performed no lookup and stored nothing/i)).toBeTruthy();
  });
});

describe('a frozen fraction and a failed lookup are different sentences', () => {
  it('without the evidence table, unconfirmed rows are ones nobody looked at', async () => {
    // 0062 absent: the sweep refuses BEFORE the first request, because it has nowhere to
    // record what it observed. Reporting these as "oEmbed could not confirm" would blame a
    // channel that was never called.
    api().fetchCorroborationCoverage.mockResolvedValue(report({
      evidenceTablePresent: false,
      coverage: {
        kind: 'measured',
        value: {
          numerator: 0,
          denominator: 9,
          ofWhat: 'non-quarantined replies still held',
          statement: 'No held reply carries a date from X.',
          lookupEligible: 7,
          notLookupEligible: 2,
        },
        frame: FRAME,
      },
    }));
    render(<PostTimePanel />);
    const block = await screen.findByTestId('mkt-posttime-measured');
    const text = block.textContent ?? '';
    expect(text).toMatch(/nobody has looked/i);
    expect(text).toMatch(/no lookup has been attempted/i);
    expect(text).toMatch(/frozen, not low/i);
    expect(text).not.toMatch(/tried, not confirmed/i);
    // And the never-fillable population is named as a schema limit, not a channel fault.
    expect(text).toMatch(/never fillable this way/i);
    expect(text).toMatch(/schema limit, not a broken channel/i);
  });

  it('with the evidence table, unconfirmed rows are ones oEmbed did not answer for', async () => {
    api().fetchCorroborationCoverage.mockResolvedValue(report({
      evidenceTablePresent: true,
      coverage: {
        kind: 'measured',
        value: {
          numerator: 2,
          denominator: 9,
          ofWhat: 'non-quarantined replies still held',
          statement: 'Two of nine held replies carry a date from X.',
          lookupEligible: 7,
          notLookupEligible: 2,
        },
        frame: FRAME,
      },
    }));
    render(<PostTimePanel />);
    const text = (await screen.findByTestId('mkt-posttime-measured')).textContent ?? '';
    expect(text).toMatch(/tried, not confirmed/i);
    expect(text).toMatch(/deleted, protected, or never real/i);
    expect(text).not.toMatch(/nobody has looked/i);
  });

  it('prints the migration refusal that explains why the fraction cannot move', async () => {
    api().fetchCorroborationCoverage.mockResolvedValue(report({
      evidenceTablePresent: false,
      refusals: [{
        code: 'MKT_POSTTIME_NOT_MIGRATED',
        sentence: 'The fraction below is real, and it cannot move: migration 0062 has not been applied.',
        rule: 'doctrine rule 5 — nothing leaves without a record',
        remedy: 'Apply 0062_marketing_gate_decisions.sql.',
      }],
    }));
    render(<PostTimePanel />);
    const note = await screen.findByTestId('mkt-wire-refusal-MKT_POSTTIME_NOT_MIGRATED');
    expect(note.textContent).toMatch(/it cannot move/i);
    expect(note.textContent).toMatch(/Apply 0062_marketing_gate_decisions\.sql/);
  });
});
