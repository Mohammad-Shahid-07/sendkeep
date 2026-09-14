import React, { useState, useRef, useEffect } from 'react';
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Buttery-smooth physics-based momentum wheel scrolling
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    let target = el.scrollTop;
    let current = el.scrollTop;
    let isRunning = false;
    let rafId: number | null = null;

    const onScroll = () => {
      // Keep target synchronized when dragging scrollbar or using keyboard
      if (!isRunning) {
        target = el.scrollTop;
        current = el.scrollTop;
      }
    };

    const step = () => {
      const diff = target - current;
      if (Math.abs(diff) < 0.4) {
        current = target;
        el.scrollTop = current;
        isRunning = false;
        rafId = null;
        return;
      }

      // Smooth exponential ease-out glide
      current += diff * 0.16;
      el.scrollTop = current;
      rafId = requestAnimationFrame(step);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;

      // Allow nested scrollable areas (e.g. inside expanded stack lists) to scroll natively
      let targetEl = e.target as HTMLElement | null;
      let isNested = false;
      while (targetEl && targetEl !== el) {
        if (
          targetEl.scrollHeight > targetEl.clientHeight &&
          (getComputedStyle(targetEl).overflowY === 'auto' || getComputedStyle(targetEl).overflowY === 'scroll')
        ) {
          isNested = true;
          break;
        }
        targetEl = targetEl.parentElement;
      }
      if (isNested) return;

      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) return;

      e.preventDefault();

      const lineMultiplier = e.deltaMode === 1 ? 32 : 1;
      const delta = e.deltaY * lineMultiplier;

      target = Math.max(0, Math.min(maxScroll, target + delta));

      if (!isRunning) {
        isRunning = true;
        current = el.scrollTop;
        rafId = requestAnimationFrame(step);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);


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

  const isDeviceConnected = Boolean(
    connectedDevice &&
    connectedDevice.status === 'online' &&
    connectedDevice.name &&
    connectedDevice.name !== 'No Phone Connected' &&
    connectedDevice.name !== 'No Device Connected'
  );

  // Transition key that triggers smooth cascading entrance whenever source, device, filter or query changes
  const feedTransitionKey = `${activeSource}-${activeFilter}-${connectedDevice?.id || ''}-${searchQuery}`;

  // Reset scroll position to top when switching category or device
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeFilter, activeSource, connectedDevice?.id]);

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

  const cardItemVariants = {
    hidden: {
      opacity: 0,
      y: 12,
      scale: 0.98,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.22,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#090a0e] overflow-hidden relative">
      {/* Subtle Feather Gradients for Smooth Top/Bottom Feed Transitions */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-3.5 bg-gradient-to-b from-[#090a0e] to-transparent z-10" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-3.5 bg-gradient-to-t from-[#090a0e] to-transparent z-10" />

      {/* Scrollable Item Feed */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3.5 py-3 custom-scrollbar select-none relative"
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
                        className="flex flex-col gap-2 overflow-hidden"
                      >
                        {pinnedItems.map((item: SendKeepItem) => (
                          <motion.div
                            key={item.id}
                            variants={cardItemVariants}
                            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
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
                        key={item.id}
                        variants={cardItemVariants}
                        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
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

    </div>
  );
};

