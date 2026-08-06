import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ControlRegister } from '../ControlRegister';
import type { ControlRegister as Register, ControlRegisterRow } from '@/lib/api/governance';
import * as apiClient from '@/lib/apiClient';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE CONTROL REGISTER SCREEN — what it must never be able to show.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The register answers one question a signer needs and could not previously ask:
 * which governed acts SUCCEEDED while a control was not evaluated, was overridden,
 * or threw. The failure mode worth guarding is not a missing field — it is the
 * screen reading REASSURING when the underlying answer is "we did not look".
 *
 * ── WHAT EACH TEST DEFENDS ───────────────────────────────────────────────────
 *  1. Three states never collapse: `rows: null` (not loaded), `rows: []` (genuinely
 *     no markers), and the pre-marker bucket (UNVERIFIABLE) each render differently
 *     and none of them renders as the others.
 *  2. A `null` count renders NOT READ and never `0`.
 *  3. Remediation is three-valued on screen. `unknown` never appears as "no review".
 *  4. The rank is the server's order, and it is shown with its arithmetic — the
 *     component list is present so the number is an argument, not an assertion.
 *  5. Every refusal is rendered with its CODE and the RULE it cites, all of them.
 *  6. THE SCREEN CANNOT SAY THAT EVERY CONTROL PASSED. Asserted against the whole
 *     rendered document, in the two states where a reader is most tempted to read it
 *     that way: no markers found, and a register full of clean-looking rows.
 *  7. The coverage panel is unconditional and not behind a disclosure control.
 *
 * ── TEST DISCIPLINE ──────────────────────────────────────────────────────────
 * ASSERT-IN-WAITFOR throughout: the positive assertion sits INSIDE the waitFor so it
 * cannot read a DOM that has not rendered. Negative assertions stay OUTSIDE, after a
 * positive barrier has settled — a `not.toMatch` inside a waitFor passes instantly
 * against an empty document, which is a false pass. `scripts/doctrine-lint.mjs`
 * rule 5 enforces this and three CI failures in one day paid for it.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────
 * jsdom has no layout and no paint. "The coverage statement is impossible to miss" is
 * asserted only as "it is in the document, not truncated and not behind a control".
 * That is a real regression guard and it is not a claim about what a human perceives.
 */

vi.mock('@/lib/apiClient', async () => {
  const real = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return { ...real, request: vi.fn() };
});

const mockedRequest = apiClient.request as unknown as ReturnType<typeof vi.fn>;

/*
 * BRACES, NOT A CONCISE ARROW, AND THIS COST TWENTY MINUTES. `mockReset()` RETURNS
 * the mock function, so `beforeEach(() => mockedRequest.mockReset())` hands vitest a
 * function as the hook's return value — which vitest interprets as a TEARDOWN
 * callback and duly calls after the test. Calling the mock invoked the rejection
 * configured by the error-path test with nothing attached to it, and the unhandled
 * rejection was reported as that test failing with the bare error. The test was
 * correct; the hook was calling the subject.
 */
beforeEach(() => {
  mockedRequest.mockReset();
});

function row(over: Partial<ControlRegisterRow> = {}): ControlRegisterRow {
  return {
    auditId: 'a1',
    occurredAt: '2026-08-01T09:00:00.000Z',
    actor: 'nikhil.sharma@lcx.com',
    actorIsMachine: false,
    action: 'action:command_decide',
    subjectType: 'command_decision',
    subjectId: 'dec_01',
    findings: ['gate_not_evaluated'],
    gateDegradedReason: 'analytic_reviews does not exist (42P01) — the SAT gate was NOT evaluated',
    overrideReason: null,
    idempotencyReason: null,
    programCritical: true,
    remediation: 'not_filed',
    reviewKindsAfter: [],
    firstReviewAfter: null,
    recurrence: 1,
    consequence: 90,
    consequenceComponents: [
      { key: 'gateNotEvaluated', points: 40, because: 'A control did not run at all, so nothing is known about it.' },
      { key: 'programCritical', points: 30, because: 'The subject is one of the two program-critical decisions.' },
      { key: 'unremediatedOrUnknown', points: 20, because: 'No active review was filed for this subject after the act.' },
    ],
    ...over,
  };
}

