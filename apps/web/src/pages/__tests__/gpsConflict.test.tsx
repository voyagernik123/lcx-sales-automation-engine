import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  ContractingEntity, GpsClient, GpsConflictCheck,
} from '@lcx/shared';
import { GpsConflict, CLIENT_FACING_STATUSES } from '../GpsConflict';
import * as gpsApi from '@/lib/api/gps';
import * as conflictApi from '@/lib/api/gpsConflict';
import { ApiError } from '@/lib/apiClient';
import {
  DISCLOSURE_TEMPLATES, renderDisclosure,
} from '../../../../../packages/shared/src/gps/disclosure';
import {
  PERIMETER_IS_UNREVIEWED, PERIMETER_PROFILES,
} from '../../../../../packages/shared/src/gps/perimeter';

/**
 * THE CONFLICT WALL — the guards on the defensibility instrument.
 *
 * This is the screen an LCX employee would put in front of compliance, a client
 * or an auditor, so the failure mode to design against is not a blank page: it is
 * a page that looks authoritative and is wrong. Every test below pins a sentence
 * that a well-meaning future edit could quietly make untrue, and four of them
 * assert an ABSENCE, which is the only kind of claim that survives someone adding
 * a feature in good faith:
 *
 *  1. A MISSING conflict position is RED and states what it blocks. Silence is the
 *     failure this compartment exists to make impossible.
 *  2. A DISCLOSURE VERSION is only ever shown when something reproduced it, and a
 *     hand-edited wording is reported as unreproducible rather than labelled with
 *     a version it cannot support.
 *  3. A STALE perimeter entry is marked stale AND stated as blocking. A refusal
 *     that reads as a warning gets ignored.
 *  4. The UNREVIEWED perimeter banner is present while the rows are placeholders.
 *  5. Print styles exist, because an artifact you cannot hand over is not one.
 *  6. NO CLIENT-ARTIFACT INTAKE anywhere on this surface — the D2 lockout that
 *     `pages/__tests__/gps.test.tsx` established, extended to the surface where
 *     someone would most plausibly reach for "attach the signed disclosure".
 *  7. The wall does not claim a database constraint it does not have.
 *
 * WHAT THESE TESTS CANNOT SEE, stated plainly: jsdom has no layout, no paint and
 * no print pipeline. "MISSING is red" is asserted as "the row carries the blocked
 * status token and the blocking sentence is in the DOM", and "printable" is
 * asserted as "an @media print block is mounted with the rules that stop columns
 * being clipped". Neither is a claim about what a human sees on paper. The only
 * way to check that is to print it.
 */

vi.mock('@/lib/api/gps', () => ({
  fetchGpsClients: vi.fn(),
  fetchGpsEngagements: vi.fn(),
  fetchGpsSummary: vi.fn(),
}));

/**
 * The REAL module, with only its two network calls replaced.
 *
 * Written as a spread of `importOriginal` rather than a literal factory so that
 * `SECOND_TIER_ENDPOINT` is the constant the app actually requests. A factory that
 * restated the path would let the endpoint be renamed in the module while this
 * suite went on asserting the old string — the same fail-open that let a mocked
 * `Object.keys` ratchet enumerate its own mock (`gps.test.tsx:149`).
 */
vi.mock('@/lib/api/gpsConflict', async (importOriginal) => ({
  ...await importOriginal<typeof conflictApi>(),
  fetchGpsEngagementConflict: vi.fn(),
  fetchSecondTierSessions: vi.fn(),
}));


/**
 * A FIXED CLOCK, and why this suite insists on one.
 *
 * The perimeter's placeholder rows carry `reviewBy === enteredAt ===
 * 2026-07-31T00:00:00.000Z` (`perimeter.ts:225`), so whether they are stale — and
 * by how many days — is arithmetic against the moment the page mounts. Left on
 * the wall clock, "60 days past review" would be a different number every day and
 * the suite could only assert something vague. Pinned here, the exact figure the
 * screen prints is checkable, which is the same D1 standard the screen is held to.
 */
const NOW = new Date('2026-09-29T12:00:00.000Z');
/** 2026-07-31 → 2026-09-29 is 60 whole days. Recomputed, not recalled. */
const DAYS_PAST_REVIEW = Math.floor(
  (NOW.getTime() - new Date('2026-07-31T00:00:00.000Z').getTime()) / 86_400_000,
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.mocked(gpsApi.fetchGpsClients).mockResolvedValue([client()]);
  vi.mocked(gpsApi.fetchGpsEngagements).mockResolvedValue([]);
  vi.mocked(gpsApi.fetchGpsSummary).mockResolvedValue(summary());
  vi.mocked(conflictApi.fetchGpsEngagementConflict).mockResolvedValue(null);
  vi.mocked(conflictApi.fetchSecondTierSessions).mockResolvedValue(sessionView());
});

