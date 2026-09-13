import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Clock, AlertTriangle } from 'lucide-react';
import { useStore } from '../store/appStore';
import { playPop, playDelete } from '../lib/soundEffects';

interface ClearMenuProps {
  onClearWindow: (hours: number) => void;
  onClearUnpinned: () => void;
  disabled?: boolean;
}

export const ClearMenu: React.FC<ClearMenuProps> = ({
  onClearWindow,
  onClearUnpinned,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOpen = useStore((s) => s.isOpen);

  // Close menu if shelf closes
  useEffect(() => {
    if (!isOpen) {
      setOpen(false);
      setConfirmAll(false);
    }
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmAll(false);
      }
    };
    if (open) {
      document.addEventListener('pointerdown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [open]);

  const handleTrigger = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    playPop();
    setOpen((prev) => !prev);
    setConfirmAll(false);
  };

  const handleWindowClick = (hours: number, e: React.MouseEvent) => {
    e.stopPropagation();
    playDelete();
    onClearWindow(hours);
    setOpen(false);
  };

  const handleClearAllClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmAll) {
      playPop();
      setConfirmAll(true);
      return;
    }
    playDelete();
    onClearUnpinned();
    setOpen(false);
    setConfirmAll(false);
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={handleTrigger}
        disabled={disabled}
        title="Clear History Options"
        className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${
          open
            ? 'bg-white/15 text-white'
            : 'text-white/45 hover:text-rose-400 hover:bg-rose-500/10'
        } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 mt-1.5 w-48 rounded-xl bg-[#141620]/95 backdrop-blur-xl border border-white/[0.12] shadow-2xl p-1 z-[999] flex flex-col gap-0.5 select-none text-xs"
          >
            <div className="px-2.5 py-1.5 text-[10px] font-semibold tracking-wider text-white/40 uppercase">
              Clear Unpinned History
            </div>

            <button
              onClick={(e) => handleWindowClick(1, e)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Last 1 hour</span>
            </button>

            <button
              onClick={(e) => handleWindowClick(6, e)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Last 6 hours</span>
            </button>

            <button
              onClick={(e) => handleWindowClick(24, e)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Last 24 hours</span>
            </button>

            <div className="my-1 h-[1px] bg-white/[0.08]" />

            <button
              onClick={handleClearAllClick}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all text-left ${
                confirmAll
                  ? 'bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/40'
                  : 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10'
              }`}
            >
              {confirmAll ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />
                  <span>Click to Confirm</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Clear All Unpinned</span>
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
