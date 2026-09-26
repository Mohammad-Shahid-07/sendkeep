import { useState, useEffect, type FC } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { InstallerTitlebar } from './components/installer/InstallerTitlebar';
import {
  FolderOpen,
  ArrowRight,
  Check,
  Play,
  RotateCcw,
} from 'lucide-react';

type Step = 'welcome' | 'installing' | 'completed';

const urlParams = new URLSearchParams(window.location.search);
const isInstalledFromUrl = urlParams.get('installed') === '1';
const initialDirFromUrl = urlParams.get('dir')
  ? decodeURIComponent(urlParams.get('dir')!)
  : 'C:\\Users\\User\\AppData\\Local\\Programs\\SendKeep';

export const InstallerApp: FC = () => {
  const [step, setStep] = useState<Step>('welcome');
  const [installDir, setInstallDir] = useState<string>(initialDirFromUrl);
  const [isAlreadyInstalled, setIsAlreadyInstalled] = useState<boolean>(isInstalledFromUrl);
  const [launchOnExit, setLaunchOnExit] = useState<boolean>(true);
  const [autostartOnBoot, setAutostartOnBoot] = useState<boolean>(true);
  const [createShortcuts, setCreateShortcuts] = useState<boolean>(true);

  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('Preparing setup...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    invoke('show_installer_window').catch(() => {});

    if (!urlParams.has('dir')) {
      invoke<string>('get_default_install_dir')
        .then((dir) => setInstallDir(dir))
        .catch(() => {});
    }

    if (!urlParams.has('installed')) {
      invoke<boolean>('is_app_already_installed')
        .then((installed) => setIsAlreadyInstalled(installed))
        .catch(() => {});
    }

    invoke<boolean>('is_windows_autostart_enabled')
      .then((enabled) => setAutostartOnBoot(enabled))
      .catch(() => {});
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
      await new Promise((r) => setTimeout(r, 250));
      setProgress(40);
      setStatusText('Extracting SendKeep binaries & assets...');

      await invoke('execute_installer', {
        installDir,
        createDesktopShortcut: createShortcuts,
        createStartMenuShortcut: createShortcuts,
        autostart: autostartOnBoot,
      });

      setProgress(75);
      setStatusText('Configuring system shortcuts...');
      await new Promise((r) => setTimeout(r, 250));

      setProgress(90);
      setStatusText(
        autostartOnBoot
          ? 'Registering background startup...'
          : 'Finalizing configuration...'
      );
      await new Promise((r) => setTimeout(r, 200));

      setProgress(100);
      setStatusText('Installation finished!');
      await new Promise((r) => setTimeout(r, 300));

      setStep('completed');
    } catch (err: any) {
      console.error('Installation error:', err);
      setErrorMessage(typeof err === 'string' ? err : err?.message || 'Installation encountered an error');
      setStep('welcome');
    }
  };

  const handleLaunchDirectly = async () => {
    try {
      await invoke('launch_installed_app', { installDir });
    } catch (err) {
      console.error('Failed to launch installed app:', err);
      await invoke('exit_installer');
    }
  };

  const handleFinish = async () => {
    if (launchOnExit) {
      await handleLaunchDirectly();
    } else {
      await invoke('exit_installer');
    }
  };

  const handleClose = async () => {
    await invoke('exit_installer');
  };

  return (
    <div className="w-full h-full bg-[#090A0E] text-white select-none flex flex-col font-sans overflow-hidden border border-white/[0.08] rounded-2xl relative shadow-2xl">
      {/* Titlebar */}
      <InstallerTitlebar />

      {/* Main Content */}
      <main className="flex-1 px-8 py-5 relative z-10 flex flex-col justify-between overflow-hidden">
        {step === 'welcome' && (
          <div className="flex flex-col h-full justify-between">
            {/* Header */}
            <div className="flex items-center gap-3.5 pt-0.5">
              <img
                src="/logo.png"
                alt="SendKeep"
                className="w-11 h-11 object-contain shrink-0"
              />
              <div className="flex flex-col min-w-0">
                <h1 className="text-base font-semibold text-white tracking-tight leading-tight">
                  {isAlreadyInstalled ? 'SendKeep is Already Installed' : 'Install SendKeep'}
                </h1>
                <p className="text-xs text-white/50 tracking-normal mt-0.5">
                  {isAlreadyInstalled
                    ? 'Version 0.0.1 is already set up and configured on this PC.'
                    : 'A zero-friction clipboard shelf and cross-device drop environment.'}
                </p>
              </div>
            </div>

            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400 text-center">
                {errorMessage}
              </div>
            )}

            {/* Path & Options Card */}
            <div className="bg-[#121316] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                  {isAlreadyInstalled ? 'Installed Directory' : 'Installation Directory'}
                </span>
                <div className="bg-[#090A0E] border border-white/[0.06] rounded-lg px-3 py-2 flex items-center gap-2.5">
                  <FolderOpen className="w-4 h-4 text-white/40 shrink-0" />
                  <div className="flex-1 text-xs font-mono text-white/70 truncate select-all outline-none">
                    {installDir}
                  </div>
                  {!isAlreadyInstalled && (
                    <button
                      type="button"
                      onClick={handleBrowseFolder}
                      className="px-2.5 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] rounded-md transition-colors shrink-0 cursor-pointer"
                    >
                      Change...
                    </button>
                  )}
                </div>
              </div>

              {/* Startup & Shortcut Options */}
              <div className="pt-2 border-t border-white/[0.05] flex flex-col gap-2">
                <label className="flex items-center justify-between cursor-pointer select-none group py-0.5">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-white/85 group-hover:text-white transition-colors">
                      Launch on Windows startup
                    </span>
                    <span className="text-[11px] text-white/45">
                      Silently run in the background tray when your PC signs in
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autostartOnBoot}
                    onChange={(e) => setAutostartOnBoot(e.target.checked)}
                    className="w-4 h-4 rounded bg-white/[0.06] border border-white/20 text-white cursor-pointer accent-white shrink-0 ml-3"
                  />
                </label>

                <div className="h-[1px] bg-white/[0.03]" />

                <label className="flex items-center justify-between cursor-pointer select-none group py-0.5">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-white/85 group-hover:text-white transition-colors">
                      Create Desktop & Start Menu shortcuts
                    </span>
                    <span className="text-[11px] text-white/45">
                      Add quick-access shortcuts to your Desktop and Windows Start Menu
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={createShortcuts}
                    onChange={(e) => setCreateShortcuts(e.target.checked)}
                    className="w-4 h-4 rounded bg-white/[0.06] border border-white/20 text-white cursor-pointer accent-white shrink-0 ml-3"
                  />
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2.5 flex items-center justify-between border-t border-white/[0.06]">
              <button
                type="button"
                onClick={handleClose}
                className="px-3.5 py-1.5 text-xs font-medium text-white/40 hover:text-white/80 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              {isAlreadyInstalled ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLaunchDirectly}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Launch SendKeep
                  </button>
                  <button
                    type="button"
                    onClick={startInstallation}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white hover:bg-white/90 active:scale-[0.98] text-black text-xs font-semibold transition-all cursor-pointer shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reinstall / Repair
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startInstallation}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-white hover:bg-white/90 active:scale-[0.98] text-black text-xs font-semibold transition-all cursor-pointer shadow-sm"
                >
                  <span>Install SendKeep</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'installing' && (
          <div className="flex flex-col items-center justify-center h-full max-w-[360px] mx-auto w-full text-center">
            <div className="mb-4">
              <img
                src="/logo.png"
                alt="SendKeep"
                className="w-12 h-12 object-contain select-none"
              />
            </div>

            <h2 className="text-base font-semibold text-white tracking-tight mb-1">
              {isAlreadyInstalled ? 'Reinstalling SendKeep' : 'Installing SendKeep'}
            </h2>
            <p className="text-xs text-white/50 mb-6 h-4">
              {statusText}
            </p>

            <div className="w-full space-y-2">
              <div className="flex justify-between items-center px-0.5 text-[11px]">
                <span className="text-white/40 font-mono">Progress</span>
                <span className="font-mono text-white/80 font-medium">{progress}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2 text-[11px] text-white/40">
              <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
              <span>Configuring local installation files...</span>
            </div>
          </div>
        )}

        {step === 'completed' && (
          <div className="flex flex-col h-full justify-between">
            {/* Completion Hero */}
            <div className="flex items-center gap-3.5 pt-0.5">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0 text-white/80">
                <Check className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="flex flex-col min-w-0">
                <h1 className="text-base font-semibold text-white tracking-tight leading-tight">
                  {isAlreadyInstalled ? 'Reinstallation Complete' : 'Installation Complete'}
                </h1>
                <p className="text-xs text-white/50 tracking-normal mt-0.5">
                  SendKeep is ready and running in the background.
                </p>
              </div>
            </div>

            {/* Minimal Getting Started Card */}
            <div className="bg-[#121316] border border-white/[0.06] rounded-xl p-3.5 flex flex-col gap-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 pb-1 border-b border-white/[0.04]">
                Getting Started
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-white/90">Edge Clipboard Shelf</span>
                    <span className="text-[11px] text-white/50 mt-0.5 leading-relaxed">
                      Move your mouse to the right screen edge anytime to reveal your clipboard history.
                    </span>
                  </div>
                  <kbd className="shrink-0 px-2 py-0.5 text-[11px] font-mono rounded bg-white/[0.08] border border-white/[0.12] text-white/90 tracking-wide">
                    Alt + C
                  </kbd>
                </div>

                <div className="h-[1px] bg-white/[0.04]" />

                <div className="flex flex-col">
                  <span className="text-xs font-medium text-white/90">System Tray Background</span>
                  <span className="text-[11px] text-white/50 mt-0.5 leading-relaxed">
                    {autostartOnBoot
                      ? 'SendKeep stays active in your Windows taskbar tray and starts silently on boot.'
                      : 'SendKeep is running in your taskbar tray. You can enable auto-start anytime in Settings.'}
                  </span>
                </div>

                <div className="h-[1px] bg-white/[0.04]" />

                <div className="flex flex-col">
                  <span className="text-xs font-medium text-white/90">Zero-Friction File Drop</span>
                  <span className="text-[11px] text-white/50 mt-0.5 leading-relaxed">
                    Open SendKeep on your phone or other local PCs to beam files instantly.
                  </span>
                </div>
              </div>
            </div>

            {/* Actions & Launch Option */}
            <div className="pt-2.5 flex items-center justify-between border-t border-white/[0.06]">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-white/60 hover:text-white/90 transition-colors">
                <input
                  type="checkbox"
                  checked={launchOnExit}
                  onChange={(e) => setLaunchOnExit(e.target.checked)}
                  className="w-3.5 h-3.5 rounded bg-white/[0.06] border border-white/20 text-white cursor-pointer accent-white"
                />
                <span>Launch SendKeep now</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3.5 py-1.5 text-xs font-medium text-white/40 hover:text-white/80 transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-white hover:bg-white/90 active:scale-[0.98] text-black text-xs font-semibold transition-all cursor-pointer shadow-sm"
                >
                  <span>{launchOnExit ? 'Finish & Launch' : 'Finish'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
