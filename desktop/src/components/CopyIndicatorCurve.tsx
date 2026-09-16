import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listen } from '@tauri-apps/api/event';
import { useStore } from '../store/appStore';
import { playDialTickSound } from '../lib/soundEffects';

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const ENTER_MS = 0.3;
const ICON_FILTER = 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45))';

export function TickIndicatorIcon({
  fillColor = '#ffffff',
  size = 32,
}: {
  fillColor?: string;
  size?: number;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: ICON_FILTER,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <motion.path
          d="M 5.0 12.5 L 9.5 17.0 L 22.8 2.8"
          stroke={fillColor}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
        />
      </svg>
    </div>
  );
}

export function CopyIndicatorIcon({
  fillColor = '#ffffff',
  size = 32,
}: {
  fillColor?: string;
  size?: number;
}) {
  const maskId = 'sendkeep-copy-mask';

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: ICON_FILTER,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="24" height="24" fill="#ffffff" />
            <rect x="6.8" y="0.8" width="16.4" height="16.4" rx="5.8" fill="#000000" />
          </mask>
        </defs>
        <motion.rect
          x="2.5"
          y="8.5"
          width="13"
          height="13"
          rx="4.2"
          fill={fillColor}
          mask={`url(#${maskId})`}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
        />
        <motion.rect
          x="8.5"
          y="2.5"
          width="13"
          height="13"
          rx="4.2"
          fill={fillColor}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.28, ease: EASE_OUT, delay: 0.04 }}
        />
      </svg>
    </div>
  );
}

export function SparkleIndicatorIcon({
  fillColor = '#ffffff',
  size = 32,
}: {
  fillColor?: string;
  size?: number;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: ICON_FILTER,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <motion.path
          d="M 9.5 1.5 C 9.5 5.8 5.8 9.5 1.5 9.5 C 5.8 9.5 9.5 13.2 9.5 17.5 C 9.5 13.2 13.2 9.5 17.5 9.5 C 13.2 9.5 9.5 5.8 9.5 1.5 Z"
          fill={fillColor}
          initial={{ scale: 0.86, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
        />
        <motion.path
          d="M 18.5 12.5 C 18.5 15.2 16.2 17.5 13.5 17.5 C 16.2 17.5 18.5 19.8 18.5 22.5 C 18.5 19.8 20.8 17.5 23.5 17.5 C 20.8 17.5 18.5 15.2 18.5 12.5 Z"
          fill={fillColor}
          initial={{ scale: 0.86, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.28, ease: EASE_OUT, delay: 0.05 }}
        />
      </svg>
    </div>
  );
}

export function LiquidLogoIcon({
  size = 32,
  fillColor = '#ffffff',
}: {
  size?: number;
  fillColor?: string;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: ICON_FILTER,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <motion.circle
          cx="16"
          cy="16"
          r="10"
          stroke={fillColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="16 8"
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />
        <motion.circle
          cx="16"
          cy="16"
          r="4.5"
          fill={fillColor}
          initial={{ scale: 0.8 }}
          animate={{ scale: [0.8, 1.15, 0.8] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </svg>
    </div>
  );
}

export const CopyIndicatorCurve: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [flareKey, setFlareKey] = useState(0);
  const isOpen = useStore((s) => s.isOpen);
  const settings = useStore((s) => s.settings);

  useEffect(() => {
    // Listen for clipboard captures from the backend
    const unlistenPromise = listen('sendkeep:clipboard-item', () => {
      if (settings.showCopyIndicator !== false && !useStore.getState().isOpen) {
        setFlareKey((k) => k + 1);
        setVisible(true);
        playDialTickSound();
        const timer = setTimeout(() => {
          setVisible(false);
        }, 1400);
        return () => clearTimeout(timer);
      }
    });

    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [settings.showCopyIndicator]);

  if (isOpen || settings.showCopyIndicator === false) return null;

  const isRight = settings.stickPosition === 'right';
  const indicatorStyle = settings.copyIndicatorStyle || 'logo';

  const screenH = typeof window !== 'undefined' ? window.innerHeight : 864;
  const H = Math.round(screenH * (settings.hotZoneHeight || 0.4));
  const bulge = 48;
  const boxW = 75;
  const hw = settings.hotZoneWidth || 3;

  const curvePathLeft = `M 0,0 L ${hw},0 C ${hw},${H * 0.22} ${bulge},${H * 0.28} ${bulge},${H / 2} C ${bulge},${H * 0.72} ${hw},${H * 0.78} ${hw},${H} L 0,${H} Z`;
  const flatPathLeft = `M 0,0 L ${hw},0 C ${hw},${H * 0.22} ${hw},${H * 0.28} ${hw},${H / 2} C ${hw},${H * 0.72} ${hw},${H * 0.78} ${hw},${H} L 0,${H} Z`;

  const curvePathRight = `M ${boxW},0 L ${boxW - hw},0 C ${boxW - hw},${H * 0.22} ${boxW - bulge},${H * 0.28} ${boxW - bulge},${H / 2} C ${boxW - bulge},${H * 0.72} ${boxW - hw},${H * 0.78} ${boxW - hw},${H} L ${boxW},${H} Z`;
  const flatPathRight = `M ${boxW},0 L ${boxW - hw},0 C ${boxW - hw},${H * 0.22} ${boxW - hw},${H * 0.28} ${boxW - hw},${H / 2} C ${boxW - hw},${H * 0.72} ${boxW - hw},${H * 0.78} ${boxW - hw},${H} L ${boxW},${H} Z`;

  const activePath = isRight ? curvePathRight : curvePathLeft;
  const flatPath = isRight ? flatPathRight : flatPathLeft;

  const vOffset = settings.verticalOffset ?? 0.5;
  const topOffset = `${Math.round(screenH * vOffset)}px`;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`copy-flare-${flareKey}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: ENTER_MS, ease: EASE_OUT }}
          style={{
            position: 'fixed',
            top: topOffset,
            transform: 'translateY(-50%)',
            [isRight ? 'right' : 'left']: 0,
            width: boxW,
            height: H,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          {/* Morphing Cubic Bezier SVG Curve */}
          <svg
            width={boxW}
            height={H}
            viewBox={`0 0 ${boxW} ${H}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ overflow: 'visible', filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.6))' }}
          >
            <motion.path
              d={activePath}
              fill="#0d0e15"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="1"
              initial={{ d: flatPath }}
              animate={{ d: activePath }}
              exit={{ d: flatPath }}
              transition={{ duration: ENTER_MS, ease: EASE_OUT }}
            />
          </svg>

          {/* Indicator Icon Centered within the Bulge */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ duration: ENTER_MS, ease: EASE_OUT, delay: 0.04 }}
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              [isRight ? 'right' : 'left']: 6,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            {indicatorStyle === 'check' ? (
              <TickIndicatorIcon fillColor="#ffffff" />
            ) : indicatorStyle === 'copy' ? (
              <CopyIndicatorIcon fillColor="#ffffff" />
            ) : indicatorStyle === 'sparkle' ? (
              <SparkleIndicatorIcon fillColor="#ffffff" />
            ) : (
              <LiquidLogoIcon fillColor="#ffffff" />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
