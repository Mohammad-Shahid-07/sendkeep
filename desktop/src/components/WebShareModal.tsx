import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Globe,
  Copy,
  Check,
  ExternalLink,
  Smartphone,
  RefreshCw,
  FolderDown,
  UploadCloud,
  Layers,
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md pointer-events-auto select-none">
        {/* Full Backdrop Click Dismiss */}
        <div className="absolute inset-0 cursor-pointer" onClick={handleClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 10 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-[420px] max-h-[90vh] bg-[#0c0d12] border border-white/[0.1] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white select-none pointer-events-auto"
        >
          {/* 1. Modal Top Bar */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 pt-3.5 px-4 bg-[#090a0e]/60 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-white">Web Share Mode</h2>
                <p className="text-[11px] text-white/50">Zero-Install Direct Browser Transfer</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.06] hover:border-white/[0.15] flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer pointer-events-auto"
              aria-label="Close Web Share"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 2. Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-5 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
              <div className="relative p-3 bg-white rounded-xl shadow-lg border border-black/10">
                <svg
                  viewBox={`0 0 ${qrSize} ${qrSize}`}
                  className="w-44 h-44 block"
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

                {/* Central Emblem */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-600 to-cyan-500 border-2 border-white flex items-center justify-center shadow-md">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="22" y1="2" x2="11" y2="13"></line>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="mt-3.5 flex items-center gap-2 text-center text-xs text-white/70">
                <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Scan with iPhone or Android camera to connect</span>
              </div>
            </div>

            {/* Direct URL Box */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 flex flex-col gap-2.5">
              <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                Direct Local URL
              </div>
              <div className="flex items-center justify-between gap-2 bg-black/40 border border-white/[0.06] rounded-lg px-3 py-2">
                <span className="font-mono text-xs text-cyan-300 truncate select-all">
                  {shareUrl}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-md hover:bg-white/[0.1] text-white/70 hover:text-white transition-colors cursor-pointer"
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
                    className="p-1.5 rounded-md hover:bg-white/[0.1] text-white/70 hover:text-white transition-colors cursor-pointer"
                    title="Open in default browser"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Shelf Staged Items Summary */}
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">
                    {stagedCount} Shelf {stagedCount === 1 ? 'File' : 'Files'} Available
                  </div>
                  <div className="text-[11px] text-white/50 truncate">
                    Ready for instant download in browser
                  </div>
                </div>
              </div>

              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-xs text-white/80 hover:text-white flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sync</span>
              </button>
            </div>

            {/* How It Works Points */}
            <div className="grid grid-cols-2 gap-2 text-[11px] text-white/60">
              <div className="p-2.5 bg-white/[0.02] border border-white/[0.04] rounded-lg flex items-start gap-2">
                <FolderDown className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
                <span>Guests can download any item from your shelf.</span>
              </div>
              <div className="p-2.5 bg-white/[0.02] border border-white/[0.04] rounded-lg flex items-start gap-2">
                <UploadCloud className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                <span>Guests can drag & drop files to send them back to PC.</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
