import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listen } from '@tauri-apps/api/event';
import { Check } from 'lucide-react';
import { useStore } from '../store/appStore';

export const CopyIndicatorCurve: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const isOpen = useStore((s) => s.isOpen);

  useEffect(() => {
    // Listen for clipboard captures from the backend
    const unlisten = listen('sendkeep:clipboard-item', () => {
      // Trigger indicator bloom
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
      }, 1500);
      return () => clearTimeout(timer);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // When shelf is already wide open, the shelf's own item animation is sufficient
  if (isOpen) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="copy-indicator"
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 450, damping: 30 }}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-[9999] pointer-events-none flex items-center select-none"
        >
          {/* Refined Minimalist Screen-Edge Curve SVG */}
          <div className="relative flex items-center">
            <svg
              width="44"
              height="80"
              viewBox="0 0 44 80"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
            >
              <path
                d="M 0 0 C 0 20 28 26 28 40 C 28 54 0 60 0 80 Z"
                fill="url(#curve-grad)"
              />
              <path
                d="M 0 0 C 0 20 28 26 28 40 C 28 54 0 60 0 80"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1"
                fill="none"
              />
              <defs>
                <linearGradient id="curve-grad" x1="0" y1="0" x2="28" y2="40" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#181920" stopOpacity="0.96" />
                  <stop offset="100%" stopColor="#101116" stopOpacity="0.96" />
                </linearGradient>
              </defs>
            </svg>

            {/* Checkmark Pip inside the curve */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={{ delay: 0.08, type: 'spring', stiffness: 500, damping: 28 }}
              className="absolute left-1.5 w-4.5 h-4.5 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white/90 border border-white/20 shadow-sm"
            >
              <Check className="w-2.5 h-2.5 stroke-[2.5]" />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