afterEach(() => {
  vi.useRealTimers();
});

/* ── Fixtures, shaped by the SHARED row declarations ────────────────────────── */

/**
 * Copied from `DeskSummary` (`apps/api/src/gps/service.ts:1053`) by way of
 * `GpsSummary` (`lib/api/gps.ts:100`) — the type is imported, never re-described,
 * because a fixture that agrees with a wrong interface is how the GPS desk shipped
 * a guaranteed crash with a green suite (`lib/api/gps.ts:80`).
 *
 * The wall reads exactly two things from it: `migrated`, which is the only GPS read
 * that carries it, and `gaps.missingConflictCheck`, which it cross-checks against
 * its own count.
 */
function summary(over: Partial<gpsApi.GpsSummary> = {}): gpsApi.GpsSummary {
  return {
    migrated: true,
    clients: { total: 1, byStatus: { active: 1 } },
    engagements: { total: 0, byStatus: {}, byOffer: {} },
    openByCurrency: [],
    collectedByCurrency: [],
    awaitingDeposit: { count: 0, byCurrency: [], oldestAcceptedDays: null },
    gaps: {
      missingConflictCheck: 0,
      conflictDeclined: 0,
      unpriced: 0,
      depositWithoutAcceptance: 0,
      unstaffable: 0,
    },
    catalogue: {
      priceBandsArePlaceholders: true,
      depositPolicyIsPlaceholder: true,
      blockingTodoCount: 2,
    },
    ...over,
  };
}

function client(over: Partial<GpsClient> = {}): GpsClient {
  return {
    id: 'c-1',
    name: 'Acme Token AG',
    legalEntity: null,
    jurisdiction: 'Liechtenstein',
    primaryContact: null,
    status: 'active',
    createdAt: '2026-06-01T09:00:00.000Z',
    updatedAt: '2026-06-01T09:00:00.000Z',
    ...over,
  };
}

function engagement(over: Partial<gpsApi.GpsEngagementRow> = {}): gpsApi.GpsEngagementRow {
  return {
    id: 'e-1',
    clientId: 'c-1',
    projectId: null,
    offerKey: 'mica_whitepaper',
    contractingEntity: 'lcx' as ContractingEntity,
    scopeSnapshot: {},
    priceCents: 1_750_000,
    vendorCostCents: 600_000,
    currency: 'USD',
    status: 'draft',
    owner: 'nik',
    depositRequiredCents: 0,
    depositPaidAt: null,
    acceptedAt: null,
    createdAt: '2026-07-20T10:00:00.000Z',
    updatedAt: '2026-07-20T10:00:00.000Z',
    clientName: 'Acme Token AG',
    conflict: null,
    ...over,
  };
}

const DECIDED_AT = '2026-07-21T09:30:00.000Z';

function check(over: Partial<GpsConflictCheck> = {}): GpsConflictCheck {
  return {
    id: 'k-1',
    clientId: 'c-1',
    engagementId: 'e-1',
    checkPerformed: 'Searched the LCX listing pipeline and the BD book for this issuer and its '
      + 'affiliates; no live or pending listing application found.',
    decision: 'cleared_with_disclosure',
    decidedBy: 'nik',
    disclosureTextUsed: null,
    decidedAt: DECIDED_AT,
    ...over,
  };
}

/**
 * The wording the page will try to reproduce, produced the way the page produces
 * candidates — through `renderDisclosure` with the same context. Written this way
 * on purpose: a hard-coded expected string would let a template edit silently
 * break the reproduction mechanism while this suite stayed green.
 */
function issuedDisclosure(templateId: 'gps-conflict-cleared-with-disclosure') {
  const t = DISCLOSURE_TEMPLATES.find((x) => x.id === templateId)!;
  const rendered = renderDisclosure(templateId, {
    clientName: 'Acme Token AG',
    offerKey: 'mica_whitepaper',
    contractingEntity: 'lcx',
    asOf: DECIDED_AT,
    jurisdiction: 'Liechtenstein',
    conflictDecision: 'cleared_with_disclosure',
    lcxAdjacent: false,
    // The page derives this from `gateService` at `decidedAt`; the value does not
    // reach the text of this template, only its `appliesWhen`.
    perimeterUnreviewed: true,
  });
  return { text: rendered.text, version: t.version };
}

