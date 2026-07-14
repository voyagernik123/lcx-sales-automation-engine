import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chrome } from 'lucide-react';
import { OPERATORS, useOperatorStore, type Operator } from '@/stores';
import { signInWithGoogle } from '@/lib/auth';
import { supabaseAuthConfigured } from '@/lib/supabaseClient';

/**
 * The front door of the app. Real login: "Continue with Google," gated to
 * @lcx.com addresses (enforced both by Google's test-user allowlist and, as
 * a second layer, our own domain check in lib/auth.ts). The old
 * click-your-name picker still exists but only in local dev, as a shortcut
 * so testing doesn't require a live Google round-trip every time.
 */
export function SelectOperator() {
  const navigate = useNavigate();
  const setOperator = useOperatorStore(s => s.setOperator);
  const authError = useOperatorStore(s => s.authError);
  const setAuthError = useOperatorStore(s => s.setAuthError);
  const [submitting, setSubmitting] = useState(false);
  const [showDevPicker, setShowDevPicker] = useState(false);

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setAuthError(null);
    const { error } = await signInWithGoogle();
    if (error) {
      setSubmitting(false);
      setAuthError('Could not start Google sign-in. Try again in a moment.');
    }
    // On success the browser redirects away to Google — nothing else to do here.
  };

  const pickDev = (op: Operator) => {
    setOperator(op);
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-navy-deep px-6 py-16 relative overflow-hidden">
      {/* ambient glow accents */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="relative z-10 flex flex-col items-center max-w-md w-full">
        <span className="text-micro font-bold uppercase tracking-[0.2em] text-cyan-400 mb-3">
          LCX Sales Cockpit
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold text-ice text-center mb-2">
          Who&rsquo;s behind the wheel?
        </h1>
        <p className="text-label text-ice/50 text-center mb-10">
          Sign in with your LCX Google account.
        </p>

        {supabaseAuthConfigured ? (
          <button
            onClick={() => void handleGoogleSignIn()}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-ice px-6 py-3.5 text-sm font-semibold text-navy-deep shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60 disabled:pointer-events-none"
          >
            <Chrome size={18} />
            {submitting ? 'Redirecting to Google…' : 'Continue with Google'}
          </button>
        ) : (
          <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-label text-amber-300">
            Google sign-in isn&rsquo;t configured on this build yet.
          </div>
        )}

        {authError && (
          <div className="mt-4 w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-label text-red-300">
            {authError}
          </div>
        )}

        <p className="mt-8 text-micro text-ice/30 text-center max-w-sm">
          Only @lcx.com accounts can sign in.
        </p>

        {import.meta.env.DEV && (
          <div className="mt-10 w-full border-t border-ice/10 pt-6">
            <button
              onClick={() => setShowDevPicker(v => !v)}
              className="text-micro text-ice/30 hover:text-ice/50 transition-colors"
            >
              {showDevPicker ? 'Hide' : 'Show'} local dev shortcut
            </button>
            {showDevPicker && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                {OPERATORS.map(op => (
                  <button
                    key={op.id}
                    onClick={() => pickDev(op)}
                    className="group flex flex-col items-center gap-2 rounded-lg border border-ice/10 bg-ice/[0.03] p-3 transition-all hover:border-ice/20 hover:bg-ice/[0.06]"
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: op.colorVar }}
                    >
                      {op.initials}
                    </span>
                    <span className="text-micro font-semibold text-ice">{op.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SelectOperator;
