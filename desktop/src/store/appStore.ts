import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

let saveTimer: any = null;
const debouncedSave = (items: SendKeepItem[]) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    invoke('save_persisted_items', { jsonData: JSON.stringify(items) }).catch((err) => {
      console.warn('Failed to persist items to disk:', err);
    });
  }, 400);
};

let lastInternalCopyTime = 0;
export const markInternalCopy = () => {
  lastInternalCopyTime = Date.now();
};

export interface SendKeepItem {
  id: string;
  name: string;
  path: string;
  size: number;
  fileType: string;
  sender: string;
  source: 'device' | 'clipboard';
  timestamp: number;
  content?: string;
  previewUrl?: string;
  pinned?: boolean;
  hitCount?: number;
  isStack?: boolean;
  isExpanded?: boolean;
  bundleItems?: SendKeepItem[];
}

export type FilterCategory = 'all' | 'media' | 'files' | 'links' | 'notes';
export type ActiveSource = 'device' | 'clipboard' | 'unified';

export interface TrustedDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  model?: string;
  deviceType?: string;
  fingerprint?: string;
  status: 'online' | 'offline';
  lastSeen?: number;
}

export interface DiscoveredDevice {
  name: string;
  ip: string;
  port: number;
  model?: string;
  deviceType?: string;
  fingerprint?: string;
  status: 'online' | 'offline';
}

export interface IncomingPairRequest {
  requestId: string;
  alias: string;
  deviceModel?: string;
  deviceType?: string;
  fingerprint: string;
  ip: string;
  port: number;
  pin?: string;
}

export interface TransferProgress {
  sessionId: string;
  fileId: string;
  fileName: string;
  bytesCurrent: number;
  bytesTotal: number;
  speedBytesPerSec: number;
  direction: 'send' | 'receive';
  peerAlias: string;
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
  localFilePath?: string;
  errorMessage?: string;
  timestamp: number;
}

const TRUSTED_DEVICES_KEY = 'sendkeep_trusted_devices_v2';

let cachedDeviceFingerprint = 'sk_win_desktop';

function loadTrustedDevicesFromStorage(): TrustedDevice[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TRUSTED_DEVICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const deduped: TrustedDevice[] = [];
    for (const d of parsed) {
      const key = d.fingerprint || d.ip;
      if (key && !seen.has(key)) {
        seen.add(key);
        // On startup, initial state is offline until verified by probe or discovery
        deduped.push({ ...d, status: 'offline' });
      }
    }
    return deduped;
  } catch {
    return [];
  }
}

function saveTrustedDevicesToStorage(devices: TrustedDevice[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TRUSTED_DEVICES_KEY, JSON.stringify(devices));
  } catch {}
}

export async function probeDeviceHttp(
  ip: string,
  port = 53317
): Promise<{ name: string; model?: string; deviceType?: string; port: number; fingerprint?: string } | null> {
  const cleanIp = ip.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!cleanIp) return null;

  // 1. Try native Rust probe first (bypasses browser CORS & fast timeout)
  try {
    const probed = await invoke<any>('probe_peer', { ip: cleanIp, port });
    if (probed) {
      return {
        name: probed.alias || probed.name || cleanIp,
        model: probed.deviceModel || probed.device_model || probed.model || 'Mobile Device',
        deviceType: probed.deviceType || probed.device_type || 'mobile',
        fingerprint: probed.fingerprint,
        port: probed.port || port,
      };
    }
  } catch {}

  // 2. Webview fetch fallback
  const endpoints = [
    `http://${cleanIp}:${port}/api/sendkeep/v1/info`,
    `http://${cleanIp}:${port}/api/localsend/v2/info`,
  ];

  for (const url of endpoints) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2200);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        return {
          name: data.alias || data.name || cleanIp,
          model: data.deviceModel || data.device_model || data.model || 'Mobile Device',
          deviceType: data.deviceType || data.device_type || 'mobile',
          fingerprint: data.fingerprint,
          port: data.port || port,
        };
      }
    } catch {
      // Continue to next fallback endpoint
    }
  }
  return null;
}

