import { create } from 'zustand';

export interface SendKeepItem {
  id: string;
  name: string;
  path: string;
  size: number;
  fileType: string;
  sender: string;
  timestamp: number;
  content?: string; // for text clips or links
}

export type FilterCategory = 'all' | 'media' | 'files' | 'links' | 'notes';

interface AppState {
  isOpen: boolean;
  items: SendKeepItem[];
  activeFilter: FilterCategory;
  connectedDevice: {
    name: string;
    ip: string;
    status: string;
  };
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  addItem: (item: SendKeepItem) => void;
  removeItem: (id: string) => void;
  clearAll: () => void;
  setFilter: (filter: FilterCategory) => void;
  setConnectedDevice: (device: { name: string; ip: string; status: string }) => void;
}

export const useStore = create<AppState>((set) => ({
  isOpen: false,
  items: [],
  activeFilter: 'all',
  connectedDevice: {
    name: 'Galaxy M13',
    ip: '10.134.244.84',
    status: 'connected',
  },
  setOpen: (open) => set({ isOpen: open }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  addItem: (item) =>
    set((state) => ({
      items: [item, ...state.items.filter((i) => i.id !== item.id)],
      isOpen: true, // auto-reveal shelf on incoming item
    })),
  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((i) => i.id !== id),
    })),
  clearAll: () => set({ items: [] }),
  setFilter: (filter) => set({ activeFilter: filter }),
  setConnectedDevice: (device) => set({ connectedDevice: device }),
}));
