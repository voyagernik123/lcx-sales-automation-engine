import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/storage';
import type { BdFilters } from '@/types/bd';
import type { SplitId } from '@/components/queue/logic';

type FilterKeys = keyof BdFilters;

interface BdStore extends BdFilters {
  loading: boolean;
  error: string | null;
  selectedLeadId: string | null;
  /** Active Work-Loop split (queue tabs; digit keys 1–4). */
  activeSplit: SplitId;
  /** Reveal snoozed rows inside the working set. */
  showSnoozed: boolean;
  setFilter: (key: FilterKeys, value: BdFilters[FilterKeys]) => void;
  /** Bulk apply (saved screens) — one render, one refetch. */
  setFilters: (patch: Partial<BdFilters>) => void;
  resetFilters: () => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  selectLead: (id: string | null) => void;
  setSplit: (split: SplitId) => void;
  setShowSnoozed: (v: boolean) => void;
}

const initialFilters: BdFilters = {
  market: null,
  minScore: 0,
  source: '',
  band: '',
  listedOnLcx: null,
  hasContact: null,
  marketRecommendation: '',
  sort: 'priority',
  order: 'desc',
  search: '',
  tier: 'tracked',
};

export const useBdStore = create<BdStore>()(
  persist(
    (setter) => ({
      ...initialFilters,
      loading: false,
      error: null,
      selectedLeadId: null,
      activeSplit: 'working',
      showSnoozed: false,
      setFilter: (key, value) => setter({ [key]: value }),
      setFilters: (patch) => setter({ ...patch }),
      resetFilters: () => setter({ ...initialFilters, loading: false, error: null, selectedLeadId: null }),
      setLoading: (v) => setter({ loading: v }),
      setError: (e) => setter({ error: e }),
      selectLead: (id) => setter({ selectedLeadId: id }),
      setSplit: (split) => setter({ activeSplit: split }),
      setShowSnoozed: (v) => setter({ showSnoozed: v }),
    }),
    {
      name: STORAGE_KEYS.BD_PIPELINE,
      storage: createJSONStorage(() => ({
        getItem: (n) => JSON.stringify(storage.get(n, null)),
        setItem: (n, v) => storage.set(n, JSON.parse(v as string)),
        removeItem: (n) => storage.remove(n),
      })),
      partialize: (state) => ({
        market: state.market,
        minScore: state.minScore,
        source: state.source,
        band: state.band,
        listedOnLcx: state.listedOnLcx,
        hasContact: state.hasContact,
        marketRecommendation: state.marketRecommendation,
        sort: state.sort,
        order: state.order,
        search: state.search,
        activeSplit: state.activeSplit,
      }),
    },
  ),
);
