import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import {
  MarketingRecord, EVIDENTIARY_FIELDS, PER_STATUS_ROW_CEILING, RECORD_STATUSES,
  UNRESOLVED_APPROVER,
} from '../MarketingRecord';
import * as api from '@/lib/api/marketing';
import type { MarketingDraft, MarketingReply, MarketingSummary, ReplyStatus } from '@/lib/api/marketing';
import { attachMeta } from '@/lib/api/meta';

/**
 * THE RECORD — the guards on the produce-on-demand bundle.
 *
 * This is the artefact that would go to the FMA, or to any EEA host authority
 * under MiCA Art 8(2). So the failure to design against is not a blank page: it is
 * a page that looks like a complete record and is not one. Every test below pins a
 * sentence a well-meaning edit could quietly make untrue, and several assert an
 * ABSENCE — the only kind of claim that survives someone adding a feature in good
 * faith.
 *
 *  1. All sixteen evidentiary fields are declared, and the published text is
 *     declared NOT HELD. The day someone marks field 1 as held without adding a
 *     paste-back path, this suite fails.
 *  2. Completeness is stated BEFORE the data, in document order. A bundle whose
 *     caveats come after its contents is read as complete.
 *  3. A shortfall against the server's own SQL count is stated in rows, and a
 *     truncated read says it was truncated.
 *  4. Retention: three distinct verdicts, and a row with no recorded expiry never
 *     renders as a row that is not expiring.
 *  5. Four eyes are NEVER reported as achieved, including when a real name is on
 *     the approval — because the drafter is not recorded anywhere.
 *  6. An approval attributed to the literal string `unknown` is called out as
 *     naming nobody.
 *  7. Every item's evidence is in the DOM even when collapsed, because that is what
 *     makes ⌘P produce a whole bundle rather than a list of headings.
 *  8. No `<header>` and no `<footer>` element anywhere: `PrintStyles` hides both in
 *     print, so the as-of stamp and the caveats would vanish from the paper copy.
 *  9. All five statuses are read explicitly. The unfiltered queue read excludes
 *     `answered` and `ignored`, which is exactly the material a record request is
 *     about.
 * 10. The tallies strip carries no forbidden metric, and §4 names them as
 *     unavailable rather than omitting the row.
 *
 * WHAT THESE TESTS CANNOT SEE, stated plainly: jsdom has no layout, no paint and no
 * print pipeline. "The evidence prints" is asserted as "the evidence row is in the
 * DOM and the stylesheet that un-hides it in print is mounted with that rule". That
 * is not a claim about what comes out of a printer. The only way to check that is to
 * print it.
 */

vi.mock('@/lib/api/marketing', () => ({
  fetchMarketingQueue: vi.fn(),
  fetchMarketingSummary: vi.fn(),
  fetchDrafts: vi.fn(),
  /* §6 and §7, added by the contract wave. `apps/api/src/marketing/record.ts` had no importer
     anywhere, so the Art 8(2) production and all three statutory paths were unreachable from
     this product. These four are the calls that reach them. */
  fetchExportBundle: vi.fn(),
  requestSubjectAccess: vi.fn(),
  requestErasure: vi.fn(),
  recordOwnStatement: vi.fn(),
}));

/** A fixed clock, so retention arithmetic in the assertions is exact rather than vague. */
const NOW = new Date('2026-08-02T12:00:00.000Z');
const DAY = 86_400_000;

function iso(offsetDays: number): string {
  return new Date(NOW.getTime() + offsetDays * DAY).toISOString();
}

function reply(over: Partial<MarketingReply> & { id: number }): MarketingReply {
  return {
    x_comment_id: `19000000000000${over.id}`,
    x_post_id: '18000000000000001',
    author_handle: 'someone',
    author_display: 'Some One',
    body: 'is LCX solvent',
    posted_at: null,
    received_at: iso(-10),
    status: 'answered',
    sentiment: null,
    source_grade: 'C3',
    source_kind: 'x_notification_email',
    parse_failed: false,
    // NO `raw_email`. The wiring pass had to declare it because the route was
    // `SELECT *` and 20KB of a stranger's forwarded email really did cross to the
    // browser. The route now names its columns and the body is not among them, so a
    // fixture carrying it would model a payload the API does not send.
    /*
     * The M0 columns: the API returns these, so the
     * fixture carries them. `sender_auth_evidence` is the provider's verbatim
     * `Authentication-Results` field and NOTHING on this page may render it — the record
     * page reproduces what the desk said, not the diagnostics of how mail reached it.
     * Defaults are the authenticated, un-quarantined row.
     */
    posted_at_source: null,
    posted_on_displayed: null,
    raw_email_cleared_at: iso(-9),
    sender_from: 'notify@x.com',
    sender_auth_state: 'dkim',
    sender_dkim_domain: 'x.com',
    sender_auth_evidence: null,
    quarantined: false,
    quarantine_code: null,
    collision_of_comment_id: null,
    ...over,
  };
}

/**
 * A row as the API actually returns it — `SELECT *`, so it carries
 * `retention_expires_at` even though `MarketingReply` does not declare it. The cast
 * is the point of the fixture: the screen reads that column defensively, and a
 * fixture that omitted it would test a payload the server never sends.
 */
function rowWithExpiry(over: Partial<MarketingReply> & { id: number }, expiresAt: string | null): MarketingReply {
  const r = reply(over) as MarketingReply & { retention_expires_at?: string };
  if (expiresAt !== null) r.retention_expires_at = expiresAt;
  return r;
}

