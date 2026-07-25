/**
 * The opaque read cache (TERMINAL Phase 2).
 *
 * Stores response BODIES keyed by canonical URL + operator, with
 * stale-while-revalidate and in-flight coalescing. It has no idea what an
 * entity is, and that is the point: every surface in this app already has a
 * purpose-built endpoint, so structural fidelity buys nothing that would justify
 * a second read model with its own schema and migrations to drift.
 *
 * Why this earns its keep, measured: every production request costs ~165-195ms
 * of fixed infrastructure latency before a single line of our code runs (an
 * OPTIONS preflight that touches nothing costs 193ms — the origin is GCP
 * us-west1 behind Cloudflare). A cache hit skips all of it. That is also why the
 * approved p95 < 100ms is unreachable any other way.
 *
 * Three properties it must never lose:
 *
 * 1. GET only. `request()` in apiClient serves ~40 non-GET call sites including
 *    the governed write path (/v1/actions/:id/invoke). A cache that leaked into
 *    those would be catastrophic, so the gate is on the method, not on a list.
 * 2. Deny by default — see readPolicy.ts. This module asks; it never decides.
 * 3. Mark stale, never delete. Evicting on write reproduces the blank-screen
 *    pattern (a page setting its data to null) inside the cache layer: a task
 *    status flip dirties a nine-query rollup that nothing local can recompute,
 *    so the operator would get an empty panel instead of a slightly old one.
 */

import { policyFor, type ReadPolicy } from './readPolicy';
import { scopedKey } from './persistence';
import { formatDuration } from './format';

/**
 * Bump when the SHAPE of anything cached changes in a way an old entry would
 * break. Hand-bumped on purpose: package.json's version has been touched five
 * times in the repo's life and never on a routine deploy, so keying off it would
 * be a freshness contract that silently never fires.
 */
const READ_SCHEMA_VERSION = 1;

/** Memory tier cap. Small on purpose — this is a working set, not a database. */
const MAX_MEMORY_ENTRIES = 120;
/** Durable tier byte budget. Beyond this, the least recently used are dropped. */
const MAX_PERSIST_BYTES = 8 * 1024 * 1024;

export interface CacheEntry<T = unknown> {
  body: T;
  /**
   * When this body was received. Reported to surfaces through `cacheAge()` and
   * rendered by components/ui/CacheAge as an age ("4m old") with the exact stamp
   * in its tooltip — but ONLY when the body served came from here rather than off
   * the wire. This comment used to promise an "as of …" rendering that had no
   * consumer at all.
   */
  storedAt: number;
  /** Freshness deadline; past it the entry is served but revalidated. */
  freshUntil: number;
  /** Marked by an invalidation — serve it, but revalidate immediately. */
  dirty?: boolean;
  bytes: number;
}

/* ── keys ─────────────────────────────────────────────────────────────────── */

/**
 * Canonical form of a request path: query parameters sorted, empties dropped.
 *
 * Necessary because the app builds query strings two different ways — the 19
 * modules under lib/api use URLSearchParams while ~51 inline call sites
 * concatenate by hand — so `?a=1&b=2` and `?b=2&a=1` are the same logical read
 * arriving as two different keys. Without this the cache would silently halve
 * its own hit rate and nobody would ever see an error.
 */
export function canonicalPath(path: string): string {
  const [rawPath, rawQuery] = path.split('?');
  const clean = rawPath.replace(/\/+$/, '') || '/';
  if (!rawQuery) return clean;
  const params = new URLSearchParams(rawQuery);
  const pairs: Array<[string, string]> = [];
  params.forEach((v, k) => {
    if (v !== '') pairs.push([k, v]);
  });
  if (pairs.length === 0) return clean;
  pairs.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return `${clean}?${pairs.map(([k, v]) => `${k}=${v}`).join('&')}`;
}

/**
 * The storage key. Scoped to the operator via the same helper the rest of the
 * app's local state uses — so a second person signing in on the same Mac can
 * never read the first person's cached rows. (Note what this scoping does NOT do:
 * `storage.clearAll()` sweeps localStorage and has never touched IndexedDB, so the
 * bodies come out only via `clearReadCache()`, which sign-out now awaits.) Derived
 * from the resolved operator email, never from the bearer
 * token: the desk passcode is shared, so a token-derived key would put a human
 * and a machine key in one namespace with different entitlement pictures.
 */
