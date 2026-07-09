import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/storage';
import { safeHarborBus } from '@/lib/eventBus';
import type { Status, Phase, Confidence, VerificationStatus, SourceAuthority } from '@/types/ontology';

interface FilterState {
  selectedStatuses: Status[];
  selectedPhases: Phase[];
  selectedDomains: string[];
  selectedConfidences: Confidence[];
  selectedVerificationStatuses: VerificationStatus[];
  selectedSourceAuthorities: SourceAuthority[];
  searchQuery: string;
  clarityEnacted: boolean;
  spdiEquivalence: boolean;
  micaPassport: boolean;
}

interface FilterStore extends FilterState {
  setFilter: (key: 'searchQuery', value: string) => void;
  toggleArrayFilter: (key: 'selectedStatuses' | 'selectedPhases' | 'selectedDomains', item: string) => void;
  toggleClarityEnacted: () => void;
  toggleFilterStoreField: (key: 'clarityEnacted' | 'spdiEquivalence' | 'micaPassport') => void;
  resetFilters: () => void;
}

const init: FilterState = {
  selectedStatuses: [],
  selectedPhases: [],
  selectedDomains: [],
  selectedConfidences: [],
  selectedVerificationStatuses: [],
  selectedSourceAuthorities: [],
  searchQuery: '',
  clarityEnacted: false,
  spdiEquivalence: false,
  micaPassport: false,
};

export const useFilterStore = create<FilterStore>()(
  persist(
    (set, get) => ({
      ...init,
      setFilter: (key, value) => set({ [key]: value }),
      toggleArrayFilter: (key, item) => {
        const current = get()[key] as string[];
        if (current.includes(item)) {
          set({ [key]: current.filter((i: string) => i !== item) });
        } else {
          set({ [key]: [...current, item] });
        }
      },
      toggleClarityEnacted: () =>
        set(s => {
          const next = !s.clarityEnacted;
          safeHarborBus.emit('clarityEnacted');
          return { clarityEnacted: next };
        }),
      toggleFilterStoreField: key =>
        set(s => {
          const next = !s[key];
          const eventMap: Record<string, string> = {
            clarityEnacted: 'clarityEnacted',
            spdiEquivalence: 'spdiEquivalence',
            micaPassport: 'micaPassport',
          };
          safeHarborBus.emit(eventMap[key] || key);
          return { [key]: next };
        }),
      resetFilters: () => set({ ...init }),
    }),
    {
      name: STORAGE_KEYS.FILTERS,
      storage: createJSONStorage(() => ({
        getItem: n => JSON.stringify(storage.get(n, null)),
        setItem: (n, v) => storage.set(n, JSON.parse(v as string)),
        removeItem: n => storage.remove(n),
      })),
    }
  )
);
