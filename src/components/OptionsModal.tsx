import React, { useEffect, useState, useRef } from 'react';
import type { Page } from '../types';
import type { Settings, CustomTone } from '../hooks/useSettings';
import { useAudio } from '../hooks/useAudio';
import styles from './OptionsModal.module.css';

interface Props {
  pages: Page[];
  ringingIds: string[];
  settings: Settings;
  onClose: () => void;
  onStopRinging: (reminderId: string) => void;
  onClearReminder: (taskId: string, pageId: string) => void;
  onAddCustomTone: (tone: CustomTone) => void;
  onRemoveCustomTone: (id: string) => void;
  onSetVolume: (volume: number) => void;
}

export const OptionsModal: React.FC<Props> = ({
  pages,
  ringingIds,
  settings,
  onClose,
  onStopRinging,
  onClearReminder,
  onAddCustomTone,
  onRemoveCustomTone,
  onSetVolume
}) => {
  const { playTone } = useAudio();
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const stopPreviewRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (stopPreviewRef.current) stopPreviewRef.current();
    };
  }, [onClose]);

  const togglePreview = (toneId: string) => {
    if (previewingId === toneId) {
      if (stopPreviewRef.current) stopPreviewRef.current();
      stopPreviewRef.current = null;
      setPreviewingId(null);
    } else {
      if (stopPreviewRef.current) stopPreviewRef.current();
      stopPreviewRef.current = playTone(toneId as any, settings.volume, settings.customTones);
      setPreviewingId(toneId);
    }
  };

  const activeTimers = pages.flatMap(p => 
    p.tasks.filter(t => t.reminder?.active).map(t => ({ page: p, task: t, reminder: t.reminder! }))
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onAddCustomTone({
        id: 'custom_' + Date.now().toString(36),
        name: file.name,
        dataUrl: reader.result as string
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>⚙ Options</div>
          <button className={styles.closeBtn} onClick={onClose} title="Close">×</button>
        </div>

        <div className={styles.content}>
          <div className={styles.sectionTitle}>Active Timers</div>
          {activeTimers.length === 0 ? (
            <div style={{ opacity: 0.5, fontSize: '0.9em' }}>No active timers.</div>
          ) : (
            activeTimers.map(({ page, task, reminder }) => {
              const ringing = ringingIds.includes(reminder.id);
              return (
                <div key={reminder.id} className={styles.timerItem} style={ringing ? { background: 'rgba(220,80,100,0.15)', border: '1px solid rgba(220,80,100,0.3)' } : {}}>
                  <div className={styles.timerInfo}>
                    <div className={styles.timerText}>{task.content || 'Untitled task'}</div>
                    <div className={styles.timerDetails}>
                      [{page.name}] - {reminder.label}
                    </div>
                  </div>
                  <div className={styles.timerActions}>
                    {ringing && (
                      <button className={styles.stopBtn} onClick={() => onStopRinging(reminder.id)}>Stop Alarm</button>
                    )}
                    <button className={styles.clearBtn} onClick={() => onClearReminder(task.id, page.id)}>Clear</button>
                  </div>
                </div>
              );
            })
          )}

          <div className={styles.sectionTitle}>Sounds & Volume</div>
          <div className={styles.volumeRow}>
            <span>Volume: {Math.round(settings.volume * 100)}%</span>
            <input 
              type="range" 
              className={styles.volumeSlider} 
              min="0" max="1" step="0.05" 
              value={settings.volume} 
              onChange={e => onSetVolume(parseFloat(e.target.value))} 
            />
            <button 
              className={styles.clearBtn} 
              onClick={() => togglePreview('chime')}
              style={previewingId === 'chime' ? { color: '#ffa0a0', borderColor: 'rgba(220,80,100,0.5)' } : {}}
            >
              {previewingId === 'chime' ? 'Stop Test' : 'Test Sound'}
            </button>
          </div>

          <div className={styles.sectionTitle}>Custom Tones</div>
          {settings.customTones.map(tone => (
            <div key={tone.id} className={styles.toneItem}>
              <span>{tone.name}</span>
              <div className={styles.toneActions}>
                <button 
                  className={styles.clearBtn} 
                  onClick={() => togglePreview(tone.id)}
                  style={previewingId === tone.id ? { color: '#ffa0a0', borderColor: 'rgba(220,80,100,0.5)' } : {}}
                >
                  {previewingId === tone.id ? 'Stop Preview' : 'Preview'}
                </button>
                <button className={styles.clearBtn} onClick={() => onRemoveCustomTone(tone.id)}>Delete</button>
              </div>
            </div>
          ))}
          <label className={styles.addToneBtn}>
            + Upload Audio File
            <input type="file" accept="audio/*" onChange={handleFileChange} />
          </label>
        </div>
      </div>
    </div>
  );
};
