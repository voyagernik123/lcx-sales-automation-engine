import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Readout } from '../Readout';
import type { Readout as Brief, ReadoutItem } from '@/lib/api/readout';
import * as apiClient from '@/lib/apiClient';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE 07:00 READOUT SCREEN — what it must never be able to show.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This is the one surface that TELLS rather than waits to be asked, so the failure worth
 * guarding is not a missing field. It is a brief that reads CALM when the truthful answer
 * is "there is material you cannot see", or "the read never happened", or "this order is
 * the clock and you are reading it as importance".
 *
 * ── WHAT EACH TEST DEFENDS ───────────────────────────────────────────────────
 *  1. THE REDACTION IS VISIBLE: "3 ITEM(S) WITHHELD" is on the screen, above the list,
 *     with the compartments the reader does not hold named — and the withheld ITEM is
 *     nowhere, because the count is the reader's and the content is not.
 *  2. Four states never collapse: not-loaded, present-but-withheld, genuinely-empty and
 *     ranked each render differently and none renders as another.
 *  3. A null count renders NOT READ and never 0.
 *  4. The ranking basis is on the screen beside the list AND beside every position
 *     number, and the refused orderings are rendered with their reasons.
 *  5. The order is the server's — no browser-side re-sort.
 *  6. The ObservationFrame and the environment label are rendered, and an unnameable
 *     database renders as NOT NAMED rather than as a plausible string.
 *  7. THE SCREEN CANNOT SAY "ALL CLEAR". Asserted against the whole document in the two
 *     states where a reader is most tempted to read it that way.
 *  8. The 07:00 that is not true is on the screen, not only in the payload.
 *
 * ── TEST DISCIPLINE ──────────────────────────────────────────────────────────
 * ASSERT-IN-WAITFOR throughout: the POSITIVE assertion sits INSIDE the waitFor so it
 * cannot read a DOM that has not rendered. NEGATIVE assertions stay OUTSIDE, after a
 * positive barrier has settled — `not.toMatch` inside a waitFor passes instantly against
 * an empty document, which is a false pass that has reached CI in this repo three times.
 * `scripts/doctrine-lint.mjs` rule 5 enforces it. No timeout is ever raised to fix a flake.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────
 * jsdom has no layout and no paint, so "the withheld banner is impossible to miss" is
 * asserted only as "it is in the document, above the list, and not behind a control".
 * That is a real regression guard and it is not a claim about what a human perceives.
 */

vi.mock('@/lib/apiClient', async () => {
  const real = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return { ...real, request: vi.fn() };
});

const mockedRequest = apiClient.request as unknown as ReturnType<typeof vi.fn>;

/*
 * BRACES, NOT A CONCISE ARROW. `mockReset()` RETURNS the mock, so a concise arrow hands
 * vitest a function as the hook's return value, which vitest treats as a TEARDOWN
 * callback and calls after the test — invoking the subject with the rejection configured
 * by the error-path test attached to nothing. Recorded on the control-register test
 * after it cost twenty minutes there.
 */
beforeEach(() => {
  mockedRequest.mockReset();
});

function item(over: Partial<ReadoutItem> = {}): ReadoutItem {
  return {
    rank: 1,
    id: 'n1',
    rule: 'deal_stalled',
    title: 'Deal stalled: Acme',
    detail: 'no movement for 9 days in diligence',
    href: '/deal-board',
    workspace: 'sales',
    createdAt: '2026-08-06T06:00:00.000Z',
    ageHours: 1,
    unread: true,
    ...over,
  };
}

