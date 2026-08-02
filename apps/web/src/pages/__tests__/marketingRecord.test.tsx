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
    // Required since the wiring pass declared it: the route SELECTs *, so 20KB of a
    // stranger's forwarded email really does cross to the browser. Nothing on the
    // record page renders it, and `marketingRecord` has no test that asserts it is
    // shown — because showing it would be the defect.
    raw_email: null,
    /*
     * The M0 columns, on the same principle as `raw_email`: the API returns them, so the
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

/** Every test waits on this: the bundle is assembled across several awaits. */
async function mountAndSettle() {
  const r = render(<MarketingRecord />);
  await waitFor(() => expect(screen.getByTestId('coverage-rows')).toBeInTheDocument());
  return r;
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
    await mountAndSettle();
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
    const { container } = await mountAndSettle();
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
    await mountAndSettle();
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
    await mountAndSettle();
    const row = screen.getByTestId('coverage-rows').querySelector('[data-coverage-status="answered"]');
    expect(row?.textContent).toContain('70 row(s) NOT IN THIS BUNDLE');
    expect(row?.textContent).toMatch(/truncated, not empty/);
    expect(screen.getByTestId('coverage-shortfall').textContent).toContain('TRUNCATED production');
  });

  it('distinguishes a truncated read from a table that changed underneath it', async () => {
    vi.mocked(api.fetchMarketingSummary).mockResolvedValue(summary({ counts: { answered: 5 } }));
    queueFrom({ answered: [reply({ id: 1 }), reply({ id: 2 })] });
    await mountAndSettle();
    const row = screen.getByTestId('coverage-rows').querySelector('[data-coverage-status="answered"]');
    expect(row?.textContent).toContain('3 row(s) NOT IN THIS BUNDLE');
    expect(row?.textContent).toMatch(/did not hit its ceiling/);
  });

  it('refuses to claim completeness when the summary read failed', async () => {
    vi.mocked(api.fetchMarketingSummary).mockRejectedValue(new Error('down'));
    queueFrom({ answered: [reply({ id: 1 })] });
    await mountAndSettle();
    expect(screen.getByTestId('coverage-no-denominator').textContent).toMatch(/Treat it as incomplete/);
    const row = screen.getByTestId('coverage-rows').querySelector('[data-coverage-status="answered"]');
    expect(row?.textContent).toContain('NOT READ');
  });
});

/* ── 4. Retention: three verdicts, and never a silent "fine" ───────────────── */

describe('the two retention regimes', () => {
  it('marks a row scheduled for deletion before the five-year horizon', async () => {
    queueFrom({ answered: [rowWithExpiry({ id: 1, received_at: iso(-10) }, iso(80))] });
    await mountAndSettle();
    const row = screen.getByTestId('retention-rows').querySelector('[data-retention-verdict]');
    expect(row?.getAttribute('data-retention-verdict')).toBe('swept_before_horizon');
    expect(row?.textContent).toContain('DELETED BEFORE THE FIVE-YEAR HORIZON');
    expect(row?.textContent).toContain('80');
  });

  it('marks a row whose sweep is already due', async () => {
    queueFrom({ answered: [rowWithExpiry({ id: 2, received_at: iso(-100) }, iso(-3))] });
    await mountAndSettle();
    const row = screen.getByTestId('retention-rows').querySelector('[data-retention-verdict]');
    expect(row?.getAttribute('data-retention-verdict')).toBe('sweep_due');
    expect(row?.textContent).toContain('SWEEP ALREADY DUE');
  });

  it('never renders a missing expiry as a row that is not expiring', async () => {
    queueFrom({ answered: [rowWithExpiry({ id: 3 }, null)] });
    await mountAndSettle();
    const row = screen.getByTestId('retention-rows').querySelector('[data-retention-verdict]');
    expect(row?.getAttribute('data-retention-verdict')).toBe('not_recorded');
    expect(row?.textContent).toContain('REGIME NOT RECORDED');
    // The cell says NOT RECORDED, never a blank or a dash that reads as "no expiry".
    expect(row?.textContent).toContain('NOT RECORDED');
  });

  it('states the conflict, that five years is an inference, and that swept rows are invisible', async () => {
    await mountAndSettle();
    expect(screen.getByTestId('retention-conflict').textContent).toMatch(/DPO ruling, not an engineering decision/);
    expect(screen.getByTestId('retention-gap-honest').textContent).toMatch(/no express retention period/i);
    expect(screen.getByTestId('retention-invisible-loss').textContent).toMatch(/persisted nowhere/);
  });

  it('does not present an empty window as a clean record', async () => {
    await mountAndSettle();
    expect(screen.getByTestId('retention-empty').textContent)
      .toMatch(/indistinguishable from a row that never existed/);
  });
});

