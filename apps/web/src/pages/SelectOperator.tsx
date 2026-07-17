import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { normalizeEmail } from '@lcx/shared';
import { OPERATORS, useOperatorStore } from '@/stores';
import { getHealth, setOperatorEmail } from '@/lib/apiClient';

/**
 * The front door — a hard email gate, and the first thing the app renders when
 * you're not signed in (AppLayout redirects here). Deliberately reveals nothing
 * before authentication: no roster, no names, no desk figures. The only way in
 * is an authorized LCX address. Entering one signs you in as the owner of that
 * address and provisions the API credential for this browser — which is why it
 * then works on any device. Wrong/unknown address → a single generic error.
 */
export function SelectOperator() {
  const navigate = useNavigate();
  const setOperator = useOperatorStore(s => s.setOperator);
  const inputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [apiUp, setApiUp] = useState<boolean | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    getHealth()
      .then(() => setApiUp(true))
      .catch(() => setApiUp(false));
  }, []);

  const submit = () => {
    // The allowlist IS the roster — only the five authorized addresses resolve.
    const member = OPERATORS.find(o => o.email === normalizeEmail(email));
    if (!member) {
      setError("That email isn't authorized for the LCX desk.");
      inputRef.current?.select();
      return;
    }
    setOperatorEmail(member.email); // API credential for this browser
    setOperator(member);
    navigate('/', { replace: true });
  };

  const utc = clock.toISOString().slice(11, 19);

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-6 text-navy antialiased">
      <div className="w-full max-w-sm">
        {/* Wordmark */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy font-mono text-[12px] font-bold tracking-tight text-card">
            LCX
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-bold tracking-tight text-navy">LCX USA</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-grey">Launch Control</div>
          </div>
        </div>

        <div className="animate-fadeIn mt-9">
          <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-400">
            <span className="h-1.5 w-1.5 animate-pulse-beacon rounded-full bg-cyan-600 dark:bg-cyan-400" />
            Authorized access only
          </div>
          <h1 className="mt-3 text-[28px] font-bold leading-tight tracking-[-0.02em] text-navy">Sign in to the desk</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-grey">
            Enter your LCX email to continue. Access is limited to authorized addresses.
          </p>
        </div>

        <form
          className="mt-6"
          onSubmit={e => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            value={email}
            onChange={e => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="you@lcx.com"
            aria-invalid={!!error}
            aria-label="LCX email address"
            className={`w-full rounded-lg border bg-card px-3.5 py-3 text-[14px] text-navy outline-none transition-colors placeholder:text-grey/55 focus:ring-2 ${
              error
                ? 'border-red-400 focus:ring-red-500/30 dark:border-red-500/60'
                : 'border-line focus:border-cyan-500 focus:ring-cyan-500/25'
            }`}
          />
          {error && <p className="mt-2 text-[11.5px] leading-snug text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            className="group mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-navy py-3 text-[13.5px] font-semibold text-card transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          >
            Sign in
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </form>

        {/* Minimal status footer — no names, no desk data */}
        <div className="mt-8 flex items-center justify-between border-t border-line/70 pt-3 font-mono text-[9px] uppercase tracking-wider text-grey/70">
          <span>
            {import.meta.env.PROD ? 'LIVE' : 'LOCAL'} · v{__APP_VERSION__}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                apiUp === null ? 'bg-grey/40' : apiUp ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
            {apiUp === null ? 'CONNECTING' : apiUp ? 'SECURE' : 'API DOWN'} · {utc} UTC
          </span>
        </div>
      </div>
    </div>
  );
}

export default SelectOperator;
