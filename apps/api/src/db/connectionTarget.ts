import { parse as parseConnectionString } from 'pg-connection-string';
import type { DbConfigVerdict } from '@lcx/shared';

/**
 * READ `DATABASE_URL` AND SAY WHAT TO CHANGE — without connecting, and without ever
 * returning any part of it.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────
 * `dbError` already tells the operator WHAT HAPPENED. On 2026-08-10 that was not enough.
 * The API reported, for three hours and across three separate attempts to fix it:
 *
 *     {"db":"down","dbError":{"code":"ENETUNREACH",
 *      "message":"connect ENETUNREACH 2a05:d014:1e9b:b301:9751:5cd5:770f:9c5:5432"}}
 *
 * Everything needed to end it was already on the machine, and nobody could see it:
 * `db.<ref>.supabase.co` publishes an AAAA record and NO A record, the address in the
 * error was exactly that AAAA record, and the host doing the dialling had no IPv6 route.
 * A driver error names the SYMPTOM. The operator needs the EDIT. These verdicts are the
 * edit.
 *
 * ── WHY IT PARSES RATHER THAN PATTERN-MATCHES A LIST OF KNOWN-BAD STRINGS ───────────
 * A hand-listed enumeration cannot fail on a member nobody thought of. Each check below
 * decides from the STRUCTURE of the URL, so a project ref, region or password this file
 * has never seen is judged the same as one it has.
 *
 * ── WHY IT IS PURE AND SYNCHRONOUS ──────────────────────────────────────────────────
 * No DNS, no socket, no clock. It therefore runs at boot before anything is dialled, runs
 * inside a health probe that must answer in 2 s, and is exhaustively testable. The cost is
 * that it cannot confirm a host is IPv6-only by looking it up — so the verdict states the
 * precondition ("from an IPv4-only network") instead of pretending to have checked it.
 *
 * ── WHAT IT CANNOT DO ───────────────────────────────────────────────────────────────
 * It cannot tell you a password is correct. `NO_DEFECT_FOUND` means the string is
 * well-formed, not that it will authenticate — a credential can only be judged by using
 * it, and `28P01` is the only honest source for that.
 */

/**
 * The characters measured to make `pg`'s parser throw. Used ONLY to name what to fix — the
 * verdict itself comes from `driverRejects` below, so a character this list has never heard
 * of is still caught.
 */
