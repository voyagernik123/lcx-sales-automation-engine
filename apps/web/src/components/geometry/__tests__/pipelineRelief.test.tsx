import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PipelineRelief } from '@/components/geometry/PipelineRelief';
import {
  buildChannel, MAX_PER_GATE, STALL_DAYS, STALL_ONSET, DEEP_GATE_LABEL,
} from '@/components/geometry/pipelineChannel';
import type { BdFilters, BdLead } from '@/types/bd';

/*
 * §7's disposition for an environment whose clause (b) is not established: "it ships behind a toggle that
 * defaults off, and I tell you rather than quietly shipping it."
 *
 * These tests are about the DEFAULT, the DERIVATION and the FALLBACK — not about the render. The render is
 * verified by `docs/3d/e3`'s captures against a real rasteriser; jsdom has no WebGL2 and pretending otherwise
 * would be a test that passes for the wrong reason. What CAN be verified here is exactly what §7 and §6 ask:
 * that a reader who does nothing sees the table, that the reason is on the page, that a refusal returns them to
 * it, and that absence never becomes zero.
 */

const NOW = Date.parse('2026-08-13T00:00:00.000Z');
const DAY = 86_400_000;
const isoDaysAgo = (d: number): string => new Date(NOW - d * DAY).toISOString();

let seq = 0;
function lead(over: Partial<BdLead> = {}): BdLead {
  seq += 1;
  return {
    id: `p${seq}`,
    name: `PROJECT ${seq}`,
    ticker: null,
    website: null,
    source: 'manual',
    chain: null,
    jurisdiction: null,
    category: null,
    listedOnLcx: null,
    euScore: 50,
    usPreScore: 50,
    usPostScore: 50,
    band: 'nurture',
    marketCapUsd: 250_000,
    peopleCount: 1,
    verifiedContactCount: 1,
    createdAt: isoDaysAgo(90),
    updatedAt: isoDaysAgo(3),
    hasContact: true,
    marketTag: null,
    ...over,
  };
}

const FILTERS: BdFilters = {
  market: null, minScore: 0, source: '', band: '', listedOnLcx: null, hasContact: null,
  marketRecommendation: '', sort: 'created', order: 'desc', search: '', tier: 'tracked',
};

const LEADS: BdLead[] = [
  lead({ name: 'SABLE TREASURY', band: 'unscored', marketCapUsd: 240_000, updatedAt: isoDaysAgo(63) }),
  /* Never priced, not priced zero. The mass axis must REFUSE for this one. */
  lead({ name: 'PRAXIS DESK', band: 'unscored', marketCapUsd: null, updatedAt: isoDaysAgo(9) }),
  lead({ name: 'TIBER CLEARING', band: 'watch', marketCapUsd: 310_000, updatedAt: isoDaysAgo(4) }),
  lead({ name: 'HELIOS EXCHANGE', band: 'nurture', marketCapUsd: 1_750_000, updatedAt: isoDaysAgo(52) }),
  /* Past the warm gate and stopped: this pair is the figure the channel exists to show. */
  lead({ name: 'MERIDIAN PAY', band: 'high', marketCapUsd: 2_600_000, updatedAt: isoDaysAgo(41) }),
  lead({ name: 'NORDIC CUSTODY', band: 'high', marketCapUsd: 880_000, updatedAt: isoDaysAgo(6) }),
  lead({ name: 'ATLAS OTC', band: 'immediate', marketCapUsd: 4_200_000, updatedAt: isoDaysAgo(3) }),
];

const props = { leads: LEADS, filters: FILTERS, clarityEnacted: false, onSort: () => {}, onSelect: () => {}, loading: false };

const mount = (over: Partial<typeof props> = {}) =>
  render(<MemoryRouter><PipelineRelief {...props} {...over} /></MemoryRouter>);

