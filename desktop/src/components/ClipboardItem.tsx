import React from 'react';
import { FileText, Image as ImageIcon, Video, FolderOpen, Copy, Check, File } from 'lucide-react';
import { SendKeepItem } from '../store/appStore';
import { invoke } from '@tauri-apps/api/core';

interface Props {
  item: SendKeepItem;
}

export const ClipboardItem: React.FC<Props> = ({ item }) => {
  const [copied, setCopied] = React.useState(false);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getIcon = () => {
    const type = item.fileType.toLowerCase();
    if (type.includes('image')) return <ImageIcon className="w-4 h-4 text-sky-400" />;
    if (type.includes('video')) return <Video className="w-4 h-4 text-purple-400" />;
    if (type.includes('text')) return <FileText className="w-4 h-4 text-amber-400" />;
    return <File className="w-4 h-4 text-emerald-400" />;
  };

  const handleOpenFolder = () => {
    if (item.path) {
      invoke('open_file_in_folder', { path: item.path });
    }
  };

  const handleCopy = () => {
    const textToCopy = item.content || item.path || item.name;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group relative flex flex-col gap-1.5 p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.14] transition-all shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
            {getIcon()}
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-medium text-white/90 truncate" title={item.name}>
              {item.name}
            </h3>
            <div className="flex items-center gap-1.5 text-[10px] text-white/40">
              <span>{item.sender}</span>
              <span>•</span>
              <span>{formatSize(item.size)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {item.path && (
            <button
              onClick={handleOpenFolder}
              title="Reveal in File Explorer"
              className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleCopy}
            title="Copy"
            className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {item.content && (
        <div className="p-2 rounded-lg bg-black/30 border border-white/5 text-[11px] text-white/70 font-mono line-clamp-3 select-text">
          {item.content}
        </div>
      )}
    </div>
  );
};
