import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/apiClient';
import * as apiClient from '@/lib/apiClient';
import { GpsPartnerRegistry } from '../GpsPartnerRegistry';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE PARTNER REGISTRY SCREEN — the surface the owner's decision produced.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ── THE FIXTURE IS MEASURED, NOT DESCRIBED ───────────────────────────────────
 * The payloads below are hand-built, and the first test runs
 * `partnerRegistryDeskDefects` over them — the same predicate
 * `apps/api/src/routes/__tests__/gpsPartnerRegistry.test.ts` runs over a real
 * serialised HTTP response. That is the only arrangement that catches the failure
 * this compartment already shipped once (`lib/api/gps.ts:60`): a page and its test
 * agreeing on a field the server has never sent. A mocked boundary proves internal
 * consistency and nothing else, so the fixture is held to the same declaration the
 * route is.
 *
 * The predicate is imported from the shared SOURCE rather than from `@lcx/shared`,
 * because `packages/shared/src/gps/index.ts` is a hand-written name list that has not
 * yet been extended for this lane's exports and a barrel edit collides with every
 * other lane. The PAGE imports its types from `@lcx/shared` as production code must;
 * those are `import type` and are erased, so this file and the page do not disagree
 * about where the contract lives — only about which specifier can carry a VALUE
 * today. Delete this path when the barrel line lands.
 *
 * ── WHAT EACH TEST DEFENDS ───────────────────────────────────────────────────
 *  1. The fixture is the contract, not a description of it.
 *  2. NOT LOADED, WITHHELD and EMPTY do not render alike — the note, the badge and
 *     the next action all differ. Collapsing them sends someone to hire a
 *     subcontractor when the remedy is one SQL file.
 *  3. Every bench row shows WHO asserted the partner and on what basis. An
 *     unattributed row would look completely normal; the assertion is the row.
 *  4. A capacity nobody stated does not render as 0.
 *  5. The server decides. A refusal produced by the API on submit is rendered
 *     verbatim with the rule it cited, and the page does not pre-empt it: the
 *     request is sent even when the input is obviously bad.
 *  6. A floor renders with its environment, its attribution and what it excludes;
 *     a refused floor renders EVERY refusal with its code, what is missing and who
 *     supplies it.
 *
 * ── WHAT THESE TESTS CANNOT SEE ──────────────────────────────────────────────
 * jsdom has no layout and no paint. "The placeholder is impossible to miss" is
 * asserted only as "the text is in the DOM and not behind a disclosure control".
 */
const { partnerRegistryDeskDefects, partnerRegistryFloorDefects, PARTNER_ASSERTION_IS_A_CLAIM } =
  await import('../../../../../packages/shared/src/gps/partners.js');

vi.mock('@/lib/apiClient', async () => {
  // `ApiError` is the module's real class: the page branches on `instanceof`, and a
  // stub would let a wrong refusal shape pass.
  const real = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return { ...real, request: vi.fn() };
});

const mockedRequest = apiClient.request as unknown as ReturnType<typeof vi.fn>;

type Json = Record<string, any>;

const ENV = 'supabase:db.test.supabase.co/postgres';

const REGISTERS = { registry: true, capabilities: true, rateCards: true, effortTriples: true };

const member = (over: Json = {}): Json => ({
  partner: {
    id: 'counsel-one',
    name: 'Counsel One AG',
    assertion: {
      assertedBy: 'nikhil.sharma@lcx.com',
      assertedAt: '2026-08-07T09:00:00.000Z',
      basis: 'Delivered the notification pack in March; rate confirmed by email 6 Aug.',
    },
    active: true,
    capabilities: [{ offerKey: 'mica_whitepaper', seniority: 'principal', jurisdictions: ['Liechtenstein'], evidence: null }],
    rateCards: [],
    capacity: { maxConcurrent: 0, statedBy: 'not stated', statedAt: '2026-08-07T09:00:00.000Z', unavailableUntil: null },
    notes: null,
  },
  capacityStated: false,
  bdPartnerId: null,
  ...over,
});

const desk = (over: Json = {}): Json => ({
  contract: 'gps.partnerRegistry.v1',
  asOf: '2026-08-07T10:00:00.000Z',
  registers: REGISTERS,
  migration: '0075_gps_partner_registry.sql',
  assertionIsAClaim: PARTNER_ASSERTION_IS_A_CLAIM,
  offerKeys: ['diagnostic', 'mica_whitepaper', 'legal_opinion_coordination', 'gtm_sprint', 'marketing_activation'],
  effortPoints: ['likely', 'pessimistic'],
  bench: { state: 'loaded', members: [member()] },
  ...over,
});

