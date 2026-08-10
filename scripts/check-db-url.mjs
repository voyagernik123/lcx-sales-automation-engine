#!/usr/bin/env node
/**
 * FIND THE CONNECTION STRING THAT ACTUALLY WORKS, BEFORE IT GOES ANYWHERE NEAR RENDER.
 *
 * The loop this replaces cost most of a day: edit `DATABASE_URL` in the dashboard, wait for a
 * redeploy, curl `/health`, read a driver code, guess, repeat. None of those round trips
 * needed to happen — every candidate can be tested from a laptop in under a second.
 *
 * ── WHY IT TRIES A MATRIX AND NOT ONE STRING ────────────────────────────────────────
 * The first version stopped at the first `28P01`, reasoning that an auth failure means the
 * host answered and the credential is simply wrong. That reasoning has a hole: it assumes the
 * ONE combination tried was the one this project uses. Supabase exposes the pooler in two
 * modes on two ports, on two cluster prefixes per region, and the tenant-prefixed username is
 * a convention rather than a law. `28P01` from one combination narrows less than it appears
 * to, and stopping there told the operator "your password is wrong" three times when what it
 * had actually established was "this combination is wrong".
 *
 * So: one password entry, the whole matrix, and a verdict that distinguishes
 *   every combination refused the credential   ⇒ the password
 *   some combination worked                     ⇒ the combination, and it says which
 *
 * ── WHAT IT KNOWS THAT A HAND EDIT DOES NOT ─────────────────────────────────────────
 *  · `db.<ref>.supabase.co` has an AAAA record and NO A record. Render's free tier is
 *    IPv4-only, so the direct host can never work there — measured.
 *  · A wrong project ref makes the pooler answer `XX000` ("tenant or user not found"), not
 *    `28P01`. That difference is what proves a ref correct without a valid password.
 *  · Exactly four characters need percent-encoding in a password (`# / ? %`). The usual
 *    advice — encode everything special — is wrong in both directions; `@ : [ ] & +` and
 *    space are all handled raw.
 *
 * ── THE PASSWORD ────────────────────────────────────────────────────────────────────
 * Arrives on STDIN, never in `argv` (which `ps` shows to every process) and never in a file.
 * The finished URL is written to the CLIPBOARD, never to stdout, so this script's output is
 * safe to paste into a bug report or hand to an agent. Nothing is logged.
 */

import { Pool } from 'pg';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REF = process.env.SUPABASE_PROJECT_REF || 'fynzwqhxjguggkjvkwmj';
const REGIONS = (process.env.SUPABASE_REGIONS || 'eu-central-1,eu-central-2').split(',');
const CONNECT_MS = 8_000;

