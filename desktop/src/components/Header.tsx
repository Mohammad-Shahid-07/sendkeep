import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, FolderOpen, Globe, Settings, Smartphone, Layers, Check, Plus, PanelLeftClose } from 'lucide-react';
import { useStore, FilterCategory } from '../store/appStore';
import { ClearMenu } from './ClearMenu';
import { invoke } from '@tauri-apps/api/core';

export const Header: React.FC = () => {
  const {
    activeSource,
    setActiveSource,
    connectedDevice,
    trustedDevices,
    setPairModalOpen,
    setSettingsOpen,
    setWebShareOpen,
    items,
    clearTimeWindow,
    clearUnpinned,
    activeFilter,
    setFilter,
  } = useStore();

  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleOpenFolder = () => {
    invoke('open_downloads_folder').catch(() => {});
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPopover]);

  const tabs: { key: FilterCategory; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'media', label: 'Media' },
    { key: 'files', label: 'Files' },
    { key: 'links', label: 'Links' },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <div className="flex flex-col relative select-none shrink-0 border-b border-white/[0.06] bg-[#090a0e] z-30">
      {/* 1. Header Bar */}
      <header className="flex items-center justify-between px-3.5 py-2.5">
        {/* Stream / Device Switcher */}
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setShowPopover(!showPopover)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/[0.12] transition-all cursor-pointer"
            title="Switch stream source or device"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={activeSource + (activeSource === 'device' ? connectedDevice?.id : '')}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-2 min-w-0"
              >
                <span className="flex items-center justify-center shrink-0">
                  {activeSource === 'clipboard' ? (
                    /* Windows 11 4-tile Logo */
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                      <rect x="1" y="1" width="6.2" height="6.2" rx="0.8" fill="#0078D4" />
                      <rect x="8.8" y="1" width="6.2" height="6.2" rx="0.8" fill="#0078D4" />
                      <rect x="1" y="8.8" width="6.2" height="6.2" rx="0.8" fill="#0078D4" />
                      <rect x="8.8" y="8.8" width="6.2" height="6.2" rx="0.8" fill="#0078D4" />
                    </svg>
                  ) : activeSource === 'device' ? (
                    <div className="relative flex items-center justify-center">
                      <Smartphone className="w-3.5 h-3.5 text-white" />
                      <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    </div>
                  ) : (
                    <Layers className="w-3.5 h-3.5 text-white/80" />
                  )}
                </span>
                <span className="text-xs font-semibold text-white tracking-tight max-w-[150px] truncate">
                  {activeSource === 'clipboard'
                    ? 'Windows Clipboard'
                    : activeSource === 'device'
                    ? connectedDevice?.name || 'Mobile Device'
                    : 'Unified Stream'}
                </span>
              </motion.span>
            </AnimatePresence>
            <ChevronDown
              className={`w-3 h-3 text-white/40 transition-transform duration-150 ${
                showPopover ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Source & Device Popover Dropdown */}
          <AnimatePresence>
            {showPopover && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -6 }}
                transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                className="absolute top-9 left-0 w-64 bg-[#111219]/98 border border-white/[0.08] rounded-xl p-1.5 shadow-2xl z-50 flex flex-col gap-0.5 backdrop-blur-xl select-none text-xs"
              >
              <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                Stream Sources
              </div>

              <button
                onClick={() => {
                  setActiveSource('clipboard');
                  setShowPopover(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                  activeSource === 'clipboard'
                    ? 'bg-white/[0.08] text-white font-medium'
                    : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="1" width="6.2" height="6.2" rx="0.8" fill="#0078D4" />
                    <rect x="8.8" y="1" width="6.2" height="6.2" rx="0.8" fill="#0078D4" />
                    <rect x="1" y="8.8" width="6.2" height="6.2" rx="0.8" fill="#0078D4" />
                    <rect x="8.8" y="8.8" width="6.2" height="6.2" rx="0.8" fill="#0078D4" />
                  </svg>
                  <span className="truncate">Windows Clipboard</span>
                </div>
                {activeSource === 'clipboard' && <Check className="w-3.5 h-3.5 text-white/90 shrink-0" />}
              </button>

              <button
                onClick={() => {
                  setActiveSource('unified');
                  setShowPopover(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                  activeSource === 'unified'
                    ? 'bg-white/[0.08] text-white font-medium'
                    : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Layers className="w-3.5 h-3.5 text-white/60 shrink-0" />
                  <span className="truncate">Unified Stream</span>
                </div>
                {activeSource === 'unified' && <Check className="w-3.5 h-3.5 text-white/90 shrink-0" />}
              </button>

              <div className="h-px bg-white/[0.06] my-1" />

              <div className="px-2 pt-0.5 pb-0.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                Paired Devices
              </div>

              {trustedDevices.length > 0 ? (
                trustedDevices.map((dev) => {
                  const isCur = activeSource === 'device' && connectedDevice?.id === dev.id;
                  return (
                    <button
                      key={dev.id}
                      onClick={() => {
                        useStore.getState().selectTargetDevice(dev);
                        setActiveSource('device');
                        setShowPopover(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                        isCur
                          ? 'bg-white/[0.08] text-white font-medium'
                          : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Smartphone className="w-3.5 h-3.5 text-white/70 shrink-0" />
                        <span className="truncate">{dev.name}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded-md font-medium ${
                            dev.status === 'online'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-white/[0.06] text-white/40'
                          }`}
                        >
                          {dev.status === 'online' ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      {isCur && <Check className="w-3.5 h-3.5 text-white/90 shrink-0" />}
                    </button>
                  );
                })
              ) : connectedDevice ? (
                <button
                  onClick={() => {
                    setActiveSource('device');
                    setShowPopover(false);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer bg-white/[0.08] text-white font-medium"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Smartphone className="w-3.5 h-3.5 text-white/70 shrink-0" />
                    <span className="truncate">{connectedDevice.name}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-emerald-500/15 text-emerald-400 font-medium">
                      Online
                    </span>
                  </div>
                  {activeSource === 'device' && <Check className="w-3.5 h-3.5 text-white/90 shrink-0" />}
                </button>
              ) : null}

              <div className="h-px bg-white/[0.06] my-1" />

              <button
                onClick={() => {
                  setShowPopover(false);
                  setPairModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] text-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-white/40" />
                <span>Add Device via IP...</span>
              </button>
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        {/* Header Action Icons: Web Share, Downloads, Settings, Clear History */}
        <div className="flex items-center gap-1">
          {/* Web Share Mode */}
          <button
            onClick={() => setWebShareOpen(true)}
            title="Web Share (Browser Link & QR)"
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
          </button>

          {/* Open Downloads Folder in Explorer */}
          <button
            onClick={handleOpenFolder}
            title="Open Downloads in Explorer"
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>

          {/* Settings & Preferences */}
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings & Preferences"
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* Clear History Dropdown */}
          <ClearMenu
            onClearWindow={clearTimeWindow}
            onClearUnpinned={clearUnpinned}
            disabled={items.length === 0}
          />

          <div className="w-px h-3.5 bg-white/[0.08] mx-0.5" />

          {/* Collapse / Retract Shelf */}
          <button
            onClick={() => {
              useStore.getState().setOpen(false);
              useStore.getState().setPreviewItemId(null);
              invoke('set_interactive', { interactive: false });
            }}
            title="Collapse Shelf (Esc)"
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 2. Category Filter Tabs (Squircle Segmented Bar with Gliding Active Pill) */}
      <div className="px-3.5 pb-2.5">
        <nav className="flex items-center p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-1">
          {tabs.map((tab) => {
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`filter-tab-btn relative flex-1 py-1.5 px-2 text-center text-[11.5px] font-medium rounded-lg transition-colors cursor-pointer select-none ${
                  isActive
                    ? 'text-white font-semibold'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeFilterTab"
                    className="absolute inset-0 bg-white/10 rounded-lg shadow-sm"
                    transition={{ type: 'spring', damping: 30, stiffness: 450 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

