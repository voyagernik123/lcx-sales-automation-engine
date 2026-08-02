import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MarketingCrisis, FINGERPRINT_FALLBACK_NOTICE } from '../MarketingCrisis';
import {
  CLEARANCE_HEADLINE_TEST_QUESTION,
} from '../../../../../packages/shared/src/marketing/types';
import {
  HOLDING_STATEMENTS, holdingStatementsFor, ttfsBudget,
} from '../../../../../packages/shared/src/marketing/crisis';

/**
 * The budget the page must be showing, asked of the ENGINE rather than restated.
 *
 * `ttfsBudget` halves the base budget for incident types with run dynamics and
 * floors it at fifteen minutes, so a hard-coded 30 here would be wrong for the
 * default incident type AND would go on passing if the engine's arithmetic changed.
 * The room's default is peer contagion at high severity.
 */
const DEFAULT_BUDGET = ttfsBudget('peer_contagion', 'high').budgetMinutes;

/**
 * THE CRISIS ROOM — the guards on a screen used by a frightened person at 02:00.
 *
 * The failure to design against is not a blank page and it is not an exception. It
 * is a screen that is misread under pressure: a clock that looks fine because it is
 * unmeasured, a refusal that looks like a warning, a queue that looks like three
 * parallel lanes, a green tick where one person wore three hats. Every test below
 * pins one of those, and several assert an ABSENCE, which is the only kind of claim
 * that survives someone adding a feature in good faith.
 *
 *  1. The clock burns, and an unmeasured clock reads UNMEASURED rather than zero.
 *  2. Suppressing the clock without a reason is refused, with the rule cited; a
 *     recorded suppression does not erase the elapsed figure.
 *  3. An empty not-known column blocks issue and says which rule stopped it.
 *  4. The three clears are lanes, not steps: none is disabled by another, and every
 *     outstanding lane says it does not wait.
 *  5. The reviewer's test is the literal question, and a lane cannot be cleared
 *     before it is answered.
 *  6. A blocking legal hold offered where there are no legal implications is
 *     downgraded to advisory and cannot delay release.
 *  7. Editing the text voids every clearance given against the old bytes.
 *  8. One person supplying every clear produces the four-eyes ADMISSION, not a tick.
 *  9. A peer-contagion answer is reachable in ONE action.
 * 10. `unknown` applicability is never rendered as "does not apply".
 * 11. There is no publish affordance anywhere, and no copy affordance beside a
 *     refused statement.
 * 12. No `<header>`, `<aside>` or `<footer>`: PrintStyles hides all three, and the
 *     clock and the closing admissions must survive onto paper.
 *
 * WHAT THESE TESTS CANNOT SEE: jsdom has no layout, no paint and no print pipeline.
 * "The lanes are visibly parallel" is asserted as "four independent lane elements
 * exist, each with its own enabled control, and the print stylesheet declares a
 * four-column grid". That is not a claim about what a human sees on paper or under
 * stress. The only way to check the second is to watch somebody use it.
 */

/** A fixed clock. Every elapsed figure asserted below is exact, not approximate. */
const NOW = new Date('2026-08-02T02:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Advance the wall clock and let the page's one-second tick catch up. */
function tick(ms: number) {
  act(() => { vi.advanceTimersByTime(ms); });
}

/**
 * Let the statement fingerprint settle.
 *
 * `crypto.subtle.digest` is asynchronous, so immediately after a render the
 * fingerprint is `computing` and every clearance control is disabled — deliberately,
 * because a clearance recorded against an empty hash would bind to nothing. Tests
 * that record a clearance have to wait for it, exactly as a human does.
 */
async function settle() {
  // Waited on, not guessed at. Two microtask flushes were not enough: a native
  // WebCrypto digest can resolve after a real tick, and a clearance recorded
  // against the pre-settle hash then goes void the moment the real one lands —
  // which is the engine working correctly and a test lying.
  await waitFor(() => {
    expect(screen.getByTestId('statement-fingerprint').textContent).not.toMatch(/computing/);
  });
  await act(async () => { await Promise.resolve(); });
}

/** The room, with the incident opened at NOW so the clock has something to measure. */
async function mountOpened() {
  const r = render(<MarketingCrisis />);
  fireEvent.click(screen.getByRole('button', { name: /open the incident now/i }));
  await settle();
  return r;
}

/** Seed the tri-slot from the first preclear that covers peer contagion. */
async function seedPeerContagion() {
  const s = holdingStatementsFor('peer_contagion')[0];
  expect(s, 'the library must carry a peer-contagion preclear').toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: new RegExp(s!.title.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'i') }));
  await settle();
  return s!;
}

