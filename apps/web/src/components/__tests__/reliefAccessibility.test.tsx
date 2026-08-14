import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeckRelief } from '@/components/geometry/DeckRelief';
import { SurfaceRelief } from '@/components/geometry/SurfaceRelief';
import { PipelineRelief } from '@/components/geometry/PipelineRelief';
import { VaultRelief } from '@/components/geometry/VaultRelief';
import { OntologyOrrery } from '@/components/geometry/OntologyOrrery';
import { GlobeRelief } from '@/components/market/GlobeRelief';
import { StormRelief } from '@/components/risk/StormRelief';
import { buildRiskField, riskFieldUnavailable } from '@/components/risk/riskField';
import type { AuditEntry } from '@/lib/api/audit';
import type { MapPoint } from '@/lib/api/bd';
import type { BdFilters } from '@/types/bd';

/**
 * THE SEVEN RELIEF TOGGLES, AS A NON-SIGHTED AND A KEYBOARD OPERATOR MEET THEM.
 *
 * §6 rule 4 says DOM text "is the accessibility tree and the print path", and rule 1 says every
 * environment falls back to a surface that is not a downgrade in INFORMATION. Both are about the
 * FIGURES. Nothing checked the CONTROLS, and the audit found four defects in them:
 *
 *  1. `disabled` was set on the focused button. `onRefused` fires from the renderer's mount effect —
 *     i.e. one tick after the reader pressed Enter on that button — so the browser blurred it,
 *     `document.activeElement` became `<body>`, and the next Tab restarted from the top of the
 *     document. The reader's reward for asking for relief was losing their place on the page.
 *  2. A `disabled` button is out of the tab ring, so the sibling <span> holding the REASON was
 *     unreachable from the control it explains. Nothing linked them: no `aria-describedby` anywhere.
 *  3. `aria-pressed` contradicted the label. `<button aria-pressed="true">Flat deck</button>`
 *     announces "Flat deck, toggle button, PRESSED" — the name asserts one surface while the state
 *     bit asserts the other.
 *  4. Four wrappers styled their control with `var(--brand, #7FB2FF)` / `var(--rule, #26355A)` and a
 *     `rgba(196,212,240,.66)` note. NEITHER TOKEN EXISTS in `apps/web/src/styles/*.css`, so both
 *     always took the dark-deck fallback — and the app defaults to LIGHT. Measured against the
 *     surfaces they actually sit on, light card #FFFFFF / canvas #F4F6FB:
 *
 *          #7FB2FF label            2.16 / 2.00      needs 4.5:1
 *          rgba(196,212,240,.66)    1.30 / 1.23      needs 4.5:1
 *          #E0A94A refusal alert    2.11 / 1.95      needs 4.5:1
 *          #6B7A99 disabled label   4.31 / 3.99      and 4.10 / 4.47 in DARK — fails all four
 *
 *     So the refusal message rule 1 exists to deliver measured 2.11:1 on the default theme, and it
 *     printed at that ratio too, because printing forces light. The contrast ratchet in
 *     `lib/__tests__/contrast.test.ts` could never have caught any of it: it parses tokens.css, and
 *     these were literals in a `style` prop.
 *
 * WHY THE ASSERTIONS BELOW ARE SHAPED THE WAY THEY ARE. jsdom cannot move focus with a real Tab and
 * has no layout, so "reachable by keyboard" is asserted the way the browser counts it — a real
 * <button> that is not `disabled` and carries no negative tabindex — and "operable" is asserted with
 * the `click` a browser synthesises from Enter or Space on a button. Contrast is NOT recomputed here:
 * jsdom does not resolve `rgb(var(--grey))` through the cascade, so a computed-style assertion would
 * measure nothing. It is guarded structurally instead, by the last test in this file.
 */

/** A minimal risk field the calendar accepts, so the storm's AVAILABLE branch is reachable. */
const RISK_FIELD = buildRiskField({
  lanes: ['Press'],
  bands: ['Low', 'High'],
  days: [
    { label: 'Mon', state: 'observed' },
    { label: 'Tue', state: 'observed' },
  ],
  cells: [[[0.2, 0.4], [0.3, 0.5]]],
  frame: { source: 'fixture', observedAt: '2026-08-13T00:00:00.000Z' },
});

const BD_FILTERS: BdFilters = {
  market: null, minScore: 0, source: '', band: '', listedOnLcx: null, hasContact: null,
  marketRecommendation: '', sort: 'priority', order: 'desc', search: '', tier: 'tracked',
};

