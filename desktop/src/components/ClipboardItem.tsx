import React, { useState } from 'react';
import { Copy, Check, FolderOpen, Globe, ExternalLink } from 'lucide-react';
import { SendKeepItem } from '../store/appStore';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

interface Props {
  item: SendKeepItem;
}

export const ClipboardItem: React.FC<Props> = ({ item }) => {
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isImage =
    item.fileType?.toLowerCase().includes('image') ||
    Boolean(item.name?.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i));

  const isLink = Boolean(
    item.content && (item.content.startsWith('http://') || item.content.startsWith('https://'))
  );

  const isNote = Boolean(item.content && !isLink && !isImage);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = item.content || item.path || item.name;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.path) {
      invoke('open_file_in_folder', { path: item.path });
    }
  };

  const getFileBadge = () => {
    const ext = item.name.split('.').pop()?.toUpperCase() || 'FILE';
    if (ext === 'PDF') {
      return (
        <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center text-[10px] font-bold font-mono shrink-0">
          PDF
        </div>
      );
    }
    if (['ZIP', 'RAR', '7Z', 'TAR'].includes(ext)) {
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold font-mono shrink-0">
          ZIP
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/10 text-white/60 flex items-center justify-center text-[10px] font-bold font-mono shrink-0">
        {ext.slice(0, 4)}
      </div>
    );
  };

  // 1. IMAGE CARD
  if (isImage && item.path && !imgError) {
    const imgSrc = convertFileSrc(item.path);
    return (
      <article
        draggable
        onClick={handleOpenFolder}
        className="group relative flex flex-col rounded-xl overflow-hidden bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] transition-all cursor-pointer select-none"
      >
        <div className="w-full h-36 bg-black/40 relative overflow-hidden">
          <img
            src={imgSrc}
            alt={item.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
          />
          {/* Floating Actions on Hover */}
          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              onClick={handleCopy}
              title="Copy"
              className="w-6 h-6 rounded-md bg-black/70 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-black/90 transition-all"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
            <button
              onClick={handleOpenFolder}
              title="Reveal in Explorer"
              className="w-6 h-6 rounded-md bg-black/70 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-black/90 transition-all"
            >
              <FolderOpen className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-white truncate" title={item.name}>
              {item.name}
            </div>
            <div className="text-[10px] font-mono text-white/40 mt-0.5">
              {formatSize(item.size)} • Just now
            </div>
          </div>
        </div>
      </article>
    );
  }

  // 2. WEB LINK CARD
  if (isLink) {
    return (
      <article
        onClick={handleCopy}
        className="group relative flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] transition-all cursor-pointer select-none"
      >
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
          <Globe className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-white truncate">Web Link</div>
          <div className="text-[10.5px] text-white/40 truncate font-mono mt-0.5">{item.content}</div>
        </div>
        <button
          onClick={handleCopy}
          title="Copy Link"
          className="opacity-0 group-hover:opacity-100 p-1 text-white/40 hover:text-white transition-opacity"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </article>
    );
  }

  // 3. NOTE / CLIPBOARD CARD
  if (isNote) {
    return (
      <article
        onClick={handleCopy}
        className="group relative flex flex-col rounded-xl overflow-hidden bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] transition-all cursor-pointer select-none"
      >
        <div className="p-2.5 font-mono text-xs text-white/80 bg-black/20 border-b border-white/[0.04] break-all select-text">
          {item.content}
        </div>
        <div className="px-3 py-1.5 flex items-center justify-between text-[10.5px] text-white/40">
          <span>{item.content?.length || 0} characters</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {copied ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" /> Copied
              </span>
            ) : (
              <span className="text-white/60">Click to copy</span>
            )}
          </div>
        </div>
      </article>
    );
  }

  // 4. DOCUMENT / GENERAL FILE CARD
  return (
    <article
      draggable
      onClick={handleOpenFolder}
      className="group relative flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] transition-all cursor-pointer select-none"
    >
      {getFileBadge()}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-white truncate" title={item.name}>
          {item.name}
        </div>
        <div className="text-[10px] font-mono text-white/40 mt-0.5">
          {formatSize(item.size)} • Just now
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {item.path && (
          <button
            onClick={handleOpenFolder}
            title="Open in Explorer"
            className="p-1 rounded-md text-white/40 hover:text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </article>
  );
};
