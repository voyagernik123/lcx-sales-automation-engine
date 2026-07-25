/**
 * The client half of the ⌘K reachability gate.
 *
 * `coverage.test.ts` next door probes `verbsFor` with a noun it INVENTS from
 * `action.subjectTypes`, so it can only ever confirm that the registry agrees
 * with itself — which is why it stayed green while ⌘K reached 7 of 22 actions.
 * These tests go through `nounFromSearchResult`, the function the command line
 * actually builds its noun with, so a translation reintroduced there fails here.
 *
 * The other half — "and GET /v1/search can really emit such a group" — cannot be
 * asserted from this package: search.ts lives in `apps/api`. It is asserted there,
 * in `apps/api/src/routes/__tests__/searchActionBoundary.test.ts`, against the
 * real route. Neither test is sufficient alone and both are cheap.
 */

import { describe, it, expect } from 'vitest';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import { nounFromSearchResult, verbsFor, type Principal } from '@/components/command/grammar';
import { searchTypeLabel, INSPECTOR_TO_OBJECT } from '@/lib/objectRegistry';

/** The most capable principal: if a verb is absent for them, it is unreachable. */
const OMNIPOTENT: Principal = {
  role: 'approver',
  entitlements: {
    command: 'approve', sales: 'approve', intel: 'approve',
    regulatory: 'approve', distribution: 'approve', governance: 'approve',
  },
};

const ITEM = { id: 'probe-1', label: 'Probe object' };

/** Every subject type the registry addresses by name. */
const REGISTRY_SUBJECT_TYPES = [
  ...new Set(ACTION_MANIFEST.actions.flatMap((a) => a.subjectTypes).filter((t) => t !== '*')),
].sort();

describe('nounFromSearchResult', () => {
  it('uses the search group subject type verbatim', () => {
    const noun = nounFromSearchResult({ subjectType: 'command_decision' }, ITEM);
    expect(noun).toEqual({ type: 'command_decision', id: 'probe-1', label: 'Probe object', state: undefined });
  });

  it('does NOT translate an actionable subject type through the inspector map', () => {
    // The defect, pinned. `deal` is the one name the two vocabularies share, so a
    // mapping bug hides behind it; `command_decision` has no inspector at all and
    // any translation attempt would produce `undefined` or a reading type.
    const noun = nounFromSearchResult({ subjectType: 'command_partner', inspector: 'project' }, ITEM);
    expect(noun?.type).toBe('command_partner');
    expect(Object.values(INSPECTOR_TO_OBJECT)).not.toContain(noun?.type);
  });

  it('carries the item state through, so preconditions can be evaluated', () => {
    const noun = nounFromSearchResult(
      { subjectType: 'command_decision' },
      { ...ITEM, seed: { status: 'decided' } },
    );
    expect(noun?.state).toEqual({ status: 'decided' });
  });

  it('falls back to the inspector map when an older API omits subjectType', () => {
    // Deploy skew, not a supported shape: it must degrade to the PREVIOUS
    // behaviour rather than to a noun with no type and therefore no verbs at all.
    const noun = nounFromSearchResult({ inspector: 'project' }, ITEM);
    expect(noun?.type).toBe('project');
  });

  it('resolves to nothing at all rather than guessing, when it cannot know', () => {
    expect(nounFromSearchResult({}, ITEM)).toBeNull();
  });
});

describe('every registry subject type reaches its verbs through a search noun', () => {
  it.each(REGISTRY_SUBJECT_TYPES)('%s', (subjectType) => {
    const noun = nounFromSearchResult({ subjectType }, ITEM);
    expect(noun, `no noun could be built for '${subjectType}'`).not.toBeNull();

    const offered = new Set(verbsFor(ACTION_MANIFEST, noun!, OMNIPOTENT).map((v) => v.action.id));
    const expected = ACTION_MANIFEST.actions
      .filter((a) => a.subjectTypes.includes(subjectType))
      .map((a) => a.id);

    const missing = expected.filter((id) => !offered.has(id));
    expect(
      missing,
      `these actions name '${subjectType}' but are not offered on a search result of that type`,
    ).toEqual([]);
  });

  it('covers the whole registry vocabulary, not a subset of it', () => {
    // Guards the guard: `it.each` over an empty or shrunken list would pass
    // silently. 13 named subject types across 22 actions today.
    expect(REGISTRY_SUBJECT_TYPES.length).toBeGreaterThanOrEqual(13);
    expect(REGISTRY_SUBJECT_TYPES).toContain('command_decision');
    expect(REGISTRY_SUBJECT_TYPES).toContain('member');
    expect(REGISTRY_SUBJECT_TYPES).not.toContain('*');
  });
});

describe('searchTypeLabel', () => {
  it('prefers the object registry when the object has a reader', () => {
    // So a server-side label edit cannot make ⌘K disagree with the rest of the app
    // about what a "Project" is called.
    expect(searchTypeLabel({ inspector: 'project', typeLabel: 'Something else' })).toBe('Project');
  });

  it('uses the server label for the actionable-only types, which have no reader', () => {
    expect(searchTypeLabel({ subjectType: 'command_requirement', typeLabel: 'Listing requirement' }))
      .toBe('Listing requirement');
  });

  it('falls back to the subject type rather than rendering a blank chip', () => {
    expect(searchTypeLabel({ subjectType: 'command_blocker' })).toBe('command_blocker');
  });

  it('survives an inspector name this build does not know', () => {
    // A newer API adding an inspector type used to be `undefined.label` — a crash
    // that blanks the entire command line, not one chip.
    expect(searchTypeLabel({ inspector: 'brand_new' as never, typeLabel: 'Brand new' })).toBe('Brand new');
  });
});
