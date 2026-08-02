import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DeskMeasurement } from '../DeskMeasurement';
import { TriageBoard } from '../TriageBoard';
import { LowerBoundTile } from '../DeskAtoms';
import { notificationCensusFrame } from '../vocabulary';
import type { MarketingReply, MarketingSummary } from '@/lib/api/marketing';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  A RATIO OVER A PAGE IS NOT A RATIO OVER A POPULATION.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * THE DEFECT, and no attacker was needed for it. `fetchMarketingQueue` passes no `limit`,
 * `routes/marketing.ts:70` defaults to 50, and both panels divided by `queue.length`. With
 * 120 open replies whose 50 oldest carry an oEmbed post time, `DeskMeasurement` rendered
 *
 *     Post-time coverage — 100%
 *     50 of 50 open items carry a true post time
 *
 * while `summary.oldestSincePostedHours`, from the same response on the same screen,
 * correctly refused with "70 of 120 open replies have no post date". Two surfaces, one
 * fact, opposite answers, and the confident one was the wrong one. `TriageBoard` printed
 * the matching sentence: "Measured over 50 of 50 open items … Every open item carries one".
 *
 * The fixture below IS that input. Each test asserts the sentence a reader would take away,
 * not an internal variable — a coverage figure is a claim made to a human.
 */

const reply = (id: number, postedAt: string | null): MarketingReply => ({
  id,
  x_comment_id: `c${String(id)}`,
  x_post_id: 'p1',
  author_handle: 'someone',
  author_display: 'Someone',
  body: 'Where is my withdrawal?',
  permalink: `https://x.com/someone/status/${String(id)}`,
  status: 'new',
  posted_at: postedAt,
  received_at: '2026-08-01T09:00:00.000Z',
  source_kind: 'x_notification_email',
  source_grade: 'C3',
  quarantined: false,
  quarantine_reason: null,
  collision_of_comment_id: null,
  parse_failed: false,
  sentiment: null,
  created_at: '2026-08-01T09:00:00.000Z',
} as unknown as MarketingReply);

/** The 50 loaded rows: every one of them carries a post time. */
const PAGE: readonly MarketingReply[] = Array.from(
  { length: 50 },
  (_, i) => reply(i + 1, '2026-08-01T08:00:00.000Z'),
);

/** The population behind that page: 120 open, only 50 with a post time. */
const summary = (over: Partial<MarketingSummary> = {}): MarketingSummary => ({
  counts: { new: 120 },
  oldestUnansweredHours: 30,
  oldestObservedWaitingHours: 30,
  oldestSincePostedHours: {
    code: 'MKT_CLOCK_POST_TIME_UNKNOWN',
    message: '70 of 120 open replies have no post date from X, so how long the customer has been waiting is not known.',
    needs: 'A successful oEmbed lookup per reply.',
  },
  postTimeCoverage: { openRows: 120, withPostTime: 50 },
  suspicious: 0,
  unparsed: 0,
  quarantined: 0,
  collisions: 0,
  mailConfigured: true,
  migrated: true,
  ...over,
} as MarketingSummary);

const NOW = Date.parse('2026-08-02T12:00:00.000Z');