function keyFor(canonical: string): string {
  return scopedKey(`read:v${READ_SCHEMA_VERSION}:${canonical}`);
}

/* ── memory tier ──────────────────────────────────────────────────────────── */

const mem = new Map<string, CacheEntry>();

function touch(key: string, entry: CacheEntry): void {
  // Map preserves insertion order, so delete+set moves the entry to the newest
  // position and makes the first key the least recently used. Cheapest correct
  // LRU available without another data structure.
  mem.delete(key);
  mem.set(key, entry);
  while (mem.size > MAX_MEMORY_ENTRIES) {
    const oldest = mem.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    mem.delete(oldest);
  }
}

/* ── durable tier (IndexedDB) ─────────────────────────────────────────────── */

const DB_NAME = 'lcx-read-cache';
const STORE = 'entries';

let dbPromise: Promise<IDBDatabase | null> | null = null;

/**
 * IndexedDB rather than localStorage: localStorage is synchronous (it blocks the
 * main thread, which is self-defeating in a latency project) and caps at ~5MB,
 * while a single /v1/command/deep response is already ~92KB. Available in the
 * Tauri webview too, so browser and terminal share one implementation.
 */
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      // Private-browsing and hardened contexts can refuse IDB outright. The
      // memory tier still works, so degrade rather than fail.
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function idbGet(key: string): Promise<CacheEntry | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(key);
          req.onsuccess = () => resolve((req.result as CacheEntry | undefined) ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

/**
 * The durable tier is CLOSED between losing a credential and having one again.
 *
 * Awaiting the clear is not on its own enough to make "sign-out clears the cache"
 * true. Sign-out is: clear → (transaction completes) → navigate, and those are
 * separate turns. A background revalidation whose fetch resolves in between calls
 * `store()`, which writes a body to disk AFTER the clear that was supposed to have
 * emptied it — and IndexedDB's own transaction ordering does not help, because
 * this write is issued later, not merely completed later.
 *
 * A monotonic epoch was the first attempt and it provably could not fire: a write
 * issued BEFORE a clear is already serialised before it. The window that exists is
 * the one after, so the fix has to be a seal.
 *
 * It is reopened by `setOperatorCredentials` — the one function that means "there
 * is a credential again" — rather than never, because a forced return to the front
 * door does NOT reload the document, so a permanent latch would silently disable
 * the durable tier for the rest of the session after a passcode rotation. The
 * memory tier is untouched while sealed, so the desk stays fast either way.
 */
let durableSealed = false;

/** Called by apiClient when a credential exists again. */
export function reopenDurableTier(): void {
  durableSealed = false;
}

function idbPut(key: string, entry: CacheEntry): void {
  if (durableSealed) return;
  void openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry, key);
    } catch {
      /* durable tier is a bonus, never a requirement */
    }
  });
}

function idbDelete(key: string): void {
  void openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
    } catch {
      /* ignore */
    }
  });
}

/**
 * Drop everything. Called on sign-out alongside storage.clearAll().
 *
 * AWAITABLE, and sign-out must await it (TERMINAL, handover). The memory tier and
 * the provenance map go synchronously, but the durable tier is an IndexedDB
 * transaction — and sign-out ends in `window.location.assign('/select')`, a real
 * document navigation that aborts any transaction still in flight. So the bodies
 * survived on disk while `TERMINAL_QUICKSTART.md` said they were cleared. They are
 * namespaced per operator, so nobody could be SERVED them, but "the bytes are
 * gone" and "nobody else can read them" are different promises and only the
 * second one was true.
 *
 * The returned promise resolves on the transaction's `complete` event — the point
 * at which IndexedDB guarantees durability — and also on error or abort, because
 * a caller blocking a sign-out on a storage layer that has refused would trap the
 * operator on a desk they asked to leave. `clearOperatorEmail` in apiClient joins
 * this to the Keychain forget inside one bounded race, so it costs no extra
 * wall-clock time: the two run concurrently and the Keychain IPC is the slower.
 */
