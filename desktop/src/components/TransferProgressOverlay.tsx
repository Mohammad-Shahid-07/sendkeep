import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Check,
  X,
  FolderOpen,
  Zap,
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

  const remainingSec =
    activeTransfer.speedBytesPerSec > 0 && activeTransfer.bytesTotal > activeTransfer.bytesCurrent
      ? Math.round((activeTransfer.bytesTotal - activeTransfer.bytesCurrent) / activeTransfer.speedBytesPerSec)
      : 0;

  const etaString = isCompleted
    ? 'Finished'
    : isCancelled
    ? 'Cancelled'
    : isFailed
    ? 'Failed'
    : remainingSec <= 0
    ? 'Calculating...'
    : remainingSec < 60
    ? `~${remainingSec}s left`
    : `~${Math.floor(remainingSec / 60)}m ${remainingSec % 60}s left`;

  const accentGradient = isCompleted
    ? 'from-emerald-500 to-teal-400'
    : isCancelled
    ? 'from-amber-500 to-orange-500'
    : isFailed
    ? 'from-red-500 to-rose-400'
    : isReceive
    ? 'from-cyan-500 to-indigo-500'
    : 'from-indigo-500 to-emerald-400';

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
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
        onMouseEnter={() => {
          invoke('set_interactive', { interactive: true }).catch(() => {});
        }}
        className="fixed bottom-3 right-3 z-[9999] pointer-events-auto select-none w-[380px]"
      >
        <div className="relative rounded-2xl bg-[#12131a]/95 backdrop-blur-xl border border-white/[0.1] shadow-[0_12px_40px_rgba(0,0,0,0.7)] p-3.5 flex flex-col gap-2.5 overflow-hidden">
          {/* Subtle ambient glow top bar */}
          <div
            className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${accentGradient} opacity-70`}
          />

          {/* Header Row: Fixed height h-8 to prevent any vertical jump */}
          <div className="flex items-center justify-between gap-2 h-8">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border border-white/[0.1] ${
                  isCompleted
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                    : isCancelled
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                    : isFailed
                    ? 'bg-red-500/15 text-red-400 border-red-500/20'
                    : 'bg-white/[0.08] text-white/80'
                }`}
              >
                {isCompleted ? (
                  <Check className="w-3.5 h-3.5" />
                ) : isCancelled ? (
                  <X className="w-3.5 h-3.5" />
                ) : isFailed ? (
                  <AlertCircle className="w-3.5 h-3.5" />
                ) : isReceive ? (
                  <ArrowDown className="w-3.5 h-3.5" />
                ) : (
                  <ArrowUp className="w-3.5 h-3.5" />
                )}
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-white truncate">
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
                <span className="text-[10px] text-white/50 truncate">
                  {isCompleted
                    ? isReceive
                      ? 'Finished • Saved to Downloads/SendKeep'
                      : `Finished • Delivered to ${activeTransfer.peerAlias || 'device'}`
                    : isCancelled
                    ? 'Stopped by user'
                    : etaString}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isCompleted && (
                <button
                  onClick={handleOpenFolder}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-[11px] font-medium text-white transition-colors cursor-pointer"
                  title="Show file in folder"
                >
                  <FolderOpen className="w-3 h-3 text-white/70" />
                  <span>Show in Folder</span>
                </button>
              )}

              {isInProgress && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelTransfer(activeTransfer.sessionId);
                    setActiveTransfer(null);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-[11px] font-medium text-red-300 hover:text-red-200 transition-colors cursor-pointer"
                  title="Cancel transfer"
                >
                  <X className="w-3 h-3 text-red-400" />
                  <span>Cancel</span>
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
                className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title={isInProgress ? 'Cancel transfer' : 'Dismiss'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* File & Speed Row: Fixed height h-12 to prevent any vertical jump */}
          <div className="flex items-center justify-between gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 h-12">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0 text-white/70">
                <CustomFileIcon
                  path={activeTransfer.localFilePath}
                  ext={extOf(activeTransfer.fileName || activeTransfer.localFilePath || '')}
                  width={22}
                  height={22}
                />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-medium text-white/95 truncate" title={activeTransfer.fileName}>
                  {activeTransfer.fileName}
                </span>
                <span className="text-[10px] text-white/50 truncate">
                  {formatBytes(activeTransfer.bytesCurrent)} / {formatBytes(activeTransfer.bytesTotal)} ({percent}%)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] border border-white/[0.08] text-[11px] font-medium text-white/90 shrink-0">
              {isCompleted ? (
                <>
                  <Zap className="w-3 h-3 text-white/80" />
                  <span className="font-medium text-white">Delivered</span>
                </>
              ) : isCancelled ? (
                <span className="text-amber-400 font-medium">Cancelled</span>
              ) : isFailed ? (
                <span className="text-red-400 font-medium">Failed</span>
              ) : (
                <span className="font-mono">{formatSpeed(activeTransfer.speedBytesPerSec)}</span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden relative">
            <motion.div
              className={`h-full bg-gradient-to-r ${accentGradient} rounded-full`}
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
