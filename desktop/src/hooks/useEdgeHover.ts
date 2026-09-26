import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useStore, SendKeepItem, TransferProgress } from '../store/appStore';
import { playCopy, playPop } from '../lib/soundEffects';

const GRACE_MS = 250;
const DEFAULT_DWELL_MS = 50; // Balanced 50ms dwell response
const BASE_PANEL_WIDTH = 350;
const FLYOUT_PANEL_WIDTH = 820;

let cachedIsFullscreen = false;
let lastFsCheckTime = 0;
async function isFullscreenActiveCached(): Promise<boolean> {
  const now = performance.now();
  if (now - lastFsCheckTime > 1500) {
    lastFsCheckTime = now;
    try {
      cachedIsFullscreen = await invoke<boolean>('check_fullscreen');
    } catch {
      cachedIsFullscreen = false;
    }
  }
  return cachedIsFullscreen;
}

export function useEdgeHover() {
  const dwellTimer = useRef<number | null>(null);
  const graceTimer = useRef<number | null>(null);
  const isInteractive = useRef(false);
  const lastPos = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const openTimestamp = useRef<number>(0);

  const previewItemId = useStore((s) => s.previewItemId);
  const isIndicatorStyleFlyoutOpen = useStore((s) => s.isIndicatorStyleFlyoutOpen);
  const isOpen = useStore((s) => s.isOpen);
  const isSettingsOpen = useStore((s) => s.isSettingsOpen);
  const isPairModalOpen = useStore((s) => s.isPairModalOpen);
  const isWebShareOpen = useStore((s) => s.isWebShareOpen);
  const activeTransfer = useStore((s) => s.activeTransfer);

  // Synchronize OS window width with adjacent flyout state
  useEffect(() => {
    const hasFlyout = Boolean(previewItemId !== null || isIndicatorStyleFlyoutOpen);
    invoke('set_preview_mode', { active: hasFlyout }).catch(() => {});
  }, [previewItemId, isIndicatorStyleFlyoutOpen]);

  // Enforce click-through whenever the shelf, modals, and flyouts are closed
  useEffect(() => {
    const shouldBeInteractive = Boolean(
      isOpen ||
      isSettingsOpen ||
      isPairModalOpen ||
      isWebShareOpen ||
      previewItemId !== null ||
      isIndicatorStyleFlyoutOpen ||
      activeTransfer
    );

    if (!shouldBeInteractive) {
      isInteractive.current = false;
      invoke('set_interactive', { interactive: false }).catch(() => {});
    }
  }, [
    isOpen,
    isSettingsOpen,
    isPairModalOpen,
    isWebShareOpen,
    previewItemId,
    isIndicatorStyleFlyoutOpen,
    activeTransfer,
  ]);

  useEffect(() => {
    // 1. Listen for cursor position from Rust background tracker
    const unlistenCursorPromise = listen<[number, number]>('sendkeep:cursor-pos', async (event) => {
      const [rawX, rawY] = event.payload;
      const dpr = window.devicePixelRatio || 1;
      const x = rawX / dpr;
      const y = rawY / dpr;

      const now = performance.now();
      const dt = now - lastPos.current.time;
      const dx = Math.abs(x - lastPos.current.x);
      const dy = Math.abs(y - lastPos.current.y);
      const speed = dt > 0 ? Math.hypot(dx, dy) / dt : 0; // px/ms
      lastPos.current = { x, y, time: now };

      const state = useStore.getState();
      const isOpen = state.isOpen;
      const isRight = state.settings.stickPosition === 'right';
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;

      const isModalActive = Boolean(
        state.isWebShareOpen ||
        state.isSettingsOpen ||
        state.isPairModalOpen ||
        state.previewItemId !== null ||
        state.isIndicatorStyleFlyoutOpen
      );

      const isOverTransferOverlay = Boolean(
        state.activeTransfer && y >= window.innerHeight - 160
      );

      // Only hold interactive when the shelf is actually open AND a modal/transfer is active
      if (isOpen && (isModalActive || isOverTransferOverlay)) {
        if (graceTimer.current) {
          clearTimeout(graceTimer.current);
          graceTimer.current = null;
        }
        if (!isInteractive.current) {
          invoke('set_interactive', { interactive: true }).catch(() => {});
          isInteractive.current = true;
        }
        return;
      }

      // Calculate vertical trigger band
      const pFrac = state.settings.panelHeight || 0.65;
      const panelH = screenH * pFrac;
      const minY = panelH / 2;
      const maxY = screenH - panelH / 2;
      const vOffset = state.settings.verticalOffset ?? 0.5;
      const midY = minY + vOffset * (maxY - minY);
      const triggerH = Math.min(panelH, screenH * (state.settings.hotZoneHeight || 0.4));

      let triggerTop = midY - triggerH / 2;
      let triggerBottom = midY + triggerH / 2;
      if (state.settings.triggerAlignment === 'top') {
        triggerTop = midY - panelH / 2;
        triggerBottom = triggerTop + triggerH;
      } else if (state.settings.triggerAlignment === 'bottom') {
        triggerBottom = midY + panelH / 2;
        triggerTop = triggerBottom - triggerH;
      }

      const inVerticalZone = y >= triggerTop && y <= triggerBottom;
      const distFromEdge = isRight ? screenW - x : x;
      const hotWidth = Math.max(state.settings.hotZoneWidth ?? 4, 3);
      const isAtEdge = distFromEdge <= hotWidth && distFromEdge >= -12;
      const isNearEdge = distFromEdge <= hotWidth + 18 && distFromEdge >= -12;

      if (!isOpen) {
        openTimestamp.current = 0;
        const isHoverEnabled = Boolean(state.settings?.hoverActivation ?? true);

        // Subtle edge hint beacon when touching wrong vertical area
        if (isNearEdge && !inVerticalZone && isHoverEnabled && (state.settings.showEdgeLocationHint ?? true)) {
          if (!state.isNearEdge) {
            useStore.getState().setIsNearEdge(true);
          }
        } else if (!isNearEdge && state.isNearEdge) {
          useStore.getState().setIsNearEdge(false);
        }

        // Mouse intent filter: rapid mouse movements across or along the edge are ignored.
        // Opening requires the cursor to decelerate or rest against the screen border.
        const isFastTraverse = speed > 1.3;

        if (isHoverEnabled && isAtEdge && inVerticalZone && !isFastTraverse) {
          if (!dwellTimer.current) {
            const dwellMs = state.settings.hoverDwellMs ?? DEFAULT_DWELL_MS;
            dwellTimer.current = window.setTimeout(async () => {
              dwellTimer.current = null;
              // Check fullscreen suppression if enabled
              if (state.settings.suppressInFullscreen ?? true) {
                const isFs = await isFullscreenActiveCached();
                if (isFs) return;
              }

              if (!isInteractive.current) {
                invoke('set_interactive', { interactive: true }).catch(() => {});
                isInteractive.current = true;
              }
              openTimestamp.current = performance.now();
              useStore.getState().setOpen(true);
              useStore.getState().setIsNearEdge(false);
            }, dwellMs);
          }
        } else {
          if (dwellTimer.current) {
            clearTimeout(dwellTimer.current);
            dwellTimer.current = null;
          }
          if (isInteractive.current && !useStore.getState().isOpen) {
            invoke('set_interactive', { interactive: false });
            isInteractive.current = false;
          }
        }
      } else {
        if (openTimestamp.current === 0) {
          openTimestamp.current = performance.now();
        }

        if (state.isNearEdge) {
          useStore.getState().setIsNearEdge(false);
        }

        // Open state: Dead-band hysteresis calculation
        const hasFlyout = Boolean(state.previewItemId !== null || state.isIndicatorStyleFlyoutOpen);
        const activeWidth = hasFlyout ? FLYOUT_PANEL_WIDTH : BASE_PANEL_WIDTH;
        const keepOpenPx = activeWidth;
        const startClosePx = activeWidth + 20;

        const currentDist = isRight ? screenW - x : x;
        const isClearlyInside = currentDist <= keepOpenPx && currentDist >= -20;
        const isClearlyOutside = currentDist > startClosePx || currentDist < -50;

        // Prevent premature closing during initial opening animation
        if (performance.now() - openTimestamp.current < 320) {
          if (graceTimer.current) {
            clearTimeout(graceTimer.current);
            graceTimer.current = null;
          }
          return;
        }

        if (isClearlyOutside) {
          if (!graceTimer.current) {
            graceTimer.current = window.setTimeout(() => {
              const curState = useStore.getState();
              if (
                curState.isWebShareOpen ||
                curState.isSettingsOpen ||
                curState.isPairModalOpen ||
                curState.previewItemId !== null ||
                curState.isIndicatorStyleFlyoutOpen
              ) {
                graceTimer.current = null;
                return;
              }

              useStore.getState().setOpen(false);
              useStore.getState().setPreviewItemId(null);
              useStore.getState().setDeviceMenuOpen(false);
              invoke('set_interactive', { interactive: false }).catch(() => {});
              isInteractive.current = false;
              graceTimer.current = null;
            }, GRACE_MS);
          }
        } else if (isClearlyInside) {
          if (graceTimer.current) {
            clearTimeout(graceTimer.current);
            graceTimer.current = null;
          }
          if (!isInteractive.current) {
            invoke('set_interactive', { interactive: true });
            isInteractive.current = true;
          }
        }
      }
    });

    // 2. Listen for incoming items from Android
    const unlistenItemPromise = listen<SendKeepItem & { senderIp?: string; sender_ip?: string }>('sendkeep:item-received', (event) => {
      const rawItem = event.payload;
      console.log('[SendKeep UI] Received item:', rawItem);
      const senderIp = rawItem.sender_ip || rawItem.senderIp;
      const trusted = useStore.getState().trustedDevices;
      const matchedDevice = trusted.find(
        (d) =>
          (senderIp && d.ip === senderIp) ||
          (rawItem.sender && d.name.toLowerCase() === rawItem.sender.toLowerCase())
      );
      const item: SendKeepItem = {
        ...rawItem,
        source: 'device',
        senderIp,
        deviceId: matchedDevice?.id || (senderIp ? `dev-${senderIp}` : undefined),
      };
      useStore.getState().addItem(item);

      if (useStore.getState().isOpen && !isInteractive.current) {
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

    // 4. Listen for System Tray & Global Hotkey (Alt+C) events
    const unlistenTogglePromise = listen('sendkeep:toggle-shelf', () => {
      const open = !useStore.getState().isOpen;
      openTimestamp.current = performance.now();
      useStore.getState().setOpen(open);
      if (!open) {
        useStore.getState().setPreviewItemId(null);
      }
      invoke('set_interactive', { interactive: open }).catch(() => {});
      isInteractive.current = open;
    });

    // 5. Automatic click-away / window blur handling
    const handleWindowBlur = () => {
      const state = useStore.getState();
      if (state.isOpen) {
        state.setOpen(false);
        invoke('set_interactive', { interactive: false }).catch(() => {});
        isInteractive.current = false;
      }
    };
    window.addEventListener('blur', handleWindowBlur);

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
      window.removeEventListener('blur', handleWindowBlur);
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
      if (graceTimer.current) clearTimeout(graceTimer.current);
    };
  }, []);
}
