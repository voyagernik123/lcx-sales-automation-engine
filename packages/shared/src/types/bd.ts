/**
 * BD domain types — expanded in later slices (projects, scores, outreach, deals).
 * Slice 1: health + auth contracts only.
 */

export type DbStatus = 'up' | 'down' | 'skipped';

/**
 * WHAT IS WRONG WITH `DATABASE_URL` ITSELF — decided by reading the string, not by
 * connecting, so the answer is available before a socket is opened and does not depend on
 * the database being reachable enough to complain.
 *
 * These exist because a driver error code says what the NETWORK did and not what the
 * OPERATOR should change. `ENETUNREACH` and `ETIMEDOUT` and `28P01` all mean "fix the
 * connection string" and each needs a different edit; the codes below name the edit.
 *
 * Every one of these was reached in production on 2026-08-10 or is one keystroke from it:
 *   SUPABASE_DIRECT_HOST_IS_IPV6_ONLY  the actual live outage — see the doc comment on it
 *   POOLER_USER_MISSING_PROJECT_REF    the trap when moving off the direct host
 *   PASSWORD_NEEDS_PERCENT_ENCODING    four characters that make `pg` throw before it dials
 */
export type DbConfigCode =
  | 'DATABASE_URL_UNSET'
  | 'DATABASE_URL_UNPARSEABLE'
  | 'PASSWORD_NEEDS_PERCENT_ENCODING'
  | 'HOST_IS_IPV6_LITERAL'
  | 'SUPABASE_DIRECT_HOST_IS_IPV6_ONLY'
  | 'POOLER_USER_MISSING_PROJECT_REF'
  | 'DATABASE_NAME_MISSING'
  | 'POOLER_IN_TRANSACTION_MODE'
  | 'NO_DEFECT_FOUND';

export interface DbConfigVerdict {
  readonly code: DbConfigCode;
  /**
   * `blocking` — no connection is possible until this is changed.
   * `warning`  — it will connect, and something else will go wrong later.
   * `none`     — nothing detectable is wrong with the string. NOT a claim that the
   *              credentials are correct: a password can only be judged by using it.
   */
  readonly severity: 'blocking' | 'warning' | 'none';
  /** What to change, in one sentence. Contains no part of the connection string. */
  readonly fix: string;
}

