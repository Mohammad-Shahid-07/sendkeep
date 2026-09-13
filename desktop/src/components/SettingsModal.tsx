import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Folder,
  FolderOpen,
  Volume2,
  VolumeX,
  Laptop,
  CheckCircle2,
  ShieldCheck,
  Radio,
  Sliders,
  Sparkles,
  Lock,
  Key,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useStore } from '../store/appStore';
import { playPop, playTick } from '../lib/soundEffects';
import { invoke } from '@tauri-apps/api/core';
import '../styles/settings.css';

export const SettingsModal: React.FC = () => {
  const { isSettingsOpen, setSettingsOpen, settings, updateSettings, pickSaveDirectory } = useStore();
  const [activeTab, setActiveTab] = useState<'general' | 'storage' | 'transfer' | 'about'>('general');
  const [aliasDraft, setAliasDraft] = useState(settings.deviceAlias);
  const [pinDraft, setPinDraft] = useState(settings.securityPin || '');
  const [showPin, setShowPin] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [networkInterfaces, setNetworkInterfaces] = useState<{ name: string; ip: string }[]>([]);
  const [aliasSaved, setAliasSaved] = useState(false);

  const handleSaveAlias = async () => {
    if (aliasDraft.trim()) {
      playTick();
      await updateSettings({ deviceAlias: aliasDraft.trim() });
      setAliasSaved(true);
      setTimeout(() => setAliasSaved(false), 1800);
    }
  };

  React.useEffect(() => {
    if (activeTab === 'transfer') {
      invoke<{ name: string; ip: string }[]>('get_network_interfaces')
        .then((ifaces) => {
          if (Array.isArray(ifaces)) setNetworkInterfaces(ifaces);
        })
        .catch(() => {});
    }
  }, [activeTab]);

  // Sync alias and PIN drafts when settings change
  React.useEffect(() => {
    if (settings.deviceAlias) {
      setAliasDraft(settings.deviceAlias);
    }
  }, [settings.deviceAlias]);

  React.useEffect(() => {
    setPinDraft(settings.securityPin || '');
  }, [settings.securityPin]);

  React.useEffect(() => {
    if (isSettingsOpen) {
      invoke('set_interactive', { interactive: true });

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleClose();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }
  }, [isSettingsOpen, aliasDraft, settings.deviceAlias]);

  if (!isSettingsOpen) return null;

  const handleClose = () => {
    playPop();
    // Save alias if changed
    if (aliasDraft.trim() && aliasDraft !== settings.deviceAlias) {
      updateSettings({ deviceAlias: aliasDraft.trim() });
    }
    setSettingsOpen(false);
  };

  const handleFolderPick = async () => {
    playPop();
    setIsPickingFolder(true);
    try {
      await pickSaveDirectory();
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleOpenFolder = () => {
    playPop();
    invoke('open_downloads_folder').catch(() => {});
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md pointer-events-auto select-none">
        {/* Full Backdrop Click Dismiss */}
        <div className="absolute inset-0 cursor-pointer" onClick={handleClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 10 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-[420px] max-h-[85vh] bg-[#0c0d12] border border-white/[0.1] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white select-none pointer-events-auto"
        >
          {/* 1. Modal Top Bar */}
          <div className="settings-fixed-header flex items-center justify-between border-b border-white/[0.08] pb-3 pt-3.5 px-4 bg-[#090a0e]/60 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-white">Settings & Preferences</h2>
                <p className="text-[11px] text-white/50">SendKeep Desktop v2.1</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.06] hover:border-white/[0.15] flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 2. Tab Selector */}
          <div className="px-4 pt-3 pb-1">
            <div className="settings-tab-bar p-1 bg-white/[0.03] border border-white/[0.06] rounded-xl flex gap-1">
              {(['general', 'storage', 'transfer', 'about'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    playTick();
                    setActiveTab(tab);
                  }}
                  className={`settings-tab-btn capitalize ${activeTab === tab ? 'active' : ''}`}
                >
                  <span className="settings-tab-text">{tab}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Tab Content List */}
          <div className="settings-scroll-list px-4 py-3 space-y-4 overflow-y-auto">
            {/* ──── GENERAL TAB ──── */}
            {activeTab === 'general' && (
              <div>
                <div className="setting-group-label">Device & Audio</div>

                {/* Device Alias */}
                <div className="setting-row vertical bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 mb-2.5">
                  <div className="setting-info">
                    <div className="setting-title flex items-center gap-2">
                      <Laptop className="w-4 h-4 text-indigo-400" />
                      Device Name (Alias)
                    </div>
                    <div className="setting-desc">How this laptop appears on your Android device radar.</div>
                  </div>
                  <div className="flex w-full items-center gap-2 mt-2">
                    <input
                      type="text"
                      value={aliasDraft}
                      onChange={(e) => setAliasDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveAlias();
                      }}
                      onBlur={handleSaveAlias}
                      placeholder="Windows Laptop"
                      className="flex-1 bg-black/50 border border-white/[0.14] focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none transition-colors"
                    />
                    <button
                      onClick={handleSaveAlias}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        aliasSaved
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-white/[0.06] hover:bg-white/[0.1] text-white/90 border-white/[0.1]'
                      }`}
                    >
                      {aliasSaved ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Saved</span>
                        </>
                      ) : (
                        <span>Save</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Sound Effects */}
                <div className="setting-row bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 mb-2.5">
                  <div className="setting-info">
                    <div className="setting-title flex items-center gap-2">
                      {settings.soundEffectsEnabled ? (
                        <Volume2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <VolumeX className="w-4 h-4 text-white/40" />
                      )}
                      Sound Effects
                    </div>
                    <div className="setting-desc">Play synthesized chime on file beam, drop, and shelf interaction.</div>
                  </div>
                  <button
                    onClick={() => {
                      playPop();
                      updateSettings({ soundEffectsEnabled: !settings.soundEffectsEnabled });
                    }}
                    className={`setting-toggle ${settings.soundEffectsEnabled ? 'checked' : ''}`}
                  >
                    <div className="toggle-thumb" />
                  </button>
                </div>

                {/* Windows Explorer Context Menu */}
                <div className="setting-row bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 mb-2.5">
                  <div className="setting-info">
                    <div className="setting-title flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-cyan-400" />
                      Windows Explorer Integration
                    </div>
                    <div className="setting-desc">
                      Add "Send with SendKeep" to Windows Explorer right-click context menu.
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      playPop();
                      updateSettings({ contextMenuEnabled: !settings.contextMenuEnabled });
                    }}
                    className={`setting-toggle ${settings.contextMenuEnabled ? 'checked' : ''}`}
                  >
                    <div className="toggle-thumb" />
                  </button>
                </div>

                {/* Screen Edge Hover Info */}
                <div className="setting-row vertical bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                  <div className="setting-info">
                    <div className="setting-title flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      Screen Edge Slide-Out
                    </div>
                    <div className="setting-desc">
                      Lives invisible on the left screen edge. Move cursor to the border to glide the shelf open.
                    </div>
                  </div>
                  <span className="setting-badge-subtle text-purple-300">16ms Zero-Lag Tracking</span>
                </div>
              </div>
            )}

            {/* ──── STORAGE TAB ──── */}
            {activeTab === 'storage' && (
              <div>
                <div className="setting-group-label">Save Directory</div>

                <div className="setting-row vertical bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 mb-3">
                  <div className="setting-info">
                    <div className="setting-title flex items-center gap-2">
                      <Folder className="w-4 h-4 text-amber-400" />
                      Downloads Destination
                    </div>
                    <div className="setting-desc">
                      Where incoming files and photos from your phone are saved automatically.
                    </div>
                  </div>

                  <div className="w-full bg-black/50 border border-white/[0.08] rounded-lg p-2.5 mt-1 font-mono text-[11px] text-white/80 break-all">
                    {settings.saveDirectory || '%USERPROFILE%\\Downloads\\SendKeep'}
                  </div>

                  <div className="flex items-center gap-2 w-full mt-2">
                    <button
                      onClick={handleFolderPick}
                      disabled={isPickingFolder}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-xs font-semibold text-white transition-all cursor-pointer shadow-md shadow-indigo-600/20"
                    >
                      <Folder className="w-3.5 h-3.5" />
                      {isPickingFolder ? 'Selecting...' : 'Change Folder'}
                    </button>
                    <button
                      onClick={handleOpenFolder}
                      className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white/80 hover:text-white transition-all cursor-pointer"
                      title="Reveal in Windows Explorer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Open Folder
                    </button>
                  </div>
                </div>

                <div className="setting-group-label">File Collision Strategy</div>
                <div className="setting-row vertical bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                  <div className="setting-info mb-2">
                    <div className="setting-title">Duplicate Name Handling</div>
                    <div className="setting-desc">How to resolve incoming files with identical names.</div>
                  </div>
                  <div className="setting-pills">
                    {[
                      { key: 'rename', label: 'Auto-Rename' },
                      { key: 'overwrite', label: 'Overwrite' },
                      { key: 'skip', label: 'Skip Existing' },
                    ].map((mode) => (
                      <button
                        key={mode.key}
                        onClick={() => {
                          playTick();
                          updateSettings({ collisionStrategy: mode.key });
                        }}
                        className={`pill ${settings.collisionStrategy === mode.key ? 'active' : ''}`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ──── TRANSFER TAB ──── */}
            {activeTab === 'transfer' && (
              <div>
                <div className="setting-group-label">Reception Rules</div>

                {/* Auto-Accept */}
                <div className="setting-row bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 mb-2.5">
                  <div className="setting-info">
                    <div className="setting-title flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Zero-Prompt Auto-Accept
                    </div>
                    <div className="setting-desc">
                      Automatically receive files from paired trusted devices with zero confirmation clicks on PC.
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      playPop();
                      updateSettings({ autoAcceptTrusted: !settings.autoAcceptTrusted });
                    }}
                    className={`setting-toggle ${settings.autoAcceptTrusted ? 'checked' : ''}`}
                  >
                    <div className="toggle-thumb" />
                  </button>
                </div>

                {/* Protocol & Port */}
                <div className="setting-row bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 mb-2.5">
                  <div className="setting-info">
                    <div className="setting-title flex items-center gap-2">
                      <Radio className="w-4 h-4 text-indigo-400" />
                      Local Transmission Port
                    </div>
                    <div className="setting-desc">Standard LocalSend / SendKeep protocol port.</div>
                  </div>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-white/[0.06] text-white">
                    53317
                  </span>
                </div>

                {/* High Speed Chunking */}
                <div className="setting-row bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 mb-2.5">
                  <div className="setting-info">
                    <div className="setting-title flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-cyan-400" />
                      Streaming Engine
                    </div>
                    <div className="setting-desc">512KB Tokio non-blocking zero-copy socket buffer.</div>
                  </div>
                  <span className="setting-badge-subtle text-cyan-300">High Throughput</span>
                </div>

                {/* Security & Verification */}
                <div className="setting-group-label mt-4">Security & Verification</div>
                <div className="setting-row vertical bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                  <div className="flex items-center justify-between w-full mb-2">
                    <div className="setting-info">
                      <div className="setting-title flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-400" />
                        Require Transfer PIN
                      </div>
                      <div className="setting-desc">
                        Require senders to enter a 4-digit PIN before transfers or pairing are accepted.
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        playPop();
                        const nextRequire = !settings.requirePin;
                        updateSettings({
                          requirePin: nextRequire,
                          securityPin: nextRequire && !settings.securityPin ? '1234' : settings.securityPin,
                        });
                      }}
                      className={`setting-toggle ${settings.requirePin ? 'checked' : ''}`}
                    >
                      <div className="toggle-thumb" />
                    </button>
                  </div>

                  {settings.requirePin && (
                    <div className="w-full pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-white/70">
                        <Key className="w-3.5 h-3.5 text-amber-400/80" />
                        <span>4-Digit Security PIN:</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type={showPin ? 'text' : 'password'}
                          inputMode="numeric"
                          maxLength={4}
                          value={pinDraft}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                            setPinDraft(val);
                            if (val.length === 4) {
                              playTick();
                              updateSettings({ securityPin: val });
                            }
                          }}
                          placeholder="4-digit PIN"
                          className="w-24 text-center font-mono text-sm tracking-widest bg-black/60 border border-amber-500/40 rounded-lg px-2.5 py-1 text-amber-300 focus:outline-none focus:border-amber-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/60 hover:text-white transition-all cursor-pointer"
                          title={showPin ? 'Hide PIN' : 'Reveal PIN'}
                        >
                          {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Active Network Interfaces */}
                <div className="setting-group-label mt-4">Active Network Adapters</div>
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 flex flex-col gap-2">
                  <div className="text-xs text-white/50 mb-1">
                    SendKeep listens and broadcasts across all local network interfaces:
                  </div>
                  {networkInterfaces.length === 0 ? (
                    <div className="text-xs text-white/40 font-mono">127.0.0.1:53317</div>
                  ) : (
                    networkInterfaces.map((iface, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/[0.04]"
                      >
                        <div className="flex items-center gap-2">
                          <Radio className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-xs font-semibold text-white/90 truncate max-w-[180px]">
                            {iface.name}
                          </span>
                        </div>
                        <span className="font-mono text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                          {iface.ip}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ──── ABOUT TAB ──── */}
            {activeTab === 'about' && (
              <div>
                <div className="support-promo">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-emerald-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 mb-1">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-bold text-white">SendKeep Desktop</div>
                  <p className="support-promo-title">
                    High-speed, zero-friction cross-device drop environment connecting Windows and Android.
                  </p>

                  <div className="grid grid-cols-2 gap-2 w-full mt-2 text-left">
                    <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06]">
                      <div className="text-[10px] text-white/50 uppercase font-bold">Memory Footprint</div>
                      <div className="text-xs font-semibold text-emerald-400">~18 MB RAM</div>
                      <div className="text-[10px] text-white/40">vs ~150MB Flutter</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06]">
                      <div className="text-[10px] text-white/50 uppercase font-bold">Architecture</div>
                      <div className="text-xs font-semibold text-white">Tauri v2 + Rust</div>
                      <div className="text-[10px] text-white/40">Axum + Tokio</div>
                    </div>
                  </div>
                </div>

                <div className="app-version-footer">
                  <span>Version 2.1.0</span>
                  <span className="version-separator">•</span>
                  <span>MIT License</span>
                </div>
              </div>
            )}
          </div>

          {/* 4. Modal Footer */}
          <div className="p-3 border-t border-white/[0.08] bg-[#090a0e]/40 flex justify-end">
            <button
              onClick={handleClose}
              className="px-4 py-1.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-white/90 active:scale-[0.98] transition-all cursor-pointer shadow-md"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
