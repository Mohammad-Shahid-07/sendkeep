import React, { useState, useRef, useEffect } from 'react';
import { ArrowDown, Edit3 } from 'lucide-react';
import { useStore } from '../store/appStore';

export const DropDock: React.FC = () => {
  const { addItem } = useStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [showNoteDrawer, setShowNoteDrawer] = useState(false);
  const [noteText, setNoteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      addItem({
        id: 'out-' + Date.now() + '-' + i,
        name: file.name,
        path: '',
        size: file.size,
        fileType: file.type || 'application/octet-stream',
        sender: 'You',
        timestamp: Date.now(),
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleBeamNote = () => {
    const text = noteText.trim();
    if (!text) return;

    const isLink = text.startsWith('http://') || text.startsWith('https://');

    addItem({
      id: 'out-note-' + Date.now(),
      name: isLink ? 'Web Link' : 'Quick Note',
      path: '',
      size: text.length,
      fileType: 'text/plain',
      sender: 'You',
      timestamp: Date.now(),
      content: text,
    });

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
        addItem({
          id: 'out-clip-' + Date.now(),
          name: isLink ? 'Web Link' : 'Pasted Note',
          path: '',
          size: text.length,
          fileType: 'text/plain',
          sender: 'You',
          timestamp: Date.now(),
          content: text,
        });
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [addItem]);

  return (
    <div className="p-3 bg-[#090a0f] border-t border-white/[0.06] flex flex-col gap-2 shrink-0">
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* The Single Unified Drop Tray */}
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
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              addItem({
                id: 'drop-' + Date.now() + '-' + i,
                name: file.name,
                path: '',
                size: file.size,
                fileType: file.type || 'application/octet-stream',
                sender: 'You',
                timestamp: Date.now(),
              });
            }
          }
        }}
        className={`flex items-center gap-3 p-3 rounded-xl border border-dashed transition-all cursor-pointer select-none ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.2)]'
            : 'border-white/15 hover:border-indigo-500/50 bg-white/[0.02] hover:bg-indigo-500/[0.04]'
        }`}
      >
        <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/50 shrink-0">
          <ArrowDown className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-white">Drop files here to beam</div>
          <div className="text-[10px] text-white/40">Click to browse • Ctrl+V to paste</div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowNoteDrawer(!showNoteDrawer);
          }}
          title="Write a note"
          className="w-7 h-7 rounded-md border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expandable Quick Note Drawer */}
      {showNoteDrawer && (
        <div className="flex flex-col gap-1.5 pt-1">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Paste URL or type a note to beam to phone..."
            className="w-full h-16 bg-[#12141d] border border-white/10 rounded-lg p-2 text-xs font-mono text-white outline-none resize-none focus:border-indigo-500 transition-colors"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowNoteDrawer(false)}
              className="text-[11px] text-white/40 hover:text-white px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={handleBeamNote}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-[11px] font-semibold transition-colors"
            >
              Beam Note
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
