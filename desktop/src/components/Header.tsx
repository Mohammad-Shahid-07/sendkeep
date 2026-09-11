import React from 'react';
import { Trash2, ShieldCheck, Sparkles } from 'lucide-react';
import { useStore } from '../store/appStore';

export const Header: React.FC = () => {
  const { items, clearAll } = useStore();

  return (
    <div className="flex flex-col gap-2 p-3 border-b border-white/10 bg-black/40 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white tracking-wide">SendKeep</h1>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Wi-Fi P2P Ready</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/70">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Auto-Trust</span>
          </div>
          {items.length > 0 && (
            <button
              onClick={clearAll}
              title="Clear timeline"
              className="p-1 rounded-md text-white/40 hover:text-red-400 hover:bg-white/5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
