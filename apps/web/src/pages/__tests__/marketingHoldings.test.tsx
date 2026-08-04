import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MarketingHoldings } from '../MarketingHoldings';
import * as client from '@/lib/apiClient';
import * as marketingApi from '@/lib/api/marketing';
// By package name, not a deep relative path: `marketing/index.ts` re-exports the contract,
// so the sentences this test asserts on are the ones the page can actually import.
import {
  NOT_DECLARED_IS_NOT_CLEAR, SHORT_NOT_ASKED_IS_NOT_NO_SHORT,
} from '@lcx/shared';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE HOLDINGS SURFACE — the guards on a screen that is read as reassurance.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  This is the screen a member of staff looks at before deciding whether they may post
 *  an opinion about an asset, with EUR 700 000 of personal liability behind the answer
 *  (MiCA Art 91(3)(c), Art 111(2)(d)). So the failure to design against is not a blank
 *  page — it is a page that looks clean and is silent. Every test below pins a sentence
 *  or an ABSENCE that a well-meaning future edit could quietly make untrue:
 *
 *   1. AN EMPTY REGISTER IS A WARNING, not a tidy list. Silence is the failure.
 *   2. 'NOT ASKED' IS NEVER RENDERED AS "no short position", anywhere, ever.
 *   3. THE SHORT CONTROL IS ABSENT — not disabled — while the firm does not ask, and it
 *      appears the moment the API says the policy asks. One line of server config, and
 *      this screen follows it without being redeployed.
 *   4. AN EXPIRING declaration is called out BEFORE it expires, and an EXPIRED one is
 *      stated as refusing.
 *   5. A SUPERSEDED row is still rendered, with its old value, because that is evidence.
 *   6. A NAMED symbol nobody declared is reported as NOT DECLARED in red, and the
 *      bearish limb of an unanswered short question reads `unknown`.
 *   7. Declaring goes through the GOVERNED ACTION, and no short answer is sent while
 *      the firm does not ask.
 *
 *  WHAT THESE TESTS CANNOT SEE, stated plainly: jsdom has no layout and no paint, so
 *  "loudest thing on the screen" is asserted as "the warning is in the DOM and carries
 *  the blocking sentence", never as a claim about what a human's eye lands on first.
 */

const CHAIN = {
  memberId: 'sam',
  viewerIsSubject: true,
  registerPresent: true,
  registerEmpty: false,
  shortLimbMigrated: true,
  migration: '0060_marketing_abuse.sql',
  shortMigration: '0065_marketing_holdings_position.sql',
  rows: [] as Array<Record<string, unknown>>,
  shortQuestionPolicy: 'not_asked',
  shortQuestionAsked: false,
};

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'dec-1',
    memberId: 'sam',
    assetSymbol: 'SOL',
    holds: false,
    shortPosition: 'not_asked',
    declaredAt: '2026-07-01T00:00:00.000Z',
    renewBy: '2027-07-01T00:00:00.000Z',
    superseded: false,
    supersedesId: null,
    amendmentReason: null,
    ...over,
  };
}

let chain: Record<string, unknown> = { ...CHAIN };
let cells: Record<string, unknown> | null = null;
let registerBody: Record<string, unknown> | null = null;

const requestSpy = vi.spyOn(client, 'request');
const declareSpy = vi.spyOn(marketingApi, 'declareAssetHoldings');

beforeEach(() => {
  chain = { ...CHAIN, rows: [] };
  cells = null;
  registerBody = null;
  requestSpy.mockReset();
  declareSpy.mockReset();
  declareSpy.mockResolvedValue({} as never);
  requestSpy.mockImplementation(async (path: string) => {
    if (path.startsWith('/v1/marketing/holdings/cells')) {
      if (!cells) throw new client.ApiError('no cells stubbed', 400);
      return cells as never;
    }
    if (path === '/v1/marketing/holdings/register') {
      // An operator gets 403 here, which is the EXPECTED answer and not an error.
      if (!registerBody) throw new client.ApiError('approver only', 403);
      return registerBody as never;
    }
    return chain as never;
  });
});

