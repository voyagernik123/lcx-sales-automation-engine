import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PracticeRange } from '../PracticeRange';
import { DRILLS } from '@/lib/practice';
import { useOperatorStore, OPERATORS } from '@/stores/useOperatorStore';

/**
 * THE RUNTIME HALF OF THE ISOLATION PROOF.
 *
 * `lib/__tests__/practice.test.ts` reads the import graph, and says out loud what
 * that cannot see: a dynamic `await import()` inside a handler, or any transport
 * reached through a name the census does not know. This file closes that by
 * removing the transports themselves. Every door out of a browser tab — `fetch`,
 * `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon` — is
 * replaced with a spy that THROWS, and then all five drills are driven to a
 * completed write, refusals and overrides included. A practice range that made a
 * request would not merely be recorded as having done so; it would break.
 *
 * WATCHED FAILING — this is the mutation the brief asks for by name:
 * `PracticeRange.run()` was changed to
 *   `void fetch(`/v1/actions/${action.id}/invoke`, { method: 'POST' });`
 * ahead of the `practiceInvoke` call — i.e. the exact accident this feature must
 * be incapable of. FOUR tests in this file went RED with
 *   "Error: the practice range called fetch — /v1/actions/assign/invoke"
 * and the neighbouring static census went red on its transport-call rule while
 * its import-door rule stayed GREEN — `fetch` is a global and needs no import,
 * which is exactly why that census needs two rules and not one. Restored: green.
 *
 * The honest limit of this file: it proves the five drills are clean, not that no
 * input sequence anywhere could be. Together with the static census — which is
 * exhaustive over modules but blind to dynamic imports — the two cover each
 * other's gap, and neither alone would be worth much.
 */

/**
 * Five seconds is the wrong default for these five.
 *
 * Each mounts a manifest-driven page and drives up to four governed attempts
 * through it, and MEASURED on a machine running three other agents' builds at the
 * same time, drill 1 took 17.9s and blew vitest's 5s default — while passing in
 * 0.5s alone. Three tests I have never touched (sendQueueAuthority, CountUp,
 * bdPipelineEnterOwnership) and one sibling's brand-new tour.test.tsx timed out in
 * the same runs, so this is contention rather than this page being slow.
 *
 * A local budget rather than a global `testTimeout`: raising the default would hide
 * a genuinely slow test somewhere else, and a per-test number states which tests
 * are known to be heavy and why.
 */
const DRILL_TIMEOUT_MS = 20_000;

/** Every call any spy saw, in order, so a failure names the door and the URL. */
let calls: string[] = [];

function forbidTransport(name: string) {
  return (...args: unknown[]) => {
    const detail = typeof args[0] === 'string' ? ` — ${args[0]}` : '';
    calls.push(`${name}${detail}`);
    throw new Error(`the practice range called ${name}${detail}`);
  };
}

beforeEach(() => {
  calls = [];
  // Assigned rather than vi.spyOn'd: jsdom does not implement WebSocket or
  // EventSource at all, and spyOn cannot stub a property that does not exist —
  // which would have made three of these five rules silently absent.
  vi.stubGlobal('fetch', forbidTransport('fetch'));
  vi.stubGlobal('XMLHttpRequest', class {
    open = forbidTransport('XMLHttpRequest.open');
    send = forbidTransport('XMLHttpRequest.send');
  });
  vi.stubGlobal('WebSocket', class {
    constructor(url: string) {
      forbidTransport('WebSocket')(url);
    }
  });
  vi.stubGlobal('EventSource', class {
    constructor(url: string) {
      forbidTransport('EventSource')(url);
    }
  });
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: forbidTransport('sendBeacon'),
  });
  // Sam — an OPERATOR, which is the interesting principal: four of the five drills
  // refuse for him first.
  useOperatorStore.getState().setOperator(OPERATORS.find((o) => o.id === 'sam')!);
});

