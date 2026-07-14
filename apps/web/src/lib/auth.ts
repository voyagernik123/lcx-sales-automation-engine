import type { Session } from '@supabase/supabase-js';
import { isAllowedEmailDomain, nameFromEmail } from '@lcx/shared';
import { supabase, supabaseAuthConfigured } from './supabaseClient';
import { useOperatorStore, OPERATORS, type Operator } from '@/stores/useOperatorStore';

// In-memory only — Supabase's own client already persists the underlying
// session/refresh token; duplicating it into our zustand store would just
// risk drifting out of sync with Supabase's own rotation.
let googleAccessToken: string | null = null;

export function getGoogleAccessToken(): string | null {
  return googleAccessToken;
}

function resolveOperatorFromSession(session: Session): Operator | null {
  const email = session.user.email;
  if (!email || !isAllowedEmailDomain(email)) return null;

  const match = OPERATORS.find(o => o.email.toLowerCase() === email.toLowerCase());
  if (match) return match;

  // Domain is allowed but this person isn't in the named roster yet —
  // resolve gracefully rather than lock them out.
  const name = nameFromEmail(email);
  return {
    id: email,
    name,
    email,
    initials: name.charAt(0).toUpperCase() || '?',
    colorVar: 'var(--chart-1)',
  };
}

export function signInWithGoogle(): Promise<{ error: Error | null }> {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  }).then(({ error }) => ({ error: error ? new Error(error.message) : null }));
}

export function signOutOfGoogle(): Promise<void> {
  return supabase.auth.signOut().then(() => undefined);
}

let listenerStarted = false;

/** Call once at app startup. No-op if Supabase env vars aren't set. */
export function initGoogleAuthListener(): void {
  if (listenerStarted || !supabaseAuthConfigured) return;
  listenerStarted = true;

  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      googleAccessToken = null;
      return;
    }

    const operator = resolveOperatorFromSession(session);
    if (!operator) {
      googleAccessToken = null;
      void supabase.auth.signOut();
      useOperatorStore.getState().setAuthError(
        `${session.user.email ?? 'That Google account'} isn't authorized for this tool — only @lcx.com addresses can sign in.`,
      );
      return;
    }

    googleAccessToken = session.access_token;
    useOperatorStore.getState().setOperator(operator);
  });
}
