/**
 * Guard: the BROWSER boot path must never load the Tauri bridge chunk.
 *
 * `main.tsx` awaits `hydrateCredentials()` before mounting React. Phase 1 wrote
 * that function to `await import('./terminal')` and *then* check the container —
 * which put a network round-trip for a 2KB chunk directly on the browser's path
 * to first paint, measured at ~240ms of blank screen on Cloudflare Pages, to load
 * a module that immediately answers "not the terminal".
 *
 * The fix was to check `lib/container` (zero imports, statically bundled) first.
 * This test exists so that fix cannot be silently undone: it fails the moment
 * anything on the browser boot path touches `lib/terminal` again.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/** Flipped by the mock factory the instant `lib/terminal` is first imported. */
let terminalChunkLoaded = false;

vi.mock('@/lib/container', () => ({ isTerminal: () => false }));

vi.mock('@/lib/terminal', () => {
  terminalChunkLoaded = true;
  return {
    isTerminal: () => false,
    secretGet: async () => null,
    secretSet: async () => {},
    secretDelete: async () => {},
  };
});

async function freshClient() {
  vi.resetModules();
  return import('@/lib/apiClient');
}

describe('browser boot path', () => {
  beforeEach(() => {
    terminalChunkLoaded = false;
    localStorage.clear();
  });

  it('hydrateCredentials() resolves without loading the Tauri chunk', async () => {
    const { hydrateCredentials } = await freshClient();

    await expect(hydrateCredentials()).resolves.toBeUndefined();

    // The whole point: in a browser this must be a synchronous no-op, not a
    // round-trip. If this fails, first paint just got slower for every web user.
    expect(terminalChunkLoaded).toBe(false);
  });

  it('sign-in and sign-out do not load the Tauri chunk either', async () => {
    const { setOperatorCredentials, clearOperatorEmail, getApiKey } = await freshClient();

    setOperatorCredentials('nik@lcx.com', 'test#1234');
    expect(getApiKey()).toBe('nik@lcx.com:test#1234');

    clearOperatorEmail();

    // Give any stray fire-and-forget import a turn of the event loop to land.
    await new Promise((r) => setTimeout(r, 0));
    expect(terminalChunkLoaded).toBe(false);
  });

  it('still persists credentials to localStorage in a browser', async () => {
    const { setOperatorCredentials } = await freshClient();

    setOperatorCredentials('Sam@LCX.com', 'test#1234');

    // Browser fallback must keep working exactly as it did before the terminal
    // existed — the Keychain is an upgrade for the desktop app, not a dependency.
    expect(localStorage.getItem('lcx_operator_email')).toBe('sam@lcx.com');
    expect(localStorage.getItem('lcx_desk_passcode')).toBe('test#1234');
  });
});
