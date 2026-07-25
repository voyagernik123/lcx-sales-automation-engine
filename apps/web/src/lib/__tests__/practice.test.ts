import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEAM } from '@lcx/shared';
import { ACTION_MANIFEST } from '../command/generated/actionManifest';
import type { ManifestAction } from '../command/types';
import {
  DRILLS,
  NOT_PRACTISED,
  PRACTICE_REMEDIES,
  executorGatesFor,
  gatesFor,
  medianMs,
  practiceInvoke,
  redactForLedger,
  type PracticeCode,
  type PracticePrincipal,
  type PracticeSubject,
} from '../practice';

/**
 * THE SAFETY PROPERTY IS THE FEATURE, so it is the first thing in this file.
 *
 * "A sandbox that can accidentally write to production is worse than no sandbox,
 * because operators will trust it and then act freely." That claim needs a guard
 * that can FAIL, and it has two — a static one here and a runtime one in
 * `pages/__tests__/practiceRange.test.tsx`. Both were watched failing before they
 * were believed:
 *
 *   MUTATION 1 (this file). Added `import { request } from '@/lib/apiClient';` to
 *   `lib/practice.ts` and used it. RED:
 *     "the practice range cannot reach the network > no module reachable from the
 *      practice range is a network door
 *      → practice range reaches a network door: src/lib/practice.ts → src/lib/apiClient.ts"
 *   Restored: GREEN.
 *
 *   MUTATION 2 (this file). Left the import off and instead put a bare
 *   `void fetch('/v1/actions/assign/invoke');` inside `practiceInvoke`. RED on the
 *   second assertion:
 *     "→ src/lib/practice.ts uses fetch( — the sandbox must not be able to".
 *   That second rule exists BECAUSE the first one cannot see this: `fetch` is a
 *   global and needs no import, so an import census alone would have been a
 *   decoration.
 *
 * The honest limit, stated because an unnamed blind spot is how the next one gets
 * through: this reads STATIC imports. A dynamic `await import('@/lib/apiClient')`
 * inside a handler is invisible to the graph walk — which is why the runtime test
 * next door spies on the transports themselves rather than trusting this.
 */

const SRC = join(__dirname, '..', '..');
const REPO = join(SRC, '..', '..', '..');
const rel = (f: string) => f.slice(SRC.length - 3);

/** Resolve one import specifier to a file on disk, or null if it leaves our source. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // a package — node_modules, not ours to police
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Every VALUE import in a file. Type-only imports are excluded deliberately: they
 * are erased at build time and cannot pull a module into any bundle or execute a
 * line of it. `lib/practice.ts` reaches `components/command/grammar` this way on
 * purpose.
 */
function valueImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^\s*import\s+(?!type\s)([^;]*?)\s*from\s*'([^']+)'/gm)) {
    // `import { type X, y }` still imports y; `import type { X }` was excluded above.
    const clause = m[1]!;
    const named = clause.match(/\{([\s\S]*)\}/);
    if (named && named[1]!.split(',').every((p) => p.trim() === '' || p.trim().startsWith('type '))) continue;
    out.push(m[2]!);
  }
  return out;
}

/** Every source file reachable from `entry` through value imports. */
function reachable(entry: string): Map<string, string> {
  const seen = new Map<string, string>();
  const queue: Array<{ file: string; via: string }> = [{ file: entry, via: 'entry' }];
  while (queue.length > 0) {
    const { file, via } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.set(file, via);
    const src = readFileSync(file, 'utf8');
    for (const spec of valueImports(src)) {
      const target = resolveSpecifier(file, spec);
      if (target && !seen.has(target)) queue.push({ file: target, via: file });
    }
  }
  return seen;
}