const floorView = (over: Json = {}): Json => ({
  contract: 'gps.partnerRegistry.floor.v1',
  asOf: '2026-08-07T10:00:00.000Z',
  partnerId: 'counsel-one',
  offerKey: 'mica_whitepaper',
  effortPoint: 'likely',
  registers: REGISTERS,
  migration: '0075_gps_partner_registry.sql',
  floor: null,
  refusals: [],
  ...over,
});

const FLOOR = {
  kind: 'floor',
  floorCents: 2_250_000,
  currency: 'USD',
  reasons: ['Counsel One AG charges 150000 cents per day, and mica_whitepaper is stated at 15 partner-day(s) at the likely point — 2250000 cents.'],
  frame: {
    environment: ENV,
    asOf: '2026-08-07T10:00:00.000Z',
    offerKey: 'mica_whitepaper',
    partnerId: 'counsel-one',
    partnerName: 'Counsel One AG',
    assertedBy: 'nikhil.sharma@lcx.com',
    assertedAt: '2026-08-07T09:00:00.000Z',
    assertionBasis: 'Delivered the notification pack in March.',
    assertionIsAClaim: PARTNER_ASSERTION_IS_A_CLAIM,
    rateUnit: 'day_rate',
    rateAmountCents: 150_000,
    rateStatedBy: 'nikhil.sharma@lcx.com',
    rateStatedAt: '2026-08-07T09:30:00.000Z',
    rateValidUntil: '2027-01-01T00:00:00.000Z',
    rateCardStatus: 'usable',
    effortPoint: 'likely',
    effortDays: 15,
    effortStatedBy: 'nikhil.sharma@lcx.com',
    effortStatedAt: '2026-08-06T10:00:00.000Z',
    hoursPerDay: null,
    unitsCharged: 15,
    passThroughCents: 0,
    method: 'rate_card_unit_cost × effort_at_stated_point + pass_through',
    excludes: ['No overhead, no software, no insurance and no cost of capital.'],
  },
};

const PLACEHOLDER_REFUSAL = {
  code: 'FLOOR_EFFORT_IS_PLACEHOLDER',
  sentence: 'No floor is quoted: the effort triple for mica_whitepaper is still the shipped placeholder (stated by "system:placeholder").',
  rule: {
    instrument: 'LCX_HOUSE_DOCTRINE',
    provision: 'an inference is never laundered into a certainty',
    text: 'An inference is never laundered into a certainty. A placeholder that has been through arithmetic is still a placeholder.',
  },
  missing: 'a founder-supplied effort triple for mica_whitepaper, replacing TODO_EFFORT_DAYS',
  remedyOwner: 'the founder',
  environment: ENV,
};

beforeEach(() => {
  mockedRequest.mockReset();
});

/** Answer the desk read, and anything else with a caller-supplied handler. */
function serveDesk(payload: Json = desk()): void {
  mockedRequest.mockImplementation(async (path: string) => {
    if (path.startsWith('/v1/gps/partner-registry/floor')) return { data: floorView() };
    if (path === '/v1/gps/partner-registry') return { data: payload };
    throw new Error(`unexpected request: ${path}`);
  });
}

describe('the fixture is the contract', () => {
  it('matches the shared desk predicate in every bench state', () => {
    expect(partnerRegistryDeskDefects(desk())).toEqual([]);
    expect(partnerRegistryDeskDefects(desk({
      bench: { state: 'not_loaded', note: 'migration 0075_gps_partner_registry.sql has not been applied', members: [] },
    }))).toEqual([]);
    expect(partnerRegistryDeskDefects(desk({
      bench: { state: 'empty', note: 'nobody has asserted a delivery partner yet', members: [] },
    }))).toEqual([]);
  });

  it('matches the shared floor predicate for a figure and for a refusal', () => {
    expect(partnerRegistryFloorDefects(floorView({ floor: FLOOR }))).toEqual([]);
    expect(partnerRegistryFloorDefects(floorView({ refusals: [PLACEHOLDER_REFUSAL] }))).toEqual([]);
  });
});