describe('PipelineRelief — §7 says an unproven environment defaults off and says so', () => {
  it('renders the FLAT table with no interaction, and no canvas', () => {
    const { container } = mount();
    /* A canvas appearing here would mean the 3-D view had shipped as the default on a claim nobody has
       measured. The table is what an operator triages on. */
    expect(container.querySelector('table'), 'the table must be what loads').not.toBeNull();
    expect(container.querySelector('canvas'), 'the channel must NOT be the default').toBeNull();
  });

  it('tells the reader WHY the channel is opt-in, on the page', () => {
    /* Not in a tooltip and not in a commit message. And it names the second cost too: the table is where the
       triage keys work, which is a real loss the harness's fallback never had to state. */
    mount();
    expect(screen.getByText(/nobody has yet timed whether it answers faster/i)).toBeTruthy();
    expect(screen.getByText(/triage keys act on the rows/i)).toBeTruthy();
  });

  it('offers the toggle, and reports its state to assistive technology', () => {
    mount();
    const btn = screen.getByRole('button', { name: /channel view/i });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('keeps the table while the lazy chunk is still loading', () => {
    /*
     * The Suspense fallback IS the table rather than a spinner. A reader who clicked for the channel has not
     * asked to lose the rows for the length of a network round trip, and a blank box would be a worse answer to
     * the question they were already reading.
     */
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: /channel view/i }));
    expect(container.querySelector('table'), 'the table must survive the load').not.toBeNull();
  });

  it('will not offer a channel the derivation refused, and names the code', () => {
    /* A dataset the derivation declined must never reach the renderer, and the refusal is CHEAP — no chunk is
       fetched to be told the data is bad. */
    const { container } = mount({ leads: [lead({ marketCapUsd: Number.NaN })] });
    const btn = screen.getByRole('button', { name: /channel view/i });
    /*
     * aria-disabled, NOT disabled — and the difference is the whole point of the change this pins.
     *
     * `onRefused` fires from the renderer's mount effect, one tick after the reader pressed Enter on this
     * very button. Setting `disabled` on a FOCUSED element blurs it: `document.activeElement` becomes
     * `<body>` and the next Tab restarts from the top of the document — on PipelineRelief that also means
     * leaving the table the triage keys act on. `aria-disabled` with a guarded onClick keeps the control
     * in the tab ring and keeps focus where the reader put it.
     */
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.hasAttribute('disabled'), 'a disabled control drops focus to <body>').toBe(false);
    expect(screen.getByRole('alert').textContent).toContain('INVALID_LEAD_DATA');
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('table'), 'the rows are unaffected').not.toBeNull();
  });

  it('will not offer a channel with nothing in it', () => {
    mount({ leads: [] });
    expect(screen.getByRole('button', { name: /channel view/i }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('NO_LEADS_IN_THE_CHANNEL');
  });

  it('does not import the GL layer until the reader asks', async () => {
    /*
     * THE BUDGET TEST. The perf budget allows roughly 11 KB of headroom on initial JS and the environment layer
     * alone is 35.7 KB, so an eager import would blow it on a view most readers never open. Asserted
     * structurally: the module graph reachable from this component must not name the engine.
     */
    const fs = await import('node:fs');
    const path = await import('node:path');
    /* Resolved from the workspace root rather than `import.meta.url`: under jsdom that is not a file: URL and
       `new URL(...)` throws. Existence is asserted FIRST so this test cannot pass by reading an empty string —
       a structural check that silently finds nothing is the failure mode it exists to prevent. */
    for (const rel of [
      'src/components/geometry/PipelineRelief.tsx',
      'src/components/geometry/pipelineChannel.ts',
    ]) {
      const file = path.resolve(process.cwd(), rel);
      expect(fs.existsSync(file), `cannot find ${file} — this check would otherwise pass vacuously`).toBe(true);
      const src = fs.readFileSync(file, 'utf8');
      expect(src.length).toBeGreaterThan(500);
      expect(
        /^import[^;]*from '@lcx\/gl'/m.test(src),
        `${rel} must not import @lcx/gl eagerly`,
      ).toBe(false);
    }
    const wrapper = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/geometry/PipelineRelief.tsx'), 'utf8',
    );
    expect(wrapper, 'the GL component must be behind lazy()').toMatch(/lazy\(\(\) => import\(/);
  });

  it('renders one frame and never schedules another', async () => {
    /*
     * §6 rule 2, read off the source of the renderer itself rather than off a timer. A camera that drifts for
     * ever is an idle animation with a budget, and it is also why reduced motion needs no branch here.
     */
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.resolve(process.cwd(), 'src/components/geometry/PipelineReliefGl.tsx');
    expect(fs.existsSync(file)).toBe(true);
    const src = fs.readFileSync(file, 'utf8');
    /* A CALL, not a mention: the file's own header says the words "no `requestAnimationFrame`, no interval",
       and a bare-name grep therefore fails on the comment that documents the rule being kept. Parentheses are
       what make it an invocation. */
    expect(/requestAnimationFrame\s*\(|setInterval\s*\(|setTimeout\s*\(/.test(src)).toBe(false);
    /* And the context-loss handler, without which a dropped context leaves a stale frame on screen for ever. */
    expect(src).toContain('webglcontextlost');
    expect(src).toContain('CONTEXT_LOST');

    /*
     * EVERY UPLOADED MESH REGISTERS ITS OWN DISPOSER, IN ITS OWN BLOCK. Uploading all seven and registering the
     * disposers afterwards is correct on the happy path and leaks on the only path that matters: a refusal on
     * the seventh upload calls `refuse` while six meshes are on the GPU with no disposer recorded, and `Stage`
     * owns programs and targets — it knows nothing about a VAO. The sibling environment shipped with no
     * registration at all, which is why this is a check rather than a comment.
     */
    const calls = [...src.matchAll(/uploadMesh\(/g)];
    expect(calls.length, 'a file that uploads no mesh cannot pass this vacuously').toBeGreaterThan(0);
    for (const m of calls) {
      expect(
        /disposers\.push\(/.test(src.slice(m.index, m.index + 300)),
        'every uploadMesh must register its disposer in its own block, before the next upload is attempted',
      ).toBe(true);
    }
    /* Reverse, and the stage LAST — it owns the context, so releasing it first leaves every other delete*
       call operating on a dead one: silent rather than fatal, and it leaks on every remount. */
    expect(src).toMatch(/for \(const d of disposers\.reverse\(\)\) d\(\);\s*(\/\*[\s\S]*?\*\/\s*)?stage\.dispose\(\);/);
  });
});

describe('the derivation — absence stays absent and a share needs a denominator', () => {
  it('keeps a lead with no market cap as ABSENT, never as zero mass', () => {
    /* §6 rule 6. In the table both a missing cap and a zero cap are a cell; here one is a ring with no mass to
       give and the other would be a cube the size of nothing, which is a different claim. */
    const ch = buildChannel(LEADS, NOW);
    const praxis = ch.deals.find((d) => d.name === 'PRAXIS DESK');
    expect(praxis).toBeDefined();
    expect(praxis?.valueUsd).toBeNull();
    expect(praxis?.valueUsd).not.toBe(0);
    expect(praxis?.known).toBe('VALUE_ABSENT');
    /* Its DATE is known, so it still has a position on the movement axis. The two readings fail separately. */
    expect(praxis?.daysSinceUpdate).toBeCloseTo(9, 6);
    expect(ch.valueAbsent).toBe(1);
  });

  it('excludes an absent cap from the aggregate rather than estimating it', () => {
    const ch = buildChannel(LEADS, NOW);
    const summed = LEADS
      .filter((l) => l.name !== 'PRAXIS DESK')
      .reduce((s, l) => s + (l.marketCapUsd ?? 0), 0);
    expect(ch.readableUsd).toBe(summed);
  });

  it('reads the stalled value past the warm gate from the shape, not from a sort', () => {
    /*
     * This is the reading the bar list cannot give, as a number. MERIDIAN PAY is past the warm gate at 41 days;
     * NORDIC CUSTODY is past it at 6 days and must not count; HELIOS EXCHANGE is stalled at 52 days but has not
     * cleared the gate and must not count either. Getting any of those three wrong is the difference between
     * the figure and a plausible-looking figure.
     */
    const ch = buildChannel(LEADS, NOW);
    expect(ch.deepStalledNames).toEqual(['MERIDIAN PAY']);
    expect(ch.deepStalledUsd).toBe(2_600_000);
    expect(ch.deepStalledShare).toBeCloseTo(2_600_000 / (ch.readableUsd ?? 1), 9);
    expect(DEEP_GATE_LABEL).toBe('Warm lead');
  });

  it('returns NULL, not 0%, when there is no readable book', () => {
    /*
     * EXCLUDING EVERYTHING USED TO PRINT 0%, AND 0% IS A MEASUREMENT. E3's own README records this defect: a
     * `Math.max(1, total)` guard stops a divide-by-zero and manufactures a reading, and the harness printed
     * "0% OF THE READABLE BOOK" in the largest type on the frame over a book where nothing was readable.
     */
    const ch = buildChannel(
      [lead({ marketCapUsd: null }), lead({ marketCapUsd: null, band: 'high' })], NOW,
    );
    expect(ch.readableUsd).toBeNull();
    expect(ch.deepStalledUsd).toBeNull();
    expect(ch.deepStalledShare).toBeNull();
    expect(ch.deepStalledShare).not.toBe(0);
  });

  it('refuses a present value that is not a value, rather than drawing a negative cube root', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -500_000]) {
      const ch = buildChannel([lead({ marketCapUsd: bad })], NOW);
      expect(ch.refusal, `marketCapUsd ${String(bad)} must refuse`).toBe('INVALID_LEAD_DATA');
      expect(ch.faults.length).toBeGreaterThan(0);
      expect(ch.deals).toHaveLength(0);
    }
  });

  it('separates a MISSING last touch from a CORRUPT one', () => {
    /* An absence is a claim about the record and is rendered; a corrupt timestamp is a claim about the pipe and
       refuses the frame. Collapsing the two is the defect this file is shaped around. */
    const missing = buildChannel([lead({ updatedAt: '' })], NOW);
    expect(missing.refusal).toBeNull();
    expect(missing.deals[0]?.daysSinceUpdate).toBeNull();
    expect(missing.deals[0]?.known).toBe('MOVEMENT_ABSENT');

    const corrupt = buildChannel([lead({ updatedAt: 'soon' })], NOW);
    expect(corrupt.refusal).toBe('INVALID_LEAD_DATA');
  });

  it('does not put an archived lead in the channel, and says how many it left out', () => {
    /* An archived lead has been declined, not stalled in a gate. Drawing it would assert that value is stuck
       where in fact it was rejected — and filtering it silently would be an aggregate quietly missing rows. */
    const ch = buildChannel([...LEADS, lead({ band: 'archive', marketCapUsd: 9_000_000 })], NOW);
    expect(ch.archived).toBe(1);
    expect(ch.deals.some((d) => d.valueUsd === 9_000_000)).toBe(false);
  });

  it('caps a gate at its slots, drops the SMALLEST, and reports what it dropped', () => {
    const many = Array.from({ length: MAX_PER_GATE + 3 }, (_, i) =>
      lead({ band: 'high', name: `LEAD ${i}`, marketCapUsd: (i + 1) * 100_000, updatedAt: isoDaysAgo(1) }));
    const ch = buildChannel(many, NOW);
    expect(ch.drawn).toBe(MAX_PER_GATE);
    expect(ch.considered).toBe(MAX_PER_GATE + 3);
    expect(ch.undrawn).toBe(3);
    /* The three smallest, so what stays on screen is where the money is — and the dropped value is printed
       rather than absorbed. */
    expect(ch.undrawnUsd).toBe(100_000 + 200_000 + 300_000);
    expect(ch.deals.every((d) => (d.valueUsd ?? 0) >= 400_000)).toBe(true);
  });

  it('clamps the movement axis at the stall floor instead of extending it', () => {
    /* 45 days is a policy number: past it a lead is dead rather than slow, so a 63-day and a 90-day lead both
       rest on the deck. The axis does not pretend to resolve a difference nobody acts on differently. */
    const ch = buildChannel([
      lead({ band: 'high', name: 'SIXTY THREE', updatedAt: isoDaysAgo(63) }),
      lead({ band: 'high', name: 'NINETY', updatedAt: isoDaysAgo(90) }),
    ], NOW);
    const settle = (n: string): number =>
      Math.min(1, (ch.deals.find((d) => d.name === n)?.daysSinceUpdate ?? 0) / STALL_DAYS);
    expect(settle('SIXTY THREE')).toBe(1);
    expect(settle('NINETY')).toBe(1);
    expect(STALL_ONSET).toBe(27);
  });
});
