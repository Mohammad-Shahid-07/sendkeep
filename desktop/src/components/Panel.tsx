import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useStore, SendKeepItem, TrustedDevice } from '../store/appStore';
import { Header } from './Header';
import { ItemList } from './ItemList';
import { DropDock } from './DropDock';
import { CopyIndicatorCurve } from './CopyIndicatorCurve';
import { PreviewFlyout } from './PreviewFlyout';
import { IndicatorStyleFlyout } from './IndicatorStyleFlyout';
import { PairRequestToast } from './PairRequestToast';
import { SettingsModal } from './SettingsModal';
import { WebShareModal } from './WebShareModal';
import { PairDeviceModal } from './PairDeviceModal';
import { SidebarDropOverlay } from './SidebarDropOverlay';
import { playBeam, playCopy } from '../lib/soundEffects';

export const Panel: React.FC = () => {
  const isOpen = useStore((s) => s.isOpen);
  const isRight = useStore((s) => s.settings.stickPosition === 'right');
  const showEdgeHandle = useStore((s) => s.settings.showEdgeHandle !== false);
  const showEdgeLocationHint = useStore((s) => s.settings.showEdgeLocationHint ?? true);
  const isPairModalOpen = useStore((s) => s.isPairModalOpen);
  const setPairModalOpen = useStore((s) => s.setPairModalOpen);
  const activeSource = useStore((s) => s.activeSource);
  const addItem = useStore((s) => s.addItem);
  const beamItemToDevice = useStore((s) => s.beamItemToDevice);

  const [isWindowDragOver, setIsWindowDragOver] = useState(false);
  const isWindowDragOverRef = useRef(false);
  isWindowDragOverRef.current = isWindowDragOver;
  const [activeDropZone, setActiveDropZone] = useState<string | null>(null);
  const activeDropZoneRef = useRef<string | null>(null);
  activeDropZoneRef.current = activeDropZone;
  const dragCounterRef = useRef(0);

  // Handle native OS files dropped via Tauri onDragDropEvent
  const handleNativePathsDrop = async (paths: string[], targetZone: string | null) => {
    if (!paths || paths.length === 0) return;

    let targetDevice: TrustedDevice | undefined = undefined;
    const isDeviceTarget = Boolean(targetZone && targetZone.startsWith('device-'));
    const isClipboardTarget = targetZone === 'clipboard';

    const state = useStore.getState();
    const seen = new Set<string>();
    const allDevices: TrustedDevice[] = [];
    const addD = (d: TrustedDevice) => {
      seen.add(d.id);
      if (d.ip) seen.add(d.ip);
      if (d.name) seen.add(d.name.trim().toLowerCase());
      if (d.fingerprint) seen.add(d.fingerprint);
      allDevices.push(d);
    };

    for (const d of state.trustedDevices) {
      if (d.status === 'online' && !seen.has(d.id) && (!d.ip || !seen.has(d.ip)) && (!d.name || !seen.has(d.name.trim().toLowerCase()))) {
        addD(d);
      }
    }
    if (state.connectedDevice && state.connectedDevice.status === 'online' && !seen.has(state.connectedDevice.id) && (!state.connectedDevice.ip || !seen.has(state.connectedDevice.ip)) && (!state.connectedDevice.name || !seen.has(state.connectedDevice.name.trim().toLowerCase()))) {
      addD(state.connectedDevice);
    }
    for (const disc of state.discoveredDevices) {
      if (disc.status !== 'offline' && disc.ip && !seen.has(disc.ip) && (!disc.name || !seen.has(disc.name.trim().toLowerCase()))) {
        addD({
          id: disc.ip,
          name: disc.name || disc.ip,
          ip: disc.ip,
          port: disc.port || 53317,
          model: disc.model,
          deviceType: disc.deviceType,
          fingerprint: disc.fingerprint,
          status: 'online',
        });
      }
    }

    if (isDeviceTarget && targetZone) {
      const devId = targetZone.replace('device-', '');
      targetDevice = allDevices.find((d) => d.id === devId || d.ip === devId) || allDevices[0];
    } else if (!isClipboardTarget && state.activeSource === 'device') {
      targetDevice = allDevices[0];
    }

    const isBeamMode = Boolean(isDeviceTarget || (!isClipboardTarget && state.activeSource === 'device' && targetDevice));

    if (isBeamMode) {
      playBeam();
    } else {
      playCopy();
      try {
        await navigator.clipboard.writeText(paths.join('\n'));
      } catch {}
    }

    if (paths.length > 1) {
      const subItems: SendKeepItem[] = [];
      let totalSize = 0;

      for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        let name = p.split(/[/\\]/).pop() || 'File';
        let size = 0;
        let fileType = 'application/octet-stream';

        try {
          const info = await invoke<{ name: string; size: number; fileType: string }>('get_file_info', { path: p });
          if (info) {
            name = info.name || name;
            size = info.size || 0;
            fileType = info.fileType || fileType;
          }
        } catch {}

        totalSize += size;
        subItems.push({
          id: `sub-drop-${Date.now()}-${i}`,
          name,
          path: p,
          size,
          fileType,
          sender: isBeamMode ? 'You' : 'Windows Clipboard',
          source: isBeamMode ? 'device' : 'clipboard',
          targetDeviceId: isBeamMode ? targetDevice?.id : undefined,
          targetDeviceName: isBeamMode ? targetDevice?.name : undefined,
          targetDeviceIp: isBeamMode ? targetDevice?.ip : undefined,
          timestamp: Date.now(),
        });
      }

      const bundleItem: SendKeepItem = {
        id: `stack-drop-${Date.now()}`,
        name: `Collection (${paths.length} files)`,
        path: paths[0],
        size: totalSize,
        fileType: 'bundle/files',
        sender: isBeamMode ? 'You' : 'Windows Clipboard',
        source: isBeamMode ? 'device' : 'clipboard',
        targetDeviceId: isBeamMode ? targetDevice?.id : undefined,
        targetDeviceName: isBeamMode ? targetDevice?.name : undefined,
        targetDeviceIp: isBeamMode ? targetDevice?.ip : undefined,
        timestamp: Date.now(),
        isStack: true,
        isExpanded: false,
        bundleItems: subItems,
      };

      state.addItem(bundleItem);
      if (isBeamMode) {
        state.beamItemToDevice(bundleItem, undefined, targetDevice).catch(() => {});
      }
    } else {
      const p = paths[0];
      let name = p.split(/[/\\]/).pop() || 'File';
      let size = 0;
      let fileType = 'application/octet-stream';
      let isDirectory = false;

      try {
        const info = await invoke<{ name: string; size: number; fileType: string; isDirectory?: boolean }>('get_file_info', { path: p });
        if (info) {
          name = info.name || name;
          size = info.size || 0;
          fileType = info.fileType || fileType;
          isDirectory = Boolean(info.isDirectory || info.fileType === 'folder');
        }
      } catch {}

      if (isDirectory) {
        try {
          const folderFiles = await invoke<Array<{
            name: string;
            relativePath: string;
            fullPath: string;
            size: number;
            fileType: string;
          }>>('collect_folder_files', { folderPath: p });

          if (folderFiles && folderFiles.length > 0) {
            const subItems = folderFiles.map((ff, idx) => ({
              id: `sub-folder-${Date.now()}-${idx}`,
              name: ff.relativePath,
              path: ff.fullPath,
              size: ff.size,
              fileType: ff.fileType,
              sender: isBeamMode ? 'You' : 'Windows Clipboard',
              source: isBeamMode ? ('device' as const) : ('clipboard' as const),
              timestamp: Date.now(),
            }));
            const totalFolderSize = folderFiles.reduce((acc, f) => acc + f.size, 0);
            const bundleItem: SendKeepItem = {
              id: `folder-drop-${Date.now()}`,
              name: `${name} (${folderFiles.length} files)`,
              path: p,
              size: totalFolderSize,
              fileType: 'bundle/folder',
              sender: isBeamMode ? 'You' : 'Windows Clipboard',
              source: isBeamMode ? 'device' : 'clipboard',
              timestamp: Date.now(),
              isStack: true,
              isExpanded: false,
              bundleItems: subItems,
            };
            state.addItem(bundleItem);
            if (isBeamMode) {
              state.beamItemToDevice(bundleItem, undefined, targetDevice).catch(() => {});
            }
            return;
          }
        } catch {}
      }

      const singleItem: SendKeepItem = {
        id: `drop-${Date.now()}`,
        name,
        path: p,
        size,
        fileType,
        sender: isBeamMode ? 'You' : 'Windows Clipboard',
        source: isBeamMode ? 'device' : 'clipboard',
        targetDeviceId: isBeamMode ? targetDevice?.id : undefined,
        targetDeviceName: isBeamMode ? targetDevice?.name : undefined,
        targetDeviceIp: isBeamMode ? targetDevice?.ip : undefined,
        timestamp: Date.now(),
      };

      state.addItem(singleItem);
      if (isBeamMode) {
        state.beamItemToDevice(singleItem, undefined, targetDevice).catch(() => {});
      }
    }
  };

  // Register Tauri v2 native window drag-and-drop listener for external OS files
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const resolveZone = (y: number): string => {
      const state = useStore.getState();
      const seen = new Set<string>();
      const allDevices: TrustedDevice[] = [];
      const addD = (d: TrustedDevice) => {
        seen.add(d.id);
        if (d.ip) seen.add(d.ip);
        if (d.name) seen.add(d.name.trim().toLowerCase());
        if (d.fingerprint) seen.add(d.fingerprint);
        allDevices.push(d);
      };

      for (const d of state.trustedDevices) {
        if (d.status === 'online' && !seen.has(d.id) && (!d.ip || !seen.has(d.ip)) && (!d.name || !seen.has(d.name.trim().toLowerCase()))) {
          addD(d);
        }
      }
      if (state.connectedDevice && state.connectedDevice.status === 'online' && !seen.has(state.connectedDevice.id) && (!state.connectedDevice.ip || !seen.has(state.connectedDevice.ip)) && (!state.connectedDevice.name || !seen.has(state.connectedDevice.name.trim().toLowerCase()))) {
        addD(state.connectedDevice);
      }
      for (const disc of state.discoveredDevices) {
        if (disc.status !== 'offline' && disc.ip && !seen.has(disc.ip) && (!disc.name || !seen.has(disc.name.trim().toLowerCase()))) {
          addD({
            id: disc.ip,
            name: disc.name || disc.ip,
            ip: disc.ip,
            port: disc.port || 53317,
            model: disc.model,
            deviceType: disc.deviceType,
            fingerprint: disc.fingerprint,
            status: 'online',
          });
        }
      }

      const totalZones = 1 + Math.max(1, allDevices.length);
      const screenH = window.innerHeight || 864;
      const fraction = Math.max(0, Math.min(1, y / screenH));

      if (fraction < 1 / totalZones) {
        return 'clipboard';
      }

      if (allDevices.length === 0) {
        return 'device-none';
      }

      const deviceFraction = (fraction - 1 / totalZones) / (1 - 1 / totalZones);
      const deviceIndex = Math.min(
        allDevices.length - 1,
        Math.floor(deviceFraction * allDevices.length)
      );
      return `device-${allDevices[deviceIndex].id}`;
    };

    try {
      getCurrentWebview().onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === 'enter') {
          useStore.getState().setOpen(true);
          invoke('set_interactive', { interactive: true }).catch(() => {});
          if (!isWindowDragOverRef.current) {
            isWindowDragOverRef.current = true;
            setIsWindowDragOver(true);
          }
        } else if (payload.type === 'over') {
          if (!isWindowDragOverRef.current) {
            isWindowDragOverRef.current = true;
            setIsWindowDragOver(true);
          }
          const dpr = window.devicePixelRatio || 1;
          const y = payload.position.y / dpr;
          const zoneId = resolveZone(y);
          if (activeDropZoneRef.current !== zoneId) {
            activeDropZoneRef.current = zoneId;
            setActiveDropZone(zoneId);
          }
        } else if (payload.type === 'drop') {
          const dpr = window.devicePixelRatio || 1;
          const y = payload.position.y / dpr;
          const zoneId = resolveZone(y) || activeDropZoneRef.current;
          handleNativePathsDrop(payload.paths, zoneId);
          isWindowDragOverRef.current = false;
          setIsWindowDragOver(false);
          activeDropZoneRef.current = null;
          setActiveDropZone(null);
        } else if (payload.type === 'leave') {
          isWindowDragOverRef.current = false;
          setIsWindowDragOver(false);
          activeDropZoneRef.current = null;
          setActiveDropZone(null);
        }
      }).then((fn) => {
        unlisten = fn;
      }).catch((err) => {
        console.warn('[SendKeep] onDragDropEvent registration failed:', err);
      });
    } catch (err) {
      console.warn('[SendKeep] getCurrentWebview failed:', err);
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        const state = useStore.getState();
        if (state.isWebShareOpen) {
          state.setWebShareOpen(false);
          return;
        }
        if (state.isSettingsOpen) {
          state.setSettingsOpen(false);
          return;
        }
        if (state.isPairModalOpen) {
          state.setPairModalOpen(false);
          return;
        }
        if (state.previewItemId !== null) {
          state.setPreviewItemId(null);
          return;
        }
        state.setOpen(false);
        invoke('set_interactive', { interactive: false });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);


  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) {
      setIsWindowDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isWindowDragOver) setIsWindowDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      dragCounterRef.current = 0;
      setIsWindowDragOver(false);
      return;
    }
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsWindowDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsWindowDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) {
      const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
      if (text) {
        const isPhoneMode = activeSource === 'device';
        const curDev = useStore.getState().connectedDevice;
        const isLink = text.startsWith('http://') || text.startsWith('https://');
        const clipItem = {
          id: 'drop-text-' + Date.now(),
          name: isLink ? 'Web Link' : 'Dropped Note',
          path: '',
          size: text.length,
          fileType: 'text/plain',
          sender: 'You',
          source: isPhoneMode ? ('device' as const) : ('clipboard' as const),
          targetDeviceId: isPhoneMode ? curDev?.id : undefined,
          targetDeviceName: isPhoneMode ? curDev?.name : undefined,
          targetDeviceIp: isPhoneMode ? curDev?.ip : undefined,
          timestamp: Date.now(),
          content: text,
        };
        addItem(clipItem);
        if (isPhoneMode) {
          beamItemToDevice(clipItem).catch(() => {});
        }
      }
      return;
    }

    playBeam();
    const isPhoneMode = activeSource === 'device';
    const curDev = useStore.getState().connectedDevice;

    if (files.length > 1) {
      const subItems = [];
      let totalSize = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as any).path || '';
        totalSize += file.size;
        subItems.push({
          id: 'sub-drop-' + Date.now() + '-' + i,
          name: file.name,
          path: filePath,
          size: file.size,
          fileType: file.type || 'application/octet-stream',
          sender: 'You',
          source: isPhoneMode ? ('device' as const) : ('clipboard' as const),
          targetDeviceId: isPhoneMode ? curDev?.id : undefined,
          targetDeviceName: isPhoneMode ? curDev?.name : undefined,
          targetDeviceIp: isPhoneMode ? curDev?.ip : undefined,
          timestamp: Date.now(),
        });
      }

      const bundleItem = {
        id: 'stack-drop-' + Date.now(),
        name: `Dropped Collection (${files.length} files)`,
        path: (files[0] as any).path || '',
        size: totalSize,
        fileType: 'bundle/files',
        sender: 'You',
        source: isPhoneMode ? ('device' as const) : ('clipboard' as const),
        targetDeviceId: isPhoneMode ? curDev?.id : undefined,
        targetDeviceName: isPhoneMode ? curDev?.name : undefined,
        targetDeviceIp: isPhoneMode ? curDev?.ip : undefined,
        timestamp: Date.now(),
        isStack: true,
        isExpanded: false,
        bundleItems: subItems,
      };

      addItem(bundleItem);
      if (isPhoneMode) {
        beamItemToDevice(bundleItem).catch(() => {});
      }
    } else {
      const file = files[0];
      const filePath = (file as any).path || '';

      let textContent: string | undefined = undefined;
      if ((file.name.toLowerCase().endsWith('.txt') || file.type.includes('text')) && file.size < 64 * 1024) {
        try {
          textContent = await file.text();
        } catch {}
      }
      const singleItem = {
        id: 'drop-' + Date.now(),
        name: file.name,
        path: filePath,
        size: file.size,
        fileType: file.type || 'application/octet-stream',
        sender: 'You',
        source: isPhoneMode ? ('device' as const) : ('clipboard' as const),
        targetDeviceId: isPhoneMode ? curDev?.id : undefined,
        targetDeviceName: isPhoneMode ? curDev?.name : undefined,
        targetDeviceIp: isPhoneMode ? curDev?.ip : undefined,
        timestamp: Date.now(),
        content: textContent,
      };

      addItem(singleItem);
      if (isPhoneMode) {
        beamItemToDevice(singleItem).catch(() => {});
      }
    }
  };

  return (
    <div className="root fixed inset-0 w-full h-screen pointer-events-none select-none overflow-hidden">
      {/* Screen Edge Copy Indicator Curve */}
      <CopyIndicatorCurve />

      {/* Screen Edge Location Beacon Hint */}
      <AnimatePresence>
        {!isOpen && useStore.getState().isNearEdge && showEdgeLocationHint && (
          <motion.div
            key="edge-beacon"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'absolute',
              top: '20%',
              bottom: '20%',
              [isRight ? 'right' : 'left']: 0,
              width: 2.5,
              background: 'linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.7) 30%, rgba(255, 255, 255, 0.7) 70%, transparent)',
              boxShadow: '0 0 8px rgba(255, 255, 255, 0.35)',
              borderRadius: isRight ? '999px 0 0 999px' : '0 999px 999px 0',
              pointerEvents: 'none',
              zIndex: 35,
            }}
          />
        )}
      </AnimatePresence>

      {/* Refined Minimalist Screen Edge Affordance (2.5px Frosted Glass Hairline) */}
      <AnimatePresence>
        {!isOpen && showEdgeHandle && (
          <motion.div
            key="edge-notch"
            initial={{ opacity: 0, x: isRight ? 4 : -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isRight ? 4 : -4 }}
            transition={{ duration: 0.15 }}
            className={`absolute ${isRight ? 'right-0' : 'left-0'} top-1/2 -translate-y-1/2 w-[2.5px] flex items-center group pointer-events-none z-30 select-none`}
            title="Move cursor to edge to open SendKeep"
          >
            <div
              className={`w-[2.5px] h-12 ${
                isRight ? 'rounded-l-full border-l' : 'rounded-r-full border-r'
              } bg-white/45 border-y border-white/30 transition-all duration-150 ease-out`}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-Height SendKeep Sidebar Panel (Butter-Smooth Hardware Accelerated) */}
      <motion.aside
        initial={false}
        animate={{
          x: isOpen ? 0 : isRight ? 350 : -350,
        }}
        transition={{
          type: 'spring',
          stiffness: 540,
          damping: 38,
          mass: 0.65,
        }}
        onMouseEnter={() => {
          if (isOpen) {
            invoke('set_interactive', { interactive: true }).catch(() => {});
          }
        }}
        onPointerDown={() => {
          if (isOpen) {
            invoke('focus_window').catch(() => {});
          }
        }}
        style={{
          willChange: 'transform',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            useStore.getState().setDeviceMenuOpen(false);
          }
        }}
        className={`fixed top-0 ${
          isRight
            ? 'right-0 border-l border-white/[0.08]'
            : 'left-0 border-r border-white/[0.08]'
        } w-[350px] h-screen bg-[#090a0e] flex flex-col ${
          isOpen ? 'pointer-events-auto' : 'pointer-events-none'
        } relative overflow-hidden z-20`}
      >
        {/* Full-Sidebar Droppable Target Zones Overlay */}
        <AnimatePresence>
          {isWindowDragOver && (
            <SidebarDropOverlay
              activeZone={activeDropZone}
              setActiveZone={setActiveDropZone}
              onClose={() => {
                dragCounterRef.current = 0;
                setIsWindowDragOver(false);
                setActiveDropZone(null);
              }}
            />
          )}
        </AnimatePresence>

        {/* Interactive Pairing Request Toast */}
        <PairRequestToast />

        {/* 1. Header with Device Switcher & Filter Tabs */}
        <Header />

        {/* 2. Scrollable Stream Feed */}
        <ItemList />

        {/* 3. Receptive Drop Dock & Quick Note Composer */}
        <DropDock />

        {/* 4. In-Shelf Slide-Over Modals */}
        <SettingsModal />
        <WebShareModal />
        <PairDeviceModal
          isOpen={isPairModalOpen}
          onClose={() => setPairModalOpen(false)}
        />
      </motion.aside>

      {/* 5. Floating Adjacent Flyouts (Rendered outside aside to prevent overflow clipping) */}
      <PreviewFlyout isRight={isRight} />
      <IndicatorStyleFlyout isRight={isRight} />
    </div>
  );
};

