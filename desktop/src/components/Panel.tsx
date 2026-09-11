import React from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/appStore';
import { Header } from './Header';
import { ItemList } from './ItemList';
import { UploadCloud } from 'lucide-react';

export const Panel: React.FC = () => {
  const { isOpen } = useStore();

  return (
    <div className="relative w-[340px] h-screen overflow-hidden pointer-events-none select-none">
      {/* Closed Edge Trigger Indicator */}
      {!isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-16 rounded-r-full bg-gradient-to-b from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/50 pointer-events-none"
        />
      )}

      {/* Main Glass Shelf Blade */}
      <motion.div
        initial={false}
        animate={{
          x: isOpen ? 0 : -340,
        }}
        transition={{
          type: 'spring',
          damping: 30,
          stiffness: 300,
          mass: 0.8,
        }}
        className={`w-full h-full flex flex-col bg-[#0d0d11]/90 backdrop-blur-2xl border-r border-white/10 shadow-2xl shadow-black/80 rounded-r-2xl overflow-hidden pointer-events-auto`}
      >
        <Header />
        <ItemList />

        {/* Reverse Send Drop Zone */}
        <div className="p-3 border-t border-white/10 bg-black/40 backdrop-blur-md">
          <div className="group relative flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-white/15 hover:border-indigo-500/50 bg-white/[0.02] hover:bg-indigo-500/[0.05] transition-all cursor-pointer">
            <UploadCloud className="w-4 h-4 text-white/40 group-hover:text-indigo-400 transition-colors" />
            <span className="text-xs text-white/50 group-hover:text-white/80 transition-colors">
              Drop file to beam to Phone
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