function draft(over: Partial<MarketingDraft> & { id: number; reply_id: number }): MarketingDraft {
  return {
    body: 'Thanks for asking — here is where to read our disclosures.',
    used_llm: true,
    flagged: false,
    flag_reason: null,
    status: 'approved',
    approved_by: 'nikhil.sharma@lcx.com',
    approved_at: iso(-9),
    created_at: iso(-10),
    // Approved AND asserted sent, which is the row an Art 8(2) production is actually
    // about: a communication the desk cleared and a named human says went out. Approval on
    // its own is not a publication, and the record must not present it as one.
    sent_asserted_by: 'nikhil.sharma@lcx.com',
    sent_asserted_at: iso(-9),
    ...over,
  };
}

function summary(over: Partial<MarketingSummary> = {}): MarketingSummary {
  return {
    counts: {},
    oldestUnansweredHours: null,
    oldestObservedWaitingHours: null,
    // Nothing open, so there is no wait to report on either clock. `null` here is "the
    // queue is empty", which is different from the refusal that means "we cannot see".
    oldestSincePostedHours: null,
    suspicious: 0,
    unparsed: 0,
    quarantined: 0,
    collisions: 0,
    mailConfigured: true,
    migrated: true,
    ...over,
  };
}

/** Route the five per-status reads from one map, so a test declares only what it cares about. */
function queueFrom(byStatus: Partial<Record<ReplyStatus, MarketingReply[]>>, meta?: unknown) {
  vi.mocked(api.fetchMarketingQueue).mockImplementation(async (status?: ReplyStatus) => {
    const rows = (status ? byStatus[status] : undefined) ?? [];
    return meta === undefined ? rows : attachMeta(rows, meta);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.mocked(api.fetchMarketingSummary).mockResolvedValue(summary());
  queueFrom({});
  vi.mocked(api.fetchDrafts).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Every test waits on this: the bundle is assembled across several awaits.
 *
 * `alsoWaitFor` is NOT optional politeness — it is the fix for a bug this file has
 * now produced TWICE in CI (run #44 and run #30894215553, both 2026-08-03/04).
 * `coverage-rows` is populated from different state than the retention tables, the
 * bundle rows and the tallies strip, so a page that has rendered it has NOT
 * necessarily rendered them. Locally every section lands in the same tick, so
 * waiting on the first appears to wait for the rest; under CI's slower scheduler
 * it does not, and the assertion reads an empty state.
 *
 * Pass the testid the assertion is ABOUT. Raising a timeout would hide this; the
 * barrier was simply pointed at the wrong element.
 */
async function mountAndSettle(...alsoWaitFor: string[]) {
  const r = render(<MarketingRecord />);
  await waitFor(() => expect(screen.getByTestId('coverage-rows')).toBeInTheDocument());
  for (const id of alsoWaitFor) {
    await waitFor(() => expect(screen.getByTestId(id)).toBeInTheDocument());
  }
  return r;
}

/**
 * Settle on the section the assertion is ABOUT, rather than on `coverage-rows`.
 *
 * `mountAndSettle` waits for the coverage table and then returns, and for most of this
 * file that is the right barrier. It is NOT right for the retention section: the two
 * tables are populated from different state, so a page that has rendered `coverage-rows`
 * has not necessarily rendered `retention-rows` yet.
 *
 * This failed only in CI (run #44, 2026-08-03) and passed on the author's machine every
 * time, which is exactly the shape of that mistake: locally both tables land in the same
 * tick, so waiting on the first appears to wait for the second. Under a slower scheduler
 * the retention table was still showing its EMPTY state, and the assertion read
 * `retention-empty` and reported "0 items in bundle".
 *
 * Raising a timeout would have hidden this. The barrier was simply pointed at the wrong
 * element.
 */
async function settleOn(testid: string) {
  await waitFor(() => expect(screen.getByTestId(testid)).toBeInTheDocument());
}

/* ── 1. The sixteen fields, and the one that matters most ──────────────────── */

describe('the completeness declaration', () => {
  it('declares all sixteen evidentiary fields with a verdict each', async () => {
    const { container } = await mountAndSettle();
    const rows = container.querySelectorAll('[data-field-n]');
    expect(rows.length).toBe(16);
    expect(EVIDENTIARY_FIELDS.map((f) => f.n)).toEqual([...Array(16)].map((_, i) => i + 1));
    // Every row carries a verdict from the closed set, so none can render blank.
    for (const row of rows) {
      expect(['present', 'partial', 'absent']).toContain(row.getAttribute('data-holds'));
    }
  });

  it('declares the published text NOT HELD, because nothing here publishes', async () => {
    const { container } = await mountAndSettle();
    const field1 = container.querySelector('[data-field-n="1"]');
    expect(field1?.getAttribute('data-holds')).toBe('absent');
    expect(field1?.textContent).toContain('NOT HELD');
  });

  it('names the absent fields rather than omitting them — no field is silently dropped', async () => {
    await mountAndSettle();
    // The four fields whose absence a supervisor is most likely to ask about.
    for (const n of [1, 6, 10, 14]) {
      const f = EVIDENTIARY_FIELDS.find((x) => x.n === n);
      expect(f?.holds, `field ${n} must be declared absent while no such column exists`).toBe('absent');
    }
  });

  it('states that no item in the record was written by a human', async () => {
    await mountAndSettle('authorship-unreachable');
    expect(screen.getByTestId('authorship-unreachable').textContent)
      .toMatch(/no compose box and no edit box/i);
  });
});

/* ── 2. Order: the caveats come first ─────────────────────────────────────── */

describe('the shape of the artefact', () => {
  it('puts the completeness declaration ahead of the bundle in document order', async () => {
    const { container } = await mountAndSettle();
    const html = container.innerHTML;
    const completeness = html.indexOf('completeness-headline');
    const bundle = html.indexOf('§3');
    expect(completeness).toBeGreaterThan(-1);
    expect(bundle).toBeGreaterThan(-1);
    expect(completeness, 'a bundle whose caveats follow its contents reads as complete').toBeLessThan(bundle);
  });

  it('uses no <header> and no <footer>, because PrintStyles hides both in print', async () => {
    const { container } = await mountAndSettle('record-asof', 'record-does-not-prove');
    // Not a style preference: `components/report/PrintStyles.tsx` emits
    // `header, aside, footer { display: none !important }` inside `@media print`,
    // so the as-of stamp and the "what this does not prove" list would be deleted
    // from the printed bundle — the two parts that make it honest.
    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelector('footer')).toBeNull();
    expect(container.querySelector('aside')).toBeNull();
    // And both survive as ordinary elements.
    expect(screen.getByTestId('record-asof')).toBeInTheDocument();
    expect(screen.getByTestId('record-does-not-prove')).toBeInTheDocument();
  });

  it('mounts the print rule that un-hides collapsed evidence', async () => {
    await mountAndSettle('record-print-styles');
    const css = screen.getByTestId('record-print-styles').textContent ?? '';
    expect(css).toContain('.record-evidence-closed { display: none; }');
    expect(css).toMatch(/@media print \{[\s\S]*\.record-evidence-closed \{ display: table-row !important; \}/);
  });
});

/* ── 3. Coverage against the server's own count ────────────────────────────── */

describe('coverage', () => {
  it('reads every status explicitly, including answered and ignored', async () => {
    await mountAndSettle();
    const asked = vi.mocked(api.fetchMarketingQueue).mock.calls.map((c) => c[0]);
    // The unfiltered read is `WHERE status IN ('new','triaged','drafted')`, so a
    // single call with no argument would silently exclude the two statuses a record
    // request is most likely to be about.
    for (const s of RECORD_STATUSES) expect(asked).toContain(s);
    expect(asked).not.toContain(undefined);
  });

  it('states the shortfall in rows when the server holds more than this pass read', async () => {
    vi.mocked(api.fetchMarketingSummary).mockResolvedValue(summary({ counts: { answered: 120 } }));
    queueFrom({
      answered: [...Array(PER_STATUS_ROW_CEILING)].map((_, i) => reply({ id: i + 1 })),
    });
    await mountAndSettle('coverage-shortfall');
    /* ASSERT-IN-WAITFOR: the barrier settles the CONTAINER, and a container arriving
     * does not imply this child rendered — they come from different state. Positives
     * go inside so they cannot go stale; negatives stay outside because `not` inside
     * a waitFor passes instantly against a DOM that has not rendered. */
    await waitFor(() => {
      const row = screen.getByTestId('coverage-rows').querySelector('[data-coverage-status="answered"]');
      expect(row?.textContent).toContain('70 row(s) NOT IN THIS BUNDLE');
      expect(row?.textContent).toMatch(/truncated, not empty/);
    });
    expect(screen.getByTestId('coverage-shortfall').textContent).toContain('TRUNCATED production');
  });

  it('distinguishes a truncated read from a table that changed underneath it', async () => {
    vi.mocked(api.fetchMarketingSummary).mockResolvedValue(summary({ counts: { answered: 5 } }));
    queueFrom({ answered: [reply({ id: 1 }), reply({ id: 2 })] });
    await mountAndSettle();
      /* ASSERT-IN-WAITFOR. The barrier used to be a DIFFERENT element (the container),
       * and a container arriving does not imply its rows have rendered — the two come
       * from different state. Locally they land in the same tick so it looked settled;
       * under CI's slower scheduler the assertion read an empty section (CI run
       * 30900660294). Making the positive assertion itself the barrier cannot go stale.
       *
       * The NEGATIVE assertions stay OUTSIDE: `not.toMatch` inside waitFor passes
       * instantly against a DOM that has not rendered yet, which is a false pass. */
    await waitFor(() => {
      const r = screen.getByTestId('coverage-rows').querySelector('[data-coverage-status="answered"]');
      expect(r?.textContent).toContain('3 row(s) NOT IN THIS BUNDLE');
      expect(r?.textContent).toMatch(/did not hit its ceiling/);
    });
  });

  it('refuses to claim completeness when the summary read failed', async () => {
    vi.mocked(api.fetchMarketingSummary).mockRejectedValue(new Error('down'));
    queueFrom({ answered: [reply({ id: 1 })] });
    await mountAndSettle('coverage-no-denominator');
    expect(screen.getByTestId('coverage-no-denominator').textContent).toMatch(/Treat it as incomplete/);
    /* ASSERT-IN-WAITFOR: the barrier settles the CONTAINER, and a container arriving
     * does not imply this child rendered — they come from different state. Positives
     * go inside so they cannot go stale; negatives stay outside because `not` inside
     * a waitFor passes instantly against a DOM that has not rendered. */
    await waitFor(() => {
      const row = screen.getByTestId('coverage-rows').querySelector('[data-coverage-status="answered"]');
      expect(row?.textContent).toContain('NOT READ');
    });
  });
});

/* ── 4. Retention: three verdicts, and never a silent "fine" ───────────────── */

describe('the two retention regimes', () => {
  it('marks a row scheduled for deletion before the five-year horizon', async () => {
    queueFrom({ answered: [rowWithExpiry({ id: 1, received_at: iso(-10) }, iso(80))] });
    await mountAndSettle();
    await settleOn('retention-rows');
    /* ASSERT-IN-WAITFOR: the barrier settles the CONTAINER, and a container arriving
     * does not imply this child rendered — they come from different state. Positives
     * go inside so they cannot go stale; negatives stay outside because `not` inside
     * a waitFor passes instantly against a DOM that has not rendered. */
    await waitFor(() => {
      const row = screen.getByTestId('retention-rows').querySelector('[data-retention-verdict]');
      expect(row?.getAttribute('data-retention-verdict')).toBe('swept_before_horizon');
      expect(row?.textContent).toContain('DELETED BEFORE THE FIVE-YEAR HORIZON');
      expect(row?.textContent).toContain('80');
    });
  });

  it('marks a row whose sweep is already due', async () => {
    queueFrom({ answered: [rowWithExpiry({ id: 2, received_at: iso(-100) }, iso(-3))] });
    await mountAndSettle();
    await settleOn('retention-rows');
    /* ASSERT-IN-WAITFOR: the barrier settles the CONTAINER, and a container arriving
     * does not imply this child rendered — they come from different state. Positives
     * go inside so they cannot go stale; negatives stay outside because `not` inside
     * a waitFor passes instantly against a DOM that has not rendered. */
    await waitFor(() => {
      const row = screen.getByTestId('retention-rows').querySelector('[data-retention-verdict]');
      expect(row?.getAttribute('data-retention-verdict')).toBe('sweep_due');
      expect(row?.textContent).toContain('SWEEP ALREADY DUE');
    });
  });

  it('never renders a missing expiry as a row that is not expiring', async () => {
    queueFrom({ answered: [rowWithExpiry({ id: 3 }, null)] });
    await mountAndSettle();
    await settleOn('retention-rows');
    /* ASSERT-IN-WAITFOR: the barrier settles the CONTAINER, and a container arriving
     * does not imply this child rendered — they come from different state. Positives
     * go inside so they cannot go stale; negatives stay outside because `not` inside
     * a waitFor passes instantly against a DOM that has not rendered. */
    await waitFor(() => {
      const row = screen.getByTestId('retention-rows').querySelector('[data-retention-verdict]');
      expect(row?.getAttribute('data-retention-verdict')).toBe('not_recorded');
      expect(row?.textContent).toContain('REGIME NOT RECORDED');
      // The cell says NOT RECORDED, never a blank or a dash that reads as "no expiry".
      expect(row?.textContent).toContain('NOT RECORDED');
    });
  });

  it('states the conflict, that five years is an inference, and that swept rows are invisible', async () => {
    await mountAndSettle('retention-conflict', 'retention-gap-honest', 'retention-invisible-loss');
    expect(screen.getByTestId('retention-conflict').textContent).toMatch(/DPO ruling, not an engineering decision/);
    expect(screen.getByTestId('retention-gap-honest').textContent).toMatch(/no express retention period/i);
    expect(screen.getByTestId('retention-invisible-loss').textContent).toMatch(/persisted nowhere/);
  });

  it('does not present an empty window as a clean record', async () => {
    await mountAndSettle();
    await settleOn('retention-empty');
    expect(screen.getByTestId('retention-empty').textContent)
      .toMatch(/indistinguishable from a row that never existed/);
  });
});

/* ── 5 and 6. Four eyes, honestly ──────────────────────────────────────────── */

describe('four eyes', () => {
  it('reports NOT ACHIEVED even when a real name is on the approval', async () => {
    queueFrom({ answered: [reply({ id: 7 })] });
    vi.mocked(api.fetchDrafts).mockResolvedValue([draft({ id: 71, reply_id: 7 })]);
    await mountAndSettle('bundle-rows');
    /* ASSERT-IN-WAITFOR: the barrier settles the CONTAINER, and a container arriving
     * does not imply this child rendered — they come from different state. Positives
     * go inside so they cannot go stale; negatives stay outside because `not` inside
     * a waitFor passes instantly against a DOM that has not rendered. */
    await waitFor(() => {
      const row = screen.getByTestId('bundle-rows').querySelector('[data-bundle-item="7"]');
      expect(row?.textContent).toContain('NOT ACHIEVED');
    });
    // The reason has to be the missing drafter, not a vague failure.
    expect(screen.getByTestId('bundle-rows').textContent).toMatch(/drafter is not recorded/);
  });

  it('never renders the word "achieved" as an outcome anywhere on the page', async () => {
    queueFrom({ answered: [reply({ id: 7 })] });
    vi.mocked(api.fetchDrafts).mockResolvedValue([draft({ id: 71, reply_id: 7 })]);
    const { container } = await mountAndSettle();
    const text = container.textContent ?? '';
    // "NOT ACHIEVED" is allowed; a bare "ACHIEVED" is the ceremony this screen refuses.
    expect(text.replace(/NOT ACHIEVED/g, '')).not.toMatch(/\bACHIEVED\b/);
  });

  it('calls out an approval that names nobody', async () => {
    queueFrom({ answered: [reply({ id: 8 })] });
    vi.mocked(api.fetchDrafts).mockResolvedValue([
      draft({ id: 81, reply_id: 8, approved_by: UNRESOLVED_APPROVER }),
    ]);
    await mountAndSettle('bundle-rows', 'record-tallies');
    expect(screen.getByTestId('bundle-rows').textContent).toMatch(/APPROVER IS NOT NAMED/);
    expect(screen.getByTestId('record-tallies').textContent).toMatch(/APPROVER NOT NAMED 1/);
  });

  it('does not assess clearance on an item that has none', async () => {
    queueFrom({ ignored: [reply({ id: 9, status: 'ignored' })] });
    await mountAndSettle('bundle-rows');
    /* ASSERT-IN-WAITFOR: the barrier settles the CONTAINER, and a container arriving
     * does not imply this child rendered — they come from different state. Positives
     * go inside so they cannot go stale; negatives stay outside because `not` inside
     * a waitFor passes instantly against a DOM that has not rendered. */
    await waitFor(() => {
      const row = screen.getByTestId('bundle-rows').querySelector('[data-bundle-item="9"]');
      expect(row?.textContent).toContain('N/A');
    });
    expect(screen.getByTestId('bundle-rows').textContent).toMatch(/no clearance to assess/i);
  });

  it('names more than one approved draft on the same item as a contradiction', async () => {
    queueFrom({ answered: [reply({ id: 10 })] });
    vi.mocked(api.fetchDrafts).mockResolvedValue([
      draft({ id: 101, reply_id: 10 }),
      draft({ id: 102, reply_id: 10 }),
    ]);
    await mountAndSettle('bundle-rows');
    expect(screen.getByTestId('bundle-rows').textContent).toMatch(/MORE THAN ONE APPROVED DRAFT/);
  });
});

describe('authorship', () => {
  it('classifies an approved model draft as unedited machine text and counts it', async () => {
    queueFrom({ answered: [reply({ id: 11 })] });
    vi.mocked(api.fetchDrafts).mockResolvedValue([draft({ id: 111, reply_id: 11, used_llm: true })]);
    await mountAndSettle('bundle-rows', 'record-tallies');
    /* ASSERT-IN-WAITFOR: the barrier settles the CONTAINER, and a container arriving
     * does not imply this child rendered — they come from different state. Positives
     * go inside so they cannot go stale; negatives stay outside because `not` inside
     * a waitFor passes instantly against a DOM that has not rendered. */
    await waitFor(() => {
      const row = screen.getByTestId('bundle-rows').querySelector('[data-bundle-item="11"]');
      expect(row?.textContent).toContain('MODEL, UNEDITED');
    });
    expect(screen.getByTestId('record-tallies').textContent).toMatch(/APPROVED MACHINE TEXT, UNEDITED 1/);
  });

  it('does not call a deterministic template a human author', async () => {
    queueFrom({ answered: [reply({ id: 12 })] });
    vi.mocked(api.fetchDrafts).mockResolvedValue([draft({ id: 121, reply_id: 12, used_llm: false })]);
    await mountAndSettle('bundle-rows');
    /* ASSERT-IN-WAITFOR: the barrier settles the CONTAINER, and a container arriving
     * does not imply this child rendered — they come from different state. Positives
     * go inside so they cannot go stale; negatives stay outside because `not` inside
     * a waitFor passes instantly against a DOM that has not rendered. */
    await waitFor(() => {
      const row = screen.getByTestId('bundle-rows').querySelector('[data-bundle-item="12"]');
      expect(row?.textContent).toContain('TEMPLATE, UNEDITED');
    });
  });
});

/* ── 7. The evidence is always in the DOM ─────────────────────────────────── */

describe('printability', () => {
  it('keeps every item\'s evidence in the DOM while the row is collapsed', async () => {
    queueFrom({ answered: [reply({ id: 13, body: 'are my funds safe' })] });
    vi.mocked(api.fetchDrafts).mockResolvedValue([draft({ id: 131, reply_id: 13, body: 'we are looking into it' })]);
    const { container } = await mountAndSettle('inbound-13', 'draft-131');
    // Nothing was expanded.
    expect(container.querySelector('.record-evidence-closed')).not.toBeNull();
    // And the evidence is nevertheless present, verbatim, both sides of it.
    expect(screen.getByTestId('inbound-13').textContent).toBe('are my funds safe');
    expect(screen.getByTestId('draft-131').textContent).toBe('we are looking into it');
  });

  it('reproduces stored text without truncation or reformatting', async () => {
    const body = `line one\n\nline three with <script>alert(1)</script> and  double  spaces`;
    queueFrom({ answered: [reply({ id: 14, body })] });
    await mountAndSettle('inbound-14');
    const pre = screen.getByTestId('inbound-14');
    // Exact bytes: a record that prettifies is not a record. And React escaped it,
    // so the markup is inert text rather than an element.
    expect(pre.textContent).toBe(body);
    expect(pre.querySelector('script')).toBeNull();
  });
});

/* ── M9. The printed artefact ─────────────────────────────────────────────────
 *
 * MiCA Art 8(2) is produce-on-demand: the sheet a supervisor is handed IS this
 * page's output, and the browser is only how it gets there. jsdom has no layout and
 * no print pipeline, so none of the tests below claim to know what a printer emits.
 * What they do is close the three ways this artefact was losing content on paper
 * WITHOUT any of it being visible on screen — a clipped column, a dropped colour, a
 * caveat inside a hidden container — by asserting the rule that prevents each one
 * against the DOM that would otherwise suffer it. Where a rule is a CSS string, the
 * test also asserts the HAZARD it answers still exists, so the rule cannot quietly
 * become decoration after a refactor removes the thing it was protecting.
 */

/** The tokens `components/report/PrintStyles.tsx` already pins for paper. */
/*
 * PARSED FROM PrintStyles.tsx, not hand-listed — and it used to be hand-listed.
 *
 * The literal ['--card', '--navy', '--grey', '--grey-dark', '--line', '--page-bg'] was correct when written
 * and silently wrong the moment a token was added. That happened on 2026-08-13: `--control-border` was
 * introduced because `--line` measured 1.30:1 against a dark card as a control boundary against WCAG
 * 1.4.11's 3.0 floor, it was duly pinned in PrintStyles.tsx — and this test still failed, because the list
 * describing PrintStyles could not see PrintStyles.
 *
 * A hand-list cannot fail on an entry nobody thought of, which is the whole reason the guard exists. Reading
 * the source means adding a pin to the sheet is enough, and REMOVING one still fails here.
 */
const printStylesSource = () =>
  readFileSync(join(__dirname, '..', '..', 'components', 'report', 'PrintStyles.tsx'), 'utf8');

const PINNED_BY_PRINTSTYLES = (() => {
  const src = printStylesSource();
  /*
   * Sliced to the block's OWN closing brace, not to the next landmark selector. The first attempt ended the
   * slice at '[data-relief-live]', which appears in the file's PROSE HEADER 2.3 KB before the CSS — so the
   * slice ran backwards and came back empty, and an empty pin list makes this guard report every token as
   * unpinned. There are no nested braces in the block, so the first '}' after the selector closes it.
   */
  const start = src.indexOf(':root, :root.dark {');
  const block = start < 0 ? '' : src.slice(start, src.indexOf('}', start));
  const names = [...new Set([...block.matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]!))];
  /* Anti-vacuity: an empty list would make the assertion below pass by covering nothing. */
  if (names.length < 5) throw new Error(`PrintStyles pin block did not parse (${names.length} tokens)`);
  return names;
})();

/**
 * Tokens `.dark` redefines that neither block pins — allowed only because this page
 * cannot reach them. Each is asserted absent from the source below, so the exemption
 * is a checked fact rather than a promise.
 */
const UNREACHABLE_TOKEN_UTILITIES = ['indigo', 'chart-', 'shadow-', 'focus:'];

describe('the printed artefact', () => {
  const tokens = () => readFileSync(join(__dirname, '..', '..', 'styles', 'tokens.css'), 'utf8');
  const source = () => readFileSync(join(__dirname, '..', 'MarketingRecord.tsx'), 'utf8');

  it('pins, for paper, every dark-mode token this page can reach', async () => {
    // The defect: `PrintStyles` forces the paper white but `.dark` stays on <html>,
    // so --red keeps its dark value (#e4687a) and every refusal notice and every
    // "row(s) NOT IN THIS BUNDLE" reading prints at about 2.4:1 — in the DOM, off
    // the page. `--ice-soft` is worse: `bg-ice-soft/50` on the evidence quotes is
    // unconditional, so it resolves to a near-black wash under dark navy text.
    await mountAndSettle('record-print-styles');
    const css = screen.getByTestId('record-print-styles').textContent ?? '';
    const printBlock = css.slice(css.indexOf('@media print'));
    const pinned = [...printBlock.matchAll(/(--[a-z-]+):\s*([\d\s]+);/g)];
    expect(pinned.length, 'the print block pins no tokens at all').toBeGreaterThanOrEqual(6);

    const src = tokens();
    const lightBlock = src.slice(src.indexOf(':root {'), src.indexOf('}', src.indexOf(':root {')));
    for (const [, name, value] of pinned) {
      const actual = new RegExp(`${name}:\\s*([\\d\\s]+);`).exec(lightBlock);
      expect(actual, `${name} is pinned for print but is not a :root token`).toBeTruthy();
      expect(
        value.trim(),
        `${name} pinned as "${value.trim()}" but tokens.css :root says "${actual![1].trim()}" — print would not match the app`,
      ).toBe(actual![1].trim());
    }

    // The coverage half, which is what makes this a ratchet rather than a spot check:
    // every token the dark palette overrides is either pinned by one of the two
    // blocks, or unreachable from this page.
    const darkBlock = src.slice(src.indexOf('.dark {'), src.indexOf('\n}', src.indexOf('.dark {')));
    const overridden = [...darkBlock.matchAll(/^\s*(--[a-z-]+):/gm)].map((m) => m[1]);
    const covered = new Set([...PINNED_BY_PRINTSTYLES, ...pinned.map(([, n]) => n)]);
    const unpinned = overridden.filter((t) => !covered.has(t));
    const page = source();
    for (const u of UNREACHABLE_TOKEN_UTILITIES) {
      expect(page, `${u} is used on this page, so its dark token must be pinned for print`).not.toContain(u);
    }
    // Whatever is left must be one of the families those utilities carry.
    const stillOpen = unpinned.filter((t) => !/^--(focus|indigo|chart-|card-fill|shadow-)/.test(t));
    expect(stillOpen, `dark overrides these tokens and nothing pins them for print: ${stillOpen.join(', ')}`).toEqual([]);
  });

  it('unlocks the scroll containers that were trimming the completeness statement', async () => {
    // THE DEFECT THIS CLOSES. Every table on this page sits in an `overflow-x-auto`
    // wrapper, and PrintStyles unlocks `.overflow-hidden` but not that. On paper
    // there is no scrollbar, so anything past the page box is cut with nothing to
    // show it was — and §1's two right-hand columns are the statement of the
    // bundle's own gaps. The bundle would have asserted completeness with the
    // caveats sliced off the edge.
    const { container } = await mountAndSettle('record-print-styles');
    const css = screen.getByTestId('record-print-styles').textContent ?? '';

    const clipped = [...container.querySelectorAll('table')].filter((t) => {
      for (let el: Element | null = t.parentElement; el; el = el.parentElement) {
        if (/overflow-(x-)?auto/.test(el.className)) return true;
      }
      return false;
    });
    // The hazard is real, and it is every table, not one.
    expect(clipped.length, 'no table is in a scroll container — is the unlock rule still needed?')
      .toBe(container.querySelectorAll('table').length);
    // Two on an empty read (§1's two): the bundle and evidence tables need rows.
    expect(clipped.length).toBeGreaterThanOrEqual(2);
    expect(css).toMatch(/\.overflow-x-auto[^}]*\{\s*overflow: visible !important;/);

    // Unlocking alone is not enough: a `whitespace-nowrap` head would then run off
    // the sheet instead of wrapping onto it. Both halves, or neither works.
    expect(container.querySelector('th')?.className).toContain('whitespace-nowrap');
    expect(css).toMatch(/th, td \{[\s\S]*white-space: normal !important;/);
  });

  it('keeps the last column of the completeness statement on the page', async () => {
    // Column six is "What cannot be answered" — the sentence that makes an
    // incomplete bundle producible instead of a misrepresentation. Asserted as
    // content that exists and is in no print-hidden container, which is the part
    // jsdom can actually see.
    const { container } = await mountAndSettle('completeness-fields', 'record-print-styles');
    const rows = [...screen.getByTestId('completeness-fields').querySelectorAll('tr')];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const cells = [...row.querySelectorAll('td')];
      expect(cells.length, 'the completeness table lost a column').toBe(6);
      expect(cells[5].textContent?.trim(), 'a field with no stated cost of absence').not.toBe('');
    }
    for (let el: Element | null = screen.getByTestId('completeness-fields'); el; el = el.parentElement) {
      expect(el.className, 'the completeness statement is inside a print-hidden container')
        .not.toContain('br-no-print');
    }
    expect(container.querySelector('table thead'), 'no column heads to repeat').not.toBeNull();
    expect(screen.getByTestId('record-print-styles').textContent)
      .toMatch(/thead \{ display: table-header-group; \}/);
  });

  it('states availability in words, never by colour alone', async () => {
    // A printed sheet gets photocopied, faxed and read by people who cannot tell the
    // two hues apart. Every "Held" cell is coloured AND labelled; the label is the
    // signal and the colour only agrees with it.
    await mountAndSettle('completeness-fields');
    for (const row of screen.getByTestId('completeness-fields').querySelectorAll('tr')) {
      const held = row.querySelectorAll('td')[2];
      expect(held.className, 'the Held cell carries no colour at all').toMatch(/text-/);
      expect(held.textContent?.trim(), `field ${row.getAttribute('data-field-n')} signals its state by colour only`)
        .toMatch(/[A-Za-z]/);
    }
  });
});

/* ── 9 and 10. Absence, and the honesty ceiling ───────────────────────────── */

describe('honesty', () => {
  it('says it read nothing when the compartment is not migrated, rather than showing a clean record', async () => {
    vi.mocked(api.fetchMarketingSummary).mockResolvedValue(summary({ migrated: false }));
    queueFrom({}, { migrated: false });
    await mountAndSettle('record-not-migrated', 'bundle-empty');
    expect(screen.getByTestId('record-not-migrated').textContent).toMatch(/evidence of NOTHING/);
    expect(screen.getByTestId('bundle-empty').textContent).toMatch(/failure to read, not a finding/);
  });

  it('shows no forbidden metric in the tallies strip', async () => {
    queueFrom({ answered: [reply({ id: 15 })] });
    await mountAndSettle('record-tallies');
    const strip = screen.getByTestId('record-tallies').textContent ?? '';
    for (const banned of [/impression/i, /\breach\b/i, /follower/i, /engagement rate/i, /click.?through/i, /share of voice/i]) {
      expect(strip, `the tallies strip must not carry ${banned}`).not.toMatch(banned);
    }
  });

  it('names the unavailable metrics as unavailable instead of leaving the row out', async () => {
    await mountAndSettle('window-cannot-see');
    const text = screen.getByTestId('window-cannot-see').textContent ?? '';
    expect(text).toMatch(/Impressions, reach, follower change, engagement rate, click-through, share of voice/);
    expect(text).toMatch(/denominator/);
    expect(text).toMatch(/no proxy stands in for them/);
  });

  it('states that an item marked answered is not evidence that anything was published', async () => {
    await mountAndSettle('record-does-not-prove');
    const text = screen.getByTestId('record-does-not-prove').textContent ?? '';
    expect(text).toMatch(/THAT ANYTHING WAS PUBLISHED/);
    expect(text).toMatch(/not by anything being sent/);
  });

  it('reports the status race rather than silently keeping one copy', async () => {
    // The same row comes back under two statuses — what happens when an approval
    // lands between two of the five reads.
    const r = reply({ id: 16 });
    queueFrom({ drafted: [r], answered: [reply({ id: 16, status: 'answered' })] });
    await mountAndSettle('record-status-race', 'bundle-rows');
    expect(screen.getByTestId('record-status-race').textContent).toMatch(/appeared in more than one status read/);
    // And the item is listed exactly once.
    expect(screen.getByTestId('bundle-rows').querySelectorAll('[data-bundle-item="16"]').length).toBe(1);
  });

  it('marks an unread clearance chain as unread, not as an absence of clearance', async () => {
    queueFrom({ answered: [reply({ id: 17 })] });
    vi.mocked(api.fetchDrafts).mockRejectedValue(new Error('boom'));
    await mountAndSettle('bundle-rows');
    /* ASSERT-IN-WAITFOR: the barrier settles the CONTAINER, and a container arriving
     * does not imply this child rendered — they come from different state. Positives
     * go inside so they cannot go stale; negatives stay outside because `not` inside
     * a waitFor passes instantly against a DOM that has not rendered. */
    await waitFor(() => {
      const row = screen.getByTestId('bundle-rows').querySelector('[data-bundle-item="17"]');
      expect(row?.textContent).toContain('NOT READ');
    });
    expect(screen.getByTestId('bundle-rows').textContent)
      .toMatch(/absence of knowledge, not an absence of clearance/);
  });
});

/* ── Absences, read at the source ─────────────────────────────────────────── */

describe('what the record page must never contain', () => {
  /**
   * `raw_email` is in every queue payload because the route SELECTs `*`, so up to
   * 20KB of a stranger's forwarded email reaches the browser on every read. A bundle
   * page is the single most tempting place to render it — "produce everything" — and
   * doing so would put a third party's whole email into a printed artefact and into
   * whatever it is handed to. Read at the source rather than in the DOM, because the
   * rendered check would only cover the rows a fixture happens to populate.
   */
  it('never renders raw_email, and carries no publish-shaped affordance', () => {
    const src = readFileSync(join(__dirname, '..', 'MarketingRecord.tsx'), 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*'); })
      .join('\n');
    expect(code, 'a stranger\'s forwarded email may not be rendered or printed').not.toMatch(/raw_email/);
    for (const banned of [
      />\s*(?:Post|Publish|Send|Schedule|Tweet)\b/i,
      /credential|accessToken|bearerToken|oauth/i,
    ]) {
      expect(code, `MarketingRecord.tsx must not contain ${banned}`).not.toMatch(banned);
    }
  });
});

/* ── The window ───────────────────────────────────────────────────────────── */

describe('the window', () => {
  it('offers a time window and states that a jurisdiction window is impossible', async () => {
    await mountAndSettle('window-cannot-see');
    expect(screen.getByLabelText('Window from')).toBeInTheDocument();
    expect(within(screen.getByTestId('window-cannot-see')).getByText(/Which Member State an item was addressed to/)).toBeInTheDocument();
  });

  it('warns that a window reaching past the sweep is silently incomplete', async () => {
    await mountAndSettle('window-cannot-see');
    expect(screen.getByTestId('window-cannot-see').textContent)
      .toMatch(/beginning more than ninety days ago is close to guaranteed to be missing material/);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  §6 AND §7 — THE PRODUCTION AND THE THREE PATHS THAT HAD NO CALLER
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Sections 1 to 5 are this page's own reconstruction of the record, assembled in the browser
 * from the queue and the draft chains. Sections 6 and 7 ask the SERVER, and before this wave
 * nothing in the product did: `record.ts` was 84KB with no importer, so an Art 15 access
 * request could not be answered, an Art 17 erasure could not be proven, and nothing ever
 * placed a statement on the long clock — meaning day 91 left this compartment holding nothing
 * at all.
 *
 * FALSIFIED BY: removing either section from the page. The panels' own tests stay green.
 */
describe('the record page reaches the server record, not only its own reconstruction', () => {
  it('renders the Art 8(2) production section with a produce control', async () => {
    await mountAndSettle();
    expect(screen.getByText(/The production, as the server holds it/i)).toBeTruthy();
    expect(screen.getByLabelText('Item id to produce')).toBeTruthy();
    // And it says WHY it is a separate section rather than folded into the tables above.
    expect(screen.getByText(/Where the two disagree, the disagreement is the finding/i)).toBeTruthy();
  });

  it('renders all three statutory paths, each with its own control', async () => {
    await mountAndSettle();
    expect(screen.getByRole('button', { name: /Produce the Art 15 response/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Erase and produce the receipt/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Record on the long clock/i })).toBeTruthy();
  });

  it('states that the long clock is unstarted, in the blocked tone, before anyone asks', async () => {
    await mountAndSettle();
    // The defect is a DEFAULT, not an error: the sweep runs and nothing opposes it. A screen
    // that waited to be asked would never say so.
    expect(screen.getByText(/retention split is wired in one direction only/i)).toBeTruthy();
    expect(screen.getByText(/this compartment retains\s+nothing at all/i)).toBeTruthy();
  });

  it('adds no publish, send or download control to this page', async () => {
    await mountAndSettle();
    const labels = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(labels.some((l) => /publish|send|post to|schedule|tweet|download/i.test(l))).toBe(false);
    // Print is the only way an artefact leaves, and it goes through the browser's own dialogue.
    expect(labels.some((l) => /print/i.test(l))).toBe(true);
  });

  it('the erasure control refuses to fire on a blank handle', async () => {
    await mountAndSettle();
    // Disabled rather than validating on submit: an erasure aimed at nobody in particular is
    // not a thing this desk can perform, and the sentence beside it says so.
    expect(screen.getByRole('button', { name: /Erase and produce the receipt/i })
      .hasAttribute('disabled')).toBe(true);
    expect(api.requestErasure).not.toHaveBeenCalled();
  });
});
