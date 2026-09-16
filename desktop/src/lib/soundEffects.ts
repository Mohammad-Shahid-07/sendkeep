// Web Audio API Procedural Haptic Synthesizer Suite
// Provides zero-latency, tactile mechanical audio effects for sliders, toggles, and buttons.
// Zero external audio files required.

import { useStore } from '../store/appStore';

let audioCtx: AudioContext | null = null;

function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return useStore.getState().settings.soundEffectsEnabled !== false;
  } catch {
    return true;
  }
}

function getAudioContext(): AudioContext | null {
  if (!isSoundEnabled()) return null;
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Auto-unlock listener for browser autoplay restrictions
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        if (ctx.state === 'running') {
          window.removeEventListener('pointerdown', unlockAudio, true);
          window.removeEventListener('keydown', unlockAudio, true);
        }
      }).catch(() => {});
    }
  };
  window.addEventListener('pointerdown', unlockAudio, true);
  window.addEventListener('keydown', unlockAudio, true);
}

/**
 * Satisfying mechanical rotary dial tick sound.
 * Emulates a camera dial / Apple Watch Digital Crown detent click.
 */
export function playDialTickSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. High-frequency metallic ratchet sweep (2600Hz -> 700Hz in 10ms)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2600, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.01);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.01);

    // 2. Low-end mechanical detent thud (180Hz -> 60Hz in 12ms)
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();

    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(180, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(60, now + 0.012);

    bodyGain.gain.setValueAtTime(0.12, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(ctx.destination);

    bodyOsc.start(now);
    bodyOsc.stop(now + 0.012);
  } catch {
    // Ignore autoplay restrictions
  }
}

/** Crisp mechanical button click */
export function playButtonClickSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.014);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.015);
  } catch {}
}

/** Toggle switch on/off feedback tone */
export function playToggleSound(on = true): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    if (on) {
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.025);
    } else {
      osc.frequency.setValueAtTime(1100, now);
      osc.frequency.exponentialRampToValueAtTime(500, now + 0.025);
    }

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.03);
  } catch {}
}

/** Card expand / collapse accordion whoosh */
export function playCardExpandSound(expanding = true): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    if (expanding) {
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(480, now + 0.04);
    } else {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.035);
    }

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.045);
  } catch {}
}

/** Crisp mechanical micro-tick for switching tabs */
export function playTick() {
  playButtonClickSound();
}

/** Organic bubble pop for expanding bundles */
export function playPop() {
  playCardExpandSound(true);
}

/** Uplifting frequency sweep when beaming an item to phone */
export function playBeam() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.09);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  } catch {}
}

/** Crisp confirmation chime when copying to clipboard */
export function playCopy() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1174.66, now + 0.04);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  } catch {}
}

/** Dual-stage downward thud for deleting items */
export function playDelete() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.05);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.065);
  } catch {}
}

