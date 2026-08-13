import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateInspectorPanel } from '@/components/shared/StateInspectorPanel';
import { states } from '@/data';
import {
  NARRATIVE_NOT_LOADED,
  NARRATIVE_NO_ENTRY,
  loadStateNarrative,
  resetStateNarrativeCache,
} from '@/data/stateNarrative';

/**
 * THE NARRATIVE ASSET, AND THE THREE WAYS THIS SPLIT CAN GO WRONG.
 *
 * `notes`, `primaryPainPoint` and `sandboxNotes` left `states.ts` for `stateNarrative.json`
 * because Rollup hoists a module shared across dynamic chunks into the ENTRY chunk, so all
 * 31.7KB of that prose was downloaded before first paint by every operator on every page
 * (initial JS 839 → 808KB when it moved out). The three failure modes that buys:
 *
 *   1. a jurisdiction whose narrative was not carried over — the panel has nothing to show
 *      and the structured list says it should;
 *   2. a fetch that fails rendering as an EMPTY panel, which an operator reads as "nothing is
 *      recorded for this jurisdiction" (rule 6: absent data refuses, it never renders empty);
 *   3. prose creeping back into `states.ts` and quietly re-entering the entry chunk.
 */

const AL = states.find((s) => s.abbreviation === 'AL');
/** FL is one of the five jurisdictions with genuinely no sandbox note (FL, IL, MA, PA, WA). */
const FL = states.find((s) => s.abbreviation === 'FL');

/* `import.meta.url` is an http URL under the jsdom environment, so the repo reads sources
   through `__dirname` (see `components/gps/__tests__/gpsPrint.test.tsx`). */
const SOURCE = readFileSync(join(__dirname, '..', 'states.ts'), 'utf8');

describe('stateNarrative — the asset covers the structured list', () => {
  it('has a non-empty narrative for every jurisdiction in `states`', async () => {
    // ANTI-VACUITY: a loop over an empty list passes every assertion inside it. This suite
    // has to fail if `states` is ever empty, not report green over nothing.
    expect(states.length).toBe(50);
    const table = await loadStateNarrative();
    expect(Object.keys(table).length).toBe(states.length);

    for (const s of states) {
      const entry = table[s.abbreviation];
      expect(entry, `${s.abbreviation} (${s.name}) has no narrative entry`).toBeDefined();
      // `notes` is required for all 50 — an absent one is a defect, not an empty field.
      expect(entry.notes.length, `${s.abbreviation} has empty notes`).toBeGreaterThan(0);
    }
  });

  it('holds no narrative for a jurisdiction the structured list does not have', async () => {
    const table = await loadStateNarrative();
    const known = new Set(states.map((s) => s.abbreviation));
    const orphans = Object.keys(table).filter((k) => !known.has(k));
    // An orphan is how a renamed or deleted jurisdiction leaves prose behind that no screen
    // can ever reach, and it is 700-odd bytes of asset nobody notices.
    expect(orphans).toEqual([]);
  });
});

