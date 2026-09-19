import React, { useState, useEffect, type FC } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { motion } from 'framer-motion';
import { InstallerTitlebar } from './components/installer/InstallerTitlebar';
import {
  FolderOpen,
  Check,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

type Step = 'welcome' | 'installing' | 'completed';

interface ToggleProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}

// Crisp, solid SendKeep Toggle (zero blurry neon glow)
const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none border ${
        checked
          ? 'bg-[#7C3AED] border-[#8B5CF6]'
          : 'bg-white/[0.12] border-white/[0.14] hover:bg-white/[0.18]'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <motion.span
        initial={false}
        animate={{
          x: checked ? 18 : 2,
        }}
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 32,
          mass: 0.5,
        }}
        className="pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm"
      />
    </button>
  );
};

export const InstallerApp: FC = () => {
  const [step, setStep] = useState<Step>('welcome');
  const [installDir, setInstallDir] = useState<string>('C:\\Users\\User\\AppData\\Local\\Programs\\SendKeep');
  const [desktopShortcut, setDesktopShortcut] = useState<boolean>(true);
  const [startMenuShortcut, setStartMenuShortcut] = useState<boolean>(true);
  const [autostart, setAutostart] = useState<boolean>(true);

  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('Preparing setup...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Set spacious 620x440 window geometry and center
  useEffect(() => {
    const initWindow = async () => {
      try {
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(620, 440));
        await win.center();
        await invoke('resize_installer_window');
        setTimeout(() => {
          win.show().catch(() => {});
          invoke('show_installer_window').catch(() => {});
        }, 50);
      } catch (e) {
        invoke('resize_installer_window').catch(() => {});
        invoke('show_installer_window').catch(() => {});
      }
    };

    initWindow();

    invoke<string>('get_default_install_dir')
      .then((dir) => setInstallDir(dir))
      .catch((e) => console.error('Could not get default install dir:', e));
  }, []);

  const handleBrowseFolder = async () => {
    try {
      const selected = await invoke<string>('pick_install_directory');
      if (selected) {
        setInstallDir(selected);
      }
    } catch (err) {
      console.warn('Folder selection cancelled or failed:', err);
    }
  };

  const startInstallation = async () => {
    setStep('installing');
    setErrorMessage(null);
    setProgress(15);
    setStatusText('Preparing destination directory...');

    try {
      await new Promise((r) => setTimeout(r, 400));
      setProgress(40);
      setStatusText('Extracting SendKeep binaries & assets...');

      await invoke('execute_installer', {
        installDir,
        createDesktopShortcut: desktopShortcut,
        createStartMenuShortcut: startMenuShortcut,
        autostart,
      });

      setProgress(85);
      setStatusText('Registering shell integration...');
      await new Promise((r) => setTimeout(r, 400));

      setProgress(100);
      setStatusText('Installation finished successfully!');
      await new Promise((r) => setTimeout(r, 300));
      setStep('completed');
    } catch (err: any) {
      console.error('Installation error:', err);
      setErrorMessage(typeof err === 'string' ? err : err?.message || 'Installation encountered an error');
      setStep('welcome');
    }
  };

  const handleLaunch = async () => {
    try {
      await invoke('launch_installed_app', { installDir });
    } catch (err) {
      console.error('Failed to launch:', err);
      await invoke('exit_installer');
    }
  };

  const handleClose = async () => {
    await invoke('exit_installer');
  };

  return (
    <div className="w-full h-full bg-[#0D0E12] text-white select-none flex flex-col font-sans overflow-hidden border border-white/[0.08] rounded-2xl relative shadow-2xl">
      {/* Titlebar */}
      <InstallerTitlebar />

      {/* Content Canvas */}
      <main className="flex-1 px-8 py-5 relative z-10 flex flex-col justify-between overflow-hidden">
        {step === 'welcome' && (
          <div className="flex flex-col h-full animate-fadeIn justify-between">
            {/* Clean Hero */}
            <div className="flex items-center gap-4 pt-1 pb-3">
              <img
                src="/logo.png"
                alt="SendKeep"
                className="w-14 h-14 object-contain shrink-0"
              />
              <div className="flex flex-col min-w-0">
                <h1 className="text-lg font-bold text-white tracking-tight leading-tight">
                  Install SendKeep
                </h1>
                <p className="text-xs text-white/50 tracking-normal mt-1">
                  Seamless cross-device drop environment for Windows and Android.
                </p>
              </div>
            </div>

            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400 mb-2 text-center">
                {errorMessage}
              </div>
            )}

            {/* Clean Settings Card */}
            <div className="bg-[#14151B] border border-white/[0.07] rounded-xl p-4 flex flex-col gap-3">
              {/* Destination Folder */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Installation Folder
                </span>
                <div className="bg-[#0A0B0E] border border-white/[0.08] rounded-lg px-3 py-2 flex items-center gap-2.5">
                  <FolderOpen className="w-4 h-4 text-white/40 shrink-0" />
                  <div className="flex-1 text-xs font-mono text-white/80 truncate select-all outline-none">
                    {installDir}
                  </div>
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    className="px-3 py-1 text-xs font-semibold text-white/70 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] rounded-md transition-colors shrink-0"
                  >
                    Change...
                  </button>
                </div>
              </div>

              <div className="h-[1px] bg-white/[0.06]" />

              {/* Preference Toggles */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-xs font-medium text-white/80">Create Desktop Shortcut</span>
                  <Toggle checked={desktopShortcut} onChange={setDesktopShortcut} />
                </div>
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-xs font-medium text-white/80">Add to Start Menu</span>
                  <Toggle checked={startMenuShortcut} onChange={setStartMenuShortcut} />
                </div>
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-xs font-medium text-white/80">Launch SendKeep on Startup</span>
                  <Toggle checked={autostart} onChange={setAutostart} />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 flex items-center justify-between border-t border-white/[0.06]">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-xs font-medium text-white/40 hover:text-white/80 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={startInstallation}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] active:scale-[0.98] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Install SendKeep
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {step === 'installing' && (
          <div className="flex flex-col items-center justify-center h-full animate-fadeIn max-w-[380px] mx-auto w-full text-center">
            {/* Authentic Brand Logo */}
            <div className="mb-5">
              <img
                src="/logo.png"
                alt="SendKeep"
                className="w-16 h-16 object-contain select-none transition-transform duration-700"
              />
            </div>

            <h2 className="text-base font-semibold text-white tracking-tight mb-1">
              Installing SendKeep
            </h2>
            <p className="text-xs text-white/50 mb-6 h-4">
              {statusText}
            </p>

            <div className="w-full space-y-2">
              <div className="flex justify-between items-center px-1 text-[11px]">
                <span className="text-white/40 font-mono">Progress</span>
                <span className="font-mono text-[#A78BFA] font-semibold">{progress}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#7C3AED] rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2 text-[11px] text-white/40">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Installing locally for current user</span>
            </div>
          </div>
        )}

        {step === 'completed' && (
          <div className="flex flex-col h-full animate-fadeIn items-center justify-center text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mb-3 text-emerald-400">
              <Check className="w-7 h-7" />
            </div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Installation Complete
            </h2>
            <p className="text-xs text-white/50 mt-1 max-w-xs leading-relaxed">
              SendKeep is now installed and ready to use.
            </p>

            <div className="pt-6">
              <button
                type="button"
                onClick={handleLaunch}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] active:scale-[0.98] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Launch SendKeep
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
