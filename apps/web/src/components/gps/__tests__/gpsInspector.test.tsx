import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { CATALOGUE_TODOS } from '@lcx/shared';
import { _resetDismiss } from '@/lib/dismiss';
import {
  BARE_CODE_NOTICE,
  GpsInspector,
  GpsInspectorBody,
  UNKNOWN_TODO_NOTICE,
  catalogueTodoFor,
  gpsProvenanceGrade,
  looksLikeBareCode,
  type GpsField,
  type GpsLens,
} from '../GpsInspector';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE INSPECTOR — tested for the two things it is FOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It exists to answer "what is this object, really", so the assertions are about the
 * places where a screen can lie:
 *
 *  1. IT SAYS WHEN A FIGURE IS A CONSTANT. GPS is full of compiled placeholders by design
 *     — prices, vendor costs, the perimeter lines — and the whole reason the compartment
 *     exists is that a placeholder shown as a measurement is worse than no system.
 *  2. THE PLACEHOLDER WARNING CANNOT GO STALE. The wording comes from `CATALOGUE_TODOS`,
 *     and a standing that names an item no longer in that ledger goes LOUD. This is the
 *     ratchet, modelled on `marketingGrammar`'s `surface_only` → `owedFn` rule, and it is
 *     the assertion that will actually fire one day: the founder supplies real price bands,
 *     the item leaves the ledger, and the inspector must stop calling a decided price a
 *     placeholder rather than keep saying it forever.
 *  3. THE GRADE IS RECONSTRUCTABLE FROM THE ROWS UNDER IT, and refusals do not touch it.
 *  4. A REFUSAL IS A SENTENCE PLUS A RULE, never a code.
 *  5. ONE COMPONENT, MANY ROW SHAPES — the thing that stops this becoming six copies.
 *
 * EACH ONE FAILS WITHOUT THE CODE: before this component there was no GPS drill-down at
 * all, and the specific mechanisms (the ledger lookup, the derived grade, the bare-code
 * guard) were each verified by reverting them and watching the named assertion break.
 */

/* Two unrelated row shapes, to prove the component is generic over them rather than
 * switching on a kind. Neither type is known to `GpsInspector`. */
interface EngagementRow { id: string; client: string; feeCents: number }
interface GapRow { ref: string; missing: string }

/** A real ledger item, so the placeholder path exercises the real lookup. */
const REAL_TODO = 'Real price bands for all five offers.';

const engagementLens: GpsLens<EngagementRow> = (r) => ({
  kind: 'engagement',
  title: r.client,
  subtitle: r.id,
  fields: [
    { label: 'Client', value: r.client, standing: { kind: 'measured', source: 'gps_engagement.client_id' } },
    { label: 'Fee', value: `$${r.feeCents / 100}`, standing: { kind: 'placeholder', awaitingTodo: REAL_TODO } },
    { label: 'Margin', value: '38%', standing: { kind: 'derived', from: 'underwrite.ts marginPct()' } },
  ],
  refusals: [],
  links: [{ label: 'Conflict check', detail: 'cleared', onOpen: () => {} }],
});

const gapLens: GpsLens<GapRow> = (r) => ({
  kind: 'delivery gap',
  title: r.ref,
  fields: [{ label: 'Missing', value: r.missing, standing: { kind: 'measured', source: 'gps_delivery.gap' } }],
  refusals: [],
  links: [],
});

const field = (standing: GpsField['standing']): GpsField => ({ label: 's', value: 'v', standing });

beforeEach(() => { _resetDismiss(); });
afterEach(() => { _resetDismiss(); });

describe('one component over many GPS row shapes', () => {
  it('renders two unrelated row types through their own lenses, with no shared field', () => {
    const { unmount } = render(
      <GpsInspectorBody subject={{ id: 'e-1', client: 'Acme', feeCents: 1_750_000 }} lens={engagementLens} />,
    );
    expect(screen.getByText('engagement')).toBeTruthy();
    expect(screen.getByText('e-1')).toBeTruthy();
    expect(screen.getByTitle('Acme')).toBeTruthy();
    unmount();

    render(<GpsInspectorBody subject={{ ref: 'g-9', missing: 'signed acceptance' }} lens={gapLens} />);
    expect(screen.getByText('delivery gap')).toBeTruthy();
    expect(screen.getByText('signed acceptance')).toBeTruthy();
  });
});

