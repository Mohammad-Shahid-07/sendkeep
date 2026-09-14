import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronLeft,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { useStore } from '../store/appStore';
import { playPop, playTick } from '../lib/soundEffects';
import { generateQrMatrix } from '../lib/qrCode';
import { openUrl } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';

export const WebShareModal: React.FC = () => {
  const { isWebShareOpen, setWebShareOpen, webShareInfo, fetchWebShareInfo, syncWebShareItems, items } = useStore();
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (isWebShareOpen) {
      invoke('set_interactive', { interactive: true });
      fetchWebShareInfo();
      syncWebShareItems();

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleClose();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }
  }, [isWebShareOpen]);

  if (!isWebShareOpen) return null;

  const shareUrl = webShareInfo?.url || 'http://127.0.0.1:53317/web';
  const qrMatrix = generateQrMatrix(shareUrl);
  const qrSize = qrMatrix.length;

  const handleClose = () => {
    playPop();
    setWebShareOpen(false);
  };

  const handleCopy = async () => {
    playTick();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleOpenBrowser = () => {
    playPop();
    try {
      openUrl(shareUrl);
    } catch {
      window.open(shareUrl, '_blank');
    }
  };

  const handleManualSync = async () => {
    playTick();
    setIsSyncing(true);
    await syncWebShareItems();
    await fetchWebShareInfo();
    setTimeout(() => setIsSyncing(false), 400);
  };

  const stagedCount = items.filter((i) => i.path && i.path.trim().length > 0).length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="absolute inset-0 z-50 flex flex-col bg-[#090a0e] pointer-events-auto select-none overflow-hidden text-white"
      >
        {/* 1. Native Top Header: Back Navigation & Close (Exact Settings Style) */}
        <div className="flex items-center justify-between px-3.5 h-10 border-b border-white/[0.06] shrink-0 bg-[#090a0e]">
          <button
            onClick={handleClose}
            className="flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white transition-colors cursor-pointer py-1 px-2 -ml-1.5 rounded-lg hover:bg-white/[0.06]"
            title="Back to Shelf (Esc)"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <span className="text-xs font-semibold text-white/50 tracking-tight">Web Share</span>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white flex items-center justify-center transition-colors cursor-pointer -mr-1"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Scrollable Content (Exact Settings Style) */}
        <div className="settings-scroll-list flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1">
          {/* Clean QR Code Display */}
          <div className="flex flex-col items-center justify-center pt-3 pb-2">
            <div className="p-3.5 bg-white rounded-2xl shadow-xl flex items-center justify-center">
              <svg
                viewBox={`0 0 ${qrSize} ${qrSize}`}
                className="w-40 h-40 block"
                shapeRendering="crispEdges"
              >
                {qrMatrix.map((row, r) =>
                  row.map((cell, c) =>
                    cell ? (
                      <rect
                        key={`${r}-${c}`}
                        x={c}
                        y={r}
                        width={1}
                        height={1}
                        fill="#0b0f19"
                      />
                    ) : null
                  )
                )}
              </svg>
            </div>
            <p className="text-xs text-white/60 text-center mt-3 max-w-[250px] leading-relaxed">
              Scan with your phone camera to share files directly in browser
            </p>
          </div>

          <div className="setting-divider my-2" />

          <div className="setting-group-label">Browser Access</div>

          {/* Direct URL Row */}
          <div className="setting-row vertical">
            <div className="setting-info">
              <div className="setting-title">Web Address</div>
              <div className="setting-desc">Open in any browser on the same Wi-Fi</div>
            </div>
            <div className="w-full flex items-center justify-between gap-2 p-2 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.14] transition-colors">
              <span className="font-mono text-xs text-white/90 truncate select-all">{shareUrl}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  title="Copy URL"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={handleOpenBrowser}
                  className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  title="Open in browser"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="setting-divider" />

          {/* Local Network Info */}
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-title">Local Network</div>
              <div className="setting-desc">Connected over local port {webShareInfo?.port || 53317}</div>
            </div>
            <div className="text-[11px] font-mono text-white/70 bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06] shrink-0">
              Port {webShareInfo?.port || 53317}
            </div>
          </div>

          <div className="setting-divider" />

          {/* Zero Install */}
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-title">Zero Installation</div>
              <div className="setting-desc">No app needed on the receiving phone</div>
            </div>
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md shrink-0">
              Ready
            </span>
          </div>

          <div className="setting-divider" />

          {/* Staged Items Info */}
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-title">Shelf Files</div>
              <div className="setting-desc">
                {stagedCount} {stagedCount === 1 ? 'file' : 'files'} available to guests
              </div>
            </div>
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              title="Sync shelf files"
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-white/70 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

