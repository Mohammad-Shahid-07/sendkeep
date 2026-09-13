import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, X, Wifi, AlertCircle, CheckCircle2, Loader2, Network } from 'lucide-react';
import { useStore, TrustedDevice } from '../store/appStore';
import { invoke } from '@tauri-apps/api/core';
import { playPop, playTick } from '../lib/soundEffects';

interface PairDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PairDeviceModal: React.FC<PairDeviceModalProps> = ({ isOpen, onClose }) => {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('53317');
  const [localIp, setLocalIp] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'probing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [pairedDevice, setPairedDevice] = useState<TrustedDevice | null>(null);

  const { pairDeviceByIp } = useStore();

  useEffect(() => {
    if (isOpen) {
      invoke('set_interactive', { interactive: true });
      setStatus('idle');
      setErrorMessage('');
      setPairedDevice(null);
      invoke<string>('get_local_ip')
        .then((ip) => setLocalIp(ip))
        .catch(() => setLocalIp(null));

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePair = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanIp = ip.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!cleanIp) {
      setErrorMessage('Please enter a valid IP address');
      setStatus('error');
      return;
    }

    const portNum = parseInt(port, 10) || 53317;
    setStatus('probing');
    setErrorMessage('');
    playTick();

    try {
      const result = await pairDeviceByIp(cleanIp, portNum);
      if (result) {
        setPairedDevice(result);
        setStatus('success');
        playPop();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setStatus('error');
        setErrorMessage(
          `Unable to reach ${cleanIp}:${portNum}. Ensure SendKeep or LocalSend is open on your phone and on the same Wi-Fi.`
        );
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage('Failed to connect: ' + String(err));
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none pointer-events-auto">
        {/* Backdrop click to close */}
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative w-full max-w-[370px] bg-[#111219] border border-white/10 rounded-2xl shadow-2xl p-5 overflow-hidden z-10 flex flex-col gap-4 text-white"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-white">Pair Mobile Device</h3>
                <p className="text-[11px] text-white/40">Connect phone via local Wi-Fi</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* PC Local Subnet Info */}
          {localIp && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs">
              <div className="flex items-center gap-2 text-white/60">
                <Network className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="text-[11px]">This PC's Local IP:</span>
              </div>
              <span className="font-mono text-[11px] text-indigo-300 font-medium">
                {localIp}
              </span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handlePair} className="flex flex-col gap-3">
            <div>
              <label className="block text-[11px] font-medium text-white/60 mb-1.5">
                Phone IP Address
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Wifi className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/30" />
                  <input
                    type="text"
                    value={ip}
                    onChange={(e) => {
                      setIp(e.target.value);
                      if (status === 'error') setStatus('idle');
                    }}
                    placeholder={localIp ? `${localIp.split('.').slice(0, 3).join('.')}.x` : '192.168.1.5'}
                    autoFocus
                    className="w-full pl-9 pr-3 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/50 focus:bg-white/[0.07] font-mono transition-all"
                  />
                </div>
                <div className="w-20">
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="53317"
                    title="Port (default: 53317)"
                    className="w-full px-2.5 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/50 font-mono text-center transition-all"
                  />
                </div>
              </div>
              <p className="text-[10px] text-white/40 mt-1">
                Open SendKeep on your phone to see its IP under Connection settings.
              </p>
            </div>

            {/* Status Feedback Messages */}
            {status === 'probing' && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-indigo-400" />
                <span className="text-[11px]">Probing phone at {ip}...</span>
              </div>
            )}

            {status === 'success' && pairedDevice && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-emerald-300">
                    Paired with {pairedDevice.name}!
                  </div>
                  <div className="text-[10px] text-emerald-400/70 truncate">
                    {pairedDevice.model || 'Device verified'} • Ready to beam files
                  </div>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <span className="text-[11px] leading-tight">{errorMessage}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl text-xs text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!ip.trim() || status === 'probing'}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-black transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                {status === 'probing' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <span>Connect & Pair</span>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
