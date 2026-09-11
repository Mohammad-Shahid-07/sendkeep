import { create } from 'zustand';

export interface SendKeepItem {
  id: string;
  name: string;
  path: string;
  size: number;
  fileType: string;
  sender: string;
  timestamp: number;
  content?: string; // for text clips
}

interface AppState {
  isOpen: boolean;
  items: SendKeepItem[];
  activeFilter: 'all' | 'media' | 'text' | 'files';
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  addItem: (item: SendKeepItem) => void;
  removeItem: (id: string) => void;
  clearAll: () => void;
  setFilter: (filter: 'all' | 'media' | 'text' | 'files') => void;
}

export const useStore = create<AppState>((set) => ({
  isOpen: false,
  items: [
    {
      id: 'demo-1',
      name: 'SendKeep Initialized',
      path: '',
      size: 1024,
      fileType: 'text/plain',
      sender: 'System',
      timestamp: Date.now(),
      content: 'SendKeep is active and listening for your Android device on your local Wi-Fi.',
    },
  ],
  activeFilter: 'all',
  setOpen: (open) => set({ isOpen: open }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  addItem: (item) =>
    set((state) => ({
      items: [item, ...state.items.filter((i) => i.id !== item.id)],
      isOpen: true, // auto-reveal shelf on incoming item!
    })),
  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((i) => i.id !== id),
    })),
  clearAll: () => set({ items: [] }),
  setFilter: (filter) => set({ activeFilter: filter }),
}));
