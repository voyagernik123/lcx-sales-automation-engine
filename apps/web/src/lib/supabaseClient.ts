import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

/** True once real env vars are set — lets callers fall back gracefully in local dev. */
export const supabaseAuthConfigured = Boolean(url && anonKey);

// A harmless placeholder URL when unconfigured — createClient throws on an
// empty string, and we don't want a missing .env to crash the whole app;
// supabaseAuthConfigured is what callers should actually check.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-key');