/** A brief in its least alarming legitimate state: read, ranked, nothing withheld. */
function brief(over: Partial<Brief> = {}): Brief {
  return {
    contract: 'notifications.readout.v1',
    state: 'ranked',
    frame: {
      observedAt: '2026-08-06T07:00:00.000Z',
      windowFrom: '2026-08-05T07:00:00.000Z',
      windowTo: '2026-08-06T07:00:00.000Z',
      windowHours: 24,
      environment: 'production · supabase:db.abcd.supabase.co/postgres',
      source: 'notifications',
      scopes: ['sales', '_desk'],
      scheduled: false,
      deliveredBy: 'request',
      scheduleStatement:
        'NOTHING FIRES THIS AT 07:00. There is no scheduler, no cron entry and no delivery record: this '
        + 'brief was computed because it was requested.',
    },
    ranking: {
      basis: 'recency',
      direction: 'newest_first',
      field: 'notifications.created_at',
      statement:
        'ORDERED BY RECENCY — newest first, on notifications.created_at, and by nothing else. This is NOT a '
        + 'severity order. Position 1 is the most recent item, not the most serious one.',
      notRankedBy: [
        { key: 'severity', why: 'The notifications table has no severity, weight or priority column.' },
        { key: 'frequency_as_magnitude', why: 'How often a rule fires is not how much each firing matters.' },
      ],
    },
    items: [item()],
    unplaceable: [],
    counts: { fetched: 1, inWindow: 1, shown: 1, unreadInScopeAllTime: 1, unplaceable: 0 },
    redaction: {
      scopesHeld: ['sales', '_desk'],
      compartmentsNotHeld: ['gps', 'marketing'],
      withheld: 0,
      unattributed: 0,
      countFrame: 'whole_ledger',
      statement: 'Nothing is being withheld from you in this ledger, and no row lacks a compartment.',
      droppedOutOfScope: 0,
    },
    refusals: [{
      code: 'READOUT_NOT_SCHEDULED',
      sentence: 'NOTHING FIRES THIS AT 07:00. There is no scheduler, no cron entry and no delivery record.',
      rule: {
        instrument: 'house_doctrine',
        provision: 'An inference is never laundered into a certainty',
        text: 'A cadence that nothing enforces is never described as a schedule.',
      },
    }],
    ...over,
  };
}

/** Everything the reader can actually read, as one string. */
const pageText = () => document.body.textContent ?? '';

