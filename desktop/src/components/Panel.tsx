import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/appStore';
import { Header } from './Header';
import { ItemList } from './ItemList';
import { DropDock } from './DropDock';
import { ArrowDown } from 'lucide-react';

export const Panel: React.FC = () => {
  const { isOpen, addItem, connectedDevice } = useStore();
  const [isWindowDragOver, setIsWindowDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsWindowDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.clientX > 20 && e.clientX < 320) {
      setIsWindowDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsWindowDragOver(false);
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
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative w-[340px] h-screen overflow-hidden pointer-events-none select-none"
    >
      {/* Closed Edge Trigger Indicator */}
      {!isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-16 rounded-r-full bg-gradient-to-b from-indigo-500 to-violet-500 shadow-[0_0_12px_rgba(99,102,241,0.5)] pointer-events-none"
        />
      )}

      {/* Main Clean Shelf Blade */}
      <motion.div
        initial={false}
        animate={{
          x: isOpen ? 0 : -340,
        }}
        transition={{
          type: 'spring',
          damping: 30,
          stiffness: 320,
          mass: 0.8,
        }}
        className="w-full h-full flex flex-col bg-[#0c0d14]/95 backdrop-blur-2xl border-r border-white/[0.07] shadow-2xl shadow-black/90 rounded-r-2xl overflow-hidden pointer-events-auto relative"
      >
        {/* Full Window Ambient Drag Overlay */}
        <AnimatePresence>
          {isWindowDragOver && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-2 bg-[#0c0d14]/96 border-2 border-dashed border-indigo-500 rounded-xl z-50 flex flex-col items-center justify-center gap-2 pointer-events-none shadow-[inset_0_0_40px_rgba(99,102,241,0.2)]"
            >
              <div className="w-12 h-12 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <ArrowDown className="w-6 h-6 animate-bounce" />
              </div>
              <div className="text-sm font-semibold text-white">Release to beam to {connectedDevice.name}</div>
              <div className="text-[11px] text-white/50">Direct local Wi-Fi transfer</div>
            </motion.div>
          )}
        </AnimatePresence>

        <Header />
        <ItemList />
        <DropDock />
      </motion.div>
    </div>
  );
};