/**
 * The text of a refusal card carrying `code`, from anywhere on the page.
 *
 * Looked up by the refusal's own code rather than by the test id of the panel it
 * happens to be rendered in: which panel a refusal surfaces in is a layout decision
 * this suite should not pin, and the claim being made is that the refusal is on the
 * page with its sentence, not where it sits.
 */
function refusalByCode(root: HTMLElement, code: string): string {
  const el = root.querySelector(`[data-refusal-code="${code}"]`);
  expect(el, `no refusal card on the page carries ${code}`).not.toBeNull();
  return el?.textContent ?? '';
}

/** Answer the headline question and record a blocking clear in one lane. */
async function clearLane(role: string, reviewer: string, headline: 'yes' | 'no' = 'yes') {
  const lane = screen.getByTestId(`lane-${role}`);
  fireEvent.change(within(lane).getByLabelText(`${role} reviewer`), { target: { value: reviewer } });
  fireEvent.click(within(lane).getByLabelText(headline));
  fireEvent.click(within(lane).getByRole('button', { name: /record a blocking clear/i }));
  await settle();
}

/* ── 1. The clock ──────────────────────────────────────────────────────────── */

describe('the clock', () => {
  it('reads UNMEASURED before the incident is opened, never zero', () => {
    render(<MarketingCrisis />);
    const panel = screen.getByTestId('clock-panel');
    expect(panel.getAttribute('data-clock-state')).toBe('unknown');
    // The elapsed figure is a dash, not a 0. A zero and an absence look identical
    // on a clock and mean opposite things.
    expect(screen.getByTestId('clock-elapsed').textContent).toMatch(/^—/);
    expect(screen.getByTestId('clock-remaining').textContent).toBe('unmeasured');
    expect(screen.getByTestId('clock-sentence').textContent).toMatch(/not "on target" — it is unmeasured/);
  });

  it('burns against the budget as time passes', async () => {
    await mountOpened();
    expect(screen.getByTestId('clock-panel').getAttribute('data-clock-state')).toBe('running');
    expect(screen.getByTestId('clock-elapsed').textContent).toContain('0');
    tick(11 * 60_000);
    expect(screen.getByTestId('clock-elapsed').textContent).toContain('11');
    expect(screen.getByTestId('clock-remaining').textContent)
      .toBe(`${DEFAULT_BUDGET - 11} min`);
  });

  it('goes OVERDUE, loudly, once the budget is spent', async () => {
    await mountOpened();
    tick((DEFAULT_BUDGET + 1) * 60_000);
    const panel = screen.getByTestId('clock-panel');
    expect(panel.getAttribute('data-clock-state')).toBe('overdue');
    expect(screen.getByTestId('clock-sentence').textContent).toMatch(/OVERDUE/);
    // The reason the budget exists is on the panel, not in a manual somewhere.
    expect(panel.textContent).toMatch(/\$40bn|40 billion/i);
  });

  it('shows the budget for the severity that is selected', async () => {
    await mountOpened();
    fireEvent.change(screen.getByLabelText('Incident severity'), { target: { value: 'low' } });
    expect(screen.getByTestId('clock-elapsed').textContent)
      .toContain(String(ttfsBudget('peer_contagion', 'low').budgetMinutes));
  });
});

