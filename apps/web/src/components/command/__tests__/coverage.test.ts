/**
 * The Phase 3 gate: EVERY governed action must be reachable through the command
 * line. Not "most", and not "the ones someone remembered to wire".
 *
 * This is the assertion that makes the grammar complete by construction rather
 * than by diligence. Adding a 23rd action to the registry without a subject type
 * the command line can resolve will fail here, naming the action.
 */

import { describe, it, expect } from 'vitest';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import { verbsFor, promptsFor, type Principal } from '@/components/command/grammar';

/** The most capable principal: if an action is unreachable for them, it is unreachable. */
const OMNIPOTENT: Principal = {
  role: 'approver',
  entitlements: {
    command: 'approve',
    sales: 'approve',
    intel: 'approve',
    regulatory: 'approve',
    distribution: 'approve',
    governance: 'approve',
  },
};

describe('every governed action is reachable', () => {
  it('each action appears for at least one subject type, unblocked', () => {
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
