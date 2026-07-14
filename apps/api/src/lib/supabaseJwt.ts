/**
 * Verifies Supabase-issued access tokens (from "Sign in with Google") via
 * Supabase's JWKS endpoint. `createRemoteJWKSet` caches keys and handles
 * rotation automatically — no shared secret needed.
 */
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { env } from './env.js';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!env.supabaseJwksUrl) return null;
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(env.supabaseJwksUrl));
  }
  return jwks;
}

export interface VerifiedGoogleUser {
  email: string;
}

/** Returns the verified email claim, or null if the token is missing/invalid/expired. */
export async function verifySupabaseAccessToken(token: string): Promise<VerifiedGoogleUser | null> {
  const keySet = getJwks();
  if (!keySet) return null;

  try {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: env.supabaseIssuer || undefined,
    });
    const email = typeof payload.email === 'string' ? payload.email : null;
    if (!email) return null;
    return { email };
  } catch {
    return null;
  }
}
