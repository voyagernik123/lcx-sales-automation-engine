#!/usr/bin/env node
/**
 * FIND THE CONNECTION STRING THAT ACTUALLY WORKS, BEFORE IT GOES ANYWHERE NEAR RENDER.
 *
 * The loop this replaces cost most of a day: edit `DATABASE_URL` in the dashboard, wait for a
 * redeploy, curl `/health`, read a driver code, guess, repeat. Three round trips, none of which
 * needed to happen, because every candidate can be tested from a laptop in under a second.
 *
 * ── WHAT IT KNOWS THAT A HUMAN EDITING THE STRING BY HAND DOES NOT ──────────────────
 *  · `db.<ref>.supabase.co` has an AAAA record and NO A record. Render's free tier is
 *    IPv4-only, so the direct host can never work there — measured, see
 *    `apps/api/src/db/connectionTarget.ts`.
 *  · The pooler needs the project ref in the USERNAME (`postgres.<ref>`). Change only the
 *    host and it answers 28P01, which reads exactly like a wrong password.
 *  · The region prefix is `aws-0` or `aws-1` and there is no way to know which from the ref,
 *    so both are tried rather than assumed.
 *  · Exactly four characters need percent-encoding in the password (`# / ? %`). The usual
 *    advice — encode everything special — is wrong in both directions, and `@ : [ ] & +`
 *    and space are handled raw.
 *
 * ── THE PASSWORD ────────────────────────────────────────────────────────────────────
 * Arrives on STDIN, never in `argv` (which `ps` shows to every process on the machine) and
 * never in a file. The finished URL is written to the CLIPBOARD, never to stdout, so this
 * script's output can be pasted into a bug report or read by an agent without leaking the
 * credential. Nothing is logged, and nothing is retried after an auth failure.
 */

import { Pool } from 'pg';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REF = process.env.SUPABASE_PROJECT_REF || 'fynzwqhxjguggkjvkwmj';
const REGIONS = ['eu-central-1', 'eu-central-2'];
const CONNECT_MS = 8_000;

/** Only the four that `pg`'s parser actually rejects. `%` first, or the escapes get escaped. */
function encodePassword(pw) {
  return pw
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/\//g, '%2F')
    .replace(/\?/g, '%3F');
}

function readPasswordFromStdin() {
  try {
    // fd 0 to end. The shell hands it over with no echo and no history entry.
    return readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  } catch {
    return '';
  }
}

const pw = readPasswordFromStdin();
if (!pw) {
  console.error('no password on stdin — nothing to test');
  process.exit(2);
}
const enc = encodePassword(pw);
if (enc !== pw) {
  // Says THAT it encoded, never what. A count would narrow a brute force.
  console.log('· password contained characters that must be percent-encoded — handled');
}

/* Session pooler (5432), not transaction (6543): the API holds a persistent pool of 10, and
   transaction mode has no session state and no prepared statements. */
const candidates = [];
for (const region of REGIONS) {
  for (const n of [0, 1]) {
    candidates.push({
      label: `aws-${n}-${region}`,
      url: `postgresql://postgres.${REF}:${enc}@aws-${n}-${region}.pooler.supabase.com:5432/postgres`,
    });
  }
}

async function attempt({ label, url }) {
  const pool = new Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: CONNECT_MS,
    query_timeout: CONNECT_MS,
    statement_timeout: CONNECT_MS,
  });
  try {
    const { rows } = await pool.query(
      `SELECT current_database() AS db,
              (SELECT count(*) FROM information_schema.tables WHERE table_schema='public') AS tables`,
    );
    return { ok: true, label, url, db: rows[0].db, tables: Number(rows[0].tables) };
  } catch (err) {
    return { ok: false, label, code: err?.code ?? 'UNKNOWN' };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

let winner = null;
const tried = [];
for (const c of candidates) {
  const r = await attempt(c);
  tried.push(r);
  if (r.ok) { winner = r; break; }
  /*
   * 28P01 MEANS STOP. The host answered and the credential was refused, so every other host
   * will refuse it too — and a paused-account lockout is a real consequence of hammering.
   * Any other code is a routing problem and the next candidate is worth a try.
   */
  if (r.code === '28P01') break;
}

for (const r of tried) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.label.padEnd(20)} ${r.ok ? 'CONNECTED' : r.code}`);
}

if (!winner) {
  const auth = tried.find((r) => r.code === '28P01');
  console.log('');
  if (auth) {
    console.log('✗ The host answered and REFUSED the password (28P01).');
    console.log('  The routing is correct, so this is the credential itself.');
    console.log('  Supabase → Settings → Database → Reset database password, then run this again.');
  } else {
    console.log('✗ No pooler host answered. Codes above.');
    console.log('  ENOTFOUND ⇒ the project ref is wrong (pass SUPABASE_PROJECT_REF=... to override).');
    console.log('  ETIMEDOUT ⇒ something local is blocking outbound 5432.');
  }
  process.exit(1);
}

/* The URL goes to the CLIPBOARD and never to stdout. It contains the password, and this
   script's output is read by people and by agents. */
const clip = spawnSync('pbcopy', { input: winner.url });
const copied = clip.status === 0;

console.log('');
console.log(`✓ WORKING connection string found — host ${winner.label}, database "${winner.db}".`);
console.log(copied
  ? '✓ Copied to your clipboard. It was NOT printed anywhere.'
  : '! Could not reach pbcopy. Re-run on macOS, or build it by hand: the only change from the\n  direct string is the host (above, .pooler.supabase.com:5432) and the username\n  (postgres.<project-ref>).');

if (winner.tables === 0) {
  console.log('');
  console.log('⚠ THE DATABASE IS EMPTY — 0 tables in `public`. The connection is fine and there is');
  console.log('  nothing in it, so migrations have never run against this project. Every screen will');
  console.log('  show its honest "no data" state rather than an error. Say so and I will sort the');
  console.log('  migration order out; do not point the API at it expecting data.');
} else {
  console.log(`✓ ${winner.tables} tables in \`public\` — this is a populated database.`);
}
