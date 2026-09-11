import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store/appStore';
import { ClipboardItem } from './ClipboardItem';

export const ItemList: React.FC = () => {
  const { items, activeFilter } = useStore();

  const filteredItems = items.filter((item) => {
    if (activeFilter === 'all') return true;

    const isImage =
      item.fileType?.toLowerCase().includes('image') ||
      Boolean(item.name?.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i));

    const isLink = Boolean(
      item.content && (item.content.startsWith('http://') || item.content.startsWith('https://'))
    );

    const isNote = Boolean(item.content && !isLink && !isImage);

    if (activeFilter === 'media') return isImage;
    if (activeFilter === 'links') return isLink;
    if (activeFilter === 'notes') return isNote;
    if (activeFilter === 'files') return !isImage && !isLink && !isNote;

    return true;
  });

  if (filteredItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
        <p className="text-xs font-medium text-white/50">Shelf is empty</p>
        <p className="text-[11px] text-white/30 max-w-[200px] mt-1">
          Drop files below or beam from your phone to stage them here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {filteredItems.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', damping: 26, stiffness: 360 }}
          >
            <ClipboardItem item={item} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
