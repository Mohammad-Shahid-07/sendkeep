import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { useStore } from '../store/appStore';
import { playPop, playTick } from '../lib/soundEffects';
import { invoke } from '@tauri-apps/api/core';
import '../styles/settings.css';

interface ToggleProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          playPop();
          onChange(!checked);
        }
      }}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none border ${
        checked
          ? 'bg-indigo-600 border-indigo-400/50 shadow-[0_0_12px_rgba(99,102,241,0.35)]'
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
        className="pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
      />
    </button>
  );
};

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
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="absolute inset-0 z-50 flex flex-col bg-[#090a0e] pointer-events-auto select-none overflow-hidden text-white"
      >
        {/* 1. Top Header: Back Navigation & Close */}
        <div className="flex items-center justify-between px-3.5 h-10 border-b border-white/[0.06] shrink-0 bg-[#090a0e]">
          <button
            onClick={handleClose}
            className="flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white transition-colors cursor-pointer py-1 px-2 -ml-1.5 rounded-lg hover:bg-white/[0.06]"
            title="Back to Shelf (Esc)"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <span className="text-xs font-semibold text-white/50 tracking-tight">Settings</span>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white flex items-center justify-center transition-colors cursor-pointer -mr-1"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Stationary Fixed Header: Segmented Squircle Tab Bar */}
        <div className="settings-fixed-header px-3.5 pt-2 pb-1">
          <div className="settings-tab-bar">
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

        {/* 3. Flat Setting Rows (EdgeDrop Clean Style) */}
        <div className="settings-scroll-list flex-1 overflow-y-auto px-4 py-2 flex flex-col">
          {/* ──── GENERAL TAB ──── */}
          {activeTab === 'general' && (
            <div>
              <div className="setting-group-label">Device & Audio</div>

              {/* Device Alias */}
              <div className="setting-row vertical">
                <div className="setting-info">
                  <div className="setting-title">Device Name (Alias)</div>
                  <div className="setting-desc">How this PC appears on your Android device radar.</div>
                </div>
                <div className="flex w-full items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={aliasDraft}
                    onChange={(e) => setAliasDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveAlias();
                    }}
                    onBlur={handleSaveAlias}
                    placeholder="Windows PC"
                    className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-white/20 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none transition-colors"
                  />
                  <button
                    onClick={handleSaveAlias}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.08] hover:bg-white/[0.12] text-white transition-all cursor-pointer shrink-0"
                  >
                    {aliasSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>

              <div className="setting-divider" />

              {/* Sound Effects */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Sound Effects</div>
                  <div className="setting-desc">Play synthesized chime on file beam, drop, and shelf interaction.</div>
                </div>
                <Toggle
                  checked={settings.soundEffectsEnabled}
                  onChange={(val) => updateSettings({ soundEffectsEnabled: val })}
                />
              </div>

              <div className="setting-divider" />

              {/* Windows Explorer Context Menu */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Windows Explorer Integration</div>
                  <div className="setting-desc">
                    Add "Send with SendKeep" to Windows Explorer right-click context menu.
                  </div>
                </div>
                <Toggle
                  checked={Boolean(settings.contextMenuEnabled)}
                  onChange={(val) => updateSettings({ contextMenuEnabled: val })}
                />
              </div>

              <div className="setting-divider" />

              {/* Screen Edge Hover Activation */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Screen Edge Activation</div>
                  <div className="setting-desc">
                    Move cursor to the left screen border to glide the shelf open.
                  </div>
                </div>
                <Toggle
                  checked={settings.edgeTriggerEnabled !== false}
                  onChange={(val) => updateSettings({ edgeTriggerEnabled: val })}
                />
              </div>

              <div className="setting-divider" />

              {/* Edge Handle Affordance */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Edge Handle Affordance</div>
                  <div className="setting-desc">
                    Reveal a subtle frosted notch when approaching the screen border (invisible when idle).
                  </div>
                </div>
                <Toggle
                  checked={settings.showEdgeHandle !== false}
                  onChange={(val) => updateSettings({ showEdgeHandle: val })}
                />
              </div>
            </div>
          )}

          {/* ──── STORAGE TAB ──── */}
          {activeTab === 'storage' && (
            <div>
              <div className="setting-group-label">Downloads Destination</div>

              <div className="setting-row vertical">
                <div className="setting-info">
                  <div className="setting-title">Save Directory</div>
                  <div className="setting-desc">
                    Where incoming files and photos from your phone are saved automatically.
                  </div>
                </div>

                <div className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 mt-1 font-mono text-[11px] text-white/80 break-all select-all">
                  {settings.saveDirectory || '%USERPROFILE%\\Downloads\\SendKeep'}
                </div>

                <div className="flex items-center gap-2 w-full mt-2">
                  <button
                    onClick={handleFolderPick}
                    disabled={isPickingFolder}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white transition-all cursor-pointer"
                  >
                    {isPickingFolder ? 'Selecting...' : 'Change Folder'}
                  </button>
                  <button
                    onClick={handleOpenFolder}
                    className="py-1.5 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-white/70 hover:text-white transition-all cursor-pointer"
                  >
                    Open Folder
                  </button>
                </div>
              </div>

              <div className="setting-divider" />

              <div className="setting-group-label">File Collision Strategy</div>
              <div className="setting-row vertical">
                <div className="setting-info mb-1">
                  <div className="setting-title">Duplicate Name Handling</div>
                  <div className="setting-desc">How to resolve incoming files with identical names.</div>
                </div>
                <div className="flex items-center p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-1 w-full mt-1">
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
                      className={`flex-1 py-1 px-2 text-center text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        settings.collisionStrategy === mode.key
                          ? 'bg-white/10 text-white font-semibold shadow-sm'
                          : 'text-white/40 hover:text-white/70'
                      }`}
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
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Zero-Prompt Auto-Accept</div>
                  <div className="setting-desc">
                    Automatically receive files from paired trusted devices with zero confirmation clicks on PC.
                  </div>
                </div>
                <Toggle
                  checked={settings.autoAcceptTrusted}
                  onChange={(val) => updateSettings({ autoAcceptTrusted: val })}
                />
              </div>

              <div className="setting-divider" />

              {/* Protocol & Port */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Local Transmission Port</div>
                  <div className="setting-desc">Standard LocalSend / SendKeep protocol port.</div>
                </div>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-lg bg-white/[0.06] text-white/80">
                  53317
                </span>
              </div>

              <div className="setting-divider" />

              {/* Security & Verification */}
              <div className="setting-group-label">Security & Verification</div>
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Require Transfer PIN</div>
                  <div className="setting-desc">
                    Require senders to enter a 4-digit PIN before transfers or pairing are accepted.
                  </div>
                </div>
                <Toggle
                  checked={settings.requirePin}
                  onChange={(val) => {
                    updateSettings({
                      requirePin: val,
                      securityPin: val && !settings.securityPin ? '1234' : settings.securityPin,
                    });
                  }}
                />
              </div>

              {settings.requirePin && (
                <>
                  <div className="setting-row">
                    <div className="setting-info">
                      <div className="setting-title">4-Digit Security PIN</div>
                      <div className="setting-desc">Secret code for incoming transfers.</div>
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
                        placeholder="PIN"
                        className="w-20 text-center font-mono text-sm tracking-widest bg-white/[0.04] border border-white/[0.1] rounded-lg px-2 py-1 text-white focus:outline-none focus:border-white/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white transition-all cursor-pointer"
                        title={showPin ? 'Hide PIN' : 'Reveal PIN'}
                      >
                        {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="setting-divider" />

              {/* Active Network Interfaces */}
              <div className="setting-group-label">Active Network Adapters</div>
              <div className="flex flex-col gap-1.5 pt-1">
                {networkInterfaces.length === 0 ? (
                  <div className="text-xs text-white/40 font-mono py-1">127.0.0.1:53317</div>
                ) : (
                  networkInterfaces.map((iface, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/[0.05]"
                    >
                      <span className="text-xs font-medium text-white/80 truncate max-w-[180px]">
                        {iface.name}
                      </span>
                      <span className="font-mono text-[11px] text-white/50 bg-white/[0.04] px-2 py-0.5 rounded-md">
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
            <div className="py-8 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/90 shadow-sm mb-3">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M9 3v18" />
                </svg>
              </div>
              <div className="text-sm font-semibold text-white tracking-tight">SendKeep Desktop</div>
              <div className="text-xs text-white/40 mt-1">Cross-device Wi-Fi drop shelf for Windows & Android</div>

              <div className="setting-divider w-full my-6" />

              <div className="w-full flex flex-col gap-2">
                <div className="flex items-center justify-between py-1 text-xs">
                  <span className="text-white/40">Version</span>
                  <span className="text-white/80 font-mono">2.1.0</span>
                </div>
                <div className="flex items-center justify-between py-1 text-xs">
                  <span className="text-white/40">Engine</span>
                  <span className="text-white/80">Tauri v2 + Rust</span>
                </div>
                <div className="flex items-center justify-between py-1 text-xs">
                  <span className="text-white/40">Protocol</span>
                  <span className="text-white/80">LocalSend v2 compatible</span>
                </div>
                <div className="flex items-center justify-between py-1 text-xs">
                  <span className="text-white/40">License</span>
                  <span className="text-white/80">MIT</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
