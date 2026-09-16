import React, { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { useStore } from '../store/appStore';
import { playButtonClickSound } from '../lib/soundEffects';

interface SearchBarProps {
  autoFocus?: boolean;
  onClose?: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ autoFocus = true, onClose }) => {
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (searchQuery.trim()) {
        setSearchQuery('');
      } else if (onClose) {
        onClose();
      }
    }
  };

  const handleClear = () => {
    playButtonClickSound();
    setSearchQuery('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex items-center w-full px-3 py-1.5 bg-black/40 border-b border-white/[0.06] transition-all">
      <Search className="w-3.5 h-3.5 text-white/40 shrink-0 mr-2 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search clipboard history, files, links..."
        spellCheck={false}
        className="w-full bg-transparent text-xs text-white placeholder-white/30 focus:outline-none tracking-wide"
      />
      {searchQuery && (
        <button
          onClick={handleClear}
          title="Clear search (Esc)"
          className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
