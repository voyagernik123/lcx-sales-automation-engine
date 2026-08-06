import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BriefGenerator } from '../BriefGenerator';
import { useFilterStore } from '@/stores';

/**
 * The brief's default addressees are the Board of Directors, state regulators
 * and the SEC (memoHeader, below the template switch). Every number asserted
 * here used to be wrong on the printed page.
 *
 * The default cohort is MT, WY, TX, CA. From data/states.ts:
 *   estCost      MT $0        WY $400K+     TX $150K+     CA $300K+
 *   suretyBond   MT $0        WY $0         TX $500,000   CA $500,000
 *   minNetWorth  MT $0        WY $400,000   TX $500,000   CA $500,000
 *   estTimeline  MT "No state licensing (federal MSB registration only)"
 *                WY 8-14 months  TX 6-12 months  CA 9-12 months
 */

beforeEach(() => {
  useFilterStore.setState({ clarityEnacted: false, spdiEquivalence: false });
});

describe('BriefGenerator — the budget ledger', () => {
  it('refuses the fee total because three of four states are open-ended', () => {
    render(<BriefGenerator />);
    // '$400K+' has no ceiling, so the cohort has no total. The old code summed
    // the digit-scavenged values and printed one anyway.
    const cell = screen.getByTestId('brief-fee-total');
    expect(cell.textContent).toContain('MONEY_AGG_OPEN_ENDED_MEMBER');
    expect(cell.textContent).toContain('×3');
    expect(cell.textContent).not.toMatch(/\$[\d,]/);
  });

  it('cites the rule for every refusal on the page', () => {
    render(<BriefGenerator />);
    const notes = screen.getByTestId('brief-refusal-notes');
    expect(notes.textContent).toContain('MONEY_AGG_OPEN_ENDED_MEMBER');
    expect(notes.textContent).toMatch(/no upper bound/i);
    // The source strings it could not value are shown, not hidden.
    expect(notes.textContent).toContain('$400K+');
    expect(notes.textContent).toContain('$150K+');
    expect(notes.textContent).toContain('$300K+');
  });

  it('totals the surety bonds that are exact', () => {
    render(<BriefGenerator />);
    // $0 + $0 + $500,000 + $500,000. The old parser produced $50.0 billion for
    // a single '$50,000-$100,000' bond by concatenating the two ends.
    expect(screen.getByTestId('brief-bond-total').textContent).toBe('$1,000,000');
  });

  it('reports the net worth requirement as a cohort ceiling', () => {
    render(<BriefGenerator />);
    expect(screen.getByTestId('brief-networth-ceiling').textContent).toBe('$500,000');
  });

  it('prints $0 for a state whose statutory minimum really is $0', () => {
    render(<BriefGenerator />);
    // REGRESSION: `parseInt(...) || 100000` made 0 falsy, so Montana — which
    // requires no minimum net worth — printed a $100,000 statutory minimum on a
    // memo to its own regulator. Eight states carry '$0' here.
    expect(screen.getByTestId('brief-row-MT-networth').textContent).toBe('$0');
    expect(screen.getByTestId('brief-row-MT-networth').textContent).not.toContain('100,000');
  });

  it('prints the source string for a figure it cannot value', () => {
    render(<BriefGenerator />);
    // Not a number derived from it — the string as recorded.
    expect(screen.getByTestId('brief-row-WY-fee').textContent).toBe('$400K+');
    expect(screen.getByTestId('brief-row-CA-fee').textContent).toBe('$300K+');
    expect(screen.getByTestId('brief-row-TX-bond').textContent).toBe('$500,000');
  });

  it('bands the cohort timeline instead of printing one member’s worst case', () => {
    render(<BriefGenerator />);
    // Old output: "Max: 14m". Montana has no state process at all and is
    // counted separately rather than contributing 0 months.
    expect(screen.getByTestId('brief-timeline-band').textContent).toBe('9–14m');
    expect(screen.getByTestId('brief-timeline-note').textContent).toMatch(/1 of 4/);
  });

  it('counts FIGURES and JURISDICTIONS separately, never "2 of 1"', async () => {
    render(<BriefGenerator />);
    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    // NY is the one state whose estCost ('$500K+') AND suretyBond ('$150,000+')
    // are both open-ended, so one jurisdiction contributes TWO refused figures.
    await userEvent.click(screen.getByRole('button', { name: /^NY$/ }));
    const notes = screen.getByTestId('brief-refusal-notes');
    expect(notes.textContent).toContain('MONEY_AGG_OPEN_ENDED_MEMBER');
    expect(notes.textContent).toContain('2 figures across 1 of 1 jurisdiction — NY');
    // REGRESSION: the merged figure count was labelled as a jurisdiction count,
    // so this read "(2 of 1 jurisdictions)" on a memo to the SEC.
    expect(notes.textContent).not.toContain('2 of 1');
    expect(notes.textContent).toContain('$500K+');
    expect(notes.textContent).toContain('$150,000+');
  });

  it('does not tell the reader the band is one jurisdiction’s range', () => {
    render(<BriefGenerator />);
    const note = screen.getByTestId('brief-timeline-note').textContent ?? '';
    // The printed band is 9–14m for WY 8-14 / TX 6-12 / CA 9-12 — a range NO
    // selected jurisdiction has. The note used to call it "the slowest
    // jurisdiction's range".
    expect(note).not.toMatch(/slowest jurisdiction/i);
    expect(note).toMatch(/latest low end to the latest high end/i);
    // And the parallel-filing claim is labelled as an assumption, not asserted.
    expect(note).toMatch(/assumption/i);
    expect(note).toMatch(/filed in\s+parallel/i);
  });

  it('says the observation frame is missing rather than inventing one', () => {
    render(<BriefGenerator />);
    const caveat = screen.getByTestId('brief-frame-caveat');
    expect(caveat.textContent).toMatch(/no per-figure source/i);
    expect(caveat.textContent).toMatch(/as-of date/i);
  });
});