describe('a placeholder is stated as one, in the ledger\'s own words', () => {
  it('names the placeholder, its owner and the ledger consequence — and still shows the value', () => {
    render(
      <GpsInspectorBody subject={{ id: 'e-1', client: 'Acme', feeCents: 1_750_000 }} lens={engagementLens} />,
    );
    const row = document.querySelector('[data-field="Fee"]');
    expect(row).toBeTruthy();
    const cell = within(row as HTMLElement);
    // D3: the uncertainty sits BESIDE the estimate, never inside it. The figure is still
    // printed — a quietly suppressed number is a number nobody argues with.
    expect(cell.getByText('$17500')).toBeTruthy();
    expect(row!.textContent).toContain('Placeholder, not measured');
    const todo = catalogueTodoFor(REAL_TODO)!;
    expect(row!.textContent).toContain(`owed by ${todo.owner}`);
    // Verbatim from the ledger, not a second wording of it.
    expect(row!.textContent).toContain(todo.consequence);
  });

  it('pins the premise: the item this file names is in CATALOGUE_TODOS today', () => {
    // If this fails, the decision was probably MADE. That is good news and it means the
    // fixtures above (and any desk lens naming it) must be updated, not that this is a bug.
    expect(CATALOGUE_TODOS.map((t) => t.what)).toContain(REAL_TODO);
  });

  it('goes LOUD when the named ledger item is gone, instead of warning about a settled price', () => {
    render(
      <GpsInspectorBody
        subject={{ id: 'e-1', client: 'Acme', feeCents: 1 }}
        lens={() => ({
          kind: 'engagement',
          title: 'Acme',
          fields: [{ label: 'Fee', value: '$1', standing: { kind: 'placeholder', awaitingTodo: 'a decision nobody recorded' } }],
          refusals: [],
          links: [],
        })}
      />,
    );
    const row = document.querySelector('[data-field="Fee"]')!;
    expect(row.textContent).toContain(UNKNOWN_TODO_NOTICE);
    // The claim is quoted so it can be traced back to the lens that made it.
    expect(row.textContent).toContain('a decision nobody recorded');
  });

  it('distinguishes unreviewed from placeholder — real text nobody with authority has read', () => {
    const counselTodo = CATALOGUE_TODOS.find((t) => t.owner === 'founder+counsel')!;
    render(
      <GpsInspectorBody
        subject={{}}
        lens={() => ({
          kind: 'perimeter position',
          title: 'Exclusion 3',
          fields: [{ label: 'Line', value: 'No market-making representation.', standing: { kind: 'unreviewed', awaitingTodo: counselTodo.what } }],
          refusals: [],
          links: [],
        })}
      />,
    );
    const row = document.querySelector('[data-field="Line"]')!;
    expect(row.textContent).toContain('Not reviewed by the authority that must');
    expect(row.textContent).not.toContain('Placeholder, not measured');
    expect(row.textContent).toContain(counselTodo.owner);
  });

  it('shows an em-dash and the reason when there is no column at all', () => {
    render(
      <GpsInspectorBody
        subject={{}}
        lens={() => ({
          kind: 'aging bracket',
          title: '61-90 days',
          fields: [{ label: 'Invoices', value: 'four', standing: { kind: 'absent', whyNoColumn: 'AgingBracket carries count and amountCents and no engagement ids (book.ts:972)' } }],
          refusals: [],
          links: [],
        })}
      />,
    );
    const row = document.querySelector('[data-field="Invoices"]')!;
    // The value a caller passed is NOT shown: there is no column, so there is nothing to show.
    expect(row.textContent).not.toContain('four');
    expect(row.textContent).toContain('No column');
    expect(row.textContent).toContain('book.ts:972');
  });
});

describe('the grade is derived from the fields on the same screen', () => {
  it('grades measured only when every field is measured or derived', () => {
    expect(gpsProvenanceGrade([
      field({ kind: 'measured', source: 't.c' }),
      field({ kind: 'derived', from: 'f()' }),
    ])).toBe('measured');
  });

  it('grades compiled on a placeholder or an unreviewed field', () => {
    expect(gpsProvenanceGrade([field({ kind: 'placeholder', awaitingTodo: REAL_TODO })])).toBe('compiled');
    expect(gpsProvenanceGrade([field({ kind: 'unreviewed', awaitingTodo: REAL_TODO })])).toBe('compiled');
  });

  it('lets absent outrank placeholder, because a migration cannot be replaced by a decision', () => {
    expect(gpsProvenanceGrade([
      field({ kind: 'placeholder', awaitingTodo: REAL_TODO }),
      field({ kind: 'absent', whyNoColumn: 'no column' }),
    ])).toBe('unbacked');
  });

  it('states the grade and the count that produced it, so it can be checked by eye', () => {
    render(
      <GpsInspectorBody subject={{ id: 'e-1', client: 'Acme', feeCents: 100 }} lens={engagementLens} />,
    );
    expect(screen.getByText(/Provenance · PART COMPILED/)).toBeTruthy();
    expect(screen.getByText(/1 of the 3 fields below is a constant compiled into the app/)).toBeTruthy();
  });

  it('does not let a refusal change the grade — they answer different questions', () => {
    render(
      <GpsInspectorBody
        subject={{}}
        lens={() => ({
          kind: 'engagement',
          title: 'Acme',
          fields: [field({ kind: 'measured', source: 'gps_engagement.id' })],
          refusals: [{ id: 'r1', sentence: 'No partner on the bench can take this offer.', rule: 'no_capable_partner — partners.ts acceptEngagement()' }],
          links: [],
        })}
      />,
    );
    expect(screen.getByText(/Provenance · MEASURED/)).toBeTruthy();
  });
});

