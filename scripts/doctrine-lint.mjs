#!/usr/bin/env node
/**
 * THE DOCTRINE LINTER — LCX_OS_100X_PLAN.md §7.3.
 *
 * WHY THIS EXISTS. `assertHonestPayload` reached production with ONE caller, and
 * before that with zero (`apps/web/src/lib/api/marketing.ts:114` says so in its own
 * comment). A doctrine enforced by whoever is paying attention decays to decoration.
 * So the parts of it that CAN be checked mechanically are checked here, and CI fails.
 *
 * It is deliberately narrow. Every rule is one a human could get wrong silently, and
 * none needs a database or a build. Rules that cannot be checked without running the
 * app are NOT faked here — they live in tests.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const notes = [];
const fail = (rule, msg) => failures.push(`${rule}: ${msg}`);
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const has = (rel) => existsSync(join(ROOT, rel));

function walk(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

/* ── RULE 1 — the deliberate-absences register ────────────────────────────────
 * Every registered refusal must actually be emitted by the file that claims to
 * emit it AND asserted by the test that claims to prove it. An untested refusal
 * is a silent default waiting to happen. This also catches a stale register
 * after a rename.
 */
const REGISTER = 'docs/phases/ABSENCES.md';
if (!has(REGISTER)) {
  fail('absences', `${REGISTER} is missing. The register is not optional.`);
} else {
  const block = read(REGISTER).split('<!-- ABSENCES:BEGIN -->')[1]?.split('<!-- ABSENCES:END -->')[0] ?? '';
  const rows = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.includes('`'))
    .map((l) => l.split('|').map((c) => c.trim()).filter(Boolean));

  if (rows.length === 0) fail('absences', 'the register block parsed to zero rows — the format has drifted.');
  for (const [codeCell, sourceRel, testRel] of rows) {
    const code = (codeCell ?? '').replace(/`/g, '');
    if (!code || !sourceRel || !testRel) {
      fail('absences', `row for ${codeCell} is missing a column.`);
      continue;
    }
    for (const [label, rel] of [['source', sourceRel], ['test', testRel]]) {
      if (!has(rel)) {
        fail('absences', `${code}: ${label} file ${rel} does not exist.`);
      } else if (!read(rel).includes(code)) {
        fail(
          'absences',
          `${code} is registered as refusing in ${rel} (${label}) but the string does not appear `
            + 'there. Either it was renamed and the register is stale, or the refusal was removed '
            + 'and nothing now refuses.',
        );
      }
    }
  }
  notes.push(`absences: ${rows.length} registered refusals, each present in source and test`);
}

/* ── RULE 2 — notifications must record a compartment (0067) ──────────────────
 * A row with no workspace is unreadable by design: the list filters on it, so an
 * INSERT that omits it writes a row addressed to nobody. The typed notify()
 * argument covers TS call sites; this covers the raw SQL in the sweep, which the
 * type system cannot see.
 */
const notifSrc = 'apps/api/src/notifications/service.ts';
if (has(notifSrc)) {
  const src = read(notifSrc);
  const inserts = src.match(/INSERT INTO notifications \(([^)]*)\)/g) ?? [];
  if (inserts.length === 0) fail('notif-scope', 'no INSERT INTO notifications found — has the file moved?');
  for (const ins of inserts) {
    if (!ins.includes('workspace')) fail('notif-scope', `an INSERT omits the workspace column: ${ins.slice(0, 90)}…`);
  }
  if (/FROM notifications\s+ORDER BY/.test(src.replace(/\s+/g, ' '))) {
    fail(
      'notif-scope',
      'an unfiltered `FROM notifications ORDER BY …` is back. That exact statement was the '
        + 'production need-to-know leak 0067 closed.',
    );
  }
  notes.push(`notif-scope: ${inserts.length} INSERTs all carry a compartment; read path filtered`);
}

/* ── RULE 3 — the honesty ceiling has not regressed to zero callers ───────────
 * THE FIRST VERSION OF THIS RULE WAS WRONG AND IS RECORDED SO IT IS NOT REBUILT.
 * It grepped for `reach:` / `impressions:` as field names and produced NINE
 * false positives against correct code: `reach` is an ordinal 1-5 scoring
 * dimension in the channel-mix matrix (routes/distribution.ts, sitting beside
 * `cost` and `effort`), a typed `ReachAssessment` input to crisis triage
 * (routes/marketingDesk.ts), and an ordinary English word inside a comment
 * (routes/marketingGates.ts). A linter that demands edits to correct code is one
 * that gets deleted, which is worse than no linter.
 *
 * The repo ALREADY has the authoritative mechanism: `assertHonestPayload` walks a
 * payload against `FORBIDDEN_METRIC_FIELD_NAMES`
 * (packages/shared/src/marketing/observation.ts), it is tested, and it objects to
 * the field NAME rather than the word. A second, cruder copy in a lint script is
 * exactly the drift this programme is trying to remove.
 *
 * So this rule guards the failure that actually happened: `assertHonestPayload`
 * shipped with ZERO production callers, and now has one. Static analysis cannot
 * walk a runtime payload — that is F1 in P1, which moves enforcement into API
 * middleware. Until then, the check that matters is that the count never returns
 * to zero.
 */
const DOCTRINE_SRC = 'packages/shared/src/marketing/observation.ts';
if (!has(DOCTRINE_SRC)) {
  fail('honesty-ceiling', `${DOCTRINE_SRC} is missing — the doctrine has no definition.`);
} else {
  if (!read(DOCTRINE_SRC).includes('FORBIDDEN_METRIC_FIELD_NAMES')) {
    fail('honesty-ceiling', 'FORBIDDEN_METRIC_FIELD_NAMES is gone. The banned-field list is the doctrine.');
  }
  const callers = [];
  for (const dir of ['apps/api/src', 'apps/web/src']) {
    if (!has(dir)) continue;
    for (const rel of walk(dir)) {
      if (!/\.(ts|tsx)$/.test(rel) || rel.includes('__tests__') || rel.includes('.test.')) continue;
      const src = read(rel);
      // A call, not the import or a mention in a comment.
      if (/assertHonestPayload\s*\(/.test(src.replace(/\/\/.*$/gm, ''))) callers.push(rel);
    }
  }
  if (callers.length === 0) {
    fail(
      'honesty-ceiling',
      'assertHonestPayload has ZERO production callers. It has been here before — the doctrine '
        + 'became decoration and nothing noticed. Wire it, or delete it and say so out loud.',
    );
  }
  notes.push(
    `honesty-ceiling: assertHonestPayload has ${callers.length} caller(s) `
      + `(${callers.join(', ') || 'none'}) — F1/P1 moves this to middleware`,
  );
}

/* ── RULE 4 — a phase that claims done has its evidence beside it ─────────────
 * §7.1: "the command and its output, or it did not happen."
 */
const PHASES = 'docs/phases';
if (has(PHASES)) {
  const files = readdirSync(join(ROOT, PHASES));
  const claims = files.filter((f) => f.endsWith('_CLAIM.md'));
  for (const f of claims) {
    const evidence = f.replace('_CLAIM.md', '_EVIDENCE.md');
    if (!files.includes(evidence)) fail('phase-evidence', `${f} exists with no ${evidence}.`);
  }
  notes.push(`phase-evidence: ${claims.length} phase(s) checked`);
}

for (const n of notes) console.log(`  ✓ ${n}`);
if (failures.length > 0) {
  console.error(`\n✗ doctrine-lint: ${failures.length} violation(s)\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error('');
  process.exit(1);
}
console.log('\n✓ doctrine-lint: clean\n');