async function mount(opts: {
  engagements?: gpsApi.GpsEngagementRow[];
  clients?: GpsClient[];
  detail?: GpsConflictCheck | null;
  summary?: gpsApi.GpsSummary;
} = {}) {
  const engagements = opts.engagements ?? [];
  vi.mocked(gpsApi.fetchGpsClients).mockResolvedValue(opts.clients ?? [client()]);
  vi.mocked(gpsApi.fetchGpsEngagements).mockResolvedValue(engagements);
  // By default the server's SQL count AGREES with what the fixture implies, so the
  // cross-check banner only appears in the test that is about the cross-check.
  vi.mocked(gpsApi.fetchGpsSummary).mockResolvedValue(opts.summary ?? summary({
    gaps: {
      ...summary().gaps,
      missingConflictCheck: engagements.filter((e) => e.conflict === null).length,
    },
  }));
  if (opts.detail !== undefined) {
    vi.mocked(conflictApi.fetchGpsEngagementConflict).mockResolvedValue({
      engagement: engagement(),
      conflictCheck: opts.detail,
    });
  }
  const view = render(<GpsConflict />);
  await waitFor(() => expect(screen.getByTestId('wall-counts')).toBeTruthy());
  return view;
}

/* ── 1. MISSING ────────────────────────────────────────────────────────────── */

describe('a MISSING conflict position', () => {
  /**
   * The single most important row on the screen. An engagement with no recorded
   * check is not "pending", not "in progress" and not blank — it is the state that
   * makes an exchange employee's services business indefensible, and the row has
   * to say so without being clicked, because the person reading over his shoulder
   * will not click.
   */
  it('renders red and states that every client-facing state is blocked', async () => {
    await mount({ engagements: [engagement({ status: 'proposed', conflict: null })] });

    const row = screen.getByTestId('wall-row-e-1');
    // "Red" in jsdom is the token, not a pixel: `bg-status-blocked-bg` is the
    // repo's blocked surface (`tailwind.config.js:45`).
    expect(row.className, 'the MISSING row is not on the blocked surface').toContain('bg-status-blocked-bg');

    const position = within(row).getByText('MISSING');
    expect(position.className, 'MISSING is not in the blocked text token').toContain('text-status-blocked');

    const banner = screen.getByTestId('wall-row-missing-e-1');
    expect(banner.textContent).toMatch(/BLOCKED FROM ALL CLIENT-FACING STATES/);
    expect(banner.textContent, 'the consequence is stated without naming what it blocks')
      .toMatch(/no status at or past "Proposal issued"/i);

    // The engagement is ALREADY at `proposed` with no clearance, which is a
    // different and worse fact than "not yet cleared". It must be called out.
    expect(within(row).getByText(/past the gate/i)).toBeTruthy();
    expect(screen.getByTestId('wall-counts').textContent)
      .toMatch(/PAST THE GATE WITHOUT CLEARANCE 1/);
  });

  /**
   * D8 in its least comfortable form: the brief for this screen said the database
   * enforces the conflict gate. It does not — `0047_gps.sql` has no trigger and no
   * CHECK, only UNIQUE(engagement_id). Repeating the claim would have made the
   * wall itself the thing that misleads an auditor, so the screen names the real
   * enforcement point and its bypass. This test is what stops a future edit
   * "tidying" that sentence into the comfortable version.
   */
  it('names where the refusal actually lives and does not claim a DB constraint', async () => {
    await mount({ engagements: [engagement({ status: 'proposed', conflict: null })] });
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/setEngagementStatus \(apps\/api\/src\/gps\/service\.ts:786\)/);
    expect(text, 'the wall must admit a direct SQL UPDATE bypasses the gate')
      .toMatch(/a direct SQL UPDATE would bypass this/i);
    // The negative is phrased against the CLAIM, not the word: the footer is
    // allowed — required, in fact — to name what it does not prove, so a blanket
    // ban on "database" would forbid the honest sentence along with the dishonest
    // one. What may never appear is an assertion that the database does the work.
    expect(text, 'the wall claims an enforcement mechanism it does not have')
      .not.toMatch(/the (database|DB) (already )?enforces|enforced (by|in) the database|database constraint enforces/i);
  });
});

/* ── 2. The disclosure wording and its version ─────────────────────────────── */

