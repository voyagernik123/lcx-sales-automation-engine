/**
 * WHEN `DATABASE_URL` NAMES A HOST THAT CANNOT WORK, TRY THE ONE THAT CAN.
 *
 * ── WHY THIS IS NOT MAGIC, AND WHY IT IS ALLOWED ────────────────────────────────────
 * `db.<ref>.supabase.co` publishes an AAAA record and NO A record. From an IPv4-only
 * network — which is what Render's free tier gives us — it is not "slow" or "flaky", it is
 * unroutable, permanently, for every request. There is no state of the world in which that
 * host works from this process.
 *
 * So a rewrite cannot make anything worse. It can only turn a certain failure into a possible
 * success, and the transformation is not a guess: the pooler form is mechanical
 * (`postgres` → `postgres.<ref>`, direct host → `aws-N-<region>.pooler.supabase.com:5432`) and
 * the ONLY unknown is the region, which is discovered by trying.
 *
 * This cost a full day of a real person's time across six exchanges, every one of which was a
 * correct diagnosis of the wrong input. Supabase's Connect panel DEFAULTS to the Direct
 * connection tab, so the wrong string is the one an operator naturally copies — and the
 * resulting failure is indistinguishable from a save that never happened. A platform that
 * knows exactly what is wrong and refuses to act on it is choosing to be right over being
 * useful.
 *
 * ── WHAT KEEPS IT HONEST ────────────────────────────────────────────────────────────
 *  · It NEVER touches the credential. Password and database name are carried across
 *    byte-for-byte; only the host, port and username FORM change.
 *  · It only ever fires on the one host that provably cannot work. Any other host — a
 *    pooler URL, a local socket, another provider — is left exactly as given.
 *  · It is LOUD. A boot line names it, `/health` reports `dbUrlSource: 'pooler-fallback'`,
 *    and the operator can see that the value they set is not the value in use. Silent
 *    self-repair would be worse than the bug, because the next person would inherit a
 *    system whose configuration does not describe its behaviour.
 *  · `SUPABASE_POOLER_FALLBACK=0` disables it entirely.
 */

/** Regions tried, in order. Overridable, because a hardcoded list is a guess about the future. */
const DEFAULT_REGIONS = [
  // eu-central-1 first: it is where this deployment's project actually lives, verified by
  // connecting. The rest are Supabase's common regions, so a project that moves still heals.
  'eu-central-1', 'eu-central-2',
  'us-east-1', 'us-east-2', 'us-west-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-south-1',
  'sa-east-1', 'ca-central-1',
];

/** Narrow or reorder the sweep without a deploy — and keep a boot probe cheap to verify. */
export const CONFIGURED_REGIONS: readonly string[] = (process.env.SUPABASE_POOLER_REGIONS ?? '')
  .split(',').map((r) => r.trim()).filter(Boolean);

const SUPABASE_DIRECT = /^db\.([a-z0-9]+)\.supabase\.(co|com)$/i;

export interface PoolerCandidate {
  readonly url: string;
  /** Safe to log: carries the host and username FORM, never the credential. */
  readonly label: string;
}

/**
 * Turn a Supabase DIRECT connection string into the ordered pooler candidates that could
 * replace it. Returns an empty array for anything that is not the direct host — including a
 * URL that is already a pooler URL, which must never be rewritten.
 *
 * Pure and synchronous: no DNS, no sockets. The caller decides whether to probe.
 */
export function poolerCandidates(raw: string, regions: readonly string[] = CONFIGURED_REGIONS.length > 0 ? CONFIGURED_REGIONS : DEFAULT_REGIONS): PoolerCandidate[] {
  if (!raw) return [];
  let url: URL;
  try { url = new URL(raw); } catch { return []; }

  const m = SUPABASE_DIRECT.exec(url.hostname);
  if (!m) return [];
  const ref = m[1]!;

  /*
   * THE CREDENTIAL IS CARRIED VERBATIM, AND THE FIRST ATTEMPT AT THIS WAS WRONG.
   *
   * `url.password` returns the password STILL PERCENT-ENCODED, exactly as it appeared in the
   * source URL — it is not decoded for you. So running it through `encodeURIComponent` on the
   * way out double-escapes it: `p%2Fss` becomes `p%252Fss`, which the driver then decodes to
   * the literal `p%2Fss` and the server rejects as a wrong password. Silent credential
   * corruption, and indistinguishable from the authentication failure this whole mechanism
   * exists to prevent. Pass it through untouched; it is already in the right form.
   */
  const pass = url.password;
  const db = url.pathname && url.pathname !== '/' ? url.pathname : '/postgres';
  const query = url.search || '';

  const out: PoolerCandidate[] = [];
  for (const region of regions) {
    for (const n of [0, 1]) {
      const host = `aws-${n}-${region}.pooler.supabase.com`;
      out.push({
        url: `postgresql://postgres.${ref}:${pass}@${host}:5432${db}${query}`,
        label: `${host}:5432 user=postgres.<ref>`,
      });
    }
  }
  return out;
}

/** TRUE when this string is the one host that cannot work from an IPv4-only network. */
export function isUnroutableDirectHost(raw: string): boolean {
  return poolerCandidates(raw, ['x']).length > 0;
}


