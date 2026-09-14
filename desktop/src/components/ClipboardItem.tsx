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
  Minus,
  FolderMinus,
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
  const isSvg = Boolean((name || path || '').toLowerCase().endsWith('.svg'));
  // SVGs without an explicit raster previewUrl use SendKeep's custom vector icon directly
  const [src, setSrc] = useState<string>(previewUrl || (path && !isSvg ? convertFileSrc(path) : ''));
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(isSvg || (!previewUrl && !path));

  React.useEffect(() => {
    if (previewUrl) {
      setSrc(previewUrl);
      setLoadFailed(false);
      setIsLoaded(false);
    } else if (path && !isSvg) {
      setSrc(convertFileSrc(path));
      setLoadFailed(false);
      setIsLoaded(false);
    } else {
      setLoadFailed(true);
    }
  }, [previewUrl, path, isSvg]);

  const handleError = () => {
    if (path && !isSvg && (path.includes(':') || path.startsWith('\\\\')) && !src.startsWith('data:')) {
      invoke<string>('read_image_base64', { path })
        .then((b64) => {
          setSrc(b64);
        })
        .catch(() => setLoadFailed(true));
    } else {
      setLoadFailed(true);
    }
  };

  // 1. If load failed or file is an SVG without preview: render the real CustomFileIcon card immediately
  if (loadFailed || !src) {
    return (
      <div className="w-full h-28 rounded-xl bg-white/[0.03] border border-white/[0.08] flex flex-col items-center justify-center gap-2 p-3 text-white/40">
        <CustomFileIcon path={path} ext={extOf(name || path || 'png')} width={40} height={40} />
        <span className="text-xs font-medium text-white/70 truncate max-w-full">
          {name || 'Image'}
        </span>
      </div>
    );
  }

  // 2. While loading raster image: show CustomFileIcon placeholder immediately, crossfading smoothly to image once decoded
  return (
    <div
      className={`thumb-wrap relative w-full overflow-hidden rounded-xl border border-white/[0.06] flex items-center justify-center transition-all duration-200 ${
        isLoaded ? 'max-h-48 bg-black/40' : 'h-28 bg-white/[0.03] border-white/[0.08]'
      }`}
    >
      {!isLoaded && (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3 text-white/40">
          <CustomFileIcon path={path} ext={extOf(name || path || 'png')} width={40} height={40} />
          <span className="text-xs font-medium text-white/70 truncate max-w-full">
            {name || 'Image'}
          </span>
        </div>
      )}

      <img
        src={src}
        alt=""
        className={`thumb w-full object-contain rounded-xl transition-opacity duration-300 ${
          isLoaded ? 'opacity-100 max-h-48' : 'opacity-0 absolute pointer-events-none'
        }`}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        onError={handleError}
      />
    </div>
  );
};

interface SubItemThumbnailProps {
  sub: SendKeepItem;
}