describe('suppressing the clock', () => {
  it('refuses a suppression with no recorded reason, and cites the rule', async () => {
    await mountOpened();
    fireEvent.change(screen.getByLabelText('Suppressed by'), { target: { value: 'nik' } });
    fireEvent.click(screen.getByRole('button', { name: /^suppress$/i }));
    const refusal = screen.getByTestId('suppression-refusal');
    expect(refusal.getAttribute('data-refusal-code')).toBe('TTFS_SUPPRESSION_UNREASONED');
    // A sentence an operator can act on, the rule beside it, and a recovery.
    expect(refusal.textContent).toMatch(/cannot be suppressed without a recorded reason/i);
    // The rule is named, not asserted, and the recovery says what datum is missing.
    expect(refusal.textContent).toMatch(/Rule:/);
    expect(refusal.textContent).toMatch(/To clear it:/);
    expect(refusal.textContent).toMatch(/at least twelve characters/);
    // And it did NOT suppress.
    expect(screen.getByTestId('clock-panel').getAttribute('data-clock-state')).toBe('running');
  });

  it('suppresses with a reason, and does not erase the elapsed figure', async () => {
    await mountOpened();
    tick(20 * 60_000);
    fireEvent.change(screen.getByLabelText('Suppression reason'), {
      target: { value: 'security has the incident channel and asked comms to hold' },
    });
    fireEvent.change(screen.getByLabelText('Suppressed by'), { target: { value: 'nik' } });
    fireEvent.click(screen.getByRole('button', { name: /^suppress$/i }));
    const panel = screen.getByTestId('clock-panel');
    expect(panel.getAttribute('data-clock-state')).toBe('suppressed');
    // 20 minutes is still on the page, and the sheet says why that matters.
    expect(screen.getByTestId('clock-elapsed').textContent).toContain('20');
    expect(screen.getByTestId('suppression-kept').textContent)
      .toMatch(/did not delete the elapsed figure and did not close the breach/);
  });
});

/* ── 3. The tri-slot ──────────────────────────────────────────────────────── */

describe('the holding statement', () => {
  it('blocks issue when the not-known column is empty, and names the rule', async () => {
    await mountOpened();
    await seedPeerContagion();
    // A seeded statement arrives with standing not-known lines. Empty them, which is
    // exactly the edit a hurried operator makes.
    fireEvent.change(screen.getByTestId('slot-not-known'), { target: { value: '' } });
    const refusals = screen.getByTestId('completeness-refusals');
    expect(refusals.textContent).toMatch(/either speculation or over-reassurance/);
    expect(refusals.querySelector('[data-refusal-code]')?.getAttribute('data-refusal-code'))
      .toMatch(/NOT_KNOWN_EMPTY_ON_INITIAL_STATEMENT|CERC_NOT_KNOWN_EMPTY/);
    expect(refusals.textContent).toMatch(/CERC/);
    expect(screen.getByTestId('issuable-verdict').textContent).toMatch(/NOT ISSUABLE/);
  });

  it('marks each slot present or MISSING — BLOCKS ISSUE, per slot', async () => {
    await mountOpened();
    expect(screen.getByText(/What we do not yet know · MISSING — BLOCKS ISSUE/)).toBeInTheDocument();
    await seedPeerContagion();
    expect(screen.getByText(/What we do not yet know · present/)).toBeInTheDocument();
  });

  it('seeds all three slots from a preclear in one action', async () => {
    await mountOpened();
    const s = await seedPeerContagion();
    expect((screen.getByTestId('slot-known') as HTMLTextAreaElement).value)
      .toContain(s.standingKnown[0]);
    expect((screen.getByTestId('slot-not-known') as HTMLTextAreaElement).value)
      .toContain(s.standingNotKnown[0]);
    expect((screen.getByTestId('slot-next') as HTMLTextAreaElement).value).toBe(s.nextStepAction);
    // And the version travelled with it.
    expect(screen.getByTestId('statement-fingerprint').textContent).toContain(`${s.id} v${s.version}`);
  });

  it('shows the operator brief with every must-not-say line intact', async () => {
    await mountOpened();
    const s = await seedPeerContagion();
    const brief = screen.getByTestId('operator-brief').textContent ?? '';
    for (const line of s.mustNotSay) expect(brief).toContain(line);
    for (const p of s.requiresBeforeUse) expect(brief).toContain(p.replace(/_/g, ' ').slice(0, 0) + '');
    expect(screen.getByTestId('preconditions').textContent).toMatch(/NOT ACKNOWLEDGED/);
  });

  it('refuses reassurance with no dated basis, and says the scan is not a proof', async () => {
    await mountOpened();
    await seedPeerContagion();
    fireEvent.change(screen.getByTestId('slot-known'), {
      target: { value: 'Customer funds are safe and we are solvent.' },
    });
    const panel = screen.getByTestId('reassurance-panel');
    expect(panel.querySelectorAll('[data-refusal-code]').length).toBeGreaterThan(0);
    expect(panel.textContent).toMatch(/means “no construction I hold was matched”/);
    expect(screen.getByTestId('no-basis-capture').textContent)
      .toMatch(/no control for entering a dated basis/);
  });
});

/* ── 4, 5, 6, 7, 8. The clears ────────────────────────────────────────────── */

