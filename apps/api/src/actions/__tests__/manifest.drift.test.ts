/**
 * The drift guard. This is what turns "the command line is generated from the
 * registry" from a convention into a fact.
 *
 * Without it, the failure mode is silent and nasty: someone adds a governed
 * action, or changes an enum, and the client keeps offering the old grammar. No
 * error anywhere — the operator just cannot reach the new capability, or is
 * offered a value the server now rejects.
 *
 * So: add an action, change a param, rename an enum value — and this fails with a
 * diff and a one-line instruction, blocking the push.
 */

import { readFileSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { ACTION_REGISTRY } from '../registry.js';
import { ACTION_GRAMMAR } from '../grammar.js';
import { buildActionManifest, canonicalJson } from '../manifest.js';

const CANONICAL = new URL('../generated/manifest.canonical.json', import.meta.url);
const ARTIFACT = new URL('../../../../web/src/lib/command/generated/actionManifest.ts', import.meta.url);

const REGEN = 'run `npm run gen:actions` — the command grammar is behind the registry';

describe('the generated manifest matches the registry', () => {
  it('the canonical bytes are current', () => {
    expect(existsSync(CANONICAL), `${CANONICAL.pathname} missing — ${REGEN}`).toBe(true);
    const onDisk = readFileSync(CANONICAL, 'utf8');
    const fresh = canonicalJson(buildActionManifest());
    expect(onDisk, REGEN).toBe(fresh);
  });

  it('the web artifact exists and carries the same hash', () => {
    expect(existsSync(ARTIFACT), `${ARTIFACT.pathname} missing — ${REGEN}`).toBe(true);
    const src = readFileSync(ARTIFACT, 'utf8');
    const { manifestHash } = buildActionManifest();
    expect(src, REGEN).toContain(manifestHash);
  });

  it('is a bijection with the registry — no action silently filtered', () => {
    const manifestIds = buildActionManifest().actions.map((a) => a.id).sort();
    const registryIds = Object.keys(ACTION_REGISTRY).sort();
    expect(manifestIds).toEqual(registryIds);
  });

  it('every registry action keeps its id as its key', () => {
    // A mismatch here would make the manifest address an action the invoke route
    // cannot find, producing a 404 from a command the UI happily offered.
    for (const [key, action] of Object.entries(ACTION_REGISTRY)) {
      expect(action.id, `${key} declares id '${action.id}'`).toBe(key);
    }
  });

  it('is deterministic — the same input twice produces identical bytes', () => {
    // If this flaps, the byte-identity assertion above becomes noise and someone
    // will delete it. That is how a guard like this usually dies.
    expect(canonicalJson(buildActionManifest())).toBe(canonicalJson(buildActionManifest()));
  });
});

describe('the grammar annotations describe real actions', () => {
  it('every annotated id exists in the registry', () => {
    for (const id of Object.keys(ACTION_GRAMMAR)) {
      expect(ACTION_REGISTRY[id], `ACTION_GRAMMAR has '${id}' which is not an action`).toBeDefined();
    }
  });

  it('every annotated param name exists in that action’s schema', () => {
    const manifest = buildActionManifest();
    for (const action of manifest.actions) {
      const props = Object.keys(action.params?.properties ?? {});
      if (props.length === 0) continue;
      const named = [
        ...Object.keys(action.grammar.paramKinds ?? {}),
        ...Object.keys(action.grammar.omitSemantics ?? {}),
        ...Object.keys(action.grammar.enumFrom ?? {}),
        ...(action.grammar.atLeastOneOf ?? []).flat(),
      ];
      for (const name of named) {
        // A typo here is a silent no-op: the annotation would never apply and the
        // prompt would quietly lose its secret masking or its required-one-of rule.
        expect(props, `${action.id}: annotation names '${name}', schema has ${props.join(', ')}`).toContain(name);
      }
    }
  });

  it('every runtime value set named by enumFrom is populated', () => {
    const { actions, valueSets } = buildActionManifest();
    for (const a of actions) {
      for (const [param, source] of Object.entries(a.grammar.enumFrom ?? {})) {
        const set = valueSets[source];
        expect(set, `${a.id}.${param} sources '${source}' which has no value set`).toBeDefined();
        // An empty set would silently make the param unfillable in the UI.
        expect(set.length, `${a.id}.${param}: value set '${source}' is empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe('secrets and overrides are marked, not generic', () => {
  it('any param that looks like a credential is annotated as a secret', () => {
    const manifest = buildActionManifest();
    for (const a of manifest.actions) {
      for (const name of Object.keys(a.params?.properties ?? {})) {
        if (!/passcode|password|secret|token(?!Incentivized)/i.test(name)) continue;
        expect(
          a.grammar.paramKinds?.[name],
          `${a.id}.${name} looks like a credential but is not marked 'secret' — a generated prompt would render it as plain text`,
        ).toBe('secret');
      }
    }
  });

  it('any override flag is annotated, so it can never be offered casually', () => {
    const manifest = buildActionManifest();
    for (const a of manifest.actions) {
      for (const name of Object.keys(a.params?.properties ?? {})) {
        if (!/^override[A-Z]/.test(name)) continue;
        if (name.toLowerCase().endsWith('reason')) continue;
        expect(
          a.grammar.paramKinds?.[name],
          `${a.id}.${name} is an override and must be marked so the grammar cannot present it as an ordinary field`,
        ).toBe('override');
      }
    }
  });

  it('an action with an override also has a reason param', () => {
    // Accepting risk without recording why is the one thing the audit cannot
    // tolerate. registry.ts enforces it at runtime; this catches a new action
    // that forgets to offer the field at all.
    const manifest = buildActionManifest();
    for (const a of manifest.actions) {
      const kinds = a.grammar.paramKinds ?? {};
      const hasOverride = Object.values(kinds).includes('override');
      if (!hasOverride) continue;
      expect(
        Object.values(kinds),
        `${a.id} takes an override but declares no 'reason' param`,
      ).toContain('reason');
    }
  });
});
