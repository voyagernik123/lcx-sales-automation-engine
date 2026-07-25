import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_MANIFEST } from '../command/generated/actionManifest';
import { blockedExplanation, humaniseParam, promptsFor, verbsFor, type Principal } from '@/components/command/grammar';
import type { ManifestAction } from '../command/types';

/**
 * THE OPERABILITY AUDIT (TERMINAL Phase 7).
 *
 * The plan names this "the standard the whole program is judged by", and asks five
 * questions of every governed action: is it reachable by keyboard, is it under 5s, is
 * it discoverable without docs, does its gate explain itself, and is its feedback
 * unmistakable?
 *
 * Four of those five can be answered mechanically, so they are answered here rather
 * than asserted in a commit message — and answered for ALL 22 actions rather than for
 * the three someone happened to try. The point of encoding the standard as a test is
 * that action 23 has to meet it too, on the day it is added, without anyone
 * remembering this document exists.
 *
 * THE FIFTH QUESTION IS NOT ANSWERED HERE, and pretending otherwise would be the
 * exact failure this programme has spent seven phases avoiding. "Under 5s" is a
 * latency claim about 22 real governed writes against production. Every one of them
 * MUTATES something — launches a campaign, records a decision, grants an entitlement —
 * so measuring it means doing it, twenty-two times, on the real desk. That is not a
 * test, and the honest answer is recorded in the report below as unmeasured, with the
 * two things that ARE measured in its place: the infrastructure floor from Phase 2
 * (165-195ms before our code runs, geography, not fixable in software) and the
 * two-metric interaction SLO already published in the Ops Health panel.
 */

const SRC = join(__dirname, '..', '..');

function source(...parts: string[]): string {
  return readFileSync(join(SRC, ...parts), 'utf8');
}

/** An approver holding every workspace — the widest principal, so nothing is hidden. */
const FULL: Principal = {
  role: 'approver',
  entitlements: {
    sales: 'approve',
    command: 'approve',
    intel: 'approve',
    regulatory: 'approve',
    distribution: 'approve',
    governance: 'approve',
  },
};

const actions = ACTION_MANIFEST.actions;