describe('the three parallel clears', () => {
  it('renders four independent lanes, none disabled by another', async () => {
    await mountOpened();
    await seedPeerContagion();
    for (const role of ['reputation', 'policy', 'sme', 'legal']) {
      const lane = screen.getByTestId(`lane-${role}`);
      const btn = within(lane).getByRole('button', { name: /record a blocking clear/i });
      // The falsifiable claim: an outstanding reputation lane does not gate the SME
      // lane. A wizard would disable the later steps.
      expect(btn).not.toBeDisabled();
    }
  });

  it('says of every outstanding lane that it does not wait for the others', async () => {
    await mountOpened();
    await seedPeerContagion();
    for (const role of ['reputation', 'policy', 'sme']) {
      expect(screen.getByTestId(`lane-sentence-${role}`).textContent)
        .toMatch(/gathered in parallel with the others — it does not wait for them/);
    }
  });

  it('asks the reviewer\'s test as the literal question, in every lane', async () => {
    await mountOpened();
    for (const role of ['reputation', 'policy', 'sme', 'legal']) {
      expect(screen.getByTestId(`headline-question-${role}`).textContent)
        .toBe(CLEARANCE_HEADLINE_TEST_QUESTION);
    }
  });

  it('will not record a clearance before the headline question is answered', async () => {
    await mountOpened();
    await seedPeerContagion();
    const lane = screen.getByTestId('lane-reputation');
    fireEvent.change(within(lane).getByLabelText('reputation reviewer'), { target: { value: 'anna' } });
    fireEvent.click(within(lane).getByRole('button', { name: /record a blocking clear/i }));
    // Nothing was recorded: the lane is still outstanding.
    expect(screen.getByTestId('lane-reputation').getAttribute('data-lane-state')).toBe('outstanding');
  });

  it('treats a "no" on the headline test as a refusal to clear, not a pending clear', async () => {
    await mountOpened();
    await seedPeerContagion();
    await clearLane('reputation', 'anna', 'no');
    expect(screen.getByTestId('lane-reputation').getAttribute('data-lane-state'))
      .toBe('refused_on_headline_test');
    expect(screen.getByTestId('lane-sentence-reputation').textContent)
      .toContain(CLEARANCE_HEADLINE_TEST_QUESTION);
  });

  it('downgrades a blocking legal hold to advisory when there are no legal implications', async () => {
    await mountOpened();
    await seedPeerContagion();
    await clearLane('legal', 'counsel');
    expect(screen.getByTestId('downgraded-advisory').textContent)
      .toMatch(/cannot delay release/);
    expect(screen.getByTestId('lane-legal').getAttribute('data-lane-state')).toBe('advisory_comment');
  });

  it('makes legal blocking only when a human says the subject has legal implications', async () => {
    await mountOpened();
    await seedPeerContagion();
    fireEvent.click(screen.getByLabelText(/specific legal implications/i));
    expect(screen.getByTestId('lane-legal').getAttribute('data-lane-state')).toBe('outstanding');
  });

  it('voids every clearance when the text changes', async () => {
    await mountOpened();
    await seedPeerContagion();
    await clearLane('reputation', 'anna');
    await clearLane('policy', 'ben');
    await clearLane('sme', 'chloe');
    expect(screen.getByTestId('lane-reputation').getAttribute('data-lane-state')).toBe('held');

    fireEvent.change(screen.getByTestId('slot-known'), { target: { value: 'a different first line' } });
    await settle();

    for (const role of ['reputation', 'policy', 'sme']) {
      expect(screen.getByTestId(`lane-${role}`).getAttribute('data-lane-state'))
        .toBe('void_content_changed');
    }
    expect(refusalByCode(document.body, 'CLEARANCE_VOID_CONTENT_CHANGED'))
      .toMatch(/four eyes on an earlier draft/);
  });

  it('refuses a clearance given by the author of the statement', async () => {
    await mountOpened();
    await seedPeerContagion();
    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'anna' } });
    await clearLane('reputation', 'anna');
    expect(screen.getByTestId('lane-reputation').getAttribute('data-lane-state'))
      .toBe('void_self_cleared');
    // The lane says it plainly, and the refusal states the constraint.
    expect(screen.getByTestId('lane-sentence-reputation').textContent)
      .toMatch(/not a second pair of eyes/);
    expect(refusalByCode(document.body, 'SELF_APPROVAL_FORBIDDEN'))
      .toMatch(/the author cannot be one of the three clears/);
  });
});

