import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, Eye, EyeOff, Sparkles } from 'lucide-react';
import { useStore } from '../store/appStore';
import { playPop, playTick, playDialTickSound } from '../lib/soundEffects';
import { HotkeyRecorder } from './HotkeyRecorder';
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
  const {
    isSettingsOpen,
    setSettingsOpen,
    settings,
    updateSettings,
    pickSaveDirectory,
    setIndicatorStyleFlyoutOpen,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'behaviour' | 'position' | 'appearance' | 'transfer'>('behaviour');
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

        {/* 2. Stationary Fixed Header: 4-Tab Segmented Squircle Bar */}
        <div className="settings-fixed-header px-3.5 pt-2 pb-1">
          <div className="settings-tab-bar">
            {[
              { id: 'behaviour', label: 'Behaviour' },
              { id: 'position', label: 'Position' },
              { id: 'appearance', label: 'Appearance' },
              { id: 'transfer', label: 'Network' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  playTick();
                  setActiveTab(tab.id as any);
                }}
                className={`settings-tab-btn capitalize ${activeTab === tab.id ? 'active' : ''}`}
              >
                <span className="settings-tab-text">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Settings Content */}
        <div className="settings-scroll-list flex-1 overflow-y-auto px-4 py-2 flex flex-col">
          {/* ──── BEHAVIOUR TAB ──── */}
          {activeTab === 'behaviour' && (
            <div>
              <div className="setting-group-label">Keyboard & Activation</div>

              {/* Global Hotkey */}
              <div className="setting-row vertical">
                <div className="setting-info">
                  <div className="setting-title">Global Toggle Hotkey</div>
                  <div className="setting-desc">Press any key combination to open/close SendKeep shelf anywhere.</div>
                </div>
                <div className="mt-2 w-full">
                  <HotkeyRecorder
                    value={settings.toggleHotkey || 'Alt+C'}
                    onChange={(hk) => updateSettings({ toggleHotkey: hk })}
                  />
                </div>
              </div>

              <div className="setting-divider" />

              {/* Hover Edge Activation */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Screen Edge Activation</div>
                  <div className="setting-desc">Hover cursor against the screen border to glide the shelf open.</div>
                </div>
                <Toggle
                  checked={settings.hoverActivation ?? true}
                  onChange={(val) => updateSettings({ hoverActivation: val })}
                />
              </div>

              <div className="setting-divider" />

              {/* Edge Handle Affordance */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Edge Notch Affordance</div>
                  <div className="setting-desc">Reveal a subtle 2.5px frosted hairline along the active edge.</div>
                </div>
                <Toggle
                  checked={settings.showEdgeHandle !== false}
                  onChange={(val) => updateSettings({ showEdgeHandle: val })}
                />
              </div>

              <div className="setting-divider" />

              {/* Suppress in Fullscreen */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Suppress in Fullscreen</div>
                  <div className="setting-desc">Prevent accidental shelf opens during fullscreen games and presentations.</div>
                </div>
                <Toggle
                  checked={settings.suppressInFullscreen ?? true}
                  onChange={(val) => updateSettings({ suppressInFullscreen: val })}
                />
              </div>
              <div className="setting-divider" />

              {/* Launch on Windows Startup */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Launch on Windows Startup</div>
                  <div className="setting-desc">Silently launch SendKeep in your system tray when you sign in.</div>
                </div>
                <Toggle
                  checked={settings.autostartEnabled ?? true}
                  onChange={(val) => {
                    playTick();
                    updateSettings({ autostartEnabled: val });
                  }}
                />
              </div>

              <div className="setting-divider" />

              <div className="setting-group-label">History Management</div>

              {/* Auto Delete */}
              <div className="setting-row vertical">
                <div className="setting-info mb-1">
                  <div className="setting-title">Auto-Delete History</div>
                  <div className="setting-desc">Automatically remove unpinned clipboard clips after elapsed time.</div>
                </div>
                <div className="flex items-center p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-1 w-full mt-1">
                  {[
                    { hours: 0, label: 'Never' },
                    { hours: 1, label: '1h' },
                    { hours: 6, label: '6h' },
                    { hours: 24, label: '24h' },
                    { hours: 168, label: '7d' },
                  ].map((opt) => (
                    <button
                      key={opt.hours}
                      onClick={() => {
                        playTick();
                        updateSettings({ autoDeleteHours: opt.hours });
                      }}
                      className={`flex-1 py-1 text-center text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        (settings.autoDeleteHours || 0) === opt.hours
                          ? 'bg-white/10 text-white font-semibold shadow-sm'
                          : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-divider" />

              {/* History Limit */}
              <div className="setting-row vertical">
                <div className="setting-info mb-1">
                  <div className="setting-title">Maximum Clips Saved</div>
                  <div className="setting-desc">Cap history size to conserve disk storage.</div>
                </div>
                <div className="flex items-center p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-1 w-full mt-1">
                  {[100, 250, 500, 1000].map((limit) => (
                    <button
                      key={limit}
                      onClick={() => {
                        playTick();
                        updateSettings({ historyLimit: limit });
                      }}
                      className={`flex-1 py-1 text-center text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        (settings.historyLimit || 500) === limit
                          ? 'bg-white/10 text-white font-semibold shadow-sm'
                          : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      {limit}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ──── POSITION TAB ──── */}
          {activeTab === 'position' && (
            <div>
              <div className="setting-group-label">Display & Edge Docking</div>

              {/* Stick Position: Left vs Right */}
              <div className="setting-row vertical">
                <div className="setting-info mb-1">
                  <div className="setting-title">Screen Edge Dock</div>
                  <div className="setting-desc">Choose which border of the primary display the shelf docks onto.</div>
                </div>
                <div className="flex items-center p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-1 w-full mt-1">
                  {[
                    { key: 'left', label: 'Left Edge' },
                    { key: 'right', label: 'Right Edge' },
                  ].map((pos) => (
                    <button
                      key={pos.key}
                      onClick={() => {
                        playDialTickSound();
                        updateSettings({ stickPosition: pos.key as any });
                      }}
                      className={`flex-1 py-1.5 text-center text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        (settings.stickPosition || 'left') === pos.key
                          ? 'bg-white/10 text-white font-semibold shadow-sm'
                          : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-divider" />

              {/* Trigger Alignment */}
              <div className="setting-row vertical">
                <div className="setting-info mb-1">
                  <div className="setting-title">Vertical Trigger Alignment</div>
                  <div className="setting-desc">Position the active hover sensor on the screen edge.</div>
                </div>
                <div className="flex items-center p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-1 w-full mt-1">
                  {[
                    { key: 'top', label: 'Top' },
                    { key: 'center', label: 'Center' },
                    { key: 'bottom', label: 'Bottom' },
                  ].map((align) => (
                    <button
                      key={align.key}
                      onClick={() => {
                        playTick();
                        updateSettings({ triggerAlignment: align.key as any });
                      }}
                      className={`flex-1 py-1 text-center text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        (settings.triggerAlignment || 'center') === align.key
                          ? 'bg-white/10 text-white font-semibold shadow-sm'
                          : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      {align.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-divider" />

              {/* Vertical Offset Slider */}
              <div className="setting-row vertical">
                <div className="flex items-center justify-between w-full">
                  <div className="setting-title">Vertical Center Offset</div>
                  <span className="font-mono text-xs text-indigo-400 font-semibold">
                    {Math.round((settings.verticalOffset ?? 0.5) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={settings.verticalOffset ?? 0.5}
                  onChange={(e) => updateSettings({ verticalOffset: parseFloat(e.target.value) })}
                  className="w-full mt-2 accent-indigo-500 cursor-pointer"
                />
              </div>

              <div className="setting-divider" />

              {/* Hot Zone Height Slider */}
              <div className="setting-row vertical">
                <div className="flex items-center justify-between w-full">
                  <div className="setting-title">Sensor Height</div>
                  <span className="font-mono text-xs text-indigo-400 font-semibold">
                    {Math.round((settings.hotZoneHeight ?? 0.4) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="0.8"
                  step="0.05"
                  value={settings.hotZoneHeight ?? 0.4}
                  onChange={(e) => updateSettings({ hotZoneHeight: parseFloat(e.target.value) })}
                  className="w-full mt-2 accent-indigo-500 cursor-pointer"
                />
              </div>

              <div className="setting-divider" />

              {/* Edge Location Hint Beacon */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Edge Location Hint Beacon</div>
                  <div className="setting-desc">Pulse a sleek hairline when cursor touches the edge outside the trigger zone.</div>
                </div>
                <Toggle
                  checked={settings.showEdgeLocationHint ?? true}
                  onChange={(val) => updateSettings({ showEdgeLocationHint: val })}
                />
              </div>
            </div>
          )}

          {/* ──── APPEARANCE TAB ──── */}
          {activeTab === 'appearance' && (
            <div>
              <div className="setting-group-label">Copy Indicator Curve</div>

              {/* Show Copy Indicator */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Morphing Copy Extrusion</div>
                  <div className="setting-desc">Animate a physical OLED curve bulging out from the screen edge upon copy.</div>
                </div>
                <Toggle
                  checked={settings.showCopyIndicator !== false}
                  onChange={(val) => updateSettings({ showCopyIndicator: val })}
                />
              </div>

              <div className="setting-divider" />

              {/* Indicator Style Selector */}
              <div className="setting-row vertical">
                <div className="setting-info mb-1">
                  <div className="setting-title">Curve Center Glyph</div>
                  <div className="setting-desc">Select the icon badge nested inside the morphing curve.</div>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full mt-1.5">
                  {[
                    { id: 'logo', label: 'Pulse Wave' },
                    { id: 'check', label: 'Checkmark' },
                    { id: 'copy', label: 'Dual Square' },
                    { id: 'sparkle', label: 'Sparkle' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => {
                        playDialTickSound();
                        updateSettings({ copyIndicatorStyle: st.id as any });
                      }}
                      className={`py-2 px-3 text-center text-xs font-medium rounded-xl border transition-all cursor-pointer ${
                        (settings.copyIndicatorStyle || 'logo') === st.id
                          ? 'bg-white/10 border-white/30 text-white font-semibold shadow-md'
                          : 'bg-white/[0.02] border-white/[0.06] text-white/50 hover:text-white/80 hover:bg-white/[0.05]'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    playPop();
                    setIndicatorStyleFlyoutOpen(true);
                  }}
                  className="mt-3 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 text-xs font-medium transition-colors cursor-pointer w-full"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Audition Styles on Screen Edge</span>
                </button>
              </div>

              <div className="setting-divider" />

              <div className="setting-group-label">Audio & Typography</div>

              {/* Sound Effects */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Procedural Web Audio Haptics</div>
                  <div className="setting-desc">Zero-latency synthesized clicks, dial ticks, and pop chimes.</div>
                </div>
                <Toggle
                  checked={settings.soundEffectsEnabled}
                  onChange={(val) => updateSettings({ soundEffectsEnabled: val })}
                />
              </div>

              <div className="setting-divider" />

              {/* Font Size Scale */}
              <div className="setting-row vertical">
                <div className="setting-info mb-1">
                  <div className="setting-title">Shelf Scale</div>
                  <div className="setting-desc">Adjust UI density and text sizing.</div>
                </div>
                <div className="flex items-center p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-1 w-full mt-1">
                  {[
                    { scale: 0.9, label: 'Compact' },
                    { scale: 1.0, label: 'Default' },
                    { scale: 1.1, label: 'Spacious' },
                  ].map((s) => (
                    <button
                      key={s.scale}
                      onClick={() => {
                        playTick();
                        updateSettings({ fontSizeScale: s.scale });
                      }}
                      className={`flex-1 py-1 text-center text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        (settings.fontSizeScale || 1.0) === s.scale
                          ? 'bg-white/10 text-white font-semibold shadow-sm'
                          : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ──── TRANSFER / NETWORK TAB ──── */}
          {activeTab === 'transfer' && (
            <div>
              <div className="setting-group-label">Device & Storage</div>

              {/* Device Alias */}
              <div className="setting-row vertical">
                <div className="setting-info">
                  <div className="setting-title">Device Name (Alias)</div>
                  <div className="setting-desc">How this PC appears on your phone's LocalSend radar.</div>
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

              {/* Downloads Directory */}
              <div className="setting-row vertical">
                <div className="setting-info">
                  <div className="setting-title">Save Directory</div>
                  <div className="setting-desc">Where incoming beamed files are saved automatically.</div>
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

              {/* Windows Explorer Context Menu */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Windows Explorer Context Menu</div>
                  <div className="setting-desc">Add "Send with SendKeep" to Explorer right-click and Send to menus.</div>
                </div>
                <Toggle
                  checked={Boolean(settings.contextMenuEnabled)}
                  onChange={(val) => updateSettings({ contextMenuEnabled: val })}
                />
              </div>

              <div className="setting-divider" />

              {/* Auto-Accept Trusted */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Auto-Accept Trusted Devices</div>
                  <div className="setting-desc">Instantly receive files from paired phones with zero confirmation clicks.</div>
                </div>
                <Toggle
                  checked={settings.autoAcceptTrusted}
                  onChange={(val) => updateSettings({ autoAcceptTrusted: val })}
                />
              </div>

              <div className="setting-divider" />

              {/* Collision Strategy */}
              <div className="setting-row vertical">
                <div className="setting-info mb-1">
                  <div className="setting-title">Duplicate Filename Strategy</div>
                  <div className="setting-desc">Resolution method when a file with identical name already exists.</div>
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

              <div className="setting-divider" />

              {/* Security PIN */}
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Require Transfer PIN</div>
                  <div className="setting-desc">Require senders to enter secret PIN before transfers are accepted.</div>
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
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-title">4-Digit PIN</div>
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
              )}

              <div className="setting-divider" />

              {/* Active Network Adapters */}
              <div className="setting-group-label">Active Network Adapters (Port 53317)</div>
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
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
