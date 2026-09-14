import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  X,
  Copy,
  Check,
  FolderOpen,
  ExternalLink,
  Image as ImageIcon,
  Code2,
  CornerDownLeft,
  FileText,
} from 'lucide-react';
import { useStore, SendKeepItem } from '../store/appStore';
import { formatBytes } from '../lib/format';
import { getFileKind, extOf } from '../lib/fileType';
import { CustomFileIcon } from './CustomFileIcon';
import { playCopy, playPop } from '../lib/soundEffects';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

export const PreviewFlyout: React.FC = () => {
  const { previewItemId, setPreviewItemId, items } = useStore();
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [imgDimensions, setImgDimensions] = useState<{ w: number; h: number } | null>(null);
  const [imgLoadFailed, setImgLoadFailed] = useState(false);

  const item: SendKeepItem | undefined = items.find((i) => i.id === previewItemId);

  useEffect(() => {
    setImgLoadFailed(false);
    setImgDimensions(null);
  }, [previewItemId]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewItemId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setPreviewItemId]);

  const handleClose = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    playPop();
    setPreviewItemId(null);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item) return;
    playCopy();
    const textToCopy = item.content || item.path || item.name;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleDirectPaste = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item) return;
    playCopy();
    const textToCopy = item.content || item.path || item.name;
    await navigator.clipboard.writeText(textToCopy);
    setPasted(true);
    setTimeout(() => setPasted(false), 1400);

    invoke('simulate_paste').catch((err) => {
      console.warn('Direct paste failed:', err);
    });
  };

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item?.path) {
      invoke('open_file_in_folder', { path: item.path }).catch(() => {});
    }
  };

  const handleOpenBrowser = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item?.content) {
      window.open(item.content, '_blank');
    }
  };

  const isImage = Boolean(
    item?.fileType?.toLowerCase().includes('image') ||
      item?.name?.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i)
  );

  const isLink = Boolean(
    item?.content && (item.content.startsWith('http://') || item.content.startsWith('https://'))
  );

  const isCode = Boolean(
    item?.content &&
      (item.content.includes('{') ||
        item.content.includes('const ') ||
        item.content.includes('function') ||
        item.content.includes('import ') ||
        item?.name?.match(/\.(ts|js|tsx|jsx|rs|py|json|html|css|cpp|c|go)$/i))
  );

  const imgSrc = item?.previewUrl || (item?.path ? convertFileSrc(item.path) : '');

  const wordCount = item?.content
    ? item.content.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const lineCount = item?.content ? item.content.split('\n').length : 0;

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          key="shelf-preview-inspector"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ type: 'spring', damping: 30, stiffness: 380 }}
          className="absolute inset-0 z-50 flex flex-col bg-[#0c0d14] pointer-events-auto select-none"
        >
          {/* Header Bar */}
          <div className="h-14 px-3.5 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between shrink-0">
            {/* Back Button */}
            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 text-white/80 hover:text-white transition-all text-xs font-medium cursor-pointer"
              title="Return to Shelf (Esc)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            {/* Type Indicator */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] text-white/70">
              {isImage ? (
                <>
                  <ImageIcon className="w-3.5 h-3.5 text-pink-400" />
                  <span className="font-medium text-pink-300">Image</span>
                </>
              ) : isCode ? (
                <>
                  <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-medium text-emerald-300">Code</span>
                </>
              ) : isLink ? (
                <>
                  <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                  <span className="font-medium text-sky-300">Link</span>
                </>
              ) : item.content && !item.path ? (
                <>
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-medium text-amber-300">Note</span>
                </>
              ) : (
                <>
                  <CustomFileIcon
                    path={item.path}
                    ext={extOf(item.name || item.path || '')}
                    width={15}
                    height={15}
                  />
                  <span className="font-medium text-indigo-300">
                    {getFileKind(item.path || item.name || '').label}
                  </span>
                </>
              )}
            </div>

            {/* Close Cross */}
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer"
              title="Close Preview (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 custom-scrollbar select-text">
            {/* Title / Name Header */}
            <div className="flex flex-col gap-1 select-none">
              <h3 className="text-sm font-semibold text-white/95 leading-snug break-words">
                {item.name}
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-white/40">
                <span>From {item.sender || (item.source === 'device' ? 'Galaxy M13' : 'Windows')}</span>
                <span>•</span>
                <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            {/* 1. Image Preview */}
            {isImage && (
              <div className="flex flex-col items-center gap-3 select-none">
                {imgLoadFailed || !imgSrc ? (
                  <div className="flex flex-col items-center justify-center p-8 gap-3 rounded-xl bg-white/[0.03] border border-white/[0.08] w-full">
                    <CustomFileIcon
                      path={item.path}
                      ext={extOf(item.name || item.path || 'png')}
                      width={64}
                      height={64}
                    />
                    <span className="text-xs font-medium text-white/70 max-w-full truncate">{item.name}</span>
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-white/[0.1] bg-black/50 flex items-center justify-center max-h-[46vh] w-full shadow-lg">
                    <img
                      src={imgSrc}
                      alt=""
                      className="max-h-[46vh] max-w-full object-contain rounded-lg"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        setImgDimensions({ w: img.naturalWidth, h: img.naturalHeight });
                      }}
                      onError={() => setImgLoadFailed(true)}
                    />
                  </div>
                )}
                {imgDimensions && (
                  <div className="flex items-center gap-2.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[11px] font-mono text-white/60">
                    <span>
                      {imgDimensions.w} × {imgDimensions.h} px
                    </span>
                    <span>•</span>
                    <span>{formatBytes(item.size)}</span>
                  </div>
                )}
              </div>
            )}

            {/* 2. Text / Code Preview */}
            {!isImage && item.content && !isLink && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] text-white/40 font-mono select-none px-1">
                  <span>{lineCount} {lineCount === 1 ? 'line' : 'lines'} • {wordCount} words</span>
                  <span>{item.content.length} chars</span>
                </div>
                <div className="rounded-xl bg-black/60 border border-white/[0.08] p-3.5 font-mono text-xs text-zinc-200 leading-relaxed overflow-x-auto whitespace-pre select-text max-h-[52vh] shadow-inner custom-scrollbar">
                  {item.content.split('\n').map((line, idx) => (
                    <div key={idx} className="flex gap-3 hover:bg-white/[0.02] rounded px-1 -mx-1">
                      <span className="text-white/25 select-none text-right w-6 shrink-0 text-[11px]">
                        {idx + 1}
                      </span>
                      <span className="break-all">{line || ' '}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Link Preview */}
            {isLink && (
              <div className="flex flex-col gap-3 p-4 rounded-xl bg-sky-500/[0.06] border border-sky-500/20 shadow-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-sky-400/70 font-semibold select-none">
                  Web Hyperlink
                </span>
                <a
                  href={item.content}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-sky-300 hover:text-sky-200 hover:underline break-all leading-relaxed"
                >
                  {item.content}
                </a>
                <button
                  onClick={handleOpenBrowser}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-xs font-semibold transition-all cursor-pointer shadow"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Default Browser</span>
                </button>
              </div>
            )}

            {/* 3.5. Non-image File Hero Card */}
            {!isImage && !isLink && !item.content && (
              <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.01] border border-white/[0.08] shadow-inner gap-3 select-none">
                <div className="p-3.5 rounded-2xl bg-white/[0.04] shadow-md border border-white/[0.06] flex items-center justify-center">
                  <CustomFileIcon
                    path={item.path}
                    ext={extOf(item.name || item.path || '')}
                    width={72}
                    height={72}
                  />
                </div>
                <div className="flex flex-col items-center text-center gap-1.5 max-w-full">
                  <span className="text-sm font-semibold text-white/95 break-all line-clamp-2">
                    {item.name}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-white/50">
                    <span className="px-2 py-0.5 rounded-full bg-white/[0.08] font-mono text-white/80 font-medium">
                      {(extOf(item.name || item.path || '') || 'FILE').toUpperCase()}
                    </span>
                    <span>•</span>
                    <span>{getFileKind(item.path || item.name || '').label}</span>
                    {item.size > 0 && (
                      <>
                        <span>•</span>
                        <span>{formatBytes(item.size)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 4. File Path and Details */}
            {item.path && (
              <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs">
                <div className="flex items-center justify-between select-none">
                  <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                    File Location
                  </span>
                  <button
                    onClick={handleOpenFolder}
                    className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Show in Explorer</span>
                  </button>
                </div>
                <div className="font-mono text-[11px] text-white/70 bg-black/40 p-2.5 rounded-lg border border-white/5 break-all select-text">
                  {item.path}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-white/40 select-none pt-0.5">
                  <span>Kind: {getFileKind(item.path).label}</span>
                  <span>•</span>
                  <span>Size: {formatBytes(item.size)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Dock Action Bar */}
          <div className="p-3 border-t border-white/[0.08] bg-white/[0.02] flex items-center gap-2 shrink-0 select-none">
            {/* Direct Paste into Active Window */}
            <button
              onClick={handleDirectPaste}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-xs font-semibold transition-all cursor-pointer shadow-sm"
              title="Inject directly into foreground app (Ctrl+V)"
            >
              {pasted ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Pasted!</span>
                </>
              ) : (
                <>
                  <CornerDownLeft className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Paste (Ctrl+V)</span>
                </>
              )}
            </button>

            {/* Quick Copy */}
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white/90 text-xs font-semibold transition-all cursor-pointer shadow-sm"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