describe('the three absences do not render alike', () => {
  it('says a MIGRATION is missing, and does not call that an empty bench', async () => {
    serveDesk(desk({
      bench: {
        state: 'not_loaded',
        note: 'No partner registry exists on this environment: migration 0075_gps_partner_registry.sql has not been applied.',
        members: [],
      },
    }));
    render(<GpsPartnerRegistry />);
    await waitFor(() => {
      const panel = screen.getByTestId('bench-not-loaded');
      // The migration is named twice on purpose — in the server's note and in the
      // next action — so this reads the panel rather than a single element.
      expect(panel.textContent).toContain('0075_gps_partner_registry.sql');
      expect(panel.textContent).toContain('This is not an empty bench');
    });
    expect(screen.queryByTestId('bench-empty')).toBeNull();
  });

  it('says the register is EMPTY, and points at a conversation rather than a migration', async () => {
    serveDesk(desk({
      bench: { state: 'empty', note: 'The partner registry exists and holds no rows.', members: [] },
    }));
    render(<GpsPartnerRegistry />);
    await waitFor(() => {
      const panel = screen.getByTestId('bench-empty');
      expect(panel.textContent).toContain('conversation to have, not a migration to run');
    });
    expect(screen.queryByTestId('bench-not-loaded')).toBeNull();
  });

  it('says WITHHELD without inviting a second copy to be entered', async () => {
    serveDesk(desk({
      bench: { state: 'withheld', note: 'gps compartment: this session may not read the bench.', members: [] },
    }));
    render(<GpsPartnerRegistry />);
    await waitFor(() => {
      expect(screen.getByTestId('bench-withheld').textContent).toContain('do not enter a second copy');
    });
  });
});

describe('the envelope reaches the screen', () => {
  /**
   * `meta.migrated: false` is the difference between "no partner has been asserted"
   * and "the table does not exist on this environment". The page unpacks
   * `{ data, meta }` by hand, so it re-attaches the envelope; without that the banner
   * would report that the screen cannot tell what it is missing, while the envelope
   * was sitting in the response.
   */
  it('prints what the read declared about itself, including the migration', async () => {
    mockedRequest.mockImplementation(async (path: string) => {
      if (path === '/v1/gps/partner-registry') {
        return {
          data: desk({ bench: { state: 'not_loaded', note: 'not applied', members: [] } }),
          meta: { migrated: false, pendingMigration: '0075_gps_partner_registry.sql' },
        };
      }
      throw new Error(`unexpected request: ${path}`);
    });
    render(<GpsPartnerRegistry />);
    await waitFor(() => {
      const banner = screen.getByTestId('gps-meta-banner');
      expect(banner.textContent).toContain('0075_gps_partner_registry.sql');
    });
  });
});

describe('the attribution is the row', () => {
  it('shows who asserted each partner, when, and on what basis', async () => {
    serveDesk();
    render(<GpsPartnerRegistry />);
    await waitFor(() => {
      const row = screen.getByTestId('assertion-counsel-one');
      expect(row.textContent).toContain('nikhil.sharma@lcx.com');
      expect(row.textContent).toContain('2026-08-07T09:00:00.000Z');
    });
    expect(screen.getByText(/Delivered the notification pack in March/)).toBeTruthy();
  });

  it('renders the caveat that an assertion is a claim, from the payload', async () => {
    serveDesk();
    render(<GpsPartnerRegistry />);
    await waitFor(() => {
      expect(screen.getByTestId('assertion-caveat').textContent).toMatch(/not verified/i);
    });
  });

  // 0-because-nobody-asked and 0-because-full must not render alike: the first must
  // not license selling, and the second is a real, stated fact.
  it('never renders an unstated concurrency cap as zero', async () => {
    serveDesk();
    render(<GpsPartnerRegistry />);
    await waitFor(() => {
      expect(screen.getByTestId('capacity-counsel-one').textContent).toContain('NOBODY HAS STATED ONE');
    });
    expect(screen.getByTestId('capacity-counsel-one').textContent).not.toMatch(/cap: 0\b/);
  });

  it('renders a STATED cap of zero as a stated fact, with its author', async () => {
    serveDesk(desk({
      bench: {
        state: 'loaded',
        members: [member({
          capacityStated: true,
          partner: {
            ...member().partner,
            capacity: { maxConcurrent: 0, statedBy: 'nikhil.sharma@lcx.com', statedAt: '2026-08-07T09:00:00.000Z', unavailableUntil: null },
          },
        })],
      },
    }));
    render(<GpsPartnerRegistry />);
    await waitFor(() => {
      const cap = screen.getByTestId('capacity-counsel-one').textContent ?? '';
      expect(cap).toContain('Concurrency cap: 0');
      expect(cap).toContain('nikhil.sharma@lcx.com');
    });
    expect(screen.getByTestId('capacity-counsel-one').textContent).not.toContain('NOBODY HAS STATED ONE');
  });
});

