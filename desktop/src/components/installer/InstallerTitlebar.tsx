import type { FC } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, X } from 'lucide-react';

export const InstallerTitlebar: FC = () => {
  const handleStartDrag = (e: React.MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('button')) {
      invoke('start_installer_dragging').catch(() => {});
      getCurrentWindow().startDragging().catch(() => {});
    }
  };

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke('minimize_installer_window');
    } catch {
      const win = getCurrentWindow();
      await win.minimize().catch(() => {});
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke('exit_installer');
    } catch {
      const win = getCurrentWindow();
      await win.close().catch(() => {});
    }
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleStartDrag}
      className="h-9 w-full flex items-center justify-between px-3.5 border-b border-white/[0.06] bg-[#090A0E] select-none z-50 shrink-0 cursor-default"
    >
      {/* Brand Identity */}
      <div data-tauri-drag-region className="flex items-center gap-2 pointer-events-none">
        <img
          src="/logo.png"
          alt="SendKeep"
          className="w-4 h-4 object-contain"
        />
        <span className="text-xs font-semibold text-white/90 font-sans tracking-tight">
          SendKeep
        </span>
        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.05] text-white/40 border border-white/[0.08]">
          v1.0.0
        </span>
      </div>

      {/* Window Controls */}
      <div className="flex items-center gap-0.5 -mr-1 pointer-events-auto">
        <button
          type="button"
          onClick={handleMinimize}
          className="w-6 h-6 flex items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          title="Minimize"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="w-6 h-6 flex items-center justify-center rounded-md text-white/40 hover:text-red-400 hover:bg-red-500/15 transition-colors cursor-pointer"
          title="Close"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </header>
  );
};
