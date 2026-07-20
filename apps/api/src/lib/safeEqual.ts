import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string compare for secrets/tokens. A plain `a === b` short-
 * circuits on the first differing byte, leaking match length via timing.
 * Length is compared first (unavoidably non-constant, but length alone is not
 * the secret), then the bytes are compared in constant time.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