const AUDIT: readonly AuditEntry[] = [
  { id: 'a1', action: 'created', entityType: 'lead', entityId: 'l1', actor: 'nik', createdAt: '2026-08-13T09:00:00.000Z' },
] as unknown as readonly AuditEntry[];

const POINTS: readonly MapPoint[] = [
  { id: 'p1', name: 'One', region: 'EU', euScore: 40, usPreScore: 30, usPostScore: 20 },
] as unknown as readonly MapPoint[];

interface Surface {
  /** The wrapper's file name, so a failure names the file to open. */
  readonly name: string;
  /** The noun the toggle must keep across both states. */
  readonly noun: string;
  readonly mount: () => HTMLElement;
  /**
   * The same wrapper with an input it must refuse to draw, where one exists WITHOUT a GL context.
   * `null` where the only route to unavailable is the renderer calling `onRefused` — covered
   * separately, with a mocked renderer, in "a refusal keeps focus".
   */
  readonly mountUnavailable: (() => HTMLElement) | null;
}

const SURFACES: readonly Surface[] = [
  {
    name: 'geometry/DeckRelief.tsx',
    noun: 'Theatre view',
    mount: () => render(
      <DeckRelief panels={[
        { id: 'a', title: 'A', headline: '1/2 gates', note: null },
        { id: 'b', title: 'B', headline: '4', note: null },
      ]}
      >
        <p>flat deck</p>
      </DeckRelief>,
    ).container,
    /* One panel is not a room: the wrapper refuses to arrange a single panel in depth. */
    mountUnavailable: () => render(
      <DeckRelief panels={[{ id: 'a', title: 'A', headline: '1', note: null }]}>
        <p>flat deck</p>
      </DeckRelief>,
    ).container,
  },
  {
    name: 'geometry/SurfaceRelief.tsx',
    noun: 'Relief view',
    mount: () => render(
      <SurfaceRelief
        surface={{ kind: 'refused', refusals: [] }}
        title="Scores"
        readsAs="height is the score a slice cannot show"
      />,
    ).container,
    mountUnavailable: null,
  },
  {
    name: 'geometry/PipelineRelief.tsx',
    noun: 'Channel view',
    /*
     * `mount` is the UNAVAILABLE shape here too, and deliberately: `buildChannel` needs leads with a
     * readable market cap, a gate and a last touch before it will offer the channel, and inventing
     * that fixture would be inventing the derivation's own contract in a test about buttons. The
     * available branch of this one wrapper is therefore NOT covered, which is why the toggle-name
     * test skips a `noun`-on/off flip it cannot reach and only the shared contract is asserted.
     */
    mount: () => render(
      <PipelineRelief
        leads={[]}
        filters={BD_FILTERS}
        clarityEnacted={false}
        onSort={() => {}}
        onSelect={() => {}}
        loading={false}
      />,
    ).container,
    mountUnavailable: () => render(
      <PipelineRelief
        leads={[]}
        filters={BD_FILTERS}
        clarityEnacted={false}
        onSort={() => {}}
        onSelect={() => {}}
        loading={false}
      />,
    ).container,
  },
  {
    name: 'geometry/VaultRelief.tsx',
    noun: 'Vault view',
    mount: () => render(<VaultRelief entries={AUDIT}><p>flat table</p></VaultRelief>).container,
    mountUnavailable: null,
  },
  {
    name: 'geometry/OntologyOrrery.tsx',
    noun: 'Orrery view',
    mount: () => render(
      <OntologyOrrery
        entities={[{ id: 'e1', label: 'Core', kind: 'product' }] as never}
        couplings={[] as never}
        allCouplings={[]}
      >
        <p>flat diagram</p>
      </OntologyOrrery>,
    ).container,
    mountUnavailable: null,
  },
  {
    name: 'market/GlobeRelief.tsx',
    noun: 'Globe view',
    mount: () => render(<GlobeRelief points={POINTS}><p>flat scatter</p></GlobeRelief>).container,
    mountUnavailable: null,
  },
  {
    name: 'risk/StormRelief.tsx',
    noun: 'Storm view',
    mount: () => render(
      <StormRelief field={RISK_FIELD} title="Risk" readsAs="depth is accumulated risk" />,
    ).container,
    /* A refused field never reaches the renderer, so the toggle must be dead and say why. */
    mountUnavailable: () => render(
      <StormRelief
        field={riskFieldUnavailable('no forward risk feed is wired for this launch')}
        title="Risk"
        readsAs="depth is accumulated risk"
      />,
    ).container,
  },
];