const PASSWORD_HOSTILE = /[#/?%]/g;
const ENCODED: Record<string, string> = { '#': '%23', '/': '%2F', '?': '%3F', '%': '%25' };

/**
 * DOES `pg` ITSELF REJECT THIS STRING?
 *
 * ASKED OF THE REAL PARSER RATHER THAN REIMPLEMENTED, and the first two attempts at
 * reimplementing it are why. `pg-connection-string` pre-encodes the whole URL when a regex
 * matches, restores two-digit escapes, then falls back to a dummy host, then decodes the
 * username and password separately — four layers, and a replica that gets any of them wrong
 * produces a confident verdict about the wrong character. Two hand-written approximations
 * were checked against it over 23 passwords and both disagreed on cases a real password
 * could hit (`%zz%bb` and `100%pw` are legal; `aa%bb` and `p%99ss%zz` are not, and the
 * difference is whether the escape decodes to valid UTF-8).
 *
 * This matters because the failure is silent and misattributed: the parser throws BEFORE any
 * connection is attempted, so the operator sees "Invalid URL" with no driver code and
 * nothing resembling a credential problem.
 */
function driverRejects(raw: string): boolean {
  try {
    /* The return value CONTAINS THE PLAINTEXT PASSWORD. It is discarded unread on purpose —
       only whether this threw is used, and nothing from it reaches a verdict. */
    parseConnectionString(raw);
    return false;
  } catch {
    return true;
  }
}

const SUPABASE_DIRECT = /^db\.[a-z0-9]+\.supabase\.(co|com)$/i;
const SUPABASE_POOLER = /\.pooler\.supabase\.com$/i;

/**
 * Split off the password WITHOUT a URL parser, because the characters most worth detecting
 * are exactly the ones that make every URL parser give up.
 *
 * The LAST `@` separates credentials from authority, not the first: an unencoded `@` inside
 * a password is handled correctly by `pg` (measured — see the table in the test file), and
 * splitting on the first `@` would silently move half the password into the username.
 *
 * A `@` inside a query parameter would mis-slice this. Postgres query parameters are
 * `sslmode`, `application_name`, `connect_timeout` and `options`, so that is a shape this
 * accepts being imprecise about; the consequence is one misleading log line and a hint in a
 * body, never a behaviour change, because nothing in this module gates a connection.
 */
function splitCredentials(raw: string): { password: string; authority: string } | null {
  const i = raw.indexOf('://');
  if (i < 0) return null;
  const afterScheme = raw.slice(i + 3);
  const at = afterScheme.lastIndexOf('@');
  if (at < 0) return { password: '', authority: afterScheme };
  const creds = afterScheme.slice(0, at);
  const colon = creds.indexOf(':');
  return {
    password: colon >= 0 ? creds.slice(colon + 1) : '',
    authority: afterScheme.slice(at + 1),
  };
}

/**
 * The FIRST defect that would stop this string working, in the order the connection
 * attempt would hit them: cannot be read → cannot be parsed → cannot be routed to →
 * will be rejected on arrival → will misbehave later.
 *
 * One verdict, not a list, and deliberately: an operator fixing a connection string needs
 * the next edit, and a list of five invites fixing the cosmetic one first.
 */
export function describeConnectionTarget(raw: string): DbConfigVerdict {
  if (!raw) {
    return {
      code: 'DATABASE_URL_UNSET',
      severity: 'blocking',
      fix: 'DATABASE_URL is empty. Set it in the service environment.',
    };
  }

  const split = splitCredentials(raw);
  if (!split) {
    return {
      code: 'DATABASE_URL_UNPARSEABLE',
      severity: 'blocking',
      fix: 'DATABASE_URL has no scheme. It must begin with postgresql:// or postgres://.',
    };
  }

  /*
   * CHECKED SECOND, right after the scheme, because a string the driver cannot PARSE never
   * reaches the network at all — so none of the routing checks below apply, and the error
   * the operator actually sees is "Invalid URL" with no driver code and no mention of a
   * password.
   *
   * Measured against the parser `pg` uses. The advice "percent-encode every special
   * character" is wrong in both directions:
   *   @ : [ ] & + ! * space   handled correctly, RAW — encoding them is unnecessary
   *   # / ?                   rejected
   *   %                       depends on what follows it, which is why this asks rather
   *                           than guesses: `p%40ss` and `100%pw` are both fine, `aa%bb`
   *                           is not
   */
  if (driverRejects(raw)) {
    const found = [...new Set(split.password.match(PASSWORD_HOSTILE) ?? [])];
    const named = found.length > 0
      ? `The password contains ${found.join(' ')} — percent-encode ${found.map((c) => `${c} as ${ENCODED[c]}`).join(', ')}, or reset the password to one without those characters.`
      : 'Re-copy it from the database provider rather than editing it by hand.';
    return {
      code: 'PASSWORD_NEEDS_PERCENT_ENCODING',
      severity: 'blocking',
      /* Names the OFFENDING CHARACTER ONLY — never the password and never its length. A
         length narrows a brute force, and this sentence goes into a log and a public body. */
      fix: `The driver rejects this URL before it dials, so nothing is attempted. ${named}`,
    };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      code: 'DATABASE_URL_UNPARSEABLE',
      severity: 'blocking',
      fix: 'DATABASE_URL is not a valid URL. Re-copy it from the database provider rather than editing it by hand.',
    };
  }

  const host = url.hostname;

  if (host.startsWith('[')) {
    return {
      code: 'HOST_IS_IPV6_LITERAL',
      severity: 'blocking',
      fix: 'The host is a literal IPv6 address. Most managed hosts (including Render free tier) have no IPv6 route — use a hostname with an IPv4 (A) record.',
    };
  }

  /*
   * THE LIVE OUTAGE. `db.<ref>.supabase.co` has an AAAA record and no A record at all, so
   * from an IPv4-only network the connection fails at the routing layer — `ENETUNREACH`,
   * or `ETIMEDOUT` where the network black-holes instead of rejecting. Nothing about the
   * error mentions IPv6, addressing, or the connection string.
   *
   * The fix is the pooler host, and it is NOT a hostname swap: the pooler expects the
   * username to carry the project ref (`postgres.<ref>`, not `postgres`), so changing only
   * the host produces `28P01` and reads convincingly as a wrong password. That is the trap
   * `POOLER_USER_MISSING_PROJECT_REF` below exists to catch.
   */
  if (SUPABASE_DIRECT.test(host)) {
    return {
      code: 'SUPABASE_DIRECT_HOST_IS_IPV6_ONLY',
      severity: 'blocking',
      fix: "This is Supabase's DIRECT host, which resolves to IPv6 only and is unreachable from an IPv4-only network such as Render's free tier. Use the Session pooler string from Supabase → Connect (host ends .pooler.supabase.com, port 5432) — and note the username changes to postgres.<project-ref>, not postgres.",
    };
  }

  if (SUPABASE_POOLER.test(host)) {
    if (!url.username.includes('.')) {
      return {
        code: 'POOLER_USER_MISSING_PROJECT_REF',
        severity: 'blocking',
        fix: 'The host is the Supabase pooler but the username has no project ref, so the pooler cannot tell which project to route to and answers 28P01 as if the password were wrong. The username must be postgres.<project-ref>. Re-copy the whole Session pooler string rather than editing the host.',
      };
    }
    /*
     * 6543 IS TRANSACTION MODE. It connects, so this is a warning and not blocking — and
     * that is precisely why it is worth naming: the damage shows up later, as prepared
     * statements failing under a long-lived pool, and by then nobody is looking at the
     * connection string. This process holds a pool of persistent connections, which is
     * what session mode (5432) is for.
     */
    if (url.port === '6543') {
      return {
        code: 'POOLER_IN_TRANSACTION_MODE',
        severity: 'warning',
        fix: 'Port 6543 is the transaction pooler, which does not support prepared statements or session state. This service holds a persistent connection pool — use port 5432 (Session pooler) instead.',
      };
    }
  }

  if (url.pathname === '' || url.pathname === '/') {
    return {
      code: 'DATABASE_NAME_MISSING',
      severity: 'blocking',
      fix: 'The URL names no database. It must end with a database name — for Supabase that is /postgres.',
    };
  }

  return {
    code: 'NO_DEFECT_FOUND',
    severity: 'none',
    // Says what it checked, so it is not read as "the credentials are fine".
    fix: 'No defect found in the shape of DATABASE_URL. This does not verify the credentials — only using them can do that.',
  };
}

/**
 * The boot line. Returns the string rather than logging it so a test can assert on it
 * without capturing console, and so the caller decides where it goes.
 *
 * SILENT ON A CLEAN STRING IN PRODUCTION. A boot log that always prints something about
 * the database teaches the reader to skip it, and this line has to be readable on the one
 * morning it matters.
 */
export function connectionTargetBootLine(raw: string, nodeEnv: string): string | null {
  const v = describeConnectionTarget(raw);
  if (v.severity === 'none') return null;
  // `skipped` is legitimate outside production, where an unset URL is the normal state.
  if (v.code === 'DATABASE_URL_UNSET' && nodeEnv !== 'production') return null;
  const mark = v.severity === 'blocking' ? 'CANNOT CONNECT' : 'will connect, but';
  return `[db] DATABASE_URL ${mark} — ${v.code}: ${v.fix}`;
}