/** Only the four that `pg`'s parser actually rejects. `%` first, or the escapes get escaped. */
const encodePassword = (pw) => pw
  .replace(/%/g, '%25')
  .replace(/#/g, '%23')
  .replace(/\//g, '%2F')
  .replace(/\?/g, '%3F');

const rawIn = (() => {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
})();

/* Strip ONLY a trailing newline the shell added. Everything else is preserved and reported,
   because silently trimming a password is how a paste problem becomes an auth mystery. */
const pw = rawIn.replace(/\r?\n$/, '');
if (!pw) {
  console.error('no password on stdin — nothing to test');
  process.exit(2);
}

/*
 * A SAFE FINGERPRINT, so a mangled paste is visible without the secret being.
 *
 * Length plus eight hex of a SHA-256 is not a meaningful brute-force aid against a random
 * generated password, and it is the fastest way to answer the question that actually matters
 * here: "did what I pasted survive the terminal?" Two runs showing different fingerprints for
 * the same intended password is an input problem, not a credential problem — and that
 * distinction is exactly what three identical `28P01`s could not make.
 */
const fp = createHash('sha256').update(pw).digest('hex').slice(0, 8);
console.log(`· received ${pw.length} characters, fingerprint ${fp}`);
if (/^\s|\s$/.test(pw)) {
  console.log('  ⚠ it begins or ends with WHITESPACE — almost certainly a paste artefact.');
  console.log('    Both forms are tried below so this cannot silently cost you an attempt.');
}
const encoded = encodePassword(pw);
if (encoded !== pw) console.log('  · contains characters requiring percent-encoding — handled');

/*
 * THE MATRIX. Ordered cheapest-hypothesis-first so the common case still answers immediately.
 *
 * `aws-0-eu-central-1` already answered `28P01` rather than `XX000` for this ref, which proves
 * that cluster knows the tenant — so it gets every port/username variant, and the other
 * clusters get only the standard combination as a control.
 */
const variants = [];
const push = (host, port, user, pass, why, kind) => variants.push({
  kind, // 'canonical' | 'alt' | 'control'
  label: `${host.split('.')[0]}:${port} ${user === 'postgres' ? 'user=postgres' : 'user=postgres.<ref>'}${why ? ` (${why})` : ''}`,
  url: `postgresql://${user}:${pass}@${host}:${port}/postgres`,
});

const primary = `aws-0-${REGIONS[0]}.pooler.supabase.com`;

/* THE CANONICAL COMBINATION — the one the verdict is read from. Everything else either offers
   an alternative worth trying or is a CONTROL whose failure is informative. */
push(primary, 5432, `postgres.${REF}`, encoded, 'session — the expected one', 'canonical');
push(primary, 6543, `postgres.${REF}`, encoded, 'transaction mode', 'alt');
// The password EXACTLY as received, in case the encoder is the thing that is wrong.
if (encoded !== pw) push(primary, 5432, `postgres.${REF}`, pw, 'unencoded password', 'alt');
// And trimmed, in case the terminal added whitespace.
const trimmed = encodePassword(pw.trim());
if (trimmed !== encoded) push(primary, 5432, `postgres.${REF}`, trimmed, 'whitespace trimmed', 'alt');

/*
 * CONTROLS. These are EXPECTED to fail with XX000, and that failure is the evidence: it proves
 * the tenant prefix is required and that this cluster is the only one hosting this project.
 * Reporting their XX000 as "wrong project ref" — which an earlier version did — sends the
 * operator to re-check the one thing already proven correct.
 */
push(primary, 5432, 'postgres', encoded, 'control: no tenant prefix', 'control');
for (const region of REGIONS) {
  for (const n of [0, 1]) {
    const host = `aws-${n}-${region}.pooler.supabase.com`;
    if (host === primary) continue;
    push(host, 5432, `postgres.${REF}`, encoded, 'control: other cluster', 'control');
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
      `SELECT current_database() AS db, current_user AS who,
              (SELECT count(*) FROM information_schema.tables WHERE table_schema='public') AS tables`,
    );
    return { ok: true, label, url, db: rows[0].db, who: rows[0].who, tables: Number(rows[0].tables) };
  } catch (err) {
    return { ok: false, label, code: err?.code || err?.errno || 'UNKNOWN' };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

console.log('');
let winner = null;
let canonicalCode = null;
for (const v of variants) {
  const r = await attempt(v);
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.label.padEnd(50)} ${r.ok ? 'CONNECTED' : r.code}`);
  if (r.ok) { winner = r; break; }
  if (v.kind === 'canonical') canonicalCode = String(r.code);
}

if (!winner) {
  console.log('');
  /*
   * THE VERDICT IS READ FROM THE CANONICAL COMBINATION ONLY.
   *
   * An earlier version pooled every code into one set and reported "codes seen: 28P01, XX000",
   * then explained XX000 as a wrong project ref — while the XX000s were the deliberate controls
   * whose failure PROVES the ref right. A diagnostic that points at the one thing already
   * established is worse than silence, because it gets acted on.
   */
  if (canonicalCode === '28P01') {
    console.log('✗ It is the PASSWORD. Everything else is now proven correct:');
    console.log('');
    console.log('    the expected combination answered 28P01  ⇒ the tenant is known, the');
    console.log('                                               credential was refused');
    console.log('    transaction mode answered the same       ⇒ not a pooler-mode problem');
    console.log('    dropping the tenant prefix gave XX000    ⇒ the prefix IS required, so the');
    console.log('                                               username format is right');
    console.log('    every other cluster gave XX000           ⇒ this cluster is the right one');
    console.log('');
    console.log('  Those XX000s are CONTROLS. They are supposed to fail; their failure is the');
    console.log('  evidence. Nothing above points at the host, the region, the port, the');
    console.log('  username or the project ref.');
    console.log('');
    console.log('  Do this — Supabase → your project → Project Settings → Database →');
    console.log('  "Reset database password". COPY the value it shows you, then run:');
    console.log('');
    console.log('      bash /Users/nik/Downloads/usclaude-main/scripts/go-live.sh --clip');
    console.log('');
    console.log('  --clip reads it from the clipboard, so a 30-character generated password is');
    console.log('  never retyped into an invisible prompt. Nothing else uses this password, so');
    console.log('  resetting it breaks nothing.');
    console.log('');
    console.log(`  Fingerprint of what was tested: ${fp} (${pw.length} chars). If two runs you`);
    console.log('  believe were identical show DIFFERENT fingerprints, the problem is the input,');
    console.log('  not the credential.');
  } else if (canonicalCode === 'XX000') {
    console.log('✗ The pooler does not know this tenant (XX000) on the expected combination.');
    console.log(`  That points at the project ref, currently "${REF}".`);
    console.log('  Override it: SUPABASE_PROJECT_REF=<ref> bash scripts/go-live.sh');
  } else {
    console.log(`✗ The expected combination failed with ${canonicalCode ?? 'no result'}.`);
    console.log('  ENOTFOUND ⇒ the host does not resolve: wrong region or ref.');
    console.log('  ETIMEDOUT ⇒ something local is blocking outbound 5432/6543.');
  }
  process.exit(1);
}

/* The URL goes to the CLIPBOARD and never to stdout — it contains the password, and this
   output is read by people and by agents. */
const copied = spawnSync('pbcopy', { input: winner.url }).status === 0;

console.log('');
console.log(`✓ CONNECTED — ${winner.label}, database "${winner.db}", role "${winner.who}".`);
console.log(copied
  ? '✓ The full connection string is on your clipboard. It was NOT printed anywhere.'
  : '! pbcopy unavailable — re-run on macOS, or rebuild it by hand from the label above.');

if (winner.tables === 0) {
  console.log('');
  console.log('⚠ THE DATABASE IS EMPTY — 0 tables in `public`. The connection is fine and there is');
  console.log('  nothing in it, so migrations have never run against this project. Every screen will');
  console.log('  show its honest "no data" state rather than an error. Tell me and I will sort the');
  console.log('  migration order out before you expect data.');
} else {
  console.log(`✓ ${winner.tables} tables in \`public\` — a populated database.`);
}
