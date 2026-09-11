import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, FolderOpen, Trash2 } from 'lucide-react';
import { useStore, FilterCategory } from '../store/appStore';
import { invoke } from '@tauri-apps/api/core';

export const Header: React.FC = () => {
  const { connectedDevice, items, clearAll, activeFilter, setFilter } = useStore();
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleOpenFolder = () => {
    invoke('open_downloads_folder');
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPopover]);

  const tabs: { key: FilterCategory; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'media', label: 'Media' },
    { key: 'files', label: 'Files' },
    { key: 'links', label: 'Links' },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <div className="flex flex-col relative select-none shrink-0 border-b border-white/[0.04]">
      {/* 1. Header Bar */}
      <header className="flex items-center justify-between px-4 py-3">
        {/* Device Pill */}
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setShowPopover(!showPopover)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] hover:border-white/[0.12] transition-all cursor-pointer"
            title="Connection details"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            <span className="text-xs font-semibold text-white tracking-tight">{connectedDevice.name}</span>
            <ChevronDown className={`w-3 h-3 text-white/40 transition-transform duration-150 ${showPopover ? 'rotate-180' : ''}`} />
          </button>

          {/* Connection Popover */}
          {showPopover && (
            <div className="absolute top-8 left-0 w-64 bg-[#141620] border border-white/10 rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2 backdrop-blur-xl">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/40">Protocol</span>
                <span className="font-mono text-white/70">Local Wi-Fi P2P</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/40">Device IP</span>
                <span className="font-mono text-white/70">{connectedDevice.ip}:53317</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/40">Transfer Mode</span>
                <span className="text-emerald-400 font-medium">Auto-Save (0 clicks)</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/40">Storage</span>
                <span className="font-mono text-white/70 text-[10px]">~/Downloads/SendKeep</span>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenFolder}
            title="Open Downloads in Explorer"
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
          {items.length > 0 && (
            <button
              onClick={clearAll}
              title="Clear shelf"
              className="p-1.5 rounded-lg text-white/40 hover:text-rose-400 hover:bg-white/[0.06] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* 2. Unified Segmented Tab Bar */}
      <div className="px-4 pb-2.5">
        <nav className="flex items-center p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.05]">
          {tabs.map((tab) => {
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`flex-1 py-1 text-center text-[11px] font-medium rounded-md transition-all ${
                  isActive
                    ? 'bg-white/10 text-white font-semibold shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