describe('the disclosure wording', () => {
  const withCheck = (over: Partial<GpsConflictCheck> = {}) => ({
    engagements: [engagement({
      status: 'accepted',
      conflict: { decision: 'cleared_with_disclosure' as const, decidedBy: 'nik', decidedAt: DECIDED_AT },
    })],
    detail: check(over),
  });

  it('shows the version when the wording can be reproduced, and the text in full', async () => {
    const issued = issuedDisclosure('gps-conflict-cleared-with-disclosure');
    await mount(withCheck({ disclosureTextUsed: issued.text }));

    // The version is on the row itself — no interaction needed to see it.
    const cell = await waitFor(() => screen.getByTestId('reproduced-version'));
    expect(cell.textContent).toContain(`v${issued.version}`);
    expect(cell.textContent).toContain('gps-conflict-cleared-with-disclosure');
    expect(cell.textContent?.toLowerCase()).toContain('reproduced');

    // …and the wording itself is the artifact: verbatim, entire, not a summary.
    fireEvent.click(screen.getByTestId('wall-row-e-1'));
    const pre = screen.getByTestId('disclosure-text-e-1');
    expect(pre.textContent, 'the stored wording was altered or truncated on screen')
      .toBe(issued.text);
    expect(pre.tagName, 'wording rendered outside a <pre> loses its line breaks').toBe('PRE');

    // The mechanism is stated, not implied.
    expect(document.body.textContent).toMatch(/byte-for-byte identical to the stored text/i);
  });

  /**
   * The negative half, and the reason `reproduceDisclosure` exists at all. Once
   * one character differs, the honest output is "no version" — not the nearest
   * template's number. A version printed beside wording it does not describe is
   * worse than no version, because it is the thing an auditor would rely on.
   */
  it('refuses to claim a version for wording it cannot reproduce', async () => {
    const issued = issuedDisclosure('gps-conflict-cleared-with-disclosure');
    await mount(withCheck({ disclosureTextUsed: `${issued.text}\n\nAdded by hand in the call.` }));

    const cell = await waitFor(() => screen.getByTestId('unreproduced-version'));
    expect(cell.textContent).toMatch(/VERSION NOT RECORDED/);
    expect(screen.queryByTestId('reproduced-version'), 'a version was claimed for edited wording')
      .toBeNull();

    // The wording is still shown in full — unreproducible is not the same as absent.
    fireEvent.click(screen.getByTestId('wall-row-e-1'));
    expect(screen.getByTestId('disclosure-text-e-1').textContent)
      .toBe(`${issued.text}\n\nAdded by hand in the call.`);
    expect(document.body.textContent)
      .toMatch(/NOT a finding that the disclosure is wrong or absent/i);
  });

  /** The library is versioned policy, so every template's version is on the page. */
  it('displays a version for every template in the library', async () => {
    await mount();
    expect(screen.getByTestId('library-version').textContent?.trim()).not.toBe('');
    for (const t of DISCLOSURE_TEMPLATES) {
      expect(
        screen.getByTestId(`library-version-${t.id}`).textContent,
        `${t.id} is in the library with no version on screen`,
      ).toBe(`v${t.version}`);
    }
  });
});

/* ── 3. The perimeter ──────────────────────────────────────────────────────── */

describe('the jurisdiction perimeter', () => {
  /**
   * The whole reason P9 stores a perimeter instead of deciding one: an entry that
   * has passed its review date must READ as a refusal. If the screen showed the
   * recorded class and let the expiry sit quietly in a date column, the desk would
   * go on quoting against a position nobody has looked at in months — which is
   * indistinguishable, from the outside, from having invented one.
   */
  it('marks a stale entry STALE, states it is BLOCKING, and shows the day count', async () => {
    await mount();
    const row = screen.getByTestId('perimeter-row-liechtenstein-mica_whitepaper');
    const text = row.textContent ?? '';

    expect(text, 'a past-review entry is not marked stale').toMatch(/STALE/);
    expect(text, 'staleness is shown but not stated as blocking').toMatch(/YES\s*—\s*BLOCKING/);
    // D1: the number can be re-derived by hand from the two dates in the same row.
    expect(text).toContain('2026-07-31');
    expect(text, 'the day count on screen does not match reviewBy → asOf')
      .toContain(String(DAYS_PAST_REVIEW));
    // D3: the recorded class travels BESIDE the staleness, not folded into it — a
    // stale `counsel_required` row still reports `counsel_required`.
    expect(text).toMatch(/Counsel required/);
    expect(text, 'a stale row is being described as current').not.toMatch(/\bCurrent\b/);
    // D2: the refusal names its gate and what would clear it.
    expect(text).toMatch(/perimeter_malformed|perimeter_stale|perimeter_unreviewed/);
    expect(text).toMatch(/REMEDY:/);
  });

  /**
   * WHICH PERIMETER AM I LOOKING AT. Two exist: compiled policy in
   * `packages/shared/src/gps/perimeter.ts`, which this section renders, and a
   * database perimeter in the Phase 9 server path (0050, `gps/conflict.ts:288`).
   * If a human enters a reviewed position in the database, this grid would go on
   * printing "UNREVIEWED" for it — a lie in the direction that makes people stop
   * believing the screen. The caveat is on the artifact until the response shapes
   * move to shared and this section can read the authoritative one.
   */
  it('states that it renders compiled policy and not the database perimeter', async () => {
    await mount();
    const caveat = screen.getByTestId('perimeter-source-caveat');
    expect(caveat.textContent).toMatch(/COMPILED perimeter, not a database read/i);
    expect(caveat.textContent).toMatch(/GET \/v1\/gps\/conflict\/perimeter/);
    expect(caveat.textContent, 'the screen does not say which source wins')
      .toMatch(/treat a disagreement between them as the database being right/i);
  });

  /** Every cell exists. A hole in the grid would read as an oversight. */
  it('renders a row for every jurisdiction × offer, all refused', async () => {
    await mount();
    for (const p of PERIMETER_PROFILES) {
      for (const offer of Object.keys(p.offers)) {
        const row = screen.getByTestId(`perimeter-row-${p.jurisdiction}-${offer}`);
        expect(row.textContent, `${p.jurisdiction}/${offer} is not refused`)
          .toMatch(/YES\s*—\s*BLOCKING/);
      }
    }
  });

  /**
   * The banner. This is legal surface area, and a confident-looking guess is the
   * worst outcome available — worse than an empty section, because a reader who
   * misses the caveat draws the opposite conclusion from the one the data supports.
   */
  it('shows the unreviewed banner, with the reason, while the rows are placeholders', async () => {
    expect(PERIMETER_IS_UNREVIEWED, 'the fixture assumption changed').toBe(true);
    await mount();
    const banner = screen.getByTestId('perimeter-unreviewed-banner');
    expect(banner.textContent).toMatch(/authorises nothing/i);
    expect(banner.textContent).toMatch(/No qualified human has entered, sourced or reviewed/i);
    // Each row says the same thing in its own cells, so the claim survives a reader
    // who starts in the middle of the table.
    const row = screen.getByTestId('perimeter-row-eu-diagnostic');
    expect(row.textContent).toMatch(/UNREVIEWED/);
    expect(row.textContent, 'the entry names nobody and the screen does not say so')
      .toMatch(/NOBODY/);
  });

  /**
   * A jurisdiction in the book that the perimeter has never heard of is the
   * commercially live case: work is already being quoted into a place where nobody
   * recorded a position. It must be named, and it must classify as unknown — not
   * as prohibited, which would be inventing a conclusion in the safe direction.
   */
  it('names book jurisdictions the perimeter does not cover, as unknown', async () => {
    await mount({
      clients: [client({ jurisdiction: 'Cayman Islands' })],
      engagements: [engagement()],
    });
    const table = screen.getByTestId('perimeter-unlisted');
    expect(table.textContent).toContain('Cayman Islands');
    expect(table.textContent).toMatch(/UNKNOWN — nobody has recorded a position/);
    expect(table.textContent, 'an unlisted jurisdiction was treated as a finding')
      .toMatch(/not a finding either way/i);
  });
});

