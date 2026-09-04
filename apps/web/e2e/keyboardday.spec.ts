import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { takeSeat } from './seat';

/**
 * THE PHASE 4 GATE — "a keyboard-only day in the life" (LCX_TERMINAL_PLAN.md §PHASE 4).
 *
 * The plan states it verbatim: *triage the desk, decide a gated decision, record an RFI,
 * advance a listing, launch a campaign through its gate — completed without touching the
 * trackpad.* Four phases of keyboard work were signed off against that sentence and it had
 * never been executed. This file executes it.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE OTHER KEYBOARD SPECS. `tablestops.spec.ts` and
 * `populated.spec.ts` assert MECHANICS — one tab stop, arrows move focus, Tab leaves the
 * table. Mechanics can all be correct while no actual job can be done, because a job
 * crosses surfaces: navigate, find the object, reach its control, satisfy its gate, and
 * get a write onto the wire. Only an end-to-end walk can fail on the seam between two
 * correct pieces, and every finding below lives on exactly such a seam — a Modal whose
 * focus policy defeats a child's `autoFocus`, a hint layer that stands down in the one
 * place it is needed most, two type vocabularies that never learned to compare equal.
 *
 * THE THREE THINGS THIS SPEC REFUSES TO DO, each one a way this gate could have been
 * faked:
 *
 *  1. IT DOES NOT ASSERT ITS OWN FIXTURE. The API is unreachable in every automated
 *     environment, so the surfaces are populated by intercepting at the ROUTE level —
 *     the app's own client, read cache, policy layer and components all run for real and
 *     only the network is replaced (the approach `populated.spec.ts` established). What
 *     is asserted is never a number or a label that came out of the fixture: it is which
 *     element has focus, what the keys did, and what request the app put on the wire.
 *     The one place a fixture value appears in an assertion is the SUBJECT ID of a
 *     governed write, and it is load-bearing rather than circular — it proves the app
 *     addressed the object the keyboard cursor was actually on, which is the defect
 *     class that made `s`/`d`/`e` act on the wrong lead before Phase 4.
 *
 *  2. IT DOES NOT ASSERT A TOAST. Where a flow ends in a governed action the assertion is
 *     on the REQUEST to `POST /v1/actions/:id/invoke` — action id, subject type, subject
 *     id, params — captured and only then fulfilled. A success toast is something this
 *     spec would be faking on both ends; the request is the one artefact that proves the
 *     keyboard reached the governed path.
 *
 *  3. IT CANNOT FALL BACK TO A CLICK. That is enforced structurally, not by discipline —
 *     see `keyboardOnly()`. Both halves of the guard have been shown to fail on purpose
 *     (`the guard itself: a positive control`).
 *
 * WHAT IT FOUND, so the summary is not buried at the bottom of a report somewhere. All
 * five flows ARE completable keyboard-only. Two of them are unusably expensive: triage
 * costs ~68 presses (~34 of them pure navigation) and an RFI ~52 (~32 navigation),
 * against a plan that promised every governed action "in under 5 seconds from anywhere".
 * Two genuine defects are pinned with `test.fail()` below — the disqualify dialog eats the
 * first characters typed into it, and the command line can reach only 7 of the 22 governed
 * actions, which makes Phase 3's own gate false. Every number in this paragraph is printed
 * by the run under a `[keyboard-day]` prefix and attached as an annotation; the prose is a
 * summary of the measurements, never a substitute for them.
 */

/* ────────────────────────── fixtures (network only) ─────────────────────── */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = join(HERE, '..', 'src');
const API_SRC = join(HERE, '..', '..', 'api', 'src');

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  // The dev server proxies to an API origin (VITE_API_URL), so these are
  // cross-origin fetches and a missing CORS header reads as a network failure.
  headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify(body),
});
const meta = (total = 1) => ({ total, limit: 50, offset: 0, timestamp: new Date(0).toISOString() });

/** Enough of a BdLead for the queue to render a row. */
const lead = (i: number) => ({
  id: `p-${i}`,
  name: `Probe Chain ${String(i).padStart(2, '0')}`,
  ticker: `PC${i}`,
  website: null,
  source: 'probe',
  chain: 'ethereum',
  jurisdiction: 'US',
  category: 'defi',
  listedOnLcx: false,
  euScore: 50 + i,
  usPreScore: 40 + i,
  usPostScore: 45 + i,
  band: 'Watch',
  peopleCount: 2,
  verifiedContactCount: 1,
  tier: 'tracked',
});
const QUEUE_ROWS = 12;

/**
 * The RFI form's 20 fields, with keys that are deliberately NOT the real ones.
 *
 * `PartnerDossier` derives its effective-cost readout by substring-matching field keys
 * (`find('btc')`, `find('majors')`, …). Real keys would light that panel up from fixture
 * numbers, and then the spec would be sitting next to a readout it might be tempted to
 * assert. Neutral keys keep the surface to exactly what this gate is about: 20 inputs,
 * a status select, and one governed button.
 */
const RFI_FIELDS = Array.from({ length: 20 }, (_, i) => ({
  key: `probe_field_${String(i).padStart(2, '0')}`,
  label: `probe field ${i}`,
}));

const COMMAND_DEEP = {
  reference: {
    defaultGrade: 'C3',
    scorecards: {
      lp: { dimensions: [], rows: [] }, channel: { dimensions: [], rows: [] },
      arch: { dimensions: [], rows: [] }, twoPath: { dimensions: [], rows: [] },
    },
    capabilityDetail: [], connectivity: [],
    rfi: { fields: RFI_FIELDS, example: { provider: 'probe', values: {} } },
    railProviders: [], stablecoinPolicy: [], licensingChecklist: [],
    funnel: { channels: [], conversions: { waitlistToVerified: 0, verifiedToFunded: 0 }, scenarios: [] },
    referralMechanics: [], guardrails: [], ninetyDayPlan: [], tooling: [], ddDimensions: [],
    listingPolicyOutline: [], budgetLines: [], dependencyEdges: [], execDashboard: [],
    masterRoadmap: [], consolidatedRisks: [], decisionEnrichment: [], sources: [],
  },
  rfi: [], requirements: [], blockers: [],
  live: { requirements: true, blockers: true },
};

const PARTNER = {
  id: 'ptr_probe_01',
  name: 'Probe Liquidity Partner',
  type: 'Liquidity',
  subtype: null,
  pipeline_stage: 'evaluate',
  capability_score: 3.2,
  tier: 'Tier 1',
  primary_contact: null,
  terms: null,
  notes: null,
  source: null,
};

const DECISION = {
  id: 'dec_probe_07',
  phase: 'P1',
  decision: 'Probe gated decision',
  // Left null deliberately. `DecisionRow` seeds the input from `recommendation`, so a
  // non-null value would mean the committed `chosen` came from the fixture rather than
  // from the operator's keystrokes — the assertion below would then prove nothing.
  recommendation: null,
  status: 'open',
  chosen: null,
};

const DIST_SURFACE = {
  id: 'srf_probe_one',
  name: 'Probe Surface One',
  category: 'directory',
  audience: 'agent devs',
  submit: 'submit the packet',
  telemetry: null,
  constraint: null,
  srcRefs: [],
};

const DIST_DEEP = {
  reference: {
    meta: { product: 'PayAgent', builtBy: 'probe', thesis: 'probe', asOf: '2026-01-01', dossier: 'probe' },
    payAgent: { tagline: '', custody: '', fees: [], rewardLoop: '', chains: [], surfaces: [], roadmap: [], srcRefs: [] },
    rails: [], surfaces: [DIST_SURFACE],
    growthContext: [], competitors: [], funnel: { stages: [], params: {}, note: '' }, gaps: [],
    geoQuestions: [], personas: [], sources: [], complianceChecklist: [],
  },
  listings: [{
    surface_id: DIST_SURFACE.id, status: 'not_started', owner: null,
    rank_note: null, usage_note: null, url: null, updated_at: new Date(0).toISOString(),
  }],
  // Without this the page renders "Read-only until migration 0043 is applied" and has no
  // control at all — the guard is real, so the fixture has to clear it.
  live: { listings: true },
};

const CAMPAIGN = {
  id: 'cmp_probe_01',
  name: 'Probe Campaign',
  surface_id: null,
  kind: 'quest',
  // Token-incentivized is the whole point: it is what arms the compliance gate on launch.
  token_incentivized: true,
  budget_lcx: '5000',
  status: 'approved',
  detail: null,
  owner: null,
  created_at: new Date(0).toISOString(),
};

