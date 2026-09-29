import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore, SendKeepItem, TrustedDevice } from '../store/appStore';
import { ClipboardItem } from './ClipboardItem';
import { Pin, ChevronDown, ChevronUp, Smartphone, Clipboard, Plus, Layers, Copy, Check, Trash2, X } from 'lucide-react';
import { isImagePath } from '../lib/format';
import { playDialTickSound, playPop } from '../lib/soundEffects';

export const isItemForDevice = (item: SendKeepItem, device: TrustedDevice | null): boolean => {
  if (!device) return false;

  // Check stack sub-items if item is a stack
  if (item.isStack && item.bundleItems && item.bundleItems.length > 0) {
    if (item.bundleItems.some((sub) => isItemForDevice(sub, device))) {
      return true;
    }
  }

  // 1. Direct deviceId match
  if (item.deviceId && (item.deviceId === device.id || item.deviceId === `dev-${device.ip}`)) {
    return true;
  }

  // 2. Target device match (item beamed/dropped to this device)
  if (item.targetDeviceId && (item.targetDeviceId === device.id || item.targetDeviceId === `dev-${device.ip}`)) {
    return true;
  }
  if (item.targetDeviceName && item.targetDeviceName.toLowerCase().trim() === device.name.toLowerCase().trim()) {
    return true;
  }
  if (device.ip && item.targetDeviceIp === device.ip) {
    return true;
  }

  // 3. Sender IP match
  if (device.ip && item.senderIp === device.ip) {
    return true;
  }

  // 4. Sender name / alias match (e.g. Android LocalSend sends alias "SM-M136B" or "G011A")
  if (item.sender && item.sender !== 'Windows Clipboard' && item.sender !== 'You') {
    const sender = item.sender.toLowerCase().trim();
    const devName = device.name.toLowerCase().trim();
    if (sender === devName || sender.includes(devName) || devName.includes(sender)) {
      return true;
    }
    if (device.model && sender === device.model.toLowerCase().trim()) {
      return true;
    }
  }

  return false;
};