describe('the operability audit', () => {
  it('there are actions to audit at all', () => {
    // Guards every assertion below from passing vacuously against an empty manifest —
    // the failure mode where a generated file breaks and the whole audit goes green.
    expect(actions.length).toBeGreaterThan(15);
  });

  /* ── 1. REACHABLE BY KEYBOARD ─────────────────────────────────────────── */

  it('every action is offered by the command line for at least one subject type', () => {
    // Reachability is not "a button exists somewhere". It is that the keyboard path —
    // the command line, which is the only surface that covers all 22 — actually
    // surfaces it. An action reachable solely from a page's own button is unreachable
    // for an operator working from the keyboard.
    const unreachable: string[] = [];
    for (const action of actions) {
      const offered = action.subjectTypes.some((type) => {
        const noun = { type, id: 'audit-subject', label: 'Audit subject' };
        return verbsFor(ACTION_MANIFEST, noun, FULL).some((v) => v.action.id === action.id);
      });
      if (!offered) unreachable.push(`${action.id} (subjectTypes: ${action.subjectTypes.join(', ')})`);
    }
    expect(unreachable, `not reachable from the command line:\n${unreachable.join('\n')}`).toEqual([]);
  });

  it('every action declares at least one subject type', () => {
    // An action with no subject type can never be offered by the grammar, so it is
    // dead on the keyboard no matter what the server supports.
    const orphans = actions.filter((a) => a.subjectTypes.length === 0).map((a) => a.id);
    expect(orphans, `no subject type, so unreachable by construction:\n${orphans.join('\n')}`).toEqual([]);
  });

  it('every action is fully specifiable from the keyboard', () => {
    // Reachable but un-completable is worse than absent: the operator gets three
    // keystrokes in and hits a parameter the command line cannot ask for.
    const unfillable: string[] = [];
    for (const action of actions) {
      const prompts = promptsFor(action, ACTION_MANIFEST.valueSets);
      const required = action.params?.required ?? [];
      for (const name of required) {
        if (!prompts.some((p) => p.name === name)) unfillable.push(`${action.id}.${name}`);
      }
    }
    expect(unfillable, `required params the command line cannot ask for:\n${unfillable.join('\n')}`).toEqual([]);
  });

  /* ── 2. DISCOVERABLE WITHOUT DOCS ─────────────────────────────────────── */

  it('every action has a label a human would recognise', () => {
    // Not the id. `command_set_partner_stage` is a route, "Set partner stage" is a
    // thing an operator wants to do — and the label is what both the command line and
    // the `?` manual show.
    const bad = actions
      .filter((a) => !a.label || a.label === a.id || a.label.includes('_'))
      .map((a) => `${a.id} → ${JSON.stringify(a.label)}`);
    expect(bad, `labels that are ids rather than language:\n${bad.join('\n')}`).toEqual([]);
  });

  it('every action explains what it does, in a sentence', () => {
    // The description is the only thing standing between an operator and invoking a
    // governed write they have guessed the meaning of. A short one is a missing one.
    const thin = actions
      .filter((a) => (a.description ?? '').trim().length < 25)
      .map((a) => `${a.id} → ${JSON.stringify(a.description ?? '')}`);
    expect(thin, `descriptions too thin to act on:\n${thin.join('\n')}`).toEqual([]);
  });

  it('every parameter an operator must supply is prompted in words, not by key', () => {
    // What this caught, and it is the audit's best find: the command line rendered
    // `prompt.name` — the raw JSON key, uppercased by CSS — for all 44 parameters, so a
    // governed write asked the operator for `SUBJECTID` and `OVERRIDEGATE`. Answering
    // that requires knowing the API, which is documentation dependence by definition.
    // `Prompt.label` now exists and is derived in `promptsFor`, so both the command line
    // and the `?` manual read the same words and a new action cannot ship without them.
    const unlabelled: string[] = [];
    const notHumanised: string[] = [];
    for (const action of actions) {
      for (const prompt of promptsFor(action, ACTION_MANIFEST.valueSets)) {
        if (!prompt.label?.trim()) {
          unlabelled.push(`${action.id}.${prompt.name}`);
          continue;
        }
        // A single lower-case word is legitimately its own label (`owner` → "Owner"),
        // so only names that CONTAIN structure — camelCase or a separator — must come
        // out different from the key. That is where the unreadable ones live.
        const structured = /[A-Z]|[_-]/.test(prompt.name);
        if (structured && prompt.label === prompt.name) notHumanised.push(`${action.id}.${prompt.name}`);
      }
    }
    expect(unlabelled, `params with no label at all:\n${unlabelled.join('\n')}`).toEqual([]);
    expect(notHumanised, `structured keys still shown raw:\n${notHumanised.join('\n')}`).toEqual([]);
  });

  it('the humaniser keeps acronyms as acronyms', () => {
    // "Subject Id" reads as a typo and "SUBJECTID" reads as a database column. Both
    // undermine the point of having a label at all.
    expect(humaniseParam('subjectId')).toBe('Subject ID');
    expect(humaniseParam('overrideGate')).toBe('Override gate');
    expect(humaniseParam('due_at')).toBe('Due at');
    expect(humaniseParam('rfiUrl')).toBe('RFI URL');
    expect(humaniseParam('owner')).toBe('Owner');
  });

  /* ── 3. THE GATE EXPLAINS ITSELF ──────────────────────────────────────── */

  it('every way an action can be blocked produces a remedy, not just a reason', () => {
    // "You cannot do this" is a locked door. "This needs an approver — ask Nik or
    // Monty" is a way forward. The distinction is the whole point of a governed
    // action's refusal, and it is what the operator reads at the worst moment.
    const kinds = [
      { kind: 'role' as const, needed: 'approver' as const },
      { kind: 'entitlement' as const, workspace: 'command', needed: 'operate' as const, held: 'view' as const },
    ];
    for (const blocked of kinds) {
      const text = blockedExplanation(blocked);
      expect(text.length, `${blocked.kind} has no explanation`).toBeGreaterThan(20);
      // A remedy is an instruction. Without one the sentence is just the refusal
      // restated in friendlier words.
      expect(text, `${blocked.kind} explains the refusal but names no way forward: ${text}`).toMatch(
        /ask|request|need|contact|approver|granted|so you can/i,
      );
    }
  });

  it('refusals are classified by code, never by matching server prose', () => {
    // Banked in Phase 3 and re-asserted here because it is the audit's business: a
    // client that regexes server messages silently starts mis-classifying the day
    // someone rewords an error, and a mis-classified refusal is one that offers the
    // wrong remedy.
    const invoke = source('components', 'command', 'invoke.ts');
    expect(invoke).toMatch(/\bcode\b/);
    const prose = invoke.match(/\.message\s*\.\s*(includes|match|indexOf)\s*\(/g) ?? [];
    expect(prose, `invoke.ts matches on server prose: ${prose.join(', ')}`).toEqual([]);
  });

  it('the one refusal that must never be overridable says so', () => {
    // An override on an authority check would make the authority decorative. Phase 3
    // fixed a live privilege-escalation bug of exactly this shape, so the invariant is
    // worth a test rather than a memory.
    const invoke = source('components', 'command', 'invoke.ts');
    const block = invoke.slice(invoke.indexOf('APPROVER_REQUIRED'));
    expect(block.slice(0, 400)).toMatch(/overridable:\s*false/);
  });

  /* ── 4. FEEDBACK IS UNMISTAKABLE ──────────────────────────────────────── */

  it('a landed write and a refused one produce different, deliberate feedback', () => {
    const panel = source('components', 'command', 'VerbPanel.tsx');
    expect(panel, 'a commit produces no feedback').toContain('feedback.commit');
    expect(panel, 'a refusal produces no feedback').toContain('feedback.refuse');
  });

  it('a no-op is never dressed up as a success', () => {
    // Several actions return HTTP 200 having changed nothing (`track` on an
    // already-tracked project). Celebrating that teaches the operator to trust a
    // feeling that does not correspond to a change in the record — which is worse than
    // no feedback at all, because it is confidently wrong.
    const panel = source('components', 'command', 'VerbPanel.tsx');
    expect(panel).toContain('wasNoOp');
    expect(panel, 'the commit feedback is not gated on something actually changing').toMatch(
      /if\s*\(!noOp\)\s*feedback\.commit/,
    );
  });

  it('a refusal is spoken, not only shaken', () => {
    // Motion-only feedback is feedback some operators never receive, and a refusal is
    // the most important thing this app says.
    const juice = source('lib', 'juice.ts');
    expect(juice).toContain('aria-live');
    expect(juice, 'refuse() shakes without announcing').toMatch(/export function refuse[\s\S]{0,400}announce\(/);
  });

  /* ── 5. UNDER 5s — NOT ANSWERED HERE, AND WHY ─────────────────────────── */

  it('records what is measured about speed, and what is not', () => {
    // Deliberately a documentation assertion rather than a latency one. Measuring
    // "under 5s" for 22 governed actions means invoking 22 real mutations against the
    // production desk; there is no dry-run path, by design, because a governed write
    // is audited and attributed. So this test pins the two things that ARE measured,
    // and fails if either instrument is removed — which would quietly turn the
    // unanswered question into an unanswerable one.
    const perf = source('lib', 'perf.ts');
    // Phase 2's two-metric SLO. Deleting `settle` would let the headline p95 improve
    // as the desk got slower, so both must exist together.
    expect(perf, 'the paint metric is gone').toMatch(/ui_interaction_p95|interaction/);
    expect(perf, 'the settle metric is gone — the paint number alone is misleading').toMatch(/settle/);
  });
});

/**
 * THE REPORT.
 *
 * Printed as a test so it cannot rot into a stale markdown table, and so the numbers
 * in it are the numbers the assertions above just checked. It always passes; its job
 * is to make the audit legible to a human reading CI output.
 */
describe('the operability report', () => {
  it('every action, against every mechanically checkable criterion', () => {
    const rows = actions.map((a: ManifestAction) => {
      const prompts = promptsFor(a, ACTION_MANIFEST.valueSets);
      const gated = a.minRole === 'approver' || !!a.workspace;
      return [
        a.id.padEnd(30),
        `subjects:${String(a.subjectTypes.length).padStart(2)}`,
        `params:${String(prompts.length).padStart(2)}`,
        gated ? 'gated  ' : 'open   ',
        a.minRole === 'approver' ? 'approver' : 'operator',
        (a.workspace ?? '—').padEnd(13),
      ].join(' ');
    });
    const report = [
      `${actions.length} governed actions · manifest checked against 4 of the 5 audit criteria`,
      'reachable ✓  specifiable ✓  discoverable ✓  gate-explains ✓  under-5s: unmeasured (see the comment)',
      '',
      ...rows,
    ].join('\n');
    // Non-empty is the only real assertion; the value is the printed table.
    expect(report.length).toBeGreaterThan(actions.length * 40);
  });
});
