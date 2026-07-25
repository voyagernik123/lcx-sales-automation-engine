/**
 * The grammar's rules, tested against the REAL generated manifest rather than
 * fixtures — so these break when the registry changes, which is the point.
 *
 * The distinction under test is the one that matters most: what is filtered out
 * (because offering it would be noise or a lie) versus what is shown blocked
 * (because the operator should learn the capability exists and how to get it).
 */

import { describe, it, expect } from 'vitest';
import { ACTION_MANIFEST } from '@/lib/command/generated/actionManifest';
import {
  verbsFor,
  promptsFor,
  validate,
  buildParams,
  blockedExplanation,
  neededCapability,
  type Principal,
} from '@/components/command/grammar';

const APPROVER: Principal = {
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

const OPERATOR: Principal = {
  role: 'operator',
  entitlements: { command: 'operate', distribution: 'operate' },
};

const VIEWER: Principal = { role: 'operator', entitlements: { command: 'view' } };

const action = (id: string) => ACTION_MANIFEST.actions.find((a) => a.id === id)!;

describe('the manifest is real', () => {
  it('carries the whole registry', () => {
    expect(ACTION_MANIFEST.actions.length).toBeGreaterThanOrEqual(20);
    expect(ACTION_MANIFEST.manifestHash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('wrong subject type is absent, not blocked', () => {
  it('does not offer a campaign verb on a project', () => {
    const verbs = verbsFor(ACTION_MANIFEST, { type: 'project', id: 'p1', label: 'ACME' }, APPROVER);
    expect(verbs.map((v) => v.action.id)).not.toContain('dist_campaign_set_status');
  });

  it('does offer the universal verbs on any noun', () => {
    const ids = verbsFor(ACTION_MANIFEST, { type: 'command_task', id: 't1', label: 'T' }, APPROVER)
      .map((v) => v.action.id);
    // subjectTypes ['*']
    expect(ids).toContain('notify');
    expect(ids).toContain('watchlist_add');
  });

  it('offers project-only verbs only on a project', () => {
    const onProject = verbsFor(ACTION_MANIFEST, { type: 'project', id: 'p', label: 'P' }, APPROVER)
      .map((v) => v.action.id);
    const onDeal = verbsFor(ACTION_MANIFEST, { type: 'deal', id: 'd', label: 'D' }, APPROVER)
      .map((v) => v.action.id);
    expect(onProject).toContain('create_task');
    expect(onDeal).not.toContain('create_task');
  });
});

describe('unmet preconditions are absent — a silent no-op must never be offered', () => {
  it('hides `track` on an already-tracked project', () => {
    // The executor is `... AND tier<>'tracked'` and returns promoted:false with
    // HTTP 200. Offering it would look like success and change nothing.
    const tracked = verbsFor(
      ACTION_MANIFEST,
      { type: 'project', id: 'p', label: 'P', state: { tier: 'tracked' } },
      APPROVER,
    ).map((v) => v.action.id);
    expect(tracked).not.toContain('track');
  });

  it('offers `track` on a catalog project', () => {
    const catalog = verbsFor(
      ACTION_MANIFEST,
      { type: 'project', id: 'p', label: 'P', state: { tier: 'catalog' } },
      APPROVER,
    ).map((v) => v.action.id);
    expect(catalog).toContain('track');
  });

  it('offers it when state is unknown, rather than hiding a legal verb', () => {
    // Completeness must not depend on which page happened to load which field.
    const unknown = verbsFor(ACTION_MANIFEST, { type: 'project', id: 'p', label: 'P' }, APPROVER)
      .map((v) => v.action.id);
    expect(unknown).toContain('track');
  });

  it('hides `command_decide` on an already-decided decision', () => {
    const decided = verbsFor(
      ACTION_MANIFEST,
      { type: 'command_decision', id: 'dec_01', label: 'D', state: { status: 'decided' } },
      APPROVER,
    ).map((v) => v.action.id);
    expect(decided).not.toContain('command_decide');
    // ...and offers the inverse instead.
    expect(decided).toContain('command_reopen_decision');
  });
});

describe('insufficient authority is shown blocked, with the way forward', () => {
  it('shows an approver-only verb to an operator, blocked on role', () => {
    const verbs = verbsFor(ACTION_MANIFEST, { type: 'member', id: 'sam', label: 'Sam' }, OPERATOR);
    const revoke = verbs.find((v) => v.action.id === 'revoke_entitlement');
    expect(revoke, 'must be present, not hidden').toBeDefined();
    expect(revoke!.blocked).toEqual({ kind: 'role', needed: 'approver' });
    expect(blockedExplanation(revoke!.blocked!)).toMatch(/approver/i);
  });

  it('blocks on a missing entitlement and names what is held', () => {
    const verbs = verbsFor(
      ACTION_MANIFEST,
      { type: 'command_task', id: 't', label: 'T' },
      VIEWER,
    );
    const set = verbs.find((v) => v.action.id === 'command_set_task_status')!;
    expect(set.blocked).toEqual({
      kind: 'entitlement',
      workspace: 'command',
      needed: 'operate',
      held: 'view',
    });
    const why = blockedExplanation(set.blocked!);
    expect(why).toContain('command');
    expect(why).toMatch(/request access/i);
  });

  it('reports no access distinctly from insufficient access', () => {
    const verbs = verbsFor(
      ACTION_MANIFEST,
      { type: 'dist_listing', id: 'l', label: 'L' },
      { role: 'operator', entitlements: {} },
    );
    const v = verbs.find((x) => x.action.id === 'dist_listing_set_status')!;
    expect(v.blocked).toMatchObject({ kind: 'entitlement', held: 'none' });
  });

  it('lets an approver through everywhere they hold approve', () => {
    const verbs = verbsFor(ACTION_MANIFEST, { type: 'member', id: 'sam', label: 'Sam' }, APPROVER);
    expect(verbs.find((v) => v.action.id === 'revoke_entitlement')!.blocked).toBeNull();
  });

  it('needs approve capability for an approver action, operate otherwise', () => {
    expect(neededCapability(action('revoke_entitlement'))).toBe('approve');
    expect(neededCapability(action('command_set_task_status'))).toBe('operate');
  });
});

describe('ordering is stable and puts runnable verbs first', () => {
  it('unblocked before blocked', () => {
    const verbs = verbsFor(ACTION_MANIFEST, { type: 'member', id: 'sam', label: 'Sam' }, OPERATOR);
    const firstBlocked = verbs.findIndex((v) => v.blocked !== null);
    const lastOpen = verbs.map((v) => v.blocked === null).lastIndexOf(true);
    if (firstBlocked !== -1 && lastOpen !== -1) expect(lastOpen).toBeLessThan(firstBlocked);
  });

  it('is deterministic — muscle memory depends on it', () => {
    const noun = { type: 'project' as const, id: 'p', label: 'P' };
    const a = verbsFor(ACTION_MANIFEST, noun, APPROVER).map((v) => v.action.id);
    const b = verbsFor(ACTION_MANIFEST, noun, APPROVER).map((v) => v.action.id);
    expect(a).toEqual(b);
  });
});

describe('prompt ordering is a governance decision', () => {
  it('asks for the intent first and the override last', () => {
    const prompts = promptsFor(action('command_decide'), ACTION_MANIFEST.valueSets);
    const names = prompts.map((p) => p.name);
    // `chosen` is the operator's actual intent; overrideSat accepts risk and must
    // never be something you tab through on the way to submitting.
    expect(names.indexOf('chosen')).toBeLessThan(names.indexOf('overrideSat'));
    expect(names.indexOf('overrideSat')).toBeLessThan(names.indexOf('overrideReason'));
  });

  it('puts a secret last of all', () => {
    const prompts = promptsFor(action('revoke_entitlement'), ACTION_MANIFEST.valueSets);
    expect(prompts[prompts.length - 1].name).toBe('stepUpPasscode');
    expect(prompts[prompts.length - 1].kind).toBe('secret');
  });

  it('marks a credential as a secret so the UI cannot render it as plain text', () => {
    const p = promptsFor(action('revoke_entitlement'), ACTION_MANIFEST.valueSets)
      .find((x) => x.name === 'stepUpPasscode')!;
    expect(p.kind).toBe('secret');
  });

  it('turns an enum into fixed choices', () => {
    const p = promptsFor(action('command_set_task_status'), ACTION_MANIFEST.valueSets)
      .find((x) => x.name === 'status')!;
    expect(p.choices).toContain('in_progress');
    expect(p.choices).toContain('done');
  });

  it('sources a runtime value set the schema does not carry', () => {
    // `assign.owner` is checked against the desk roster, not a z.enum, so without
    // the value set the operator would face a free-text field for a closed set.
    const p = promptsFor(action('assign'), ACTION_MANIFEST.valueSets).find((x) => x.name === 'owner')!;
    expect(p.choices).toBeDefined();
    expect(p.choices).toContain('nik');
  });
});

describe('validation is advisory, and says so by what it does NOT reject', () => {
  it('catches a missing required field', () => {
    const problems = validate(action('command_set_task_status'), {});
    expect(problems.some((p) => p.field === 'status')).toBe(true);
  });

  it('catches a value outside the enum', () => {
    const problems = validate(action('command_set_task_status'), { status: 'abandoned' });
    expect(problems[0].message).toMatch(/must be one of/);
  });

  it('does NOT reject an unknown key, because the server strips it', () => {
    // The emitted schema says additionalProperties:false but zod v4 strips. A
    // literal validator here would be stricter than the server — a false reject.
    const problems = validate(action('command_set_task_status'), { status: 'done', bogus: 1 });
    expect(problems).toHaveLength(0);
  });

  it('enforces the refinement JSON Schema lost', () => {
    // command_set_partner_details requires at least one of two optional fields.
    // The emitted schema accepts {} and the server then rejects it.
    const empty = validate(action('command_set_partner_details'), {});
    expect(empty.some((p) => /at least one of/i.test(p.message))).toBe(true);

    const ok = validate(action('command_set_partner_details'), { terms: '2bps' });
    expect(ok).toHaveLength(0);
  });

  it('refuses an override with no reason', () => {
    const problems = validate(action('command_decide'), { chosen: 'Option A', overrideSat: true });
    expect(problems.some((p) => /justified|audit/i.test(p.message))).toBe(true);
  });

  it('accepts an override that is justified', () => {
    const problems = validate(action('command_decide'), {
      chosen: 'Option A',
      overrideSat: true,
      overrideReason: 'Counsel signed off out of band; memo attached.',
    });
    expect(problems).toHaveLength(0);
  });

  it('catches an over-long string before the round trip', () => {
    const problems = validate(action('command_decide'), { chosen: 'x'.repeat(501) });
    expect(problems.some((p) => /longer than/.test(p.message))).toBe(true);
  });

  it('catches a negative number where the schema has a minimum', () => {
    const problems = validate(action('dist_campaign_create'), {
      name: 'Q4 push',
      kind: 'quest',
      budgetLcx: -5,
    });
    expect(problems.some((p) => /at least/.test(p.message))).toBe(true);
  });
});

describe('buildParams', () => {
  it('drops empties and unknown keys, and coerces numbers', () => {
    const out = buildParams(action('dist_campaign_create'), {
      name: 'Q4 push',
      kind: 'quest',
      detail: '',
      budgetLcx: '250',
      nonsense: 'x',
    });
    expect(out).toEqual({ name: 'Q4 push', kind: 'quest', budgetLcx: 250 });
  });

  it('passes a secret through — the server needs it to verify step-up', () => {
    const out = buildParams(action('revoke_entitlement'), {
      workspace: 'command',
      justification: 'left the team',
      stepUpPasscode: 'test#1234',
    });
    expect(out.stepUpPasscode).toBe('test#1234');
  });
});