/* ── 5 and 6. Four eyes, honestly ──────────────────────────────────────────── */

describe('four eyes', () => {
  it('reports NOT ACHIEVED even when a real name is on the approval', async () => {
    queueFrom({ answered: [reply({ id: 7 })] });
    vi.mocked(api.fetchDrafts).mockResolvedValue([draft({ id: 71, reply_id: 7 })]);
    await mountAndSettle();
    const row = screen.getByTestId('bundle-rows').querySelector('[data-bundle-item="7"]');
    expect(row?.textContent).toContain('NOT ACHIEVED');
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
    await mountAndSettle();
    expect(screen.getByTestId('bundle-rows').textContent).toMatch(/APPROVER IS NOT NAMED/);
    expect(screen.getByTestId('record-tallies').textContent).toMatch(/APPROVER NOT NAMED 1/);
  });

  it('does not assess clearance on an item that has none', async () => {
    queueFrom({ ignored: [reply({ id: 9, status: 'ignored' })] });
    await mountAndSettle();
    const row = screen.getByTestId('bundle-rows').querySelector('[data-bundle-item="9"]');
    expect(row?.textContent).toContain('N/A');
    expect(screen.getByTestId('bundle-rows').textContent).toMatch(/no clearance to assess/i);
  });

  it('names more than one approved draft on the same item as a contradiction', async () => {
    queueFrom({ answered: [reply({ id: 10 })] });
    vi.mocked(api.fetchDrafts).mockResolvedValue([
      draft({ id: 101, reply_id: 10 }),
      draft({ id: 102, reply_id: 10 }),
    ]);
    await mountAndSettle();
    expect(screen.getByTestId('bundle-rows').textContent).toMatch(/MORE THAN ONE APPROVED DRAFT/);
  });
});

describe('authorship', () => {
  it('classifies an approved model draft as unedited machine text and counts it', async () => {
    queueFrom({ answered: [reply({ id: 11 })] });
    vi.mocked(api.fetchDrafts).mockResolvedValue([draft({ id: 111, reply_id: 11, used_llm: true })]);
    await mountAndSettle();
    const row = screen.getByTestId('bundle-rows').querySelector('[data-bundle-item="11"]');
    expect(row?.textContent).toContain('MODEL, UNEDITED');
    expect(screen.getByTestId('record-tallies').textContent).toMatch(/APPROVED MACHINE TEXT, UNEDITED 1/);
  });

  it('does not call a deterministic template a human author', async () => {
    queueFrom({ answered: [reply({ id: 12 })] });
    vi.mocked(api.fetchDrafts).mockResolvedValue([draft({ id: 121, reply_id: 12, used_llm: false })]);
    await mountAndSettle();
    const row = screen.getByTestId('bundle-rows').querySelector('[data-bundle-item="12"]');
    expect(row?.textContent).toContain('TEMPLATE, UNEDITED');
  });
});

/* ── 7. The evidence is always in the DOM ─────────────────────────────────── */