/*
 * OPEN A POOL THAT CAN ACTUALLY REACH THE DATABASE — for callers that are not the API server.
 *
 * The API heals its own connection at boot (`healDatabaseUrl` in ./index.ts). The SCHEDULED JOBS did not, and
 * they have been failing on every cron tick with the identical error the API was fixed for:
 *
 *   Error: connect ENETUNREACH 2a05:d014:...:5432
 *   [jobs] daily_rules — postgresql://***@db.<ref>.supabase.co:5432/postgres
 *
 * Supabase's DIRECT host is AAAA-only. A GitHub Actions runner is IPv4-only, exactly like Render's free tier,
 * so `db.<ref>.supabase.co` is unreachable from both. The API learned that and the jobs CLI never did, because
 * it builds its own `new pg.Pool({ connectionString })` from the raw environment variable.
 *
 * Fixing it in the CLI by copying the probe loop would put the tricky part — the username rewrite that the
 * session pooler requires, `postgres.<ref>`, and the region sweep — in two places. So the loop lives here,
 * beside the candidate generator it depends on, and both callers share it.
 *
 * IT TRIES THE GIVEN URL FIRST and only falls back when that URL is the one host proven unroutable. Every other
 * failure is the caller's to see: a wrong password must surface as a wrong password, not be buried under a
 * sweep of pooler regions that will all reject it the same way.
 */
export async function openReachablePool(
  rawUrl: string,
  make: (connectionString: string) => { query(sql: string): Promise<unknown>; end(): Promise<void> },
  log: (msg: string) => void = () => {},
): Promise<{ pool: ReturnType<typeof make>; url: string; source: 'env' | 'pooler-fallback' }> {
  const direct = make(rawUrl);
  try {
    await direct.query('SELECT 1');
    return { pool: direct, url: rawUrl, source: 'env' };
  } catch (err) {
    await direct.end().catch(() => {});
    /*
     * ONE FAILURE THAT LOOKS LIKE A NETWORK PROBLEM AND IS NOT, CAUGHT BEFORE IT COSTS ANOTHER AFTERNOON.
     *
     * If the raw string plainly CONTAINS the Supabase direct host but `isUnroutableDirectHost` cannot see it, the
     * URL did not parse the way it reads. The cause is always an unencoded character in the password: a raw `#`
     * makes the remainder a URL fragment, `/` reads as a path and `?` as a query, so the host this code inspects
     * is not the host in the secret. Rethrowing here would report ENETUNREACH — a network error for a punctuation
     * problem, which is precisely the wrong place to send someone.
     */
    if (/@db\.[a-z0-9]+\.supabase\.co/i.test(rawUrl) && !isUnroutableDirectHost(rawUrl)) {
      throw new Error(
        'DATABASE_URL contains the Supabase direct host but does not parse as a URL that reaches it. A password '
        + 'containing # / ? or % must be percent-encoded (# → %23, / → %2F, ? → %3F, % → %25); unencoded, '
        + 'everything after it is read as a fragment, path or query and the password is silently truncated. '
        + 'This is a MALFORMED URL, not an unreachable host and not a wrong password.',
      );
    }
    /* Only the unroutable-direct-host case earns a sweep. `isUnroutableDirectHost` is the same predicate the
       API uses, so the two cannot disagree about when a fallback is legitimate. */
    if (!isUnroutableDirectHost(rawUrl)) throw err;
    const code = (err as { code?: string }).code ?? '';
    log(`[db] direct host failed (${code || 'unknown'}); it has no IPv4 address. Probing session-pooler forms.`);
  }

  const candidates = poolerCandidates(rawUrl);
  if (candidates.length === 0) {
    throw new Error(
      'DATABASE_URL names the Supabase direct host, which has no IPv4 address, and no pooler candidate could '
      + 'be derived from it. Set DATABASE_URL to the session pooler '
      + '(aws-N-<region>.pooler.supabase.com:5432 with the project ref in the USERNAME as postgres.<ref>).',
    );
  }

  const tried: string[] = [];
  for (const c of candidates) {
    const probe = make(c.url);
    try {
      await probe.query('SELECT 1');
      log(`[db] reached the database via ${c.label}.`);
      return { pool: probe, url: c.url, source: 'pooler-fallback' };
    } catch (err) {
      await probe.end().catch(() => {});
      /* The code distinguishes the two failures that look alike: 28P01 is a wrong password (so the HOST was
         right and sweeping further is pointless), XX000 is the pooler rejecting a tenant it does not own. */
      const code = (err as { code?: string }).code ?? '';
      tried.push(`${c.label}${code ? ` (${code})` : ''}`);
      if (code === '28P01') {
        throw new Error(
          `${c.label} accepted the connection and REJECTED THE CREDENTIAL (28P01). The host is right and the `
          + 'password is wrong, so no other region will help. Fix the password in DATABASE_URL.',
        );
      }
    }
  }
  throw new Error(
    `Could not reach the database. Direct host is IPv6-only and every pooler candidate failed: ${tried.join(', ')}. `
    + 'Set SUPABASE_POOLER_REGIONS if the project is outside the default sweep.',
  );
}
