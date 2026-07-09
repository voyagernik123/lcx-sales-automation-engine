import { promises as dns } from 'node:dns';

export type VerifyResult = 'invalid_syntax' | 'invalid' | 'valid_mx' | 'unknown';

const SYNTAX_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

/**
 * Free verification: syntax → MX lookup. SMTP RCPT probing is deliberately
 * absent — large MX hosts give catch-all/tarpit answers and most PaaS block
 * outbound port 25, so MX-only is the honest free signal.
 */
export async function verifyEmail(email: string): Promise<VerifyResult> {
  if (!SYNTAX_RE.test(email)) return 'invalid_syntax';
  const domain = email.split('@')[1];
  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ]);
    return records.length > 0 ? 'valid_mx' : 'invalid';
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') return 'invalid';
    return 'unknown'; // timeout / transient — don't condemn the address
  }
}

/** Map a verification outcome onto people.email_status values. */
export function toEmailStatus(v: VerifyResult): 'valid_mx' | 'invalid' | 'unverified' {
  if (v === 'valid_mx') return 'valid_mx';
  if (v === 'invalid' || v === 'invalid_syntax') return 'invalid';
  return 'unverified';
}