/** The whole rendered text, for assertions about what is NOT anywhere on the page. */
const pageText = () => screen.getByTestId('marketing-holdings').textContent ?? '';

describe('an empty register is a warning, never a clean bill of health', () => {
  it('shows the NOT DECLARED warning even with nothing to show', async () => {
    chain = { ...CHAIN, registerEmpty: true, rows: [] };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-not-declared-warning')).toBeTruthy());
    expect(pageText()).toContain(NOT_DECLARED_IS_NOT_CLEAR);
    expect(screen.getByTestId('holdings-register-empty').textContent)
      .toMatch(/never heard from you — not because you hold nothing/);
  });

  it('says the register does not EXIST when 0060 is unapplied, not that it is empty', async () => {
    chain = { ...CHAIN, registerPresent: false, registerEmpty: false };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-register-absent')).toBeTruthy());
    expect(screen.getByTestId('holdings-register-absent').textContent)
      .toMatch(/0060_marketing_abuse\.sql has not been applied/);
    expect(screen.queryByTestId('holdings-register-empty')).toBeNull();
  });

  it('says the short column is missing when 0065 is unapplied', async () => {
    chain = { ...CHAIN, shortLimbMigrated: false };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-short-migration-absent')).toBeTruthy());
    expect(screen.getByTestId('holdings-short-migration-absent').textContent)
      .toMatch(/0065_marketing_holdings_position\.sql/);
  });
});

describe('NOT ASKED is never rendered as "no short position"', () => {
  it('labels an unanswered short limb as NOT ASKED and says unknown refuses', async () => {
    chain = { ...CHAIN, rows: [row({ holds: false, shortPosition: 'not_asked' })] };
    render(<MarketingHoldings />);
      /* ASSERT-IN-WAITFOR. The barrier used to be a DIFFERENT element (the container),
       * and a container arriving does not imply its rows have rendered — the two come
       * from different state. Locally they land in the same tick so it looked settled;
       * under CI's slower scheduler the assertion read an empty section (CI run
       * 30900660294). Making the positive assertion itself the barrier cannot go stale.
       *
       * The NEGATIVE assertions stay OUTSIDE: `not.toMatch` inside waitFor passes
       * instantly against a DOM that has not rendered yet, which is a false pass. */
    await waitFor(() => {
      expect(pageText()).toContain('short position UNKNOWN');
      expect(pageText()).toContain(SHORT_NOT_ASKED_IS_NOT_NO_SHORT);
    });
    const text = pageText();
    // ...and NOWHERE claims the member has no short position. This is the assertion the
    // whole widening exists for: `holds: false` alone must not read as flat.
    expect(text).not.toMatch(/Declared no short/);
    expect(text).not.toMatch(/Holds neither/);
  });

  it('does say "Holds neither" only when BOTH limbs were answered', async () => {
    chain = { ...CHAIN, rows: [row({ holds: false, shortPosition: 'no_short' })] };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-chain')).toBeTruthy());
    // Anti-vacuity for the assertion above: the string CAN appear, so its absence there
    // is a real fact about the unanswered case rather than a string that never renders.
    expect(pageText()).toContain('Holds neither');
  });

  it('reports a declared short even where no spot is held — the limb the boolean missed', async () => {
    chain = { ...CHAIN, rows: [row({ holds: false, shortPosition: 'holds_short' })] };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-chain')).toBeTruthy());
    expect(pageText()).toContain('Holds short only');
  });
});

describe('the short question is absent until the firm asks it', () => {
  it('renders NO short control, and explains whose decision that is', async () => {
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-declare')).toBeTruthy());
    // ABSENT, not disabled: a disabled control still asserts the firm intends to ask.
    expect(screen.queryByTestId('holdings-short-control')).toBeNull();
    expect(screen.getByTestId('holdings-short-not-asked-note').textContent)
      .toMatch(/decision for HR and legal/);
  });

  it('renders the control the moment the API reports the policy asks', async () => {
    chain = { ...CHAIN, shortQuestionPolicy: 'voluntary', shortQuestionAsked: true };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-short-control')).toBeTruthy());
    expect(screen.queryByTestId('holdings-short-not-asked-note')).toBeNull();
    // Including an explicit DECLINE, which is a different fact from never being asked.
    expect(screen.getByLabelText('Short position').textContent).toMatch(/Declined to answer/);
  });
});

