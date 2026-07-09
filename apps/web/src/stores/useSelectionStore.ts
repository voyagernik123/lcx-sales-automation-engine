import { create } from 'zustand';
export const useSelectionStore = create<{ selectedNodeId: string|null; selectNode: (id:string)=>void; clearSelection: ()=>void; }>(set => ({
  selectedNodeId: null, selectNode: (id) => set({ selectedNodeId: id }), clearSelection: () => set({ selectedNodeId: null }),
}));