interface AppState {
  isOpen: boolean;
  activeSource: ActiveSource;
  activeFilter: FilterCategory;
  searchQuery: string;
  items: SendKeepItem[];
  previewItemId: string | null;
  trustedDevices: TrustedDevice[];
  discoveredDevices: DiscoveredDevice[];
  connectedDevice: TrustedDevice | null;
  incomingPairRequest: IncomingPairRequest | null;
  clipboardSettings: {
    incognito: boolean;
    autoDeleteHours: number;
  };
  activeDraggingId: string | null;
  setActiveDraggingId: (id: string | null) => void;
  activeTransfer: TransferProgress | null;
  setActiveTransfer: (transfer: TransferProgress | null) => void;
  cancelTransfer: (sessionId?: string) => Promise<void>;
  beamItemToDevice: (item: SendKeepItem, rawBytes?: Uint8Array) => Promise<boolean>;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setActiveSource: (source: ActiveSource) => void;
  setFilter: (filter: FilterCategory) => void;
  setSearchQuery: (query: string) => void;
  setPreviewItemId: (id: string | null) => void;
  addItem: (item: SendKeepItem) => void;
  removeItem: (id: string) => void;
  togglePin: (id: string) => void;
  toggleStackExpand: (id: string) => void;
  splitStack: (stackId: string, subItemId: string) => void;
  mergeItems: (sourceId: string, targetId: string) => void;
  clearAll: () => void;
  clearTimeWindow: (hours: number) => void;
  clearUnpinned: () => void;
  toggleIncognito: () => void;
  addTrustedDevice: (device: { name: string; ip: string; port?: number; model?: string; fingerprint?: string }) => TrustedDevice;
  removeTrustedDevice: (id: string) => void;
  selectTargetDevice: (device: TrustedDevice | null) => void;
  addDiscoveredDevice: (device: DiscoveredDevice) => void;
  isPairModalOpen: boolean;
  setPairModalOpen: (open: boolean) => void;
  isSettingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  isWebShareOpen: boolean;
  setWebShareOpen: (open: boolean) => void;
  webShareInfo: { ip: string; port: number; url: string; alias: string } | null;
  fetchWebShareInfo: () => Promise<{ ip: string; port: number; url: string; alias: string }>;
  syncWebShareItems: () => Promise<void>;
  isNearEdge: boolean;
  setIsNearEdge: (near: boolean) => void;
  settings: DesktopSettingsState;
  updateSettings: (partial: Partial<DesktopSettingsState>) => Promise<void>;
  pickSaveDirectory: () => Promise<string | null>;
  setIncomingPairRequest: (req: IncomingPairRequest | null) => void;
  respondPairRequest: (requestId: string, accept: boolean) => Promise<void>;
  isSelectMode: boolean;
  selectedItemIds: string[];
  toggleSelectMode: () => void;
  setSelectMode: (open: boolean) => void;
  toggleSelectItem: (id: string) => void;
  selectAllItems: () => void;
  clearSelection: () => void;
  bundleSelectedItems: () => void;
  copySelectedItems: () => Promise<boolean>;
  deleteSelectedItems: () => void;
  beamSelectedItems: () => Promise<void>;
  ungroupBundle: (bundleId: string) => void;
  markInternalCopy: () => void;
  probeAllTrusted: () => Promise<void>;
  pairDeviceByIp: (ip: string, port?: number) => Promise<TrustedDevice | null>;
}

export interface DesktopSettingsState {
  saveDirectory: string;
  deviceAlias: string;
  soundEffectsEnabled: boolean;
  autoAcceptTrusted: boolean;
  collisionStrategy: string; // 'rename' | 'overwrite' | 'skip'
  requirePin: boolean;
  securityPin?: string;
  contextMenuEnabled?: boolean;
  edgeTriggerEnabled?: boolean;
  showEdgeHandle?: boolean;
}

const INITIAL_ITEMS: SendKeepItem[] = [];
const INITIAL_TRUSTED = loadTrustedDevicesFromStorage();

