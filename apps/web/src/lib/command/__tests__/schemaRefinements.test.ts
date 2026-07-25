import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_MANIFEST } from '../generated/actionManifest';

/**
 * The blind spot in the manifest drift guard (TERMINAL Phase 7).
 *
 * `apps/api/src/actions/__tests__/manifest.drift.test.ts` is a good ratchet and
 * Phase 3 proved it bites: add an action, add an enum value, rename a param, and the
 * canonical bytes move, the hash moves, CI fails. TEN of the thirteen ways a registry
 * schema can change are caught that way. THREE are not, and they are the same three:
 *
 *   - adding a `.refine()`
 *   - adding a `.superRefine()`
 *   - REMOVING a `.refine()`      ← the dangerous one
 *
 * All three are invisible for one reason: `z.toJSONSchema()` drops refinements. The
 * emitted manifest and its hash are BYTE-IDENTICAL before and after. There is a live
 * example in the tree — `command_reopen_decision.reason` gained
 * `.refine((s) => s.trim().length > 0)` because `.min(1)` accepted a single space, and
 * the commit records that the manifest hash did not change.
 *
 * Adding one is a false negative you can live with: the server is stricter than the
 * generated client advertises, the client's validation is advisory anyway, and the
 * worst case is a form that submits and gets a 400. REMOVING one is the opposite. It
 * makes the SERVER — the only authority — quietly more permissive, with no diff
 * anywhere a reviewer looks. `{ reason: " " }` would be accepted again and written
 * into `object_actions.params` and `audit_log.meta` as a justification that says
 * nothing. "Who reopened dec_01, and why" would go back to being answerable only
 * sometimes, and nothing would have failed.
 *
 * WHAT THIS GUARD IS. A ledger of the normalized SOURCE TEXT of every action's
 * `paramsSchema` chain, read out of the registry off disk — the same technique
 * destinations.test.ts and cheatCard.test.tsx use to reach across a package boundary
 * a compiler cannot see. Comments are stripped and whitespace collapsed before
 * comparison, so reformatting, re-indenting, and rewriting the prose above a schema
 * are all free. Anything else about a schema chain — a refinement added, a refinement
 * REMOVED, a predicate that changed what it enforces, a `.max` that moved — changes
 * the ledger and fails here.
 *
 * WHAT IT STILL CANNOT SEE, stated plainly:
 *
 *  1. `execute` BODIES ARE NOT LEDGERED, deliberately. A digest over each `execute`
 *     would be a fixture that has to be regenerated on every bugfix to a SQL string,
 *     which is how a guard becomes noise and then gets deleted. Instead there is one
 *     TARGETED execute check below — the override/gate discipline — which is the
 *     invariant an execute rewrite is actually likely to lose. An arbitrary `execute`
 *     replacement that keeps that discipline is NOT caught here, and honestly cannot
 *     be by a text guard: the only sound check on an execute body is an integration
 *     test that runs it against a database.
 *  2. A refinement whose predicate is semantically relaxed but textually identical —
 *     because it now calls a helper that changed. The ledger sees the call site, not
 *     the callee.
 *  3. Anything the registry does at RUNTIME rather than in the schema. `invokeAction`
 *     enforces role, gates and idempotency; none of that is in a `paramsSchema`.
 *  4. A cosmetic rewrite of a schema (renaming a `.refine` lambda's argument) fails
 *     this test even though nothing changed. That is the accepted cost: the diff of
 *     the ledger shows the reviewer exactly what moved, which is the point.
 */

/**
 * The registry, from the web workspace. Long but explicit, because the failure this
 * avoids is a silently-skipped test: if the path is wrong the guard must say so
 * rather than pass over an empty file.
 */
const REGISTRY = join(__dirname, '..', '..', '..', '..', '..', 'api', 'src', 'actions', 'registry.ts');

/**
 * Strip `//` and block comments, tracking string and template state.
 *
 * Not the line-oriented `codeOnly` the other ratchets use: this one has to survive
 * being fed to a brace matcher, and registry.ts has prose comments containing
 * `{ reason: " " }` and unbalanced parentheses. A crude strip that left a comment
 * brace behind would silently mis-slice a schema.
 */
