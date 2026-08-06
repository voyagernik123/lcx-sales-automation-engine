import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/storage';
import { safeHarborBus } from '@/lib/eventBus';
import { AUDIT } from '@/lib/constants';

export interface AuditLog {
  timestamp: string;
  message: string;
  category: 'Audit' | 'Architecture' | 'System' | 'Scenario';
  /**
   * A LOCAL ORDERING MARK. NOT a cryptographic digest, and not evidence.
   *
   * The field keeps its old name only because `pages/BriefGenerator.tsx:1084`
   * renders it; every value carries the `local:` prefix so a reader cannot mistake
   * it for one. See `computeLocalLogMark` below for what it is and what it is not.
   *
   * STILL OPTIONAL, AND THAT IS WHY `normaliseLocalLogMarks` EXISTS. The renderer is
   * `{log.hash || '0000000000000000'}` in another lane's file, so an entry with no
   * mark rendered a bare 16-hex pseudo-digest under a column headed "Block Hash
   * (Digest)" — the one form the prefix was introduced to eliminate. Rehydration
   * stamps every entry, so the fallback is unreachable rather than merely unlikely.
   */
  hash?: string;
}

export interface ReadinessAssignment {
  owner: string;
  notes: string;
  subtasks: Record<string, boolean>;
}

type ReadinessStatusOverride = 'Not Started' | 'In Progress' | 'Counsel Review' | 'Complete';

interface SafeHarborToggles {
  defiExempt: boolean;
  commodityExempt: boolean;
  micaExempt: boolean;
}