async function stubCommandDeck(page: Page): Promise<void> {
  // Six endpoints because `CommandDeck` loads them with Promise.all — one rejection and
  // the whole deck renders an error notice instead of the decisions register.
  await page.route('**/v1/command/overview', (r) => r.fulfill(json({
    data: {
      generatedAt: new Date(0).toISOString(),
      counts: { products: 1, partners: 1, workstreams: 1, tasks: 0, decisions: 1, risks: 0 },
      workstreams: [{ id: 'ws_probe', name: 'Probe workstream', owner: null, total: 1, done: 0, open: 1, blocked: 0 }],
      partnersByType: [{ type: 'Liquidity', total: 1, recommended: 0, inProgress: 0 }],
      riskHeat: [], topRisks: [],
      launch: {
        anchor: 'probe anchor', anchorConfirmed: false,
        targets: [{ id: 'tgt_probe', name: 'Probe target', targetDate: null, confirmed: false, note: null }],
        gating: [{ id: 'gate_probe', title: 'Probe gate', status: 'open', done: false }],
        gatingDone: 0, gatingTotal: 1,
      },
      decisions: { open: 1, total: 1, byPhase: { P1: 1 } },
      gaps: { partnersMissingContact: 1, partnersMissingTerms: 1, planningAssumptions: 0, unconfirmedTargets: 1, notes: [] },
    },
    meta: meta(),
  })));
  await page.route('**/v1/command/partners', (r) => r.fulfill(json({ data: [PARTNER], meta: meta() })));
  await page.route('**/v1/command/tasks', (r) => r.fulfill(json({ data: [], meta: meta(0) })));
  await page.route('**/v1/command/decisions', (r) => r.fulfill(json({ data: [DECISION], meta: meta() })));
  await page.route('**/v1/command/risks', (r) => r.fulfill(json({ data: [], meta: meta(0) })));
  await page.route('**/v1/command/financials', (r) => r.fulfill(json({ data: [], meta: meta(0) })));
}

/** Every governed invoke the app makes, captured before it is answered. */
interface Invoke {
  actionId: string;
  subjectType: string;
  subjectId: string;
  params: Record<string, unknown>;
}

/**
 * Intercept `POST /v1/actions/:id/invoke`.
 *
 * `respond` decides the reply, so a test can make the server REFUSE — which is the only
 * way to reach the gate-remedy path that the campaign flow is actually about.
 */
async function captureInvokes(
  page: Page,
  respond: (inv: Invoke) => { status: number; body: unknown } = () => ({ status: 200, body: { data: { action: 'probe', result: {} } } }),
): Promise<Invoke[]> {
  const seen: Invoke[] = [];
  await page.route('**/v1/actions/*/invoke', async (route) => {
    const url = new URL(route.request().url());
    const body = (route.request().postDataJSON() ?? {}) as Partial<Invoke> & { params?: Record<string, unknown> };
    const inv: Invoke = {
      actionId: url.pathname.split('/').filter(Boolean).slice(-2)[0]!,
      subjectType: String(body.subjectType),
      subjectId: String(body.subjectId),
      params: body.params ?? {},
    };
    seen.push(inv);
    const out = respond(inv);
    await route.fulfill({
      status: out.status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(out.body),
    });
  });
  return seen;
}

/* ─────────────────── THE assertion: the trackpad is unreachable ────────── */

/**
 * THE assertion that makes this a keyboard gate — not "the flow completed" but "the
 * trackpad was never touched". Enforced twice, because either half alone is escapable.
 *
 * LAYER 1 — THE PLAYWRIGHT SURFACE IS POISONED. Every pointer-shaped method on Page,
 * Locator and Mouse is replaced with a thrower, on the PROTOTYPES, so it is not a
 * convention this file follows but a thing the file cannot do. `focus()`, `press(sel)`,
 * `fill()`, `selectOption()` and `type()` are banned alongside the obvious ones: none of
 * them is a mouse, but every one of them reaches a control WITHOUT traversing the
 * keyboard path, which is the property under test. `populated.spec.ts` legitimately uses
 * `rows.first().focus()` to test a mechanic; here it would be the cheat, because "how
 * many presses does it take to get there" is the answer this gate exists to produce.
 *
 * LAYER 2 — THE PAGE COUNTS REAL POINTER INPUT. A `page.evaluate` could still synthesise
 * a click, and a future helper could be added below the API layer, so the page itself
 * listens (capture phase, window) for trusted `pointerdown`/`pointerup`/`mousedown`/
 * `mouseup`/`dblclick`/`contextmenu`/`wheel` and records them.
 *
 * WHY `click` IS NOT IN THAT LIST, which took a measurement to get right. Activating a
 * button with Enter or Space fires a TRUSTED `click` — so counting clicks would fail
 * every keyboard test in this file. And the hint layer's own `activateTarget` dispatches
 * a synthetic `MouseEvent('click', { detail: 1 })` (src/lib/hints.ts), which is
 * `isTrusted: false` and must not count either. Button-down/up and wheel are the events
 * a real pointing device produces and keyboard activation never does; measured empty
 * across a full keyboard-only session (Tab, Enter, End, PageUp, ten Tabs, Enter).
 */
const POINTER_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'contextmenu', 'wheel'];

const BANNED_ON_PAGE = [
  'click', 'dblclick', 'hover', 'tap', 'check', 'uncheck', 'setChecked', 'fill',
  'focus', 'press', 'type', 'selectOption', 'dragAndDrop', 'setInputFiles', 'dispatchEvent',
];
const BANNED_ON_LOCATOR = [
  'click', 'dblclick', 'hover', 'tap', 'check', 'uncheck', 'setChecked', 'fill', 'clear',
  'focus', 'press', 'pressSequentially', 'type', 'selectOption', 'dragTo', 'setInputFiles',
  'dispatchEvent', 'scrollIntoViewIfNeeded',
];
const BANNED_ON_MOUSE = ['click', 'dblclick', 'down', 'up', 'move', 'wheel'];
/**
 * The one hole left in layer 1, found by attacking it: `page.keyboard` is the ALLOWED
 * surface, so nothing on it was poisoned — but `insertText` is the one method there that
 * is not a keystroke. It commits text to the focused element without emitting keydown at
 * all, so it would set a reason or a chosen option that no finger ever typed, and layer 2
 * would see nothing because no pointer event fires either. `press`/`down`/`up`/`type` stay,
 * because those ARE keys.
 */
const BANNED_ON_KEYBOARD = ['insertText'];

/**
 * The real `Mouse.click`, saved before the prototype is poisoned — UNBOUND.
 *
 * Kept for one purpose: the positive control at the bottom of this file uses it to prove
 * layer 2 can actually fail. Without that, "no trackpad events were recorded" is
 * indistinguishable from "the recorder was never wired up" — which is the exact shape of
 * the Playwright run that once looked fast because the app was crashing and made zero API
 * calls.
 *
 * Stored unbound, and that is not a style choice. Bound to the first test's `page.mouse`
 * it would still THROW in the positive control — the page is closed by then — and a
 * `test.fail()` test that fails for the wrong reason is a guard that only looks proven.
 * The caller binds it to its own page.
 */
type MouseClick = (this: unknown, x: number, y: number) => Promise<void>;
let realMouseClick: MouseClick | null = null;

/**
 * Undo list for the poisoning, and the reason it has to exist.
 *
 * The prototypes are Playwright's own, shared by every spec that happens to run in the
 * same worker process. Left poisoned, this file silently broke four assertions in
 * `populated.spec.ts` — which legitimately calls `rows.first().focus()` to test a mechanic
 * — and did it only in the full-suite run, never when either file was run alone. MEASURED:
 * `npx playwright test e2e/` reported 4 failures that vanished under
 * `npx playwright test e2e/populated.spec.ts`. A gate that fails its neighbours is a
 * broken gate, so the ban lasts exactly one test.
 */
const undoPoison: Array<() => void> = [];

function poison(proto: Record<string, unknown>, names: string[], label: string): void {
  for (const name of names) {
    const original = proto[name];
    if (typeof original !== 'function') continue;
    proto[name] = function forbidden(): never {
      throw new Error(
        `TRACKPAD USED: ${label}.${name}() — e2e/keyboardday.spec.ts is the keyboard-only ` +
        `gate. Reaching a control any way other than page.keyboard defeats the only thing ` +
        `it measures. If a flow cannot be done with keys, that is the finding.`,
      );
    };
    undoPoison.push(() => { proto[name] = original; });
  }
}

