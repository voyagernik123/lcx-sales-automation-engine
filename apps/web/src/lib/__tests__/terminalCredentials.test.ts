/**
 * LCX TERMINAL Phase 1 — the credential handoff between the macOS Keychain and
 * the API client.
 *
 * This is the single most failure-prone seam in the shell. Keychain reads are
 * ASYNC but `getApiKey()` is SYNCHRONOUS and runs on every request, so the
 * terminal hydrates an in-memory cache once before React mounts. If that
 * handoff breaks, the symptom is not an error — it is every launch silently
 * bouncing the operator to the sign-in gate. The native half is covered by a
 * Rust Keychain round-trip test (src-tauri/src/lib.rs); this covers the web half
 * without needing a Keychain or a running app.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** The Keychain, faked. Mirrors the Rust contract: absent reads are null. */
const keychain = new Map<string, string>();

// Two mocks, because the container check deliberately lives apart from the Tauri
// bridge: apiClient asks `container` "are we in the terminal?" synchronously and
// only then lazily imports `terminal`. Keeping them separate is what keeps the
// 2KB Tauri chunk off the browser's path to first paint.
vi.mock('@/lib/container', () => ({ isTerminal: () => true }));

vi.mock('@/lib/terminal', () => ({
  isTerminal: () => true,
  secretGet: async (key: string) => keychain.get(key) ?? null,
  secretSet: async (key: string, value: string) => void keychain.set(key, value),
  secretDelete: async (key: string) => void keychain.delete(key),
}));

// The module under test caches credentials in module scope, so each case needs a
// fresh copy.
async function freshClient() {
  vi.resetModules();
  return import('@/lib/apiClient');
}

const EMAIL_KEY = 'lcx_operator_email';
const PASS_KEY = 'lcx_desk_passcode';

