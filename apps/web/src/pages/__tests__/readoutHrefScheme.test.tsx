import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Readout } from '../Readout';
import type { Readout as Brief, ReadoutItem } from '@/lib/api/readout';
import * as apiClient from '@/lib/apiClient';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE READOUT'S href IS SOMEBODY ELSE'S INPUT, RENDERED IN A NATIVE SHELL.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `notifications.href` is written by the `notify` action and read back by every
 * later reader of the brief. The screen rendered it as `href={item.href}` — no
 * guard — and React does NOT block `javascript:` in an href. Inside the LCXOS
 * webview that is not a bad link: it is script in the app origin, next to the
 * Tauri commands, one of which hands back the desk credential from the Keychain.
 *
 * The source-level ratchet (`lib/__tests__/hrefSinks.test.ts`) proves the CALL is
 * there. This proves what the call DOES to the DOM, which is the part a reviewer
 * actually cares about — and it pins the behaviour the fix chose:
 *
 *   THE VALUE IS STILL SHOWN, IT IS JUST NOT NAVIGABLE. Three states are never
 *   collapsed, and "there is no href on this item" is not the same fact as "the
 *   href on this item was refused". So the anchor keeps its text — the reader can
 *   see the exact string that was stored, which is how a hostile row gets noticed
 *   — and loses only the ability to be followed.
 *
 * TEST DISCIPLINE: assert-in-waitFor. The POSITIVE barrier (the anchor exists) is
 * inside the waitFor; the NEGATIVE (it carries no href) is outside it, after the
 * barrier settled. A `not.toHaveAttribute` inside a waitFor passes instantly
 * against a DOM that has not rendered yet, which is a false pass that has reached
 * CI in this repo before.
 */

vi.mock('@/lib/apiClient', async () => {
  const real = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return { ...real, request: vi.fn() };
});

const mockedRequest = apiClient.request as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedRequest.mockReset();
});

function briefWithHref(href: string): Brief {
  const it_: ReadoutItem = {
    rank: 1,
    id: 'n1',
    rule: 'deal_stalled',
    title: 'Deal stalled: Acme',
    detail: 'no movement for 9 days',
    href,
    workspace: 'sales',
    createdAt: '2026-08-06T06:00:00.000Z',
    ageHours: 1,
    unread: true,
  };
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
      scheduleStatement: 'NOTHING FIRES THIS AT 07:00.',
    },
    ranking: {
      basis: 'recency',
      direction: 'newest_first',
      field: 'notifications.created_at',
      statement: 'ORDERED BY RECENCY — newest first, and by nothing else.',
      notRankedBy: [{ key: 'severity', why: 'no severity column exists' }],
    },
    items: [it_],
    unplaceable: [],
    counts: { fetched: 1, inWindow: 1, shown: 1, unreadInScopeAllTime: 1, unplaceable: 0 },
    redaction: {
      scopesHeld: ['sales', '_desk'],
      compartmentsNotHeld: ['gps'],
      withheld: 0,
      unattributed: 0,
      countFrame: 'whole_ledger',
      statement: 'Nothing is being withheld from you in this ledger.',
      channelStatement: 'The withheld count is the ONLY thing this brief tells you about compartments you do not hold.',
      droppedOutOfScope: 0,
    },
    refusals: [],
  };
}

/** The anchor the readout renders for an item's href, if it rendered one. */
function anchorFor(text: string): HTMLAnchorElement | null {
  return Array.from(document.querySelectorAll('a')).find((a) => a.textContent === text) ?? null;
}

/**
 * Each of these executes if a browser is allowed to navigate to it. The leading-
 * control-character variants matter because the URL parser strips those BEFORE it
 * reads the scheme, so they are the same navigation wearing a disguise.
 */
const EXECUTABLE = [
  'javascript:alert(1)',
  'JavaScript:alert(document.domain)',
  '\u0000javascript:alert(1)',
  '\njavascript:alert(1)',
  'java\tscript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
];

describe('a stored href the readout cannot safely navigate to', () => {
  it.each(EXECUTABLE)('renders %j as text and NOT as a navigable anchor', async (href) => {
    mockedRequest.mockResolvedValue(briefWithHref(href));
    render(<Readout />);

    // POSITIVE barrier, inside waitFor: the row rendered, and the stored value is
    // on the screen where the reader can see what was written.
    await waitFor(() => {
      expect(screen.getByText('Deal stalled: Acme')).toBeInTheDocument();
      expect(anchorFor(href)).not.toBeNull();
    });

    // NEGATIVE, outside: the anchor exists and carries no href at all.
    const a = anchorFor(href)!;
    expect(a.getAttribute('href')).toBeNull();
    // …and jsdom therefore resolves no destination from it.
    expect(a.href).toBe('');
  });
});

describe('the ordinary case is untouched — a guard that breaks the product is not a guard', () => {
  it.each([
    ['/deal-board', 'http://localhost:3000/deal-board'],
    ['/bd-pipeline/abc', 'http://localhost:3000/bd-pipeline/abc'],
  ])('keeps %s navigable', async (href, resolved) => {
    mockedRequest.mockResolvedValue(briefWithHref(href));
    render(<Readout />);

    await waitFor(() => {
      expect(anchorFor(href)).not.toBeNull();
      expect(anchorFor(href)!.getAttribute('href')).toBe(href);
    });
    expect(anchorFor(href)!.href).toBe(resolved);
  });

  it('keeps an absolute https href navigable', async () => {
    const href = 'https://example.com/thing';
    mockedRequest.mockResolvedValue(briefWithHref(href));
    render(<Readout />);
    await waitFor(() => {
      expect(anchorFor(href)?.getAttribute('href')).toBe(href);
    });
  });
});