export function clearReadCache(): Promise<void> {
  mem.clear();
  provenance.clear();
  // Closed BEFORE the transaction is requested, so a revalidation that resolves
  // between the clear and the navigation cannot put a body back on disk.
  durableSealed = true;
  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) return resolve();
        try {
          const tx = db.transaction(STORE, 'readwrite');
          // `complete`, not the request's `success`: success only means the
          // operation was accepted, complete means it is durable.
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
          tx.objectStore(STORE).clear();
        } catch {
          resolve();
        }
      }),
  );
}

/* ── how the last read was answered ───────────────────────────────────────── */

/**
 * WHY THIS EXISTS. Production sits behind 165-195ms of fixed infrastructure
 * latency before our code runs, so this cache is not an optimisation — it is the
 * only mechanism available, and it serves real values that real decisions are
 * made on. `storedAt` has always been recorded and never shown, which made a
 * cached number visually identical to a live one. The offline banner was the only
 * signal, and it says "the API is down", not "THIS figure is four minutes old".
 *
 * So the cache records, per canonical path, how the body it last HANDED TO A
 * CALLER was obtained. Two properties make it honest:
 *
 * 1. Only a body that reached a caller is recorded. A background SWR
 *    revalidation deliberately does NOT update this, because its fresh body is
 *    stored but not handed back — the surface is still painting the old one, and
 *    marking it live would be the exact lie this affordance exists to remove.
 * 2. `fromCache: false` produces no age at all. A badge on every number teaches
 *    nothing; the signal is the difference.
 */
export interface Provenance {
  /** `storedAt` of the body the caller received. */
  storedAt: number;
  /** True when it came out of the cache instead of off the wire. */
  fromCache: boolean;
}

/**
 * Keyed by canonical path only — it holds a timestamp and a boolean, never a
 * body, so it needs no operator scope. It is still cleared by clearReadCache()
 * so a forced return to the front door leaves no residue at all.
 */
const provenance = new Map<string, Provenance>();

/** Record how a completed read was answered. Called by apiClient, nowhere else. */
export function noteServed(canonical: string, p: Provenance): void {
  provenance.delete(canonical); // re-insert so Map order is recency
  provenance.set(canonical, p);
  while (provenance.size > MAX_MEMORY_ENTRIES) {
    const oldest = provenance.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    provenance.delete(oldest);
  }
}

/** How the most recent completed read of `path` was answered, if any. */
export function servedFrom(path: string): Provenance | null {
  return provenance.get(canonicalPath(path)) ?? null;
}

/**
 * Age in ms of the body a surface is currently showing for `path`, or null when
 * that body came off the wire — i.e. null means "live, say nothing".
 *
 * `now` is a parameter so the derivation is testable without mocking the clock.
 */
export function cacheAge(path: string, now: number = Date.now()): number | null {
  const p = provenance.get(canonicalPath(path));
  if (!p || !p.fromCache) return null;
  return Math.max(0, now - p.storedAt);
}

/**
 * The operator-facing label for an age. Routed through lib/format's duration
 * formatter rather than inventing a fifth way to write a timespan.
 *
 * Sub-minute is "<1m old" and not "0m old" or "just now": a value can be six
 * seconds old and still not be live, and "just now" reads as live.
 */
export function cacheAgeLabel(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return '';
  if (ageMs < 60_000) return '<1m old';
  return `${formatDuration(ageMs / 60_000)} old`;
}

/* ── degraded-body refusal ────────────────────────────────────────────────── */

/**
 * Several endpoints answer with compiled defaults plus a flag saying so —
 * `dbLive: false` on access reads, `live: { … }` blocks on command/deep and
 * distribution/deep. Persisting one of those pins the flag: the operator either
 * distrusts real data forever, or trusts compiled defaults as live desk state.
 * Both are worse than a cache miss, so a degraded body is never stored.
 */
export function isDegradedBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const data = (body as { data?: unknown }).data;
  const probe = (data && typeof data === 'object' ? data : body) as Record<string, unknown>;
  if (probe.dbLive === false) return true;
  const live = probe.live;
  if (live && typeof live === 'object') {
    // `live: { listings: false }` style flags — any false means degraded.
    for (const v of Object.values(live as Record<string, unknown>)) {
      if (v === false) return true;
    }
  }
  return false;
}