afterEach(async () => {
  /*
   * THE CENTRAL ASSERTION, MADE AFTER EVERY TEST IN THIS FILE rather than at the
   * end of one long one.
   *
   * It started as a single test that drove all five drills, and that was wrong
   * twice over. It took 8s under a loaded full-suite run and blew vitest's 5s
   * default — measured, in `npm test`, where it passed in isolation and failed in
   * company. And a timeout in the middle of drill three would have said nothing
   * about drills four and five. Split per drill, each rep is cheap, a failure names
   * the flow, and the transports are checked after the negative-space tests too.
   *
   * AND IT IS ASYNC, WHICH IS NOT A DETAIL — it is the whole reason this file can
   * claim to cover the static census's blind spot.
   *
   * The census next door reads STATIC imports and says so; the stated division of
   * labour is that this file catches what a graph walk cannot see, namely a dynamic
   * `import('@/lib/apiClient')` inside a handler. When the assertion was
   * synchronous that division of labour was FICTION, and it was watched surviving:
   *   `void import('@/lib/apiClient').then((m) => m.request(`/v1/actions/${actionId}/invoke`, { method: 'POST' }))`
   * added to `practiceInvoke` passed all 36 vitest tests in both files, while the
   * Playwright spec caught it POSTing to the real API on localhost:8791. The escape
   * was real; only the guards were asleep. `fireEvent` is synchronous, the dynamic
   * import resolves a module and therefore lands at least a macrotask later, and the
   * sync `expect` ran and passed before the request was ever made.
   *
   * So: flush before judging. A `setTimeout(0)` drains the microtask queue AND one
   * macrotask turn, which is what a resolved dynamic import needs. Watched failing
   * with the same mutation after this change — "the sandbox reached: fetch —
   * http://localhost:8791/v1/actions/assign/invoke" — so the flush is load-bearing
   * rather than decoration.
   */
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(calls, `the sandbox reached: ${calls.join(', ')}`).toEqual([]);
  cleanup();
  vi.unstubAllGlobals();
  useOperatorStore.getState().clearOperator();
});

/* ── driving helpers ──────────────────────────────────────────────────────── */

const openDrill = (title: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(title, 'i') }));
const runIt = () => fireEvent.click(screen.getByRole('button', { name: 'Run it' }));
const setSelect = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const setText = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const check = (name: RegExp) => fireEvent.click(screen.getByRole('checkbox', { name }));

/** The refusal code currently on screen, or null if the last attempt wrote. */
const shownCode = (): string | null => {
  const refused = screen.queryByText(/^Refused —/);
  if (!refused) return null;
  // `textContent` carries the icon's leading whitespace, which `getByText`
  // normalises away and a raw `^` anchor does not — so normalise first.
  return refused.textContent!.replace(/\s+/g, ' ').trim().replace(/^Refused — /, '');
};
const wrote = () => screen.queryByText(/^Written\./) !== null;

describe('the practice range never reaches a transport', () => {
  it('drill 1 — triage: the required param is refused, then the write lands', () => {
    render(<PracticeRange />);
    openDrill('Triage a lead');
    runIt();
    expect(shownCode()).toBe('VALIDATION');
    setSelect(/^Owner/, 'sam');
    runIt();
    expect(wrote()).toBe(true);
  }, DRILL_TIMEOUT_MS);

  it('drill 2 — decide: refused, the bare override refused again, then through with a reason', () => {
    // The gate this whole feature exists for.
    render(<PracticeRange />);
    openDrill('Decide a gated decision');
    setText(/^Chosen/, 'Broker-dealer partnership');
    runIt();
    expect(shownCode()).toBe('SAT_REQUIRED');
    expect(screen.getByText(/File the missing tradecraft, or override with a recorded reason\./)).toBeInTheDocument();
    check(/Override sat/);
    runIt();
    expect(shownCode()).toBe('OVERRIDE_REASON_REQUIRED');
    setText(/^Override reason/, 'Board deadline; premortem booked for Thursday.');
    runIt();
    expect(wrote()).toBe(true);
  }, DRILL_TIMEOUT_MS);

  it('drill 3 — RFI: the status writes, and the record param says why it cannot', () => {
    render(<PracticeRange />);
    openDrill('Record an RFI');
    expect(screen.getByText(/The server wants a map of field → value/)).toBeInTheDocument();
    setSelect(/^Status/, 'returned');
    runIt();
    expect(wrote()).toBe(true);
  }, DRILL_TIMEOUT_MS);

  it('drill 4 — listing: the workspace compartment, off and on', () => {
    render(<PracticeRange />);
    openDrill('Advance a listing');
    check(/Holds every workspace/);
    setSelect(/^Status/, 'live');
    runIt();
    expect(shownCode()).toBe('WORKSPACE_FORBIDDEN');
    check(/Holds every workspace/);
    runIt();
    expect(wrote()).toBe(true);
  }, DRILL_TIMEOUT_MS);

  it('drill 5 — campaign: authority no override buys, then blockers one does', () => {
    render(<PracticeRange />);
    openDrill('Launch a campaign');
    setSelect(/^Status/, 'live');
    runIt();
    expect(shownCode()).toBe('APPROVER_REQUIRED');
    expect(screen.getByText(/Nothing you can type will unlock it/)).toBeInTheDocument();
    check(/Approver authority/);
    runIt();
    expect(shownCode()).toBe('COMPLIANCE_GATE');
    check(/Override gate/);
    setText(/^Override reason/, 'Legal signed off by email; envelope raised in the same thread.');
    runIt();
    expect(wrote()).toBe(true);
  }, DRILL_TIMEOUT_MS);

  it('the transports really are armed (this file would pass vacuously otherwise)', () => {
    // Without this, a broken stub would make every rule above assert nothing at
    // all — the failure mode that let three releases ship pointing at localhost.
    expect(() => fetch('/v1/anything')).toThrow(/called fetch/);
    expect(() => navigator.sendBeacon('/v1/anything')).toThrow(/called sendBeacon/);
    expect(() => new WebSocket('wss://x')).toThrow(/called WebSocket/);
    // Cleared so this test's own deliberate calls do not fail the shared afterEach.
    calls = [];
  });
});

