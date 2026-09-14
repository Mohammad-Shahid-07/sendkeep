import React, { useState, useRef, useEffect } from 'react';
import { Pen, Send } from 'lucide-react';
import { useStore } from '../store/appStore';
import { playBeam, playPop } from '../lib/soundEffects';

export const DropDock: React.FC = () => {
  const { addItem, activeSource, beamItemToDevice } = useStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [showNoteDrawer, setShowNoteDrawer] = useState(false);
  const [noteText, setNoteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  const isPhoneMode = activeSource === 'device';

  useEffect(() => {
    if (showNoteDrawer) {
      noteInputRef.current?.focus();
    }
  }, [showNoteDrawer]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = (file as any).path || '';
      const newItem = {
        id: 'out-' + Date.now() + '-' + i,
        name: file.name,
        path: filePath,
        size: file.size,
        fileType: file.type || 'application/octet-stream',
        sender: 'You',
        source: isPhoneMode ? ('device' as const) : ('clipboard' as const),
        timestamp: Date.now(),
      };
      addItem(newItem);
      if (isPhoneMode) {
        beamItemToDevice(newItem).catch(() => {});
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleBeamNote = () => {
    const text = noteText.trim();
    if (!text) return;

    playPop();
    const isLink = text.startsWith('http://') || text.startsWith('https://');

    const noteItem = {
      id: 'out-note-' + Date.now(),
      name: isLink ? 'Web Link' : 'Quick Note',
      path: '',
      size: text.length,
      fileType: 'text/plain',
      sender: 'You',
      source: isPhoneMode ? ('device' as const) : ('clipboard' as const),
      timestamp: Date.now(),
      content: text,
    };

    addItem(noteItem);
    if (isPhoneMode) {
      beamItemToDevice(noteItem).catch(() => {});
    }

    setNoteText('');
    setShowNoteDrawer(false);
  };

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'INPUT'
      ) {
        return;
      }
      const text = e.clipboardData?.getData('text');
      if (text) {
        const isLink = text.startsWith('http://') || text.startsWith('https://');
        const clipItem = {
          id: 'out-clip-' + Date.now(),
          name: isLink ? 'Web Link' : 'Pasted Note',
          path: '',
          size: text.length,
          fileType: 'text/plain',
          sender: 'You',
          source: isPhoneMode ? ('device' as const) : ('clipboard' as const),
          timestamp: Date.now(),
          content: text,
        };
        addItem(clipItem);
        if (isPhoneMode) {
          beamItemToDevice(clipItem).catch(() => {});
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [addItem, isPhoneMode, beamItemToDevice]);

  const title =
    activeSource === 'device'
      ? 'Drop files here to beam'
      : activeSource === 'clipboard'
      ? 'Drop files to stage on shelf'
      : 'Drop files to beam or stage';

  const subtitle = 'Click to browse · or drag files';

  return (
    <div className="relative shrink-0 flex flex-col bg-[#090a0e] border-t border-dashed border-white/15 z-30 select-none">
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* The Single Seamless Full-Width Strip */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          const files = e.dataTransfer.files;
          if (files && files.length > 0) {
            playBeam();
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const filePath = (file as any).path || '';
              const newItem = {
                id: 'drop-' + Date.now() + '-' + i,
                name: file.name,
                path: filePath,
                size: file.size,
                fileType: file.type || 'application/octet-stream',
                sender: 'You',
                source: isPhoneMode ? ('device' as const) : ('clipboard' as const),
                timestamp: Date.now(),
              };
              addItem(newItem);
              if (isPhoneMode) {
                beamItemToDevice(newItem).catch(() => {});
              }
            }
          }
        }}
        className={`w-full flex items-center justify-between px-3.5 py-3 transition-all cursor-pointer group select-none ${
          isDragOver ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/50 group-hover:text-white/80 group-hover:bg-white/[0.08] transition-all shrink-0">
            <svg
              className="w-4 h-4 text-white/60"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 3v12" />
              <path d="m8 11 4 4 4-4" />
              <path d="M4 20h16" />
            </svg>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold text-white tracking-tight truncate">
              {title}
            </span>
            <span className="text-[10.5px] text-white/40 truncate">{subtitle}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowNoteDrawer(!showNoteDrawer);
          }}
          title="Compose quick note or link"
          className="w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer shrink-0"
        >
          <Pen className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expandable Note Drawer */}
      {showNoteDrawer && (
        <div className="flex flex-col gap-2 p-3 pt-0 border-t border-white/[0.06] transition-all">
          <textarea
            ref={noteInputRef}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleBeamNote();
              }
            }}
            placeholder="Type note or snippet... (Ctrl+Enter)"
            className="w-full h-16 bg-[#12141d] border border-white/10 focus:border-white/25 rounded-xl p-2.5 text-xs text-white placeholder:text-white/30 font-mono resize-none outline-none transition-colors"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/30 font-mono">Press Ctrl+Enter</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowNoteDrawer(false)}
                className="px-2.5 py-1 rounded-lg text-[11px] text-white/40 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBeamNote}
                className="px-3 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer bg-white text-black hover:bg-white/90 shadow-sm"
              >
                <Send className="w-3 h-3" />
                <span>{isPhoneMode ? 'Beam to Phone' : 'Stage on Shelf'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

