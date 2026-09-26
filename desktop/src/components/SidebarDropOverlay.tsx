import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Smartphone,
  Tablet,
  Laptop,
  Monitor,
} from 'lucide-react';
import { useStore, TrustedDevice, SendKeepItem } from '../store/appStore';
import { playCopy, playBeam, playPop } from '../lib/soundEffects';

interface SidebarDropOverlayProps {
  onClose: () => void;
  activeZone?: string | null;
  setActiveZone?: (zone: string | null) => void;
}

export const SidebarDropOverlay: React.FC<SidebarDropOverlayProps> = ({
  onClose,
  activeZone: externalActiveZone,
  setActiveZone: externalSetActiveZone,
}) => {
  const {
    trustedDevices,
    connectedDevice,
    discoveredDevices,
    addItem,
    beamItemToDevice,
    activeDraggingId,
    setActiveDraggingId,
    items,
    setPairModalOpen,
    activeSource,
  } = useStore();

  const [localActiveZone, setLocalActiveZone] = useState<string | null>(null);
  const activeZone = externalActiveZone !== undefined ? externalActiveZone : localActiveZone;
  const setActiveZone = externalSetActiveZone || setLocalActiveZone;

  // Compile list of available devices (trusted + connected + discovered, strictly deduped)
  const deviceList: TrustedDevice[] = React.useMemo(() => {
    const list: TrustedDevice[] = [];
    const seenIds = new Set<string>();
    const seenIps = new Set<string>();
    const seenFingerprints = new Set<string>();
    const seenNames = new Set<string>();

    const isDuplicate = (dev: { id?: string; ip?: string; fingerprint?: string; name?: string }) => {
      const normName = (dev.name || '').trim().toLowerCase();
      if (dev.id && seenIds.has(dev.id)) return true;
      if (dev.ip && seenIps.has(dev.ip)) return true;
      if (dev.fingerprint && seenFingerprints.has(dev.fingerprint)) return true;
      if (normName && seenNames.has(normName)) return true;
      return false;
    };

    const markSeen = (dev: { id?: string; ip?: string; fingerprint?: string; name?: string }) => {
      const normName = (dev.name || '').trim().toLowerCase();
      if (dev.id) seenIds.add(dev.id);
      if (dev.ip) seenIps.add(dev.ip);
      if (dev.fingerprint) seenFingerprints.add(dev.fingerprint);
      if (normName) seenNames.add(normName);
    };

    // 1. Add all online trusted devices
    for (const dev of trustedDevices) {
      if (dev.status !== 'online') continue;
      if (!isDuplicate(dev)) {
        markSeen(dev);
        list.push(dev);
      }
    }

    // 2. Add connectedDevice if online and not already in list
    if (connectedDevice && connectedDevice.status === 'online') {
      if (!isDuplicate(connectedDevice)) {
        markSeen(connectedDevice);
        list.push(connectedDevice);
      }
    }

    // 3. Only include discovered nearby devices if NOT already in list
    for (const disc of discoveredDevices) {
      if (disc.status === 'offline') continue;
      if (!disc.ip) continue;
      if (!isDuplicate(disc)) {
        markSeen(disc);
        list.push({
          id: disc.ip,
          name: disc.name || disc.ip,
          ip: disc.ip,
          port: disc.port || 53317,
          model: disc.model,
          deviceType: disc.deviceType,
          fingerprint: disc.fingerprint,
          status: 'online',
        });
      }
    }

    return list;
  }, [trustedDevices, connectedDevice, discoveredDevices]);

  // Helper to determine appropriate device icon
  const getDeviceIcon = (deviceType?: string) => {
    const dt = (deviceType || '').toLowerCase();
    if (dt.includes('tablet') || dt.includes('ipad')) {
      return <Tablet className="w-6 h-6 text-emerald-400" />;
    }
    if (dt.includes('laptop') || dt.includes('macbook')) {
      return <Laptop className="w-6 h-6 text-emerald-400" />;
    }
    if (dt.includes('desktop') || dt.includes('pc')) {
      return <Monitor className="w-6 h-6 text-emerald-400" />;
    }
    return <Smartphone className="w-6 h-6 text-emerald-400" />;
  };

  // 1. Process Drop onto Clipboard Zone
  const handleDropToClipboard = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveZone(null);
    onClose();

    // Check if dragging an internal item from the shelf
    if (activeDraggingId) {
      const draggedItem = items.find((i) => i.id === activeDraggingId);
      if (draggedItem) {
        playCopy();
        if (draggedItem.content) {
          try {
            await navigator.clipboard.writeText(draggedItem.content);
          } catch {}
        } else if (draggedItem.path) {
          try {
            await navigator.clipboard.writeText(draggedItem.path);
          } catch {}
        }
      }
      setActiveDraggingId(null);
      return;
    }

    const files = e.dataTransfer.files;

    // A. Text / Link Drop
    if (!files || files.length === 0) {
      const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
      if (text) {
        playCopy();
        try {
          await navigator.clipboard.writeText(text);
        } catch {}

        const isLink = text.startsWith('http://') || text.startsWith('https://');
        const clipItem: SendKeepItem = {
          id: 'drop-clip-' + Date.now(),
          name: isLink ? 'Web Link' : 'Dropped Note',
          path: '',
          size: text.length,
          fileType: 'text/plain',
          sender: 'Windows Clipboard',
          source: 'clipboard',
          timestamp: Date.now(),
          content: text,
        };
        addItem(clipItem);
      }
      return;
    }

    // B. File Drop
    playCopy();

    if (files.length > 1) {
      const subItems: SendKeepItem[] = [];
      let totalSize = 0;
      const paths: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as any).path || '';
        if (filePath) paths.push(filePath);
        totalSize += file.size;
        subItems.push({
          id: 'sub-drop-' + Date.now() + '-' + i,
          name: file.name,
          path: filePath,
          size: file.size,
          fileType: file.type || 'application/octet-stream',
          sender: 'Windows Clipboard',
          source: 'clipboard',
          timestamp: Date.now(),
        });
      }

      if (paths.length > 0) {
        try {
          await navigator.clipboard.writeText(paths.join('\n'));
        } catch {}
      }

      const bundleItem: SendKeepItem = {
        id: 'stack-drop-' + Date.now(),
        name: `Collection (${files.length} files)`,
        path: (files[0] as any).path || '',
        size: totalSize,
        fileType: 'bundle/files',
        sender: 'Windows Clipboard',
        source: 'clipboard',
        timestamp: Date.now(),
        isStack: true,
        isExpanded: false,
        bundleItems: subItems,
      };
      addItem(bundleItem);
    } else {
      const file = files[0];
      const filePath = (file as any).path || '';

      let textContent: string | undefined = undefined;
      if ((file.name.toLowerCase().endsWith('.txt') || file.type.includes('text')) && file.size < 64 * 1024) {
        try {
          textContent = await file.text();
        } catch {}
      }

      if (textContent) {
        try {
          await navigator.clipboard.writeText(textContent);
        } catch {}
      } else if (filePath) {
        try {
          await navigator.clipboard.writeText(filePath);
        } catch {}
      }

      const singleItem: SendKeepItem = {
        id: 'drop-' + Date.now(),
        name: file.name,
        path: filePath,
        size: file.size,
        fileType: file.type || 'application/octet-stream',
        sender: 'Windows Clipboard',
        source: 'clipboard',
        timestamp: Date.now(),
        content: textContent,
      };
      addItem(singleItem);
    }
  };

  // 2. Process Drop onto Specific Device Zone
  const handleDropToDevice = async (e: React.DragEvent, targetDevice?: TrustedDevice) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveZone(null);
    onClose();

    // If no device is available at all, prompt user to pair
    if (!targetDevice) {
      if (deviceList.length === 0) {
        playPop();
        setPairModalOpen(true);
        return;
      }
      targetDevice = deviceList[0];
    }

    // Check if dragging an internal item from shelf
    if (activeDraggingId) {
      const draggedItem = items.find((i) => i.id === activeDraggingId);
      if (draggedItem) {
        playBeam();
        beamItemToDevice(draggedItem, undefined, targetDevice).catch((err) => {
          console.warn('Failed beaming dragged shelf item:', err);
        });
      }
      setActiveDraggingId(null);
      return;
    }

    const files = e.dataTransfer.files;

    // A. Text / Link Drop to Device
    if (!files || files.length === 0) {
      const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
      if (text) {
        playBeam();
        const isLink = text.startsWith('http://') || text.startsWith('https://');
        const clipItem: SendKeepItem = {
          id: 'drop-beam-text-' + Date.now(),
          name: isLink ? 'Web Link' : 'Sent Note',
          path: '',
          size: text.length,
          fileType: 'text/plain',
          sender: 'You',
          source: 'device',
          timestamp: Date.now(),
          content: text,
        };
        addItem(clipItem);
        beamItemToDevice(clipItem, undefined, targetDevice).catch((err) => {
          console.warn('Failed beaming text:', err);
        });
      }
      return;
    }

    // B. File Drop to Device
    playBeam();

    if (files.length > 1) {
      const subItems: SendKeepItem[] = [];
      let totalSize = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as any).path || '';
        totalSize += file.size;
        subItems.push({
          id: 'sub-beam-' + Date.now() + '-' + i,
          name: file.name,
          path: filePath,
          size: file.size,
          fileType: file.type || 'application/octet-stream',
          sender: 'You',
          source: 'device',
          timestamp: Date.now(),
        });
      }

      const bundleItem: SendKeepItem = {
        id: 'stack-beam-' + Date.now(),
        name: `Collection (${files.length} files)`,
        path: (files[0] as any).path || '',
        size: totalSize,
        fileType: 'bundle/files',
        sender: 'You',
        source: 'device',
        timestamp: Date.now(),
        isStack: true,
        isExpanded: false,
        bundleItems: subItems,
      };

      addItem(bundleItem);
      beamItemToDevice(bundleItem, undefined, targetDevice).catch((err) => {
        console.warn('Failed beaming bundle:', err);
      });
    } else {
      const file = files[0];
      const filePath = (file as any).path || '';

      let textContent: string | undefined = undefined;
      if ((file.name.toLowerCase().endsWith('.txt') || file.type.includes('text')) && file.size < 64 * 1024) {
        try {
          textContent = await file.text();
        } catch {}
      }

      const singleItem: SendKeepItem = {
        id: 'beam-file-' + Date.now(),
        name: file.name,
        path: filePath,
        size: file.size,
        fileType: file.type || 'application/octet-stream',
        sender: 'You',
        source: 'device',
        timestamp: Date.now(),
        content: textContent,
      };

      addItem(singleItem);
      beamItemToDevice(singleItem, undefined, targetDevice).catch((err) => {
        console.warn('Failed beaming file:', err);
      });
    }
  };

  // Fallback drop if dropped on the background margin between zones
  const handleFallbackDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeZone === 'clipboard') {
      handleDropToClipboard(e);
    } else if (activeZone && activeZone.startsWith('device-')) {
      const devId = activeZone.replace('device-', '');
      const dev = deviceList.find((d) => d.id === devId) || deviceList[0];
      handleDropToDevice(e, dev);
    } else {
      // Default based on activeSource
      if (activeSource === 'device' && deviceList.length > 0) {
        handleDropToDevice(e, deviceList[0]);
      } else {
        handleDropToClipboard(e);
      }
    }
  };

  const isClipboardActive = activeZone === 'clipboard';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.08, ease: 'linear' }}
      style={{ backgroundColor: '#090a0e' }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={handleFallbackDrop}
      className="absolute inset-0 z-50 flex flex-col p-3 gap-2.5 border border-white/10 select-none pointer-events-auto overflow-hidden"
    >
      {/* Top Header Pill */}
      <div className="flex items-center justify-between px-1 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping opacity-75" />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-blue-400" />
          </div>
          <span className="text-xs font-semibold text-white/90 tracking-tight">
            Drop Target Ready
          </span>
        </div>
        <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">
          Choose Destination
        </span>
      </div>

      {/* Main Drop Zones Container: Strictly overflow-hidden, no scrollbars */}
      <div className="flex-1 flex flex-col gap-2.5 min-h-0 overflow-hidden">
        {/* ================================================================ */}
        {/* ZONE 1: Windows Clipboard ("Copy Thing")                         */}
        {/* ================================================================ */}
        <div
          data-drop-zone="clipboard"
          style={{
            backgroundColor: isClipboardActive ? '#0e223d' : '#12141e',
            borderColor: isClipboardActive ? '#0078D4' : 'rgba(255, 255, 255, 0.15)',
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (activeZone !== 'clipboard') setActiveZone('clipboard');
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setActiveZone('clipboard');
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              if (activeZone === 'clipboard') setActiveZone(null);
            }
          }}
          onDrop={handleDropToClipboard}
          className={`relative flex-1 h-full min-h-0 rounded-2xl flex flex-col items-center justify-center p-3.5 transition-colors duration-75 cursor-pointer overflow-hidden border-2 ${
            isClipboardActive ? 'border-solid' : 'border-dashed'
          }`}
        >
          {/* Top-Right Badge */}
          <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-blue-500/20 border border-blue-400/30 text-[9.5px] font-medium text-blue-300 pointer-events-none">
            Ctrl + V Ready
          </div>

          <div className="flex flex-col items-center gap-2 text-center pointer-events-none">
            {/* Windows 11 Fluent Icon */}
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-75 ${
                isClipboardActive
                  ? 'bg-blue-500/30 scale-105'
                  : 'bg-white/[0.06] border border-white/10'
              }`}
            >
              <svg className="w-5 h-5" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="6.2" height="6.2" rx="1" fill="#0078D4" />
                <rect x="8.8" y="1" width="6.2" height="6.2" rx="1" fill="#0078D4" />
                <rect x="1" y="8.8" width="6.2" height="6.2" rx="1" fill="#0078D4" />
                <rect x="8.8" y="8.8" width="6.2" height="6.2" rx="1" fill="#0078D4" />
              </svg>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <span className="text-sm font-semibold text-white tracking-tight">
                {isClipboardActive ? 'Release to Copy!' : 'Copy to Clipboard'}
              </span>
              <span className="text-[11px] text-white/50 max-w-[220px]">
                {isClipboardActive
                  ? 'Will stage on shelf & copy immediately to Windows clipboard'
                  : 'Drop here to save to shelf & copy to clipboard'}
              </span>
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* ZONE 2+: Connected Device Drop Zone(s)                           */}
        {/* If multiple devices exist, each gets its own distinct drop zone   */}
        {/* ================================================================ */}
        {deviceList.length > 0 ? (
          deviceList.map((dev) => {
            const zoneKey = `device-${dev.id}`;
            const isDeviceActive = activeZone === zoneKey;

            return (
              <div
                key={`${dev.id || dev.ip}-${dev.name}`}
                data-drop-zone={zoneKey}
                style={{
                  backgroundColor: isDeviceActive ? '#0c2b20' : '#12141e',
                  borderColor: isDeviceActive ? '#10b981' : 'rgba(255, 255, 255, 0.15)',
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  if (activeZone !== zoneKey) setActiveZone(zoneKey);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setActiveZone(zoneKey);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (activeZone === zoneKey) setActiveZone(null);
                  }
                }}
                onDrop={(e) => handleDropToDevice(e, dev)}
                className={`relative flex-1 h-full min-h-0 rounded-2xl flex flex-col items-center justify-center p-3.5 transition-colors duration-75 cursor-pointer overflow-hidden border-2 ${
                  isDeviceActive ? 'border-solid' : 'border-dashed'
                }`}
              >
                {/* Top-Right Status Badge */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-[9.5px] font-medium text-emerald-300 pointer-events-none">
                  <span className={`w-1.5 h-1.5 rounded-full ${dev.status === 'offline' ? 'bg-white/40' : 'bg-emerald-400 animate-pulse'}`} />
                  <span>{dev.status === 'offline' ? 'Offline' : 'Online'}</span>
                </div>

                <div className="flex flex-col items-center gap-2 text-center pointer-events-none">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-75 ${
                      isDeviceActive
                        ? 'bg-emerald-500/30 scale-105'
                        : 'bg-white/[0.06] border border-white/10'
                    }`}
                  >
                    {getDeviceIcon(dev.deviceType)}
                  </div>

                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-sm font-semibold text-white tracking-tight">
                      {isDeviceActive ? `Release to Beam to ${dev.name}!` : `Send to ${dev.name}`}
                    </span>
                    <span className="text-[11px] text-white/50 max-w-[220px]">
                      {isDeviceActive
                        ? `Direct encrypted Wi-Fi transfer to ${dev.model || dev.name}`
                        : `Drop here to beam directly over local Wi-Fi`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          /* Fallback when no device is paired or online */
          <div
            data-drop-zone="device-none"
            style={{
              backgroundColor: activeZone === 'device-none' ? '#0c2b20' : '#12141e',
              borderColor: activeZone === 'device-none' ? '#10b981' : 'rgba(255, 255, 255, 0.15)',
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              if (activeZone !== 'device-none') setActiveZone('device-none');
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setActiveZone('device-none');
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                if (activeZone === 'device-none') setActiveZone(null);
              }
            }}
            onDrop={(e) => handleDropToDevice(e, undefined)}
            className={`relative flex-1 h-full min-h-0 rounded-2xl flex flex-col items-center justify-center p-3.5 transition-colors duration-75 cursor-pointer overflow-hidden border-2 ${
              activeZone === 'device-none' ? 'border-solid' : 'border-dashed'
            }`}
          >
            <div className="flex flex-col items-center gap-2 text-center pointer-events-none">
              <div className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/40">
                <Smartphone className="w-5 h-5" />
              </div>

              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-semibold text-white/90 tracking-tight">
                  Send to Connected Device
                </span>
                <span className="text-[11px] text-white/40 max-w-[220px]">
                  No device connected · Drop to stage or pair a phone
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Dismiss Hint */}
      <div className="flex items-center justify-center py-0.5 text-[9.5px] text-white/35 font-mono shrink-0">
        Drag outside to cancel
      </div>
    </motion.div>
  );
};
