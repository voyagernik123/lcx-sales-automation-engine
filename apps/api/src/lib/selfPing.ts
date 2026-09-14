/**
 * THE SERVICE KEEPS ITSELF AWAKE.
 *
 * Render's free tier spins a web service down after fifteen idle minutes; the next visitor waits 30–60 s for a
 * cold start, and the sign-in page shows them "API WAKING" for that long. A GitHub Actions cron was added to ping
 * /health every ten minutes and, measured on 2026-09-14, it did not fire once in two hours — GitHub schedules are
 * best-effort. So the process pings its OWN public URL: an outbound request to the public hostname arrives as
 * inbound traffic through Render's edge, which is what the idle timer counts.
 *
 * Only in production, only when a public URL is known (`API_PUBLIC_URL`, else Render's own `RENDER_EXTERNAL_URL`),
 * and never against localhost — a dev server pinging itself is noise. The proper fix is a paid instance; this is
 * the bridge, and it says so in the boot line.
 */
export interface SelfPingOptions {
  readonly publicUrl: string | undefined;
  readonly production: boolean;
  readonly intervalMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly setIntervalImpl?: typeof setInterval;
  readonly log?: (line: string) => void;
}

export const SELF_PING_INTERVAL_MS = 5 * 60_000;

/** Returns the resolved target URL, or null with the reason the ping is off. */
export function selfPingTarget(o: Pick<SelfPingOptions, 'publicUrl' | 'production'>): { url: string } | { off: string } {
  if (!o.production) return { off: 'not production' };
  const base = (o.publicUrl ?? '').trim().replace(/\/$/, '');
  if (!base) return { off: 'no public URL (API_PUBLIC_URL / RENDER_EXTERNAL_URL unset)' };
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(base)) return { off: 'public URL is loopback' };
  if (!/^https?:\/\//i.test(base)) return { off: 'public URL is not http(s)' };
  return { url: `${base}/health` };
}

export function startSelfPing(o: SelfPingOptions): { stop(): void; target: string | null } {
  const t = selfPingTarget(o);
  const log = o.log ?? ((line: string) => console.log(line));
  if ('off' in t) {
    log(`[api] self-ping off — ${t.off}`);
    return { stop() {}, target: null };
  }
  const f = o.fetchImpl ?? fetch;
  const every = o.setIntervalImpl ?? setInterval;
  const handle = every(() => {
    f(t.url, { method: 'GET', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'lcx-api-self-ping' } })
      .then((r) => { if (!r.ok) log(`[api] self-ping ${r.status}`); })
      .catch((err: unknown) => log(`[api] self-ping failed: ${err instanceof Error ? err.message : String(err)}`));
  }, o.intervalMs ?? SELF_PING_INTERVAL_MS);
  // A timer must never keep a shutting-down process alive.
  if (typeof handle === 'object' && handle !== null && 'unref' in handle) (handle as { unref(): void }).unref();
  log(`[api] self-ping every ${Math.round((o.intervalMs ?? SELF_PING_INTERVAL_MS) / 1000)}s → ${t.url} (free-tier keepalive; a paid instance retires this)`);
  return { stop() { clearInterval(handle as ReturnType<typeof setInterval>); }, target: t.url };
}