describe('the server decides', () => {
  it('sends an obviously blank assertion anyway, and renders the refusal it gets back', async () => {
    const seen: Array<{ path: string; body: unknown }> = [];
    mockedRequest.mockImplementation(async (path: string, opts?: Json) => {
      if (path === '/v1/gps/partner-registry') return { data: desk() };
      seen.push({ path, body: opts?.body });
      throw new ApiError(
        'No basis stated. When this partner misses, the basis is the only thing a reviewer can argue with.',
        400,
        'PARTNER_ASSERTION_BASIS_BLANK',
        { refusal: { rule: 'The owner decided on 2026-08-07 that a named human may assert a partner…', field: 'basis' } },
      );
    });

    render(<GpsPartnerRegistry />);
    await waitFor(() => expect(screen.getByText('Assert this partner')).toBeTruthy());
    await userEvent.click(screen.getByText('Assert this partner'));

    await waitFor(() => {
      const panel = screen.getByTestId('refusal-PARTNER_ASSERTION_BASIS_BLANK');
      expect(panel.textContent).toContain('the only thing a reviewer can argue with');
      // The rule the server cited, not a wording of the page's own.
      expect(panel.textContent).toContain('2026-08-07');
    });
    // The page did not pre-empt the server: the request went out with the empty body.
    expect(seen).toHaveLength(1);
    expect((seen[0].body as Json).assertionBasis).toBe('');
  });

  // An empty capacity box is NOT a stated zero, and the page must not turn one into
  // the other on the way to the server.
  it('sends an unstated capacity as absent rather than as 0', async () => {
    const seen: Array<Json> = [];
    mockedRequest.mockImplementation(async (path: string, opts?: Json) => {
      if (path === '/v1/gps/partner-registry') return { data: desk() };
      seen.push(opts?.body as Json);
      return { data: {} };
    });
    render(<GpsPartnerRegistry />);
    await waitFor(() => expect(screen.getByText('Assert this partner')).toBeTruthy());
    await userEvent.click(screen.getByText('Assert this partner'));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].maxConcurrent).toBeNull();
  });

  /**
   * THE FIRST PARTNER EVER ASSERTED — the one path this screen exists for, and the
   * one every other test here skips by starting with a bench that is already loaded.
   *
   * The panels mount while the bench is EMPTY, so a `useState(members[0]?…)`
   * initialiser captures `''` and keeps it after the assertion reloads the list. A
   * controlled `<select>` whose value matches no option renders the FIRST option, so
   * the operator sees "Counsel One AG" chosen while the page still holds `''` — and
   * the request goes to `/partners//rate-cards` (a 404 naming nothing they typed).
   * This asserts on the REQUEST rather than on the select's displayed value, because
   * the displayed value was never the thing that was wrong.
   */
  it('attaches the rate card and the floor to the FIRST partner asserted, not to an empty id', async () => {
    let deskReads = 0;
    const sent: string[] = [];
    mockedRequest.mockImplementation(async (path: string) => {
      if (path === '/v1/gps/partner-registry') {
        deskReads += 1;
        return {
          data: deskReads === 1
            ? desk({ bench: { state: 'empty', note: 'nobody has asserted a delivery partner yet', members: [] } })
            : desk(),
        };
      }
      sent.push(path);
      if (path.startsWith('/v1/gps/partner-registry/floor')) return { data: floorView({ refusals: [PLACEHOLDER_REFUSAL] }) };
      return { data: {} };
    });

    render(<GpsPartnerRegistry />);
    await waitFor(() => expect(screen.getByTestId('rate-card-needs-a-partner')).toBeTruthy());

    await userEvent.click(screen.getByText('Assert this partner'));
    // The bench reloaded, so the rate-card form is now offered.
    await waitFor(() => expect(screen.getByLabelText('Rate card partner')).toBeTruthy());

    // Neither Select is touched: the operator submits what the screen shows them.
    await userEvent.click(screen.getByText('Record rate card'));
    await waitFor(() => {
      expect(sent.some((p) => p === '/v1/gps/partner-registry/partners/counsel-one/rate-cards')).toBe(true);
    });

    await userEvent.click(screen.getByText('Read the floor'));
    await waitFor(() => {
      expect(sent.some((p) => p.includes('partnerId=counsel-one'))).toBe(true);
    });
    // The empty-id request that this defect produced must not appear at all.
    expect(sent.some((p) => p.includes('/partners//') || p.includes('partnerId=&'))).toBe(false);
  });

  it('offers no rate-card form until a partner exists to attach it to', async () => {
    serveDesk(desk({ bench: { state: 'empty', note: 'nothing yet', members: [] } }));
    render(<GpsPartnerRegistry />);
    await waitFor(() => {
      expect(screen.getByTestId('rate-card-needs-a-partner').textContent)
        .toContain('there is nobody for a rate to belong to');
    });
    expect(screen.queryByLabelText('Rate amount in cents')).toBeNull();
  });
});