function stripComments(text: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < text.length) {
    const c = text[i]!;
    const n = text[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Read one property value: from `start` to the first comma at depth zero. */
function readExpression(text: string, start: number): string {
  let i = start;
  let depth = 0;
  let quote: string | null = null;
  while (i < text.length) {
    const c = text[i]!;
    if (quote) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      i += 1;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break;
      depth -= 1;
    } else if (c === ',' && depth === 0) break;
    i += 1;
  }
  return text.slice(start, i);
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Pull one named property out of one action's entry in ACTION_REGISTRY. */
function property(clean: string, id: string, key: 'paramsSchema' | 'execute'): string {
  const at = clean.indexOf(`\n  ${id}: {\n`);
  if (at < 0) {
    throw new Error(
      `'${id}' is in the manifest but no \`  ${id}: {\` entry was found in registry.ts — ` +
        'either the registry was reformatted (fix the locator in this test) or the action moved.',
    );
  }
  const kv = clean.indexOf(`${key}:`, at);
  if (kv < 0) throw new Error(`'${id}' has no ${key} in registry.ts`);
  return norm(readExpression(clean, kv + key.length + 1));
}

const ACTION_IDS = ACTION_MANIFEST.actions.map((a) => a.id).sort();

function chains(): Record<string, string> {
  if (!existsSync(REGISTRY)) {
    throw new Error(`${REGISTRY} not found — this guard reads the server registry off disk and cannot degrade to a pass.`);
  }
  const clean = stripComments(readFileSync(REGISTRY, 'utf8'));
  return Object.fromEntries(ACTION_IDS.map((id) => [id, property(clean, id, 'paramsSchema')]));
}

function executes(): Record<string, string> {
  const clean = stripComments(readFileSync(REGISTRY, 'utf8'));
  return Object.fromEntries(ACTION_IDS.map((id) => [id, property(clean, id, 'execute')]));
}

/** Every refinement mechanism zod has that `z.toJSONSchema()` throws away. */
const REFINERS = ['.refine(', '.superRefine(', '.check(', '.overwrite('] as const;

function census(chain: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of REFINERS) out[r] = chain.split(r).length - 1;
  return out;
}

/**
 * THE LEDGER — the normalized `paramsSchema` source of every governed action.
 *
 * When this test fails, read the diff between the two strings it prints. If the change
 * was intended, paste the new value in. If a `.refine(` disappeared from it and you did
 * not mean that, you have just been shown a server-side relaxation that no hash, no
 * type and no other test in this repo would have reported.
 */
const LEDGER: Record<string, string> = {
  assign: 'z.object({ owner: z.string().min(1).max(64) })',
  command_decide:
    'z.object({ chosen: z.string().min(1).max(500), rationale: z.string().max(2000).optional(), overrideSat: z.boolean().optional(), overrideReason: z.string().max(500).optional(), })',
  command_reopen_decision:
    "z.object({ reason: z.string().min(1).max(500).refine((s) => s.trim().length > 0, { message: 'reason cannot be blank — a reopen has to say why', }), })",
  command_rfi_record:
    "z.object({ status: z.enum(['issued', 'returned', 'signed']), values: z.record(z.string().max(60), z.string().max(300)).optional(), })",
  command_set_blocker_status: "z.object({ status: z.enum(['open', 'mitigating', 'resolved']) })",
  command_set_partner_details:
    "z.object({ primaryContact: z.string().max(300).optional(), terms: z.string().max(1000).optional(), }).refine((v) => v.primaryContact !== undefined || v.terms !== undefined, { message: 'Nothing to update' })",
  command_set_partner_stage:
    "z.object({ stage: z.enum([ 'evaluate', 'recommended_rfi', 'recommended', 'incumbent_onboarding', 'in_progress', 'select', 'support', 'alternate', 'specialist', 'hold_geoblock', 'exclude_pending_counsel', 'signed', 'passed', ]), })",
  command_set_requirement_status: "z.object({ status: z.enum(['Not started', 'In progress', 'Done']) })",
  command_set_task_status:
    "z.object({ status: z.enum(['not_started', 'pending', 'open', 'in_progress', 'blocked', 'tentative', 'future', 'done']), })",
  create_task: 'z.object({ title: z.string().min(1).max(200), detail: z.string().max(500).optional() })',
  decide_access_request:
    "z.object({ decision: z.enum(['approved', 'denied']), note: z.string().max(500).optional(), })",
  dist_campaign_create:
    "z.object({ name: z.string().min(1).max(160), surfaceId: z.string().max(60).optional(), kind: z.enum(['quest', 'incentive', 'content', 'outreach']), tokenIncentivized: z.boolean().optional(), budgetLcx: z.number().nonnegative().optional(), detail: z.string().max(1000).optional(), })",
  dist_campaign_set_status:
    "z.object({ status: z.enum(['draft', 'compliance_review', 'approved', 'live', 'measured']), overrideGate: z.boolean().optional(), overrideReason: z.string().max(500).optional(), })",
  dist_listing_set_status:
    "z.object({ status: z.enum(['not_started', 'submitted', 'live', 'ranked']), rankNote: z.string().max(200).optional(), usageNote: z.string().max(200).optional(), url: z.string().max(300).optional(), })",
  flag_review: 'z.object({ reason: z.string().max(300).optional() })',
  grant_entitlement:
    "z.object({ workspace: z.enum(WORKSPACE_IDS as unknown as [string, ...string[]]), capability: z.enum(['view', 'operate', 'approve']), justification: z.string().min(1).max(500), })",
  notify:
    'z.object({ title: z.string().min(1).max(200), detail: z.string().max(500).optional(), href: z.string().max(300).optional() })',
  revoke_entitlement:
    'z.object({ workspace: z.enum(WORKSPACE_IDS as unknown as [string, ...string[]]), justification: z.string().min(1).max(500), stepUpPasscode: z.string().min(1).max(200), })',
  set_member_profile: 'z.object({ unit: z.string().max(80).optional(), title: z.string().max(120).optional(), })',
  track: 'z.object({})',
  watchlist_add: 'z.object({ note: z.string().max(300).optional() })',
  watchlist_remove: 'z.object({})',
};

const REGEN = 'update the LEDGER in apps/web/src/lib/command/__tests__/schemaRefinements.test.ts';

describe('the registry schemas the manifest hash cannot see', () => {
  /**
   * ANTI-VACUITY FIRST, because everything below is a comparison against text this
   * file parsed itself. A locator that stopped matching — someone reformats the
   * registry, someone switches it to a `Map` — would yield empty strings, and empty
   * strings compare equal to each other perfectly. The guard would go green and stay
   * green through every mutation it exists to catch.
   */
  it('parses a non-empty schema chain for every action in the manifest', () => {
    const parsed = chains();
    expect(Object.keys(parsed).length, 'the manifest has no actions').toBe(ACTION_IDS.length);
    expect(ACTION_IDS.length).toBeGreaterThan(0);
    for (const [id, chain] of Object.entries(parsed)) {
      expect(chain, `${id}: parsed an empty paramsSchema — the registry locator in this test is broken`).not.toBe('');
      expect(chain.startsWith('z.'), `${id}: parsed ${JSON.stringify(chain.slice(0, 40))}, which is not a zod chain`).toBe(
        true,
      );
    }
  });

  it('the ledger names exactly the manifest’s actions — a new action cannot skip it', () => {
    expect(Object.keys(LEDGER).sort(), REGEN).toEqual(ACTION_IDS);
  });

  it('has refinements to guard in the first place', () => {
    // Without this, a ledger that had lost every `.refine(` would still satisfy the
    // census assertion below — against nothing.
    const total = Object.values(LEDGER).reduce(
      (n, chain) => n + Object.values(census(chain)).reduce((a, b) => a + b, 0),
      0,
    );
    expect(total, 'no ledgered schema carries a refinement — this guard is watching nothing').toBeGreaterThan(0);
  });

  /**
   * THE ASSERTION THIS FILE EXISTS FOR, and it runs before the byte comparison so the
   * REMOVAL case gets named rather than being reported as "some text differs".
   */
  it('no refinement was added or removed', () => {
    const actual = chains();
    const problems: string[] = [];
    for (const id of ACTION_IDS) {
      const now = census(actual[id]!);
      const then = census(LEDGER[id]!);
      for (const r of REFINERS) {
        if (now[r] === then[r]) continue;
        problems.push(
          now[r]! < then[r]!
            ? `${id}: a ${r}) was REMOVED (${then[r]} → ${now[r]}). z.toJSONSchema drops refinements, so the ` +
              'emitted manifest and its hash are byte-identical and no other test in this repo will notice. ' +
              'The SERVER is now more permissive than it was. If that is intended, ' +
              REGEN
            : `${id}: a ${r}) was ADDED (${then[r]} → ${now[r]}). The manifest hash did not move, so the ` +
              `generated client still advertises the looser rule. If that is intended, ${REGEN}`,
        );
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('every schema chain is exactly what the ledger records', () => {
    // The catch-all, after the specific message above. Whitespace and comments are
    // already normalized away, so anything that reaches here is a real edit.
    expect(chains(), REGEN).toEqual(LEDGER);
  });

  /**
   * A TRIPWIRE, not a rule. The whole premise of this file is that the emitted schema
   * cannot express `command_reopen_decision`'s non-blank rule. If zod ever starts
   * emitting refinements, the manifest hash begins covering them and this guard should
   * be narrowed rather than kept out of habit. This is what will say so.
   */
  it('the emitted manifest still cannot express a refinement', () => {
    const action = ACTION_MANIFEST.actions.find((a) => a.id === 'command_reopen_decision');
    expect(action, 'command_reopen_decision has left the registry — pick another refined action for this tripwire').toBeDefined();
    const reason = (action!.params as { properties?: Record<string, Record<string, unknown>> })?.properties?.reason;
    expect(reason, 'command_reopen_decision.reason is no longer an emitted param').toBeDefined();
    // minLength/maxLength survive; the .refine does not. Any third keyword would mean
    // z.toJSONSchema learned to emit something new.
    expect(
      Object.keys(reason!).sort(),
      'the emitted schema for a refined param has changed shape — if z.toJSONSchema now emits refinements, ' +
        'the manifest hash covers them and this whole file can be narrowed',
    ).toEqual(['maxLength', 'minLength', 'type']);
  });
});

/**
 * THE ONE `execute` CHECK, and the reasoning for it being the only one is in the
 * header: a digest over 22 handler bodies is a fixture that gets regenerated on every
 * SQL fix until someone deletes it.
 *
 * This is the invariant a rewritten `execute` is actually likely to lose, and losing
 * it is the same defect class as the refine that motivated this file — a recorded
 * justification that says nothing. An action whose schema offers an `override*`
 * boolean is offering a way to proceed past a gate, and the executor is the only place
 * that can insist on the price:
 *
 *   - it must READ the flag (or the flag is decorative and the gate is unconditional)
 *   - it must be able to report the gate as DEGRADED (or a gate that could not be
 *     evaluated passes silently — which is what `markGateDegraded` exists to prevent)
 *   - it must TRIM the reason (or `overrideReason: " "` buys the override, and the
 *     audit trail records a space)
 *
 * Both actions that take an override satisfy all three today. This makes that a fact
 * instead of a coincidence.
 */
describe('an override is not free — the executor still has to charge for it', () => {
  it('every action offering an override flag reads it, can degrade its gate, and trims the reason', () => {
    const schemas = chains();
    const bodies = executes();
    const problems: string[] = [];
    let overrides = 0;

    for (const id of ACTION_IDS) {
      const flags = [...schemas[id]!.matchAll(/(override[A-Z][A-Za-z]*): z\.boolean\(\)/g)].map((m) => m[1]!);
      for (const flag of flags) {
        overrides += 1;
        const body = bodies[id]!;
        if (!body.includes(`params.${flag}`)) {
          problems.push(`${id}: schema offers ${flag} but execute never reads params.${flag} — the flag is decorative`);
        }
        // `markGateDegraded(` with the paren, not the bare name. MEASURED: the bare
        // name passed while the only CALL was deleted, because `markGateDegraded` is
        // still in the destructured parameter list on the `execute:` line. That is a
        // guard reading its own signature and calling it evidence.
        if (!body.includes('markGateDegraded(')) {
          problems.push(
            `${id}: takes ${flag} but execute never CALLS markGateDegraded — a gate that failed to evaluate ` +
              'would pass silently, which is the whole reason that callback exists',
          );
        }
        if (!(body.includes('overrideReason') && body.includes('.trim()'))) {
          problems.push(
            `${id}: takes ${flag} but execute does not trim overrideReason — a single space would buy the ` +
              'override and the audit trail would record it as the justification',
          );
        }
      }
    }

    // Anti-vacuity: a regex that stopped matching would make this pass on nothing.
    expect(overrides, 'no action declares an override flag — this check is watching nothing').toBeGreaterThan(0);
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
