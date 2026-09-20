import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/appStore';
import {
  TickIndicatorIcon,
  CopyIndicatorIcon,
  SparkleIndicatorIcon,
  LiquidLogoIcon,
} from './CopyIndicatorCurve';
import { X } from 'lucide-react';
import { playButtonClickSound, playDialTickSound } from '../lib/soundEffects';

export const IndicatorStyleFlyout: React.FC<{ isRight?: boolean }> = ({ isRight = false }) => {
  const isOpen = useStore((s) => s.isIndicatorStyleFlyoutOpen);
  const setIsOpen = useStore((s) => s.setIndicatorStyleFlyoutOpen);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  const currentStyle = settings.copyIndicatorStyle || 'logo';

  const styles: { id: 'logo' | 'check' | 'copy' | 'sparkle'; label: string; component: React.ReactNode }[] = [
    { id: 'logo', label: 'Pulse Wave', component: <LiquidLogoIcon size={30} /> },
    { id: 'check', label: 'Checkmark', component: <TickIndicatorIcon size={30} /> },
    { id: 'copy', label: 'Dual Square', component: <CopyIndicatorIcon size={30} /> },
    { id: 'sparkle', label: 'Sparkle', component: <SparkleIndicatorIcon size={30} /> },
  ];

  const handleSelect = (id: 'logo' | 'check' | 'copy' | 'sparkle') => {
    playButtonClickSound();
    playDialTickSound();
    updateSettings({ copyIndicatorStyle: id });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.94, x: isRight ? 12 : -12 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.94, x: isRight ? 12 : -12 }}
          transition={{ type: 'spring', damping: 28, stiffness: 420 }}
          style={{
            left: isRight ? undefined : '362px',
            right: isRight ? '362px' : undefined,
            top: '20%',
            backgroundColor: '#0e1017',
            background: '#0e1017',
          }}
          className="fixed z-[60] w-[320px] p-4 border border-white/[0.12] rounded-2xl shadow-2xl flex flex-col gap-3 text-white select-none pointer-events-auto"
        >
          <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
            <div>
              <div className="text-xs font-semibold text-white">Copy Indicator Style</div>
              <div className="text-[11px] text-white/40">Select screen-edge extrusion shape</div>
            </div>
            <button
              onClick={() => {
                playButtonClickSound();
                setIsOpen(false);
              }}
              className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {styles.map((item) => {
              const active = currentStyle === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all cursor-pointer ${
                    active
                      ? 'bg-white/[0.14] border-white/40 shadow-lg shadow-black/40'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.14]'
                  }`}
                >
                  <div className="h-10 flex items-center justify-center mb-1.5">
                    {item.component}
                  </div>
                  <span className={`text-[11.5px] font-medium ${active ? 'text-white font-semibold' : 'text-white/60'}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
