import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Check,
  X,
  FolderOpen,
  AlertCircle,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../store/appStore';
import { CustomFileIcon } from './CustomFileIcon';
import { extOf } from '../lib/fileType';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const kb = bytes / 1024;
  const mb = kb / 1024;
  const gb = mb / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  if (kb >= 1) return `${kb.toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  const kb = bytesPerSec / 1024;
  const mb = kb / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
  return `${kb.toFixed(0)} KB/s`;
}


export const TransferProgressOverlay: React.FC = () => {
  const { activeTransfer, setActiveTransfer, cancelTransfer } = useStore();

  React.useEffect(() => {
    if (!activeTransfer) return;
    if (
      activeTransfer.status === 'cancelled' ||
      activeTransfer.status === 'failed' ||
      activeTransfer.status === 'completed'
    ) {
      const delay = activeTransfer.status === 'cancelled' ? 2000 : 3500;
      const timer = window.setTimeout(() => {
        const curr = useStore.getState().activeTransfer;
        if (curr?.sessionId === activeTransfer.sessionId) {
          setActiveTransfer(null);
        }
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [activeTransfer?.sessionId, activeTransfer?.status, setActiveTransfer]);

  if (!activeTransfer) return null;

  const isReceive = activeTransfer.direction === 'receive';
  const isCompleted = activeTransfer.status === 'completed';
  const isFailed = activeTransfer.status === 'failed';
  const isCancelled = activeTransfer.status === 'cancelled';
  const isInProgress = activeTransfer.status === 'in_progress';

  const progressFrac =
    activeTransfer.bytesTotal > 0
      ? Math.min(1, Math.max(0, activeTransfer.bytesCurrent / activeTransfer.bytesTotal))
      : 0;

  const percent = Math.round(progressFrac * 100);


  const handleOpenFolder = () => {
    if (activeTransfer.localFilePath) {
      invoke('open_file_in_folder', { path: activeTransfer.localFilePath }).catch(() => {
        invoke('open_downloads_folder').catch(() => {});
      });
    } else {
      invoke('open_downloads_folder').catch(() => {});
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        onMouseEnter={() => {
          invoke('set_interactive', { interactive: true }).catch(() => {});
        }}
        className="fixed bottom-3 left-3 right-3 z-[9999] pointer-events-auto select-none max-w-[326px] mx-auto"
      >
        <div className="relative rounded-2xl bg-[#131419]/96 backdrop-blur-2xl border border-white/[0.08] shadow-[0_12px_36px_rgba(0,0,0,0.8)] p-3 flex flex-col gap-2.5 overflow-hidden">
          {/* Top Row: Device/Status + Action Controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  isCompleted
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : isCancelled
                    ? 'bg-amber-500/15 text-amber-400'
                    : isFailed
                    ? 'bg-rose-500/15 text-rose-400'
                    : isReceive
                    ? 'bg-sky-500/15 text-sky-400'
                    : 'bg-indigo-500/15 text-indigo-400'
                }`}
              >
                {isCompleted ? (
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                ) : isCancelled ? (
                  <X className="w-3.5 h-3.5" />
                ) : isFailed ? (
                  <AlertCircle className="w-3.5 h-3.5" />
                ) : isReceive ? (
                  <ArrowDown className="w-3.5 h-3.5 animate-pulse" />
                ) : (
                  <ArrowUp className="w-3.5 h-3.5 animate-pulse" />
                )}
              </div>

              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-white/95 truncate">
                  {isCompleted
                    ? isReceive
                      ? `Received from ${activeTransfer.peerAlias || 'Device'}`
                      : `Sent to ${activeTransfer.peerAlias || 'Device'}`
                    : isCancelled
                    ? 'Transfer Cancelled'
                    : isFailed
                    ? 'Transfer Failed'
                    : isReceive
                    ? `Receiving from ${activeTransfer.peerAlias || 'Device'}`
                    : `Sending to ${activeTransfer.peerAlias || 'Device'}`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isCompleted && (
                <button
                  onClick={handleOpenFolder}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-medium text-white/80 hover:text-white transition-colors cursor-pointer"
                  title="Show file in folder"
                >
                  <FolderOpen className="w-3 h-3 text-white/60" />
                  <span>Open</span>
                </button>
              )}

              {isInProgress && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelTransfer(activeTransfer.sessionId);
                    setActiveTransfer(null);
                  }}
                  className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-[11px] font-medium text-rose-300 transition-colors cursor-pointer"
                  title="Cancel transfer"
                >
                  Cancel
                </button>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isInProgress) {
                    cancelTransfer(activeTransfer.sessionId);
                  }
                  setActiveTransfer(null);
                }}
                className="p-1 rounded-lg text-white/35 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* File & Progress Row */}
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
            <div className="w-6 h-6 rounded-md bg-black/40 flex items-center justify-center shrink-0">
              <CustomFileIcon
                path={activeTransfer.localFilePath}
                ext={extOf(activeTransfer.fileName || activeTransfer.localFilePath || '')}
                width={18}
                height={18}
              />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[11.5px] font-medium text-white/90 truncate" title={activeTransfer.fileName}>
                {activeTransfer.fileName}
              </span>
              <span className="text-[10px] text-white/45 font-mono truncate">
                {formatBytes(activeTransfer.bytesCurrent)} / {formatBytes(activeTransfer.bytesTotal)}
                {!isCompleted && !isCancelled && !isFailed && activeTransfer.speedBytesPerSec > 0
                  ? ` · ${formatSpeed(activeTransfer.speedBytesPerSec)}`
                  : isCompleted
                  ? ' · Delivered'
                  : ''}
              </span>
            </div>
            {isInProgress && (
              <span className="text-[10.5px] font-bold text-white/60 font-mono shrink-0">
                {percent}%
              </span>
            )}
          </div>

          {/* Sleek Minimal Progress Track */}
          <div className="w-full h-[2px] bg-white/[0.06] rounded-full overflow-hidden relative">
            <motion.div
              className={`h-full rounded-full ${
                isCompleted
                  ? 'bg-emerald-400'
                  : isCancelled
                  ? 'bg-amber-400'
                  : isFailed
                  ? 'bg-rose-400'
                  : 'bg-indigo-500'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.15 }}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