describe('a refusal is a sentence plus the rule that refused', () => {
  it('renders both, with the rule cited under the sentence', () => {
    render(
      <GpsInspectorBody
        subject={{}}
        lens={() => ({
          kind: 'engagement', title: 'Acme',
          fields: [field({ kind: 'measured', source: 'x.y' })],
          refusals: [{ id: 'r1', sentence: 'Every partner who could take this is at capacity until the 14th.', rule: 'bench_at_capacity — partners.ts:610' }],
          links: [],
        })}
      />,
    );
    const row = document.querySelector('[data-refusal="r1"]')!;
    expect(row.textContent).toContain('at capacity until the 14th');
    expect(row.textContent).toContain('Rule ·');
    expect(row.textContent).toContain('bench_at_capacity — partners.ts:610');
  });

  it('refuses to present a bare code as the message, and keeps the code traceable', () => {
    render(
      <GpsInspectorBody
        subject={{}}
        lens={() => ({
          kind: 'engagement', title: 'Acme',
          fields: [field({ kind: 'measured', source: 'x.y' })],
          refusals: [{ id: 'r1', sentence: 'no_usable_rate_card', rule: 'partners.ts acceptEngagement()' }],
          links: [],
        })}
      />,
    );
    const row = document.querySelector('[data-refusal="r1"]')!;
    expect(row.textContent).toContain(BARE_CODE_NOTICE);
    expect(row.textContent).toContain('code as supplied: no_usable_rate_card');
  });

  it('knows a sentence from an identifier', () => {
    expect(looksLikeBareCode('bench_at_capacity')).toBe(true);
    expect(looksLikeBareCode('GPS-412')).toBe(true);
    expect(looksLikeBareCode('No partner can take this.')).toBe(false);
  });

  it('says plainly that no refusal standing is not a clearance', () => {
    render(<GpsInspectorBody subject={{ ref: 'g-1', missing: 'x' }} lens={gapLens} />);
    expect(screen.getByText(/not a clearance/)).toBeTruthy();
  });
});

describe('what the object is linked to', () => {
  it('opens a link that is reachable and marks one that is not', () => {
    const onOpen = vi.fn();
    render(
      <GpsInspectorBody
        subject={{}}
        lens={() => ({
          kind: 'engagement', title: 'Acme',
          fields: [field({ kind: 'measured', source: 'x.y' })],
          refusals: [],
          links: [
            { label: 'Conflict check', onOpen },
            { label: 'Signed SOW', detail: 'in the client\'s system' },
          ],
        })}
      />,
    );
    act(() => { (document.querySelector('[data-link="Conflict check"] button') as HTMLElement).click(); });
    expect(onOpen).toHaveBeenCalledTimes(1);
    const named = document.querySelector('[data-link="Signed SOW"]')!;
    expect(named.querySelector('button')).toBeNull();
    expect(named.textContent).toContain('not openable from this desk');
  });
});

describe('the drawer container', () => {
  it('names the object in the dialog and returns focus to the row on Escape', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <GpsInspector
        subject={{ id: 'e-1', client: 'Acme', feeCents: 100 }}
        lens={engagementLens}
        onClose={() => unmount()}
      />,
    );
    expect(screen.getByRole('dialog', { name: /engagement · Acme/i })).toBeTruthy();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    // Deferred a frame by `lib/dismiss.ts`, which is the mechanism this composition buys
    // by using the house drawer rather than rolling its own.
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(document.activeElement).toBe(opener);
        opener.remove();
        resolve();
      });
    });
  });

  it('does not offer the ⌘\\ dock button, which would announce a key that moves something else', () => {
    render(
      <GpsInspector subject={{ id: 'e-1', client: 'Acme', feeCents: 100 }} lens={engagementLens} onClose={() => {}} />,
    );
    // `InspectorDrawer`'s dock button hard-codes ⌘\ in its label and tooltip because it
    // moves the UNIVERSAL inspector. GPS rows are not in `useInspectorStore`, so that key
    // would do nothing here and the button would be a lie.
    expect(screen.queryByLabelText(/Dock the evidence beside the surface/i)).toBeNull();
  });
});
