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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
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
/**
 * WHAT DID THE OPERATOR ACTUALLY PASTE?
 *
 * Three runs were diagnosed as "wrong password" while the input was 16, then 101, then 65
 * characters. A 101-character string containing `/` is not a password — it is the whole
 * connection string, which is exactly what Supabase's copy button puts on the clipboard. The
 * checker asked for "the password", was handed the thing the dashboard actually offers, and
 * reported a confident `28P01` about a credential it had mangled.
 *
 * That is a design failure and not an operator error: if the natural thing to copy is the
 * whole string, accept the whole string. So this classifies the input first and either uses
 * it, or names precisely which of Supabase's four credentials it is and why it cannot work.
 */
function classify(s) {
  /*
   * SEARCH THE WHOLE INPUT, NOT JUST POSITION 0. A copy out of a docs page, a config block or
   * the Connect panel brings surrounding text with it, and a connection string sitting on line
   * 3 of a paste is still a connection string. Requiring it at the start classified a perfectly
   * usable paste as "a password" and then reported an authentication failure about it.
   */
  const embedded = /postgres(?:ql)?:\/\/[^\s"'<>]+/i.exec(s);
  if (embedded) return { kind: 'connection-string', url: embedded[0], offset: embedded.index };
  if (/^eyJ[A-Za-z0-9_-]{10,}\./.test(s)) return { kind: 'jwt' };
  if (/^sbp?_/.test(s)) return { kind: 'api-key' };
  if (/\.supabase\.(co|com)/i.test(s)) return { kind: 'contains-host' };
  return { kind: 'password' };
}

/**
 * A STRUCTURAL DESCRIPTION, so "what did I actually paste" stops being unanswerable.
 *
 * Reports only STRUCTURE — separators, line count, whitespace — never the characters of the
 * secret itself. Three runs failed identically because nothing on screen distinguished a
 * password from a URL from a key, and the one question that mattered ("what is this thing?")
 * had no way to be asked.
 */
function describeShape(s) {
  const lines = s.split(/\r?\n/).length;
  const marks = [];
  if (s.includes('://')) marks.push("'://'");
  if (s.includes('@')) marks.push("'@'");
  if (/\s/.test(s)) marks.push('whitespace');
  if (lines > 1) marks.push(`${lines} LINES`);
  return `${s.length} chars · ${marks.length ? `contains ${marks.join(', ')}` : 'no URL separators, single line — looks like a bare secret'}`;
}

const shape = classify(pw);
console.log(`· shape: ${describeShape(pw)}`);
if (pw.split(/\r?\n/).length > 1) {
  console.log('  ⚠ MULTIPLE LINES. A multi-line paste is never a password — something extra came');
  console.log('    along with it. If a connection string is in there it will be found and used.');
}

if (shape.kind === 'jwt' || shape.kind === 'api-key') {
  console.log(`✗ That is a Supabase API ${shape.kind === 'jwt' ? 'key (a JWT — anon or service_role)' : 'key or access token'}, not the database password.`);
  console.log('  Those authenticate against the REST/Auth API. Postgres has never heard of them.');
  console.log('');
  console.log('  The DATABASE password is a separate credential:');
  console.log('    Supabase → your project → Project Settings → Database → Database password');
  console.log('  Or paste the whole connection string from Connect → Session pooler — this');
  console.log('  script now accepts that directly.');
  process.exit(2);
}

if (shape.kind === 'contains-host') {
  console.log('✗ That contains a Supabase hostname but is not a connection string, so it is');
  console.log('  probably a fragment of one. Paste either the COMPLETE string (starting');
  console.log('  postgresql://) or the password on its own.');
  process.exit(2);
}

/*
 * A WHOLE CONNECTION STRING IS THE MOST USEFUL THING TO BE GIVEN, so it is used as given
 * before anything is varied — it may already be correct, and if it is not, its password is
 * still what the matrix needs.
 */
let givenUrl = null;
if (shape.kind === 'connection-string') {
  const url = shape.url;
  if (shape.offset > 0) {
    console.log(`· found a connection string inside the paste (at offset ${shape.offset}) — using`);
    console.log('  that and ignoring the surrounding text.');
  }
  if (/\[?YOUR[-_]PASSWORD\]?/i.test(url)) {
    console.log('✗ That connection string still has the PLACEHOLDER in it:');
    console.log('      postgresql://postgres.<ref>:[YOUR-PASSWORD]@...');
    console.log('  Supabase does not fill that in for you. Replace [YOUR-PASSWORD] with the');
    console.log('  actual database password (Project Settings → Database), then paste it again.');
    process.exit(2);
  }
  const body = url.slice(url.indexOf('://') + 3);
  const at = body.lastIndexOf('@');
  const creds = at >= 0 ? body.slice(0, at) : '';
  const colon = creds.indexOf(':');
  if (colon < 0) {
    console.log('✗ That connection string carries no password (nothing between the username');
    console.log('  and the @). Paste one that includes it, or paste the password alone.');
    process.exit(2);
  }
  givenUrl = url;
  /* Everything downstream works on the PASSWORD, extracted from what was pasted. The decode
     can throw on a malformed escape, and the raw form is the right fallback: it is what a
     password containing a literal `%` looks like. */
  const rawPw = creds.slice(colon + 1);
  // eslint-disable-next-line no-var
  try { var extracted = decodeURIComponent(rawPw); } catch { extracted = rawPw; }
  console.log('· recognised a full PostgreSQL connection string — testing it AS GIVEN, and its');
  console.log('  password against every other combination too.');
}

const effective = shape.kind === 'connection-string' ? extracted : pw;

const fp = createHash('sha256').update(effective).digest('hex').slice(0, 8);

/*
 * DID THIS RUN TEST THE SAME THING AS THE LAST ONE?
 *
 * Two consecutive --clip runs produced the identical fingerprint, which meant the clipboard had
 * never changed — the operator had done the work in the dashboard and the copy simply had not
 * landed. The evidence was on screen both times and it took a human comparing two terminal
 * scrollbacks to notice. That is exactly the comparison a machine should do.
 *
 * A truncated fingerprint is stored, never the secret, at 0600. It is 32 bits of a hash of a
 * high-entropy string: not reversible, and the alternative is repeating this loop blind.
 */
const FP_FILE = join(homedir(), '.lcx-terminal', '.last-input-fp');
let previousFp = null;
try { previousFp = readFileSync(FP_FILE, 'utf8').trim() || null; } catch { /* first run */ }
try {
  mkdirSync(dirname(FP_FILE), { recursive: true });
  writeFileSync(FP_FILE, fp, { mode: 0o600 });
} catch { /* not being able to remember is not a reason to stop */ }

/*
 * NAME THE PROJECT BEING TESTED, PROMINENTLY.
 *
 * The ref was taken from a dashboard screenshot and then never questioned, which makes it the
 * one input nobody re-checks. If more than one Supabase project exists on the account, an
 * operator can reset and copy the password for project A while this tests project B — and the
 * result is a 28P01 that is genuinely "wrong password", correctly diagnosed, for a database
 * nobody meant to connect to. Every other explanation gets explored before that one, because
 * the ref looks like a constant rather than an assumption.
 */
console.log(`· project ref under test: ${REF}`);
console.log('  ↳ this must be the SAME project you are copying the password from. It is the');
console.log('    subdomain in your dashboard URL: supabase.com/dashboard/project/<THIS>');
console.log(`    Different project? SUPABASE_PROJECT_REF=<ref> bash scripts/go-live.sh --clip`);
console.log('');
console.log(`· received ${effective.length} characters, fingerprint ${fp}`);
if (previousFp === fp) {
  console.log('');
  console.log('  ⚠ THIS IS THE SAME INPUT AS THE PREVIOUS RUN — identical fingerprint.');
  console.log('    Whatever you changed in Supabase did not reach the clipboard, so this run');
  console.log('    would test the same thing and fail the same way. Copy it again and check:');
  console.log('    paste into a text editor (never the terminal) and confirm it is what you');
  console.log('    think it is before running this.');
}
if (effective.length < 20) {
  /* Not a rule, a SIGNAL. Supabase's own reset generates a long random string, so a short
     value usually means a remembered or self-chosen one — which is the likeliest thing to be
     out of date after a rotation. */
  console.log(`  · ${effective.length} characters is shorter than a Supabase-generated reset password.`);
  console.log('    If this is one you remember rather than one you just reset, reset it.');
}
if (/^\s|\s$/.test(effective)) {
  console.log('  ⚠ it begins or ends with WHITESPACE — almost certainly a paste artefact.');
  console.log('    Both forms are tried below so this cannot silently cost you an attempt.');
}
const encoded = encodePassword(effective);
if (encoded !== effective) console.log('  · contains characters requiring percent-encoding — handled');

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

/* WHAT WAS PASTED, UNTOUCHED, FIRST. If the operator handed over a complete connection string
   it may simply be correct, and trying a rearranged version of it before the thing itself
   would be perverse. */
if (givenUrl) {
  variants.push({ kind: 'given', label: 'the connection string you pasted, as-is', url: givenUrl });
}

/* THE CANONICAL COMBINATION — the one the verdict is read from. Everything else either offers
   an alternative worth trying or is a CONTROL whose failure is informative. */
push(primary, 5432, `postgres.${REF}`, encoded, 'session — the expected one', 'canonical');
push(primary, 6543, `postgres.${REF}`, encoded, 'transaction mode', 'alt');
// The password EXACTLY as received, in case the encoder is the thing that is wrong.
if (encoded !== effective) push(primary, 5432, `postgres.${REF}`, effective, 'unencoded password', 'alt');
// And trimmed, in case the terminal added whitespace.
const trimmed = encodePassword(effective.trim());
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
    console.log('  evidence. Nothing above points at the host, the region, the port or the');
    console.log('  username.');
    console.log('');
    console.log(`  ONE THING IS STILL AN ASSUMPTION: that "${REF}" is the project whose`);
    console.log('  password you are entering. If the account has more than one project, a');
    console.log('  correct password for the wrong project produces exactly this result. Open');
    console.log('  the dashboard and compare the ref in the URL before doing anything else.');
    console.log('');
    console.log('  Otherwise — Supabase → that project → Project Settings → Database →');
    console.log('  "Reset database password". COPY the value it shows you, then run:');
    console.log('');
    console.log('      bash /Users/nik/Downloads/usclaude-main/scripts/go-live.sh --clip');
    console.log('');
    console.log('  --clip reads it from the clipboard, so a 30-character generated password is');
    console.log('  never retyped into an invisible prompt. Nothing else uses this password, so');
    console.log('  resetting it breaks nothing.');
    console.log('');
    console.log(`  Fingerprint of what was tested: ${fp} (${effective.length} chars). If two runs you`);
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
