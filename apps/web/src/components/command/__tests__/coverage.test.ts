/**
 * NOT THE REACHABILITY GATE. It was labelled as one and it never was.
 *
 * What this file checks is that the registry is INTERNALLY consistent: every
 * action declares a subject type, `verbsFor` offers it when handed a noun of that
 * type, every required param gets a prompt, every action has readable prose. All
 * worth checking, and all of it passed while ⌘K reached 7 of 22 governed actions
 * — measured in a browser — because the first test below builds its probe noun
 * FROM `action.subjectTypes`. It asks whether the registry agrees with itself,
 * and the answer to that is yes by construction.
 *
 * The question it looked like it was asking — can an operator actually put such a
 * subject in front of the command line — needs the other side of the boundary:
 *
 *   apps/api/src/routes/__tests__/searchActionBoundary.test.ts
 *     ACTION_REGISTRY × the groups GET /v1/search can emit. Both real, both in
 *     that package, which is why the assertion lives there.
 *   ./searchNoun.test.ts
 *     the same reachability question through `nounFromSearchResult` — the
 *     function the command line really builds its noun with — rather than
 *     through a noun a test invented.
 *
 * Keep this file for what it does prove. Do not read a green run here as the
 * gate; that mistake is the whole reason the gate was false for a phase.
 */

import { describe, it, expect } from 'vitest';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import { verbsFor, promptsFor, type Principal } from '@/components/command/grammar';
import { DESTINATIONS } from '@/lib/destinations';
import { COMMAND_CODES, PAGE_COMMANDS, rankPaletteRows } from '@/components/command/CommandBody';

/**
 * The most capable principal: if an action is unreachable for them, it is unreachable.
 *
 * MUST list every compartment in the constitution, and it did not — `marketing`
 * was missing, and `gps` was missing until GPS Phase 1 added five workspace-tagged
 * actions and turned the omission into five failures. A compartment absent here
 * makes its actions look unreachable when the only thing that is missing is the
 * grant on this fixture, which sends the reader looking for a bug in `verbsFor`.
 *
 * Deliberately still a literal rather than `WORKSPACE_IDS.map(…)`: the whole
 * premise of the file's header is that a test built out of the thing it checks
 * proves nothing, and a derived principal would silently absorb the next
 * compartment too.
 */
const OMNIPOTENT: Principal = {
  role: 'approver',
  entitlements: {
    command: 'approve',
    sales: 'approve',
    intel: 'approve',
    regulatory: 'approve',
    distribution: 'approve',
    marketing: 'approve',
    gps: 'approve',
    governance: 'approve',
  },
};

