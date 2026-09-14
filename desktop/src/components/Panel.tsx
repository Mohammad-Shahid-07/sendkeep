import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../store/appStore';
import { Header } from './Header';
import { ItemList } from './ItemList';
import { DropDock } from './DropDock';
import { CopyIndicatorCurve } from './CopyIndicatorCurve';
import { PreviewFlyout } from './PreviewFlyout';
import { PairRequestToast } from './PairRequestToast';
import { SettingsModal } from './SettingsModal';
import { WebShareModal } from './WebShareModal';
import { PairDeviceModal } from './PairDeviceModal';
import { playBeam } from '../lib/soundEffects';

export const Panel: React.FC = () => {
  const {
    isOpen,
    addItem,
    connectedDevice,
    activeSource,
    beamItemToDevice,
    isPairModalOpen,
    setPairModalOpen,
    settings,
  } = useStore();

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

  const [isWindowDragOver, setIsWindowDragOver] = useState(false);
  const dragCounterRef = useRef(0);

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
        const isLink = text.startsWith('http://') || text.startsWith('https://');
        const clipItem = {
          id: 'drop-text-' + Date.now(),
          name: isLink ? 'Web Link' : 'Dropped Note',
          path: '',
          size: text.length,
          fileType: 'text/plain',
          sender: 'You',
          source: isPhoneMode ? ('device' as const) : ('clipboard' as const),
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
    <div className="root fixed inset-0 pointer-events-none select-none overflow-hidden">
      {/* Screen Edge Copy Indicator Curve */}
      <CopyIndicatorCurve />

      {/* Refined Minimalist Screen Edge Affordance (2.5px Frosted Glass Hairline, Zero Neon) */}
      <AnimatePresence>
        {!isOpen && settings.showEdgeHandle !== false && (
          <motion.div
            key="edge-notch"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.15 }}
            onClick={() => {
              useStore.getState().setOpen(true);
              invoke('set_interactive', { interactive: true });
            }}
            onMouseEnter={() => {
              useStore.getState().setOpen(true);
              invoke('set_interactive', { interactive: true });
            }}
            className="absolute left-0 top-1/2 -translate-y-1/2 py-8 pl-0 pr-4 flex items-center group cursor-pointer pointer-events-auto z-30 select-none"
            title="Click or hover edge to open SendKeep"
          >
            <div className="w-[2.5px] h-12 rounded-r-full bg-white/35 border-r border-y border-white/25 backdrop-blur-sm transition-all duration-150 ease-out group-hover:w-[5px] group-hover:h-16 group-hover:bg-white/90 group-hover:shadow-[0_0_10px_rgba(255,255,255,0.35)]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-Height SendKeep Sidebar Panel (Entire Sidebar Droppable) */}
      <motion.aside
        initial={false}
        animate={{
          x: isOpen ? 0 : -350,
        }}
        transition={{
          type: 'spring',
          damping: 30,
          stiffness: 340,
          mass: 0.8,
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="fixed top-0 left-0 w-[350px] h-full bg-[#090a0e] border-r border-white/[0.06] shadow-2xl shadow-black flex flex-col pointer-events-auto relative overflow-hidden z-20"
      >
        {/* Full-Sidebar Ambient Drag Overlay */}
        <AnimatePresence>
          {isWindowDragOver && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-2.5 z-50 flex flex-col items-center justify-center gap-2.5 pointer-events-none rounded-2xl border border-dashed border-white/25 bg-[#090a0e]/95 backdrop-blur-xl shadow-2xl transition-all select-none"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/15 flex items-center justify-center text-white/90 shadow-sm">
                <svg
                  className="w-6 h-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 3v12" />
                  <path d="m8 11 4 4 4-4" />
                  <path d="M4 20h16" />
                </svg>
              </div>
              <div className="flex flex-col items-center gap-0.5 text-center px-4">
                <div className="text-sm font-semibold text-white tracking-tight">
                  {activeSource === 'device'
                    ? 'Drop anywhere to beam'
                    : activeSource === 'clipboard'
                    ? 'Drop anywhere to stage'
                    : 'Drop anywhere to beam or stage'}
                </div>
                <div className="text-xs text-white/50">
                  {activeSource === 'device' && connectedDevice
                    ? `Direct Wi-Fi transfer to ${connectedDevice.name}`
                    : activeSource === 'clipboard'
                    ? 'Staged on Windows shelf'
                    : 'Release anywhere on the sidebar'}
                </div>
              </div>
            </motion.div>
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

        {/* 4. Interactive Rich Preview Flyout */}
        <PreviewFlyout />

        {/* 5. In-Shelf Slide-Over Modals */}
        <SettingsModal />
        <WebShareModal />
        <PairDeviceModal
          isOpen={isPairModalOpen}
          onClose={() => setPairModalOpen(false)}
        />
      </motion.aside>
    </div>
  );
};

