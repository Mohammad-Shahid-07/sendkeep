import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Copy,
  Check,
  Pin,
  Trash2,
  ChevronUp,
  Maximize2,
  CornerDownLeft,
  Smartphone,
  Layers,
} from 'lucide-react';
import { SendKeepItem, useStore } from '../store/appStore';
import { playCopy, playBeam, playPop, playDelete } from '../lib/soundEffects';
import { formatBytes, relativeTime, isImagePath } from '../lib/format';
import { getFileKind, extOf } from '../lib/fileType';
import { CustomFileIcon, FileStackPhoto } from './CustomFileIcon';
import { LinkPreviewCard } from './LinkPreviewCard';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

interface Props {
  item: SendKeepItem;
}

interface ImageThumbnailProps {
  path?: string;
  previewUrl?: string;
  name?: string;
}

const ImageThumbnail: React.FC<ImageThumbnailProps> = ({ path, previewUrl, name }) => {
  const [src, setSrc] = useState<string>(previewUrl || (path ? convertFileSrc(path) : ''));
  const [loadFailed, setLoadFailed] = useState(false);

  React.useEffect(() => {
    if (previewUrl) {
      setSrc(previewUrl);
      setLoadFailed(false);
    } else if (path) {
      setSrc(convertFileSrc(path));
      setLoadFailed(false);
    }
  }, [previewUrl, path]);

  const handleError = () => {
    if (path && !src.startsWith('data:')) {
      invoke<string>('read_image_base64', { path })
        .then((b64) => setSrc(b64))
        .catch(() => setLoadFailed(true));
    } else {
      setLoadFailed(true);
    }
  };

  if (loadFailed) {
    return (
      <div className="w-full h-28 rounded-xl bg-white/[0.03] border border-white/[0.08] flex flex-col items-center justify-center gap-2 p-3 text-white/40">
        <CustomFileIcon path={path} ext={extOf(name || path || 'png')} width={40} height={40} />
        <span className="text-xs font-medium text-white/70 truncate max-w-full">
          {name || 'Image'}
        </span>
      </div>
    );
  }

  return (
    <div className="thumb-wrap w-full max-h-48 overflow-hidden rounded-xl bg-black/40 flex items-center justify-center border border-white/[0.06]">
      <img
        src={src}
        alt={name || 'Preview'}
        className="thumb max-h-48 w-full object-contain rounded-xl"
        loading="lazy"
        onError={handleError}
      />
    </div>
  );
};