export interface HealthResponse {
  ok: boolean;
  service: 'lcx-sales-api';
  version: string;
  env: string;
  db: DbStatus;
  /**
   * WHY the database is unreachable, when it is. Absent when `db` is not `down`.
   *
   * A probe that reports a dependency as down without saying why forces the next person to
   * guess, and the guesses are expensive: a healthy Supabase instance and an API reporting
   * `db: down` has at least four distinct causes (wrong credentials, wrong host, IPv6-only
   * direct connection from an IPv4-only host, firewall) and they need opposite fixes.
   *
   * CONTAINS NO SECRET. The connection string, the password and the host are deliberately
   * never included — only the driver's error CODE and a short sanitised message, which is
   * enough to tell those four cases apart.
   */
  dbError?: { code: string; message: string } | null;
  /**
   * WHAT TO CHANGE, when the reason the database is unreachable is the connection string
   * itself. Absent when `db` is not `down`, and absent when nothing detectable is wrong.
   *
   * `dbError` above answers "what happened" and that turned out not to be enough. The live
   * outage on 2026-08-10 reported `ENETUNREACH` to an IPv6 address for three hours across
   * three separate attempts to fix it, because the driver code names the SYMPTOM and the
   * operator needs the EDIT. This field is derived by reading `DATABASE_URL`, so it is
   * available whether or not anything answers.
   *
   * CONTAINS NO SECRET AND NO HOST. Only a stable code and one sentence of instruction —
   * see `DbConfigVerdict`. This endpoint is unauthenticated, which is also why the
   * sanitiser upstream strips IPv6 literals as well as IPv4: publishing the database's
   * address to anyone who curls `/health` is the leak, not the advice about it.
   */
  dbHint?: DbConfigVerdict | null;
  /**
   * THE SHAPE OF THE CONFIGURED URL — because a save that did not land and a save that landed
   * and failed are indistinguishable from outside the process.
   *
   * On 2026-08-18 a credential was proven to connect from the owner's laptop (session pooler,
   * role `postgres`, 142 tables), pasted into the dashboard, and the service restarted —
   * observed, uptime fell 208s to 27s — and still reported SUPABASE_DIRECT_HOST_IS_IPV6_ONLY.
   * Two explanations fit that equally well: the value never changed, or it changed to another
   * value that still names the direct host. `dbHint` cannot tell them apart, and every round of
   * guessing costs a deploy.
   *
   * CONTAINS NO SECRET, NO HOST, NO PROJECT REF, NO PASSWORD. Three booleans, a port and a
   * length, which is enough to separate every case that has actually occurred:
   *   `pooler: false`  — the direct host is still configured, whatever was pasted
   *   `userRef: false` — pooler host but the username is plain `postgres`, which answers XX000
   *   `len` far above ~120 — a paste that appended instead of replacing
   *   `parses: false`  — a value `new URL()` refuses, which is itself the finding
   *
   * `dbHint` already discloses that the configured host is a Supabase direct host, so this adds
   * no fact an attacker did not already have from the same unauthenticated endpoint.
   */
  dbUrlShape?: {
    configured: boolean;
    pooler?: boolean;
    direct?: boolean;
    port?: string;
    userRef?: boolean;
    parses?: boolean;
    len?: number;
  } | null;
  /**
   * HOW LONG THIS PROCESS HAS BEEN RUNNING — the field that distinguishes "the change has not
   * deployed yet" from "the change deployed and is wrong", and their fixes are opposites.
   *
   * `dbHint` is derived from `DATABASE_URL`, which is read once at boot. So a stale hint has
   * two possible meanings and no way to tell them apart: either the environment variable is
   * still wrong, or it was corrected and the OLD process is still serving. On 2026-08-10 that
   * ambiguity produced six minutes of polling followed by the wrong conclusion — the tooling
   * announced that Render's copy of the string must be wrong, having never established that
   * the deploy had finished.
   *
   * Large uptime + a stale hint ⇒ the process never restarted; the save did not take effect.
   * Small uptime + a stale hint ⇒ the new process really did boot with the old value.
   *
   * Seconds, rounded. Reveals nothing: a restart is visible to anyone watching the service
   * anyway.
   */
  uptimeSeconds: number;
  /**
   * WHETHER DATABASE TRAFFIC IS ENCRYPTED, AND WHETHER THE SERVER WAS AUTHENTICATED.
   *
   * The pool set no `ssl` at all, so every query, every row and the password itself crossed
   * the public internet in cleartext between Oregon and Frankfurt. Nothing said so, which is
   * how it survived a security pass — an absent setting reads as a default rather than a
   * decision. Reported here so the state is observable instead of assumed.
   *
   * Three states, never collapsed into "secure": `verified` (TLS + pinned CA), `encrypted`
   * (TLS, certificate unchecked — stops passive interception, not an active impersonator), and
   * `off` (no TLS; correct for loopback and nowhere else).
   */
  dbTls: 'verified' | 'encrypted' | 'off';
  /**
   * WHETHER THE DATABASE URL IN USE IS THE ONE THAT WAS CONFIGURED.
   *
   * `env` is normal. `pooler-fallback` means `DATABASE_URL` named the Supabase DIRECT host —
   * which has no IPv4 address and therefore cannot be reached from an IPv4-only network at
   * all — and the process adopted a working session-pooler form of it instead.
   *
   * Rewriting is allowed because the alternative is a certain, permanent failure; it is
   * REPORTED because silent self-repair is worse than the bug it fixes. A system whose
   * configuration does not describe its behaviour hands the next person a mystery.
   */
  dbUrlSource: 'env' | 'pooler-fallback';
  /**
   * WHICH SIGN-IN DOORS ARE ACTUALLY OPEN — because a refused sign-in looked identical to a
   * wrong password, and one of them is fixed in a dashboard while the other is not.
   *
   * `middleware/auth.ts` CLOSES the email+passcode path entirely when `DESK_PASSCODE` is unset
   * in production, because `env.deskPasscode` then falls back to a literal committed in the
   * repository — and the roster emails are committed beside it, two at `approver`. Accepting it
   * would hand deal sign-off to anyone with a checkout. Correct, and completely invisible: the
   * form says "that email and passcode combination is not authorized", which is the right thing
   * to tell an attacker and useless to the operator staring at a valid credential.
   *
   * CARRIES NO SECRET — only whether each door is configured. In the `refused-public-default`
   * state there is nothing to exploit because the path is closed, and in the open state this
   * says no more than the presence of a login form already does.
   */
  authPaths: {
    /** `open` once DESK_PASSCODE is set; `refused-public-default` while it is not. */
    readonly deskPasscode: 'open' | 'refused-public-default';
    /** Any @lcx.com address plus SECONDARY_PASSCODE. `disabled` when that is unset. */
    readonly secondTier: 'open' | 'disabled';
  };
  timestamp: string;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}

export interface ApiSuccessBody<T> {
  data: T;
  meta?: {
    timestamp: string;
    version: string;
  };
}

/**
 * Operator identity resolved from the request credential — either the shared
 * `OPERATOR_API_KEY` (cron, integrations) or a desk member's email address
 * (per-person sign-in). `role` is now authoritative server-side (Wave 7): email
 * principals carry the desk member's real role (approver ⊇ operator), so
 * approver-gated actions (e.g. deal-approval sign-off) are enforced by the API,
 * not just the client. The shared key authenticates as a plain 'operator'.
 * `id` is the real member id when known, so writes attribute to the person.
 */
export interface OperatorPrincipal {
  id: string;
  role: 'operator' | 'approver';
  authMethod: 'api_key' | 'email';
}