describe('what is about to expire is said before it expires', () => {
  it('warns about a declaration inside the renewal window while it is still live', async () => {
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
    chain = { ...CHAIN, rows: [row({ renewBy: soon })] };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-renewals')).toBeTruthy());
    const text = screen.getByTestId('holdings-renewals').textContent ?? '';
    expect(text).toMatch(/SOL expires/);
    expect(text).toMatch(/still live until then/);
  });

  it('states that an expired declaration is treated as NOT DECLARED and refuses', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    chain = { ...CHAIN, rows: [row({ renewBy: past })] };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-renewals')).toBeTruthy());
    expect(screen.getByTestId('holdings-renewals').textContent)
      .toMatch(/SOL EXPIRED.*treated as NOT DECLARED and refuses/s);
  });

  it('does not warn when nothing is near its renewal date', async () => {
    chain = { ...CHAIN, rows: [row()] };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-renewals')).toBeTruthy());
    expect(screen.getByTestId('holdings-renewals').textContent).toMatch(/Nothing you have declared expires/);
  });
});

describe('the amendment chain keeps the old value on screen', () => {
  it('renders the superseded row, labelled as evidence, beside the current one', async () => {
    chain = {
      ...CHAIN,
      rows: [
        row({ id: 'dec-2', holds: false, supersedesId: 'dec-1', amendmentReason: 'position_closed' }),
        row({ id: 'dec-1', holds: true, superseded: true }),
      ],
    };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-chain')).toBeTruthy());
    expect(screen.getAllByTestId('holdings-row-current')).toHaveLength(1);
    const old = screen.getAllByTestId('holdings-row-superseded');
    expect(old).toHaveLength(1);
    expect(old[0]!.textContent).toMatch(/SUPERSEDED \(kept as evidence\)/);
    // The prior POSITION is still legible, which is the point of keeping the row.
    expect(old[0]!.textContent).toMatch(/Holds long/);
    // And the renewal panel counts only the current row.
    expect(screen.getByTestId('holdings-renewals').textContent).toMatch(/Nothing you have declared expires/);
  });
});

describe('a named symbol gets an answer you can act on', () => {
  it('reports an undeclared symbol as NOT DECLARED with an unknown bearish limb', async () => {
    cells = {
      memberId: 'sam',
      registerPresent: true,
      registerEmpty: false,
      shortLimbMigrated: true,
      cells: [{
        memberId: 'sam', assetSymbol: 'ETH', state: 'not_declared', holds: null,
        shortPosition: null, declaredAt: null, renewBy: null, stale: false, amendments: 0,
      }],
      notDeclared: ['ETH'],
      shortQuestionPolicy: 'not_asked',
      shortQuestionAsked: false,
    };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-check')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Symbols to check'), { target: { value: 'eth' } });
    fireEvent.click(screen.getByText('Check'));
    await waitFor(() => expect(screen.getByTestId('holdings-cells')).toBeTruthy());
    const text = screen.getByTestId('holdings-cells').textContent ?? '';
    expect(text).toMatch(/NOT DECLARED — this asset REFUSES until you declare it/);
    expect(text).toMatch(/bearish limb: unknown/);
    // Upper-cased on the way out, because the register normalises and a case fork misses.
    expect(requestSpy.mock.calls.some(([p]) => String(p).includes('symbols=ETH'))).toBe(true);
  });

  it('says a stale declaration is not an answer', async () => {
    cells = {
      memberId: 'sam',
      registerPresent: true,
      registerEmpty: false,
      shortLimbMigrated: true,
      cells: [{
        memberId: 'sam', assetSymbol: 'SOL', state: 'not_declared', holds: null,
        shortPosition: null, declaredAt: '2020-01-01T00:00:00.000Z',
        renewBy: '2020-02-01T00:00:00.000Z', stale: true, amendments: 1,
      }],
      notDeclared: ['SOL'],
      shortQuestionPolicy: 'not_asked',
      shortQuestionAsked: false,
    };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-check')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Symbols to check'), { target: { value: 'SOL' } });
    fireEvent.click(screen.getByText('Check'));
    await waitFor(() => expect(screen.getByTestId('holdings-cells')).toBeTruthy());
    expect(screen.getByTestId('holdings-cells').textContent)
      .toMatch(/a declaration exists but has expired, so it is not an answer/);
  });
});