export const ClipboardItem: React.FC<Props> = ({ item }) => {
  const {
    togglePin,
    toggleStackExpand,
    mergeItems,
    removeItem,
    setPreviewItemId,
    connectedDevice,
    activeDraggingId,
    setActiveDraggingId,
    beamItemToDevice,
  } = useStore();

  const [copied, setCopied] = useState(false);
  const [beamed, setBeamed] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [isMergeTarget, setIsMergeTarget] = useState(false);

  // Content & Type Detection
  const contentIsImgPath = Boolean(item.content && isImagePath(item.content));
  const isImage = Boolean(
    item.fileType?.toLowerCase().includes('image') ||
      isImagePath(item.name) ||
      isImagePath(item.path) ||
      contentIsImgPath
  );

  const effectiveImgPath = item.path || (contentIsImgPath ? item.content : undefined);

  const isLink = Boolean(
    !isImage &&
      item.content &&
      (item.content.startsWith('http://') || item.content.startsWith('https://'))
  );

  const isBundle = Boolean(item.isStack && item.bundleItems && item.bundleItems.length > 0);

  const ext = extOf(item.name || item.path).toLowerCase();
  const isTxtFile = !isImage && !isLink && (ext === 'txt' || item.fileType === 'text/plain');

  const [loadedText, setLoadedText] = useState<string | null>(item.content || null);

  React.useEffect(() => {
    if (item.content) {
      setLoadedText(item.content);
    } else if (isTxtFile && item.path && loadedText === null) {
      invoke<string>('read_text_file', { path: item.path })
        .then((txt) => setLoadedText(txt))
        .catch(() => {});
    }
  }, [item.content, item.path, isTxtFile, loadedText]);

  const effectiveText = item.content || loadedText || '';

  // Plain Note: text that is not an image path, link, or external file
  const isNote = Boolean(!isImage && !isLink && !isBundle && (effectiveText || isTxtFile));

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      playCopy();
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);

      const targetPath = item.path || effectiveImgPath || null;
      const targetContent = effectiveText || item.content || null;

      invoke('copy_item_native', {
        path: targetPath,
        content: targetContent,
        isImage,
      }).catch((err) => {
        console.warn('Native copy fallback:', err);
        const textToCopy = targetContent || targetPath || item.name;
        if (textToCopy) navigator.clipboard.writeText(textToCopy);
      });
    },
    [effectiveImgPath, effectiveText, isImage, item]
  );

  const handleDirectPaste = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      playCopy();
      setPasted(true);
      setTimeout(() => setPasted(false), 1200);

      const targetPath = item.path || effectiveImgPath || null;
      const targetContent = effectiveText || item.content || null;

      // Trigger native rich clipboard placement (CF_DIB / CF_HDROP) and simulated Ctrl+V
      invoke('paste_item_directly', {
        path: targetPath,
        content: targetContent,
        isImage,
      }).catch((err) => {
        console.warn('Direct paste failed:', err);
        const textToCopy = targetContent || targetPath || item.name;
        if (textToCopy) {
          navigator.clipboard.writeText(textToCopy).then(() => {
            invoke('simulate_paste').catch(() => {});
          });
        }
      });
    },
    [effectiveImgPath, effectiveText, isImage, item]
  );

  const handleBeam = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      playBeam();
      setBeamed(true);
      const ok = await beamItemToDevice(item);
      if (ok) {
        console.log('[Beam] Transfer succeeded');
      } else {
        console.warn('[Beam] Transfer failed');
      }
      setTimeout(() => setBeamed(false), 1600);
    },
    [item, beamItemToDevice]
  );

  const handlePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      playPop();
      togglePin(item.id);
    },
    [item.id, togglePin]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      playDelete();
      removeItem(item.id);
    },
    [item.id, removeItem]
  );

  const handleToggleExpand = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      playPop();
      toggleStackExpand(item.id);
    },
    [item.id, toggleStackExpand]
  );

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      if (isBundle) {
        handleToggleExpand(e);
      } else {
        handleCopy(e);
      }
    },
    [isBundle, handleToggleExpand, handleCopy]
  );

  // -------------------------------------------------------------------------
  // Drag & Drop Handling (Native OS Drag + Card-to-Card Stack Merging)
  // -------------------------------------------------------------------------
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('text/sendkeep-item-id', item.id);
      setActiveDraggingId(item.id);

      // Plain text notes and links without physical files: stage temporary file for OLE native drag-out
      if ((isNote || isLink) && !item.path) {
        const txt = effectiveText || item.content || '';
        if (txt) {
          e.dataTransfer.setData('text/plain', txt);
          const defaultName = isLink ? (item.name || 'Link.url') : (item.name || 'Note.txt');
          invoke<string>('stage_drag_text', { content: txt, name: defaultName })
            .then((stagedPath) => {
              invoke('start_drag', { paths: [stagedPath] }).catch(() => {});
            })
            .catch((err) => {
              console.warn('[Drag] Failed to stage text file:', err);
            });
        }
        return;
      }

      // Media and Files: allow both HTML5 and OS drag
      const pathsToDrag: string[] = [];
      if (isBundle && item.bundleItems) {
        for (const sub of item.bundleItems) {
          if (sub.path) pathsToDrag.push(sub.path);
        }
      } else if (item.path) {
        pathsToDrag.push(item.path);
      } else if (effectiveImgPath) {
        pathsToDrag.push(effectiveImgPath);
      }

      if (pathsToDrag.length > 0) {
        // We trigger native OS drag in background without cancelling HTML5 drag completely
        invoke('start_drag', { paths: pathsToDrag }).catch(() => {});
      } else if (effectiveText) {
        e.dataTransfer.setData('text/plain', effectiveText);
      }
    },
    [isNote, isLink, isBundle, item, effectiveText, effectiveImgPath, setActiveDraggingId]
  );

  const handleCardDragOver = (e: React.DragEvent) => {
    const draggingId = activeDraggingId || e.dataTransfer.getData('text/sendkeep-item-id');
    if (draggingId && draggingId !== item.id) {
      e.preventDefault();
      setIsMergeTarget(true);
    }
  };

  const handleCardDragLeave = () => {
    setIsMergeTarget(false);
  };

  const handleCardDrop = (e: React.DragEvent) => {
    setIsMergeTarget(false);
    const draggedId = activeDraggingId || e.dataTransfer.getData('text/sendkeep-item-id');
    if (draggedId && draggedId !== item.id) {
      e.preventDefault();
      e.stopPropagation();
      playPop();
      mergeItems(draggedId, item.id);
      setActiveDraggingId(null);
    }
  };

  return (
    <motion.article
      layout
      data-item-id={item.id}
      className={`item group relative rounded-[16px] bg-[#161619] hover:bg-[#1a1a1f] border border-white/[0.04] hover:border-white/[0.08] transition-all overflow-hidden ${
        item.pinned ? 'ring-1 ring-amber-400/30' : ''
      }${
        isMergeTarget
          ? ' ring-2 ring-indigo-500 shadow-[0_0_24px_rgba(99,102,241,0.6)] !border-indigo-400 !bg-indigo-500/10'
          : ''
      }`}
      onClick={handleCardClick}
      onDragOver={handleCardDragOver}
      onDragLeave={handleCardDragLeave}
      onDrop={handleCardDrop}
    >
      <div
        className="item-main w-full flex flex-col cursor-pointer select-none"
        draggable={!isBundle || !item.isExpanded}
        onDragStart={handleDragStart}
      >
        <div className="body w-full flex flex-col p-3.5 pb-2.5">
          <div className="item-content w-full">
            {/* 1. BUNDLE / STACK (3D FANNED DECK) */}
            {isBundle && item.bundleItems ? (
              item.isExpanded ? (
                /* Expanded List */
                <div className="flex flex-col gap-2 pb-1">
                  <div
                    className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-xs font-semibold text-white/80"
                    onClick={handleToggleExpand}
                  >
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{item.bundleItems.length} items in bundle</span>
                    </div>
                    <ChevronUp className="w-4 h-4 text-white/50 hover:text-white" />
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {item.bundleItems.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-xs text-white/80"
                      >
                        <span className="truncate pr-2">{sub.name}</span>
                        <span className="text-[10px] text-white/40 shrink-0 font-mono">
                          {formatBytes(sub.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Collapsed 3D Fanned Deck */
                <div className="flex flex-col items-center py-2">
                  <div className="bundle-stack-large relative h-28 w-full flex items-center justify-center">
                    {item.fileType === 'bundle/folder' ? (
                      <div className="flex items-center justify-center">
                        <CustomFileIcon isFolder width={104} height={104} />
                      </div>
                    ) : (
                      item.bundleItems
                        .slice(0, 4)
                        .map((sub, pathIndex) => ({ sub, pathIndex }))
                        .reverse()
                        .map(({ sub }, idx, arr) => {
                          const realIndex = arr.length - 1 - idx;
                          const spread = arr.length > 1 ? 22 : 0;
                          const rotSpread = arr.length > 1 ? 8 : 0;
                          const centerOffset = ((arr.length - 1) * spread) / 2;
                          const centerRot = ((arr.length - 1) * rotSpread) / 2;
                          const stackMotion = {
                            x: realIndex * spread - centerOffset,
                            y: realIndex * 4,
                            rotate: realIndex * rotSpread - centerRot,
                            scale: 1 - realIndex * 0.05,
                          };

                          const isSubImg =
                            sub.fileType?.toLowerCase().includes('image') ||
                            isImagePath(sub.name) ||
                            isImagePath(sub.path);
                          const subSrc =
                            sub.previewUrl || (sub.path ? convertFileSrc(sub.path) : '');

                          return (
                            <motion.div
                              key={sub.id}
                              className="bundle-stack-icon-item absolute"
                              animate={stackMotion}
                              style={{ zIndex: 10 - realIndex }}
                            >
                              {isSubImg && subSrc ? (
                                <FileStackPhoto src={subSrc} width={130} height={100} />
                              ) : (
                                <CustomFileIcon
                                  path={sub.path}
                                  ext={extOf(sub.name || sub.path || '')}
                                  width={100}
                                  height={100}
                                />
                              )}
                            </motion.div>
                          );
                        })
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-white/70 mt-1">
                    {item.bundleItems.length} items bundled
                  </span>
                </div>
              )
            ) : null}

            {/* 2. IMAGE PREVIEW */}
            {!isBundle && isImage && (
              <ImageThumbnail
                path={effectiveImgPath}
                previewUrl={item.previewUrl}
                name={item.name}
              />
            )}

            {/* 3. WEB LINK */}
            {!isBundle && !isImage && isLink && <LinkPreviewCard url={item.content!} />}

            {/* 4. TEXT / NOTE / SNIPPET (Clean EdgeDrop Typography) */}
            {!isBundle && !isImage && !isLink && isNote && (
              <div
                className="preview select-text text-[13px] text-zinc-200 leading-[1.45] font-normal line-clamp-3 break-words whitespace-pre-wrap"
                style={{
                  fontFamily:
                    effectiveText.includes('{') ||
                    effectiveText.includes('const ') ||
                    effectiveText.includes('function')
                      ? 'monospace'
                      : 'inherit',
                }}
              >
                {effectiveText}
              </div>
            )}

            {/* 5. GENERIC FILE (Non-image / Non-text) */}
            {!isBundle && !isImage && !isLink && !isNote && (
              <div className="flex items-center gap-3 py-1">
                <CustomFileIcon path={item.path} ext={extOf(item.name || item.path || '')} width={40} height={40} />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-white/90 truncate" title={item.name}>
                    {item.name}
                  </span>
                  <span className="text-[11px] text-white/40">
                    {getFileKind(item.path || item.name || '').label} · {formatBytes(item.size)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Clean Card Footer */}
          {(!isBundle || !item.isExpanded) && (
            <div className="item-footer flex items-center justify-between pt-2 mt-1 text-[11px] text-white/40 select-none">
              <div className="meta flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] font-medium text-white/60">
                  {isImage
                    ? 'image'
                    : isLink
                    ? 'link'
                    : isBundle
                    ? 'stack'
                    : isNote
                    ? 'text'
                    : getFileKind(item.path || item.name || '').kind}
                </span>
                {isImage && item.size > 0 && <span>· {formatBytes(item.size)}</span>}
                {item.hitCount && item.hitCount > 1 ? (
                  <span>· ×{item.hitCount}</span>
                ) : null}
                {copied && <span className="text-emerald-400 font-medium">· Copied!</span>}
              </div>
              <span className="meta-time text-[10px] text-white/40">
                {relativeTime(item.timestamp)}
              </span>
            </div>
          )}
        </div>

        {/* Floating Action Buttons (Top Right on Hover) */}
        <div
          className="actions absolute top-2 right-2 flex items-center gap-1 bg-[#111114]/95 border border-white/[0.1] rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          style={{ display: isBundle && item.isExpanded ? 'none' : undefined }}
        >
          {/* Direct Paste into Active Window (Ctrl+V) */}
          <button
            className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Paste directly into active window (Ctrl+V)"
            onClick={handleDirectPaste}
          >
            {pasted ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <CornerDownLeft className="w-3.5 h-3.5 text-indigo-400" />
            )}
          </button>

          {/* Beam to Phone Button */}
          <button
            className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title={connectedDevice ? `Beam to ${connectedDevice.name}` : 'Beam to Device'}
            onClick={handleBeam}
          >
            {beamed ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </button>

          {/* Enlarge / Detailed Inspector */}
          <button
            className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Inspect in detail"
            onClick={(e) => {
              e.stopPropagation();
              playPop();
              setPreviewItemId(item.id);
            }}
          >
            <Maximize2 className="w-3.5 h-3.5 text-white/70" />
          </button>

          {/* Copy Button */}
          <button
            className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Copy"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Pin Button */}
          <button
            className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title={item.pinned ? 'Unpin' : 'Pin'}
            onClick={handlePin}
          >
            <Pin
              className={`w-3.5 h-3.5 ${
                item.pinned ? 'fill-amber-400 text-amber-400 rotate-45' : ''
              }`}
            />
          </button>

          {/* Delete Button */}
          <button
            className="p-1 rounded-full text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            title="Delete"
            onClick={handleDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.article>
  );
};