/** A register whose every bucket is in its least alarming legitimate state. */
function register(over: Partial<Register> = {}): Register {
  return {
    contract: 'governance.control_register.v1',
    frame: {
      observedAt: '2026-08-06T12:00:00.000Z',
      windowFrom: '2026-05-08T12:00:00.000Z',
      windowTo: '2026-08-06T12:00:00.000Z',
      windowDays: 90,
      environment: 'production · db.example.supabase.co:5432',
      source: 'audit_log.meta',
      earliestReachableRow: '2026-06-01T00:00:00.000Z',
      auditLogEmpty: false,
      indexesApplied: false,
    },
    coverage: {
      complete: false,
      statement:
        'This register cannot tell you what proportion of controls passed, and it deliberately reports no such figure.',
      covers: ['actions/registry.ts invokeAction — the SAT gate on dec_01 and dec_19'],
      doesNotCover: [
        'controls enforced outside the action registry',
        'controls a human applied by reading a document',
        'anything written before the youngest marker epoch, which is UNKNOWN rather than clean',
      ],
    },
    rows: [],
    counts: {
      markedInWindow: 0,
      scanned: 0,
      shown: 0,
      governedActsInWindow: 200,
      cleanInWindow: 200,
    },
    unverifiable: {
      governedActsInWindow: 0,
      governedActsAllTime: 0,
      boundary: '2026-07-31T00:00:00.000Z',
      epochs: [{
        marker: 'gateDegraded (GPS discount limb)',
        commit: '590ac06',
        date: '2026-07-31',
        site: 'gps/actions.ts — the below-band half of the discount gate',
      }],
    },
    gateErrors: { state: 'empty', count: 0, earliest: null, latest: null, withheldWhy: null },
    refusals: [],
    ...over,
  };
}

/** Everything the reader can actually read, as one string. */
const pageText = () => document.body.textContent ?? '';