describe('stateNarrative — prose does not come back to the entry chunk', () => {
  it('declares no prose field on any state record', () => {
    // The type already rejects these (excess-property checks on the array literal), but the
    // type is one edit away from accepting them again and this file is the reason not to.
    for (const field of ['notes', 'primaryPainPoint', 'sandboxNotes']) {
      expect(SOURCE, `${field} is back in states.ts and therefore back in the entry chunk`)
        .not.toMatch(new RegExp(`\\b${field}\\s*:`));
    }
  });

  it('carries no string long enough to be narrative', () => {
    /*
     * MEASURED BOUNDARY, AND ITS BLIND SPOT. The longest structured value in this file is 66
     * chars ("VA Bureau of Financial Institutions (State Corporation Commission)"); the
     * shortest field of prose that used to live here is 73 (a `primaryPainPoint`). 80 leaves
     * room for a longer regulator name without letting `notes` (min 119) back in. It does NOT
     * catch a 73-char pain point smuggled in under a new field name — the field-name check
     * above is what catches the known names, and nothing catches a brand-new prose field
     * shorter than 80 chars. Named so the next reader does not trust this further than it goes.
     */
    const values = [...SOURCE.matchAll(/: "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(500); // 50 rows × ~14 string fields; never assert over nothing
    const long = values.filter((v) => v.length > 80);
    expect(long).toEqual([]);
  });
});

describe('stateNarrative — the structured lookup stays synchronous', () => {
  beforeEach(() => {
    // Otherwise a table already loaded by an earlier test makes the first frame 'ready' and
    // this suite proves nothing about the loading state.
    resetStateNarrativeCache();
  });

  it('renders the facts on the first frame, with the prose still in flight', () => {
    expect(AL).toBeDefined();
    render(<StateInspectorPanel state={AL!} />);

    // No await anywhere in this test: the structured fields are here on frame one, which is
    // the whole constraint. `states.find` must never become a promise.
    expect(screen.getByText('AL Securities Commission')).toBeInTheDocument();
    expect(screen.getByText('Money transmitter')).toBeInTheDocument();
    expect(screen.getByText('$50,000')).toBeInTheDocument();

    // And the prose says it is loading rather than showing an empty slot.
    expect(screen.getAllByTestId('narrative-loading').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('state-notes')).toBeNull();
  });

  it('does not claim a jurisdiction has no sandbox note while the asset is still loading', async () => {
    expect(FL).toBeDefined();
    render(<StateInspectorPanel state={FL!} />);

    // THE RULE-6 CASE. FL genuinely has no sandbox note, so this sentence is TRUE — but only
    // once the asset has arrived. Printed during the fetch it is a claim about the dataset
    // made by a network request that had not finished.
    expect(screen.queryByText(/No sandbox note recorded/i)).toBeNull();

    expect(await screen.findByText(/No sandbox note recorded/i)).toBeInTheDocument();
    expect(screen.queryByTestId('narrative-loading')).toBeNull();
  });

  it('renders the real notes once the asset arrives', async () => {
    expect(AL).toBeDefined();
    render(<StateInspectorPanel state={AL!} />);
    const notes = await screen.findByTestId('state-notes');
    expect(notes.textContent).toMatch(/Standard NMLS money transmitter license/);
  });
});

describe('stateNarrative — a failed fetch refuses', () => {
  afterEach(() => {
    vi.doUnmock('../stateNarrative.json');
    vi.resetModules();
  });

  it('names the fault, cites the rule, and renders no blank panel', async () => {
    /*
     * A chunk that will not load is the real failure being simulated: a stale deploy whose
     * hashed asset is gone, an offline operator, a blocked request. The old code could not
     * have this bug — the prose was in the entry chunk, so if anything rendered at all the
     * prose was there. Moving it out created this state, so it is tested.
     */
    vi.resetModules();
    vi.doMock('../stateNarrative.json', () => {
      throw new Error('simulated chunk-load failure');
    });
    const { StateNotes } = await import('../stateNarrative');
    render(<StateNotes state={{ abbreviation: 'AL', name: 'Alabama' }} />);

    const fault = await screen.findByTestId('narrative-fault');
    expect(fault.textContent).toContain('NOT LOADED');
    expect(fault.textContent).toContain(NARRATIVE_NOT_LOADED);
    expect(fault.textContent).toContain('Absent data refuses');
    expect(fault.textContent).toContain('Alabama');

    // The failure this replaces: a panel that renders nothing, or renders the prose slot empty.
    expect(screen.queryByTestId('state-notes')).toBeNull();
    expect(fault.textContent!.trim().length).toBeGreaterThan(80);
  });

  it('distinguishes "the asset has no entry for this jurisdiction" from "the asset did not load"', async () => {
    vi.resetModules();
    vi.doMock('../stateNarrative.json', () => ({ default: { AK: { notes: 'Alaska only.' } } }));
    const { StateNotes } = await import('../stateNarrative');
    render(<StateNotes state={{ abbreviation: 'AL', name: 'Alabama' }} />);

    const fault = await screen.findByTestId('narrative-fault');
    // Two codes, because the remedies differ: a retry fixes a transport failure and cannot
    // fix a table that disagrees with the structured list.
    expect(fault.textContent).toContain(NARRATIVE_NO_ENTRY);
    expect(fault.textContent).not.toContain(NARRATIVE_NOT_LOADED);
  });

  it('retries after a failure instead of poisoning the whole session', async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock('../stateNarrative.json', () => {
      attempts++;
      if (attempts === 1) throw new Error('first attempt fails');
      return { default: { AL: { notes: 'Recovered on the second attempt.' } } };
    });
    const mod = await import('../stateNarrative');

    // Not matched on message: vitest replaces a throwing mock factory's error with its own
    // "there was an error when mocking a module" text, so only the rejection itself is real.
    await expect(mod.loadStateNarrative()).rejects.toThrow();
    // A memoised rejection would make one dropped connection a permanent refusal on every
    // jurisdiction for the rest of the session.
    await expect(mod.loadStateNarrative()).resolves.toMatchObject({
      AL: { notes: 'Recovered on the second attempt.' },
    });
    expect(attempts).toBe(2);
  });
});
