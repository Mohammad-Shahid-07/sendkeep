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
        initial={{ opacity: 0, y: -16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -16, scale: 0.96 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{ backgroundColor: '#0d0f16' }}
        className="fixed top-12 left-3 right-3 z-50 border border-white/[0.1] rounded-2xl p-3.5 shadow-[0_20px_48px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06)] flex flex-col gap-2.5 text-white select-none backdrop-blur-xl"
      >
        {/* Header: Device Info & Close */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Squircle Device Icon with Live Dot */}
            <div className="relative w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-emerald-400 shrink-0">
              <Smartphone className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-2 border-[#0d0f16]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/95 truncate">
                  {incomingPairRequest.alias}
                </span>
                <span className="text-[9.5px] uppercase font-mono tracking-wider px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  Pair Request
                </span>
              </div>
              <div className="text-[10.5px] text-white/40 truncate font-mono mt-0.5 flex items-center gap-1.5">
                <span>{incomingPairRequest.deviceModel || 'Mobile Device'}</span>
                <span className="text-white/20">•</span>
                <span>{incomingPairRequest.ip}</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleDecline}
            title="Decline request"
            className="w-6 h-6 rounded-lg text-white/30 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Security / Subnet Trust Micro-Notice */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.05] text-[11px] text-white/60">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">Allow mutual drag & drop Wi-Fi file streaming</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-2 pt-0.5">
          <button
            onClick={handleDecline}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-xs font-semibold text-[#061e13] shadow-[0_2px_12px_rgba(16,185,129,0.35)] transition-all cursor-pointer"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Accept & Pair</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
