import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/appStore';
import { Header } from './Header';
import { ItemList } from './ItemList';
import { DropDock } from './DropDock';
import { CopyIndicatorCurve } from './CopyIndicatorCurve';
import { PreviewFlyout } from './PreviewFlyout';
import { PairRequestToast } from './PairRequestToast';
import { SettingsModal } from './SettingsModal';
import { WebShareModal } from './WebShareModal';
import { Smartphone, Clipboard } from 'lucide-react';
import { playBeam } from '../lib/soundEffects';

export const Panel: React.FC = () => {
  const { isOpen, addItem, connectedDevice, activeSource, beamItemToDevice } = useStore();
  const [isWindowDragOver, setIsWindowDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsWindowDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.clientX > 20 && e.clientX < 340) {
      setIsWindowDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsWindowDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

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

  const isPhoneMode = activeSource === 'device';

  return (
    <div
      className="root fixed inset-0 pointer-events-none select-none overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Screen Edge Copy Indicator Curve */}
      <CopyIndicatorCurve />

      {/* Edge Handle Glow Beacon when shelf is retracted */}
      {!isOpen && (
        <motion.div
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 0.85, x: 0 }}
          transition={{ duration: 0.25 }}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-20 rounded-r-full bg-gradient-to-b from-indigo-500 via-purple-500 to-emerald-500 shadow-[0_0_16px_rgba(99,102,241,0.7)] pointer-events-none"
        />
      )}

      {/* Full-Height SendKeep Sidebar Panel */}
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
        className="fixed top-0 left-0 w-[350px] h-screen bg-[#090a0e] border-r border-white/[0.06] shadow-2xl shadow-black flex flex-col pointer-events-auto relative overflow-hidden z-20"
      >
        {/* Full Window Ambient Drag Overlay */}
        <AnimatePresence>
          {isWindowDragOver && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className={`absolute inset-2 z-50 flex flex-col items-center justify-center gap-2 pointer-events-none rounded-2xl border-2 border-dashed shadow-2xl backdrop-blur-md ${
                isPhoneMode
                  ? 'bg-[#090a0e]/96 border-emerald-500 shadow-[inset_0_0_40px_rgba(16,185,129,0.3)]'
                  : 'bg-[#090a0e]/96 border-indigo-500 shadow-[inset_0_0_40px_rgba(99,102,241,0.3)]'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full border flex items-center justify-center animate-bounce ${
                  isPhoneMode
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                }`}
              >
                {isPhoneMode ? <Smartphone className="w-6 h-6" /> : <Clipboard className="w-6 h-6" />}
              </div>
              <div className="text-sm font-semibold text-white">
                {isPhoneMode && connectedDevice
                  ? `Drop to beam to ${connectedDevice.name}`
                  : 'Drop files to stage on shelf'}
              </div>
              <div className="text-[11px] text-white/50">
                {isPhoneMode ? 'Direct P2P Wi-Fi transfer (0 clicks)' : 'Instant staging on desktop shelf'}
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
      </motion.aside>

      {/* 5. Settings & Web Share Modals */}
      <SettingsModal />
      <WebShareModal />
    </div>
  );
};