test.afterEach(() => {
  while (undoPoison.length) undoPoison.pop()!();
});

async function keyboardOnly(page: Page): Promise<void> {
  const mouseProto = Object.getPrototypeOf(page.mouse) as Record<string, unknown>;
  // Re-captured every test, because `afterEach` has already put the real one back.
  if (typeof mouseProto.click === 'function') realMouseClick = mouseProto.click as MouseClick;
  poison(mouseProto, BANNED_ON_MOUSE, 'page.mouse');
  poison(Object.getPrototypeOf(page.keyboard) as Record<string, unknown>, BANNED_ON_KEYBOARD, 'page.keyboard');
  poison(Object.getPrototypeOf(page) as Record<string, unknown>, BANNED_ON_PAGE, 'page');
  poison(Object.getPrototypeOf(page.locator('body')) as Record<string, unknown>, BANNED_ON_LOCATOR, 'locator');

  await page.addInitScript((types: string[]) => {
    const w = window as unknown as { __lcxPointer?: string[] };
    w.__lcxPointer = [];
    for (const type of types) {
      window.addEventListener(type, (e) => {
        if (e.isTrusted) w.__lcxPointer!.push(type);
      }, true);
    }
  }, POINTER_EVENTS);
}

async function assertNoTrackpad(page: Page): Promise<void> {
  const seen = await page.evaluate(() => (window as unknown as { __lcxPointer?: string[] }).__lcxPointer);
  // `undefined` means the init script never ran, which would make the "0 events" result a
  // lie. Distinguished from an honest empty array on purpose.
  expect(seen, 'the pointer recorder was never installed — this run proves nothing').toBeDefined();
  expect(seen, `trusted pointer input reached the page: ${JSON.stringify(seen)}`).toEqual([]);
}

/* ───────────────────────────── keystroke ledger ─────────────────────────── */

/**
 * Every key, counted.
 *
 * The count is the interesting number, not a decoration. Phase 3's gate says every
 * governed action should be invocable "in under 5 seconds from anywhere"; a flow that
 * technically passes at 40 presses is not a flow an operator will use, and without a
 * counter the difference between 6 and 40 is invisible in a green run.
 */
class Keys {
  count = 0;
  /**
   * Of those, the ones that were free text.
   *
   * Split out because the two halves mean different things. Typing a reason is work the
   * operator would do in any interface; spending 21 presses walking to the button is a
   * property of THIS one. Reporting only the total would let a long fixture string hide a
   * bad traversal, and reporting only the traversal would understate what the flow costs.
   */
  typed = 0;
  constructor(private readonly page: Page) {}

  /** Presses that were navigation or actuation rather than content. */
  get navigation(): number {
    return this.count - this.typed;
  }

  async press(key: string, times = 1): Promise<void> {
    for (let i = 0; i < times; i++) {
      this.count += 1;
      await this.page.keyboard.press(key);
    }
  }

  /** Characters typed into a focused field, counted one press each. */
  async type(text: string): Promise<void> {
    this.count += [...text].length;
    this.typed += [...text].length;
    await this.page.keyboard.type(text);
  }

  /**
   * Scroll the app's own scroller with a key, and wait for it to come to rest.
   *
   * The wait is not padding, and finding out why cost a red run. `HintTags` cancels hint
   * mode on any `scroll` event (capture phase, because the scroller is `MainContent` and a
   * bubbling document listener never sees a nested one) — correctly, since its chip
   * positions are a viewport snapshot. But the scroll event from a key arrives on a later
   * frame, so `End` immediately followed by `f` mounts the layer and then cancels it with
   * the scroll that is still in flight. An operator hitting both keys quickly loses the
   * layer the same way; here it just has to not be mistaken for the layer being broken.
   */
  async scrollWithKey(key: string): Promise<void> {
    await this.press(key);
    await expect.poll(async () => {
      const a = await this.page.evaluate(() => document.getElementById('main-content')?.scrollTop ?? -1);
      await new Promise((r) => setTimeout(r, 120));
      const b = await this.page.evaluate(() => document.getElementById('main-content')?.scrollTop ?? -1);
      return a === b;
    }, { timeout: 5_000 }).toBe(true);
  }

  /**
   * Tab until the focused element satisfies an in-page predicate, returning the number of
   * presses it took — or throwing with what focus landed on instead.
   *
   * Discovered rather than hard-coded, for two reasons. A hard-coded count would be an
   * assertion about the fixture's control count dressed up as an assertion about the
   * keyboard; and the number itself is the measurement this gate is for, so it has to
   * come out of the run.
   */
  async tabTo(predicate: string, what: string, limit = 200): Promise<number> {
    const before = this.count;
    /*
     * CHECK BEFORE PRESSING, or the instrument lies in the one direction that matters.
     * Pressing first meant a target that ALREADY had focus could only be found by walking
     * a full lap of the focus trap — so with the Modal autoFocus defect below fixed, the
     * disqualify walk reported EIGHT presses instead of zero and flow 1's headline total
     * went UP from 68 to 69 when the bug was repaired. MEASURED, both ways, during
     * adversarial verification. A cost meter that rises when a defect is fixed is worse
     * than no meter; zero presses has to be expressible.
     *
     * AND IT HAS TO WAIT FOR FOCUS TO SETTLE FIRST. Reading `activeElement` the instant a
     * dialog appears is a coin flip on the disqualify Modal: React has already honoured the
     * textarea's `autoFocus`, and the container's `requestAnimationFrame` steal is still in
     * flight. Checking without settling returned 0, the rAF then moved focus to the <div>,
     * and the reason was typed into nothing — 2 of 5 repeat runs failed on the terminal
     * `suppressed.length` assertion, a flake this pre-check introduced and this wait
     * removes. Not padding: `settleFocus` polls for two agreeing frames and gives up, so a
     * genuinely never-settling surface still gets measured rather than hanging.
     */
    await this.settleFocus();
    if (await this.satisfied(predicate)) return 0;
    for (let i = 1; i <= limit; i++) {
      await this.press('Tab');
      if (await this.satisfied(predicate)) return this.count - before;
    }
    throw new Error(
      `NOT KEYBOARD-REACHABLE: ${limit} Tab presses never focused ${what}. ` +
      `Focus ended on ${await describeActive(this.page)}.`,
    );
  }