export const useStore = create<AppState>((set, get) => ({
  isOpen: false,
  isPairModalOpen: false,
  setPairModalOpen: (open) => {
    set({ isPairModalOpen: open });
    if (open) {
      invoke('set_interactive', { interactive: true });
    } else if (!get().isOpen && !get().isSettingsOpen && !get().isWebShareOpen) {
      invoke('set_interactive', { interactive: false });
    }
  },
  isSettingsOpen: false,
  setSettingsOpen: (open) => {
    set({ isSettingsOpen: open });
    if (open) {
      invoke('set_interactive', { interactive: true });
    } else if (!get().isOpen && !get().isPairModalOpen && !get().isWebShareOpen) {
      invoke('set_interactive', { interactive: false });
    }
  },
  isWebShareOpen: false,
  setWebShareOpen: (open) => {
    set({ isWebShareOpen: open });
    if (open) {
      invoke('set_interactive', { interactive: true });
      get().fetchWebShareInfo();
      get().syncWebShareItems();
    } else if (!get().isOpen && !get().isSettingsOpen && !get().isPairModalOpen) {
      invoke('set_interactive', { interactive: false });
    }
  },
  webShareInfo: null,
  fetchWebShareInfo: async () => {
    try {
      const info = await invoke<{ ip: string; port: number; url: string; alias: string }>('get_web_share_info');
      set({ webShareInfo: info });
      return info;
    } catch (e) {
      console.warn('Failed to fetch web share info:', e);
      return { ip: '127.0.0.1', port: 53317, url: 'http://127.0.0.1:53317/web', alias: 'SendKeep' };
    }
  },
  syncWebShareItems: async () => {
    try {
      const currentItems = get().items.filter((i) => i.path && i.path.trim().length > 0);
      const payload = currentItems.map((i) => ({
        id: i.id,
        name: i.name,
        path: i.path,
        size: i.size,
        fileType: i.fileType || 'file',
      }));
      await invoke('sync_web_share_files', { files: payload });
    } catch (e) {
      console.warn('Failed to sync web share files:', e);
    }
  },
  isNearEdge: false,
  setIsNearEdge: (near: boolean) => set({ isNearEdge: near }),
  settings: {
    saveDirectory: '',
    deviceAlias: '',
    soundEffectsEnabled: true,
    autoAcceptTrusted: true,
    collisionStrategy: 'rename',
    requirePin: false,
    securityPin: '',
    contextMenuEnabled: false,
    edgeTriggerEnabled: true,
    showEdgeHandle: true,
  },
  updateSettings: async (partial) => {
    const updated = { ...get().settings, ...partial };
    set({ settings: updated });
    try {
      if (partial.contextMenuEnabled !== undefined) {
        await invoke('set_windows_context_menu', { enabled: partial.contextMenuEnabled });
      }
      await invoke('update_desktop_settings', { settings: updated });
    } catch (e) {
      console.warn('[Settings] Failed to save settings:', e);
    }
  },
  pickSaveDirectory: async () => {
    try {
      const chosen = await invoke<string>('pick_save_directory');
      if (chosen) {
        set((state) => ({ settings: { ...state.settings, saveDirectory: chosen } }));
        return chosen;
      }
    } catch (err) {
      console.warn('[Settings] Folder pick cancelled or failed:', err);
    }
    return null;
  },
  incomingPairRequest: null,
  setIncomingPairRequest: (req) => set({ incomingPairRequest: req }),
  activeSource: 'clipboard',
  activeFilter: 'all',
  searchQuery: '',
  items: INITIAL_ITEMS,
  previewItemId: null,
  trustedDevices: INITIAL_TRUSTED,
  discoveredDevices: [],
  connectedDevice: INITIAL_TRUSTED[0] || null,
  activeTransfer: null,
  setActiveTransfer: (transfer) => set({ activeTransfer: transfer }),
  cancelTransfer: async (sessionId?: string) => {
    const active = get().activeTransfer;
    const targetSessionId = sessionId || active?.sessionId;
    if (targetSessionId) {
      try {
        await invoke('cancel_transfer', { sessionId: targetSessionId });
      } catch (e) {
        console.warn('[Transfer] Cancel invoke error:', e);
      }
    }
    set({
      activeTransfer: active
        ? { ...active, status: 'cancelled', speedBytesPerSec: 0 }
        : null,
    });
    setTimeout(() => {
      const curr = get().activeTransfer;
      if (curr && curr.sessionId === targetSessionId && curr.status === 'cancelled') {
        set({ activeTransfer: null });
      }
    }, 2500);
  },
  clipboardSettings: {
    incognito: false,
    autoDeleteHours: 0,
  },
  setOpen: (open) => {
    set({ isOpen: open });
    if (open) {
      invoke('set_interactive', { interactive: true }).catch(() => {});
    } else if (!get().isSettingsOpen && !get().isPairModalOpen && !get().isWebShareOpen) {
      invoke('set_interactive', { interactive: false }).catch(() => {});
    }
  },
  toggleOpen: () => {
    const next = !get().isOpen;
    get().setOpen(next);
  },
  setActiveSource: (source) => set({ activeSource: source }),
  setFilter: (filter) => set({ activeFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setPreviewItemId: (id) => set({ previewItemId: id }),

  addItem: (item) =>
    set((state) => {
      const normalizedSource =
        item.source ||
        (item.sender === 'Windows Clipboard' ? 'clipboard' : 'device');
      const normalizedItem: SendKeepItem = {
        ...item,
        source: normalizedSource,
      };

      // Check for deduplication against existing items
      const isRecentInternalCopy = Date.now() - lastInternalCopyTime < 2500;
      const existingIndex = state.items.findIndex((existing) => {
        if (existing.id === item.id) return true;
        if (item.path && existing.path && item.path.toLowerCase() === existing.path.toLowerCase()) return true;
        if (item.content && existing.content && item.content.trim() === existing.content.trim()) return true;
        if (item.name && existing.name === item.name && item.size && existing.size === item.size) return true;
        return false;
      });

      if (existingIndex !== -1) {
        // Bump existing item and update timestamp without creating a duplicate card
        const existing = state.items[existingIndex];
        const updatedExisting: SendKeepItem = {
          ...existing,
          timestamp: Date.now(),
          hitCount: (existing.hitCount || 1) + 1,
        };
        const rest = state.items.filter((_, idx) => idx !== existingIndex);
        const updated = [updatedExisting, ...rest];
        debouncedSave(updated);
        return { items: updated };
      }

      // If it's within internal copy window and was not matched, skip duplicate capture of SendKeep's own emission
      if (isRecentInternalCopy && item.source === 'clipboard') {
        return state;
      }

      const updated = [normalizedItem, ...state.items];
      debouncedSave(updated);

      return {
        items: updated,
      };
    }),

  removeItem: (id) =>
    set((state) => {
      const updated = state.items.filter((i) => i.id !== id);
      debouncedSave(updated);
      return { items: updated };
    }),

  togglePin: (id) =>
    set((state) => {
      const updated = state.items.map((i) => (i.id === id ? { ...i, pinned: !i.pinned } : i));
      debouncedSave(updated);
      return { items: updated };
    }),

  toggleStackExpand: (id) =>
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, isExpanded: !i.isExpanded } : i)),
    })),

  splitStack: (stackId, subItemId) =>
    set((state) => {
      const stack = state.items.find((i) => i.id === stackId);
      if (!stack || !stack.bundleItems) return state;

      const subItem = stack.bundleItems.find((s) => s.id === subItemId);
      if (!subItem) return state;

      const remainingSubItems = stack.bundleItems.filter((s) => s.id !== subItemId);

      let updatedItems: SendKeepItem[];
      const extracted: SendKeepItem = {
        ...subItem,
        isStack: false,
        isExpanded: false,
      };

      if (remainingSubItems.length <= 1 && remainingSubItems[0]) {
        const lastRemaining: SendKeepItem = {
          ...remainingSubItems[0],
          isStack: false,
          isExpanded: false,
        };
        updatedItems = state.items
          .filter((i) => i.id !== stackId)
          .concat([extracted, lastRemaining]);
      } else {
        const newTotalSize = remainingSubItems.reduce((acc, it) => acc + (it.size || 0), 0);
        updatedItems = state.items.map((i) =>
          i.id === stackId
            ? {
                ...i,
                bundleItems: remainingSubItems,
                size: newTotalSize,
                name: `Bundle (${remainingSubItems.length} items)`,
              }
            : i
        );
        updatedItems = [extracted, ...updatedItems];
      }

      debouncedSave(updatedItems);
      return { items: updatedItems };
    }),

  ungroupBundle: (bundleId) =>
    set((state) => {
      const bundle = state.items.find((i) => i.id === bundleId);
      if (!bundle || !bundle.bundleItems || bundle.bundleItems.length === 0) return state;

      const unpacked = bundle.bundleItems.map((item) => ({
        ...item,
        isStack: false,
        isExpanded: false,
      }));

      const updated = state.items.flatMap((i) => (i.id === bundleId ? unpacked : [i]));
      debouncedSave(updated);
      return { items: updated };
    }),

  isSelectMode: false,
  selectedItemIds: [],
  toggleSelectMode: () =>
    set((state) => ({
      isSelectMode: !state.isSelectMode,
      selectedItemIds: !state.isSelectMode ? state.selectedItemIds : [],
    })),
  setSelectMode: (open: boolean) =>
    set({
      isSelectMode: open,
      selectedItemIds: open ? get().selectedItemIds : [],
    }),
  toggleSelectItem: (id: string) =>
    set((state) => {
      const exists = state.selectedItemIds.includes(id);
      const updated = exists
        ? state.selectedItemIds.filter((x) => x !== id)
        : [...state.selectedItemIds, id];
      return {
        selectedItemIds: updated,
        isSelectMode: updated.length > 0 ? true : state.isSelectMode,
      };
    }),
  selectAllItems: () =>
    set((state) => ({
      selectedItemIds: state.items.map((i) => i.id),
      isSelectMode: true,
    })),
  clearSelection: () =>
    set({
      selectedItemIds: [],
      isSelectMode: false,
    }),
  bundleSelectedItems: () => {
    const { items, selectedItemIds } = get();
    if (selectedItemIds.length < 2) return;

    const selected = items.filter((i) => selectedItemIds.includes(i.id));
    const remaining = items.filter((i) => !selectedItemIds.includes(i.id));

    const flattened: SendKeepItem[] = [];
    for (const it of selected) {
      if (it.isStack && it.bundleItems) {
        flattened.push(...it.bundleItems);
      } else {
        flattened.push(it);
      }
    }

    const totalSize = flattened.reduce((acc, it) => acc + (it.size || 0), 0);
    const bundleCard: SendKeepItem = {
      id: `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `Files Bundle (${flattened.length} items)`,
      path: flattened[0]?.path || '',
      size: totalSize,
      fileType: 'bundle/stack',
      sender: 'Bundle',
      source: 'device',
      timestamp: Date.now(),
      isStack: true,
      isExpanded: true,
      bundleItems: flattened,
      pinned: selected.some((i) => i.pinned),
    };

    const updated = [bundleCard, ...remaining];
    debouncedSave(updated);
    set({
      items: updated,
      selectedItemIds: [],
      isSelectMode: false,
    });
  },
  copySelectedItems: async () => {
    const { items, selectedItemIds } = get();
    if (selectedItemIds.length === 0) return false;

    const selected = items.filter((i) => selectedItemIds.includes(i.id));
    const allPaths: string[] = [];
    const textPieces: string[] = [];

    for (const item of selected) {
      if (item.isStack && item.bundleItems) {
        for (const sub of item.bundleItems) {
          if (sub.path) allPaths.push(sub.path);
          else if (sub.content) textPieces.push(sub.content);
        }
      } else {
        if (item.path) allPaths.push(item.path);
        else if (item.content) textPieces.push(item.content);
      }
    }

    markInternalCopy();

    let copied = false;
    if (allPaths.length > 0) {
      try {
        await invoke('copy_files_native', { paths: allPaths });
        copied = true;
      } catch (err) {
        console.warn('Native copy files failed:', err);
      }
    }

    if (textPieces.length > 0) {
      try {
        await navigator.clipboard.writeText(textPieces.join('\n\n'));
        copied = true;
      } catch (err) {
        console.warn('Clipboard writeText failed:', err);
      }
    }

    return copied;
  },
  deleteSelectedItems: () => {
    const { selectedItemIds } = get();
    if (selectedItemIds.length === 0) return;
    set((state) => {
      const updated = state.items.filter((i) => !selectedItemIds.includes(i.id));
      debouncedSave(updated);
      return {
        items: updated,
        selectedItemIds: [],
        isSelectMode: false,
      };
    });
  },
  beamSelectedItems: async () => {
    const { items, selectedItemIds, beamItemToDevice } = get();
    const selected = items.filter((i) => selectedItemIds.includes(i.id));
    for (const it of selected) {
      if (it.isStack && it.bundleItems) {
        for (const sub of it.bundleItems) {
          await beamItemToDevice(sub);
        }
      } else {
        await beamItemToDevice(it);
      }
    }
    set({ selectedItemIds: [], isSelectMode: false });
  },
  markInternalCopy: () => {
    markInternalCopy();
  },

  mergeItems: (sourceId, targetId) =>
    set((state) => {
      const sourceItem = state.items.find((i) => i.id === sourceId);
      const targetItem = state.items.find((i) => i.id === targetId);
      if (!sourceItem || !targetItem || sourceId === targetId) return state;

      const baseItems = targetItem.bundleItems || [targetItem];
      const newItems = sourceItem.bundleItems || [sourceItem];
      const mergedBundle = [...baseItems, ...newItems];

      const stackedCard: SendKeepItem = {
        id: targetItem.id,
        name: `Stack (${mergedBundle.length} items)`,
        path: targetItem.path || sourceItem.path,
        size: targetItem.size + sourceItem.size,
        fileType: 'bundle/stack',
        sender: targetItem.sender,
        source: targetItem.source,
        timestamp: Date.now(),
        isStack: true,
        isExpanded: false,
        bundleItems: mergedBundle,
        pinned: targetItem.pinned || sourceItem.pinned,
      };

      const remaining = state.items.filter((i) => i.id !== sourceId && i.id !== targetId);
      const updated = [stackedCard, ...remaining];
      debouncedSave(updated);
      return { items: updated };
    }),

  clearAll: () =>
    set(() => {
      debouncedSave([]);
      return { items: [], previewItemId: null };
    }),

  clearTimeWindow: (hours) =>
    set((state) => {
      const cutoff = Date.now() - hours * 60 * 60 * 1000;
      const updated = state.items.filter((i) => i.pinned || i.timestamp > cutoff);
      debouncedSave(updated);
      return { items: updated };
    }),

  clearUnpinned: () =>
    set((state) => {
      const updated = state.items.filter((i) => i.pinned);
      debouncedSave(updated);
      return { items: updated };
    }),

  toggleIncognito: () =>
    set((state) => ({
      clipboardSettings: {
        ...state.clipboardSettings,
        incognito: !state.clipboardSettings.incognito,
      },
    })),

  // LocalSend-Standard Trusted Devices Management
  addTrustedDevice: (device) => {
    const state = get();
    const port = device.port || 53317;
    const id = device.fingerprint ? `dev-${device.fingerprint}` : `dev-${device.ip}-${port}`;
    const existing = state.trustedDevices.find(
      (d) => (device.fingerprint && d.fingerprint === device.fingerprint) || d.id === id || d.ip === device.ip
    );

    const newDevice: TrustedDevice = {
      id: existing ? existing.id : id,
      name: device.name,
      ip: device.ip,
      port,
      model: device.model || 'Mobile Device',
      fingerprint: device.fingerprint || existing?.fingerprint,
      status: 'online',
      lastSeen: Date.now(),
    };

    const updated = existing
      ? state.trustedDevices.map((d) => (d.id === existing.id ? newDevice : d))
      : [...state.trustedDevices, newDevice];

    saveTrustedDevicesToStorage(updated);
    set({
      trustedDevices: updated,
      connectedDevice: newDevice,
      activeSource: 'device',
    });
    return newDevice;
  },

  removeTrustedDevice: (id) => {
    const state = get();
    const updated = state.trustedDevices.filter((d) => d.id !== id);
    saveTrustedDevicesToStorage(updated);
    const newConnected = state.connectedDevice?.id === id ? updated[0] || null : state.connectedDevice;
    set({
      trustedDevices: updated,
      connectedDevice: newConnected,
      activeSource: newConnected ? state.activeSource : 'clipboard',
    });
  },

  selectTargetDevice: (device) => {
    set({
      connectedDevice: device,
      activeSource: device ? 'device' : 'clipboard',
    });
  },

  respondPairRequest: async (requestId, accept) => {
    const req = get().incomingPairRequest;
    try {
      await invoke('respond_pairing_request', { requestId, accept });
    } catch (err) {
      console.warn('[Pair] Failed to invoke respond_pairing_request:', err);
    }
    if (req && accept) {
      get().addTrustedDevice({
        name: req.alias,
        ip: req.ip,
        port: req.port,
        model: req.deviceModel,
        fingerprint: req.fingerprint,
      });
    }
    set({ incomingPairRequest: null });
  },

  addDiscoveredDevice: (device) => {
    set((state) => {
      // Deduplicate: remove any existing entry matching fingerprint or IP
      const existing = state.discoveredDevices.filter((d) => {
        if (device.fingerprint && d.fingerprint && d.fingerprint === device.fingerprint) return false;
        if (d.ip === device.ip) return false;
        return true;
      });

      // Self-healing IP sync: automatically update trusted device if fingerprint or IP matches
      let trustedUpdated = false;
      const updatedTrusted = state.trustedDevices.map((td) => {
        if (device.fingerprint && td.fingerprint === device.fingerprint) {
          trustedUpdated = true;
          return {
            ...td,
            ip: device.ip,
            port: device.port || td.port,
            status: 'online' as const,
            name: device.name || td.name,
            model: device.model || td.model,
            lastSeen: Date.now(),
          };
        }
        if (td.ip === device.ip) {
          trustedUpdated = true;
          return {
            ...td,
            status: 'online' as const,
            name: device.name || td.name,
            model: device.model || td.model,
            fingerprint: device.fingerprint || td.fingerprint,
            lastSeen: Date.now(),
          };
        }
        return td;
      });

      if (trustedUpdated) {
        saveTrustedDevicesToStorage(updatedTrusted);
      }

      let updatedConnected = state.connectedDevice;
      if (state.connectedDevice) {
        const match = updatedTrusted.find(
          (d) =>
            (device.fingerprint && d.fingerprint === state.connectedDevice?.fingerprint) ||
            d.id === state.connectedDevice?.id ||
            d.ip === state.connectedDevice?.ip
        );
        if (match) updatedConnected = match;
      }

      return {
        discoveredDevices: [...existing, device],
        trustedDevices: updatedTrusted,
        connectedDevice: updatedConnected,
      };
    });
  },

  probeAllTrusted: async () => {
    const { trustedDevices, connectedDevice } = get();
    if (trustedDevices.length === 0) return;

    const updated = await Promise.all(
      trustedDevices.map(async (dev) => {
        const probed = await probeDeviceHttp(dev.ip, dev.port);
        if (probed) {
          return {
            ...dev,
            name: probed.name || dev.name,
            model: probed.model || dev.model,
            fingerprint: probed.fingerprint || dev.fingerprint,
            status: 'online' as const,
            lastSeen: Date.now(),
          };
        } else {
          return {
            ...dev,
            status: 'offline' as const,
          };
        }
      })
    );

    saveTrustedDevicesToStorage(updated);
    let updatedConnected = connectedDevice;
    if (connectedDevice) {
      const match = updated.find((d) => d.id === connectedDevice.id || d.ip === connectedDevice.ip);
      if (match) updatedConnected = match;
    }

    set({
      trustedDevices: updated,
      connectedDevice: updatedConnected,
    });
  },

  pairDeviceByIp: async (ip, port = 53317) => {
    const cleanIp = ip.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const probed = await probeDeviceHttp(cleanIp, port);
    if (!probed) return null;

    // Perform mutual pairing handshake via native Rust command to bypass browser CORS
    try {
      const resp = await invoke<any>('send_pair_request', {
        targetIp: cleanIp,
        port: probed.port || port,
        pin: null,
      });
      if (resp && resp.status === 'declined') {
        return null;
      }
    } catch (pairErr) {
      console.warn('[Pair] Native send_pair_request failed or timed out:', pairErr);
      return null;
    }

    const trusted = get().addTrustedDevice({
      name: probed.name,
      ip: cleanIp,
      port: probed.port || port,
      model: probed.model,
      fingerprint: probed.fingerprint,
    });
    return trusted;
  },

  activeDraggingId: null,
  setActiveDraggingId: (id) => set({ activeDraggingId: id }),

  beamItemToDevice: async (item, _rawBytes) => {
    const { connectedDevice, trustedDevices, discoveredDevices } = get();
    // Resolve target: prefer connectedDevice if online, or any online trusted/discovered device
    let target = connectedDevice && connectedDevice.status === 'online' ? connectedDevice : null;
    if (!target) {
      target = trustedDevices.find((d) => d.status === 'online') || null;
    }
    if (!target && connectedDevice?.ip) {
      target = connectedDevice;
    }
    if (!target) {
      const disc = discoveredDevices.find((d) => d.ip);
      if (disc) {
        target = {
          id: disc.ip,
          name: disc.name,
          ip: disc.ip,
          port: disc.port,
          status: 'online',
        };
      }
    }

    if (!target || !target.ip) {
      console.warn('[Beam] No online destination device selected or found');
      return false;
    }
    const targetIp = target.ip;
    const port = target.port || 53317;

    try {
      let fileName = item.name || 'file';
      let fileSize = item.size || 0;
      let fileType = item.fileType || 'application/octet-stream';
      let localPath = item.path || '';

      // If item has no physical path (e.g. plain text note), stage it to a temporary file
      if (!localPath) {
        try {
          const contentToStage = item.content || item.name || 'Note';
          const defaultName = item.name && item.name.includes('.') ? item.name : `${item.name || 'Note'}.txt`;
          localPath = await invoke<string>('stage_drag_text', {
            content: contentToStage,
            name: defaultName,
          });
          fileName = defaultName;
          fileType = 'text/plain';
        } catch (stageErr) {
          console.warn('[Beam] Failed staging text file:', stageErr);
          return false;
        }
      }

      // Query exact file size from disk if unknown
      if (!fileSize && localPath) {
        try {
          const info = await invoke<{ size: number }>('get_file_info', { path: localPath });
          if (info && info.size) fileSize = info.size;
        } catch {}
      }

      // Ensure fingerprint is resolved
      let fp = cachedDeviceFingerprint;
      if (!fp || fp === 'sk_win_desktop') {
        try {
          const fetched = await invoke<string>('get_device_fingerprint');
          if (fetched) {
            fp = fetched;
            cachedDeviceFingerprint = fetched;
          }
        } catch {}
      }

      // If item is a folder and doesn't have bundleItems yet, scan it on demand
      if ((!item.bundleItems || item.bundleItems.length === 0) && localPath) {
        try {
          const info = await invoke<{ isDirectory?: boolean; fileType?: string }>('get_file_info', { path: localPath });
          if (info && (info.isDirectory || info.fileType === 'folder')) {
            const folderFiles = await invoke<Array<{
              name: string;
              relativePath: string;
              fullPath: string;
              size: number;
              fileType: string;
            }>>('collect_folder_files', { folderPath: localPath });
            if (folderFiles && folderFiles.length > 0) {
              item.bundleItems = folderFiles.map((ff, idx) => ({
                id: `sub-${Date.now()}-${idx}`,
                name: ff.relativePath,
                path: ff.fullPath,
                size: ff.size,
                fileType: ff.fileType,
                sender: 'You',
                source: 'device' as const,
                timestamp: Date.now(),
              }));
            }
          }
        } catch {}
      }

      interface FileToBeam {
        fileId: string;
        fileName: string;
        fileSize: number;
        fileType: string;
        localPath: string;
      }

      const filesToBeam: FileToBeam[] = [];

      if (item.bundleItems && item.bundleItems.length > 0) {
        for (let i = 0; i < item.bundleItems.length; i++) {
          const sub = item.bundleItems[i];
          const bId = `beam-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`;
          filesToBeam.push({
            fileId: bId,
            fileName: sub.name, // contains relative path e.g. "MyFolder/sub/file.txt"
            fileSize: sub.size || 0,
            fileType: sub.fileType || 'application/octet-stream',
            localPath: sub.path || '',
          });
        }
      } else {
        filesToBeam.push({
          fileId: 'beam-' + Date.now(),
          fileName,
          fileSize,
          fileType,
          localPath,
        });
      }

      const filesMap: Record<string, { id: string; fileName: string; size: number; fileType: string }> = {};
      for (const f of filesToBeam) {
        filesMap[f.fileId] = {
          id: f.fileId,
          fileName: f.fileName,
          size: f.fileSize,
          fileType: f.fileType,
        };
      }

      const payload = {
        info: {
          alias: get().settings.deviceAlias || 'Windows PC',
          version: '2.1',
          deviceModel: 'Windows PC',
          deviceType: 'desktop',
          fingerprint: fp,
          port: 53317,
          protocol: 'http',
          download: false,
        },
        files: filesMap,
      };

      // 1. Prepare upload - Try SendKeep v1, then LocalSend v2
      let prepareUrl = `http://${targetIp}:${port}/api/sendkeep/v1/prepare-upload`;
      let uploadApiPath = '/api/sendkeep/v1/upload';

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      let prepareRes = await fetch(prepareUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      }).catch(() => null);
      clearTimeout(timer);

      if (!prepareRes || !prepareRes.ok) {
        prepareUrl = `http://${targetIp}:${port}/api/localsend/v2/prepare-upload`;
        uploadApiPath = '/api/localsend/v2/upload';
        const ctrl2 = new AbortController();
        const timer2 = setTimeout(() => ctrl2.abort(), 10000);
        prepareRes = await fetch(prepareUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl2.signal,
        }).catch(() => null);
        clearTimeout(timer2);
      }

      if (!prepareRes || !prepareRes.ok) {
        console.warn('[Beam] Prepare-upload failed with HTTP', prepareRes?.status);
        return false;
      }

      const session = await prepareRes.json();

      // 2. Stream all binary files natively in Rust (zero-copy 64KB chunks directly from disk to network)
      let allSucceeded = true;
      for (const f of filesToBeam) {
        const token = session.files?.[f.fileId];
        if (!token) continue;
        try {
          await invoke('stream_file_to_peer', {
            targetIp,
            port,
            apiPath: uploadApiPath,
            sessionId: session.sessionId,
            fileId: f.fileId,
            token,
            filePath: f.localPath,
            fileName: f.fileName,
            peerAlias: target.name || 'Mobile Device',
          });
        } catch (streamErr) {
          console.error(`[Beam] Native stream failed for ${f.fileName}:`, streamErr);
          allSucceeded = false;
        }
      }
      return allSucceeded;
    } catch (err) {
      console.error('[Beam] Failed to beam item:', err);
      return false;
    }
  },
}));

// Load persisted items and device fingerprint on startup
if (typeof window !== 'undefined') {
  invoke<string>('get_device_fingerprint')
    .then((fp) => {
      if (fp) cachedDeviceFingerprint = fp;
    })
    .catch(() => {});

  invoke<string>('load_persisted_items')
    .then((json) => {
      try {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed) && parsed.length > 0) {
          useStore.setState({
            items: parsed.map((item) => ({
              ...item,
              source: item.source || (item.sender === 'Windows Clipboard' ? 'clipboard' : 'device'),
            })),
          });
        }
      } catch {}
    })
    .catch(() => {});

  // Startup probe of trusted devices
  setTimeout(() => {
    useStore.getState().probeAllTrusted().catch(() => {});
  }, 1000);

  // Load persistent desktop settings
  invoke<DesktopSettingsState>('get_desktop_settings')
    .then((settings) => {
      if (settings) {
        useStore.setState({ settings });
      }
    })
    .catch(() => {});

  // Background health check every 15 seconds
  setInterval(() => {
    useStore.getState().probeAllTrusted().catch(() => {});
  }, 15000);
}