describe('declaring goes through the governed action', () => {
  it('sends no short answer while the firm does not ask the question', async () => {
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-declare')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Asset symbol'), { target: { value: 'sol' } });
    fireEvent.click(screen.getByLabelText('I hold a long position in this asset'));
    fireEvent.click(screen.getByText('Record declaration'));
    await waitFor(() => expect(declareSpy).toHaveBeenCalled());
    const [sym, params] = declareSpy.mock.calls[0]!;
    expect(sym).toBe('SOL');
    expect(params).toMatchObject({ holds: true, renewInDays: 90 });
    // The server refuses a short answer under this policy; sending one would produce a
    // refusal that looked like a bug rather than a policy.
    expect(params).not.toHaveProperty('shortPosition');
    // And no memberId: there is no on-behalf path, and the surface cannot invent one.
    expect(params).not.toHaveProperty('memberId');
  });

  it('sends the short answer once the policy asks', async () => {
    chain = { ...CHAIN, shortQuestionPolicy: 'voluntary', shortQuestionAsked: true };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-short-control')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Asset symbol'), { target: { value: 'SOL' } });
    fireEvent.change(screen.getByLabelText('Short position'), { target: { value: 'holds_short' } });
    fireEvent.click(screen.getByText('Record declaration'));
    await waitFor(() => expect(declareSpy).toHaveBeenCalled());
    expect(declareSpy.mock.calls[0]![1]).toMatchObject({ shortPosition: 'holds_short' });
  });

  it('surfaces the refusal code rather than a generic failure', async () => {
    declareSpy.mockRejectedValue(new client.ApiError('nothing to amend', 409, 'HOLDINGS_NOTHING_TO_AMEND'));
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-declare')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Asset symbol'), { target: { value: 'SOL' } });
    fireEvent.click(screen.getByText('Record declaration'));
    await waitFor(() => expect(screen.getByTestId('holdings-feedback')).toBeTruthy());
    expect(screen.getByTestId('holdings-feedback').textContent).toMatch(/HOLDINGS_NOTHING_TO_AMEND/);
  });

  it('refuses to submit without a symbol, and calls nothing', async () => {
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-declare')).toBeTruthy());
    fireEvent.click(screen.getByText('Record declaration'));
    await waitFor(() => expect(screen.getByTestId('holdings-feedback')).toBeTruthy());
    expect(declareSpy).not.toHaveBeenCalled();
  });
});

describe('the supervision panel appears only for an approver', () => {
  it('is absent when the register read is refused, and the page still works', async () => {
    chain = { ...CHAIN, rows: [row()] };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-chain')).toBeTruthy());
    expect(screen.queryByTestId('holdings-register')).toBeNull();
    // The 403 is expected, so it must NOT be rendered as a page error.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('names members the register has never heard from, without claiming they hold nothing', async () => {
    registerBody = {
      registerPresent: true,
      registerEmpty: false,
      shortLimbMigrated: true,
      rows: [row({ memberId: 'nik', holds: true })],
      membersWithNothingDeclared: ['monty', 'sam'],
      shortQuestionPolicy: 'not_asked',
      shortQuestionAsked: false,
    };
    render(<MarketingHoldings />);
    await waitFor(() => expect(screen.getByTestId('holdings-register')).toBeTruthy());
    const census = screen.getByTestId('holdings-census').textContent ?? '';
    expect(census).toMatch(/monty, sam/);
    expect(census).toMatch(/not a claim that they hold nothing/);
  });
});
