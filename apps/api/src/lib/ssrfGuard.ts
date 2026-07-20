/**
 * SSRF guard for outbound fetches to *user/data-derived* URLs (the contact
 * crawler pulls project website URLs, which originate from ingested records).
 * Without this, a project record pointing at `http://169.254.169.254/…` (cloud
 * metadata) or `http://localhost:PORT` would let the crawler probe internal
 * services. We enforce: http(s) only, and the host must resolve to a PUBLIC IP.
 *
 * Note: this validates the *current* URL. Callers that follow redirects must
 * re-validate every hop (see crawler.ts, which uses redirect:'manual').
 */
import net from 'node:net';
import dns from 'node:dns/promises';

/** True for loopback / private / link-local / reserved ranges (v4 + v6). */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    if (p.some((n) => Number.isNaN(n))) return true;
    if (p[0] === 0) return true; // "this" network
    if (p[0] === 10) return true; // private
    if (p[0] === 127) return true; // loopback
    if (p[0] === 169 && p[1] === 254) return true; // link-local (incl. cloud metadata)
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // private
    if (p[0] === 192 && p[1] === 168) return true; // private
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    if (p[0] >= 224) return true; // multicast / reserved / broadcast
    return false;
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true; // loopback / unspecified
    if (low.startsWith('fe80')) return true; // link-local
    if (low.startsWith('fc') || low.startsWith('fd')) return true; // unique-local
    if (low.startsWith('::ffff:')) return isPrivateIp(low.slice('::ffff:'.length)); // v4-mapped
    return false;
  }
  return true; // not a parseable IP → treat as unsafe
}

/**
 * Resolve `raw` and throw unless it's an http(s) URL whose host resolves to a
 * public IP. Returns the parsed URL on success.
 */
export async function assertSafePublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('SSRF: invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`SSRF: scheme not allowed: ${u.protocol}`);
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip [ ] on v6 literals
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new Error('SSRF: internal hostname blocked');
  }

  let ips: string[];
  if (net.isIP(host)) {
    ips = [host];
  } else {
    let recs;
    try {
      recs = await dns.lookup(host, { all: true });
    } catch {
      throw new Error('SSRF: host does not resolve');
    }
    ips = recs.map((r) => r.address);
  }
  if (ips.length === 0 || ips.some(isPrivateIp)) {
    throw new Error('SSRF: host resolves to a private/reserved address');
  }
  return u;
}