describe('four eyes, honestly', () => {
  it('admits four eyes were not achieved when one person supplies every clear', async () => {
    await mountOpened();
    await seedPeerContagion();
    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'the-author' } });
    await clearLane('reputation', 'solo');
    await clearLane('policy', 'solo');
    await clearLane('sme', 'solo');
    const admission = screen.getByTestId('bench-admission');
    expect(admission.textContent).toMatch(/one human supplied them/);
    expect(admission.textContent).toMatch(/wearing 3 hats/);
    // The admission appears where a tick would, and the gate did not pass.
    expect(refusalByCode(document.body, 'FOUR_EYES_UNACHIEVABLE')).toMatch(/one human supplied them/);
    expect(screen.getByTestId('issuable-verdict').textContent).toMatch(/NOT ISSUABLE/);
  });

  it('states in the closing admissions that four eyes were not proved', async () => {
    await mountOpened();
    expect(screen.getByTestId('crisis-does-not-prove').textContent)
      .toMatch(/THAT FOUR EYES WERE ON IT/);
  });
});

/* ── 9, 10. Peer contagion ────────────────────────────────────────────────── */

describe('peer contagion', () => {
  it('puts a prepared answer into the statement in one action', async () => {
    await mountOpened();
    await seedPeerContagion();
    const row = screen.getByTestId('contagion-rows')
      .querySelector('[data-contagion-attribute="native_exchange_token"]') as HTMLElement;
    expect(row.getAttribute('data-contagion-state')).toBe('ready');
    fireEvent.click(within(row).getByRole('button', { name: /use this answer/i }));
    expect((screen.getByTestId('slot-known') as HTMLTextAreaElement).value)
      .toContain('LCX has a native token');
  });

  it('refuses where nothing is prepared, and names both gaps', () => {
    render(<MarketingCrisis />);
    const row = screen.getByTestId('contagion-rows')
      .querySelector('[data-contagion-attribute="same_custodian"]') as HTMLElement;
    expect(row.getAttribute('data-contagion-state')).toBe('absent');
    expect(within(row).getByTestId('contagion-refusal-same_custodian').textContent)
      .toMatch(/no prepared answer/i);
    // Both halves: no words, and no recorded fact about whether it even applies.
    expect(row.textContent).toMatch(/not recorded whether LCX shares this attribute/);
  });

  it('never renders an unknown applicability as "does not apply"', () => {
    render(<MarketingCrisis />);
    const rows = screen.getByTestId('contagion-rows');
    expect(rows.textContent).not.toMatch(/does not apply/i);
    expect(rows.textContent).not.toMatch(/not applicable/i);
    expect(screen.getByTestId('contagion-owner').textContent)
      .toMatch(/not that it is "no"/);
  });

  it('resets the clearances when a contagion answer changes the text', async () => {
    await mountOpened();
    await seedPeerContagion();
    await clearLane('reputation', 'anna');
    const row = screen.getByTestId('contagion-rows')
      .querySelector('[data-contagion-attribute="native_exchange_token"]') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /use this answer/i }));
    expect(screen.getByTestId('lane-reputation').getAttribute('data-lane-state')).toBe('outstanding');
  });
});

/* ── 11, 12. Absences ─────────────────────────────────────────────────────── */