/* ── coalescing ───────────────────────────────────────────────────────────── */

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Collapse identical concurrent GETs into one request.
 *
 * Measured need, not theory: /v1/deals/board is fetched from 8 separate call
 * sites, /v1/command/deep twice on a single page, /v1/distribution/deep by five
 * pages — with no dedupe today. At ~200ms a round trip those are pure waste.
 *
 * The coalescer owns its own fetch and deliberately ignores any caller's abort
 * signal: one component unmounting must not cancel a response three other
 * mounted components are waiting on. A caller's signal detaches that subscriber,
 * it does not kill the request.
 */
export function coalesce<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = run().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

/** Test/diagnostic: how many requests are currently in flight. */
export function inFlightCount(): number {
  return inFlight.size;
}

/* ── read / write ─────────────────────────────────────────────────────────── */

export interface Lookup<T> {
  entry: CacheEntry<T> | null;
  policy: ReadPolicy;
  /** Safe to paint right now (present, and not being withheld by policy). */
  usable: boolean;
  /** Needs a background refresh even though it is usable. */
  stale: boolean;
}

/**
 * Look a GET up. Never throws, never blocks on the durable tier for longer than
 * the durable tier takes — callers that cannot wait should use peek().
 */
export async function lookup<T>(path: string): Promise<Lookup<T>> {
  const canonical = canonicalPath(path);
  const policy = policyFor(canonical);
  if (policy.mode === 'never') {
    return { entry: null, policy, usable: false, stale: true };
  }

  const key = keyFor(canonical);
  let entry = (mem.get(key) as CacheEntry<T> | undefined) ?? null;

  if (!entry && !policy.memoryOnly) {
    entry = (await idbGet(key)) as CacheEntry<T> | null;
    if (entry) touch(key, entry);
  }

  if (!entry) return { entry: null, policy, usable: false, stale: true };

  const now = Date.now();
  const stale = entry.dirty === true || now >= entry.freshUntil;
  return { entry, policy, usable: true, stale };
}

/** Synchronous memory-tier peek, for paths that must decide inside one frame. */
export function peek<T>(path: string): CacheEntry<T> | null {
  const canonical = canonicalPath(path);
  if (policyFor(canonical).mode === 'never') return null;
  return (mem.get(keyFor(canonical)) as CacheEntry<T> | undefined) ?? null;
}

/**
 * Store a response body. Refuses when policy says never, when the body is
 * degraded, or when the server vetoed storage with X-LCX-No-Store — the server
 * can only ever make us MORE conservative, never less.
 */
export function store<T>(path: string, body: T, opts: { noStore?: boolean } = {}): void {
  const canonical = canonicalPath(path);
  const policy = policyFor(canonical);
  if (policy.mode === 'never') return;
  if (opts.noStore) return;
  if (isDegradedBody(body)) return;

  let bytes = 0;
  let serialized: string | null = null;
  try {
    serialized = JSON.stringify(body);
    bytes = serialized.length;
  } catch {
    return; // not serialisable — nothing to store
  }
  // A single absurd response should not evict the entire working set.
  if (bytes > MAX_PERSIST_BYTES / 4) return;

  const now = Date.now();
  const entry: CacheEntry<T> = {
    body,
    storedAt: now,
    freshUntil: now + policy.freshMs,
    bytes,
  };
  const key = keyFor(canonical);
  touch(key, entry);
  if (!policy.memoryOnly) idbPut(key, entry);
}

/**
 * Mark entries stale without removing them, so the next read paints instantly
 * and refreshes behind. `prefixes` are matched against the canonical path.
 */
export function markStale(prefixes: readonly string[]): number {
  let hit = 0;
  for (const [key, entry] of mem) {
    if (prefixes.some((p) => key.includes(`read:v${READ_SCHEMA_VERSION}:${p}`))) {
      entry.dirty = true;
      hit += 1;
      if (!Number.isNaN(entry.bytes)) idbPut(key, entry);
    }
  }
  return hit;
}

/** Drop a single entry outright — for the rare case where stale is unacceptable. */
export function evict(path: string): void {
  const key = keyFor(canonicalPath(path));
  mem.delete(key);
  idbDelete(key);
}

/** Diagnostics for the HUD and tests. */
export function cacheStats(): { entries: number; bytes: number } {
  let bytes = 0;
  for (const e of mem.values()) bytes += e.bytes;
  return { entries: mem.size, bytes };
}

/** Test-only. */
export function _resetReadCache(): void {
  mem.clear();
  inFlight.clear();
  provenance.clear();
  durableSealed = false;
}