interface AuditStore {
  resolvedRemediations: string[];
  toggleRemediation: (id: string) => void;
  isRemediationResolved: (id: string) => boolean;
  auditLogs: AuditLog[];
  addAuditLog: (message: string, category?: AuditLog['category']) => void;
  clearAuditLogs: () => void;
  committedArchitecture: string | null;
  commitArchitecture: (arch: string | null) => void;
  readinessAssignments: Record<string, ReadinessAssignment>;
  updateReadinessAssignment: (id: string, owner: string, notes: string, subtasks?: Record<string, boolean>) => void;
  readinessStatusOverrides: Record<string, ReadinessStatusOverride>;
  updateReadinessStatus: (id: string, status: ReadinessStatusOverride) => void;
  safeHarborToggles: SafeHarborToggles;
  toggleSafeHarbor: (key: keyof SafeHarborToggles) => void;
  evidenceNotes: Record<string, string>;
  updateEvidenceNote: (rfId: string, note: string) => void;
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THIS IS NOT A HASH CHAIN, AND IT USED TO PRESENT ITSELF AS ONE.
 * ══════════════════════════════════════════════════════════════════════════════
 *  Until 2026-08-06 this was `computeLogHash`, it emitted a bare 16-hex token, and
 *  `pages/BriefGenerator.tsx:1084` renders that token in a column headed
 *  "Block Hash (Digest)". For a while it was the ONLY chain anywhere in this
 *  repository, and other files leaned on that: `web/src/lib/readPolicy.ts:19`
 *  records that an earlier draft of the plan justified a read policy with "a
 *  hash-chained audit log", and `apps/api/.../0000_equal_beyonder.sql:1-9` shows
 *  the server-side `audit_log` had seven columns and no chain at all.
 *
 *  WHAT IT ACTUALLY IS. Two 32-bit multiply-xor mixers over
 *  `timestamp|category|message|previous mark`. It is:
 *    · NOT cryptographic — 64 bits, invertible-in-practice, trivially collidable;
 *    · NOT tamper-evident — the whole log lives in this browser's localStorage
 *      (see the `persist` config at the bottom of this file), the user can edit or
 *      clear it at will, and `clearAuditLogs()` empties it with no trace;
 *    · NOT a record of anything the server did — these entries are written by UI
 *      interactions in this tab and never leave it.
 *  It has exactly ONE legitimate use: telling at a glance whether the list you are
 *  looking at is the same list you were looking at a minute ago.
 *
 *  SO THE VALUE NOW SAYS SO. Every mark carries the `local:` prefix, which makes
 *  the rendered cell read `local:1a2b3c4d5e6f` — a token no reader can mistake for
 *  a digest — without touching a file this lane does not own. The column HEADER
 *  still says "Block Hash (Digest)" and still needs correcting; that is
 *  `BriefGenerator.tsx`, another lane's file, and it is named in this lane's report.
 *
 *  "EVERY MARK" REQUIRED TWO MORE THINGS THAN THE PREFIX. The claim was not true of
 *  the two paths that do not run `computeLocalLogMark`:
 *    · `BriefGenerator.tsx:1084` renders `{log.hash || '0000000000000000'}`, and
 *      `hash` is optional — so an entry without one rendered a bare 16-hex token
 *      that is indistinguishable from a digest, right beside `local:` values;
 *    · entries already in a user's localStorage were written by the old
 *      `computeLogHash` and carry a bare 16-hex token forever.
 *  `normaliseLocalLogMarks` below runs on every rehydrate and fixes both, in this
 *  file, without touching the renderer. The cell can no longer show an unprefixed
 *  value whatever the other lane does to the header.
 *
 *  THE REAL SEAL IS SERVER-SIDE: `apps/api/src/access/seal.ts` +
 *  `db/migrations/0070_audit_seal.sql` — SHA-256, chained in Postgres, append-only
 *  by trigger, with a verifier that refuses to speak for rows that predate it.
 *  Nothing in this file has any evidential weight and nothing should cite it.
 */
export const LOCAL_LOG_MARK_PREFIX = 'local:';

/** The seed for the first mark. Marked like every other value, for the same reason. */
export const LOCAL_LOG_GENESIS_MARK = `${LOCAL_LOG_MARK_PREFIX}${AUDIT.GENESIS_HASH.slice(0, 12)}`;

export function computeLocalLogMark(
  timestamp: string,
  category: string,
  message: string,
  prevMark: string,
): string {
  const data = `${timestamp}|${category}|${message}|${prevMark}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    h1 = Math.imul(h1 ^ char, 2654435761);
    h2 = Math.imul(h2 ^ char, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const mixed =
    (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  // 12 of the 16 nibbles, deliberately: a short token reads as a UI aid, and there
  // is no security property here for the discarded four bits to protect.
  return `${LOCAL_LOG_MARK_PREFIX}${mixed.slice(0, 12)}`;
}

/**
 * What an entry with NO mark renders as. Deliberately not hex, not 16 characters,
 * and not mistakable for a digest: absent data must LOOK absent.
 */
export const LOCAL_LOG_NO_MARK = `${LOCAL_LOG_MARK_PREFIX}(no mark)`;

/**
 * Stamp every entry so the renderer's `|| '0000000000000000'` fallback cannot fire,
 * and re-label pre-2026-08-06 marks that were written bare.
 *
 * A bare token is NOT recomputed — the mark chains over the previous mark, so a
 * recomputation would produce a different value from the one the user's other
 * entries were built on and would silently rewrite their local history. It is
 * re-labelled instead: the same 12 nibbles, now visibly local.
 */
export function normaliseLocalLogMarks(logs: AuditLog[]): AuditLog[] {
  return logs.map((log) => {
    const mark = typeof log.hash === 'string' ? log.hash.trim() : '';
    if (mark === '') return { ...log, hash: LOCAL_LOG_NO_MARK };
    if (mark.startsWith(LOCAL_LOG_MARK_PREFIX)) return log;
    return { ...log, hash: `${LOCAL_LOG_MARK_PREFIX}${mark.slice(0, 12)}` };
  });
}

const safeHarborLabels: Record<string, string> = {
  defiExempt: 'DeFi Safe Harbor',
  commodityExempt: 'Commodity Exemption',
  micaExempt: 'Liechtenstein MiCA reciprocal alignment',
};

export const useAuditStore = create<AuditStore>()(
  persist(
    (set, get) => ({
      resolvedRemediations: [],
      toggleRemediation: id =>
        set(state => {
          const isResolved = state.resolvedRemediations.includes(id);
          const next = isResolved
            ? state.resolvedRemediations.filter(x => x !== id)
            : [...state.resolvedRemediations, id];

          const timestamp = new Date().toLocaleTimeString();
          const action = isResolved ? 'unchecked' : 'resolved';
          const logMsg = `CCO ${action} remediation: [${id}]`;
          const prevLog = state.auditLogs[0];
          const prevMark = prevLog?.hash || LOCAL_LOG_GENESIS_MARK;
          const hash = computeLocalLogMark(timestamp, 'Audit', logMsg, prevMark);
          const newLog: AuditLog = { timestamp, message: logMsg, category: 'Audit', hash };

          return {
            resolvedRemediations: next,
            auditLogs: [newLog, ...state.auditLogs].slice(0, AUDIT.MAX_LOG_ENTRIES),
          };
        }),
      isRemediationResolved: id => get().resolvedRemediations.includes(id),
      auditLogs: [
        {
          timestamp: new Date().toLocaleTimeString(),
          message: 'System audit logs engine initialized successfully.',
          category: 'System',
          hash: LOCAL_LOG_GENESIS_MARK,
        },
      ],
      addAuditLog: (message, category = 'System') =>
        set(state => {
          const timestamp = new Date().toLocaleTimeString();
          const prevLog = state.auditLogs[0];
          const prevMark = prevLog?.hash || LOCAL_LOG_GENESIS_MARK;
          const hash = computeLocalLogMark(timestamp, category, message, prevMark);
          const newLog: AuditLog = { timestamp, message, category, hash };
          return { auditLogs: [newLog, ...state.auditLogs].slice(0, AUDIT.MAX_LOG_ENTRIES) };
        }),
      clearAuditLogs: () => set({ auditLogs: [] }),
      committedArchitecture: null,
      commitArchitecture: arch =>
        set(state => {
          const timestamp = new Date().toLocaleTimeString();
          const logMsg = arch
            ? `CCO committed U.S. launch architecture to: Option [${arch}]`
            : 'CCO cleared committed U.S. launch architecture';
          const prevLog = state.auditLogs[0];
          const prevMark = prevLog?.hash || LOCAL_LOG_GENESIS_MARK;
          const hash = computeLocalLogMark(timestamp, 'Architecture', logMsg, prevMark);
          const newLog: AuditLog = { timestamp, message: logMsg, category: 'Architecture', hash };
          return {
            committedArchitecture: arch,
            auditLogs: [newLog, ...state.auditLogs].slice(0, AUDIT.MAX_LOG_ENTRIES),
          };
        }),
      readinessAssignments: {},
      updateReadinessAssignment: (id, owner, notes, subtasks = {}) =>
        set(state => {
          const prev = state.readinessAssignments[id] || { owner: '', notes: '', subtasks: {} };
          const nextAssignments = {
            ...state.readinessAssignments,
            [id]: { owner, notes, subtasks: { ...prev.subtasks, ...subtasks } },
          };
          const timestamp = new Date().toLocaleTimeString();
          const logMsg = `CCO updated task assignments for control: [${id}]`;
          const prevLog = state.auditLogs[0];
          const prevMark = prevLog?.hash || LOCAL_LOG_GENESIS_MARK;
          const hash = computeLocalLogMark(timestamp, 'System', logMsg, prevMark);
          const newLog: AuditLog = { timestamp, message: logMsg, category: 'System', hash };
          return {
            readinessAssignments: nextAssignments,
            auditLogs: [newLog, ...state.auditLogs].slice(0, AUDIT.MAX_LOG_ENTRIES),
          };
        }),
      readinessStatusOverrides: {},
      updateReadinessStatus: (id, status) =>
        set(state => {
          const nextOverrides = { ...state.readinessStatusOverrides, [id]: status };
          const timestamp = new Date().toLocaleTimeString();
          const logMsg = `CCO updated status for control [${id}] to: ${status}`;
          const prevLog = state.auditLogs[0];
          const prevMark = prevLog?.hash || LOCAL_LOG_GENESIS_MARK;
          const hash = computeLocalLogMark(timestamp, 'Audit', logMsg, prevMark);
          const newLog: AuditLog = { timestamp, message: logMsg, category: 'Audit', hash };
          return {
            readinessStatusOverrides: nextOverrides,
            auditLogs: [newLog, ...state.auditLogs].slice(0, AUDIT.MAX_LOG_ENTRIES),
          };
        }),
      safeHarborToggles: { defiExempt: false, commodityExempt: false, micaExempt: false },
      toggleSafeHarbor: key =>
        set(state => {
          const next = {
            ...state.safeHarborToggles,
            [key]: !state.safeHarborToggles[key],
          };
          const timestamp = new Date().toLocaleTimeString();
          const label = safeHarborLabels[key] || key;
          const logMsg = `CCO toggled ${label} model to: ${next[key] ? 'ENABLED' : 'DISABLED'}`;
          const prevLog = state.auditLogs[0];
          const prevMark = prevLog?.hash || LOCAL_LOG_GENESIS_MARK;
          const hash = computeLocalLogMark(timestamp, 'Scenario', logMsg, prevMark);
          const newLog: AuditLog = { timestamp, message: logMsg, category: 'Scenario', hash };

          safeHarborBus.emit(`safeHarbor:${key}`);

          return {
            safeHarborToggles: next,
            auditLogs: [newLog, ...state.auditLogs].slice(0, AUDIT.MAX_LOG_ENTRIES),
          };
        }),
      evidenceNotes: {},
      updateEvidenceNote: (rfId, note) =>
        set(state => ({
          evidenceNotes: { ...state.evidenceNotes, [rfId]: note },
        })),
    }),
    {
      name: STORAGE_KEYS.AUDIT || 'lcx-usa-audit-store',
      storage: createJSONStorage(() => ({
        getItem: n => JSON.stringify(storage.get(n, null)),
        setItem: (n, v) => storage.set(n, JSON.parse(v as string)),
        removeItem: n => storage.remove(n),
      })),
      /**
       * The default merge is a shallow `{...current, ...persisted}`; this is that,
       * plus the mark normalisation. `merge` rather than `version` + `migrate`
       * because the stored payload carries no version today, so a migrate would run
       * for exactly one release and then stop covering the case — and the case is
       * "an entry that reaches the renderer without a mark", which is permanent.
       */
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AuditStore>;
        const merged = { ...current, ...p } as AuditStore;
        return {
          ...merged,
          auditLogs: normaliseLocalLogMarks(
            Array.isArray(merged.auditLogs) ? merged.auditLogs : current.auditLogs,
          ),
        };
      },
    }
  )
);