const SubItemThumbnail: React.FC<SubItemThumbnailProps> = ({ sub }) => {
  const ext = extOf(sub.name || sub.path || '').toLowerCase();
  const isImg = Boolean(
    sub.fileType?.toLowerCase().includes('image') ||
      isImagePath(sub.name || '') ||
      isImagePath(sub.path || '')
  );
  const isSvg = ext === 'svg';
  const initialSrc = isImg && !isSvg ? (sub.previewUrl || (sub.path ? convertFileSrc(sub.path) : '')) : '';

  const [src, setSrc] = useState<string>(initialSrc);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(!isImg || isSvg || !initialSrc);

  React.useEffect(() => {
    if (isImg && !isSvg) {
      const s = sub.previewUrl || (sub.path ? convertFileSrc(sub.path) : '');
      setSrc(s);
      setLoadFailed(!s);
      setIsLoaded(false);
    } else {
      setLoadFailed(true);
    }
  }, [sub.path, sub.previewUrl, isImg, isSvg]);

  const handleError = () => {
    if (sub.path && !src.startsWith('data:')) {
      invoke<string>('read_image_base64', { path: sub.path })
        .then((b64) => {
          if (b64) {
            setSrc(b64);
            setIsLoaded(true);
          } else {
            setLoadFailed(true);
          }
        })
        .catch(() => setLoadFailed(true));
    } else {
      setLoadFailed(true);
    }
  };

  if (loadFailed || !src) {
    return (
      <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/[0.06] flex items-center justify-center shrink-0">
        <CustomFileIcon path={sub.path} ext={ext} width={22} height={22} />
      </div>
    );
  }

  return (
    <div className="relative w-8 h-8 rounded-lg bg-black/40 border border-white/[0.06] overflow-hidden shrink-0 flex items-center justify-center">
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <CustomFileIcon path={sub.path} ext={ext} width={20} height={20} />
        </div>
      )}
      <img
        src={src}
        alt=""
        onError={handleError}
        onLoad={() => setIsLoaded(true)}
        className={`w-full h-full object-cover rounded-lg transition-opacity duration-200 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        loading="lazy"
      />
    </div>
  );
};

const expandEase = [0.16, 1, 0.3, 1] as const;
const collapseEase = [0.4, 0, 0.2, 1] as const;

const stackSlotVariants = {
  open: {
    opacity: 1,
    transition: { duration: 0.28, ease: expandEase },
  },
  closed: {
    opacity: 0,
    transition: { duration: 0.18, ease: collapseEase },
  },
};

const bundleHeaderVariants = {
  open: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.22, ease: expandEase },
  },
  closed: {
    opacity: 0,
    y: -8,
    scale: 0.97,
    transition: { duration: 0.14, ease: collapseEase },
  },
};

const listSlotVariants = {
  open: {
    opacity: 1,
    transition: {
      duration: 0.28,
      ease: expandEase,
      staggerChildren: 0.034,
      delayChildren: 0.05,
    },
  },
  closed: {
    opacity: 0,
    transition: {
      duration: 0.16,
      ease: collapseEase,
      staggerChildren: 0.02,
      staggerDirection: -1,
    },
  },
};

const bundleRowVariants = {
  open: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      type: 'spring',
      stiffness: 420,
      damping: 28,
      mass: 0.8,
    },
  },
  closed: {
    opacity: 0,
    y: -8,
    scale: 0.96,
    filter: 'blur(2px)',
    transition: {
      duration: 0.14,
      ease: collapseEase,
    },
  },
};

function createDragGhost(title: string, badgeText?: string) {
  const ghost = document.createElement('div');
  ghost.id = '__sendkeep_drag_ghost';
  ghost.style.position = 'fixed';
  ghost.style.top = '-9999px';
  ghost.style.left = '-9999px';
  ghost.style.zIndex = '999999';
  ghost.style.pointerEvents = 'none';
  ghost.style.display = 'flex';
  ghost.style.alignItems = 'center';
  ghost.style.gap = '8px';
  ghost.style.padding = '8px 14px';
  ghost.style.background = '#141417';
  ghost.style.border = '1px solid rgba(255, 255, 255, 0.16)';
  ghost.style.borderRadius = '12px';
  ghost.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(99, 102, 241, 0.4)';
  ghost.style.color = '#ffffff';
  ghost.style.fontSize = '12px';
  ghost.style.fontWeight = '600';
  ghost.style.maxWidth = '260px';
  ghost.style.whiteSpace = 'nowrap';
  ghost.style.overflow = 'hidden';

  const dot = document.createElement('div');
  dot.style.width = '8px';
  dot.style.height = '8px';
  dot.style.borderRadius = '50%';
  dot.style.background = '#818cf8';
  dot.style.flexShrink = '0';
  ghost.appendChild(dot);

  const textSpan = document.createElement('span');
  textSpan.innerText = title;
  textSpan.style.overflow = 'hidden';
  textSpan.style.textOverflow = 'ellipsis';
  ghost.appendChild(textSpan);

  if (badgeText) {
    const badge = document.createElement('span');
    badge.innerText = badgeText;
    badge.style.background = 'rgba(99, 102, 241, 0.25)';
    badge.style.color = '#c7d2fe';
    badge.style.padding = '2px 6px';
    badge.style.borderRadius = '6px';
    badge.style.fontSize = '10px';
    badge.style.fontWeight = '700';
    badge.style.flexShrink = '0';
    ghost.appendChild(badge);
  }

  document.body.appendChild(ghost);
  return ghost;
}

export const ClipboardItem: React.FC<Props> = ({ item }) => {
  const {
    togglePin,
    toggleStackExpand,
    splitStack,
    ungroupBundle,
    mergeItems,
    removeItem,
    setPreviewItemId,
    connectedDevice,
    activeDraggingId,
    setActiveDraggingId,
    beamItemToDevice,
    markInternalCopy,
    isSelectMode,
    selectedItemIds,
    toggleSelectItem,
  } = useStore();

  const isSelected = selectedItemIds.includes(item.id);

  const [copied, setCopied] = useState(false);
  const [copiedSubId, setCopiedSubId] = useState<string | null>(null);
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
      markInternalCopy();

      if (isBundle && item.bundleItems) {
        const paths = item.bundleItems.map((s) => s.path).filter(Boolean);
        if (paths.length > 0) {
          invoke('copy_files_native', { paths }).catch((err) => {
            console.warn('Native copy files failed:', err);
          });
          return;
        }
      }

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
    [effectiveImgPath, effectiveText, isImage, item, isBundle, markInternalCopy]
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

  const handleSubDragStart = (e: React.DragEvent, sub: SendKeepItem) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/sendkeep-item-id', sub.id);
    try {
      const ghost = createDragGhost(sub.name || 'File');
      e.dataTransfer.setDragImage(ghost, 20, 20);
      setTimeout(() => ghost.remove(), 0);
    } catch {}

    if (sub.path) {
      const subPreview = isImagePath(sub.path) ? sub.path : null;
      invoke('start_drag', { paths: [sub.path], previewPath: subPreview }).catch(() => {});
    } else if (sub.content) {
      e.dataTransfer.setData('text/plain', sub.content);
      invoke<string>('stage_drag_text', { content: sub.content, name: sub.name || 'file.txt' })
        .then((staged) => invoke('start_drag', { paths: [staged], previewPath: null }))
        .catch(() => {});
    }
  };

  const handleSubItemClick = (e: React.MouseEvent, sub: SendKeepItem) => {
    e.stopPropagation();
    playCopy();
    setCopiedSubId(sub.id);
    setTimeout(() => setCopiedSubId(null), 1200);
    markInternalCopy();

    invoke('copy_item_native', {
      path: sub.path || null,
      content: sub.content || null,
      isImage: Boolean(sub.fileType?.includes('image') || isImagePath(sub.name) || isImagePath(sub.path)),
    }).catch(() => {
      const txt = sub.content || sub.path || sub.name;
      if (txt) navigator.clipboard.writeText(txt);
    });
  };

  const handleSubUngroup = (e: React.MouseEvent, subId: string) => {
    e.stopPropagation();
    playPop();
    splitStack(item.id, subId);
  };

  const handleUngroupAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    playPop();
    ungroupBundle(item.id);
  };

  const handleCopyBundleAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    playCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
    markInternalCopy();

    const paths = (item.bundleItems || []).map((s) => s.path).filter(Boolean);
    if (paths.length > 0) {
      invoke('copy_files_native', { paths }).catch((err) => {
        console.warn('Native copy files failed:', err);
      });
    }
  };

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // Ctrl+Click or Cmd+Click toggles selection directly without copying
      if (e.ctrlKey || e.metaKey) {
        e.stopPropagation();
        e.preventDefault();
        toggleSelectItem(item.id);
        return;
      }

      // When in select mode, clicking anywhere on the card toggles its selection
      if (isSelectMode) {
        e.stopPropagation();
        e.preventDefault();
        toggleSelectItem(item.id);
        return;
      }

      if (isBundle && !item.isExpanded) {
        handleToggleExpand(e);
      } else {
        handleCopy(e);
      }
    },
    [isSelectMode, toggleSelectItem, item.id, isBundle, item.isExpanded, handleToggleExpand, handleCopy]
  );

  // -------------------------------------------------------------------------
  // Drag & Drop Handling (Native OS Drag + Card-to-Card Stack Merging)
  // -------------------------------------------------------------------------
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('text/sendkeep-item-id', item.id);
      setActiveDraggingId(item.id);

      try {
        const badge = isBundle && item.bundleItems ? `${item.bundleItems.length} files` : undefined;
        const ghost = createDragGhost(item.name || 'Item', badge);
        e.dataTransfer.setDragImage(ghost, 20, 20);
        setTimeout(() => ghost.remove(), 0);
      } catch {}

      // Plain text notes and links without physical files: stage temporary file for OLE native drag-out
      if ((isNote || isLink) && !item.path) {
        const txt = effectiveText || item.content || '';
        if (txt) {
          e.dataTransfer.setData('text/plain', txt);
          const defaultName = isLink ? (item.name || 'Link.url') : (item.name || 'Note.txt');
          invoke<string>('stage_drag_text', { content: txt, name: defaultName })
            .then((stagedPath) => {
              invoke('start_drag', { paths: [stagedPath], previewPath: null }).catch(() => {});
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
        const previewPath = effectiveImgPath || (item.path && isImagePath(item.path) ? item.path : null);
        invoke('start_drag', { paths: pathsToDrag, previewPath }).catch(() => {});
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
      data-item-id={item.id}
      className={`item group relative rounded-[16px] bg-[#161619] hover:bg-[#1a1a1f] border border-white/[0.04] hover:border-white/[0.08] transition-all overflow-hidden ${
        isSelected
          ? 'ring-2 ring-indigo-500 !border-indigo-500/60 !bg-indigo-500/[0.06]'
          : item.pinned
          ? 'ring-1 ring-amber-400/30'
          : ''
      }${
        activeDraggingId === item.id ? ' opacity-40 scale-[0.98] border-dashed ring-1 ring-indigo-500/40 cursor-grabbing' : ''
      }${
        isMergeTarget
          ? ' ring-2 ring-indigo-500 shadow-[0_0_24px_rgba(99,102,241,0.6)] !border-indigo-400 !bg-indigo-500/10'
          : ''
      }`}
      onClick={handleCardClick}
      onDragOver={handleCardDragOver}
      onDragLeave={handleCardDragLeave}
      onDrop={handleCardDrop}
      onDragEnd={() => setActiveDraggingId(null)}
    >
      {/* Multi-Select Checkbox Circle */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          toggleSelectItem(item.id);
        }}
        className={`absolute top-2.5 left-2.5 z-30 w-5 h-5 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
          isSelected
            ? 'bg-indigo-500 border-indigo-400 text-white opacity-100 scale-100 shadow-md shadow-indigo-500/40'
            : isSelectMode
            ? 'bg-black/60 border-white/30 text-transparent opacity-85 hover:border-indigo-400 hover:bg-indigo-500/20 scale-95'
            : 'bg-black/50 border-white/20 text-transparent opacity-0 group-hover:opacity-100 hover:border-white/50 hover:bg-black/80 scale-90'
        }`}
        title={isSelected ? 'Deselect item' : 'Select item (or Ctrl+Click)'}
      >
        <Check className={`w-3 h-3 stroke-[2.5] ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
      </div>
      <div
        className="item-main w-full flex flex-col cursor-pointer select-none"
        draggable={!isBundle || !item.isExpanded}
        onDragStart={handleDragStart}
      >
        <div className="body w-full flex flex-col p-3.5 pb-2.5">
          <div className="item-content w-full">
            {/* 1. BUNDLE / STACK (3D FANNED DECK OR EXPANDED DRAWER) */}
            {isBundle && item.bundleItems ? (
              <div className={`fluid-bundle${item.isExpanded ? ' is-expanded' : ''}`}>
                {/* 3D Fanned Deck Slot (Animates scaling, lifting, and fading when deforming) */}
                <div className="bundle-slot bundle-slot-stack" aria-hidden={item.isExpanded}>
                  <motion.div
                    className="bundle-slot-inner"
                    initial={false}
                    animate={item.isExpanded ? 'closed' : 'open'}
                    variants={stackSlotVariants}
                    style={{ originY: 0.5 }}
                  >
                    <div className="flex flex-col items-center py-2">
                      <div className="bundle-stack-large relative h-28 w-full flex items-center justify-center">
                        {item.fileType === 'bundle/folder' ? (
                          <motion.div
                            className="flex items-center justify-center"
                            animate={
                              item.isExpanded
                                ? { scale: 0.82, y: -16, rotate: -5, opacity: 0 }
                                : { scale: 1, y: 0, rotate: 0, opacity: 1 }
                            }
                            transition={
                              item.isExpanded
                                ? { duration: 0.22, ease: expandEase }
                                : { type: 'spring', stiffness: 360, damping: 25 }
                            }
                          >
                            <CustomFileIcon isFolder width={104} height={104} />
                          </motion.div>
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

                              // Resting coordinates (tight formed 3D fanned deck)
                              const restingX = realIndex * spread - centerOffset;
                              const restingY = realIndex * 4;
                              const restingRot = realIndex * rotSpread - centerRot;
                              const restingScale = 1 - realIndex * 0.05;

                              // Deformed coordinates (fan outward and lift upwards as drawer unfolds)
                              const norm = arr.length > 1 ? realIndex - (arr.length - 1) / 2 : 0;
                              const deformX = restingX + norm * 36;
                              const deformY = restingY - 20 - realIndex * 6;
                              const deformRot = restingRot + norm * 12;
                              const deformScale = restingScale * 0.88;

                              const isExpanded = Boolean(item.isExpanded);

                              const stackMotion = isExpanded
                                ? {
                                    x: deformX,
                                    y: deformY,
                                    rotate: deformRot,
                                    scale: deformScale,
                                    opacity: 0,
                                    transition: {
                                      duration: 0.26,
                                      ease: expandEase,
                                      delay: (arr.length - 1 - realIndex) * 0.03, // Peel outward front-to-back
                                    },
                                  }
                                : {
                                    x: restingX,
                                    y: restingY,
                                    rotate: restingRot,
                                    scale: restingScale,
                                    opacity: 1,
                                    transition: {
                                      type: 'spring',
                                      stiffness: 380,
                                      damping: 26,
                                      mass: 0.8,
                                      delay: realIndex * 0.02, // Back cards land first, front card snaps on top
                                    },
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
                                  whileHover={
                                    !isExpanded
                                      ? {
                                          scale: restingScale * 1.025,
                                          y: restingY - 2,
                                          x: restingX + norm * 4,
                                          rotate: restingRot + norm * 2,
                                          transition: { duration: 0.15, ease: 'easeOut' },
                                        }
                                      : undefined
                                  }
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
                      <motion.span
                        className="text-[11px] font-semibold text-white/70 mt-1"
                        animate={
                          item.isExpanded
                            ? { opacity: 0, y: -6 }
                            : { opacity: 1, y: 0 }
                        }
                        transition={{ duration: 0.18, ease: expandEase }}
                      >
                        {item.bundleItems.length} items bundled
                      </motion.span>
                    </div>
                  </motion.div>
                </div>

                {/* Expanded Drawer Slot (Expands and cascades files when forming list) */}
                <div className="bundle-slot bundle-slot-list" aria-hidden={!item.isExpanded}>
                  <motion.div
                    className="bundle-slot-inner"
                    initial={false}
                    animate={item.isExpanded ? 'open' : 'closed'}
                    variants={listSlotVariants}
                  >
                    <div className="flex flex-col gap-2 pb-0.5">
                      {/* Bundle Header / Compact Toolbar */}
                      <motion.div
                        variants={bundleHeaderVariants}
                        className="flex items-center justify-between pb-2 border-b border-white/[0.06] select-none"
                        onClick={handleToggleExpand}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-md bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shrink-0">
                            <Layers className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-semibold text-white/95 truncate">
                              {item.bundleItems.length} files
                            </span>
                            <span className="text-[11px] font-mono text-white/45 shrink-0">
                              · {formatBytes(item.size)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {/* Ungroup All Button */}
                          <button
                            onClick={handleUngroupAll}
                            title="Ungroup all files into separate cards"
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-medium text-white/65 hover:text-white transition-colors cursor-pointer"
                          >
                            <FolderMinus className="w-3 h-3 text-white/50" />
                            <span>Ungroup</span>
                          </button>

                          {/* Copy All Button */}
                          <button
                            onClick={handleCopyBundleAll}
                            title="Copy all files to clipboard"
                            className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-white/65 hover:text-white transition-colors cursor-pointer"
                          >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>

                          {/* Collapse Chevron */}
                          <button
                            onClick={handleToggleExpand}
                            title="Collapse stack"
                            className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white transition-colors cursor-pointer"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>

                      {/* Fluid Sub-Item Rows with Stagger */}
                      <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-0.5">
                        {item.bundleItems.map((sub) => {
                          const isSubCopied = copiedSubId === sub.id;

                          return (
                            <motion.div
                              key={sub.id}
                              variants={bundleRowVariants}
                              draggable={true}
                              onDragStart={(e) => handleSubDragStart(e as any, sub)}
                              onClick={(e) => handleSubItemClick(e as any, sub)}
                              className="fluid-card-row group/sub relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-white/[0.025] hover:bg-white/[0.065] active:bg-white/[0.09] border border-white/[0.04] hover:border-white/[0.09] transition-all cursor-pointer select-none overflow-hidden"
                            >
                              {/* Sub-Item Icon / Thumbnail with Fallback */}
                              <SubItemThumbnail sub={sub} />

                              {/* Sub-Item Content */}
                              <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                                <div className="text-xs font-medium text-white/90 group-hover/sub:text-white truncate transition-colors" title={sub.name}>
                                  {sub.name}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-white/40 font-mono">
                                  <span>{formatBytes(sub.size)}</span>
                                  <span className="text-white/20">·</span>
                                  <span className="uppercase text-[9px] px-1 py-0.2 rounded bg-white/[0.04] text-white/50 font-medium">
                                    {extOf(sub.name || sub.path || '') || 'FILE'}
                                  </span>
                                  {isSubCopied && (
                                    <span className="text-emerald-400 font-sans font-medium text-[10px] ml-1">
                                      Copied!
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Sub-Item Floating Actions on Hover */}
                              <div
                                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-[#141418]/95 backdrop-blur-md border border-white/[0.1] rounded-md p-0.5 shadow-xl opacity-0 group-hover/sub:opacity-100 transition-opacity z-10"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                  title="Copy this file"
                                  onClick={(e) => {
                                    (e.currentTarget as HTMLElement).blur();
                                    handleSubItemClick(e, sub);
                                  }}
                                >
                                  {isSubCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                                <button
                                  className="p-1 rounded-md text-white/60 hover:text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
                                  title="Extract from bundle"
                                  onClick={(e) => {
                                    (e.currentTarget as HTMLElement).blur();
                                    handleSubUngroup(e, sub.id);
                                  }}
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>
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
            className="p-1 rounded-full text-white/65 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Paste directly into active window (Ctrl+V)"
            onClick={handleDirectPaste}
          >
            {pasted ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <CornerDownLeft className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Beam to Phone Button */}
          <button
            className="p-1 rounded-full text-white/65 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title={connectedDevice ? `Beam to ${connectedDevice.name}` : 'Beam to Device'}
            onClick={handleBeam}
          >
            {beamed ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Smartphone className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Enlarge / Detailed Inspector */}
          <button
            className="p-1 rounded-full text-white/65 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Inspect in detail"
            onClick={(e) => {
              e.stopPropagation();
              playPop();
              setPreviewItemId(item.id);
            }}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* Copy Button */}
          <button
            className="p-1 rounded-full text-white/65 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
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
            className={`p-1 rounded-full transition-colors cursor-pointer ${
              item.pinned
                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/15'
                : 'text-white/65 hover:text-white hover:bg-white/10'
            }`}
            title={item.pinned ? 'Unpin' : 'Pin'}
            onClick={handlePin}
          >
            <Pin
              className={`w-3.5 h-3.5 ${
                item.pinned ? 'fill-amber-400 rotate-45' : ''
              }`}
            />
          </button>

          {/* Delete Button */}
          <button
            className="p-1 rounded-full text-white/65 hover:text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
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
