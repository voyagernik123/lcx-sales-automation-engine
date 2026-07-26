import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { hydrateCredentials } from './lib/apiClient';
import { installActivationTracking } from './lib/lastActivated';

/**
 * Boot. In LCXOS the desk credential lives in the macOS Keychain, so we
 * hydrate it into memory BEFORE the first render — otherwise the app's first
 * API calls would fire unauthenticated and bounce the operator to the sign-in
 * gate on every launch. In a browser this resolves immediately as a no-op.
 */
function mount() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>,
  );
}

// Before mount, and outside the credential promise: the two listeners are what
// let the governed-write chokepoint know WHICH element to react on, and an
// operator who clicks during the Keychain read should still get a reaction for
// it. Idempotent, so StrictMode's double-invoke cannot double-register.
installActivationTracking();

hydrateCredentials()
  .catch(() => { /* fall back to localStorage */ })
  .finally(() => {
    mount();
    // Warm the feel layer AFTER mount, never before. `apiClient` reaches it by
    // dynamic import so it stays out of the initial bundle (it cost 4KB against a
    // 1KB budget when static), but a cold chunk on the first governed write would
    // land the reaction late enough to miss the dedupe window and double up.
    // Fetching it once here, off the critical path, makes every later reaction
    // synchronous from memory. Failure is fine — `react()` degrades to silence.
    void import('./lib/feedback').catch(() => {});
  });
