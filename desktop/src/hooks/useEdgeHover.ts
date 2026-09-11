import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useStore, SendKeepItem } from '../store/appStore';

const TRIGGER_PX = 4;
const DWELL_MS = 60;
const GRACE_MS = 300;
const PANEL_WIDTH = 320;

export function useEdgeHover() {
  const dwellTimer = useRef<number | null>(null);
  const graceTimer = useRef<number | null>(null);
  const isInteractive = useRef(false);

  useEffect(() => {
    // 1. Listen for cursor position from Rust background tracker
    const unlistenCursorPromise = listen<[number, number]>('sendkeep:cursor-pos', (event) => {
      const [x] = event.payload;
      const isOpen = useStore.getState().isOpen;

      if (!isOpen) {
        // Closed state: check if cursor enters the trigger strip
        if (x <= TRIGGER_PX) {
          if (!dwellTimer.current) {
            dwellTimer.current = window.setTimeout(() => {
              useStore.getState().setOpen(true);
              if (!isInteractive.current) {
                invoke('set_interactive', { interactive: true });
                isInteractive.current = true;
              }
              dwellTimer.current = null;
            }, DWELL_MS);
          }
        } else {
          if (dwellTimer.current) {
            clearTimeout(dwellTimer.current);
            dwellTimer.current = null;
          }
        }
      } else {
        // Open state: keep open if inside panel, start close timer if moved away
        if (x > PANEL_WIDTH) {
          if (!graceTimer.current) {
            graceTimer.current = window.setTimeout(() => {
              useStore.getState().setOpen(false);
              if (isInteractive.current) {
                invoke('set_interactive', { interactive: false });
                isInteractive.current = false;
              }
              graceTimer.current = null;
            }, GRACE_MS);
          }
        } else {
          // Inside panel: cancel any pending close
          if (graceTimer.current) {
            clearTimeout(graceTimer.current);
            graceTimer.current = null;
          }
        }
      }
    });

    // 2. Listen for incoming items from Android
    const unlistenItemPromise = listen<SendKeepItem>('sendkeep:item-received', (event) => {
      const item = event.payload;
      console.log('[SendKeep UI] Received item:', item);
      useStore.getState().addItem(item);
      
      // Ensure panel becomes interactive so user can click/drag
      if (!isInteractive.current) {
        invoke('set_interactive', { interactive: true });
        isInteractive.current = true;
      }
    });

    return () => {
      unlistenCursorPromise.then((fn) => fn());
      unlistenItemPromise.then((fn) => fn());
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
      if (graceTimer.current) clearTimeout(graceTimer.current);
    };
  }, []);
}