describe('printability', () => {
  it('keeps every item\'s evidence in the DOM while the row is collapsed', async () => {
    queueFrom({ answered: [reply({ id: 13, body: 'are my funds safe' })] });
    vi.mocked(api.fetchDrafts).mockResolvedValue([draft({ id: 131, reply_id: 13, body: 'we are looking into it' })]);
    const { container } = await mountAndSettle();
    // Nothing was expanded.
    expect(container.querySelector('.record-evidence-closed')).not.toBeNull();
    // And the evidence is nevertheless present, verbatim, both sides of it.
    expect(screen.getByTestId('inbound-13').textContent).toBe('are my funds safe');
    expect(screen.getByTestId('draft-131').textContent).toBe('we are looking into it');
  });

  it('reproduces stored text without truncation or reformatting', async () => {
    const body = `line one\n\nline three with <script>alert(1)</script> and  double  spaces`;
    queueFrom({ answered: [reply({ id: 14, body })] });
    await mountAndSettle();
    const pre = screen.getByTestId('inbound-14');
    // Exact bytes: a record that prettifies is not a record. And React escaped it,
    // so the markup is inert text rather than an element.
    expect(pre.textContent).toBe(body);
    expect(pre.querySelector('script')).toBeNull();
  });
});

/* ── 9 and 10. Absence, and the honesty ceiling ───────────────────────────── */

describe('honesty', () => {
  it('says it read nothing when the compartment is not migrated, rather than showing a clean record', async () => {
    vi.mocked(api.fetchMarketingSummary).mockResolvedValue(summary({ migrated: false }));
    queueFrom({}, { migrated: false });
    await mountAndSettle();
    expect(screen.getByTestId('record-not-migrated').textContent).toMatch(/evidence of NOTHING/);
    expect(screen.getByTestId('bundle-empty').textContent).toMatch(/failure to read, not a finding/);
  });

  it('shows no forbidden metric in the tallies strip', async () => {
    queueFrom({ answered: [reply({ id: 15 })] });
    await mountAndSettle();
    const strip = screen.getByTestId('record-tallies').textContent ?? '';
    for (const banned of [/impression/i, /\breach\b/i, /follower/i, /engagement rate/i, /click.?through/i, /share of voice/i]) {
      expect(strip, `the tallies strip must not carry ${banned}`).not.toMatch(banned);
    }
  });

  it('names the unavailable metrics as unavailable instead of leaving the row out', async () => {
    await mountAndSettle();
    const text = screen.getByTestId('window-cannot-see').textContent ?? '';
    expect(text).toMatch(/Impressions, reach, follower change, engagement rate, click-through, share of voice/);
    expect(text).toMatch(/denominator/);
    expect(text).toMatch(/no proxy stands in for them/);
  });

  it('states that an item marked answered is not evidence that anything was published', async () => {
    await mountAndSettle();
    const text = screen.getByTestId('record-does-not-prove').textContent ?? '';
    expect(text).toMatch(/THAT ANYTHING WAS PUBLISHED/);
    expect(text).toMatch(/not by anything being sent/);
  });

  it('reports the status race rather than silently keeping one copy', async () => {
    // The same row comes back under two statuses — what happens when an approval
    // lands between two of the five reads.
    const r = reply({ id: 16 });
    queueFrom({ drafted: [r], answered: [reply({ id: 16, status: 'answered' })] });
    await mountAndSettle();
    expect(screen.getByTestId('record-status-race').textContent).toMatch(/appeared in more than one status read/);
    // And the item is listed exactly once.
    expect(screen.getByTestId('bundle-rows').querySelectorAll('[data-bundle-item="16"]').length).toBe(1);
  });

  it('marks an unread clearance chain as unread, not as an absence of clearance', async () => {
    queueFrom({ answered: [reply({ id: 17 })] });
    vi.mocked(api.fetchDrafts).mockRejectedValue(new Error('boom'));
    await mountAndSettle();
    const row = screen.getByTestId('bundle-rows').querySelector('[data-bundle-item="17"]');
    expect(row?.textContent).toContain('NOT READ');
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
    await mountAndSettle();
    expect(screen.getByLabelText('Window from')).toBeInTheDocument();
    expect(within(screen.getByTestId('window-cannot-see')).getByText(/Which Member State an item was addressed to/)).toBeInTheDocument();
  });

  it('warns that a window reaching past the sweep is silently incomplete', async () => {
    await mountAndSettle();
    expect(screen.getByTestId('window-cannot-see').textContent)
      .toMatch(/beginning more than ninety days ago is close to guaranteed to be missing material/);
  });
});
