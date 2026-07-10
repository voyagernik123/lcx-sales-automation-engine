import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/storage';
import type { BdFilters } from '@/types/bd';

type FilterKeys = keyof BdFilters;

interface BdStore extends BdFilters {
  loading: boolean;
  error: string | null;
  selectedLeadId: string | null;
  setFilter: (key: FilterKeys, value: BdFilters[FilterKeys]) => void;
  resetFilters: () => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  selectLead: (id: string | null) => void;
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
};

const init: BdStore = {
  ...initialFilters,
  loading: false,
  error: null,
  selectedLeadId: null,
  setFilter: (key, value) => set({ [key]: value }),
  resetFilters: () => set({ ...initialFilters, loading: false, error: null, selectedLeadId: null }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
  selectLead: (id) => set({ selectedLeadId: id }),
};

const set = (partial: Partial<BdStore>) => {
  useBdStore.setState(partial);
};

export const useBdStore = create<BdStore>()(
  persist(
    (setter) => ({
      ...init,
      setFilter: (key, value) => setter({ [key]: value }),
      resetFilters: () => setter({ ...initialFilters, loading: false, error: null, selectedLeadId: null }),
      setLoading: (v) => setter({ loading: v }),
      setError: (e) => setter({ error: e }),
      selectLead: (id) => setter({ selectedLeadId: id }),
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
      }),
    },
  ),
);
