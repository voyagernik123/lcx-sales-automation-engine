import { useEffect, useState } from 'react';

/**
 * THE JURISDICTION NARRATIVE, OUT OF THE ENTRY CHUNK.
 *
 * `states.ts` is imported by six or more DYNAMIC chunks (Dashboard, BriefGenerator,
 * OntologyExplorer, StateMap, CommandBody, the competition components), and Rollup hoists a
 * module shared across dynamic chunks into their common ancestor — the ENTRY. So every
 * operator downloaded and parsed all 50 states' regulatory prose before first paint, on every
 * page, whether or not they ever opened a jurisdiction. Measured: 31.7KB of the 41KB of field
 * data in that array was `notes` + `primaryPainPoint` + `sandboxNotes`.
 *
 * Three packaging fixes were tried first and all three failed — see the note above
 * `MAX_CHUNK_KB` in `scripts/check-bundle.mjs`, which records the numbers. A `manualChunks`
 * rule made it WORSE (835 → ~902KB) because a static import from the shell earns a
 * `modulepreload` in index.html and therefore still counts as initial weight. The fix is not
 * a chunking rule: prose is not code, and this module is the fetch boundary that keeps it out.
 *
 * WHY `import()` AND NOT `fetch('/data/...')`: the dynamic import gives a content-hashed
 * filename (so a narrative edit cannot be served stale from a CDN edge), it is the pattern the
 * GL components already use (`void import('@lcx/gl')`), and it needs no network stub in tests.
 * It must stay DYNAMIC. A static `import narrative from './stateNarrative.json'` anywhere in
 * this app re-creates the exact bug this file exists to fix, because two lazy pages sharing it
 * is all it takes for Rollup to hoist it back into the entry.
 *
 * WHAT THIS MODULE MUST NEVER DO: make the structured lookup asynchronous.
 * `JurisdictionInspector` does one `states.find` on `abbreviation` and renders status, regime,
 * phase, priority and regulator SYNCHRONOUSLY. Only the prose waits.
 */

/** The three prose fields that used to sit on every `State`. */
export interface StateNarrative {
  /** Every one of the 50 jurisdictions has this. An absent one is a defect, not an empty field. */
  readonly notes: string;
  readonly primaryPainPoint?: string;
  /** Genuinely absent for 5 of 50 — "no sandbox note recorded" is a real answer here. */
  readonly sandboxNotes?: string;
}

export type StateNarrativeTable = Readonly<Record<string, StateNarrative>>;

/**
 * THE TWO CODES, AND WHY THEY ARE NOT ONE.
 *
 * A refusal on this screen has to be matchable in a log and distinguishable from its
 * neighbour, per the doctrine `pages/Readout.tsx` sets out. These name genuinely different
 * events with different remedies:
 *
 *   NOT_LOADED  the asset never arrived — offline, a stale deploy whose hashed chunk is gone,
 *               a blocked request. Retryable, and says nothing about the jurisdiction.
 *   NO_ENTRY    the asset arrived and does not contain this jurisdiction. That is the
 *               structured list and the narrative asset disagreeing, i.e. a data defect that
 *               a retry cannot fix. `stateNarrative.test.tsx` exists to stop it reaching prod.
 */
export const NARRATIVE_NOT_LOADED = 'STATE_NARRATIVE_NOT_LOADED';
export const NARRATIVE_NO_ENTRY = 'STATE_NARRATIVE_NO_ENTRY';

/** The rule a refusal here cites, worded as the other refusal panels word theirs. */
export const RULE_ABSENT_REFUSES = {
  instrument: 'house_doctrine',
  provision: 'Absent data refuses',
  text:
    'Absent data refuses. A narrative that could not be fetched is NOT a jurisdiction with '
    + 'nothing recorded against it, and a blank panel must never be readable as one.',
} as const;

/**
 * FOUR STATES THAT NEVER COLLAPSE INTO ONE. The failure this shape prevents is the one rule 6
 * exists for: an empty panel that actually means "the network failed", read by an operator as
 * "this jurisdiction has no recorded pain point". `ready` carries a narrative that is present
 * by construction, so a caller cannot reach for `.notes` on a fault and get `undefined`.
 */
export type StateNarrativeRead =
  | { readonly state: 'loading' }
  | { readonly state: 'fault'; readonly code: string; readonly message: string }
  | { readonly state: 'ready'; readonly narrative: StateNarrative };

export type StateNarrativeTableRead =
  | { readonly state: 'loading' }
  | { readonly state: 'fault'; readonly code: string; readonly message: string }
  | { readonly state: 'ready'; readonly table: StateNarrativeTable };

/* Module-scope so the 35KB asset is parsed once per session, not once per panel. */
let loaded: StateNarrativeTable | null = null;
let inFlight: Promise<StateNarrativeTable> | null = null;

/**
 * Loads (once) the narrative table. Rejects if the asset cannot be fetched.
 *
 * A FAILURE IS NOT MEMOISED. `inFlight` is cleared on rejection so the next panel that opens
 * retries: a dropped connection would otherwise poison the narrative for the whole session,
 * turning one transient failure into a permanent refusal on every jurisdiction.
 */
