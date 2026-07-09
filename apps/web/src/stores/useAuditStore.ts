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

export function computeLogHash(timestamp: string, category: string, message: string, prevHash: string): string {
  const data = `${timestamp}|${category}|${message}|${prevHash}`;
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
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
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
          const prevHash = prevLog?.hash || AUDIT.GENESIS_HASH;
          const hash = computeLogHash(timestamp, 'Audit', logMsg, prevHash);
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
          hash: AUDIT.GENESIS_HASH,
        },
      ],
      addAuditLog: (message, category = 'System') =>
        set(state => {
          const timestamp = new Date().toLocaleTimeString();
          const prevLog = state.auditLogs[0];
          const prevHash = prevLog?.hash || AUDIT.GENESIS_HASH;
          const hash = computeLogHash(timestamp, category, message, prevHash);
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
          const prevHash = prevLog?.hash || AUDIT.GENESIS_HASH;
          const hash = computeLogHash(timestamp, 'Architecture', logMsg, prevHash);
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
          const prevHash = prevLog?.hash || AUDIT.GENESIS_HASH;
          const hash = computeLogHash(timestamp, 'System', logMsg, prevHash);
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
          const prevHash = prevLog?.hash || AUDIT.GENESIS_HASH;
          const hash = computeLogHash(timestamp, 'Audit', logMsg, prevHash);
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
          const prevHash = prevLog?.hash || AUDIT.GENESIS_HASH;
          const hash = computeLogHash(timestamp, 'Scenario', logMsg, prevHash);
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
    }
  )
);