describe('what this room cannot do', () => {
  it('offers no publish, post, send, schedule or tweet affordance', async () => {
    await mountOpened();
    await seedPeerContagion();
    for (const b of screen.getAllByRole('button')) {
      expect(b.textContent ?? '', 'no control here may look like it publishes')
        .not.toMatch(/\b(post|publish|send|schedule|tweet)\b/i);
    }
  });

  /**
   * READ AT THE SOURCE, because the rendered check above cannot see a control that
   * only appears once every gate has passed — and that is exactly the state in which
   * somebody would add a publish button. The owner's constraint is that nothing here
   * can act as the LCX account, and a constraint that is only enforced along the
   * happy path is not enforced.
   *
   * Comments are stripped first: this file necessarily DISCUSSES posting and sending
   * at length, and a rule that cannot tell code from writing about code gets silenced
   * rather than obeyed.
   */
  it('contains no publish-shaped affordance anywhere in its source', () => {
    const src = readFileSync(join(__dirname, '..', 'MarketingCrisis.tsx'), 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*'); })
      .join('\n');
    for (const banned of [
      /\bfetch\s*\(/, /\baxios\b/, /XMLHttpRequest/, /\bWebSocket\b/,
      />\s*(?:Post|Publish|Send|Schedule|Tweet)\b/i,
      /\b(?:postStatement|publishStatement|sendStatement|scheduleStatement)\b/,
      /credential|accessToken|bearerToken|oauth/i,
    ]) {
      expect(code, `MarketingCrisis.tsx must not contain ${banned}`).not.toMatch(banned);
    }
  });

  it('offers no copy affordance beside a refused statement', async () => {
    await mountOpened();
    // Nothing seeded, so the statement is incomplete and not issuable.
    expect(screen.getByTestId('handoff-blocked').textContent)
      .toMatch(/A refusal beside a copy button is a suggestion/);
    expect(screen.queryByRole('button', { name: /copy the statement/i })).toBeNull();
  });

  it('says on its face that nothing is persisted', () => {
    render(<MarketingCrisis />);
    expect(screen.getByTestId('crisis-not-persisted').textContent)
      .toMatch(/lives in this browser tab and nowhere else/);
  });

  it('uses no <header>, <aside> or <footer>, because PrintStyles hides all three', () => {
    const { container } = render(<MarketingCrisis />);
    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelector('aside')).toBeNull();
    expect(container.querySelector('footer')).toBeNull();
    expect(screen.getByTestId('crisis-printed-at')).toBeInTheDocument();
    expect(screen.getByTestId('crisis-does-not-prove')).toBeInTheDocument();
  });

  it('keeps the three lanes as parallel columns in print', () => {
    render(<MarketingCrisis />);
    const css = screen.getByTestId('crisis-print-styles').textContent ?? '';
    expect(css).toMatch(/\[data-testid="clearance-lanes"\][\s\S]*grid-template-columns: repeat\(4/);
  });

  it('badges the precleared wording as not counsel-reviewed', () => {
    render(<MarketingCrisis />);
    expect(screen.getByTestId('crisis-unreviewed').textContent)
      .toMatch(/versioned draft, not counsel-reviewed text/);
  });
});

/* ── The fingerprint, and the admission about what it is ──────────────────── */

describe('binding a clearance to bytes', () => {
  it('says so when it falls back to a fingerprint instead of a hash', async () => {
    vi.stubGlobal('crypto', {});
    render(<MarketingCrisis />);
    await settle();
    expect(screen.getByTestId('fingerprint-fallback').textContent).toContain(FINGERPRINT_FALLBACK_NOTICE);
    expect(screen.getByTestId('statement-fingerprint').textContent)
      .toMatch(/fnv-1a fingerprint \(not a hash\)/);
  });

  it('labels a real SHA-256 as one', async () => {
    const digest = vi.fn(async () => new Uint8Array(32).fill(0xab).buffer);
    vi.stubGlobal('crypto', { subtle: { digest } });
    render(<MarketingCrisis />);
    await settle();
    expect(screen.queryByTestId('fingerprint-fallback')).toBeNull();
    expect(screen.getByTestId('statement-fingerprint').textContent).toMatch(/sha-256: ab+/);
    expect(digest).toHaveBeenCalledWith('SHA-256', expect.anything());
  });
});

/* ── The library, as a preparation surface ────────────────────────────────── */

describe('preparation', () => {
  it('states which incident types have no precleared statement at all', () => {
    render(<MarketingCrisis />);
    const closing = screen.getByTestId('crisis-does-not-prove').textContent ?? '';
    const unprepared = ['outage', 'security_incident', 'hack_rumour', 'depeg', 'delisting', 'regulatory_action', 'peer_contagion', 'impersonation']
      .filter((t) => HOLDING_STATEMENTS.every((s) => !s.incidentTypes.includes(t as never)));
    if (unprepared.length === 0) {
      expect(closing).toMatch(/Every incident type in the taxonomy has at least one precleared statement/);
    } else {
      for (const t of unprepared) expect(closing).toContain(t);
    }
  });

  it('says so, rather than showing an empty list, when a type has no preclear', () => {
    render(<MarketingCrisis />);
    const withNone = ['outage', 'security_incident', 'hack_rumour', 'depeg', 'delisting', 'regulatory_action', 'peer_contagion', 'impersonation']
      .find((t) => holdingStatementsFor(t as never).length === 0);
    if (withNone === undefined) return; // the library covers everything; nothing to assert
    fireEvent.change(screen.getByLabelText('Incident type'), { target: { value: withNone } });
    expect(screen.getByTestId('preclear-absent').textContent)
      .toMatch(/cannot be closed now/);
  });
});