/* ── 4. Print (D7) ─────────────────────────────────────────────────────────── */

describe('the printed artifact', () => {
  /**
   * jsdom cannot print, so this asserts the RULES exist — in particular the one
   * that is easy to omit and expensive to omit: a scrollable region clips in print,
   * so the widest table on the wall would lose its right-hand columns silently,
   * including the perimeter gate. A printed compliance artifact missing columns is
   * worse than an ugly one.
   */
  it('mounts print styles that unlock the scroll containers and keep rows whole', async () => {
    await mount({ engagements: [engagement()] });
    const style = screen.getByTestId('wall-print-styles');
    const css = style.textContent ?? '';
    expect(css).toMatch(/@media print/);
    expect(css, 'scrollable tables will clip and drop columns on paper')
      .toMatch(/\.overflow-x-auto\s*\{\s*overflow:\s*visible/);
    expect(css, 'rows may break across pages, separating a position from its client')
      .toMatch(/page-break-inside:\s*avoid/);
    expect(css, 'a table split across sheets loses its header')
      .toMatch(/thead\s*\{\s*display:\s*table-header-group/);
    expect(css, 'the verbatim wording may lose its line breaks')
      .toMatch(/white-space:\s*pre-wrap/);
    // The controls must not print, and the shared chrome reset must be mounted too.
    expect(css).toMatch(/\.br-no-print\s*\{\s*display:\s*none/);
    expect(document.querySelectorAll('style').length).toBeGreaterThan(1);
  });

  /** Dated, in both places a reader looks, from ONE observation. */
  it('stamps the same as-of instant at the top and the bottom', async () => {
    await mount();
    const top = screen.getByTestId('wall-asof').textContent ?? '';
    const bottom = screen.getByTestId('wall-footer-asof').textContent ?? '';
    expect(top).toMatch(/AS OF 2026-09-29 12:00Z/);
    expect(bottom).toContain('2026-09-29 12:00Z');
  });
});

/* ── 5. Second-tier sessions ───────────────────────────────────────────────── */

/**
 * The endpoint's own payload shape (`SecondTierView`,
 * `apps/api/src/gps/conflict.ts:1425`), built through the fetcher's declared return
 * type so a drift between the two becomes a type error here rather than an
 * `undefined` on a compliance artifact.
 */
type SessionView = Awaited<ReturnType<typeof conflictApi.fetchSecondTierSessions>>;

function use(email: string, count = 1): SessionView['usage'][number] {
  return {
    email,
    firstSeen: '2026-09-27T08:00:00.000Z',
    lastSeen: '2026-09-29T09:00:00.000Z',
    count,
  };
}

function sessionView(over: Partial<SessionView> = {}): SessionView {
  return {
    asOf: NOW.toISOString(),
    configured: true,
    usage: [],
    unexpected: [],
    rosterEmailCount: 6,
    rotateAdvised: false,
    limits: ['In-memory only. The API restarting forgets every session recorded here.'],
    ...over,
  };
}

describe('second-tier session visibility', () => {
  /**
   * The distinction this panel exists for. The handler is written
   * (`routes/gpsConflict.ts:622`) and its router mounts itself nowhere, so the
   * request 404s — and "we cannot see who used the shared passcode" must never
   * render as "nobody used it". They look identical from the browser and only one of
   * them is safe.
   */
  it('reports an unmounted endpoint as unobservable, not as an empty log', async () => {
    vi.mocked(conflictApi.fetchSecondTierSessions)
      .mockRejectedValue(new ApiError('not found', 404, 'NOT_FOUND'));
    await mount();

    const panel = await waitFor(() => screen.getByTestId('second-tier-not-mounted'));
    expect(panel.textContent).toMatch(/NOT OBSERVABLE/);
    expect(panel.textContent).toContain(conflictApi.SECOND_TIER_ENDPOINT);
    expect(panel.textContent, 'the panel does not say the handler exists')
      .toMatch(/apps\/api\/src\/routes\/gpsConflict\.ts:622/);
    expect(panel.textContent).toMatch(/unobserved credential, not an unused one/i);
    // No counts at all: a zero here is the reassurance this panel must not fake.
    expect(screen.queryByTestId('second-tier-summary')).toBeNull();
    expect(screen.queryByTestId('second-tier-empty')).toBeNull();
  });

  /**
   * 403 is the designed answer for a non-approver, and it must not read as an
   * all-clear either. The endpoint is approver-only because the non-roster list is
   * what an intruder would check to see whether they had been noticed.
   */
  it('reports a 403 as approver-only, not as no unexpected addresses', async () => {
    vi.mocked(conflictApi.fetchSecondTierSessions)
      .mockRejectedValue(new ApiError('forbidden', 403, 'FORBIDDEN'));
    await mount();

    const panel = await waitFor(() => screen.getByTestId('second-tier-forbidden'));
    expect(panel.textContent).toMatch(/Approver-only/i);
    expect(panel.textContent).toMatch(/An approver must print this section/i);
    expect(screen.queryByTestId('second-tier-summary')).toBeNull();
  });

  it('flags a non-roster address, calls for rotation, and quotes the limits', async () => {
    vi.mocked(conflictApi.fetchSecondTierSessions).mockResolvedValue(sessionView({
      usage: [use('contractor@lcx.com', 2), use('nik@lcx.com', 9)],
      unexpected: [use('contractor@lcx.com', 2)],
      rotateAdvised: true,
      limits: [
        'In-memory only. The API restarting forgets every session recorded here.',
        'A shared passcode is unattributable. These rows name an address that was typed.',
      ],
    }));
    await mount();

    const summary_ = await waitFor(() => screen.getByTestId('second-tier-summary'));
    expect(summary_.textContent).toMatch(/NOT ON THE ROSTER 1/);
    expect(summary_.textContent).toMatch(/ROTATE THE PASSCODE/);
    expect(summary_.textContent, 'the screen hides that the second door is open')
      .toMatch(/SECOND DOOR/);
    expect(screen.getByText('NOT ON THE ROSTER')).toBeTruthy();
    expect(screen.getByText('on the roster')).toBeTruthy();

    // The caveats are the server's sentences, rendered whole — they are the reason
    // this table cannot be cited as an audit record.
    const limits = screen.getByTestId('second-tier-limits');
    expect(limits.querySelectorAll('li')).toHaveLength(2);
    expect(limits.textContent).toMatch(/restarting forgets every session/i);
  });

  /**
   * The web layer mirrors a server-side interface by hand because it cannot import
   * one, which is the exact circumstance that shipped a green build over a page
   * guaranteed to crash. So the payload is checked at runtime and a mismatch renders
   * a refusal that names both declarations — not a table of undefined.
   */
  it('refuses to render a payload that does not match the contract', async () => {
    vi.mocked(conflictApi.fetchSecondTierSessions)
      // The shape the endpoint DOESN'T return: the bare array an earlier draft of
      // this screen assumed. Cast because the point is that `tsc` is not the check.
      .mockResolvedValue([use('someone@lcx.com')] as unknown as SessionView);
    await mount();

    const panel = await waitFor(() => screen.getByTestId('second-tier-malformed'));
    expect(panel.textContent).toMatch(/did not match the contract/i);
    expect(panel.textContent).toMatch(/apps\/api\/src\/gps\/conflict\.ts:1425/);
    expect(screen.queryByTestId('second-tier-summary'), 'a malformed payload was rendered anyway')
      .toBeNull();
  });

  /** An empty log is not "nobody entered", and the panel says which one it is. */
  it('says an empty log only covers the current API process', async () => {
    vi.mocked(conflictApi.fetchSecondTierSessions).mockResolvedValue(sessionView());
    await mount();
    const empty = await waitFor(() => screen.getByTestId('second-tier-empty'));
    expect(empty.textContent).toMatch(/SINCE THIS API PROCESS STARTED/);
    expect(empty.textContent).toMatch(/not the same as none ever/i);
  });
});

/* ── 6. Absences and drift guards ──────────────────────────────────────────── */

describe('the wall\'s guards', () => {
  /**
   * A failed fetch and an empty column are different facts. The dangerous
   * direction is only one of them: reporting "no disclosure wording" for a row
   * whose wording was never read would manufacture a compliance gap — or, in a
   * kinder reading, teach the desk to ignore the ones that are real.
   */
  it('says a fetch failed rather than reporting the wording as absent', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(conflictApi.fetchGpsEngagementConflict).mockRejectedValue(new Error('boom'));
    await mount({
      engagements: [engagement({
        conflict: { decision: 'cleared', decidedBy: 'nik', decidedAt: DECIDED_AT },
      })],
    });
    const row = await waitFor(() => screen.getByTestId('wall-row-e-1'));
    expect(row.textContent).toMatch(/FETCH FAILED/);
    expect(row.textContent, 'an unread wording was reported as an absent one')
      .not.toMatch(/NO TEXT STORED/);
    spy.mockRestore();
  });

  /**
   * PRODUCTION STATE AS THIS SHIPS: 0047/0049 are unapplied, so every GPS table is
   * absent and the list endpoint answers with an empty array. A blank wall in that
   * situation is not a clean conflict record, and the screen that says otherwise —
   * by saying nothing — is the one that would be shown to compliance.
   */
  it('says nothing was read when the compartment is not migrated', async () => {
    await mount({ engagements: [], summary: summary({ migrated: false }) });
    const banner = await waitFor(() => screen.getByTestId('not-migrated-banner'));
    expect(banner.textContent).toMatch(/INERT here/i);
    expect(banner.textContent).toMatch(/empty wall below is therefore evidence of NOTHING/i);
    expect(screen.getByTestId('wall-empty').textContent).toMatch(/NOTHING WAS READ/);
    expect(screen.getByTestId('wall-empty').textContent, 'an inert compartment read as a clean book')
      .not.toMatch(/empty book/i);
    // The compiled policy needs no database and must still be there.
    expect(screen.getByTestId('perimeter-row-us-gtm_sprint')).toBeTruthy();
    expect(screen.getByTestId('standing-statement-text')).toBeTruthy();
  });

  /**
   * Two independent counts of the same fact, compared. The GPS desk once shipped a
   * page written against a summary contract the API never had; agreement between a
   * client-side walk and the server's SQL is cheap to check and the disagreement is
   * exactly the signal that one of them is reading a different book.
   */
  it('reports a disagreement with the server\'s own count of missing checks', async () => {
    await mount({
      engagements: [engagement({ conflict: null })],
      summary: summary({ gaps: { ...summary().gaps, missingConflictCheck: 4 } }),
    });
    const notice = await waitFor(() => screen.getByTestId('count-disagreement'));
    expect(notice.textContent).toMatch(/counted 1 engagement\(s\)/);
    expect(notice.textContent).toMatch(/server's own SQL count is 4/);
    expect(notice.textContent).toMatch(/Do not rely on either number/i);
  });

  /**
   * The list endpoint says a check exists; the detail endpoint says it does not.
   * Both cannot be right, and the tidier reading ("no wording stored") is the one
   * that would quietly become the record. The screen reports the contradiction.
   */
  it('reports a list/detail contradiction instead of picking the tidier reading', async () => {
    await mount({
      engagements: [engagement({
        conflict: { decision: 'cleared', decidedBy: 'nik', decidedAt: DECIDED_AT },
      })],
      detail: null,
    });
    const row = await waitFor(() => screen.getByTestId('wall-row-e-1'));
    expect(row.textContent).toMatch(/CONTRADICTION/);
    expect(row.textContent, 'a contradiction was reported as an absent wording')
      .not.toMatch(/NO TEXT STORED/);
  });

  /**
   * The list this screen prints as "what MISSING blocks" is the API's own
   * `REQUIRES_CONFLICT_CLEARANCE` (`apps/api/src/gps/service.ts:760`), derived from
   * the same shared lifecycle rather than hand-typed — but derived, not imported,
   * because the API constant is server-side. This pins the result so a lifecycle
   * edit cannot silently change what the wall claims is blocked.
   */
  it('mirrors the API\'s conflict-clearance status list exactly', () => {
    expect([...CLIENT_FACING_STATUSES]).toEqual([
      'proposed', 'accepted', 'deposit_paid', 'in_delivery', 'delivered', 'invoiced', 'collected',
    ]);
  });

  /**
   * THE D2 LOCKOUT, extended to the surface where it is most tempting to break.
   * A conflict wall is exactly where somebody reaches for "attach the signed
   * disclosure PDF" — and GPS accepts no client artifact anywhere, because whether
   * LCX legal/DPO permits third-party confidential material on LCX infrastructure
   * is unanswered.
   *
   * `importActual`, not the mocked binding: written against `Object.keys(mocked)`
   * this would enumerate the vi.mock factory's own keys and stay green forever
   * while a real upload export sat in the module (the same fail-open that
   * `gps.test.tsx:149` measured).
   */
  it('the conflict api client exports no upload-shaped function', async () => {
    const real = await vi.importActual<typeof conflictApi>('@/lib/api/gpsConflict');
    const names = Object.keys(real);
    expect(names.length, 'the real module exported nothing, so this proves nothing')
      .toBeGreaterThan(2);
    const offenders = names.filter((n) => /upload|attach|artifact|document|file/i.test(n));
    expect(offenders, 'an artifact-intake function appeared on the conflict wall api client')
      .toEqual([]);
  });

  it('neither source file contains a file input, FormData or a multipart body', () => {
    for (const rel of ['../GpsConflict.tsx', '../../lib/api/gpsConflict.ts']) {
      const text = readFileSync(resolve(__dirname, rel), 'utf8');
      // Comments are stripped first: both files DISCUSS the absent capability at
      // length and a naive grep would match the prose explaining why it is absent.
      // The claim is about code.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${rel} gained a file input`).not.toMatch(/type\s*=\s*["']file["']/);
      expect(code, `${rel} gained FormData`).not.toMatch(/FormData/);
      expect(code, `${rel} gained a multipart body`).not.toMatch(/multipart/i);
    }
  });

  it('renders no file input and no upload affordance', async () => {
    await mount({ engagements: [engagement()] });
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(0);
    const controls = [...document.querySelectorAll('button, a[href], label')]
      .map((el) => (el.textContent ?? '').toLowerCase())
      .filter((t) => /\bupload\b|\battach\b|drop a file|choose file/.test(t));
    expect(controls, 'an upload affordance appeared on the conflict wall').toEqual([]);
  });

  /**
   * The attribution limit is the one caveat a reader of this artifact most needs
   * and is least likely to think of. It belongs on the page, not in a comment.
   */
  it('states on the page that it cannot prove WHO decided', async () => {
    await mount({ engagements: [engagement()] });
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Sign-in is a SHARED passcode/);
    expect(text).toMatch(/not evidence of which human checked it/i);
    expect(text).toMatch(/Per-person attribution does not exist in this system yet/i);
  });

  /** D6: rows are reachable and openable without a mouse. */
  it('opens a row from the keyboard', async () => {
    const issued = issuedDisclosure('gps-conflict-cleared-with-disclosure');
    await mount({
      engagements: [engagement({
        conflict: { decision: 'cleared_with_disclosure', decidedBy: 'nik', decidedAt: DECIDED_AT },
      })],
      detail: check({ disclosureTextUsed: issued.text }),
    });
    const row = await waitFor(() => screen.getByTestId('wall-row-e-1'));
    expect(row.getAttribute('tabindex'), 'the row is not focusable').toBe('0');
    // The evidence is always in the DOM (for print); collapsed means hidden.
    expect(screen.getByTestId('wall-evidence-e-1').className).toContain('hidden');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByTestId('wall-evidence-e-1').className).not.toContain('hidden');
    expect(screen.getByTestId('disclosure-text-e-1').textContent).toBe(issued.text);
  });

  /**
   * The completeness of the handed-over page must not depend on what was clicked.
   * A ⌘P with every row collapsed has to produce the same artifact as a ⌘P with
   * every row open, or the paper quietly omits the wording it exists to show.
   */
  it('carries every row\'s wording in the DOM and forces it visible in print', async () => {
    const issued = issuedDisclosure('gps-conflict-cleared-with-disclosure');
    await mount({
      engagements: [engagement({
        conflict: { decision: 'cleared_with_disclosure', decidedBy: 'nik', decidedAt: DECIDED_AT },
      })],
      detail: check({ disclosureTextUsed: issued.text }),
    });
    // Nothing clicked.
    const evidence = await waitFor(() => screen.getByTestId('wall-evidence-e-1'));
    expect(evidence.className, 'a collapsed row should be hidden on screen').toContain('hidden');
    expect(screen.getByTestId('disclosure-text-e-1').textContent,
      'the wording is not in the DOM, so it cannot print').toBe(issued.text);
    expect(screen.getByTestId('wall-print-styles').textContent,
      'collapsed rows will print empty')
      .toMatch(/\.wall-evidence\s*\{\s*display:\s*table-row\s*!important/);
  });
});