describe('BriefGenerator — the state regulators memo', () => {
  it('does not manufacture a sandbox finding for a state with no note', async () => {
    render(<BriefGenerator />);
    await userEvent.click(screen.getByRole('button', { name: /state regulators memo/i }));
    // FL is one of five states with no sandboxNotes. The old default asserted
    // 'No sandbox programs available; standard MTL required.' — a legal claim
    // produced out of an empty field, in a memo addressed to that regulator.
    await userEvent.click(screen.getByRole('button', { name: /^FL$/ }));
    const table = screen.getByTestId('brief-state-FL-regulator').closest('tr')!;
    expect(table.textContent).toContain('NOT RECORDED');
    expect(table.textContent).not.toContain('standard MTL required');
    // The regulator IS recorded for every state today, so this cell must still
    // print the real name rather than a placeholder.
    expect(screen.getByTestId('brief-state-FL-regulator').textContent).not.toBe('NOT RECORDED');
    expect(screen.getByTestId('brief-state-FL-regulator').textContent).not.toBe('Division of Banking');
  });
});

describe('BriefGenerator — the signature block', () => {
  it('prints a real SHA-256 of the selection, never a fabricated one', async () => {
    render(<BriefGenerator />);
    // ASSERT-IN-WAITFOR: the digest arrives from an async crypto.subtle call.
    await waitFor(() => {
      expect(screen.getByTestId('brief-digest').textContent).toMatch(/SHA-256 [0-9a-f]{64}/);
    });
    // Negatives, after the DOM has settled — never inside a waitFor.
    const sheet = screen.getByTestId('brief-signature-block');
    expect(sheet.textContent).not.toContain('sha256_');
    expect(sheet.textContent).not.toContain('e8d21b37');
    expect(sheet.textContent).not.toContain('Digitally Certified');
  });

  it('says what the digest does and does not cover', async () => {
    render(<BriefGenerator />);
    await waitFor(() => {
      expect(screen.getByTestId('brief-digest-scope').textContent).toMatch(
        /selection parameters only/i
      );
    });
    expect(screen.getByTestId('brief-digest-scope').textContent).toMatch(/not a signature/i);
  });
});

describe('BriefGenerator — a cohort with no state licensing process', () => {
  it('does not print "0m" for a single state that has no state process', async () => {
    render(<BriefGenerator />);
    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    // MT's estTimeline is 'No state licensing (federal MSB registration only)'.
    // REGRESSION: cohortTimelineBand hard-coded 0 for both ends when no member
    // had a readable duration, so this cell printed "0m" — which reads as
    // "instant" — with the refusal notes below it saying every figure in the
    // cohort had been read as recorded.
    await userEvent.click(screen.getByRole('button', { name: /^MT$/ }));
    const cell = screen.getByTestId('brief-timeline-band');
    expect(cell.textContent).toBe('No state process');
    expect(cell.textContent).not.toMatch(/\d/);
    // The note explains it rather than leaving a bare phrase in a numeric column.
    expect(screen.getByTestId('brief-timeline-note').textContent).toMatch(
      /no band is shown at all here/i
    );
  });

  it('does not print "0m" for the whole NMLS cohort under CLARITY', async () => {
    // Every preempted state becomes noStateProcess, so the 40-state NMLS cohort
    // collapsed into the 0–0 band too.
    useFilterStore.setState({ clarityEnacted: true, spdiEquivalence: false });
    render(<BriefGenerator />);
    await userEvent.click(screen.getByRole('button', { name: /^NMLS$/ }));
    const cell = screen.getByTestId('brief-timeline-band');
    expect(cell.textContent).toBe('No state process');
    expect(cell.textContent).not.toBe('0m');
  });
});

describe('BriefGenerator — preemption', () => {
  it('zeroes fees and bonds for NMLS states when CLARITY is enacted', () => {
    useFilterStore.setState({ clarityEnacted: true, spdiEquivalence: false });
    render(<BriefGenerator />);
    // TX and CA are NMLS states, so only MT ($0) and WY ($400K+) remain
    // unpreempted — WY still has no ceiling, so the fee total still refuses.
    expect(screen.getByTestId('brief-row-TX-fee').textContent).toBe('$0');
    expect(screen.getByTestId('brief-row-TX-timeline').textContent).toBe('Preempted');
    expect(screen.getByTestId('brief-fee-total').textContent).toContain('×1');
    expect(screen.getByTestId('brief-bond-total').textContent).toBe('$0');
  });
});

describe('BriefGenerator — an empty cohort', () => {
  it('refuses every aggregate rather than printing $0 across the row', async () => {
    render(<BriefGenerator />);
    // Drive it through the control the CCO actually uses.
    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(screen.getByTestId('brief-fee-total').textContent).toContain('MONEY_AGG_NO_MEMBERS');
    expect(screen.getByTestId('brief-bond-total').textContent).toContain('MONEY_AGG_NO_MEMBERS');
    expect(screen.getByTestId('brief-networth-ceiling').textContent).toContain(
      'MONEY_AGG_NO_MEMBERS'
    );
    expect(screen.getByTestId('brief-timeline-band').textContent).toContain(
      'TIMELINE_AGG_NO_MEMBERS'
    );
  });
});