describe('the registry is internally consistent', () => {
  it('each action appears for at least one subject type, unblocked — SELF-REFERENTIAL, see header', () => {
    const unreachable: string[] = [];

    for (const action of ACTION_MANIFEST.actions) {
      // '*' actions apply to any noun; otherwise try each declared subject type.
      const types = action.subjectTypes.includes('*') ? ['project'] : action.subjectTypes;
      const reachable = types.some((type) =>
        verbsFor(ACTION_MANIFEST, { type, id: 'probe', label: 'Probe' }, OMNIPOTENT).some(
          (v) => v.action.id === action.id && v.blocked === null,
        ),
      );
      if (!reachable) unreachable.push(`${action.id} (subjectTypes: ${action.subjectTypes.join(', ')})`);
    }

    expect(unreachable, 'these governed actions cannot be reached from the command line').toEqual([]);
  });

  it('each action can be fully specified — no required param without a prompt', () => {
    const broken: string[] = [];

    for (const action of ACTION_MANIFEST.actions) {
      const prompts = promptsFor(action, ACTION_MANIFEST.valueSets);
      const prompted = new Set(prompts.map((p) => p.name));
      for (const required of action.params.required ?? []) {
        // A required param with no prompt means the operator can reach the verb but
        // can never satisfy it — a dead end that looks like a working command.
        if (!prompted.has(required)) broken.push(`${action.id}.${required}`);
      }
    }

    expect(broken, 'required params with no prompt — the command would always fail').toEqual([]);
  });

  it('no required param is left as unconstrained free text where a value set exists', () => {
    // Not a hard failure, but worth pinning: a closed set rendered as free text is
    // how an operator ends up typing a value the server will reject.
    const freeText: string[] = [];
    for (const action of ACTION_MANIFEST.actions) {
      for (const p of promptsFor(action, ACTION_MANIFEST.valueSets)) {
        if (!p.required || p.type !== 'string') continue;
        const declaresSet = action.grammar.enumFrom?.[p.name] !== undefined;
        if (declaresSet && (!p.choices || p.choices.length === 0)) {
          freeText.push(`${action.id}.${p.name}`);
        }
      }
    }
    expect(freeText, 'declares a runtime value set but resolved to no choices').toEqual([]);
  });

  it('every action carries a label and description an operator can read', () => {
    for (const a of ACTION_MANIFEST.actions) {
      expect(a.label.length, a.id).toBeGreaterThan(3);
      expect(a.description.length, a.id).toBeGreaterThan(10);
      // A label that is just the id is not a label.
      expect(a.label).not.toBe(a.id);
    }
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  CAN AN OPERATOR REACH THE PLACE AT ALL? — added by GPS Phase 11
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This one is NOT self-referential, which is the header's whole complaint about the block
 * above: it crosses two independently maintained tables. `DESTINATIONS` is where a place
 * exists (the native menu, the `g` chord, the cheat card, the tour); `PAGE_COMMANDS` +
 * `COMMAND_CODES` is where ⌘K can find it. Two compartments have already shipped into the
 * first and not the second — marketing in M9 and GPS in Phase 1 — each producing surfaces
 * reachable only by an operator who already knew the chord. Both are generated now, and
 * nothing stopped either from happening except somebody noticing.
 *
 * SO THE GAP IS PINNED RATHER THAN ASSERTED AWAY. Six destinations are still absent and
 * every one of them predates both grammar files; the exact list is below with what it costs.
 * A ratchet that demanded zero would have to be satisfied by inventing six page rows for
 * five compartments this pass does not own, which is how a gate gets weakened to green. A
 * ratchet on the exact set fails on a NEW absence, which is the failure that matters.
 */
describe('every destination is reachable from the command line', () => {
  /**
   * Where ⌘K can take an operator who types the destination's own name.
   *
   * THROUGH THE REAL RANKER, not by reading `PAGE_COMMANDS` for a matching `to`: a row that
   * exists in the table and is never ranked is not reachable, and that is the difference
   * between this and a test of an array. The query is the destination's LABEL — what an
   * operator who wants to go there would type — so a row present under some other word
   * does not count either.
   */
  function palettePaths(): Set<string> {
    const found = DESTINATIONS.flatMap((d) =>
      rankPaletteRows({
        query: d.label,
        allCommands: PAGE_COMMANDS,
        objectResults: [],
        marketingReplies: [],
        gpsEngagements: [],
      }).map((r) => r.to),
    );
    // Codes count too: `q` reaches the BD engine whatever its page row says.
    return new Set([...found, ...COMMAND_CODES.map((c) => c.to.split('?')[0]!)]);
  }

  /**
   * The six that were already missing, with the cost of each. NOT an allowance for future
   * ones: the assertion is equality, so a seventh fails and a fixed one fails too — and the
   * correct response to the second kind of failure is to delete the line.
   */
  const ABSENT_BEFORE_THIS_PHASE: readonly string[] = [
    '/command',              // INTELLIGENCE — the compartment root
    '/command-deck',         // US COMMAND — the compartment root
    '/distribution',         // DISTRIBUTION — the compartment root
    '/practice',             // PRACTICE RANGE — the sandbox the plan says nobody will find
    '/regulatory-dashboard', // REGULATORY TOOLKIT — the compartment root
    '/wbr',                  // GOVERNANCE — the compartment root
  ];

  it('reaches every GPS and marketing destination — the two gaps that were closed', () => {
    const reachable = palettePaths();
    const missing = DESTINATIONS
      .filter((d) => d.path.startsWith('/gps') || d.path.startsWith('/marketing'))
      .map((d) => d.path)
      .filter((p) => !reachable.has(p));
    expect(missing, 'a generated compartment destination is not reachable from ⌘K').toEqual([]);
  });

  it('leaves exactly the six that predate the generators, and no more', () => {
    const reachable = palettePaths();
    const missing = DESTINATIONS.map((d) => d.path).filter((p) => !reachable.has(p)).sort();
    expect(
      missing,
      'a destination is reachable by `g` chord and by the native menu and absent from ⌘K — the '
      + 'defect both grammar files exist to prevent. Generate its row from DESTINATIONS; if one of '
      + 'the six listed here was fixed, delete it from ABSENT_BEFORE_THIS_PHASE instead',
    ).toEqual([...ABSENT_BEFORE_THIS_PHASE]);
  });
});