describe('it is unmistakably not production', () => {
  it('says so above everything else, and says where the writes go', () => {
    render(<PracticeRange />);
    // The one-second test cannot be asserted in jsdom (it is the hazard band and
    // the amber field, and jsdom has no layout). What IS assertable is that the
    // claim is made, and made at the top — an operator who reads one line reads
    // this one.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/PRACTICE RANGE — nothing here is real/);
    expect(screen.getByText(/no write leaves it/i)).toBeInTheDocument();
  });

  it('offers exactly the five flows, each labelled with the refusal it will produce', () => {
    render(<PracticeRange />);
    const nav = screen.getByRole('navigation', { name: /practice drills/i });
    for (const d of DRILLS) {
      const item = within(nav).getByRole('button', { name: new RegExp(d.title, 'i') });
      expect(item).toBeInTheDocument();
      // The label is a promise to the operator, and practice.test.ts asserts the
      // promise is kept by the simulated server.
      expect(item.textContent).toContain(d.meets ?? 'clean write');
    }
    expect(within(nav).getAllByRole('button')).toHaveLength(DRILLS.length);
  });

  it('shows what the audit would hold, and says a refusal is recorded nowhere', () => {
    render(<PracticeRange />);
    expect(screen.getByText(/A REFUSAL lands in neither/)).toBeInTheDocument();
    openDrill('Triage a lead');
    setSelect(/^Owner/, 'monty');
    runIt();
    // Attributed to the signed-in operator, not to an anonymous sandbox actor:
    // "every write is audited, attributed, gated" is the lesson.
    expect(screen.getByText(/by sam@lcx\.com/)).toBeInTheDocument();
    expect(screen.getByText(/action:assign → deal\/practice-deal-1/)).toBeInTheDocument();
  });

  it('reports their own median only once there is a median to report', () => {
    /*
     * The dark-pattern rule, asserted rather than promised. There is no streak, no
     * target, and nothing that decays — so the only progress number is a median of
     * their own reps, and one rep is not a median.
     */
    render(<PracticeRange />);
    openDrill('Triage a lead');
    setSelect(/^Owner/, 'sam');
    runIt();
    expect(screen.queryByText(/median time/i)).not.toBeInTheDocument();
    runIt();
    expect(screen.getByText(/Your median time to a completed write/)).toBeInTheDocument();
    expect(screen.queryByText(/streak|goal|target|don't break/i)).not.toBeInTheDocument();
  });

  it('shows the gate before it is met, so the refusal is not the first anyone hears of it', () => {
    render(<PracticeRange />);
    openDrill('Launch a campaign');
    expect(screen.getByText(/a token-incentivized launch is approver-only, and not overridable/)).toBeInTheDocument();
    // And the command line's own pre-emptive block, for a verb the principal cannot run.
    openDrill('Advance a listing');
    check(/Holds every workspace/);
    expect(screen.getByText(/Request access from the workspace switcher/)).toBeInTheDocument();
  });
});
