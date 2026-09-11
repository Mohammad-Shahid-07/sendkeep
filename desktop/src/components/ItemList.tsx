import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store/appStore';
import { ClipboardItem } from './ClipboardItem';
import { Inbox } from 'lucide-react';

export const ItemList: React.FC = () => {
  const { items } = useStore();

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 mb-3">
          <Inbox className="w-6 h-6 text-white/30" />
        </div>
        <p className="text-xs font-medium text-white/60">No items received yet</p>
        <p className="text-[11px] text-white/30 max-w-[180px] mt-1">
          Share any file or photo from your phone to beam it directly here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2.5 py-2 flex flex-col gap-2 scrollbar-none">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          >
            <ClipboardItem item={item} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