  /**
   * Block until `document.activeElement` is the same element across two animation frames.
   *
   * Bounded and non-throwing on purpose: if a surface never settles that is a finding for
   * the assertion that follows to report, not something for this helper to decide.
   */
  private async settleFocus(frames = 12): Promise<void> {
    await this.page.evaluate((n) => new Promise<void>((resolve) => {
      let last: Element | null = null;
      let agreed = 0;
      let left = n;
      const tick = () => {
        const now = document.activeElement;
        agreed = now === last ? agreed + 1 : 0;
        last = now;
        if (agreed >= 2 || --left <= 0) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), frames);
  }

  /** Does `document.activeElement` satisfy the predicate right now? */
  private satisfied(predicate: string): Promise<boolean> {
    return this.page.evaluate((p) => {
      const el = document.activeElement as HTMLElement | null;
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      return !!el && new Function('el', `return ${p}`)(el) === true;
    }, predicate);
  }

  /**
   * The fast way in: Tab once to the skip link, Enter to jump the chrome.
   *
   * Not a convenience — it is the difference between 3 presses and 24. `AppLayout`'s own
   * comment counts 24 chrome stops (6 top bar, 17 sidebar, 1 collapse) before page
   * content on every route, re-paid on every navigation. Every flow below starts here, so
   * the numbers reported are the best case the shell offers, not a worst case.
   */
  async enterMain(): Promise<void> {
    await this.press('Tab');
    await expect(this.page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await this.press('Enter');
    // POLLED because the link is a plain fragment anchor: the browser — not React Router —
    // navigates and then moves focus to the `tabIndex={-1}` <main>, and that can land on a
    // later task. It also fails loudly and for the right reason when something on the page
    // STEALS the Enter — measured while mutation-testing this file, where making
    // BdPipeline's window-level Enter handler always find a selected lead sent the skip
    // link to a lead detail page instead. That is a live hazard on the queue, not only
    // under a mutation: with a row selected, `case 'Enter'` calls preventDefault before the
    // anchor's default can run.
    await expect
      .poll(() => this.page.evaluate(() => document.activeElement?.id), { timeout: 5_000 })
      .toBe('main-content');
  }
}

const describeActive = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return 'nothing';
  const name = el.getAttribute('aria-label') || (el.textContent ?? '').trim().slice(0, 40) || el.getAttribute('placeholder') || '';
  return `<${el.tagName.toLowerCase()}> "${name}"`;
});

/** Report a measurement so a green run still says what it measured. */
function record(label: string, value: string | number): void {
  test.info().annotations.push({ type: 'keyboard-day', description: `${label}: ${value}` });
  // eslint-disable-next-line no-console
  console.log(`[keyboard-day] ${label}: ${value}`);
}

/** Open a surface, seated, guarded, with the pointer recorder armed. */
async function seat(page: Page): Promise<Keys> {
  await takeSeat(page);
  await keyboardOnly(page);
  return new Keys(page);
}

/* ══════════════════════════ FLOW 1 — TRIAGE THE DESK ═════════════════════ */

test('flow 1/5 — triage the desk: navigate, walk the queue, peek, disqualify', async ({ page }) => {
  const keys = await seat(page);
  await page.route('**/v1/projects?*', (r) =>
    r.fulfill(json({ data: Array.from({ length: QUEUE_ROWS }, (_, i) => lead(i)), meta: meta(QUEUE_ROWS) })));
  const suppressed: Array<{ id: string; reason: unknown }> = [];
  await page.route('**/v1/projects/*/suppress', async (route) => {
    const url = new URL(route.request().url());
    suppressed.push({
      id: url.pathname.split('/').filter(Boolean).slice(-2)[0]!,
      reason: (route.request().postDataJSON() as { reason?: unknown } | null)?.reason,
    });
    await route.fulfill(json({ data: { ok: true } }));
  });

  // Start on the desk, and get to the queue the way the motion model says to: `g` then a
  // digit. ⌘1-9 are never delivered to a webview (src/lib/navGrammar.ts measured zero
  // keydowns for a real ⌘2), so this prefix grammar is the only workspace jump there is.
  await page.goto('/');
  await expect(page.getByText(/NOT LEGAL ADVICE/i).first()).toBeVisible({ timeout: 15_000 });
  await keys.press('g');
  await keys.press('2');
  await expect(page).toHaveURL(/\/bd-pipeline$/);
  await expect(page.locator('[data-list-row]').first()).toBeVisible({ timeout: 15_000 });
  record('g→2 reached the sales engine in presses', 2);

  await keys.enterMain();
  const toTable = await keys.tabTo(`el.hasAttribute('data-list-row')`, 'the ranked queue');
  record('Tab presses from <main> to the first queue row', toTable);

  // Walk the ranked table. Row focus IS the selection on this surface, so the arrows have
  // to move both — a highlight that drifts from focus is what let `d` disqualify row 2
  // while the operator was looking at row 5.
  await keys.press('ArrowDown', 2);
  const cursor = await page.evaluate(() => document.activeElement?.getAttribute('data-lead-id'));
  expect(cursor, 'the arrows did not leave focus on a queue row').toBeTruthy();

  // Space PEEKS, Enter OPENS — the distinction TriageBar advertises and which both fired
  // at once before Phase 7. One press must produce exactly one layer.
  await keys.press(' ');
  const peek = page.locator('[role="dialog"]');
  await expect(peek).toHaveCount(1);

  /*
   * AND THE VERBS MUST GO QUIET WHILE IT IS UP. `d` under an open overlay is the exact
   * defect Phase 4 fixed — `s`/`d`/`e` and `1`-`4` stayed live on the selected lead
   * underneath an inspector, the manual, a dossier or the hint layer — and the fix is one
   * `isOverlayOpen()` line in BdPipeline's window listener. It is asserted here rather than
   * assumed because it was MEASURED not to be: deleting that line left every one of this
   * file's eleven tests green (adversarial verification, mutation M3), so the flow walked
   * straight past the guard it depends on. One extra press, and it buys the guard.
   */
  await keys.press('d');
  await expect(page.getByRole('dialog', { name: 'Disqualify lead' })).toHaveCount(0);
  await expect(peek, 'a single-letter verb opened a second layer under the peek').toHaveCount(1);

  // And Escape closes exactly one thing and hands focus back to the row it came from.
  // Focus restoration is what makes a peek cheap: dropping to <body> would restart Tab at
  // the top of the document and cost the operator the 17 presses again.
  await keys.press('Escape');
  await expect(peek).toHaveCount(0);
  // POLLED, not read once. `lib/dismiss.ts` hands focus back on a scheduled flush rather
  // than inside the Escape handler, so a single synchronous read races it — this assertion
  // failed exactly once, under parallel load, before the poll went in. A poll is not a
  // weakening: if restoration never happens, it still fails, with the same message.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-lead-id')), { timeout: 5_000 })
    .toBe(cursor);

  // `d` — a live single-letter verb on this surface — opens the disqualify dialog.
  await keys.press('d');
  await expect(page.getByRole('dialog', { name: 'Disqualify lead' })).toBeVisible();

  /*
   * AND HERE IS THE SEAM. The textarea carries `autoFocus`, but `Modal` focuses its own
   * container on a requestAnimationFrame (src/components/ui/Modal.tsx), which lands after
   * React has honoured the autofocus — so the dialog opens with focus on a <div> and the
   * next thing the operator types is dropped on the floor. Pinned as a defect in its own
   * right by "the disqualify dialog eats the first characters" below; here the flow just
   * pays the cost, because the cost is the number this gate is for.
   */
  const toReason = await keys.tabTo(`el.tagName === 'TEXTAREA'`, 'the disqualify reason field');
  record('Tab presses inside the disqualify dialog to reach its only required field', toReason);

  const REASON = 'Probe reason typed on the keyboard';
  await keys.type(REASON);
  await keys.press('Meta+Enter');

  await expect.poll(() => suppressed.length, { timeout: 5_000 }).toBe(1);
  // The subject is the row the CURSOR was on — not the first row, not the row a stale
  // highlight was pointing at.
  expect(suppressed[0]!.id).toBe(cursor);
  // And the reason is the one the fingers produced, character for character.
  expect(suppressed[0]!.reason).toBe(REASON);

  record('TOTAL presses to triage one lead to a write', `${keys.count} (${keys.navigation} navigation + ${keys.typed} typed)`);
  /*
   * Honest about the write path: disqualify posts to `/v1/projects/:id/suppress`, not
   * through `/v1/actions/:id/invoke`. Triage is the one of the five flows whose terminal
   * write is not a registry action, so this is the request that exists to be asserted.
   */
  await assertNoTrackpad(page);
});

/* ═══════════════════ FLOW 2 — DECIDE A GATED DECISION ════════════════════ */

test('flow 2/5 — decide a gated decision through the governed path', async ({ page }) => {
  const keys = await seat(page);
  await stubCommandDeck(page);
  const invokes = await captureInvokes(page);

  await page.goto('/command-deck');
  await expect(page.getByText('Probe gated decision')).toBeVisible({ timeout: 15_000 });

  await keys.enterMain();
  const toDecide = await keys.tabTo(`el.tagName === 'BUTTON' && el.textContent === 'Decide'`, 'the Decide control');
  record('Tab presses from <main> to Decide on the command deck', toDecide);

  // Enter opens the inline field, which autofocuses — no Modal to fight here, so the
  // operator types straight into it. That asymmetry with the disqualify dialog is why the
  // press counts differ by an order of magnitude.
  await keys.press('Enter');
  await expect(page.getByPlaceholder('The chosen option…')).toBeFocused();

  const CHOSEN = 'Probe option chosen by keyboard';
  await keys.type(CHOSEN);
  await keys.press('Enter');

  await expect.poll(() => invokes.length, { timeout: 5_000 }).toBe(1);
  const inv = invokes[0]!;
  // The whole flow, in four assertions: the right governed action, on the right subject
  // type, against the decision the keyboard was parked on, carrying what was typed.
  expect(inv.actionId).toBe('command_decide');
  expect(inv.subjectType).toBe('command_decision');
  expect(inv.subjectId).toBe(DECISION.id);
  expect(inv.params.chosen).toBe(CHOSEN);
  // Nothing was overridden. A decide that quietly carried `overrideSat` would pass a
  // "the flow completed" test and be a governance failure.
  expect(inv.params.overrideSat, 'the keyboard path set an override nobody asked for').toBeUndefined();

  record('TOTAL presses to record a gated decision', `${keys.count} (${keys.navigation} navigation + ${keys.typed} typed)`);
  await assertNoTrackpad(page);
});

test('flow 2 fast path — `f` collapses the deck traversal from eleven presses to four', async ({ page }) => {
  const keys = await seat(page);
  await stubCommandDeck(page);
  await page.goto('/command-deck');
  await expect(page.getByText('Probe gated decision')).toBeVisible({ timeout: 15_000 });

  await keys.enterMain();
  const fromMain = keys.count;
  // The hint layer snapshots the VIEWPORT, so the control has to be on screen first. End
  // scrolls the app's own scroller (`MainContent`, not the window) because focus is inside
  // it — which is also why the layer listens for scroll in the capture phase.
  await keys.scrollWithKey('End');
  // SETTLE, DON'T SLEEP (P8): on a slow runner the smooth scroll is still moving when the box is read and the chip lands
  // elsewhere — this spec failed on 83af9c4 and 8fc1206 that way and passed on rerun both times. Wait until the scroller's
  // scrollTop is unchanged across two animation frames; bounded by the assertion's own timeout, never a fixed sleep.
  await page.waitForFunction(() => new Promise((res) => {
    const sc = document.querySelector('main') ?? document.scrollingElement;
    const a = sc?.scrollTop ?? 0;
    requestAnimationFrame(() => requestAnimationFrame(() => res((sc?.scrollTop ?? 0) === a)));
  }), undefined, { timeout: 5_000 });
  const box = await page.getByRole('button', { name: 'Decide' }).first().boundingBox();
  expect(box, 'Decide never came into view, so `f` could not tag it').toBeTruthy();

  await keys.press('f');
  await expect(page.locator('[data-hint-tag]').first()).toBeVisible();

  /*
   * The tag is READ OFF THE SCREEN, exactly as the operator reads it — not computed by
   * re-implementing `tagsFor` here, which would test this spec's arithmetic instead of the
   * app's. Chips sit at their target's top-left and overlap resolution only ever pushes
   * them DOWN, so the left edge is exact; `hints.spec.ts` established the same match.
   * Exactly one candidate is required: two would mean the tag typed might belong to a
   * neighbouring control, and a green run would prove nothing about Decide.
   */
  const candidates = await page.evaluate((r) => Array.from(document.querySelectorAll('[data-hint-tag]'))
    .filter((chip) => {
      const c = chip.getBoundingClientRect();
      return Math.abs(c.left - Math.max(0, r.x)) < 1.5 && c.top >= Math.max(0, r.y) - 1.5 && c.top < Math.max(0, r.y) + 16;
    })
    .map((chip) => chip.getAttribute('data-hint-tag')!), box!);
  expect(candidates, `expected one chip beside Decide, got ${JSON.stringify(candidates)}`).toHaveLength(1);

  for (const ch of candidates[0]!) await keys.press(ch);
  // Activation happens in the layer's unmount, so the proof is the surface changing: the
  // inline decide field is open and focused.
  await expect(page.getByPlaceholder('The chosen option…')).toBeFocused();

  // End + f + the two tag characters. Compare against the Tab distance flow 2/5 prints for
  // the same destination (9-10 Tab presses, plus the Enter that arms the field — the count
  // moves with how many of the deck's lazy panels have resolved, which is why neither test
  // hard-codes it). This is the one place in the five flows where the mechanism the plan
  // built for this problem is actually available, and it is worth roughly 3x.
  record('presses from <main> to an armed decide field via the hint layer', keys.count - fromMain);
  await assertNoTrackpad(page);
});

/* ═══════════════════════ FLOW 3 — RECORD AN RFI ══════════════════════════ */

test('flow 3/5 — record an RFI on a partner', async ({ page }) => {
  const keys = await seat(page);
  await page.route('**/v1/command/partners', (r) => r.fulfill(json({ data: [PARTNER], meta: meta() })));
  await page.route('**/v1/command/deep', (r) => r.fulfill(json({ data: COMMAND_DEEP, meta: meta() })));
  const invokes = await captureInvokes(page);

  await page.goto('/command-partners');
  const nameButton = page.getByRole('button', { name: PARTNER.name });
  await expect(nameButton).toBeVisible({ timeout: 15_000 });

  await keys.enterMain();
  // Addressed by the name the operator reads off the row. Naming the object is not the
  // same as asserting a fixture value — the assertions at the end are about the request.
  const toPartner = await keys.tabTo(
    `el.tagName === 'BUTTON' && el.textContent === ${JSON.stringify(PARTNER.name)}`,
    'the partner name',
  );
  record('Tab presses from <main> to the partner', toPartner);

  await keys.press('Enter');
  const dossier = page.getByRole('dialog', { name: /Partner dossier/ });
  await expect(dossier).toBeVisible();
  // The dossier is a trap-confined dialog, and it does NOT move focus into itself on open
  // — focus is still on the trigger behind the backdrop. `lib/dismiss.ts` covers for that
  // on the first Tab (focus outside the container is pulled to its first tabbable), which
  // is why the walk below works at all.
  await expect(nameButton).toBeFocused();

  // Wait for the RFI section before counting: it renders on a second fetch, and a walk
  // started early measures a drawer with one control in it.
  const recordButton = page.getByRole('button', { name: /Record RFI/ });
  await expect(recordButton).toBeVisible();

  const toFirstField = await keys.tabTo(
    `el.tagName === 'INPUT' && el.closest('label') !== null`,
    'the first RFI field',
  );
  record('Tab presses from the dossier to its first RFI field', toFirstField);

  const VALUE = '17 bps typed by hand';
  await keys.type(VALUE);

  const toRecord = await keys.tabTo(`el.tagName === 'BUTTON' && /Record RFI/.test(el.textContent || '')`, 'Record RFI');
  record('Tab presses from the first RFI field to Record RFI (20 fields + the status select)', toRecord);
  await keys.press('Enter');

  await expect.poll(() => invokes.length, { timeout: 5_000 }).toBe(1);
  const inv = invokes[0]!;
  expect(inv.actionId).toBe('command_rfi_record');
  expect(inv.subjectType).toBe('command_partner');
  expect(inv.subjectId).toBe(PARTNER.id);
  // The values map is asserted by its CONTENT, not its key: exactly one field was filled,
  // and what it carries is the string the fingers produced. The key is the fixture's.
  const values = inv.params.values as Record<string, string>;
  expect(Object.keys(values), 'the governed write carried more or fewer fields than were typed').toHaveLength(1);
  expect(Object.values(values)[0]).toBe(VALUE);

  record('TOTAL presses to record one RFI field', `${keys.count} (${keys.navigation} navigation + ${keys.typed} typed)`);
  await assertNoTrackpad(page);
});

test('flow 3 finding — `f` does not arm inside the dossier, so the 20-field form has no fast path', async ({ page }) => {
  const keys = await seat(page);
  await page.route('**/v1/command/partners', (r) => r.fulfill(json({ data: [PARTNER], meta: meta() })));
  await page.route('**/v1/command/deep', (r) => r.fulfill(json({ data: COMMAND_DEEP, meta: meta() })));
  await page.goto('/command-partners');
  await expect(page.getByRole('button', { name: PARTNER.name })).toBeVisible({ timeout: 15_000 });

  await keys.enterMain();
  await keys.tabTo(`el.tagName === 'BUTTON' && el.textContent === ${JSON.stringify(PARTNER.name)}`, 'the partner name');
  await keys.press('Enter');
  await expect(page.getByRole('button', { name: /Record RFI/ })).toBeVisible();

  /*
   * NOT A DEFECT — a documented trade, measured here because the plan's Phase 4 gate
   * leans on it. `useHints` stands `f` down while `isOverlayOpen()`, deliberately: a
   * motion key inside a dialog would tag the page BEHIND the backdrop, where Tab is
   * trapped away from it. The hook's own comment justifies that with "two overlays' worth
   * of controls is 2-3 Tab stops, which is not the problem this layer exists to solve".
   *
   * On this drawer it is 24 stops, not 2-3 — so the surface with by far the worst
   * keyboard cost in the five flows is precisely the one the mechanism built to fix it
   * cannot see. That is the finding, and it is asserted rather than narrated so it cannot
   * quietly change.
   */
  await keys.press('f');
  await expect(page.locator('[data-hint-tag]')).toHaveCount(0);
  record('hint chips available inside the partner dossier', 0);
  await assertNoTrackpad(page);
});

/* ═══════════════════════ FLOW 4 — ADVANCE A LISTING ══════════════════════ */

test('flow 4/5 — advance a listing through the governed path', async ({ page }) => {
  const keys = await seat(page);
  await page.route('**/v1/distribution/deep', (r) => r.fulfill(json({ data: DIST_DEEP, meta: meta() })));
  const invokes = await captureInvokes(page);

  await page.goto('/distribution/listings');
  await expect(page.getByText(DIST_SURFACE.name)).toBeVisible({ timeout: 15_000 });

  await keys.enterMain();
  // The predicate keys off an option value from the page's own STATUSES constant, so it
  // finds the lifecycle select without depending on which status the fixture set.
  const toSelect = await keys.tabTo(
    `el.tagName === 'SELECT' && Array.from(el.options).some((o) => o.value === 'ranked')`,
    'the listing status select',
  );
  record('Tab presses from <main> to the listing status select', toSelect);

  /*
   * `l` — TYPEAHEAD, not an arrow, and the difference is a finding.
   *
   * MEASURED in this browser: ArrowDown on a focused, closed <select> does not change its
   * value and fires no `change`, so the "↑ ↓ to move, ⏎ to open" grammar the terminal
   * teaches everywhere else does not operate the one control this flow ends in. What does
   * work is typing the first letter of the option, which is a different motion the manual
   * does not mention. The flow completes; the vocabulary is inconsistent.
   */
  await keys.press('l');

  await expect.poll(() => invokes.length, { timeout: 5_000 }).toBe(1);
  const inv = invokes[0]!;
  expect(inv.actionId).toBe('dist_listing_set_status');
  expect(inv.subjectType).toBe('dist_listing');
  expect(inv.subjectId).toBe(DIST_SURFACE.id);
  // 'live' is the option the typed character selected — the app's own STATUSES list, not
  // the fixture's stored status.
  expect(inv.params.status).toBe('live');

  record('TOTAL presses to advance a listing', `${keys.count} (${keys.navigation} navigation + ${keys.typed} typed)`);
  await assertNoTrackpad(page);
});

test('flow 4 finding — ArrowDown does not operate a status select', async ({ page }) => {
  const keys = await seat(page);
  await page.route('**/v1/distribution/deep', (r) => r.fulfill(json({ data: DIST_DEEP, meta: meta() })));
  const invokes = await captureInvokes(page);
  await page.goto('/distribution/listings');
  await expect(page.getByText(DIST_SURFACE.name)).toBeVisible({ timeout: 15_000 });

  await keys.enterMain();
  await keys.tabTo(
    `el.tagName === 'SELECT' && Array.from(el.options).some((o) => o.value === 'ranked')`,
    'the listing status select',
  );
  const select = page.locator('select').first();
  const start = await select.inputValue();
  await keys.press('ArrowDown', 3);

  /* THE INVARIANT IS "NO WRITE", NOT "NO MOVEMENT" — and the difference is why this
   * spec spent two phases green on a Mac while the defect was live.
   *
   * The original assertion here was `inputValue() === start`, justified as "no value
   * change, therefore no change event, therefore no governed write". That reasoning
   * described macOS, not this app: Chrome and WKWebView on macOS open the popup on an
   * arrow and fire `change` only on commit, so the OS satisfied the assertion. On
   * Linux the arrow advances the selection immediately, and CI run 30175719316 duly
   * reported `three ArrowDowns produced a governed write`.
   *
   * Whether the DISPLAYED selection moves is therefore a property of the engine, and
   * pinning it would be pinning the platform. What must hold everywhere is that no
   * governed write happened, and that if the displayed value did move, the operator is
   * TOLD it is not the value in the record — a control silently disagreeing with the
   * record it represents is the defect this whole programme keeps finding. */
  const moved = (await select.inputValue()) !== start;
  expect(invokes, 'three ArrowDowns produced a governed write').toHaveLength(0);
  if (moved) {
    await expect(
      page.getByText(/to apply/i).first(),
      'the arrow moved the displayed status with nothing on screen saying it is unsaved',
    ).toBeVisible();
    // And backing out must return the control to the record's value.
    await keys.press('Escape');
    expect(await select.inputValue(), 'esc did not discard the staged status').toBe(start);
  }
  expect(invokes, 'discarding a staged status produced a governed write').toHaveLength(0);
  record('governed writes produced by 3 ArrowDown on a focused select', 0);
  record('arrow moves the displayed selection on this engine', moved ? 'yes (staged)' : 'no (popup opens)');
  await assertNoTrackpad(page);
});

/* ═════════════════ FLOW 5 — LAUNCH A CAMPAIGN THROUGH ITS GATE ═══════════ */

test('flow 5/5 — launch a campaign, get refused by the compliance gate, override with a reason', async ({ page }) => {
  const keys = await seat(page);
  await page.route('**/v1/distribution/deep', (r) => r.fulfill(json({ data: DIST_DEEP, meta: meta() })));
  await page.route('**/v1/distribution/campaigns', (r) => r.fulfill(json({ data: [CAMPAIGN], meta: meta() })));
  // The pricing engines are left to fail, which is their honest degraded state here and
  // keeps the fixture out of the numbers the panel renders.
  await page.route('**/v1/distribution/engines/**', (r) => r.abort());

  /*
   * The server REFUSES the first launch. This is the point of the flow: "through its
   * gate" means the gate has to actually fire, and a stub that returns 200 would test a
   * campaign that was never gated at all.
   */
  const invokes = await captureInvokes(page, (inv) =>
    inv.params.overrideGate === true
      ? { status: 200, body: { data: { action: inv.actionId, result: {} } } }
      : {
        status: 409,
        body: {
          error: 'Campaign launch blocked: reward spend requires a premortem and a legal check',
          code: 'COMPLIANCE_GATE',
          blockers: ['premortem missing', 'legal_check missing'],
        },
      });

  const dialogs: string[] = [];
  const OVERRIDE_REASON = 'Accepting the risk with counsel on the call';
  page.on('dialog', async (d) => {
    dialogs.push(d.type());
    // NOT A KEYPRESS, and that is the finding. See the note below.
    await d.accept(OVERRIDE_REASON);
  });

  await page.goto('/distribution/campaigns');
  await expect(page.getByText(CAMPAIGN.name)).toBeVisible({ timeout: 15_000 });

  await keys.enterMain();
  const toLifecycle = await keys.tabTo(
    `el.tagName === 'SELECT' && Array.from(el.options).some((o) => o.value === 'measured')`,
    'the campaign lifecycle select',
  );
  record('Tab presses from <main> to the campaign lifecycle select', toLifecycle);

  await keys.press('l'); // typeahead → 'live'

  await expect.poll(() => invokes.length, { timeout: 5_000 }).toBe(2);

  // The keyboard reached the governed path CLEAN first — no override smuggled in.
  const first = invokes[0]!;
  expect(first.actionId).toBe('dist_campaign_set_status');
  expect(first.subjectType).toBe('dist_campaign');
  expect(first.subjectId).toBe(CAMPAIGN.id);
  expect(first.params.status).toBe('live');
  expect(first.params.overrideGate).toBeUndefined();

  // Then, having been refused, it re-issued the SAME action with the override and the
  // reason attached — the audited remedy, not a second write path.
  const second = invokes[1]!;
  expect(second.actionId).toBe('dist_campaign_set_status');
  expect(second.subjectId).toBe(CAMPAIGN.id);
  expect(second.params.status).toBe('live');
  expect(second.params.overrideGate).toBe(true);
  expect(second.params.overrideReason).toBe(OVERRIDE_REASON);

  /*
   * FLOW 5 IS THE ONE THIS GATE DOES NOT PASS CLEANLY, and the assertion below is what
   * says so rather than a comment.
   *
   * The gate's remedy is a native `window.prompt` (src/pages/DistributionCampaigns.tsx).
   * A native dialog is keyboard-operable by the OS, so the flow is completable — but it
   * is completable OUTSIDE the terminal's keyboard model, and every property the model
   * promises is absent inside it: it is not on the one Escape stack (`lib/dismiss.ts`),
   * the hint layer cannot tag it, the `?` manual cannot name it, no focus is restored
   * when it closes, and it blocks the renderer while it is up. It is also the reason this
   * test needs `dialog.accept(text)` — a Playwright API, not `page.keyboard` — for the
   * one step in five flows that keys cannot drive. Counting it as a pass would be the
   * "3/5 reported as 5/5" outcome the brief warns about, so the press count below
   * deliberately EXCLUDES the reason: those keystrokes are not the app's.
   */
  expect(dialogs, 'the compliance remedy was expected to be a native prompt').toEqual(['prompt']);
  record('presses inside the app to launch a campaign and clear its gate', `${keys.count} (all navigation)`);
  record('override reason keystrokes NOT counted (native window.prompt, outside the app)', OVERRIDE_REASON.length);
  await assertNoTrackpad(page);
});

/* ════════════════════════════ THE FINDINGS ═══════════════════════════════ */

/**
 * DEFECT 1 — the disqualify dialog eats the first characters typed into it.
 *
 * `test.fail()` rather than a plain assertion of the broken behaviour, and the choice
 * matters. Asserting "the textarea is empty after typing" would go GREEN on a defect and
 * RED when someone fixed it, which is the same inversion as narrowing an assertion until
 * it passes. Marked expected-to-fail, this runs the operator's real sequence, is reported
 * as a known failure, and turns the suite red the moment the bug is fixed — at which
 * point the annotation comes off. The suite stays honest in both directions.
 */
test('DEFECT — pressing `d` then typing a reason does not disqualify anything', async ({ page }) => {
  // UN-PINNED. Fixed: Modal now claims container focus only when focus is not already
  // inside it, so an autofocused child keeps it. The dialog stream also found a SECOND
  // defect underneath — React applies `autoFocus` in the commit's mutation phase, before
  // `pushDismissible` snapshots the focus origin in a passive effect, so the origin was the
  // textarea itself: a node unmounted moments later, which made `flushRestore` bail and drop
  // focus to `<body>`. Both fixed; this now asserts the working behaviour.
  const keys = await seat(page);
  await page.route('**/v1/projects?*', (r) =>
    r.fulfill(json({ data: Array.from({ length: QUEUE_ROWS }, (_, i) => lead(i)), meta: meta(QUEUE_ROWS) })));
  const suppressed: string[] = [];
  await page.route('**/v1/projects/*/suppress', async (route) => {
    suppressed.push(route.request().url());
    await route.fulfill(json({ data: { ok: true } }));
  });
  await page.goto('/bd-pipeline');
  await expect(page.locator('[data-list-row]').first()).toBeVisible({ timeout: 15_000 });

  await keys.enterMain();
  await keys.tabTo(`el.hasAttribute('data-list-row')`, 'the ranked queue');
  await keys.press('ArrowDown');
  await keys.press('d');
  await expect(page.getByRole('dialog', { name: 'Disqualify lead' })).toBeVisible();

  // Exactly what an operator does: the dialog is up, the only field is visibly marked
  // "Reason (required)…", so they type. The keystrokes land on a <div>.
  await keys.type('Dead project');
  await keys.press('Meta+Enter');
  await expect.poll(() => suppressed.length, { timeout: 3_000 }).toBe(1);
});

/**
 * DEFECT 2 — the command line cannot reach most of the registry.
 *
 * Phase 3's gate: "every governed action in the registry is invocable keyboard-only, in
 * under 5 seconds, from anywhere in the app". It is false, and the cause is a type-name
 * seam rather than a missing feature: ⌘K resolves a noun through `INSPECTOR_TO_OBJECT`,
 * which only ever yields the eleven `ObjectType` names, while the registry addresses
 * subjects as `command_decision`, `command_partner`, `dist_listing`, `dist_campaign`, …
 * `matchesSubject` compares them literally, so no noun the command line can produce ever
 * matches. Four of this file's five flows end in an action on that list — which is why
 * every flow above reaches its control by traversing the page instead.
 *
 * MEASURED IN THE BROWSER rather than argued from the source. The nouns are the five
 * inspector types `GET /v1/search` can actually emit, read out of the API route so this
 * cannot assert a stale list; each is put through ⌘K for real and the offered verbs are
 * read off the rendered listbox. Blocked-but-offered verbs COUNT as reached: the question
 * here is reachability, not entitlement, and conflating the two would understate the
 * finding's precision.
 */
test('⌘K reachability, as this stubbed harness measures it', async ({ page }) => {
  // UN-PINNED. Fixed: `GET /v1/search` now states the registry's own `subjectType` per
  // group, so a noun arrives already speaking the language the actions are written in.
  // Re-measured in a running browser: 20 of 22, up from 7. The two that remain are benign
  // and verified rather than assumed — `dist_campaign_create` has no subject by design, and
  // `command_reopen_decision` needs a `decided` decision while every seeded one is `open`.
  //
  // NOT claimed: that the mismatch is now structurally impossible. `subjectTypes` is
  // `string[]`, so a one-character typo compiles silently — proven, with `tsc` staying quiet
  // while the app offered an empty verb menu. It is caught loudly in both directions by
  // `apps/api/src/routes/__tests__/searchActionBoundary.test.ts`, which is a weaker and true
  // claim. A shared literal union in `packages/shared` would earn the stronger one.
  const keys = await seat(page);

  const manifestSrc = readFileSync(join(WEB_SRC, 'lib', 'command', 'generated', 'actionManifest.ts'), 'utf8');
  const start = manifestSrc.indexOf('ActionManifest = {') + 'ActionManifest = '.length;
  const end = manifestSrc.lastIndexOf('} as const');
  expect(start, 'actionManifest.ts no longer has the shape this spec reads').toBeGreaterThan(0);
  const manifest = JSON.parse(manifestSrc.slice(start, end + 1)) as {
    actions: Array<{ id: string; label: string }>;
  };
  const idByLabel = new Map(manifest.actions.map((a) => [a.label, a.id]));
  expect(idByLabel.size, 'two actions share a label, so the label→id map is ambiguous').toBe(manifest.actions.length);

  // Reads the CURRENT shape of search.ts, not the one this test was written against.
  //
  // It used to match a `grp('key', 'Label', 'inspector')` helper. The seam fix replaced that
  // with a `SEARCH_GROUPS` array of objects — so this regex stopped matching, the assertion
  // below fired, and because the whole test was `test.fail(true)` THE SUITE READ GREEN. A
  // pinned defect test that dies for the wrong reason does not merely stop measuring; it
  // destroys the signal that would tell you the defect is fixed. Same failure mode as the
  // Phase D guards that could never fail, arrived at from the opposite direction.
  const searchSrc = readFileSync(join(API_SRC, 'routes', 'search.ts'), 'utf8');
  // Read the (inspector, subjectType) PAIR, because the stub below has to mirror the real
  // route and the route now states both. Reading only the inspector is what made this
  // measurement report 15/22 while a browser against the real route measured 20/22: the
  // stub was emitting the pre-fix shape, so the command line resolved every noun through
  // the old INSPECTOR_TO_OBJECT path and the fix was invisible to the very test built to
  // detect it. A test that stubs the thing it measures has to be re-derived from the
  // thing, or it measures its own fixture — the defect this file's own header warns about.
  // ── WHY THE STUB REACHED 7 WHERE A BROWSER REACHED 20 — ANSWERED 2026-09-02 ──────────
  // The old regex demanded `subjectType: 'x', inspector: 'y'` ON ONE LINE. Five groups are
  // written that way (projects, contacts, deals, documents, signals). The other eleven —
  // command_task/decision/partner/requirement/blocker, dist_listing/campaign, access_request,
  // member, marketing_asset — declare `subjectType` on its own line, some with no `inspector` at
  // all. So this harness never emitted eleven of sixteen nouns and measured its own parser. Read
  // per GROUP BLOCK instead: from each `key: '…'` to the next, take `subjectType` (required) and
  // `inspector` (optional, mirrored the way the route mirrors it — absent means absent).
  const blocks = searchSrc.split(/\n\s*\{\s*\n\s*key:\s*'/).slice(1);
  const pairs = blocks.flatMap((b) => {
    const st = /subjectType:\s*'([a-z_]+)'/.exec(b);
    if (!st) return [];
    const ins = /inspector:\s*'([a-z_]+)'/.exec(b);
    return [{ subjectType: st[1]!, inspector: ins ? ins[1]! : st[1]! }];
  });
  expect(pairs.length, 'GET /v1/search no longer declares `subjectType` beside `inspector` per group — this measurement is reading a shape that no longer exists, which is how it silently stopped measuring once before').toBeGreaterThan(0);
  const inspectors = pairs.map((x) => x.inspector);
  record('object types GET /v1/search can emit', inspectors.join(', '));

  const subjectTypeFor = (ins: string) => pairs.find((x) => x.inspector === ins)!.subjectType;
  let inspector = inspectors[0]!;
  await page.route('**/v1/search?*', (r) => r.fulfill(json({
    data: {
      q: 'probe',
      groups: [{
        key: 'probe', label: 'Probe', inspector, subjectType: subjectTypeFor(inspector), count: 1,
        // No `seed`, on purpose: `preconditionMet` treats unknown state as SATISFIED, so
        // an unseeded noun is offered the LARGEST legal verb set. Measuring the ceiling.
        items: [{ id: `probe-${inspector}`, label: `Probe ${inspector} object` }],
      }],
    },
    meta: meta(),
  })));

  await page.goto('/');
  await expect(page.getByText(/NOT LEGAL ADVICE/i).first()).toBeVisible({ timeout: 15_000 });

  const reached = new Set<string>();
  for (const [i, type] of inspectors.entries()) {
    inspector = type;
    await keys.press('Meta+k');
    await expect(page.getByRole('dialog', { name: 'Command line' })).toBeVisible();
    // A distinct query per type so neither the 200ms debounce nor the read cache can
    // serve the previous type's group back.
    await keys.type(`probe${'x'.repeat(i)}`);
    const row = page.getByRole('button').filter({ hasText: `Probe ${type} object` });
    await expect(row).toBeVisible({ timeout: 8_000 });
    // The object row is the first result: no command code matches "probe…", and no static
    // page or seeded datum does either. Enter advances noun → verb.
    await keys.press('Enter');
    const verbs = page.getByRole('option');
    await expect(verbs.first()).toBeVisible();
    for (const label of await verbs.evaluateAll((els) => els.map((el) => (el.querySelector('span span')?.textContent ?? '').trim()))) {
      const id = idByLabel.get(label);
      if (id) reached.add(id);
    }
    await keys.press('Escape'); // verb stage → noun stage
    await keys.press('Escape'); // command line closed
    await expect(page.getByRole('dialog', { name: 'Command line' })).toHaveCount(0);
  }

  const missing = manifest.actions.map((a) => a.id).filter((id) => !reached.has(id)).sort();
  record('registry actions reachable from ⌘K', `${reached.size}/${manifest.actions.length}`);
  record('unreachable from ⌘K', missing.join(', '));
  await assertNoTrackpad(page);
  // A CHARACTERIZATION ASSERTION, and the disagreement it records is the point.
  //
  // A browser driving the REAL route measured 20 of 22 reachable after the seam fix. This
  // harness, which STUBS `/v1/search`, reaches 7 — even after the stub was re-derived to
  // emit `subjectType` exactly as the route now does. Both numbers were produced by running
  // something; they disagree, and I have not found why. Three dishonest options were
  // available and all are refused: assert `[]` and leave the suite red on a fixed defect;
  // re-pin `test.fail(true)`, which is the trap this same test just fell into when it
  // silently stopped measuring; or quote the browser's 20 here, where it was not measured.
  //
  // ── UPDATED 2026-08-03, AND WHICH WAY IT MOVED ────────────────────────────────
  // The pin is on `missing.length`, so the old `15` meant SEVEN reachable of 22 — not
  // fifteen. The prose above said "measures 15" and that was the confusing half of a true
  // sentence; it now says 7, which is what the number in the failure message computes.
  //
  // The registry then grew from 22 actions to 30 while the marketing compartment was built
  // (`marketing_embargo_enter`, `marketing_embargo_lift`, `marketing_holdings_declare` among
  // them). Every one of the eight new actions is unreachable HERE, so `missing` moved 15 → 23
  // while reachability held flat at exactly seven:
  //   assign, create_task, flag_review, notify, track, watchlist_add, watchlist_remove
  // — the project-scoped verbs, which are the only ones this stub's single noun can aim.
  //
  // So reachability did NOT regress; the denominator grew. Stated because "23 unreachable"
  // reads like a collapse and is not one, and because the next person to see this go red
  // deserves to know which of the two numbers moved.
  //
  // The marketing actions SHOULD be reachable against the real route: `embargo` is a
  // `server_search` noun on the `marketing_assets` group (marketingGrammar.ts). They are
  // absent here because this spec's stub emits one group per query and never emits that one.
  // That is a limitation of the harness, not a gap in the palette, and the browser number
  // above is the one that would show it.
  //
  // So it pins what THIS harness observes. Improve reachability and it goes red demanding a
  // new number; regress it and it goes red too. What it does NOT do is claim 15 is correct.
  //
  // ── CHECKED AGAIN 2026-08-03 (the wiring pass) AND IT DID NOT MOVE ────────────
  // Five lanes landed a holdings register, a retention ruling, an Art 90 need-to-know
  // split, a GPS input desk and a DPIA gate. NO GOVERNED ACTION WAS ADDED OR REMOVED:
  // `npm run gen:actions` reports 30 actions before and after, and the only manifest
  // difference is one new OPTIONAL param on `marketing_holdings_declare`
  // (`shortPosition`), which changed the manifest HASH and not the count. So the
  // denominator is still 30, reachability is still the same seven project-scoped verbs,
  // and 23 is still the right number — it is recorded here because "unchanged" is a
  // finding, and the next person to see this go red should not re-derive it.
  // The three new API paths (`/v1/marketing/holdings*`) and the four new GPS ones
  // (`/v1/gps/inputs*`) are ROUTES, not actions; nothing in the palette aims at them.
  //
  // ── ANSWERED 2026-09-02: none of the three candidates. THE HARNESS'S OWN PARSER ──────
  // The regex that read (subjectType, inspector) pairs out of search.ts matched only groups
  // written on one line — five of sixteen. Eleven nouns were never emitted, so the stub
  // measured its parser, exactly the defect this file's header warns about. Parsing per group
  // block (above) the harness reaches **24 of 30**, and the six it cannot reach are explained
  // by construction rather than open: the five `gps_*` verbs aim at nouns the GPS desk
  // addresses through its own key-address grammar (`gpsGrammar.ts`), which `/v1/search` never
  // emits; and `dist_campaign_create` creates the campaign it would otherwise aim at, so no
  // existing noun offers it. The browser's 20 (measured before the registry grew to 30) and
  // this 24 are now the same kind of number. So `missing` moved 23 → 6, and it moved because
  // the instrument was fixed, not the app.
  expect(
    missing.length,
    `this stubbed harness reaches ${manifest.actions.length - missing.length} of ${manifest.actions.length}. If you changed reachability, update this number and say which way it moved. Unreachable here: ${missing.join(', ')}`,
  ).toBe(6);
});

/* ═══════════════════ the guard, proven able to fail ══════════════════════ */

/**
 * THE POSITIVE CONTROL for the trackpad guard.
 *
 * "No pointer input was recorded" and "the recorder was never wired up" look identical in
 * a green run — that confusion is exactly how a Playwright suite once read as fast while
 * the app was crashing and making zero API calls. So one test uses the real mouse,
 * through the reference saved before the prototype was poisoned, and MUST be caught.
 * `test.fail()` keeps it in the suite permanently: if the guard ever stops detecting a
 * click, this test passes, and an unexpected pass fails the run.
 */
test('the guard itself: a positive control — one real click must be detected', async ({ page }) => {
  test.fail(true, 'this test touches the trackpad on purpose; the guard has to catch it');
  const keys = await seat(page);
  await page.goto('/');
  await expect(page.getByText(/NOT LEGAL ADVICE/i).first()).toBeVisible({ timeout: 15_000 });
  await keys.enterMain();

  expect(realMouseClick, 'the real Mouse.click was never captured, so this control is inert').toBeTruthy();
  await realMouseClick!.call(page.mouse, 400, 400);
  // Layer 2 has to notice. If it does not, this line passes and the run goes red for an
  // unexpected pass — which is the alarm we want.
  await assertNoTrackpad(page);
});