export const ItemList: React.FC = () => {
  const {
    items,
    activeFilter,
    activeSource,
    searchQuery,
    connectedDevice,
    setPairModalOpen,
    selectedItemIds,
    clearSelection,
    bundleSelectedItems,
    copySelectedItems,
    deleteSelectedItems,
    beamSelectedItems,
  } = useStore();
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [batchCopied, setBatchCopied] = useState(false);
  const [showJumpToTop, setShowJumpToTop] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleBatchCopy = async () => {
    const success = await copySelectedItems();
    if (success) {
      setBatchCopied(true);
      setTimeout(() => setBatchCopied(false), 1200);
    }
  };

  // Keyboard shortcut: Escape to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedItemIds.length > 0) {
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItemIds, clearSelection]);




  // 1. Filter by Active Source (Device vs Clipboard vs Unified)
  let sourceFiltered = items;
  if (activeSource === 'device') {
    if (connectedDevice) {
      sourceFiltered = items.filter((item) => isItemForDevice(item, connectedDevice));
    } else {
      sourceFiltered = items.filter(
        (item) =>
          item.source === 'device' ||
          (!item.source && item.sender !== 'Windows Clipboard') ||
          Boolean(item.isStack && item.bundleItems?.some((sub) => sub.source === 'device' || (!sub.source && sub.sender !== 'Windows Clipboard')))
      );
    }
  } else if (activeSource === 'clipboard') {
    sourceFiltered = items.filter(
      (item) =>
        item.source === 'clipboard' ||
        (!item.source && item.sender === 'Windows Clipboard') ||
        Boolean(item.isStack && item.bundleItems?.some((sub) => sub.source === 'clipboard' || (!sub.source && sub.sender === 'Windows Clipboard')))
    );
  }

  // Helper to check if item or its subitems match category
  const matchesCategory = (item: SendKeepItem, filter: string): boolean => {
    if (filter === 'all') return true;

    if (item.isStack && item.bundleItems && item.bundleItems.length > 0) {
      return item.bundleItems.some((sub) => matchesCategory(sub, filter));
    }

    const isImage =
      item.fileType?.toLowerCase().includes('image') ||
      isImagePath(item.name) ||
      isImagePath(item.path) ||
      Boolean(item.content && isImagePath(item.content));

    const isLink = Boolean(
      item.content && (item.content.startsWith('http://') || item.content.startsWith('https://'))
    );

    const isTxt = Boolean(
      item.name?.toLowerCase().endsWith('.txt') ||
      item.fileType === 'text/plain'
    );

    const isNote = Boolean(item.content && !isLink && !isImage && !item.path);

    if (filter === 'media') return isImage;
    if (filter === 'links') return isLink;
    if (filter === 'notes') return isNote || isTxt;
    if (filter === 'files') return !isImage && !isLink && (!isNote || Boolean(item.path));

    return true;
  };

  // 2. Filter by Category Tab
  let categoryFiltered = sourceFiltered.filter((item) => matchesCategory(item, activeFilter));

  // 3. Filter by Search Query
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    categoryFiltered = categoryFiltered.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.content && item.content.toLowerCase().includes(q)) ||
        item.sender.toLowerCase().includes(q) ||
        Boolean(
          item.isStack &&
            item.bundleItems?.some(
              (sub) =>
                sub.name.toLowerCase().includes(q) ||
                (sub.content && sub.content.toLowerCase().includes(q)) ||
                sub.sender.toLowerCase().includes(q)
            )
        )
    );
  }

  const pinnedItems = categoryFiltered.filter((i) => i.pinned);
  const recentItems = categoryFiltered.filter((i) => !i.pinned);

  const isDeviceConnected = Boolean(
    connectedDevice &&
    connectedDevice.status === 'online' &&
    connectedDevice.name &&
    connectedDevice.name !== 'No Phone Connected' &&
    connectedDevice.name !== 'No Device Connected'
  );

  // Transition key that triggers smooth cascading entrance whenever source, device, filter or query changes
  const feedTransitionKey = `${activeSource}-${activeFilter}-${connectedDevice?.id || connectedDevice?.name || 'none'}-${searchQuery}`;

  // Reset scroll position to top when switching category or device
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeFilter, activeSource, connectedDevice?.id, connectedDevice?.name]);



  const feedContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.038,
        delayChildren: 0.02,
      },
    },
  };



  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#090a0e] overflow-hidden relative">
      {/* Subtle Feather Gradients for Smooth Top/Bottom Feed Transitions */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-3.5 bg-gradient-to-b from-[#090a0e] to-transparent z-10" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-3.5 bg-gradient-to-t from-[#090a0e] to-transparent z-10" />

      {/* Floating Jump to Top Button */}
      <AnimatePresence>
        {showJumpToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -10 }}
            transition={{ duration: 0.15 }}
            onClick={() => {
              playDialTickSound();
              scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            style={{ backgroundColor: '#181a24', background: '#181a24' }}
            className="absolute top-4 right-5 z-20 p-1.5 rounded-full hover:bg-[#222636] border border-white/[0.15] text-white/70 hover:text-white shadow-xl cursor-pointer transition-colors"
            title="Jump to Top"
          >
            <ChevronUp className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Scrollable Item Feed */}
      <div
        ref={scrollContainerRef}
        onScroll={(e) => {
          const top = e.currentTarget.scrollTop;
          setShowJumpToTop(top > 280);
        }}
        className={`flex-1 overflow-y-auto px-3.5 py-3 custom-scrollbar select-none relative transition-all ${
          selectedItemIds.length > 0 ? 'pb-16' : ''
        }`}
      >
        <div className="min-h-full">
          {categoryFiltered.length === 0 ? (
            <motion.div
              key={`empty-${feedTransitionKey}`}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center justify-center flex-1 min-h-[260px] text-center p-6 text-white/30"
            >
              <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3 text-white/40">
                {activeSource === 'device' ? (
                  <Smartphone className={`w-5 h-5 ${isDeviceConnected ? 'text-emerald-400/60' : 'text-zinc-500'}`} />
                ) : (
                  <Clipboard className="w-5 h-5 text-indigo-400/60" />
                )}
              </div>
              <div className="text-xs font-semibold text-white/60 mb-1">
                {activeSource === 'device'
                  ? connectedDevice
                    ? `No items with ${connectedDevice.name}`
                    : 'No Phone Connected'
                  : 'Shelf is empty'}
              </div>
              <div className="text-[11px] text-white/40 max-w-[220px] leading-relaxed mb-3">
                {activeSource === 'device'
                  ? connectedDevice
                    ? `Beam photos, notes, or files with ${connectedDevice.name} over Wi-Fi`
                    : 'Pair your phone using its local Wi-Fi IP to send and receive items'
                  : 'Copy text, photos, or drag files below to beam or stage them'}
              </div>
              {activeSource === 'device' && !isDeviceConnected && (
                <button
                  onClick={() => setPairModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-300 transition-all cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Pair Mobile Device</span>
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={feedTransitionKey}
              variants={feedContainerVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-2.5"
            >
              {/* 1. PINNED SECTION */}
              {pinnedItems.length > 0 && (
                <section className="flex flex-col gap-2">
                  <button
                    onClick={() => setPinnedCollapsed((prev) => !prev)}
                    className="flex items-center justify-between px-1 py-1 text-[11px] font-semibold text-white/40 hover:text-white/70 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <Pin className="w-3 h-3 text-amber-400 fill-amber-400" />
                      <span className="uppercase tracking-wider text-[10px] font-bold text-amber-400/90">
                        Pinned ({pinnedItems.length})
                      </span>
                    </div>
                    <motion.div
                      animate={{ rotate: pinnedCollapsed ? -90 : 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <ChevronDown className="w-3 h-3 text-white/30" />
                    </motion.div>
                  </button>

                  <AnimatePresence>
                    {!pinnedCollapsed && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex flex-col gap-2"
                      >
                        {pinnedItems.map((item: SendKeepItem) => (
                          <motion.div
                            key={`pinned-${item.id}`}
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                          >
                            <ClipboardItem item={item} />
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              )}

              {/* 2. RECENT / GENERAL SECTION */}
              {recentItems.length > 0 && (
                <section className="flex flex-col gap-2">
                  {pinnedItems.length > 0 && (
                    <div className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white/30 uppercase">
                      Recent
                    </div>
                  )}

                  <AnimatePresence>
                    {recentItems.map((item: SendKeepItem) => (
                      <motion.div
                        key={`recent-${item.id}`}
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <ClipboardItem item={item} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </section>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Floating Bottom Batch Action Bar */}
      <AnimatePresence>
        {selectedItemIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            style={{ backgroundColor: '#121216', background: '#121216' }}
            className="absolute bottom-3 left-3 right-3 z-40 px-3 py-2 rounded-xl border border-white/[0.12] shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_0_1px_rgba(99,102,241,0.3)] flex items-center justify-between select-none"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-5 h-5 rounded-full bg-indigo-500 text-[10px] font-bold text-white flex items-center justify-center shrink-0">
                {selectedItemIds.length}
              </span>
              <span className="text-xs font-semibold text-white/90 truncate">
                {selectedItemIds.length === 1 ? 'item selected' : 'items selected'}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Bundle / Stack Button (if >= 2 items selected) */}
              {selectedItemIds.length >= 2 && (
                <button
                  onClick={() => {
                    playPop();
                    bundleSelectedItems();
                  }}
                  title="Stack into single 3D bundle"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 text-xs font-medium transition-colors cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Stack</span>
                </button>
              )}

              {/* Copy All Button */}
              <button
                onClick={handleBatchCopy}
                title="Copy all selected items to clipboard"
                className="p-1.5 rounded-lg text-white/65 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                {batchCopied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Beam All Button (if connected to device) */}
              {isDeviceConnected && (
                <button
                  onClick={beamSelectedItems}
                  title={`Beam selected items to ${connectedDevice?.name}`}
                  className="p-1.5 rounded-lg text-white/65 hover:text-emerald-400 hover:bg-emerald-500/15 transition-colors cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Delete All Button */}
              <button
                onClick={deleteSelectedItems}
                title="Delete selected items"
                className="p-1.5 rounded-lg text-white/65 hover:text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {/* Clear / Close Selection */}
              <button
                onClick={clearSelection}
                title="Deselect all (Esc)"
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ml-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

