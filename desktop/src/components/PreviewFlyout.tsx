import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Copy,
  Check,
  FolderOpen,
  ExternalLink,
  Image as ImageIcon,
  CornerDownLeft,
  FileText,
  Globe,
  Layers,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useStore, SendKeepItem } from '../store/appStore';
import { formatBytes } from '../lib/format';
import { extOf } from '../lib/fileType';
import { CustomFileIcon } from './CustomFileIcon';
import { playButtonClickSound, playToggleSound, playCopy } from '../lib/soundEffects';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

const COLOR_HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function isImagePath(pathOrName: string): boolean {
  return Boolean(pathOrName && pathOrName.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg|avif|ico|tiff)$/i));
}

function parseUrlInfo(urlStr: string) {
  try {
    const parsed = new URL(urlStr);
    let domain = parsed.hostname.replace(/^www\./, '');
    let service = 'Website';

    if (domain.includes('github.com')) service = 'GitHub';
    else if (domain.includes('youtube.com') || domain.includes('youtu.be')) service = 'YouTube';
    else if (domain.includes('twitter.com') || domain.includes('x.com')) service = 'X (Twitter)';
    else if (domain.includes('reddit.com')) service = 'Reddit';
    else if (domain.includes('figma.com')) service = 'Figma';
    else if (domain.includes('google.com')) service = 'Google';
    else if (domain.includes('spotify.com')) service = 'Spotify';
    else if (domain.includes('discord.com')) service = 'Discord';

    return { domain, service, cleanUrl: urlStr };
  } catch {
    return { domain: urlStr, service: 'Link', cleanUrl: urlStr };
  }
}

