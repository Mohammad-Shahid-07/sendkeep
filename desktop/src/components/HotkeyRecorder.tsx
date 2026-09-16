import React, { useState, useEffect, useRef, useCallback } from 'react';
import { playToggleSound, playButtonClickSound } from '../lib/soundEffects';
import { RotateCcw, X } from 'lucide-react';

interface HotkeyRecorderProps {
  hotkey?: string;
  value?: string;
  onChange: (nextHotkey: string) => void;
}

/** Formats an accelerator string (e.g. "Alt+Shift+C") into individual display keys. */
function parseKeyBadges(accelerator: string): string[] {
  if (!accelerator) return ['Alt', 'C'];
  return accelerator
    .split('+')
    .map((k) => {
      const trimmed = k.trim();
      if (trimmed === 'CommandOrControl' || trimmed === 'Ctrl') return 'Ctrl';
      if (trimmed === 'Meta' || trimmed === 'Super' || trimmed === 'Command') return 'Win';
      return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed;
    });
}

/** Converts a KeyboardEvent to modifier list + primary key name. */
function eventToAccelerator(e: KeyboardEvent): { accelerator: string; isValid: boolean; partialBadges: string[] } {
  const modifiers: string[] = [];

  if (e.ctrlKey) modifiers.push('Ctrl');
  if (e.altKey) modifiers.push('Alt');
  if (e.shiftKey) modifiers.push('Shift');
  if (e.metaKey) modifiers.push('Super');

  let keyName = '';
  const code = e.code;
  const key = e.key;

  if (/^Key[A-Z]$/i.test(code)) {
    keyName = code.slice(3).toUpperCase();
  } else if (/^Digit[0-9]$/i.test(code)) {
    keyName = code.slice(5);
  } else if (/^F[1-9][0-2]?$/i.test(code)) {
    keyName = code.toUpperCase();
  } else if (code === 'Space') {
    keyName = 'Space';
  } else if (code === 'Tab') {
    keyName = 'Tab';
  } else if (code === 'Backspace') {
    keyName = 'Backspace';
  } else if (code === 'Enter') {
    keyName = 'Enter';
  } else if (code === 'Comma') {
    keyName = ',';
  } else if (code === 'Period') {
    keyName = '.';
  } else if (code === 'Slash') {
    keyName = '/';
  } else if (code === 'Backquote') {
    keyName = '`';
  } else if (code === 'Minus') {
    keyName = '-';
  } else if (code === 'Equal') {
    keyName = '=';
  } else if (key && key.length === 1 && !['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    keyName = key.toUpperCase();
  }

  const isModifierOnly = ['Control', 'Alt', 'Shift', 'Meta'].includes(key);
  const isFKey = /^F[1-9][0-2]?$/i.test(keyName);
  const hasModifier = modifiers.length > 0;

  const allParts = [...modifiers];
  if (keyName && !isModifierOnly) {
    allParts.push(keyName);
  }

  const isValid = (hasModifier && !!keyName && !isModifierOnly) || isFKey;

  return {
    accelerator: allParts.join('+'),
    isValid,
    partialBadges: allParts.map((p) => (p === 'Super' ? 'Win' : p)),
  };
}

export const HotkeyRecorder: React.FC<HotkeyRecorderProps> = ({ hotkey, value, onChange }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [pressedBadges, setPressedBadges] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeHotkey = hotkey || value || 'Alt+C';
  const displayBadges = parseKeyBadges(activeHotkey);
  const isDefault = activeHotkey === 'Alt+C';

  const stopRecording = useCallback((canceled = false) => {
    setIsRecording(false);
    setPressedBadges([]);
    if (canceled) {
      playButtonClickSound();
    }
  }, []);

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        stopRecording(true);
        return;
      }

      const { accelerator, isValid, partialBadges } = eventToAccelerator(e);
      setPressedBadges(partialBadges);

      if (isValid) {
        playToggleSound(true);
        onChange(accelerator);
        stopRecording(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { partialBadges } = eventToAccelerator(e);
      setPressedBadges(partialBadges);
    };

    const handlePointerDownOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        stopRecording(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('pointerdown', handlePointerDownOutside, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      document.removeEventListener('pointerdown', handlePointerDownOutside, true);
    };
  }, [isRecording, onChange, stopRecording]);

  const handleFieldClick = () => {
    if (!isRecording) {
      playButtonClickSound();
      setIsRecording(true);
      setPressedBadges([]);
    }
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    playButtonClickSound();
    onChange('Alt+C');
  };

  return (
    <div className="hotkey-recorder-wrap" ref={containerRef}>
      <div
        className={`hotkey-field ${isRecording ? 'is-recording' : ''}`}
        onClick={handleFieldClick}
        tabIndex={0}
        role="button"
        title={isRecording ? 'Press your desired shortcut' : 'Click to record a new global shortcut'}
      >
        <div className="hotkey-field-content">
          {isRecording ? (
            <div className="hotkey-recording-indicator">
              <span className="recording-pulse-dot" />
              {pressedBadges.length > 0 ? (
                <div className="hotkey-keycaps-row">
                  {pressedBadges.map((badge, idx) => (
                    <div key={idx} className="hotkey-keycap-item">
                      {idx > 0 && <span className="hotkey-plus-symbol">+</span>}
                      <span className="hotkey-keycap is-active">{badge}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="hotkey-recording-hint">Press key combination...</span>
              )}
            </div>
          ) : (
            <div className="hotkey-keycaps-row">
              {displayBadges.map((badge, idx) => (
                <div key={idx} className="hotkey-keycap-item">
                  {idx > 0 && <span className="hotkey-plus-symbol">+</span>}
                  <span className="hotkey-keycap">{badge}</span>
                </div>
              ))}
            </div>
          )}

          <div className="hotkey-field-actions">
            {isRecording ? (
              <button
                type="button"
                className="hotkey-cancel-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  stopRecording(true);
                }}
                title="Cancel (Esc)"
              >
                <X className="w-3 h-3" />
                <span className="hotkey-esc-text">ESC</span>
              </button>
            ) : (
              <>
                {!isDefault && (
                  <button
                    type="button"
                    className="hotkey-inline-reset-btn"
                    onClick={handleReset}
                    title="Reset to default (Alt+C)"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
                <span className="hotkey-field-edit-badge">Edit</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
