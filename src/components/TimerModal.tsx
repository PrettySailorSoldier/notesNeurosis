import React, { useState, useEffect } from 'react';
import type { Reminder, ReminderSound } from '../types';
import { useSettings } from '../hooks/useSettings';
import styles from './TimerModal.module.css';

interface Props {
  taskId: string;
  taskContent: string;
  existing?: Reminder;
  anchorRect: DOMRect;
  onSet: (intervalMinutes: number, sound: ReminderSound) => void;
  onClear: () => void;
  onClose: () => void;
}

const PRESETS = [5, 10, 15, 20, 30, 45, 60];
const SOUNDS: { value: ReminderSound; label: string }[] = [
  { value: 'chime', label: '🎵 Chime' },
  { value: 'bell', label: '🔔 Bell' },
  { value: 'blip', label: '📡 Blip' },
  { value: 'soft_ding', label: '✨ Soft Ding' },
  { value: 'none', label: '🔇 None' },
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
  const [minutes, setMinutes] = useState<number>(existing?.intervalMinutes ?? 30);
  const [sound, setSound] = useState<ReminderSound>(existing?.sound ?? 'chime');
  const [custom, setCustom] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(existing?.intervalMinutes ?? 30);

  // Position: try to anchor below the task row, clamped to window
  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - 240);
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 240));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    onSet(minutes, sound);
  }

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />
      <div
        className={styles.modal}
        style={{ top, left }}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.headerIcon}>⏱</span>
          <span className={styles.headerTitle}>Set Reminder</span>
          <button className={styles.closeBtn} onClick={onClose} title="Close">×</button>
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

        <div className={styles.soundRow}>
          <span className={styles.label}>Sound:</span>
          <select
            value={sound}
            onChange={e => setSound(e.target.value as ReminderSound)}
            className={styles.soundSelect}
          >
            {SOUNDS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
            {settings.customTones.map(tone => (
              <option key={tone.id} value={tone.id}>🔈 {tone.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.actions}>
          <button className={styles.setBtn} onClick={handleSet}>Set ✓</button>
          {existing && (
            <button className={styles.clearBtn} onClick={onClear}>Clear ✕</button>
          )}
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
};
