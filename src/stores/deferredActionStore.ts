import { create } from 'zustand';

interface DeferredActionStore {
  pendingAction: (() => void) | null;
  setPendingAction: (action: (() => void) | null) => void;
  executePendingAction: () => void;
}

export const useDeferredActionStore = create<DeferredActionStore>((set, get) => ({
  pendingAction: null,
  setPendingAction: (action) => set({ pendingAction: action }),
  executePendingAction: () => {
    const { pendingAction } = get();
    if (pendingAction) {
      set({ pendingAction: null });
      pendingAction();
    }
  },
}));