describe('LCX TERMINAL credential handoff', () => {
  beforeEach(() => {
    keychain.clear();
    localStorage.clear();
  });

  afterEach(() => {
    keychain.clear();
    localStorage.clear();
  });

  it('turns a hydrated Keychain credential into the email:passcode bearer', async () => {
    keychain.set(EMAIL_KEY, 'nik@lcx.com');
    keychain.set(PASS_KEY, 'test#1234');

    const { hydrateCredentials, getApiKey } = await freshClient();
    await hydrateCredentials();

    // Exactly the bearer the API verifies server-side.
    expect(getApiKey()).toBe('nik@lcx.com:test#1234');
  });

  it('reads synchronously after hydration — no await at the call site', async () => {
    keychain.set(EMAIL_KEY, 'sam@lcx.com');
    keychain.set(PASS_KEY, 'test#1234');

    const { hydrateCredentials, getApiKey } = await freshClient();
    await hydrateCredentials();

    // The regression this guards: getApiKey() must not return a Promise, or
    // every Authorization header becomes the string "[object Promise]".
    const key = getApiKey();
    expect(typeof key).toBe('string');
    expect(key).not.toContain('Promise');
  });

  it('does not authenticate on a half credential (email but no passcode)', async () => {
    keychain.set(EMAIL_KEY, 'nik@lcx.com');
    // passcode deliberately absent — e.g. a partial/interrupted sign-in

    const { hydrateCredentials, getApiKey } = await freshClient();
    await hydrateCredentials();

    // A bare email must never be sent as a bearer: the desk gate requires both
    // halves and the API rejects it (verified against prod: HTTP 401).
    expect(getApiKey()).not.toBe('nik@lcx.com');
    expect(getApiKey()).not.toContain('nik@lcx.com:');
  });

  it('persists to the Keychain on sign-in and works immediately', async () => {
    const { setOperatorCredentials, getApiKey } = await freshClient();

    setOperatorCredentials('Monty@LCX.com', 'test#1234');

    // Usable on the very next request without waiting for the async write —
    // that is the point of the in-memory cache. Email is normalised.
    expect(getApiKey()).toBe('monty@lcx.com:test#1234');

    // ...and the async Keychain write still lands, so the NEXT launch is signed in.
    await vi.waitFor(() => {
      expect(keychain.get(EMAIL_KEY)).toBe('monty@lcx.com');
      expect(keychain.get(PASS_KEY)).toBe('test#1234');
    });
  });

  it('sign-out really forgets — memory, localStorage AND Keychain', async () => {
    const { setOperatorCredentials, clearOperatorEmail, getApiKey } = await freshClient();

    setOperatorCredentials('nik@lcx.com', 'test#1234');
    await vi.waitFor(() => expect(keychain.get(PASS_KEY)).toBe('test#1234'));

    clearOperatorEmail();

    // The whole reason for using the Keychain: leaving the passcode behind on a
    // shared machine after sign-out would defeat the desk gate entirely.
    // NB: this asserts the operator credential is gone, not that the key is
    // empty. Under vitest `import.meta.env.DEV` is true, so getApiKey() falls
    // back to the dev-only VITE_API_KEY — which Vite dead-code-strips from
    // production bundles, so a real build returns ''.
    expect(getApiKey()).not.toContain('nik@lcx.com');
    expect(getApiKey()).not.toContain('test#1234');
    expect(localStorage.getItem(EMAIL_KEY)).toBeNull();
    expect(localStorage.getItem(PASS_KEY)).toBeNull();
    await vi.waitFor(() => {
      expect(keychain.has(EMAIL_KEY)).toBe(false);
      expect(keychain.has(PASS_KEY)).toBe(false);
    });
  });

  /* ── Phase 7: absence vs emptiness ─────────────────────────────────────────
   * The Keychain stores an empty value happily and reads it back as present, not
   * absent — measured in the shell's own test
   * (src-tauri/src/lib.rs::an_empty_value_is_stored_not_treated_as_absence). The
   * web side resolves credentials as `mem ?? localStorage`, and `''` is not
   * nullish, so a present-but-empty entry does not read as "no credential" — it
   * reads as "the credential is the empty string", which silently switches OFF the
   * localStorage fallback. These three cases pin both ends of that.
   * ────────────────────────────────────────────────────────────────────────── */

  it('a rejected sign-in deletes the Keychain entries instead of emptying them', async () => {
    const { setOperatorCredentials } = await freshClient();

    setOperatorCredentials('nik@lcx.com', 'wrong-passcode');
    await vi.waitFor(() => expect(keychain.get(PASS_KEY)).toBe('wrong-passcode'));

    // What the sign-in gate does when the server refuses the pair it just stored.
    setOperatorCredentials('', '');

    await vi.waitFor(() => {
      expect(keychain.has(EMAIL_KEY)).toBe(false);
      expect(keychain.has(PASS_KEY)).toBe(false);
    });
    // Not `''` in localStorage either — same trap, same reason.
    expect(localStorage.getItem(EMAIL_KEY)).toBeNull();
    expect(localStorage.getItem(PASS_KEY)).toBeNull();
  });

  it('an empty Keychain value does not shadow a good localStorage credential', async () => {
    // The state a build shipped before this fix leaves behind: emptied Keychain,
    // intact localStorage. The desk must still authenticate.
    keychain.set(EMAIL_KEY, '');
    keychain.set(PASS_KEY, '');
    localStorage.setItem(EMAIL_KEY, 'nik@lcx.com');
    localStorage.setItem(PASS_KEY, 'test#1234');

    const { hydrateCredentials, getApiKey } = await freshClient();
    await hydrateCredentials();

    expect(getApiKey()).toBe('nik@lcx.com:test#1234');
  });

  it('sign-out is awaitable, so the caller can navigate only after the forget lands', async () => {
    const { setOperatorCredentials, clearOperatorEmail } = await freshClient();

    setOperatorCredentials('nik@lcx.com', 'test#1234');
    await vi.waitFor(() => expect(keychain.get(PASS_KEY)).toBe('test#1234'));

    // The regression this guards is invisible without the await: sign-out ends in
    // `window.location.assign`, which tears down the context the Keychain IPC is
    // riding on, so a fire-and-forget delete could simply never arrive and leave
    // the previous operator's passcode in the login keychain.
    await clearOperatorEmail();

    expect(keychain.has(EMAIL_KEY)).toBe(false);
    expect(keychain.has(PASS_KEY)).toBe(false);
  });

  it('survives a Keychain that returns nothing (first run) without throwing', async () => {
    const { hydrateCredentials, getApiKey } = await freshClient();

    // First launch ever: no entries. Must resolve quietly and leave the app at
    // the sign-in gate rather than crashing before React mounts — main.tsx
    // awaits this call, so a throw here would mean a blank window.
    await expect(hydrateCredentials()).resolves.toBeUndefined();

    // No desk credential is fabricated (see the dev-key note above).
    expect(getApiKey()).not.toContain('@');
    expect(getApiKey()).not.toContain(':');
  });
});
