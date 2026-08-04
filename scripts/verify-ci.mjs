#!/usr/bin/env node
/**
 * VERIFY CI — BOTH JOBS. LCX_OS_100X_PLAN.md §7.1 (GATE) and claim C12.
 *
 * WHY THIS EXISTS, precisely. `.github/workflows/ci.yml` has TWO jobs:
 *
 *   gate       "type-check · test · build · perf-budget"
 *   playwright "playwright screenshots + interaction smoke"   needs: gate
 *
 * Because the second `needs: gate`, GitHub SKIPS it when the first fails. A green
 * first job therefore proves nothing about the second — and I read exactly that
 * signal as "CI green" for three consecutive pushes while playwright was red.
 *
 * `gh run view --json jobs` reports a skipped job with conclusion `skipped`,
 * which is NOT a failure and is easy to scan past. This script treats anything
 * that is not `success` on EITHER job as a failure, and says which.
 *
 * Usage:  node scripts/verify-ci.mjs [--sha <sha>] [--wait]
 *   --wait   poll until the run completes (default: report current state)
 */
import { execFileSync } from 'node:child_process';

const REPO = 'voyagernik123/lcx-sales-automation-engine';
const EXPECTED_JOBS = 2;
const args = process.argv.slice(2);
const wait = args.includes('--wait');
const shaArg = args.indexOf('--sha') >= 0 ? args[args.indexOf('--sha') + 1] : null;

const sh = (cmd, a) => execFileSync(cmd, a, { encoding: 'utf8' }).trim();

function die(msg) {
  console.error(`\n✗ verify-ci: ${msg}\n`);
  process.exit(1);
}

let sha = shaArg;
if (!sha) {
  try {
    sha = sh('git', ['rev-parse', 'HEAD']);
  } catch {
    die('cannot resolve HEAD');
  }
}

function latestRun() {
  const raw = sh('gh', [
    'run', 'list', '-R', REPO, '--commit', sha, '--limit', '1',
    '--json', 'databaseId,status,conclusion,headSha,workflowName',
  ]);
  const runs = JSON.parse(raw);
  return runs[0] ?? null;
}

let run = latestRun();
if (!run) {
  die(
    `no CI run found for ${sha.slice(0, 8)}. It may not have been pushed yet. `
      + 'A gate that cannot see a run has not passed — it has not run.',
  );
}

if (wait) {
  const started = Date.now();
  while (run.status !== 'completed') {
    if (Date.now() - started > 30 * 60 * 1000) die('timed out waiting for the run to complete');
    process.stdout.write(`  … ${run.status} (${Math.round((Date.now() - started) / 1000)}s)\r`);
    await new Promise((r) => setTimeout(r, 20_000));
    run = latestRun();
  }
  process.stdout.write('\n');
}

const jobsRaw = sh('gh', ['run', 'view', String(run.databaseId), '-R', REPO, '--json', 'jobs']);
const jobs = JSON.parse(jobsRaw).jobs ?? [];

console.log(`\nrun ${run.databaseId} — ${sha.slice(0, 8)} — status ${run.status}\n`);
for (const j of jobs) {
  const mark = j.conclusion === 'success' ? '✓' : '✗';
  console.log(`  ${mark} ${j.name}  [${j.conclusion ?? j.status}]`);
}
console.log('');

const problems = [];

// THE WHOLE POINT: a missing second job is a pass that proves nothing.
if (jobs.length < EXPECTED_JOBS) {
  problems.push(
    `only ${jobs.length} of ${EXPECTED_JOBS} jobs are present. The playwright job is declared `
      + '`needs: gate`, so it is ABSENT rather than failed when the gate fails. Absent is not green.',
  );
}

for (const j of jobs) {
  if (j.conclusion === 'success') continue;
  if (j.conclusion === 'skipped') {
    problems.push(`"${j.name}" was SKIPPED. It did not run, so it did not pass.`);
  } else if (run.status !== 'completed') {
    problems.push(`"${j.name}" is ${j.status} — the run has not finished. Re-check with --wait.`);
  } else {
    problems.push(`"${j.name}" concluded ${j.conclusion}.`);
  }
}

if (problems.length > 0) {
  console.error('✗ verify-ci: CI is NOT green\n');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    `\n  gh run view ${run.databaseId} -R ${REPO} --log-failed\n`,
  );
  process.exit(1);
}

console.log(`✓ verify-ci: all ${jobs.length} jobs green on ${sha.slice(0, 8)}\n`);