/* ════════════════════════════════════════════════════════════════════════════
 *  1. THE REDACTION IS VISIBLE
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the redaction is visible on screen', () => {
  it('renders the withheld count with the compartments the reader does not hold', async () => {
    mockedRequest.mockResolvedValue(brief({
      redaction: {
        scopesHeld: ['sales', '_desk'],
        compartmentsNotHeld: ['gps', 'marketing', 'distribution'],
        withheld: 3,
        unattributed: 1,
        countFrame: 'whole_ledger',
        statement:
          '3 item(s) sit in compartments you do not hold and 1 records no compartment at all. Both counts are '
          + 'over the whole ledger rather than this window.',
        droppedOutOfScope: 0,
      },
      refusals: [{
        code: 'READOUT_ITEMS_WITHHELD',
        sentence: '3 item(s) exist in compartments you do not hold and are NOT in this brief.',
        rule: {
          instrument: 'workspace_constitution',
          provision: 'Need-to-know — the redaction is visible',
          text: 'A reader is shown THAT material exists and how much, never what it says.',
        },
      }],
    }));
    render(<Readout />);

    await waitFor(() => {
      const t = screen.getByTestId('redaction-banner').textContent ?? '';
      // The NUMBER, in the sentence a human reads — not a shorter list.
      expect(t).toMatch(/3 ITEM\(S\) WITHHELD/);
      expect(t).toMatch(/1 UNATTRIBUTED/);
      expect(t).toMatch(/gps, marketing, distribution/);
      // And the frame of the count, so it is not subtracted from the window count.
      expect(t).toMatch(/whole ledger, not this window/i);
    });
    // The banner is ABOVE the list, not a footer.
    const banner = screen.getByTestId('redaction-banner');
    const list = screen.getByTestId('readout-items');
    expect(banner.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('never renders the withheld content, only the count', async () => {
    // The API cannot send out-of-compartment items — it drops them and refuses — so what
    // is asserted here is that the SCREEN invents no place for them either: three items
    // withheld, one item rendered, and no room anywhere for the other three.
    mockedRequest.mockResolvedValue(brief({
      redaction: {
        scopesHeld: ['sales', '_desk'],
        compartmentsNotHeld: ['gps'],
        withheld: 3,
        unattributed: 0,
        countFrame: 'whole_ledger',
        statement: '3 item(s) sit in compartments you do not hold.',
        droppedOutOfScope: 0,
      },
    }));
    render(<Readout />);
    await waitFor(() => {
      expect(screen.getByTestId('redaction-banner').textContent).toMatch(/3 ITEM\(S\) WITHHELD/);
    });
    expect(document.querySelectorAll('[data-testid^="readout-item-"]')).toHaveLength(1);
  });

  it('says a withheld count that could not be read is NOT READ, not zero', async () => {
    mockedRequest.mockResolvedValue(brief({
      state: 'not_loaded',
      items: null,
      redaction: {
        scopesHeld: ['sales', '_desk'],
        compartmentsNotHeld: ['gps'],
        withheld: null,
        unattributed: null,
        countFrame: 'whole_ledger',
        statement: 'How much material exists in compartments you do not hold is UNKNOWN here. Unknown is not zero.',
        droppedOutOfScope: 0,
      },
      counts: { fetched: null, inWindow: null, shown: null, unreadInScopeAllTime: null, unplaceable: null },
    }));
    render(<Readout />);
    await waitFor(() => {
      const t = screen.getByTestId('redaction-unknown').textContent ?? '';
      expect(t).toMatch(/NOT READ/);
      expect(t).toMatch(/Unknown is not zero/);
    });
    expect(screen.queryByTestId('redaction-banner')).toBeNull();
    expect(screen.queryByTestId('redaction-none')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  2–3. FOUR STATES, AND A NULL THAT NEVER RENDERS AS ZERO
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the four states never collapse on screen', () => {
  it('NOT LOADED: says nothing was looked at, not that nothing happened', async () => {
    mockedRequest.mockResolvedValue(brief({
      state: 'not_loaded',
      items: null,
      counts: { fetched: null, inWindow: null, shown: null, unreadInScopeAllTime: null, unplaceable: null },
      redaction: {
        scopesHeld: ['sales', '_desk'],
        compartmentsNotHeld: ['gps'],
        withheld: null,
        unattributed: null,
        countFrame: 'whole_ledger',
        statement: 'How much material exists in compartments you do not hold is UNKNOWN here.',
        droppedOutOfScope: 0,
      },
      refusals: [{
        code: 'READOUT_LEDGER_ABSENT',
        sentence: 'There is no notifications relation on this environment, so no item could be examined at all.',
        rule: {
          instrument: 'house_doctrine',
          provision: 'Absent data refuses',
          text: 'A brief that could not be computed is NOT a brief saying the night was quiet.',
        },
      }],
    }));
    render(<Readout />);

    await waitFor(() => {
      expect(screen.getByTestId('items-not-loaded').textContent)
        .toMatch(/short because nothing was looked at/i);
    });
    await waitFor(() => {
      expect(screen.getByTestId('refusal-READOUT_LEDGER_ABSENT').textContent).toMatch(/READOUT_LEDGER_ABSENT/);
    });
    // Negatives, OUTSIDE the barrier, after the positives settled.
    expect(screen.queryByTestId('items-empty')).toBeNull();
    expect(screen.queryByTestId('items-withheld-only')).toBeNull();
    expect(screen.queryByTestId('readout-items')).toBeNull();
  });

  it('every null count renders NOT READ and never 0', async () => {
    mockedRequest.mockResolvedValue(brief({
      state: 'not_loaded',
      items: null,
      counts: { fetched: null, inWindow: null, shown: null, unreadInScopeAllTime: null, unplaceable: null },
    }));
    render(<Readout />);
    await waitFor(() => {
      const t = screen.getByTestId('readout-counts').textContent ?? '';
      expect(t).toMatch(/NOT READ/);
      expect([...t.matchAll(/NOT READ/g)]).toHaveLength(3);
    });
    expect(screen.getByTestId('readout-counts').textContent).not.toMatch(/\b0\b/);
  });

  it('PRESENT-BUT-WITHHELD: an empty window with withheld rows is not an empty window', async () => {
    mockedRequest.mockResolvedValue(brief({
      state: 'withheld_only',
      items: [],
      counts: { fetched: 0, inWindow: 0, shown: 0, unreadInScopeAllTime: 4, unplaceable: 0 },
      redaction: {
        scopesHeld: ['sales', '_desk'],
        compartmentsNotHeld: ['gps', 'marketing'],
        withheld: 7,
        unattributed: 0,
        countFrame: 'whole_ledger',
        statement: '7 item(s) sit in compartments you do not hold.',
        droppedOutOfScope: 0,
      },
    }));
    render(<Readout />);

    await waitFor(() => {
      const t = screen.getByTestId('items-withheld-only').textContent ?? '';
      expect(t).toMatch(/NOTHING YOU MAY READ IN THIS WINDOW/);
      expect(t).toMatch(/PRESENT-BUT-WITHHELD, not empty/);
      expect(t).toMatch(/7/);
      // It must not claim the withheld material is inside this window.
      expect(t).toMatch(/does not claim the withheld material is inside this window/i);
    });
    expect(screen.queryByTestId('items-empty')).toBeNull();
    expect(screen.queryByTestId('items-not-loaded')).toBeNull();
  });

  it('GENUINELY EMPTY: the claim names the window and the compartments it is about', async () => {
    mockedRequest.mockResolvedValue(brief({
      state: 'genuinely_empty',
      items: [],
      counts: { fetched: 0, inWindow: 0, shown: 0, unreadInScopeAllTime: 0, unplaceable: 0 },
      refusals: [{
        code: 'READOUT_WINDOW_GENUINELY_EMPTY',
        sentence: 'The ledger was read and holds no item for your compartments in this window.',
        rule: {
          instrument: 'house_doctrine',
          provision: 'Three states are never collapsed',
          text: 'Not-loaded, present-but-withheld and genuinely-empty are three different facts.',
        },
      }],
    }));
    render(<Readout />);

    await waitFor(() => {
      const t = screen.getByTestId('items-empty').textContent ?? '';
      expect(t).toMatch(/NO ITEMS IN THIS WINDOW/);
      // "Nothing found" is only interpretable beside what was searched.
      expect(t).toMatch(/2026-08-05T07:00:00\.000Z/);
      expect(t).toMatch(/2026-08-06T07:00:00\.000Z/);
      expect(t).toMatch(/sales, _desk/);
      expect(t).toMatch(/claim about this window/i);
    });
    expect(screen.queryByTestId('items-withheld-only')).toBeNull();
    expect(screen.queryByTestId('items-not-loaded')).toBeNull();
  });

  it('holds unrankable items in their own bucket rather than dropping or placing them', async () => {
    mockedRequest.mockResolvedValue(brief({
      unplaceable: [{
        id: 'bad1',
        rule: 'governance_control_unfiled',
        title: 'Control not evaluated: command_decision dec_01',
        workspace: 'governance',
        rawCreatedAt: 'not-a-date',
      }],
      counts: { fetched: 2, inWindow: 1, shown: 1, unreadInScopeAllTime: 2, unplaceable: 1 },
    }));
    render(<Readout />);
    await waitFor(() => {
      const t = screen.getByTestId('unplaceable-bucket').textContent ?? '';
      expect(t).toMatch(/could not be read as an instant/i);
      expect(t).toMatch(/unranked rather than dropped/i);
    });
    await waitFor(() => {
      expect(screen.getByTestId('unplaceable-bad1').textContent).toMatch(/not-a-date/);
    });
    // And it is NOT in the ranked list.
    expect(screen.queryByTestId('readout-item-bad1')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  4–5. THE RANK IS NAMED, AND IT IS THE SERVER'S
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the ranking basis is on the screen, beside the list', () => {
  it('states that the order is recency and not severity', async () => {
    mockedRequest.mockResolvedValue(brief());
    render(<Readout />);
    await waitFor(() => {
      const t = screen.getByTestId('ranking-statement').textContent ?? '';
      expect(t).toMatch(/ORDERED BY RECENCY/);
      expect(t).toMatch(/NOT a severity order/);
      expect(t).toMatch(/not the most serious one/);
    });
  });

  it('renders every refused ordering with its reason', async () => {
    mockedRequest.mockResolvedValue(brief());
    render(<Readout />);
    await waitFor(() => {
      const t = screen.getByTestId('ranking-rejected').textContent ?? '';
      expect(t).toMatch(/NOT RANKED BY/);
      expect(t).toMatch(/severity/);
      expect(t).toMatch(/frequency_as_magnitude/);
      expect(t).toMatch(/not how much each firing matters/);
    });
  });

  it('carries the basis beside every position number, not only in the caption', async () => {
    mockedRequest.mockResolvedValue(brief({
      items: [item({ id: 'a', rank: 1 }), item({ id: 'b', rank: 2, createdAt: '2026-08-06T02:00:00.000Z', ageHours: 5 })],
      counts: { fetched: 2, inWindow: 2, shown: 2, unreadInScopeAllTime: 2, unplaceable: 0 },
    }));
    render(<Readout />);
    await waitFor(() => {
      expect(screen.getByTestId('readout-item-a').textContent).toMatch(/#1 · most recent/);
    });
    await waitFor(() => {
      expect(screen.getByTestId('readout-item-b').textContent).toMatch(/#2 · most recent/);
    });
  });

  it('renders the server order and does not re-sort it in the browser', async () => {
    // The SECOND item is unread and older. A browser-side "unread first" would move it,
    // and the payload says unread is a fact about the reader rather than about the item.
    mockedRequest.mockResolvedValue(brief({
      items: [
        item({ id: 'newer-read', rank: 1, unread: false, createdAt: '2026-08-06T06:30:00.000Z', ageHours: 0.5 }),
        item({ id: 'older-unread', rank: 2, unread: true, createdAt: '2026-08-06T01:00:00.000Z', ageHours: 6 }),
      ],
      counts: { fetched: 2, inWindow: 2, shown: 2, unreadInScopeAllTime: 1, unplaceable: 0 },
    }));
    render(<Readout />);
    await waitFor(() => {
      expect(screen.getByTestId('readout-item-newer-read').textContent).toMatch(/READ/);
    });
    const ids = [...document.querySelectorAll('[data-testid^="readout-item-"]')]
      .map((n) => n.getAttribute('data-testid'));
    expect(ids).toEqual(['readout-item-newer-read', 'readout-item-older-unread']);
  });

  it('shows a truncation admission when the server says the order is over a subset', async () => {
    mockedRequest.mockResolvedValue(brief({
      counts: { fetched: 50, inWindow: 50, shown: 50, unreadInScopeAllTime: 60, unplaceable: 0 },
      refusals: [{
        code: 'READOUT_TRUNCATED',
        sentence:
          'The fetch cap of 50 was reached and the oldest item fetched is still inside this window, so the '
          + 'order below is a recency order over a SUBSET.',
        rule: {
          instrument: 'house_doctrine',
          provision: 'An inference is never laundered into a certainty',
          text: 'A ranking computed over a subset is reported as a ranking over a subset.',
        },
      }],
    }));
    render(<Readout />);
    await waitFor(() => {
      expect(screen.getByTestId('refusal-READOUT_TRUNCATED').textContent).toMatch(/over a SUBSET/);
    });
    await waitFor(() => {
      const t = screen.getByTestId('count-fetched-from-the-ledger').textContent ?? '';
      expect(t).toMatch(/50/);
      expect(t).toMatch(/READOUT_TRUNCATED/);
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  6–8. THE FRAME, THE 07:00 THAT IS NOT TRUE, AND THE SENTENCE THAT MUST NOT EXIST
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the observation frame and the schedule that does not exist', () => {
  it('renders what was observed, when, over what window, and out of which database', async () => {
    mockedRequest.mockResolvedValue(brief());
    render(<Readout />);
    await waitFor(() => {
      const t = screen.getByTestId('readout-frame').textContent ?? '';
      expect(t).toMatch(/2026-08-06T07:00:00\.000Z/);
      expect(t).toMatch(/24 hours/);
      expect(t).toMatch(/notifications/);
      expect(t).toMatch(/production · supabase:db\.abcd\.supabase\.co\/postgres/);
      expect(t).toMatch(/sales, _desk/);
    });
  });

  it('renders an unnameable database as NOT NAMED rather than as a plausible string', async () => {
    mockedRequest.mockResolvedValue(brief({
      frame: { ...brief().frame, environment: null },
      refusals: [{
        code: 'READOUT_ENVIRONMENT_UNNAMED',
        sentence: 'The database these figures were read from cannot be named.',
        rule: {
          instrument: 'house_doctrine',
          provision: 'Placeholders must look like placeholders',
          text: 'A figure read from a database must say which database.',
        },
      }],
    }));
    render(<Readout />);
    await waitFor(() => {
      expect(screen.getByTestId('readout-frame').textContent).toMatch(/NOT NAMED — see the refusal below/);
    });
    await waitFor(() => {
      expect(screen.getByTestId('refusal-READOUT_ENVIRONMENT_UNNAMED').textContent).toMatch(/cannot be named/);
    });
    expect(screen.getByTestId('readout-frame').textContent).not.toMatch(/unknown/i);
  });

  it('says on the screen that nothing fires this at 07:00', async () => {
    mockedRequest.mockResolvedValue(brief());
    render(<Readout />);
    await waitFor(() => {
      expect(screen.getByTestId('frame-schedule').textContent).toMatch(/NOTHING FIRES THIS AT 07:00/);
    });
    await waitFor(() => {
      expect(screen.getByTestId('refusal-READOUT_NOT_SCHEDULED').textContent).toMatch(/no cron entry/);
    });
  });

  it('renders every refusal with its code and the rule it cites', async () => {
    const refusals: Brief['refusals'] = [
      {
        code: 'READOUT_ITEMS_WITHHELD',
        sentence: '3 item(s) exist in compartments you do not hold.',
        rule: { instrument: 'workspace_constitution', provision: 'Need-to-know — the redaction is visible', text: 'THAT it exists, never what it says.' },
      },
      {
        code: 'READOUT_UNATTRIBUTED_ITEMS',
        sentence: '2 item(s) record no compartment at all and are withheld from EVERYONE.',
        rule: { instrument: 'house_doctrine', provision: 'Three states are never collapsed', text: 'We do not know who may see this is not everyone may see this.' },
      },
      {
        code: 'READOUT_NOT_SCHEDULED',
        sentence: 'NOTHING FIRES THIS AT 07:00.',
        rule: { instrument: 'house_doctrine', provision: 'An inference is never laundered into a certainty', text: 'A cadence nothing enforces is not a schedule.' },
      },
    ];
    mockedRequest.mockResolvedValue(brief({
      refusals,
      redaction: {
        scopesHeld: ['sales', '_desk'],
        compartmentsNotHeld: ['gps'],
        withheld: 3,
        unattributed: 2,
        countFrame: 'whole_ledger',
        statement: '3 withheld, 2 unattributed.',
        droppedOutOfScope: 0,
      },
    }));
    render(<Readout />);

    for (const r of refusals) {
      await waitFor(() => {
        const el = screen.getByTestId(`refusal-${r.code}`).textContent ?? '';
        expect(el).toMatch(new RegExp(r.code));
        expect(el).toMatch(new RegExp(r.rule.provision.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      });
    }
    expect(screen.getByTestId('readout-refusals').children).toHaveLength(3);
  });

  it('a transport failure renders as a fault, explicitly not as a quiet night', async () => {
    mockedRequest.mockRejectedValue(new Error('Network error'));
    render(<Readout />);
    await waitFor(() => {
      const t = screen.getByTestId('readout-error').textContent ?? '';
      expect(t).toMatch(/NOT LOADED/);
      expect(t).toMatch(/does not mean nothing needs your attention/i);
      expect(t).toMatch(/nothing is being withheld/i);
    });
    expect(screen.queryByTestId('items-empty')).toBeNull();
  });
});

describe('the screen cannot say All clear', () => {
  it('never says it in the state a reader is most likely to over-read: an empty window', async () => {
    mockedRequest.mockResolvedValue(brief({
      state: 'genuinely_empty',
      items: [],
      counts: { fetched: 0, inWindow: 0, shown: 0, unreadInScopeAllTime: 0, unplaceable: 0 },
    }));
    render(<Readout />);
    // Positive barrier first: the empty state has actually rendered.
    await waitFor(() => {
      expect(screen.getByTestId('items-empty').textContent).toMatch(/NO ITEMS IN THIS WINDOW/);
    });
    // Then the negatives, against the settled document.
    const t = pageText();
    expect(t).not.toMatch(/\ball clear\b/i);
    expect(t).not.toMatch(/all caught up/i);
    expect(t).not.toMatch(/nothing to do/i);
    expect(t).not.toMatch(/you're up to date/i);
    expect(t).not.toMatch(/no action (?:is )?required/i);
    expect(t).not.toMatch(/everything (?:is )?fine/i);
  });

  it('never says it when everything in the window has been read either', async () => {
    mockedRequest.mockResolvedValue(brief({
      items: [item({ id: 'r1', unread: false }), item({ id: 'r2', rank: 2, unread: false })],
      counts: { fetched: 2, inWindow: 2, shown: 2, unreadInScopeAllTime: 0, unplaceable: 0 },
    }));
    render(<Readout />);
    await waitFor(() => {
      expect(screen.getByTestId('readout-item-r1').textContent).toMatch(/READ/);
    });
    const t = pageText();
    expect(t).not.toMatch(/\ball clear\b/i);
    expect(t).not.toMatch(/all caught up/i);
    expect(t).not.toMatch(/nothing needs you\b/i);
  });

  it('states the ranking basis and the schedule absence unconditionally, not behind a disclosure control', async () => {
    mockedRequest.mockResolvedValue(brief());
    render(<Readout />);
    await waitFor(() => {
      expect(screen.getByTestId('ranking-statement').textContent).toMatch(/ORDERED BY RECENCY/);
    });
    await waitFor(() => {
      expect(screen.getByTestId('frame-schedule').textContent).toMatch(/NOTHING FIRES THIS AT 07:00/);
    });
    // No <details>/<summary> and no aria-expanded: these are not things a reader can put away.
    expect(document.querySelectorAll('details')).toHaveLength(0);
    expect(document.querySelectorAll('[aria-expanded]')).toHaveLength(0);
  });
});