/** The doors out of the browser. Anything that can put bytes on a socket. */
const NETWORK_DOORS = [
  join(SRC, 'lib', 'apiClient.ts'),
  join(SRC, 'components', 'command', 'invoke.ts'),
];
const NETWORK_CALLS = [/\bfetch\s*\(/, /XMLHttpRequest/, /new WebSocket/, /new EventSource/, /sendBeacon/];

describe('the practice range cannot reach the network', () => {
  const entries = [join(SRC, 'lib', 'practice.ts'), join(SRC, 'pages', 'PracticeRange.tsx')];

  it('the graph walk finds a real graph (guards every rule below from passing vacuously)', () => {
    const graph = reachable(entries[1]!);
    // The page reaches the grammar, the manifest, the practice module and the
    // operator store at minimum. If a resolver change made this 1, every rule
    // below would be asserting nothing.
    expect(graph.size).toBeGreaterThan(4);
    expect([...graph.keys()].map(rel)).toContain('src/components/command/grammar.ts');
  });

  it('no module reachable from the practice range is a network door', () => {
    const offenders: string[] = [];
    for (const entry of entries) {
      const graph = reachable(entry);
      for (const door of NETWORK_DOORS) {
        const via = graph.get(door);
        if (via) offenders.push(`practice range reaches a network door: ${rel(via)} → ${rel(door)}`);
      }
    }
    // Deduped: both entries reach `lib/practice.ts`, and the same sentence twice
    // reads like two problems.
    const unique = [...new Set(offenders)];
    expect(unique, unique.join('\n')).toEqual([]);
  });

  it('no module reachable from the practice range calls a transport directly', () => {
    // `fetch` and friends are globals: an import census cannot see them, and this
    // is the rule that caught mutation 2 above.
    const offenders: string[] = [];
    for (const entry of entries) {
      for (const file of reachable(entry).keys()) {
        const code = readFileSync(file, 'utf8')
          // Judge what the code DOES, not what its comments discuss — the same
          // reason focusVisible.test.ts strips comments. Without this, THIS file's
          // own explanation of the mutation would trip the rule on the module it
          // is explaining.
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .split('\n')
          .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
          .join('\n');
        for (const pattern of NETWORK_CALLS) {
          if (pattern.test(code)) {
            offenders.push(`${rel(file)} uses ${pattern.source} — the sandbox must not be able to`);
          }
        }
      }
    }
    // Deduped: both entries reach `lib/practice.ts`, and the same sentence twice
    // reads like two problems.
    const unique = [...new Set(offenders)];
    expect(unique, unique.join('\n')).toEqual([]);
  });

  it('every practice subject id is incapable of naming a production row', () => {
    // Belt and braces UNDER the isolation, not instead of it: if a future edit did
    // put these on the wire, the subject would not exist on the other end either.
    for (const d of DRILLS) {
      expect(d.subject.id, `${d.id}: practice ids must be prefixed`).toMatch(/^practice-/);
    }
  });
});

/**
 * COMPLETE BY CONSTRUCTION — the property the brief asks for by name.
 *
 * "Add a test that the practice gate list is derived from the same ACTION_REGISTRY
 * manifest the real command line reads, so a new gate cannot exist in prod and be
 * absent from practice."
 *
 * Watched failing: changed `gatesFor` to `if (action.workspace && action.workspace !== 'distribution')`
 * — the shape of a plausible special case. RED with
 * "dist_listing_set_status: the manifest says this action is gated on the
 *  distribution workspace, and the practice range does not know", from the
 * derivation check below, which recomputes the expected set from the manifest
 * independently rather than comparing gatesFor to itself.
 */
describe('the practice gates are derived from the manifest, not enumerated', () => {
  const actions = ACTION_MANIFEST.actions;

  it('there are actions to derive from', () => {
    expect(actions.length).toBeGreaterThan(15);
  });

  it('every manifest-expressible gate on every action is known to the practice range', () => {
    const missing: string[] = [];
    for (const action of actions) {
      const codes = new Set(gatesFor(action).map((g) => g.code));
      const expect_ = (code: PracticeCode, when: boolean, why: string) => {
        if (when && !codes.has(code)) missing.push(`${action.id}: ${why}`);
        if (!when && codes.has(code)) missing.push(`${action.id}: invented a ${code} gate the manifest does not imply`);
      };
      const kinds = Object.values(action.grammar.paramKinds ?? {});
      expect_('FORBIDDEN', action.minRole === 'approver', 'the manifest says approver-only and the practice range does not know');
      expect_(
        'WORKSPACE_FORBIDDEN',
        action.workspace !== null,
        `the manifest says this action is gated on the ${action.workspace} workspace, and the practice range does not know`,
      );
      expect_(
        'VALIDATION',
        (action.params.required?.length ?? 0) > 0 || (action.grammar.atLeastOneOf?.length ?? 0) > 0,
        'the manifest says some params are not optional and the practice range does not know',
      );
      expect_('NOT_FOUND', action.grammar.precondition !== undefined, 'the manifest declares a precondition and the practice range does not know');
      expect_('OVERRIDE_REASON_REQUIRED', kinds.includes('override'), 'the manifest declares an override param and the practice range does not know');
      expect_('STEP_UP_REQUIRED', kinds.includes('secret'), 'the manifest declares a secret param and the practice range does not know');
    }
    expect(missing, missing.join('\n')).toEqual([]);
  });

  it('a 23rd action carrying a new gate is gated here without anyone editing this file', () => {
    // The whole point, expressed as the future case rather than the present one.
    const invented: ManifestAction = {
      id: 'invented_action',
      label: 'Invented',
      description: 'A governed action nobody has written yet.',
      subjectTypes: ['deal'],
      minRole: 'approver',
      workspace: 'sales',
      params: {
        type: 'object',
        properties: { thing: { type: 'string' }, letMeThrough: { type: 'boolean' }, why: { type: 'string' } },
        required: ['thing'],
      },
      grammar: { paramKinds: { letMeThrough: 'override', why: 'reason' }, precondition: { field: 'stage', in: ['open'] } },
    };
    expect(new Set(gatesFor(invented).map((g) => g.code))).toEqual(
      new Set<PracticeCode>(['FORBIDDEN', 'WORKSPACE_FORBIDDEN', 'VALIDATION', 'NOT_FOUND', 'OVERRIDE_REASON_REQUIRED']),
    );
  });

  it('every gate the practice range can emit has a remedy', () => {
    for (const action of actions) {
      for (const gate of [...gatesFor(action), ...executorGatesFor(action, DRILLS[4]!.subject)]) {
        expect(PRACTICE_REMEDIES[gate.code], `${gate.code} has no remedy`).toBeTruthy();
      }
    }
  });
});

/**
 * NO SILENT DIVERGENCE FROM THE REAL REFUSAL SENTENCES.
 *
 * The practice range's whole value is that the sentence an operator reads here is
 * the sentence they will read on the desk — "the refusal sentence is the useful
 * part, and an operator who has never seen one will not read it the first time it
 * matters". So the sentences are not paraphrased, they are the same strings, and
 * this is what makes that checkable.
 *
 * Watched failing: changed the APPROVER_REQUIRED fragment to "Ask an approver to
 * run it." RED with "APPROVER_REQUIRED: the practice range teaches a sentence
 * components/command/invoke.ts does not contain".
 */
describe('the practice refusals are the production refusals', () => {
  const invokeSrc = readFileSync(join(SRC, 'components', 'command', 'invoke.ts'), 'utf8');

  it('the file it compares against is the real one', () => {
    expect(invokeSrc).toContain('function classify(');
    expect(invokeSrc).toContain('/v1/actions/');
  });

  it('every remedy fragment still occurs verbatim in invoke.ts', () => {
    const wrong: string[] = [];
    for (const [code, remedy] of Object.entries(PRACTICE_REMEDIES)) {
      if (!invokeSrc.includes(remedy.fragment)) {
        wrong.push(`${code}: the practice range teaches a sentence components/command/invoke.ts does not contain`);
      }
    }
    expect(wrong, wrong.join('\n')).toEqual([]);
  });

  it('every code invoke.ts classifies is practisable', () => {
    const classified = [...invokeSrc.matchAll(/case '([A-Z_]+)':/g)].map((m) => m[1]!);
    expect(classified.length, 'no case labels found — has classify been rewritten?').toBeGreaterThan(6);
    const unknown = classified.filter((c) => !(c in PRACTICE_REMEDIES) && !(c in NOT_PRACTISED));
    // STEP_UP_FAILED shares STEP_UP_REQUIRED's remedy in classify; it is reached
    // only by a wrong passcode against a live server, which the sandbox has none of.
    expect(unknown.filter((c) => c !== 'STEP_UP_FAILED')).toEqual([]);
  });

  /**
   * ACROSS THE PACKAGE BOUNDARY, deliberately.
   *
   * This is the half the manifest cannot give: SAT_REQUIRED and COMPLIANCE_GATE
   * live inside executor bodies, so no generated artefact mentions them. Reading
   * the registry as text is the same move destinations.test.ts makes on the Rust
   * menu, for the same reason — two things must agree and only one is in this
   * package's type-check.
   *
   * Watched failing: added `throw new ActionError('NEW_GATE', 'x', 409);` to
   * registry.ts. RED with "registry.ts can refuse with NEW_GATE and the practice
   * range has never heard of it". Removed.
   */
  it('no refusal code exists in the registry that the practice range has never heard of', () => {
    const registry = readFileSync(join(REPO, 'apps', 'api', 'src', 'actions', 'registry.ts'), 'utf8');
    expect(registry, 'the registry moved — this rule would assert nothing').toContain('export async function invokeAction');
    // Multi-line on purpose: WORKSPACE_FORBIDDEN is thrown with the code on its own
    // line, and a single-line grep silently missed it while looking like it worked.
    const codes = [...registry.matchAll(/new ActionError\(\s*'([A-Z_]+)'/g)].map((m) => m[1]!);
    expect(new Set(codes).size, 'suspiciously few codes — check the pattern').toBeGreaterThan(10);
    const unheard = [...new Set(codes)].filter((c) => !(c in PRACTICE_REMEDIES) && !(c in NOT_PRACTISED));
    expect(
      unheard,
      unheard.map((c) => `registry.ts can refuse with ${c} and the practice range has never heard of it`).join('\n'),
    ).toEqual([]);
  });
});

/* ── the simulated server behaves like the real one ───────────────────────── */

const OPERATOR: PracticePrincipal = {
  role: 'operator',
  entitlements: { command: 'operate', distribution: 'operate' },
  actor: 'sam@lcx.com',
};
const APPROVER: PracticePrincipal = {
  role: 'approver',
  entitlements: { command: 'approve', distribution: 'approve', governance: 'approve' },
  actor: 'monty@lcx.com',
};
const drill = (id: string) => DRILLS.find((d) => d.id === id)!;
const run = (
  actionId: string,
  subject: PracticeSubject,
  params: Record<string, unknown>,
  who: PracticePrincipal,
) => practiceInvoke(ACTION_MANIFEST, actionId, subject, params, who);

describe('the practice server mirrors invokeAction', () => {
  it('every drill names an action and a subject type the manifest agrees exist', () => {
    for (const d of DRILLS) {
      const action = ACTION_MANIFEST.actions.find((a) => a.id === d.actionId);
      expect(action, `${d.id} drills ${d.actionId}, which is not in the manifest`).toBeTruthy();
      expect(
        action!.subjectTypes.includes('*') || action!.subjectTypes.includes(d.subject.type),
        `${d.id}: ${d.actionId} does not apply to ${d.subject.type}`,
      ).toBe(true);
    }
  });

  it("every drill's seeded state satisfies the action's own precondition", () => {
    // A drill whose subject is in an illegal state would refuse NOT_FOUND on the
    // first honest attempt and teach the wrong lesson.
    for (const d of DRILLS) {
      const pre = ACTION_MANIFEST.actions.find((a) => a.id === d.actionId)!.grammar.precondition;
      if (!pre) continue;
      expect(pre.in, `${d.id}: seeded ${pre.field} is not a state ${d.actionId} accepts`).toContain(
        String(d.subject.state[pre.field]),
      );
    }
  });

  it('each drill meets exactly the refusal it advertises, on an honest first attempt', () => {
    // `meets` is printed in the drill list, so it is a claim to the operator.
    const first: Record<string, Record<string, unknown>> = {
      // The one required param supplied wrongly / not at all, as a newcomer would.
      triage: {},
      decide: { chosen: 'Broker-dealer partnership' },
      rfi: { status: 'returned' },
      listing: { status: 'live' },
      campaign: { status: 'live' },
    };
    for (const d of DRILLS) {
      // The listing drill advertises WORKSPACE_FORBIDDEN, which is what happens
      // with the entitlement toggle OFF — that is what the drill text tells the
      // operator to do.
      const who = d.id === 'listing' ? { ...OPERATOR, entitlements: {} } : OPERATOR;
      const out = run(d.actionId, d.subject, first[d.id]!, who);
      if (d.meets === null) {
        expect(out.ok, `${d.id} advertises a clean write and was refused`).toBe(true);
      } else {
        expect(out.ok).toBe(false);
        expect(!out.ok && out.code, `${d.id} advertises ${d.meets}`).toBe(d.meets);
      }
    }
  });

  it('authority is checked before the params, exactly as the server does', () => {
    // registry.ts:1007 refuses on minRole BEFORE parsing params (:1024). An
    // operator who has practised here must not be surprised by which refusal comes
    // first, so the ordering is behaviour, not a comment.
    const decided: PracticeSubject = {
      type: 'command_decision',
      id: 'practice-decision-2',
      label: 'PRACTICE — a decided one',
      state: { status: 'decided' },
      gateInputs: {},
    };
    const asOperator = run('command_reopen_decision', decided, {}, OPERATOR);
    expect(!asOperator.ok && asOperator.code).toBe('FORBIDDEN');

    // And the workspace compartment before the params, too (:1016 before :1024).
    const noWorkspace = { ...APPROVER, entitlements: {} };
    const gated = run('command_reopen_decision', decided, {}, noWorkspace);
    expect(!gated.ok && gated.code).toBe('WORKSPACE_FORBIDDEN');

    // With both held, the missing required param is what is left.
    const parsed = run('command_reopen_decision', decided, {}, APPROVER);
    expect(!parsed.ok && parsed.code).toBe('VALIDATION');
  });

  it('the registry approver gate refuses FORBIDDEN, not APPROVER_REQUIRED', () => {
    /*
     * NOT a preference — a finding this work turned up, encoded so nobody
     * "improves" the practice range into teaching a sentence production does not
     * show. invokeAction throws FORBIDDEN for its own approver gate
     * (registry.ts:1007) and `classify` has no case for it, so all six
     * approver-only actions land on the generic default. APPROVER_REQUIRED — the
     * one with the useful sentence — is reached only from the token-incentivized
     * campaign launch gate.
     */
    const approverOnly = ACTION_MANIFEST.actions.filter((a) => a.minRole === 'approver');
    expect(approverOnly.length).toBeGreaterThan(3);
    expect(PRACTICE_REMEDIES.FORBIDDEN.fragment).toBe('The server refused this action. Nothing was changed.');
    expect(PRACTICE_REMEDIES.APPROVER_REQUIRED.fragment).toContain('Ask an approver to run it');
  });

  it('the SAT gate: refuse, then refuse the bare override, then let it through with a reason', () => {
    const d = drill('decide');
    const chosen = { chosen: 'Broker-dealer partnership' };

    const blocked = run(d.actionId, d.subject, chosen, OPERATOR);
    expect(!blocked.ok && blocked.code).toBe('SAT_REQUIRED');
    expect(!blocked.ok && blocked.overridable).toBe(true);
    expect(!blocked.ok && blocked.detail?.missing).toEqual(['premortem', 'devils_advocate']);

    const bare = run(d.actionId, d.subject, { ...chosen, overrideSat: true }, OPERATOR);
    expect(!bare.ok && bare.code).toBe('OVERRIDE_REASON_REQUIRED');

    const through = run(
      d.actionId,
      d.subject,
      { ...chosen, overrideSat: true, overrideReason: 'Board deadline; premortem scheduled Thursday.' },
      OPERATOR,
    );
    expect(through.ok).toBe(true);
    expect(through.ok && through.row.params.overrideReason).toContain('Board deadline');

    // And the gate is not a rite of passage: with the tradecraft on file it is silent.
    const filed = { ...d.subject, gateInputs: { programCritical: true, reviewsOnFile: ['premortem', 'devils_advocate'] } };
    expect(run(d.actionId, filed, chosen, OPERATOR).ok).toBe(true);
  });

  it('authority cannot be bought with an override, on the gate where that was once possible', () => {
    /*
     * The escalation registry.ts:730-742 records: `overrideGate: true` used to let
     * ANY operator launch a token-incentivized campaign, with no approver and no
     * recorded reason. Practising this is the point of drill five, so the property
     * is asserted here rather than trusted.
     */
    const d = drill('campaign');
    const launch = { status: 'live' as const };

    const asOperator = run(d.actionId, d.subject, { ...launch, overrideGate: true, overrideReason: 'urgent' }, OPERATOR);
    expect(!asOperator.ok && asOperator.code).toBe('APPROVER_REQUIRED');
    expect(!asOperator.ok && asOperator.overridable, 'authority must never read as overridable').toBe(false);

    const asApprover = run(d.actionId, d.subject, launch, APPROVER);
    expect(!asApprover.ok && asApprover.code).toBe('COMPLIANCE_GATE');
    expect(!asApprover.ok && asApprover.detail?.blockers).toEqual([
      'compliance review missing (legal_check)',
      'projected reward spend exceeds the budget envelope',
    ]);

    const bare = run(d.actionId, d.subject, { ...launch, overrideGate: true }, APPROVER);
    expect(!bare.ok && bare.code).toBe('OVERRIDE_REASON_REQUIRED');

    const through = run(
      d.actionId,
      d.subject,
      { ...launch, overrideGate: true, overrideReason: 'Legal signed off by email; budget raised in the same thread.' },
      APPROVER,
    );
    expect(through.ok).toBe(true);

    // A status that is not a launch never reaches the gate at all.
    expect(run(d.actionId, d.subject, { status: 'draft' }, OPERATOR).ok).toBe(true);
  });

  it('a secret never reaches the ledger', () => {
    const revoke = ACTION_MANIFEST.actions.find((a) => a.id === 'revoke_entitlement')!;
    const params = { workspace: 'command', justification: 'left the desk', stepUpPasscode: 'hunter2-the-real-one' };
    const recorded = redactForLedger(revoke, params);
    expect(recorded.stepUpPasscode).toBe('[redacted]');
    expect(JSON.stringify(recorded)).not.toContain('hunter2');
    // The non-secrets are kept: a ledger that redacts everything records nothing.
    expect(recorded.justification).toBe('left the desk');
  });

  it('the roster the practice range offers is the desk roster', () => {
    // Reuse rather than a parallel fixture: the `assign` choices come from the
    // manifest's own value set, which is generated from @lcx/shared TEAM.
    const roster = ACTION_MANIFEST.valueSets.roster;
    for (const m of TEAM) expect(roster, `${m.id} is on the desk and not offered`).toContain(m.id);
    // Plus the shared catch-all lane, which is not a person.
    expect(roster).toContain('operator');
  });

  it('a record param sent as a bare string is refused — the shape ⌘K actually sends', () => {
    /*
     * THE DEFECT THIS DRILL FOUND, pinned so the sandbox cannot drift into waving
     * it through. `command_rfi_record.values` is `z.record(string, string)` on the
     * server. `promptsFor` gives it `kind: 'record'` and a `choices` list of RFI
     * field names, and `VerbPanel`'s Field checks `choices` before anything else
     * with no branch for `type: 'record'` — so the command line renders a field-name
     * picker and sends the selected name as a string. The client validator cannot
     * warn (the choices come from a value set, not a schema enum), so the operator's
     * only feedback is a server VALIDATION they cannot act on.
     */
    const d = drill('rfi');
    const asCommandLineSendsIt = run(d.actionId, d.subject, { status: 'returned', values: 'min_ticket' }, OPERATOR);
    expect(!asCommandLineSendsIt.ok && asCommandLineSendsIt.code).toBe('VALIDATION');
    expect(!asCommandLineSendsIt.ok && asCommandLineSendsIt.remedy).toContain('record of field → value');
    // The status half works, and is what the drill rehearses.
    expect(run(d.actionId, d.subject, { status: 'returned' }, OPERATOR).ok).toBe(true);
  });

  it('a wrong subject and an unknown action refuse rather than write', () => {
    const d = drill('triage');
    expect(!run('command_decide', d.subject, { chosen: 'x' }, APPROVER).ok).toBe(true);
    const unknown = run('no_such_action', d.subject, {}, APPROVER);
    expect(!unknown.ok && unknown.code).toBe('UNKNOWN_ACTION');
  });
});

describe('progress is honest and self-referential', () => {
  it('one rep is not a median', () => {
    // Showing a single sample as a median is the same overclaim this programme
    // keeps withdrawing, one order of magnitude smaller.
    expect(medianMs([])).toBeNull();
    expect(medianMs([4200])).toBeNull();
  });

  it('is their own median, over their own reps', () => {
    expect(medianMs([3000, 5000])).toBe(4000);
    expect(medianMs([9000, 1000, 5000])).toBe(5000);
  });
});
