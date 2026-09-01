import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { normalizeEmail } from '@lcx/shared';
import { OPERATORS, useOperatorStore } from '@/stores';
import { apiConfig, getHealth, getMe, setOperatorCredentials } from '@/lib/apiClient';
import { useClock } from '@/lib/useClock';
import { classifyUnreachable, originBlockedMessage, type Reachability } from '@/lib/reachability';
import { LcxMark } from '@/components/brand/LcxMark';
import { ForgePlate } from '@/components/brand/ForgePlate';

/* LAZY, and the number is the reason: imported statically into this eagerly-loaded route it pushed
   index.js to 441 KB against a 440 KB ceiling and the perf budget refused the build. */
const ForgeBackdrop = lazy(() =>
  import('@/components/brand/ForgeBackdrop').then((m) => ({ default: m.ForgeBackdrop })),
);

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
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The one clock (S1) — the sign-in screen's second is the same second as the desk's.
  const clock = new Date(useClock(1000));
  const [apiUp, setApiUp] = useState<boolean | null>(null);
  /**
   * WHY a failed health check is not enough to say "API DOWN". A CORS denial and
   * a dead host are the same opaque TypeError in the browser, so this screen used
   * to show a red API DOWN while the API was answering 200 — see lib/reachability.
   * Only set when the readable probe has already failed.
   */
  const [reach, setReach] = useState<Reachability | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let live = true;
    getHealth()
      .then(() => {
        if (!live) return;
        setApiUp(true);
        setReach(null);
      })
      .catch(async () => {
        if (!live) return;
        setApiUp(false);
        // Second, no-cors probe: distinguishes "nothing answered" from "something
        // answered and the browser was not allowed to read it".
        const r = await classifyUnreachable(`${apiConfig.base}/health`);
        if (live) setReach(r);
      });
    return () => {
      live = false;
    };
  }, []);

  const submit = async () => {
    // The allowlist IS the roster — only authorized addresses resolve.
    const member = OPERATORS.find(o => o.email === normalizeEmail(email));
    if (!member || !passcode) {
      setError('That email and passcode combination is not authorized.');
      inputRef.current?.select();
      return;
    }
    // LCX OS gate: the server verifies email + passcode together — signing in
    // is an authenticated round-trip, not a client-side guess.
    setBusy(true);
    setOperatorCredentials(member.email, passcode);
    try {
      await getMe();
      setOperator(member);
      navigate('/', { replace: true });
    } catch (err) {
      // WHY THIS IS NOT A BARE `catch`, discovered on a real clean-machine install.
      //
      // It used to be `catch { … 'That email and passcode combination is not authorized.' }`,
      // which blamed the operator's credential for EVERY failure of `getMe()` — including
      // the API being unreachable. It happened for real within minutes of the first
      // download: a deploy restarted the API, sign-in failed, and the desk told the
      // operator their passcode was wrong. It was correct. They then went looking for a
      // bad password, on a working credential, while the status bar two lines below said
      // API DOWN.
      //
      // And it CLEARED the credential on the way out, so a server restart cost them a
      // retype. Wiping a secret is right when the server has rejected it and wrong when
      // the server never saw it.
      //
      // `classifyError` already drew this distinction (`lib/errors.ts:36` for 401,
      // `:58` for unreachable) and this path simply never asked it. Blaming the user for
      // an outage is the front door's version of the same defect the 401 handler fixed
      // deeper in the app.
      const { classifyError } = await import('@/lib/errors');
      const classified = classifyError(err);
      if (classified.kind === 'auth' || classified.kind === 'permission') {
        setOperatorCredentials('', '');
        setError('That email and passcode combination is not authorized.');
      } else {
        // Credential deliberately KEPT: it was never judged. One press of Sign in
        // retries once the API is back, with nothing retyped.
        //
        // But first: say WHICH failure this is. "Could not reach the API" is true
        // of a dead host and of a live host refusing this origin, and those need
        // opposite responses from the operator — wait, versus open a different URL.
        // A blocked origin will never fix itself by retrying, so telling them to
        // "try again in a moment" is the one piece of advice guaranteed to fail.
        const r = classified.kind === 'network'
          ? await classifyUnreachable(`${apiConfig.base}/health`)
          : null;
        if (r === 'origin-blocked') {
          setReach('origin-blocked');
          setApiUp(false);
          setError(`${originBlockedMessage(window.location.origin)} Your credential has not been rejected.`);
        } else {
          setError(`${classified.title}. The desk could not reach the API to verify you — your credential has not been rejected. ${classified.retryable ? 'Try again in a moment.' : ''}`.trim());
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const utc = clock.toISOString().slice(11, 19);

  return (
    /* `relative isolate` so E8's backdrop has a positioned ancestor to fill and its negative
       z-index cannot escape behind the page background and vanish. */
    <div className="relative isolate flex min-h-screen items-center justify-center bg-page px-6 text-navy antialiased">
      {/* E8 · THE FORGE. The PLATE is eager — ten lines of CSS, painted on the first frame, so
          there is no bare page and no shift when the renderer lands on top of it. The RENDERER is
          lazy because importing it statically into this eagerly-loaded route pushed the shell
          chunk past its ceiling and the perf budget refused the build. Nothing here is load-
          bearing: the form above never depends on either. */}
      <ForgePlate />
      <Suspense fallback={null}><ForgeBackdrop /></Suspense>
      <div className="relative w-full max-w-sm">
        {/* The signature. This replaced the letters `LCX` set in a monospace box —
          * a stand-in that was never artwork. The mark is now the approved symbol,
          * knocked out of an LCX Black tile with the book's clear space reserved
          * (page 12), which is the same lockup the app icon uses. */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-lcx-black text-lcx-white">
            <LcxMark size={36} withClearSpace />
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-bold tracking-tight text-navy">LCXOS</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-grey">Launch Control</div>
          </div>
        </div>

        <div className="animate-fadeIn mt-9">
          <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-600 dark:bg-cyan-400" />
            Authorized access only
          </div>
          <h1 className="mt-3 text-[28px] font-bold leading-tight tracking-[-0.02em] text-navy">Sign in to the desk</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-grey">
            Enter your LCX email and the desk passcode. Both are verified server-side.
          </p>
        </div>

        <form
          className="mt-6"
          onSubmit={e => {
            e.preventDefault();
            void submit();
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
            placeholder="you@lcx.com"
            aria-invalid={!!error}
            aria-label="LCX email address"
            className={`w-full rounded-lg border bg-card px-3.5 py-3 text-[14px] text-navy outline-none transition-colors placeholder:text-grey/55 focus:ring-2 ${
              error
                ? 'border-red-400 focus:ring-red-500/30 dark:border-red-500/60'
                : 'border-line focus:border-cyan-500 focus:ring-cyan-500/25'
            }`}
          />
          <input
            type="password"
            autoComplete="current-password"
            value={passcode}
            onChange={e => {
              setPasscode(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Desk passcode"
            aria-invalid={!!error}
            aria-label="Desk passcode"
            className={`mt-2.5 w-full rounded-lg border bg-card px-3.5 py-3 text-[14px] text-navy outline-none transition-colors placeholder:text-grey/55 focus:ring-2 ${
              error
                ? 'border-red-400 focus:ring-red-500/30 dark:border-red-500/60'
                : 'border-line focus:border-cyan-500 focus:ring-cyan-500/25'
            }`}
          />
          {error && <p className="mt-2 text-[11.5px] leading-snug text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="group mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-navy py-3 text-[13.5px] font-semibold text-card transition-opacity hover:opacity-90 focus-ring disabled:opacity-60"
          >
            {busy ? 'Verifying…' : 'Sign in'}
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </form>

        {/* Minimal status footer — no names, no desk data */}
        <div className="mt-8 flex items-center justify-between border-t border-line/70 pt-3 font-mono text-[9px] uppercase tracking-wider text-grey/70">
          <span>
            {import.meta.env.PROD ? 'LIVE' : 'LOCAL'} · v{__APP_VERSION__}
          </span>
          <span className="flex items-center gap-1.5">
            {/*
              ORIGIN BLOCKED is amber, not red: the API is healthy and the desk is
              the thing in the wrong place. Calling it API DOWN sent an operator
              hunting a nonexistent outage — the actual cause was a Cloudflare
              Pages preview hostname that CORS_ORIGINS did not list.
            */}
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                apiUp === null
                  ? 'bg-grey/40'
                  : apiUp
                    ? 'bg-emerald-500'
                    : reach === 'origin-blocked'
                      ? 'bg-amber-500'
                      : 'bg-red-500'
              }`}
            />
            {apiUp === null
              ? 'CONNECTING'
              : apiUp
                ? 'SECURE'
                : reach === 'origin-blocked'
                  ? 'ORIGIN BLOCKED'
                  : reach === null
                    ? 'CHECKING'
                    : 'API DOWN'}{' '}
            · {utc} UTC
          </span>
        </div>
      </div>
    </div>
  );
}

export default SelectOperator;