describe('the floor', () => {
  async function readFloor(view: Json): Promise<void> {
    mockedRequest.mockImplementation(async (path: string) => {
      if (path.startsWith('/v1/gps/partner-registry/floor')) return { data: view };
      if (path === '/v1/gps/partner-registry') return { data: desk() };
      throw new Error(`unexpected request: ${path}`);
    });
    render(<GpsPartnerRegistry />);
    await waitFor(() => expect(screen.getByText('Read the floor')).toBeTruthy());
    await userEvent.click(screen.getByText('Read the floor'));
  }

  it('renders the figure with its environment, its attribution and what it excludes', async () => {
    await readFloor(floorView({ floor: FLOOR }));
    await waitFor(() => {
      const panel = screen.getByTestId('floor-figure');
      expect(panel.textContent).toContain('2250000 cents USD');
    });
    const frame = screen.getByTestId('floor-frame').textContent ?? '';
    expect(frame).toContain(ENV);
    expect(frame).toContain('nikhil.sharma@lcx.com');
    expect(frame).toContain('15 day(s) at the likely point');
    expect(screen.getByTestId('floor-figure').textContent).toContain('No overhead');
  });

  it('renders EVERY refusal, with its code, what is missing and who supplies it', async () => {
    await readFloor(floorView({
      refusals: [
        PLACEHOLDER_REFUSAL,
        {
          ...PLACEHOLDER_REFUSAL,
          code: 'FLOOR_RATE_CARD_ABSENT',
          sentence: 'No floor is quoted: Counsel One AG has no rate card for mica_whitepaper.',
          missing: 'a rate card for Counsel One AG on mica_whitepaper',
          remedyOwner: 'the partner',
        },
      ],
    }));
    await waitFor(() => {
      expect(screen.getByTestId('floor-refusal-FLOOR_EFFORT_IS_PLACEHOLDER').textContent)
        .toContain('system:placeholder');
    });
    const second = screen.getByTestId('floor-refusal-FLOOR_RATE_CARD_ABSENT');
    expect(second.textContent).toContain('to be supplied by the partner');
    expect(screen.getByTestId('floor-refusals').textContent).toContain('fixing one is not enough');
    // No number is rendered anywhere near a refused floor.
    expect(screen.queryByTestId('floor-figure')).toBeNull();
  });

  it('offers likely and pessimistic, and never an optimistic floor', async () => {
    serveDesk();
    render(<GpsPartnerRegistry />);
    await waitFor(() => expect(screen.getByLabelText('Effort point')).toBeTruthy());
    const options = Array.from(screen.getByLabelText('Effort point').querySelectorAll('option')).map((o) => o.value);
    expect(options).toEqual(['likely', 'pessimistic']);
  });
});

describe('failure is not an eternal skeleton', () => {
  it('renders a retryable error when the desk read fails', async () => {
    mockedRequest.mockRejectedValue(new ApiError('Failed to read the partner registry', 500, 'GPS_ERROR'));
    render(<GpsPartnerRegistry />);
    await waitFor(() => {
      // The shared ErrorNotice, with a retry — not a skeleton that pulses forever.
      expect(screen.getByText('Something broke on our side')).toBeTruthy();
      expect(screen.getByText(/Retry/)).toBeTruthy();
    });
  });
});