export function loadStateNarrative(): Promise<StateNarrativeTable> {
  if (loaded !== null) return Promise.resolve(loaded);
  if (inFlight === null) {
    inFlight = import('./stateNarrative.json')
      .then((mod) => {
        const table = (mod.default ?? mod) as StateNarrativeTable;
        loaded = table;
        return table;
      })
      .catch((err: unknown) => {
        inFlight = null;
        throw err;
      });
  }
  return inFlight;
}

/** Test seam only: forget the memoised table so a fault path can be exercised twice. */
export function resetStateNarrativeCache(): void {
  loaded = null;
  inFlight = null;
}

const faultMessage = (err: unknown): string =>
  `The jurisdiction narrative asset could not be fetched (${
    err instanceof Error ? err.message : String(err)
  }).`;

/** The whole table, for surfaces that render every jurisdiction at once (the memo). */
export function useStateNarrativeTable(): StateNarrativeTableRead {
  /* Starts at `ready` when the asset is already in memory, so a second panel in the same
     session does not flash a loading line at an operator for data that is already here. */
  const [read, setRead] = useState<StateNarrativeTableRead>(() =>
    loaded !== null ? { state: 'ready', table: loaded } : { state: 'loading' },
  );

  useEffect(() => {
    if (read.state === 'ready') return;
    let live = true;
    void loadStateNarrative().then(
      (table) => {
        if (live) setRead({ state: 'ready', table });
      },
      (err: unknown) => {
        if (live) setRead({ state: 'fault', code: NARRATIVE_NOT_LOADED, message: faultMessage(err) });
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return read;
}

/**
 * One jurisdiction's narrative, by `abbreviation` — the same key the structured lookup uses.
 *
 * `abbreviation` IS REQUIRED, and that is a deliberate constraint on callers: a component that
 * may have no jurisdiction selected must not call this at all, it must render a child component
 * that only exists when there is one. `JurisdictionInspector` early-returns for non-US market
 * codes, so a hook called after that branch would change the hook count between renders and
 * React would throw "rendered fewer hooks than expected" the moment an operator opened LI or SG
 * after a US state. Hence `StateNotes` here and `JurisdictionNarrative` in
 * `ExtendedInspectors.tsx` as separate components, rather than an optional argument here.
 */
export function useStateNarrative(abbreviation: string): StateNarrativeRead {
  const table = useStateNarrativeTable();
  if (table.state !== 'ready') return table;

  const entry = table.table[abbreviation];
  if (entry === undefined) {
    return {
      state: 'fault',
      code: NARRATIVE_NO_ENTRY,
      message:
        `The narrative asset loaded and holds no entry for ${abbreviation}. `
        + 'The structured list and the narrative asset disagree; this is a data defect, not an '
        + 'empty field.',
    };
  }
  return { state: 'ready', narrative: entry };
}

/**
 * THE OPERATIONAL-NOTES PARAGRAPH, for the two panels that render exactly that.
 *
 * A component and not a string, because there is no string to return while the asset is in
 * flight and every honest answer to "what goes here meanwhile" is markup. Callers that render
 * this only when they hold a jurisdiction satisfy the hook rule described on
 * `useStateNarrative`.
 */
export function StateNotes({
  state,
  className,
}: {
  readonly state: { readonly abbreviation: string; readonly name: string };
  readonly className?: string;
}) {
  const read = useStateNarrative(state.abbreviation);
  if (read.state !== 'ready') {
    return <NarrativeGap read={read} subject={`${state.name}'s operational notes`} />;
  }
  return (
    <p className={className} data-testid="state-notes">
      {read.narrative.notes}
    </p>
  );
}

/**
 * THE ONE SHAPE A MISSING NARRATIVE TAKES, wherever it is missing.
 *
 * It ships beside the loader rather than as a UI atom on purpose: three screens render this
 * prose, and a refusal invented separately on each of them is how one of them ends up
 * rendering nothing at all. `subject` names what is missing ("Alabama's operational notes"),
 * because "NOT LOADED" on its own does not tell an operator which panel lied to them.
 *
 * Never returns `null`: a component that renders nothing while loading, on a panel whose
 * neighbouring fields are already filled in, reads as "there is nothing recorded here".
 */
export function NarrativeGap({
  read,
  subject,
}: {
  readonly read: { readonly state: 'loading' } | { readonly state: 'fault'; readonly code: string; readonly message: string };
  readonly subject: string;
}) {
  if (read.state === 'loading') {
    return (
      <p
        data-testid="narrative-loading"
        aria-busy="true"
        className="font-mono text-[10px] uppercase tracking-wider text-grey"
      >
        {subject} — loading…
      </p>
    );
  }
  return (
    <div
      data-testid="narrative-fault"
      className="rounded-lg border border-status-blocked/40 bg-status-blocked-bg/40 p-2 text-label"
    >
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-status-blocked">
        NOT LOADED · {read.code}
      </p>
      <p className="mt-1 text-navy">
        {subject} could not be read. {read.message} This is a fault, not a finding — it does not
        mean nothing is recorded for this jurisdiction.
      </p>
      <p className="mt-1 text-micro text-grey-dark">
        Rule:{' '}
        <span className="font-mono">
          {RULE_ABSENT_REFUSES.instrument} · {RULE_ABSENT_REFUSES.provision}
        </span>
        {' — '}
        {RULE_ABSENT_REFUSES.text}
      </p>
    </div>
  );
}
