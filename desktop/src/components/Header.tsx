import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, FolderOpen, Globe, Settings, Smartphone, Layers, Check, Plus, PanelLeftClose, Search, Loader2, Wifi, Trash2 } from 'lucide-react';
import { useStore, FilterCategory, DiscoveredDevice, TrustedDevice } from '../store/appStore';
import { ClearMenu } from './ClearMenu';
import { SearchBar } from './SearchBar';
import { playButtonClickSound, playPop, playTick } from '../lib/soundEffects';
import { invoke } from '@tauri-apps/api/core';

export const Header: React.FC = () => {
  const {
    activeSource,
    setActiveSource,
    connectedDevice,
    trustedDevices,
    discoveredDevices,
    removeTrustedDevice,
    pairDeviceByIp,
    setPairModalOpen,
    setSettingsOpen,
    setWebShareOpen,
    items,
    clearTimeWindow,
    clearUnpinned,
    activeFilter,
    setFilter,
    isSearching,
    setIsSearching,
    searchQuery,
    setSearchQuery,
    isDeviceMenuOpen,
    setDeviceMenuOpen,
  } = useStore();

  const [pairingIp, setPairingIp] = useState<string | null>(null);

  const livePairedDevices = useMemo(() => {
    const seen = new Set<string>();
    const list: TrustedDevice[] = [];

    const isDupe = (dev: TrustedDevice) => {
      const normName = (dev.name || '').trim().toLowerCase();
      if (seen.has(dev.id) || seen.has(dev.ip) || (normName && seen.has(normName))) {
        return true;
      }
      return false;
    };

    const addDev = (dev: TrustedDevice) => {
      seen.add(dev.id);
      seen.add(dev.ip);
      if (dev.name) seen.add(dev.name.trim().toLowerCase());
      if (dev.fingerprint) seen.add(dev.fingerprint);
      list.push(dev);
    };

    for (const dev of trustedDevices) {
      if (dev.status === 'online' && !isDupe(dev)) {
        addDev(dev);
      }
    }

    if (
      connectedDevice &&
      connectedDevice.status === 'online' &&
      !isDupe(connectedDevice)
    ) {
      addDev(connectedDevice);
    }
    return list;
  }, [trustedDevices, connectedDevice]);

  const unpairedDiscovered = useMemo(() => {
    const seen = new Set<string>();
    const result: DiscoveredDevice[] = [];

    for (const disc of discoveredDevices) {
      if (disc.status === 'offline') continue;
      const normName = (disc.name || '').trim().toLowerCase();
      const alreadyTrusted = trustedDevices.some(
        (td) =>
          (disc.fingerprint && td.fingerprint === disc.fingerprint) ||
          td.ip === disc.ip ||
          (normName && td.name && td.name.trim().toLowerCase() === normName)
      );
      if (alreadyTrusted) continue;

      const isDupe =
        seen.has(disc.ip) ||
        (disc.fingerprint && seen.has(disc.fingerprint)) ||
        (normName && seen.has(normName));

      if (!isDupe) {
        seen.add(disc.ip);
        if (disc.fingerprint) seen.add(disc.fingerprint);
        if (normName) seen.add(normName);
        result.push(disc);
      }
    }
    return result;
  }, [discoveredDevices, trustedDevices]);

  const handlePairDiscovered = async (dev: DiscoveredDevice) => {
    setPairingIp(dev.ip);
    playTick();
    try {
      const result = await pairDeviceByIp(dev.ip, dev.port);
      if (result) {
        playPop();
        setActiveSource('device');
        setDeviceMenuOpen(false);
      }
    } catch (e) {
      console.warn('Pairing failed:', e);
    } finally {
      setPairingIp(null);
    }
  };

  const popoverRef = useRef<HTMLDivElement>(null);

  const handleOpenFolder = () => {
    invoke('open_downloads_folder').catch(() => {});
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid capturing when already typing in an input or textarea
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if ((e.key === '/' && !isInput) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        setIsSearching(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsSearching]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setDeviceMenuOpen(false);
      }
    };
    if (isDeviceMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDeviceMenuOpen, setDeviceMenuOpen]);

  useEffect(() => {
    const handleWindowMouseLeave = (e: MouseEvent) => {
      if (!e.relatedTarget && !(e as any).toElement) {
        setDeviceMenuOpen(false);
      }
    };
    window.addEventListener('mouseleave', handleWindowMouseLeave);
    return () => window.removeEventListener('mouseleave', handleWindowMouseLeave);
  }, [setDeviceMenuOpen]);


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
            onClick={() => setDeviceMenuOpen(!isDeviceMenuOpen)}
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
                      {connectedDevice?.status === 'online' && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      )}
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
                isDeviceMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Source & Device Popover Dropdown */}
          <AnimatePresence>
            {isDeviceMenuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -6 }}
                transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                style={{ backgroundColor: '#111219', background: '#111219' }}
                className="absolute top-9 left-0 w-64 border border-white/[0.12] rounded-xl p-1.5 shadow-2xl z-50 flex flex-col gap-0.5 select-none text-xs"
              >
              <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                Stream Sources
              </div>

              <button
                onClick={() => {
                  setActiveSource('clipboard');
                  setDeviceMenuOpen(false);
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
                  setDeviceMenuOpen(false);
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

              <div className="px-2 pt-0.5 pb-0.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider flex items-center justify-between">
                <span>Paired Devices</span>
                {livePairedDevices.length > 0 && (
                  <span className="text-[9px] text-emerald-400 font-normal">live</span>
                )}
              </div>

              {livePairedDevices.length > 0 ? (
                livePairedDevices.map((dev) => {
                  const isCur = activeSource === 'device' && (connectedDevice?.id === dev.id || connectedDevice?.ip === dev.ip);
                  return (
                    <div
                      key={dev.id}
                      onClick={() => {
                        useStore.getState().selectTargetDevice(dev);
                        setActiveSource('device');
                        setDeviceMenuOpen(false);
                      }}
                      className={`group w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer ${
                        isCur
                          ? 'bg-white/[0.08] text-white border border-white/[0.08]'
                          : 'text-white/70 hover:text-white hover:bg-white/[0.05] border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-emerald-400 shrink-0">
                          <Smartphone className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-white/90 truncate">{dev.name}</span>
                            <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                              <span>Live</span>
                            </span>
                          </div>
                          <div className="text-[10px] text-white/40 font-mono truncate mt-0.5">
                            {dev.model || 'Device'} • {dev.ip}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {isCur && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mr-1" />}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playPop();
                            removeTrustedDevice(dev.id);
                          }}
                          title={`Unpair / Remove ${dev.name}`}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-white/30 hover:text-rose-400 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/25 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-2.5 py-2 text-[11px] text-white/35 italic">
                  No live devices online
                </div>
              )}

              {unpairedDiscovered.length > 0 && (
                <>
                  <div className="h-px bg-white/[0.06] my-1" />
                  <div className="px-2 pt-0.5 pb-0.5 text-[10px] font-semibold text-emerald-400/90 uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Wifi className="w-2.5 h-2.5 text-emerald-400" />
                      <span>Nearby Discovered</span>
                    </span>
                    <span className="text-[9px] lowercase font-normal text-white/40">unpaired</span>
                  </div>
                  {unpairedDiscovered.map((dev) => {
                    const isPairing = pairingIp === dev.ip;
                    return (
                      <div
                        key={dev.fingerprint || dev.ip}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-white/90 font-medium text-[11px]">
                              {dev.name || 'Nearby Device'}
                            </div>
                            <div className="text-[9.5px] text-white/40 font-mono truncate">
                              {dev.ip}:{dev.port || 53317}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePairDiscovered(dev);
                          }}
                          disabled={isPairing}
                          className="ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 active:bg-emerald-500/40 text-emerald-300 border border-emerald-500/30 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                          title="Send pairing request to this device"
                        >
                          {isPairing ? (
                            <>
                              <Loader2 className="w-2.5 h-2.5 animate-spin text-emerald-300" />
                              <span>Pairing...</span>
                            </>
                          ) : (
                            <span>Pair</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}

              <div className="h-px bg-white/[0.06] my-1" />

              <button
                onClick={() => {
                  setDeviceMenuOpen(false);
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
          {/* Search Toggle */}
          <button
            onClick={() => {
              playButtonClickSound();
              setIsSearching(!isSearching);
              if (isSearching) setSearchQuery('');
            }}
            title="Search History (/ or Ctrl+F)"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isSearching || searchQuery
                ? 'text-white bg-white/10'
                : 'text-white/40 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
          </button>

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

      {/* Search Bar Input (when toggled or active query) */}
      <AnimatePresence>
        {isSearching && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <SearchBar
              onClose={() => {
                setIsSearching(false);
                setSearchQuery('');
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Category Filter Tabs (Squircle Segmented Bar with Gliding Active Pill) */}
      <div className="px-3.5 pb-2.5">
        <nav className="flex items-center p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-1">
          {tabs.map((tab) => {
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  playButtonClickSound();
                  setFilter(tab.key);
                }}
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


