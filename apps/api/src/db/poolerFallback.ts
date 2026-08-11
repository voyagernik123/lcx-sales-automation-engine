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
