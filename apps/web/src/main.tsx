import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { hydrateCredentials } from './lib/apiClient';

/**
 * Boot. In LCX TERMINAL the desk credential lives in the macOS Keychain, so we
 * hydrate it into memory BEFORE the first render — otherwise the app's first
 * API calls would fire unauthenticated and bounce the operator to the sign-in
 * gate on every launch. In a browser this resolves immediately as a no-op.
 */
function mount() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>,
  );
}

hydrateCredentials()
  .catch(() => { /* fall back to localStorage */ })
  .finally(mount);
