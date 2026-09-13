import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Check, X, ShieldCheck } from 'lucide-react';
import { useStore } from '../store/appStore';
import { playPop, playTick } from '../lib/soundEffects';

export const PairRequestToast: React.FC = () => {
  const { incomingPairRequest, respondPairRequest } = useStore();

  if (!incomingPairRequest) return null;

  const handleAccept = () => {
    playPop();
    respondPairRequest(incomingPairRequest.requestId, true);
  };

  const handleDecline = () => {
    playTick();
    respondPairRequest(incomingPairRequest.requestId, false);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed top-14 left-3.5 right-3.5 z-50 bg-[#12131b] border border-emerald-500/40 rounded-2xl p-3.5 shadow-2xl shadow-black/80 backdrop-blur-xl flex flex-col gap-2.5 text-white select-none"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate">
                  {incomingPairRequest.alias}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                  Pair Request
                </span>
              </div>
              <div className="text-[10px] text-white/40 truncate font-mono">
                {incomingPairRequest.deviceModel || 'Mobile Device'} • {incomingPairRequest.ip}
              </div>
            </div>
          </div>

          <button
            onClick={handleDecline}
            className="w-6 h-6 rounded-lg text-white/30 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-white/60 px-0.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Trust this device for zero-click direct file transfers?</span>
        </div>

        <div className="flex items-center justify-end gap-2 pt-0.5">
          <button
            onClick={handleDecline}
            className="px-3 py-1.5 rounded-xl text-xs text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-xs font-semibold text-black transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Accept & Trust</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