describe('post-time coverage is stated over the population, not the page', () => {
  it('does not render 100% when 70 of 120 open replies have no post date', () => {
    render(<DeskMeasurement queue={PAGE} summary={summary()} now={NOW} />);
    const said = screen.getByTestId('mkt-post-time-coverage').textContent ?? '';
    expect(said).toMatch(/50 of 120/);
    expect(said).not.toMatch(/50 of 50/);
    // The figure beside the sentence must agree with it.
    expect(screen.getByText('42%')).toBeTruthy();
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('says which of the two numbers came from the page', () => {
    render(<DeskMeasurement queue={PAGE} summary={summary()} now={NOW} />);
    expect(screen.getByTestId('mkt-post-time-coverage').textContent)
      .toMatch(/not over the 50 loaded here/);
  });

  it('refuses rather than falling back to the page when the API omits coverage', () => {
    const without = summary();
    delete (without as { postTimeCoverage?: unknown }).postTimeCoverage;
    render(<DeskMeasurement queue={PAGE} summary={without} now={NOW} />);
    const said = screen.getByTestId('mkt-post-time-coverage').textContent ?? '';
    expect(said).toMatch(/not being reported by this environment/);
    expect(said).not.toMatch(/\d+ of \d+ open items carry/);
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('renders no coverage percentage at all when the summary read failed', () => {
    render(<DeskMeasurement queue={PAGE} summary={null} now={NOW} />);
    expect(screen.getByTestId('mkt-post-time-coverage').textContent)
      .toMatch(/not being reported/);
  });
});

describe('the triage clock says what it measured over', () => {
  const board = (s: MarketingSummary | null) => render(
    <MemoryRouter>
      <TriageBoard queue={PAGE} now={NOW} onChanged={vi.fn()} summary={s} />
    </MemoryRouter>,
  );

  it('does not claim every open item carries a post time', () => {
    board(summary());
    const said = screen.getByTestId('mkt-clock-coverage').textContent ?? '';
    expect(said).toMatch(/120 open in total/);
    expect(said).toMatch(/The other 70 are excluded/);
    expect(said).not.toMatch(/Every open item carries one/);
  });

  it('admits the population is unknown rather than assuming the page is all of it', () => {
    const without = summary();
    delete (without as { postTimeCoverage?: unknown }).postTimeCoverage;
    board(without);
    const said = screen.getByTestId('mkt-clock-coverage').textContent ?? '';
    expect(said).toMatch(/is not being reported by this environment/);
    expect(said).toMatch(/not assumed to be all of it/);
  });

  it('still says "every open item carries one" when that is actually true', () => {
    // The sentence is not simply deleted — it is made conditional on the real population.
    board(summary({ postTimeCoverage: { openRows: 50, withPostTime: 50 } }));
    expect(screen.getByTestId('mkt-clock-coverage').textContent)
      .toMatch(/Every open item carries one/);
  });
});

describe('an observation frame states the window the figure was computed over', () => {
  /*
   * Both panels passed `windowFrom = now − 7 days` while the queue query has NO time bound
   * and retention is 90 days. A reply received 40 days ago and still `proposed` is inside
   * the count, so the frame's one job — saying what the window could and could not see —
   * was being done falsely, and a standing backlog read as a week's worth of new work.
   * `checkFrame` only verifies the window runs forwards, so nothing caught it.
   */
  const windows = (root: HTMLElement) =>
    [...root.querySelectorAll('[data-testid="mkt-observation-frame"]')]
      .map((el) => el.textContent ?? '');

  it('frames desk figures over the retention boundary, not over seven days', () => {
    const { container } = render(<DeskMeasurement queue={PAGE} summary={summary()} now={NOW} />);
    const found = windows(container);
    expect(found.length).toBeGreaterThan(0);
    // 2026-08-02 minus 90 days is 2026-05-04; minus 7 would be 2026-07-26.
    for (const w of found) {
      expect(w).toMatch(/2026-05-04/);
      expect(w).not.toMatch(/2026-07-26/);
    }
  });

  it('frames the queue tile the same way on the triage board', () => {
    const { container } = render(
      <MemoryRouter>
        <TriageBoard queue={PAGE} now={NOW} onChanged={vi.fn()} summary={summary()} />
      </MemoryRouter>,
    );
    const found = windows(container);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((w) => /2026-05-04/.test(w))).toBe(true);
    expect(found.every((w) => !/2026-07-26/.test(w))).toBe(true);
  });
});

describe('two populations do not share one framing', () => {
  it('gives the suspicious and unparsed tiles a frame each, naming their own population', () => {
    const { container } = render(
      <DeskMeasurement queue={PAGE} summary={summary({ suspicious: 3, unparsed: 4 })} now={NOW} />,
    );
    // `suspicious` is open rows only, capped at 200. `unparsed` is the whole table.
    expect(container.textContent).toMatch(/at most the 200 most recent open rows/);
    expect(container.textContent).toMatch(/quarantined rows included/);
    // And the count of frames rose with them: every figure on this panel carries one.
    const frames = container.querySelectorAll('[data-testid="mkt-observation-frame"]');
    expect(frames.length).toBeGreaterThanOrEqual(4);
  });

  it('says the injection markers are English-only rather than implying coverage', () => {
    const { container } = render(
      <DeskMeasurement queue={PAGE} summary={summary({ suspicious: 1 })} now={NOW} />,
    );
    expect(container.textContent).toMatch(/marker list is ASCII English/);
  });
});

describe('LowerBoundTile keeps the promises its docblock makes', () => {
  it('renders null as "not observable", never as 0', () => {
    render(<LowerBoundTile label="Anything" value={null} frame={notificationCensusFrame('2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z', null)} />);
    expect(screen.getByText('not observable')).toBeTruthy();
  });

  it('labels a count as a lower bound, in the value itself', () => {
    const { container } = render(
      <LowerBoundTile label="Anything" value={7} frame={notificationCensusFrame('2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z', null)} />,
    );
    expect(within(container).getByText('≥ 7')).toBeTruthy();
    expect(container.textContent).toMatch(/The true figure is unknown and higher/);
  });
});
