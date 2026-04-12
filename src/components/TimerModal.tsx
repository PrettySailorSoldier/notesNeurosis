import React, { useState, useEffect, useRef } from 'react';
import type { Reminder, ReminderSound } from '../types';
import { useSettings } from '../hooks/useSettings';
import { useAudio } from '../hooks/useAudio';
import { useDraggable } from '../hooks/useDraggable';
import styles from './TimerModal.module.css';

interface Props {
  taskId: string;
  taskContent: string;
  existing?: Reminder;
  anchorRect: DOMRect;
  onSet: (intervalMinutes: number, sound: ReminderSound, alarmEnabled: boolean) => void;
  onClear: () => void;
  onClose: () => void;
}

const PRESETS = [5, 10, 15, 20, 30, 45, 60];
const SOUNDS: { value: ReminderSound; label: string }[] = [
  { value: 'chime',    label: '🎵 Chime'     },
  { value: 'bell',     label: '🔔 Bell'      },
  { value: 'blip',     label: '📡 Blip'      },
  { value: 'soft_ding',label: '✨ Soft Ding' },
  { value: 'none',     label: '🔇 None'      },
];

export const TimerModal: React.FC<Props> = ({
  taskId: _taskId,
  taskContent,
  existing,
  anchorRect,
  onSet,
  onClear,
  onClose,
}) => {
  const { settings } = useSettings();
  const { playTone } = useAudio();
  const { dragPos, modalRef, onHandleMouseDown } = useDraggable();
  const [minutes, setMinutes] = useState<number>(existing?.intervalMinutes ?? 30);
  const [sound, setSound] = useState<ReminderSound>(existing?.sound ?? 'chime');
  const [custom, setCustom] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(existing?.intervalMinutes ?? 30);
  const [alarmEnabled, setAlarmEnabled] = useState<boolean>(existing?.alarmEnabled !== false);
  const [previewing, setPreviewing] = useState(false);
  const stopPreviewRef = useRef<(() => void) | null>(null);

  // Position: use drag position if dragged, otherwise anchor below the task row
  const anchorTop = Math.min(anchorRect.bottom + 6, window.innerHeight - 280);
  const anchorLeft = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 240));
  const top = dragPos ? dragPos.y : anchorTop;
  const left = dragPos ? dragPos.x : anchorLeft;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { stopPreview(); onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Stop preview when modal closes
  useEffect(() => {
    return () => { stopPreview(); };
  }, []);

  function stopPreview() {
    if (stopPreviewRef.current) {
      stopPreviewRef.current();
      stopPreviewRef.current = null;
    }
    setPreviewing(false);
  }

  function togglePreview() {
    if (previewing) {
      stopPreview();
    } else {
      const stop = playTone(sound, settings.volume ?? 0.75, settings.customTones);
      stopPreviewRef.current = stop;
      setPreviewing(true);
    }
  }

  // When sound selection changes, stop any in-progress preview
  function handleSoundChange(val: ReminderSound) {
    stopPreview();
    setSound(val);
  }

  function handlePreset(m: number) {
    setMinutes(m);
    setSelectedPreset(m);
    setCustom('');
  }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCustom(e.target.value);
    const parsed = parseInt(e.target.value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setMinutes(parsed);
      setSelectedPreset(null);
    }
  }

  function handleSet() {
    stopPreview();
    onSet(minutes, sound, alarmEnabled);
  }

  function handleClear() {
    stopPreview();
    onClear();
  }

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={() => { stopPreview(); onClose(); }} />
      <div
        ref={modalRef}
        className={styles.modal}
        style={{ top, left }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className={styles.header}
          onMouseDown={onHandleMouseDown}
          style={{ cursor: dragPos ? 'grabbing' : 'grab' }}
        >
          <span className={styles.headerIcon}>⏱</span>
          <span className={styles.headerTitle}>Set Reminder</span>
          <button className={styles.closeBtn} onClick={() => { stopPreview(); onClose(); }} title="Close">×</button>
        </div>

        {taskContent && (
          <div className={styles.taskPreview}>{taskContent.slice(0, 40)}{taskContent.length > 40 ? '…' : ''}</div>
        )}

        <div className={styles.label}>Repeat every</div>
        <div className={styles.presets}>
          {PRESETS.map(m => (
            <button
              key={m}
              className={`${styles.presetBtn} ${selectedPreset === m ? styles.presetActive : ''}`}
              onClick={() => handlePreset(m)}
            >
              {m >= 60 ? `${m / 60}h` : `${m}m`}
            </button>
          ))}
        </div>

        <div className={styles.customRow}>
          <span className={styles.label}>Custom:</span>
          <input
            type="number"
            min={1}
            max={1440}
            placeholder="min"
            value={custom}
            onChange={handleCustomChange}
            className={styles.customInput}
          />
          <span className={styles.unitLabel}>min</span>
        </div>

        {/* Sound row with preview */}
        <div className={styles.soundRow}>
          <span className={styles.label}>Sound:</span>
          <select
            value={sound}
            onChange={e => handleSoundChange(e.target.value as ReminderSound)}
            className={styles.soundSelect}
          >
            {SOUNDS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
            {settings.customTones.map(tone => (
              <option key={tone.id} value={tone.id}>🔈 {tone.name}</option>
            ))}
          </select>
          <button
            className={`${styles.previewBtn} ${previewing ? styles.previewActive : ''}`}
            onClick={togglePreview}
            title={previewing ? 'Stop preview' : 'Preview sound'}
          >
            {previewing ? '■' : '▶'}
          </button>
        </div>

        {/* Enable/Disable toggle (only relevant when editing existing alarm) */}
        {existing && (
          <div className={styles.enableRow}>
            <span className={styles.label}>Alarm:</span>
            <button
              className={`${styles.toggleBtn} ${alarmEnabled ? styles.toggleOn : styles.toggleOff}`}
              onClick={() => setAlarmEnabled(v => !v)}
              title={alarmEnabled ? 'Click to pause alarm' : 'Click to enable alarm'}
            >
              {alarmEnabled ? '● On' : '○ Paused'}
            </button>
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.setBtn} onClick={handleSet}>Set ✓</button>
          {existing && (
            <button className={styles.clearBtn} onClick={handleClear}>Clear ✕</button>
          )}
          <button className={styles.cancelBtn} onClick={() => { stopPreview(); onClose(); }}>Cancel</button>
        </div>
      </div>
    </>
  );
};