/** Bulletproof Image loader for Windows Tauri (resolves local .bmp/.png via read_image_base64) */
const FlyoutImage: React.FC<{
  path?: string;
  previewUrl?: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  maxH?: number | string;
}> = ({ path, previewUrl, alt, className = '', style, maxH = '240px' }) => {
  const [src, setSrc] = useState<string>(() => previewUrl || '');
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(!previewUrl);

  useEffect(() => {
    let active = true;
    setHasError(false);

    if (previewUrl) {
      setSrc(previewUrl);
      setIsLoading(false);
      return;
    }

    if (path) {
      setIsLoading(true);
      // Directly request base64 from Tauri Rust backend for 100% reliable local image loading
      invoke<string>('read_image_base64', { path })
        .then((b64) => {
          if (active && b64) {
            setSrc(b64);
            setIsLoading(false);
          }
        })
        .catch(() => {
          // Fallback to convertFileSrc
          if (active) {
            try {
              const fileSrc = convertFileSrc(path);
              setSrc(fileSrc);
              setIsLoading(false);
            } catch {
              setHasError(true);
              setIsLoading(false);
            }
          }
        });
    } else {
      setHasError(true);
      setIsLoading(false);
    }

    return () => {
      active = false;
    };
  }, [path, previewUrl]);

  const handleError = () => {
    if (path && !src.startsWith('data:')) {
      invoke<string>('read_image_base64', { path })
        .then((b64) => {
          if (b64) {
            setSrc(b64);
            setIsLoading(false);
          } else {
            setHasError(true);
          }
        })
        .catch(() => setHasError(true));
    } else {
      setHasError(true);
    }
  };

  if (hasError || (!src && !isLoading)) {
    return (
      <div className="w-full min-h-[80px] py-4 bg-white/[0.04] rounded-lg flex flex-col items-center justify-center gap-1.5 text-white/40">
        <CustomFileIcon path={path} ext={extOf(path || alt)} width={32} height={32} />
        <span className="text-[11px] font-mono font-medium text-white/50 uppercase">
          {extOf(path || alt) || 'FILE'}
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full flex items-center justify-center overflow-hidden">
      {isLoading && (
        <div className="w-full h-32 bg-white/[0.03] animate-pulse rounded-lg flex items-center justify-center">
          <CustomFileIcon path={path} ext={extOf(path || alt)} width={24} height={24} />
        </div>
      )}
      {src && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setIsLoading(false)}
          onError={handleError}
          className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-150`}
          style={{
            ...style,
            maxHeight: maxH,
          }}
          draggable={false}
        />
      )}
    </div>
  );
};

export const PreviewFlyout: React.FC<{ isRight?: boolean }> = ({ isRight: isRightProp }) => {
  const { previewItemId, setPreviewItemId, items, settings } = useStore();
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [copiedSubId, setCopiedSubId] = useState<string | null>(null);
  const [selectedSubItemIds, setSelectedSubItemIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const flyoutRef = useRef<HTMLDivElement>(null);

  const item: SendKeepItem | undefined = items.find((i) => i.id === previewItemId);

  // Reset state when preview target changes
  useEffect(() => {
    setSelectedSubItemIds(new Set());
    setCopiedSubId(null);
  }, [previewItemId]);

  // Set default view mode based on item content
  useEffect(() => {
    if (item?.isStack && item.bundleItems) {
      const hasImages = item.bundleItems.some(
        (b) => b.fileType?.includes('image') || isImagePath(b.name || '') || isImagePath(b.path || '')
      );
      setViewMode(hasImages ? 'cards' : 'list');
    }
  }, [item?.id]);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewItemId(null);
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      if (
        flyoutRef.current &&
        !flyoutRef.current.contains(e.target as Node) &&
        !(e.target as Element).closest('.item-card') &&
        !(e.target as Element).closest('[data-preview-trigger]')
      ) {
        setPreviewItemId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [setPreviewItemId]);

  if (!item) return null;

  const isRight = isRightProp ?? settings.stickPosition === 'right';
  const isImage = Boolean(
    item.fileType?.toLowerCase().includes('image') ||
      isImagePath(item.name || '') ||
      isImagePath(item.path || '')
  );

  const isLink = Boolean(
    item.content && (item.content.startsWith('http://') || item.content.startsWith('https://'))
  );

  const isColor = Boolean(item.content && COLOR_HEX_RE.test(item.content.trim()));

  const isBundle = Boolean(item.isStack && item.bundleItems && item.bundleItems.length > 0);

  const totalBundleSize = useMemo(() => {
    if (!item.bundleItems) return item.size;
    return item.bundleItems.reduce((acc, curr) => acc + (curr.size || 0), 0);
  }, [item.bundleItems, item.size]);

  const handleCopy = (text?: string, subId?: string) => {
    playCopy();
    const textToCopy = text || item.content || item.path || item.name;
    navigator.clipboard.writeText(textToCopy);
    if (subId) {
      setCopiedSubId(subId);
      setTimeout(() => setCopiedSubId(null), 1200);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  const handleDirectPaste = async (text?: string) => {
    playCopy();
    const textToCopy = text || item.content || item.path || item.name;
    await navigator.clipboard.writeText(textToCopy);
    setPasted(true);
    setTimeout(() => setPasted(false), 1200);
    invoke('simulate_paste').catch(() => {});
  };

  const toggleSubItemSelection = (subId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playToggleSound(true);
    setSelectedSubItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  };

  const handleSelectAllSubItems = () => {
    playButtonClickSound();
    if (!item.bundleItems) return;
    if (selectedSubItemIds.size === item.bundleItems.length) {
      setSelectedSubItemIds(new Set());
    } else {
      setSelectedSubItemIds(new Set(item.bundleItems.map((b) => b.id)));
    }
  };

  const handleBatchCopy = () => {
    if (!item.bundleItems || selectedSubItemIds.size === 0) return;
    playButtonClickSound();
    const selected = item.bundleItems.filter((b) => selectedSubItemIds.has(b.id));
    const paths = selected.map((s) => s.path || s.content || s.name).join('\n');
    navigator.clipboard.writeText(paths);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleBatchPaste = async () => {
    if (!item.bundleItems || selectedSubItemIds.size === 0) return;
    playButtonClickSound();
    const selected = item.bundleItems.filter((b) => selectedSubItemIds.has(b.id));
    const paths = selected.map((s) => s.path || s.content || s.name).join('\n');
    await navigator.clipboard.writeText(paths);
    setPasted(true);
    setTimeout(() => setPasted(false), 1200);
    invoke('simulate_paste').catch(() => {});
  };

  return (
    <AnimatePresence>
      <motion.div
        key={item.id}
        ref={flyoutRef}
        initial={{ opacity: 0, x: isRight ? 16 : -16, scale: 0.97 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: isRight ? 12 : -12, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onMouseEnter={() => {
          invoke('set_interactive', { interactive: true }).catch(() => {});
        }}
        style={{
          position: 'fixed',
          top: '20px',
          bottom: '20px',
          [isRight ? 'right' : 'left']: '362px',
          width: '450px',
          maxHeight: 'calc(100vh - 40px)',
          zIndex: 90,
          backgroundColor: '#12141c',
          background: '#12141c',
          boxShadow:
            '0 24px 64px rgba(0, 0, 0, 0.95), 0 8px 24px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}
        className="flex flex-col border border-white/[0.14] rounded-2xl overflow-hidden select-none pointer-events-auto"
      >
        {/* Fixed Header Bar */}
        <div className="h-[52px] px-4 bg-[#161824] border-b border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${
                isBundle
                  ? 'bg-purple-500/15 text-purple-300 border border-purple-500/25'
                  : isImage
                  ? 'bg-pink-500/15 text-pink-300 border border-pink-500/25'
                  : isLink
                  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/25'
                  : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
              }`}
            >
              {isBundle ? (
                <Layers className="w-4 h-4" />
              ) : isImage ? (
                <ImageIcon className="w-4 h-4" />
              ) : isLink ? (
                <Globe className="w-4 h-4" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
            </div>

            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-semibold text-white truncate max-w-[210px]">
                {item.name}
              </span>
              <span className="text-[11px] text-white/50 truncate font-mono">
                {isBundle
                  ? `${item.bundleItems?.length || 0} items · ${formatBytes(totalBundleSize)}`
                  : item.size > 0
                  ? formatBytes(item.size)
                  : isLink
                  ? parseUrlInfo(item.content || '').domain
                  : 'Clipboard Item'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick Copy */}
            <button
              onClick={() => handleCopy()}
              title="Copy to Clipboard"
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {/* Direct Paste */}
            <button
              onClick={() => handleDirectPaste()}
              title="Direct Paste into active window"
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
            >
              {pasted ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <CornerDownLeft className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Open Folder in Explorer (if file path exists) */}
            {item.path && (
              <button
                onClick={() => invoke('open_file_in_folder', { path: item.path }).catch(() => {})}
                title="Reveal in File Explorer"
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Close Flyout */}
            <button
              onClick={() => setPreviewItemId(null)}
              title="Close Preview (Esc)"
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-xs bg-[#12141c]">
          {/* Case 1: Color Preview */}
          {isColor && item.content && (
            <div className="flex flex-col gap-3">
              <div
                className="w-full h-36 rounded-xl border border-white/20 shadow-inner flex items-center justify-center relative overflow-hidden"
                style={{ backgroundColor: item.content.trim() }}
              >
                <span className="px-3.5 py-1.5 rounded-lg bg-black/70 text-white font-mono text-sm font-semibold tracking-wider border border-white/20 shadow-md">
                  {item.content.trim().toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#181a26] border border-white/[0.08]">
                <span className="text-white/60 text-xs">Hex Color Code</span>
                <span className="font-mono text-white font-semibold text-xs">{item.content.trim()}</span>
              </div>
            </div>
          )}

          {/* Case 2: Link Preview */}
          {isLink && item.content && (
            <div className="flex flex-col gap-3">
              {(() => {
                const info = parseUrlInfo(item.content);
                return (
                  <div className="p-4 rounded-xl bg-[#181a26] border border-white/[0.08] flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-blue-400" />
                        <span className="font-semibold text-white text-[13px]">{info.service}</span>
                        <span className="text-white/30">·</span>
                        <span className="text-white/60 text-xs">{info.domain}</span>
                      </div>
                      <button
                        onClick={() => window.open(item.content, '_blank')}
                        title="Open in Browser"
                        className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                    <div
                      onClick={() => window.open(item.content, '_blank')}
                      className="text-blue-400 hover:text-blue-300 transition-colors break-all underline cursor-pointer leading-relaxed text-xs bg-black/30 p-2.5 rounded-lg border border-white/[0.04]"
                    >
                      {item.content}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Case 3: Single Image Preview */}
          {isImage && !isBundle && (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl overflow-hidden bg-[#0c0d12] border border-white/[0.08] flex items-center justify-center p-3 shadow-inner">
                <FlyoutImage
                  path={item.path}
                  previewUrl={item.previewUrl}
                  alt={item.name}
                  className="max-w-full object-contain rounded-lg shadow-md"
                  maxH="440px"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-white/50 px-1 font-mono">
                <span className="truncate max-w-[280px]">{item.name}</span>
                {item.size > 0 && <span>{formatBytes(item.size)}</span>}
              </div>
            </div>
          )}

          {/* Case 4: Stack / Multi-Item Collection (Bundle) */}
          {isBundle && item.bundleItems && (
            <div className="flex flex-col gap-3">
              {/* Collection Sub-Header & Controls */}
              <div className="flex items-center justify-between pb-1 px-1 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white/80">Items in Collection</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-[10px] font-mono text-white/70">
                    {item.bundleItems.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* View Mode Switcher */}
                  <div className="flex items-center bg-[#181a26] border border-white/[0.08] rounded-lg p-0.5">
                    <button
                      onClick={() => setViewMode('cards')}
                      title="Cards View (Visual previews)"
                      className={`p-1 rounded-md transition-colors ${
                        viewMode === 'cards' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      title="Compact List View"
                      className={`p-1 rounded-md transition-colors ${
                        viewMode === 'list' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={handleSelectAllSubItems}
                    className="text-[11px] font-medium text-white/60 hover:text-white transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-white/5"
                  >
                    {selectedSubItemIds.size === item.bundleItems.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>

              {/* View Mode: Cards (High-resolution visual preview cards) */}
              {viewMode === 'cards' ? (
                <div className="flex flex-col gap-3">
                  {item.bundleItems.map((sub, idx) => {
                    const isSelected = selectedSubItemIds.has(sub.id);
                    const isSubImg = Boolean(
                      sub.fileType?.includes('image') ||
                        isImagePath(sub.name || '') ||
                        isImagePath(sub.path || '')
                    );
                    const isSubCopied = copiedSubId === sub.id;

                    return (
                      <div
                        key={sub.id || idx}
                        onClick={(e) => toggleSubItemSelection(sub.id, e)}
                        className={`flex flex-col gap-2 p-3 rounded-xl border transition-all cursor-pointer shadow-md ${
                          isSelected
                            ? 'bg-[#1b1e2c] border-white/40 shadow-[0_0_16px_rgba(255,255,255,0.06)]'
                            : 'bg-[#181a24] border-white/[0.08] hover:border-white/[0.2] hover:bg-[#1a1c28]'
                        }`}
                      >
                        {/* Top Card Strip: Checkbox + Name + Quick Actions */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Checkbox */}
                            <div
                              onClick={(e) => toggleSubItemSelection(sub.id, e)}
                              className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${
                                isSelected
                                  ? 'bg-white border-white text-black shadow-sm'
                                  : 'border-white/30 bg-black/40 hover:border-white/60'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>

                            <span
                              className="text-xs font-semibold text-white truncate max-w-[220px]"
                              title={sub.name}
                            >
                              {sub.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {sub.size > 0 && (
                              <span className="text-[10px] font-mono text-white/50 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.04]">
                                {formatBytes(sub.size)}
                              </span>
                            )}

                            {/* Quick copy individual sub-item */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(sub.path || sub.content || sub.name, sub.id);
                              }}
                              title="Copy item"
                              className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            >
                              {isSubCopied ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>

                            {/* Open in Explorer */}
                            {sub.path && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  invoke('open_file_in_folder', { path: sub.path }).catch(() => {});
                                }}
                                title="Reveal in File Explorer"
                                className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                              >
                                <FolderOpen className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Image Preview Box */}
                        {isSubImg ? (
                          <div
                            onClick={(e) => {
                              // If user clicks the preview, copy it quickly
                              e.stopPropagation();
                              handleCopy(sub.path || sub.content || sub.name, sub.id);
                            }}
                            title="Click to copy image"
                            className="w-full bg-[#0b0c10] rounded-lg overflow-hidden border border-white/[0.04] p-1.5 flex items-center justify-center hover:border-white/20 transition-colors cursor-pointer"
                          >
                            <FlyoutImage
                              path={sub.path}
                              previewUrl={sub.previewUrl}
                              alt={sub.name}
                              className="max-w-full rounded object-contain"
                              maxH="220px"
                            />
                          </div>
                        ) : (
                          <div className="w-full py-4 bg-[#0b0c10] rounded-lg border border-white/[0.04] flex items-center justify-center gap-2">
                            <CustomFileIcon path={sub.path} ext={extOf(sub.name)} width={28} height={28} />
                            <span className="text-xs text-white/70 font-medium">{sub.name}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* View Mode: Compact List Rows */
                <div className="flex flex-col gap-2">
                  {item.bundleItems.map((sub, idx) => {
                    const isSelected = selectedSubItemIds.has(sub.id);
                    const isSubImg = Boolean(
                      sub.fileType?.includes('image') ||
                        isImagePath(sub.name || '') ||
                        isImagePath(sub.path || '')
                    );
                    const isSubCopied = copiedSubId === sub.id;

                    return (
                      <div
                        key={sub.id || idx}
                        onClick={(e) => toggleSubItemSelection(sub.id, e)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#1b1e2c] border-white/40 shadow-sm'
                            : 'bg-[#181a24] border-white/[0.06] hover:bg-[#1a1c28]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Checkbox */}
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                              isSelected ? 'bg-white border-white text-black' : 'border-white/30 bg-black/40'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>

                          {/* Thumbnail */}
                          <div className="w-9 h-9 rounded-lg bg-[#0b0c10] border border-white/[0.06] overflow-hidden flex items-center justify-center shrink-0">
                            {isSubImg ? (
                              <FlyoutImage
                                path={sub.path}
                                previewUrl={sub.previewUrl}
                                alt={sub.name}
                                className="w-full h-full object-cover"
                                maxH="36px"
                              />
                            ) : (
                              <CustomFileIcon path={sub.path} ext={extOf(sub.name)} width={18} height={18} />
                            )}
                          </div>

                          <div className="flex flex-col min-w-0">
                            <span className="text-xs text-white font-medium truncate max-w-[210px]">
                              {sub.name}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] text-white/40 font-mono">
                              {sub.size > 0 && <span>{formatBytes(sub.size)}</span>}
                              <span>·</span>
                              <span className="uppercase">{extOf(sub.name) || 'FILE'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(sub.path || sub.content || sub.name, sub.id);
                            }}
                            title="Copy file"
                            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                          >
                            {isSubCopied ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>

                          {sub.path && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                invoke('open_file_in_folder', { path: sub.path }).catch(() => {});
                              }}
                              title="Reveal in File Explorer"
                              className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                            >
                              <FolderOpen className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Case 5: Standard Text / Note Preview */}
          {!isImage && !isLink && !isColor && !isBundle && item.content && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] text-white/50 px-1 font-mono">
                <span>Plain Text · {item.content.length} characters</span>
                <button
                  onClick={() => handleCopy()}
                  className="text-white/60 hover:text-white transition-colors cursor-pointer"
                >
                  Copy Raw Text
                </button>
              </div>
              <div className="p-4 rounded-xl bg-[#0c0d12] border border-white/[0.08] font-mono text-xs text-white/90 whitespace-pre-wrap break-words leading-relaxed max-h-[460px] overflow-y-auto select-text shadow-inner">
                {item.content}
              </div>
            </div>
          )}
        </div>

        {/* Floating Multi-Selection Batch Action Bar */}
        <AnimatePresence>
          {selectedSubItemIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              style={{
                backgroundColor: '#181a26',
                background: '#181a26',
                borderTop: '1px solid rgba(255, 255, 255, 0.14)',
                boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.7)',
              }}
              className="p-3 flex items-center justify-between shrink-0 select-none"
            >
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-semibold text-white font-mono">
                  {selectedSubItemIds.size} Selected
                </span>
                <button
                  onClick={handleSelectAllSubItems}
                  className="text-xs text-white/60 hover:text-white transition-colors cursor-pointer px-1.5 py-0.5"
                >
                  Clear
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleBatchCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium border border-white/10 transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Selected</span>
                </button>

                <button
                  onClick={handleBatchPaste}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-white/90 transition-colors cursor-pointer shadow-md"
                >
                  <CornerDownLeft className="w-3.5 h-3.5" />
                  <span>Paste</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};