/** The accessible name of a button whose content is text — what a screen reader would read out. */
function nameOf(btn: HTMLElement): string {
  return (btn.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function toggleIn(container: HTMLElement, noun: string): HTMLButtonElement {
  const all = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
  const match = all.filter((b) => nameOf(b).startsWith(noun));
  expect(
    match.length,
    `no button named "${noun}…" — buttons found: ${JSON.stringify(all.map(nameOf))}`,
  ).toBe(1);
  return match[0]!;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('the relief toggles are operable without a mouse and without sight', () => {
  it('covers every wrapper that has one', () => {
    /*
     * ASSERTED FIRST, because every test below loops over this list and a loop over an empty or
     * shortened list passes while proving nothing. Seven wrappers own a relief toggle; a new
     * environment, or a wrapper quietly dropped from this file, fails here.
     */
    expect(SURFACES.length).toBe(7);
    expect(new Set(SURFACES.map((s) => s.noun)).size).toBe(7);
  });

  it('every toggle is a real button, in the tab ring, and not `disabled`', () => {
    expect(SURFACES.length).toBeGreaterThan(0);
    for (const s of SURFACES) {
      const btn = toggleIn(s.mount(), s.noun);
      expect(btn.tagName, s.name).toBe('BUTTON');
      /* `type` matters: a bare <button> inside a form submits it, and three of these sit on pages
         with filter forms. */
      expect(btn.getAttribute('type'), s.name).toBe('button');
      expect(btn.getAttribute('tabindex'), `${s.name} — a negative tabindex takes it out of the tab ring`).toBeNull();
      cleanup();
    }
  });

  it('the accessible name keeps its noun and states on/off, so it cannot contradict aria-pressed', () => {
    expect(SURFACES.length).toBeGreaterThan(0);
    for (const s of SURFACES) {
      const container = s.mount();
      const btn = toggleIn(container, s.noun);
      const nameOff = nameOf(btn);
      expect(nameOff, s.name).toBe(`${s.noun}: off`);
      expect(btn.getAttribute('aria-pressed'), s.name).toBe('false');

      /*
       * THE ASSERTION THAT WOULD HAVE FAILED BEFORE THIS AUDIT. These buttons read `Flat deck`,
       * `Flat view`, `Table view`, `Scatter view`, `Diagram` when relief was ON, while still
       * carrying `aria-pressed="true"` — so the announced name named the surface the reader was NOT
       * looking at. The noun has to survive the state change; only the state word may move.
       */
      fireEvent.click(btn);
      const after = toggleIn(container, s.noun);
      const nameOn = nameOf(after);
      if (after.getAttribute('aria-pressed') === 'true') {
        expect(nameOn, s.name).toBe(`${s.noun}: on`);
      } else {
        /* PipelineRelief with no drawable leads cannot turn on. It must not have moved. */
        expect(nameOn, `${s.name} — refused to turn on, so the name must not have changed`).toBe(nameOff);
      }
      cleanup();
    }
  });

  it('every state names its reason ON the toggle, via aria-describedby', () => {
    expect(SURFACES.length).toBeGreaterThan(0);
    for (const s of SURFACES) {
      const container = s.mount();
      const btn = toggleIn(container, s.noun);
      const id = btn.getAttribute('aria-describedby');
      expect(id, `${s.name} — the reason is in a sibling nobody can get to from the button`).toBeTruthy();
      const note = container.querySelector(`#${CSS.escape(id!)}`);
      expect(note, `${s.name} — aria-describedby points at #${id}, which does not exist`).not.toBeNull();
      expect((note!.textContent ?? '').trim().length, `${s.name} — the description is empty`).toBeGreaterThan(20);

      /* And it must survive the toggle: an id that only exists in one branch resolves to no
         description at all in the other, which is silently worse than never having had one. */
      fireEvent.click(btn);
      const after = toggleIn(container, s.noun);
      const id2 = after.getAttribute('aria-describedby');
      expect(id2, s.name).toBeTruthy();
      expect(
        container.querySelector(`#${CSS.escape(id2!)}`),
        `${s.name} — after toggling, aria-describedby points at #${id2}, which does not exist`,
      ).not.toBeNull();
      cleanup();
    }
  });

  it('an unavailable toggle keeps focus, keeps its reason, and does nothing when pressed', () => {
    const withRefusal = SURFACES.filter((s) => s.mountUnavailable !== null);
    /* Three wrappers can refuse from their INPUT rather than from the renderer, so this is the set
       that can be proved without a GL context. Asserted non-empty because a filter that quietly
       matched nothing would make every assertion below unreachable. */
    expect(withRefusal.map((s) => s.name)).toEqual([
      'geometry/DeckRelief.tsx', 'geometry/PipelineRelief.tsx', 'risk/StormRelief.tsx',
    ]);

    for (const s of withRefusal) {
      const container = s.mountUnavailable!();
      const btn = toggleIn(container, s.noun);

      /* NOT `disabled`: that is what evicted focus and dropped the control out of the tab ring. */
      expect(btn.disabled, `${s.name} — \`disabled\` blurs the focused element and hides the reason`).toBe(false);
      expect(btn.getAttribute('aria-disabled'), s.name).toBe('true');

      const id = btn.getAttribute('aria-describedby');
      expect(id, s.name).toBeTruthy();
      const note = container.querySelector(`#${CSS.escape(id!)}`);
      expect((note?.textContent ?? '').trim().length, `${s.name} — unavailable with no stated reason`).toBeGreaterThan(20);
      /*
       * AND IT IS ANNOUNCED. Only the renderer's refusal carried `role="alert"`; a wrapper whose INPUT went
       * from drawable to undrawable — panels narrowed to one, a queue filtered to nothing, a feed dropping
       * out — greyed the control and left its reason in an unannounced sibling. Two of these three had no
       * alert at all on this branch.
       */
      expect(note!.getAttribute('role'), `${s.name} — the control went dead without announcing why`).toBe('alert');

      btn.focus();
      expect(document.activeElement, `${s.name} — could not focus the toggle`).toBe(btn);
      fireEvent.click(btn);
      expect(btn.getAttribute('aria-pressed'), `${s.name} — aria-disabled but the click still worked`).toBe('false');
      expect(document.activeElement, `${s.name} — pressing an unavailable toggle threw focus away`).toBe(btn);
      cleanup();
    }
  });

  it('focus stays on the toggle when the surface swaps under it', () => {
    /*
     * The button is a sibling of the swapped region in all seven, so it must survive the swap. If a
     * future refactor keys the wrapper's subtree or moves the control inside the region, focus lands
     * on <body> and a keyboard reader has to Tab back from the top of the page to turn relief off.
     */
    const swappable = SURFACES.filter((s) => s.noun !== 'Channel view');
    expect(swappable.length).toBe(6);
    for (const s of swappable) {
      const container = s.mount();
      const btn = toggleIn(container, s.noun);
      btn.focus();
      fireEvent.click(btn);
      const after = toggleIn(container, s.noun);
      expect(after.getAttribute('aria-pressed'), s.name).toBe('true');
      expect(document.activeElement, `${s.name} — focus was lost when the surface swapped`).toBe(after);
      cleanup();
    }
  });
});

describe("a renderer's refusal is announced, and does not cost the reader their place", () => {
  it('sets role=alert, keeps the button focused, and puts the code in its description', async () => {
    /*
     * The ONE path that needs the renderer mocked. `refusal` is only settable by the GL child, and
     * this is the exact moment the old code broke: the reader presses Enter, the chunk loads, the
     * renderer's mount effect refuses, and `disabled={refusal !== null}` blurred the still-focused
     * button. DeckRelief stands in for the shared shape — it is the only one whose refusal path can
     * be driven without also standing up a flat chart, a table or a force layout.
     */
    /*
     * NAMED, and uppercase, because an anonymous arrow assigned to `default:` is not a component
     * as far as the hooks rule is concerned — it reads the binding name, sees "default", and
     * rejects the `useEffect` inside it. The lint error is pedantic here and also correct in
     * general: a lowercase-named function holding a hook is a real bug everywhere except a mock.
     */
    vi.doMock('@/components/geometry/DeckReliefGl', () => {
      function RefusingDeckRelief({ onRefused }: { onRefused: (code: string) => void }) {
        /* In an effect, not in render: `onRefused` sets state on the parent. Required from
           INSIDE the factory rather than imported at the top of the file: `vi.resetModules()`
           below rebuilds the graph, and a hook taken from this file's own React binding would
           be a different dispatcher than the freshly-imported DeckRelief renders under. */
        const React = require('react') as typeof import('react');
        React.useEffect(() => { onRefused('FLOAT_TARGET_REFUSED'); }, [onRefused]);
        return null;
      }
      return { default: RefusingDeckRelief };
    });
    vi.resetModules();
    const { DeckRelief: Fresh } = await import('@/components/geometry/DeckRelief');

    const { container } = render(
      <Fresh panels={[
        { id: 'a', title: 'A', headline: '1', note: null },
        { id: 'b', title: 'B', headline: '2', note: null },
      ]}
      >
        <p>flat deck</p>
      </Fresh>,
    );

    const btn = toggleIn(container, 'Theatre view');
    btn.focus();
    await act(async () => { fireEvent.click(btn); });

    await waitFor(() => {
      const alert = container.querySelector('[role="alert"]');
      expect(alert, 'the refusal was not announced — no role=alert in the wrapper').not.toBeNull();
      expect(alert!.textContent).toContain('FLOAT_TARGET_REFUSED');
    });

    const after = toggleIn(container, 'Theatre view');
    expect(after.getAttribute('aria-disabled')).toBe('true');
    expect(after.disabled, '`disabled` on a refusal is what blurred the focused button').toBe(false);
    expect(document.activeElement, 'the refusal threw focus to <body>').toBe(after);
    /* The announced alert and the button's description are the same node, so the reason is available
       both as an interruption and on demand when the reader comes back to the control. */
    const id = after.getAttribute('aria-describedby');
    expect(container.querySelector(`#${CSS.escape(id!)}`)?.getAttribute('role')).toBe('alert');
    expect(after.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('no relief wrapper paints its own interface colours', () => {
  /**
   * THE GUARD FOR DEFECT 4, AND IT IS A SOURCE SCAN ON PURPOSE.
   *
   * jsdom resolves neither `rgb(var(--grey))` nor a Tailwind class, so a computed-style contrast
   * assertion in this environment measures the string it was given. What CAN be asserted, and is
   * what actually went wrong, is that these files stopped choosing colours themselves: every literal
   * here was a dark-deck value on a theme that defaults to light, and `var(--brand, …)` /
   * `var(--rule, …)` were literals wearing a token's clothes because neither token is defined.
   *
   * The ratios are in each file's header. This test only holds the line that they go through the
   * token layer, where `lib/__tests__/contrast.test.ts` can see them.
   */
  const FILES = [
    'components/geometry/DeckRelief.tsx',
    'components/geometry/SurfaceRelief.tsx',
    'components/geometry/PipelineRelief.tsx',
    'components/geometry/VaultRelief.tsx',
    'components/geometry/OntologyOrrery.tsx',
    'components/market/GlobeRelief.tsx',
    'components/risk/StormRelief.tsx',
  ];

  /**
   * The two exceptions, and they are the only defensible kind: labels projected over the rendered
   * scene rather than onto a themed surface. There is no token for "legible on whatever the renderer
   * put behind this pixel" — that is what their `textShadow` is for. Both are redundantly encoded by
   * the words `CORE ·` and `SELECTED ·` in the label itself, which is what makes them safe under
   * colour-vision deficiency: simulated (Machado 2009, severity 1.0) the pair falls from 29.4 to
   * 12.4 ΔE2000 under tritanopia, and the text carries the distinction either way.
   */
  const CANVAS_LABEL_HEX = new Set(['#BFD6FF', '#7FE3C0']);

  it('every interface colour comes from a token, not a literal', () => {
    expect(FILES.length).toBe(7);
    const offences: string[] = [];
    for (const rel of FILES) {
      const src = readFileSync(join(__dirname, '..', '..', rel), 'utf8');
      /* Comments carry the measured ratios and therefore the hexes they were measured on — strip
         them, or this test would be failed by its own evidence. */
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const m of code.matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
        const hex = `#${m[0].slice(1).toUpperCase()}`;
        if (rel.endsWith('OntologyOrrery.tsx') && CANVAS_LABEL_HEX.has(hex)) continue;
        offences.push(`${rel}: ${m[0]}`);
      }
      /* `--brand` and `--rule` are not defined anywhere in styles/, so a `var()` on either is a
         literal with extra steps — which is how #7FB2FF at 2.16:1 survived review. */
      for (const m of code.matchAll(/var\(--(brand|rule)\b/g)) {
        offences.push(`${rel}: var(--${m[1]}) — that token does not exist, the fallback always wins`);
      }
    }
    expect(offences).toEqual([]);
  });
});