/* ════════════════════════════════════════════════════════════════════════════
 *  1–2. THREE STATES, AND A NULL THAT NEVER RENDERS AS ZERO
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the three states never collapse on screen', () => {
  it('NOT LOADED: rows === null says nothing was looked at, not that nothing was found', async () => {
    mockedRequest.mockResolvedValue(register({
      rows: null,
      // EVERY count is null when nothing was read — `scanned`/`shown` included. They
      // were typed `number` and arrived as two zeros beside three nulls.
      counts: { markedInWindow: null, scanned: null, shown: null, governedActsInWindow: null, cleanInWindow: null },
      frame: { ...register().frame, earliestReachableRow: null, auditLogEmpty: null },
      unverifiable: { governedActsInWindow: null, governedActsAllTime: null, boundary: '2026-07-31T00:00:00.000Z', epochs: [] },
      refusals: [{
        code: 'AUDIT_LOG_ABSENT',
        sentence: 'There is no audit_log relation on this environment, so no governed act can be examined at all.',
        rule: { instrument: 'house_doctrine', provision: 'Absent data refuses', text: 'Absent data refuses; it never renders 0.' },
      }],
    }));
    render(<ControlRegister />);

    await waitFor(() => {
      expect(screen.getByTestId('rows-not-loaded').textContent)
        .toMatch(/empty because nothing was looked at/i);
    });
    await waitFor(() => {
      expect(screen.getByTestId('refusal-AUDIT_LOG_ABSENT').textContent).toMatch(/AUDIT_LOG_ABSENT/);
    });
    // Negative assertions, OUTSIDE the barrier, after the positives have settled.
    expect(screen.queryByTestId('rows-empty')).toBeNull();
    expect(screen.queryByTestId('register-rows')).toBeNull();
  });

  it('a null count renders NOT READ and never 0', async () => {
    mockedRequest.mockResolvedValue(register({
      counts: { markedInWindow: null, scanned: null, shown: null, governedActsInWindow: null, cleanInWindow: null },
    }));
    render(<ControlRegister />);
    await waitFor(() => {
      expect(screen.getByTestId('register-counts').textContent).toMatch(/NOT READ/);
    });
    // ALL FIVE tiles refuse. `scanned` and `shown` used to be structurally unable to.
    expect(screen.getByTestId('register-counts').textContent).not.toMatch(/\b0\b/);
    expect([...screen.getByTestId('register-counts').textContent!.matchAll(/NOT READ/g)]).toHaveLength(5);
  });

  /**
   * ── THE PAGE MUST BE ABLE TO SHOW A TRUNCATED REGISTER AS TRUNCATED ─────────
   *
   * `counts.scanned` and `counts.shown` were on the contract and rendered NOWHERE, so
   * when the server's own payload described a gap — 6 marked acts, 3 published — the
   * screen had no way to admit it. The refusal panel carried the sentence; the numbers
   * behind it were invisible.
   */
  it('renders the fetched and published counts, so a truncated list shows its gap', async () => {
    mockedRequest.mockResolvedValue(register({
      rows: [row({ auditId: 't1' })],
      counts: { markedInWindow: 6, scanned: 6, shown: 3, governedActsInWindow: 200, cleanInWindow: 194 },
      refusals: [{
        code: 'CONTROL_REGISTER_TRUNCATED',
        sentence: '6 marked acts exist in this window; 6 audit row(s) were fetched, 6 carried a marker this register reports, and 3 are published below.',
        rule: { instrument: 'house_doctrine', provision: 'An inference is never laundered into a certainty', text: 'A ranking over a subset is reported as a ranking over a subset.' },
      }],
    }));
    render(<ControlRegister />);
    await waitFor(() => {
      const t = screen.getByTestId('count-audit-rows-fetched').textContent ?? '';
      expect(t).toMatch(/AUDIT ROWS FETCHED/);
      expect(t).toMatch(/6/);
    });
    await waitFor(() => {
      const t = screen.getByTestId('count-marked-acts-listed-below').textContent ?? '';
      expect(t).toMatch(/MARKED ACTS LISTED BELOW/);
      expect(t).toMatch(/3/);
    });
    await waitFor(() => {
      expect(screen.getByTestId('refusal-CONTROL_REGISTER_TRUNCATED').textContent).toMatch(/3 are published/);
    });
  });

  it('GENUINELY EMPTY: no markers is stated beside the window AND the oldest reachable row', async () => {
    mockedRequest.mockResolvedValue(register());
    render(<ControlRegister />);
    await waitFor(() => {
      const t = screen.getByTestId('rows-empty').textContent ?? '';
      expect(t).toMatch(/NO MARKED ACTS IN THIS WINDOW/);
      // "Nothing found" is only interpretable beside what was searched.
      expect(t).toMatch(/2026-05-08T12:00:00\.000Z/);
      expect(t).toMatch(/2026-06-01T00:00:00\.000Z/);
    });
    expect(screen.queryByTestId('rows-not-loaded')).toBeNull();
  });

  /**
   * ── AN EMPTY audit_log IS NOT AN UNREADABLE ONE, ON SCREEN ──────────────────
   *
   * `earliestReachableRow: null` meant three different facts and the page had ONE
   * sentence for them: "The oldest reachable audit row could not be read, so the depth
   * of this window is unknown." Over an empty table that sentence is FALSE — the read
   * succeeded and returned nothing, which is exactly the state the doctrine says must
   * never be collapsed with not-loaded. `auditLogEmpty` is what tells them apart, and
   * these three assertions are the three sentences.
   */
  it('the frame says WHICH kind of "no oldest row" it is — read-and-empty, or not read', async () => {
    // 1. NOT READ. The aggregate never came back.
    mockedRequest.mockResolvedValue(register({
      frame: { ...register().frame, earliestReachableRow: null, auditLogEmpty: null },
    }));
    render(<ControlRegister />);
    await waitFor(() => {
      expect(screen.getByTestId('frame-depth').textContent).toMatch(/could not be read, so the depth of this window is unknown/i);
    });
    expect(screen.getByTestId('frame-depth').textContent).not.toMatch(/contains no rows/i);
  });

  it('says an empty audit log was READ and is empty, not that it could not be read', async () => {
    mockedRequest.mockResolvedValue(register({
      frame: { ...register().frame, earliestReachableRow: null, auditLogEmpty: true },
      counts: { markedInWindow: 0, scanned: 0, shown: 0, governedActsInWindow: 0, cleanInWindow: 0 },
    }));
    render(<ControlRegister />);
    await waitFor(() => {
      const t = screen.getByTestId('frame-depth').textContent ?? '';
      expect(t).toMatch(/was read and contains no rows at all/i);
      expect(t).toMatch(/not one governed act has ever been recorded/i);
    });
    // The false sentence must be gone, not merely joined by a true one.
    expect(screen.getByTestId('frame-depth').textContent).not.toMatch(/could not be read/i);
    // And the empty register explains itself by the empty LOG, not by clean controls.
    expect(screen.getByTestId('rows-empty').textContent).toMatch(/no rows at all/i);
  });

  it('distinguishes a log with rows whose oldest timestamp cannot be interpreted', async () => {
    mockedRequest.mockResolvedValue(register({
      frame: { ...register().frame, earliestReachableRow: null, auditLogEmpty: false },
    }));
    render(<ControlRegister />);
    await waitFor(() => {
      expect(screen.getByTestId('frame-depth').textContent)
        .toMatch(/read and is not empty, but the timestamp of its oldest row could not be interpreted/i);
    });
    expect(screen.getByTestId('frame-depth').textContent).not.toMatch(/contains no rows at all/i);
  });

  it('UNVERIFIABLE: pre-marker acts get their own panel with the boundary and commit named', async () => {
    mockedRequest.mockResolvedValue(register({
      unverifiable: {
        governedActsInWindow: 12,
        governedActsAllTime: 120,
        boundary: '2026-07-31T00:00:00.000Z',
        epochs: [{ marker: 'gateDegraded (GPS discount limb)', commit: '590ac06', date: '2026-07-31', site: 'gps/actions.ts' }],
      },
    }));
    render(<ControlRegister />);
    await waitFor(() => {
      const t = screen.getByTestId('unverifiable-bucket').textContent ?? '';
      expect(t).toMatch(/12/);
      expect(t).toMatch(/2026-07-31T00:00:00\.000Z/);
      expect(t).toMatch(/UNKNOWN/);
    });
    // The commit that introduced the youngest marker is on the screen, not just in a comment.
    await waitFor(() => expect(pageText()).toMatch(/590ac06/));
    // And the bucket must never describe those acts as clean.
    expect(screen.getByTestId('unverifiable-bucket').textContent).not.toMatch(/clean/i);
  });

  /**
   * ALL THREE SENTENCES ARE POSITIVELY ASSERTED, and previously only two were: the
   * `empty` branch ("This ledger was read and is genuinely empty") was checked only by
   * its ABSENCE from the withheld state, so a page that had lost that sentence
   * altogether would have passed.
   */
  it('the gate-error ledger renders withheld, empty and not-loaded as three sentences', async () => {
    mockedRequest.mockResolvedValue(register({
      gateErrors: {
        state: 'present_but_withheld',
        count: 7,
        earliest: '2026-07-20T00:00:00.000Z',
        latest: '2026-08-05T00:00:00.000Z',
        withheldWhy: 'The count is governance information; the detail belongs to the marketing compartment.',
      },
    }));
    render(<ControlRegister />);
    await waitFor(() => {
      const t = screen.getByTestId('gate-errors').textContent ?? '';
      expect(t).toMatch(/7/);
      expect(t).toMatch(/THREW/);
      expect(t).toMatch(/marketing compartment/);
    });
    expect(screen.getByTestId('gate-errors').textContent).not.toMatch(/genuinely empty/i);

    // EMPTY — the sentence that was never positively asserted anywhere in this file.
    mockedRequest.mockResolvedValue(register({
      gateErrors: { state: 'empty', count: 0, earliest: null, latest: null, withheldWhy: null },
    }));
    render(<ControlRegister />);
    await waitFor(() => {
      expect(screen.getAllByTestId('gate-errors').at(-1)!.textContent)
        .toMatch(/read and is genuinely empty/i);
    });
    expect(screen.getAllByTestId('gate-errors').at(-1)!.textContent).not.toMatch(/not a count of zero/i);

    mockedRequest.mockResolvedValue(register({
      gateErrors: { state: 'not_loaded', count: null, earliest: null, latest: null, withheldWhy: null },
    }));
    render(<ControlRegister />);
    await waitFor(() => {
      expect(screen.getAllByTestId('gate-errors').at(-1)!.textContent).toMatch(/not a count of zero/i);
    });
    expect(screen.getAllByTestId('gate-errors').at(-1)!.textContent).not.toMatch(/genuinely empty/i);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  3–4. THE ROWS: THREE-VALUED REMEDIATION, AND A RANK THAT SHOWS ITS WORK
 * ════════════════════════════════════════════════════════════════════════════ */
describe('a row states its finding, its remediation and why it ranks where it does', () => {
  it('renders the server order, not a re-sort, and shows every consequence component', async () => {
    const worst = row({ auditId: 'worst', consequence: 90 });
    const milder = row({
      auditId: 'milder',
      // NEWER than the worst row: a recency sort would put this first.
      occurredAt: '2026-08-05T09:00:00.000Z',
      subjectId: 'camp_9',
      subjectType: 'dist_campaign',
      findings: ['override_accepted'],
      gateDegradedReason: null,
      overrideReason: 'launch window; legal signed off by email',
      programCritical: false,
      remediation: 'filed',
      reviewKindsAfter: ['legal_check'],
      firstReviewAfter: '2026-08-05T10:00:00.000Z',
      consequence: 25,
      consequenceComponents: [{ key: 'overrideAccepted', points: 25, because: 'The control ran and a human accepted the finding.' }],
    });
    mockedRequest.mockResolvedValue(register({
      rows: [worst, milder],
      counts: { markedInWindow: 2, scanned: 2, shown: 2, governedActsInWindow: 200, cleanInWindow: 198 },
    }));
    render(<ControlRegister />);

    await waitFor(() => {
      expect(screen.getByTestId('control-row-worst').textContent).toMatch(/CONTROL DID NOT RUN/);
    });
    await waitFor(() => {
      expect(screen.getByTestId('control-row-milder').textContent).toMatch(/OVERRIDDEN WITH A REASON/);
    });

    // Order is the server's. Rank 1 is the older, worse row.
    const ids = [...document.querySelectorAll('[data-testid^="control-row-"]')]
      .map((n) => n.getAttribute('data-testid'));
    expect(ids).toEqual(['control-row-worst', 'control-row-milder']);

    // The number travels with its arithmetic — every component, and its reason.
    const arithmetic = screen.getByTestId('consequence-worst').textContent ?? '';
    expect(arithmetic).toMatch(/\+40 gateNotEvaluated/);
    expect(arithmetic).toMatch(/\+30 programCritical/);
    expect(arithmetic).toMatch(/\+20 unremediatedOrUnknown/);
    expect(arithmetic).toMatch(/not by date/i);
  });

  it('renders UNKNOWN remediation as unknown, never as "no review filed"', async () => {
    mockedRequest.mockResolvedValue(register({
      rows: [row({ auditId: 'u', remediation: 'unknown', reviewKindsAfter: null })],
      counts: { markedInWindow: 1, scanned: 1, shown: 1, governedActsInWindow: 200, cleanInWindow: 199 },
    }));
    render(<ControlRegister />);
    await waitFor(() => {
      expect(screen.getByTestId('control-row-u').textContent).toMatch(/REVIEW STATE UNKNOWN — NOT READ/);
    });
    expect(screen.getByTestId('control-row-u').textContent).not.toMatch(/NO REVIEW FILED SINCE/);
  });

  it('says out loud when the actor is a machine and there is nobody to ask', async () => {
    mockedRequest.mockResolvedValue(register({
      rows: [row({ auditId: 'm', actor: 'operator', actorIsMachine: true })],
      counts: { markedInWindow: 1, scanned: 1, shown: 1, governedActsInWindow: 200, cleanInWindow: 199 },
    }));
    render(<ControlRegister />);
    await waitFor(() => {
      expect(screen.getByTestId('control-row-m').textContent).toMatch(/no human to ask/i);
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  5. EVERY REFUSAL, WITH ITS RULE
 * ════════════════════════════════════════════════════════════════════════════ */
describe('refusals are rendered in full', () => {
  it('renders all of them, each with its code and the rule it cites', async () => {
    const refusals = [
      {
        code: 'REVIEW_REGISTER_ABSENT',
        sentence: 'There is no analytic_reviews relation on this environment, so remediation is UNKNOWN for every row.',
        rule: { instrument: 'house_doctrine', provision: 'An inference is never laundered into a certainty', text: 'If you cannot know, say you cannot know.' },
      },
      {
        code: 'PRE_MARKER_ACTS_UNVERIFIABLE',
        sentence: '12 governed acts predate the youngest marker epoch. Their control state is UNKNOWN.',
        rule: { instrument: 'house_doctrine', provision: 'Three states are never collapsed', text: 'A row predating the instrument that would have recorded a failure is UNKNOWN.' },
      },
      {
        code: 'CONTROL_REGISTER_TRUNCATED',
        sentence: '900 marked acts exist in this window and 200 were fetched, so this ranking is over a subset.',
        rule: { instrument: 'house_doctrine', provision: 'An inference is never laundered into a certainty', text: 'A ranking over a subset is reported as a ranking over a subset.' },
      },
    ];
    mockedRequest.mockResolvedValue(register({ refusals }));
    render(<ControlRegister />);

    for (const r of refusals) {
      await waitFor(() => {
        const el = screen.getByTestId(`refusal-${r.code}`).textContent ?? '';
        expect(el).toMatch(new RegExp(r.code));
        expect(el).toMatch(new RegExp(r.rule.provision.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      });
    }
    expect(screen.getByTestId('register-refusals').children).toHaveLength(3);
  });

  it('a transport failure renders as a fault, explicitly not as a clean register', async () => {
    mockedRequest.mockRejectedValue(new Error('Network error'));
    render(<ControlRegister />);
    await waitFor(() => {
      const t = screen.getByTestId('register-error').textContent ?? '';
      expect(t).toMatch(/NOT LOADED/);
      expect(t).toMatch(/does not mean every control ran/i);
    });
    expect(screen.queryByTestId('rows-empty')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 *  6–7. THE CLAIM THAT MUST BE UNAVAILABLE
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the screen cannot claim that every control passed', () => {
  it('never renders a pass rate, a percentage or an all-passed sentence when nothing is marked', async () => {
    mockedRequest.mockResolvedValue(register());
    render(<ControlRegister />);
    // Positive barrier first: the empty state has actually rendered.
    await waitFor(() => {
      expect(screen.getByTestId('rows-empty').textContent).toMatch(/NO MARKED ACTS IN THIS WINDOW/);
    });
    // Then the negatives, against the settled document.
    const t = pageText();
    expect(t).not.toMatch(/100%/);
    expect(t).not.toMatch(/all controls passed/i);
    expect(t).not.toMatch(/pass rate/i);
    expect(t).not.toMatch(/fully compliant/i);
    expect(t).not.toMatch(/\ball clear\b/i);
  });

  it('never renders one even with a register full of remediated rows', async () => {
    // The state a reader is MOST likely to over-read: everything filed, nothing red.
    const filed = row({
      auditId: 'f1',
      remediation: 'filed',
      reviewKindsAfter: ['premortem'],
      firstReviewAfter: '2026-08-02T00:00:00.000Z',
      programCritical: false,
      consequence: 40,
      consequenceComponents: [{ key: 'gateNotEvaluated', points: 40, because: 'A control did not run at all.' }],
    });
    mockedRequest.mockResolvedValue(register({
      rows: [filed],
      counts: { markedInWindow: 1, scanned: 1, shown: 1, governedActsInWindow: 200, cleanInWindow: 199 },
    }));
    render(<ControlRegister />);
    await waitFor(() => {
      expect(screen.getByTestId('control-row-f1').textContent).toMatch(/REVIEW FILED AFTER/);
    });
    const t = pageText();
    expect(t).not.toMatch(/100%/);
    expect(t).not.toMatch(/all controls passed/i);
    expect(t).not.toMatch(/pass rate/i);
  });

  it('states the coverage limits unconditionally, not behind a disclosure control', async () => {
    mockedRequest.mockResolvedValue(register());
    render(<ControlRegister />);
    await waitFor(() => {
      expect(screen.getByTestId('coverage-statement').textContent)
        .toMatch(/cannot tell you what proportion of controls passed/i);
    });
    await waitFor(() => {
      expect(screen.getByTestId('coverage-gaps').textContent).toMatch(/DOES NOT COVER/);
    });
    // No <details>/<summary> and no aria-expanded anywhere near it: the limits are
    // not something a reader can put away.
    expect(document.querySelectorAll('details')).toHaveLength(0);
    expect(document.querySelectorAll('[aria-expanded]')).toHaveLength(0);
  });

  it('carries the environment label and the window on the observation frame', async () => {
    mockedRequest.mockResolvedValue(register());
    render(<ControlRegister />);
    await waitFor(() => {
      const t = screen.getByTestId('register-frame').textContent ?? '';
      expect(t).toMatch(/production · db\.example\.supabase\.co:5432/);
      expect(t).toMatch(/audit_log\.meta/);
      expect(t).toMatch(/90 days/);
      // 0069 pending on this fixture — the reader is told the reads are sequential.
      expect(t).toMatch(/0069 is not applied/);
    });
  });
});
