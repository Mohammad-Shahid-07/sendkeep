import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useStore, SendKeepItem, TransferProgress } from '../store/appStore';
import { playCopy, playPop } from '../lib/soundEffects';

const TRIGGER_PX = 4;
const DWELL_MS = 60;
const GRACE_MS = 300;
const PANEL_WIDTH = 360; // 340px visual + 20px dead band

export function useEdgeHover() {
  const dwellTimer = useRef<number | null>(null);
  const graceTimer = useRef<number | null>(null);
  const isInteractive = useRef(false);

  useEffect(() => {
    // 1. Listen for cursor position from Rust background tracker
    const unlistenCursorPromise = listen<[number, number]>('sendkeep:cursor-pos', (event) => {
      const [x, y] = event.payload;
      const state = useStore.getState();
      const isModalActive = Boolean(
        state.isWebShareOpen ||
        state.isSettingsOpen ||
        state.isPairModalOpen ||
        state.previewItemId !== null
      );

      const isOverTransferOverlay = Boolean(
        state.activeTransfer && y >= window.innerHeight - 160
      );

      if (isModalActive || isOverTransferOverlay) {
        // When any modal or active transfer card is on screen, the window MUST remain interactive
        if (graceTimer.current) {
          clearTimeout(graceTimer.current);
          graceTimer.current = null;
        }
        if (!isInteractive.current) {
          invoke('set_interactive', { interactive: true });
          isInteractive.current = true;
        }
        return;
      }

      const isOpen = state.isOpen;

      if (!isOpen) {
        // Closed state: check if cursor enters the trigger strip within middle hot zone (20% to 80% screen height)
        const isWithinHotZone = y >= window.innerHeight * 0.20 && y <= window.innerHeight * 0.80;
        if (x <= TRIGGER_PX && isWithinHotZone) {
          if (!dwellTimer.current) {
            dwellTimer.current = window.setTimeout(async () => {
              // Fullscreen Game / Presentation suppression
              try {
                const isFs = await invoke<boolean>('check_fullscreen');
                if (isFs) {
                  dwellTimer.current = null;
                  return;
                }
              } catch {}

              useStore.getState().setOpen(true);
              if (!isInteractive.current) {
                invoke('set_interactive', { interactive: true });
                isInteractive.current = true;
              }
              dwellTimer.current = null;
            }, DWELL_MS);
          }
        } else {
          if (dwellTimer.current) {
            clearTimeout(dwellTimer.current);
            dwellTimer.current = null;
          }
        }
      } else {
        // Open state: keep open if inside panel, start close timer if moved away
        if (x > PANEL_WIDTH) {
          if (!graceTimer.current) {
            graceTimer.current = window.setTimeout(() => {
              useStore.getState().setOpen(false);
              useStore.getState().setPreviewItemId(null);
              if (isInteractive.current) {
                invoke('set_interactive', { interactive: false });
                isInteractive.current = false;
              }
              graceTimer.current = null;
            }, GRACE_MS);
          }
        } else {
          // Inside panel: cancel any pending close
          if (graceTimer.current) {
            clearTimeout(graceTimer.current);
            graceTimer.current = null;
          }
        }
      }
    });

    // 2. Listen for incoming items from Android
    const unlistenItemPromise = listen<SendKeepItem & { senderIp?: string; sender_ip?: string }>('sendkeep:item-received', (event) => {
      const rawItem = event.payload;
      console.log('[SendKeep UI] Received item:', rawItem);
      const item: SendKeepItem = {
        ...rawItem,
        source: 'device',
      };
      useStore.getState().addItem(item);

      if (!isInteractive.current) {
        invoke('set_interactive', { interactive: true });
        isInteractive.current = true;
      }
    });

    // 3. Listen for live Windows Clipboard captures (Real Edge-Drop Engine)
    const unlistenClipPromise = listen<SendKeepItem>('sendkeep:clipboard-item', (event) => {
      const item = event.payload;
      console.log('[SendKeep UI] Live clipboard capture:', item);
      const incognito = useStore.getState().clipboardSettings.incognito;
      if (!incognito) {
        useStore.getState().addItem(item);
        playCopy();
      }
    });

    // 4. Listen for System Tray events
    const unlistenTogglePromise = listen('sendkeep:toggle-shelf', () => {
      const open = !useStore.getState().isOpen;
      useStore.getState().setOpen(open);
      if (!open) {
        useStore.getState().setPreviewItemId(null);
      }
      invoke('set_interactive', { interactive: open });
      isInteractive.current = open;
    });

    const unlistenClearPromise = listen('sendkeep:clear-unpinned', () => {
      useStore.getState().clearUnpinned();
    });

    const unlistenIncognitoPromise = listen('sendkeep:toggle-incognito', () => {
      useStore.getState().toggleIncognito();
    });

    const unlistenDevicePromise = listen<{ name: string; ip: string; port?: number; model?: string; fingerprint?: string; status?: string }>('sendkeep:device-discovered', (event) => {
      console.log('[SendKeep UI] Discovered network device:', event.payload);
      useStore.getState().addDiscoveredDevice({
        name: event.payload.name || event.payload.ip,
        ip: event.payload.ip,
        port: event.payload.port || 53317,
        model: event.payload.model,
        fingerprint: event.payload.fingerprint,
        status: 'online',
      });
    });

    const unlistenPairPromise = listen<any>('sendkeep:pairing-requested', (event) => {
      console.log('[SendKeep UI] Incoming pairing request:', event.payload);
      playPop();
      useStore.getState().setIncomingPairRequest(event.payload);
      useStore.getState().setOpen(true);
      if (!isInteractive.current) {
        invoke('set_interactive', { interactive: true });
        isInteractive.current = true;
      }
    });

    const unlistenProgressPromise = listen<TransferProgress>('sendkeep:transfer-progress', (event) => {
      useStore.getState().setActiveTransfer(event.payload);
      if (!isInteractive.current) {
        invoke('set_interactive', { interactive: true });
        isInteractive.current = true;
      }
      if (event.payload.status === 'completed' || event.payload.status === 'cancelled' || event.payload.status === 'failed') {
        const delay = event.payload.status === 'cancelled' ? 2000 : 4000;
        setTimeout(() => {
          const curr = useStore.getState().activeTransfer;
          if (curr?.sessionId === event.payload.sessionId) {
            useStore.getState().setActiveTransfer(null);
          }
        }, delay);
      }
    });

    const unlistenInternalDropPromise = listen<[number, number]>('sendkeep:internal-drop', (event) => {
      const [x, y] = event.payload;
      const activeId = useStore.getState().activeDraggingId;
      if (!activeId) return;
      const el = document.elementFromPoint(x, y);
      const targetCard = el?.closest('[data-item-id]');
      const targetId = targetCard?.getAttribute('data-item-id');
      if (targetId && targetId !== activeId) {
        playPop();
        useStore.getState().mergeItems(activeId, targetId);
      }
      useStore.getState().setActiveDraggingId(null);
    });

    // 8. Listen for CLI argument / Windows Explorer right-click "Send with SendKeep"
    const unlistenCliPromise = listen<string>('sendkeep:cli-file-dropped', async (event) => {
      const filePath = event.payload;
      if (!filePath) return;
      try {
        const info = await invoke<{
          name: string;
          size: number;
          fileType: string;
          isDirectory?: boolean;
        }>('get_file_info', { path: filePath });

        if (info) {
          if (info.isDirectory || info.fileType === 'folder') {
            const folderFiles = await invoke<Array<{
              name: string;
              relativePath: string;
              fullPath: string;
              size: number;
              fileType: string;
            }>>('collect_folder_files', { folderPath: filePath });

            if (folderFiles && folderFiles.length > 0) {
              const subItems = folderFiles.map((ff, idx) => ({
                id: `sub-folder-${Date.now()}-${idx}`,
                name: ff.relativePath,
                path: ff.fullPath,
                size: ff.size,
                fileType: ff.fileType,
                sender: 'Explorer',
                source: 'device' as const,
                timestamp: Date.now(),
              }));

              const totalSize = folderFiles.reduce((acc, f) => acc + f.size, 0);
              const bundleItem: SendKeepItem = {
                id: `cli-folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                name: `${info.name} (${folderFiles.length} files)`,
                path: filePath,
                size: totalSize,
                fileType: 'bundle/folder',
                sender: 'Explorer',
                timestamp: Date.now(),
                source: 'device',
                isStack: true,
                isExpanded: false,
                bundleItems: subItems,
              };
              useStore.getState().addItem(bundleItem);
              useStore.getState().setOpen(true);
              invoke('set_interactive', { interactive: true });
              isInteractive.current = true;
              playPop();
              return;
            }
          }

          const item: SendKeepItem = {
            id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: info.name || filePath.split(/[/\\]/).pop() || 'File',
            size: info.size || 0,
            fileType: info.fileType || 'file',
            sender: 'Explorer',
            timestamp: Date.now(),
            source: 'device',
            path: filePath,
          };
          useStore.getState().addItem(item);
          useStore.getState().setOpen(true);
          invoke('set_interactive', { interactive: true });
          isInteractive.current = true;
          playPop();
        }
      } catch (err) {
        console.warn('Failed to stage CLI-dropped file:', err);
      }
    });

    return () => {
      unlistenCursorPromise.then((fn) => fn());
      unlistenItemPromise.then((fn) => fn());
      unlistenClipPromise.then((fn) => fn());
      unlistenTogglePromise.then((fn) => fn());
      unlistenClearPromise.then((fn) => fn());
      unlistenIncognitoPromise.then((fn) => fn());
      unlistenDevicePromise.then((fn) => fn());
      unlistenPairPromise.then((fn) => fn());
      unlistenProgressPromise.then((fn) => fn());
      unlistenInternalDropPromise.then((fn) => fn());
      unlistenCliPromise.then((fn) => fn());
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
      if (graceTimer.current) clearTimeout(graceTimer.current);
    };
  }, []);
}
