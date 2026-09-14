import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore, SendKeepItem } from '../store/appStore';
import { ClipboardItem } from './ClipboardItem';
import { Pin, ChevronDown, Smartphone, Clipboard, Plus } from 'lucide-react';
import { isImagePath } from '../lib/format';

export const ItemList: React.FC = () => {
  const {
    items,
    activeFilter,
    activeSource,
    searchQuery,
    connectedDevice,
    setPairModalOpen,
  } = useStore();
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);

  // 1. Filter by Active Source (Phone vs Clipboard vs Unified)
  let sourceFiltered = items;
  if (activeSource === 'device') {
    sourceFiltered = items.filter(
      (item) => item.source === 'device' || (!item.source && item.sender !== 'Windows Clipboard')
    );
  } else if (activeSource === 'clipboard') {
    sourceFiltered = items.filter(
      (item) => item.source === 'clipboard' || (!item.source && item.sender === 'Windows Clipboard')
    );
  }

  // 2. Filter by Category Tab
  let categoryFiltered = sourceFiltered.filter((item) => {
    if (activeFilter === 'all') return true;

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

    if (activeFilter === 'media') return isImage;
    if (activeFilter === 'links') return isLink;
    if (activeFilter === 'notes') return isNote || isTxt;
    if (activeFilter === 'files') return !isImage && !isLink && (!isNote || Boolean(item.path));

    return true;
  });

  // 3. Filter by Search Query
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    categoryFiltered = categoryFiltered.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.content && item.content.toLowerCase().includes(q)) ||
        item.sender.toLowerCase().includes(q)
    );
  }

  const pinnedItems = categoryFiltered.filter((i) => i.pinned);
  const recentItems = categoryFiltered.filter((i) => !i.pinned);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#090a0e] overflow-hidden relative">
      {/* Scrollable Item Feed */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5 custom-scrollbar select-none">
        {/* Empty State */}
        {categoryFiltered.length === 0 && (() => {
          const isDeviceConnected = Boolean(
            connectedDevice &&
            connectedDevice.status === 'online' &&
            connectedDevice.name &&
            connectedDevice.name !== 'No Phone Connected' &&
            connectedDevice.name !== 'No Device Connected'
          );
          return (
            <div className="flex flex-col items-center justify-center h-full min-h-[220px] text-center p-6 text-white/30">
              <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3 text-white/40">
                {activeSource === 'device' ? (
                  <Smartphone className={`w-5 h-5 ${isDeviceConnected ? 'text-emerald-400/60' : 'text-zinc-500'}`} />
                ) : (
                  <Clipboard className="w-5 h-5 text-indigo-400/60" />
                )}
              </div>
              <div className="text-xs font-semibold text-white/60 mb-1">
                {activeSource === 'device'
                  ? isDeviceConnected && connectedDevice
                    ? `No items from ${connectedDevice.name}`
                    : 'No Phone Connected'
                  : 'Shelf is empty'}
              </div>
              <div className="text-[11px] text-white/40 max-w-[220px] leading-relaxed mb-3">
                {activeSource === 'device'
                  ? isDeviceConnected && connectedDevice
                    ? `Beam photos or notes from ${connectedDevice.name} over Wi-Fi`
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
            </div>
          );
        })()}

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

            <AnimatePresence initial={false}>
              {!pinnedCollapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-2 overflow-hidden"
                >
                  {pinnedItems.map((item: SendKeepItem) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ type: 'spring', damping: 28, stiffness: 360 }}
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

            <AnimatePresence initial={false}>
              {recentItems.map((item: SendKeepItem) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 360 }}
                >
                  <ClipboardItem item={item} />
                </motion.div>
              ))}
            </AnimatePresence>
          </section>
        )}
      </div>
    </div>
  );
};
