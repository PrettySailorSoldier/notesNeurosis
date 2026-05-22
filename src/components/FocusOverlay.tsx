import { useState, useEffect } from 'react';
import type { PlannerBlock } from '../types';
import styles from './FocusOverlay.module.css';

interface Props {
  block: PlannerBlock;
  currentMinutes: number;
  onUpdate: (changes: Partial<PlannerBlock>) => void;
  onClose: () => void;
}

const BLOCK_TYPE_META: Record<string, { emoji: string; label: string }> = {
  deep_focus: { emoji: '🎯', label: 'Deep Focus' },
  float:      { emoji: '🌊', label: 'Float' },
  anchor:     { emoji: '🌅', label: 'Anchor' },
  buffer:     { emoji: '🧘', label: 'Buffer' },
  break:      { emoji: '🍽', label: 'Break' },
  urgent:     { emoji: '🚨', label: 'Urgent' },
  wind_down:  { emoji: '🌙', label: 'Wind Down' },
};

function parseEndMs(endTime: string): number {
  const [h, m] = endTime.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function formatCountdown(seconds: number): string {
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const sign = seconds < 0 ? '+' : '';
  if (h > 0) {
    return `${sign}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const RADIUS = 54;
const CIRCUMFERENCE = 339;

export function FocusOverlay({ block, onUpdate, onClose }: Props) {
  const endMs = parseEndMs(block.endTime);

  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.floor((endMs - Date.now()) / 1000)
  );
  const [isTimeUp, setIsTimeUp] = useState(false);

  useEffect(() => {
    const target = parseEndMs(block.endTime);
    let firedTimeUp = false;

    const id = setInterval(() => {
      const remaining = Math.floor((target - Date.now()) / 1000);
      setSecondsLeft(remaining);
      if (!firedTimeUp && remaining <= 0) {
        firedTimeUp = true;
        setIsTimeUp(true);
        setTimeout(() => setIsTimeUp(false), 3000);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [block.endTime]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const [sh, sm] = block.startTime.split(':').map(Number);
  const [eh, em] = block.endTime.split(':').map(Number);
  const totalDurationSeconds = Math.max(1, ((eh * 60 + em) - (sh * 60 + sm)) * 60);

  const isOvertime = secondsLeft < 0;
  const elapsedSeconds = totalDurationSeconds - Math.max(0, secondsLeft);
  const progress = Math.min(1, Math.max(0, elapsedSeconds / totalDurationSeconds));
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  const ringColor = isOvertime ? 'var(--rose, #c47b8e)' : 'var(--plum)';

  const tasks = block.tasks ?? [];

  const toggleTask = (taskId: string) => {
    const updated = tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t);
    onUpdate({ tasks: updated });
  };

  const overlayClass = [
    styles.overlay,
    isTimeUp ? styles['overlay--timeUp'] : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={overlayClass}>
      <div className={styles.panel}>
        {block.blockType && BLOCK_TYPE_META[block.blockType] && (
          <div className={styles.blockType}>
            {BLOCK_TYPE_META[block.blockType].emoji} {BLOCK_TYPE_META[block.blockType].label}
          </div>
        )}

        <h2 className={styles.label}>{block.label || 'Untitled block'}</h2>

        {block.notes && (
          <p className={styles.notes}>{block.notes}</p>
        )}

        <div className={styles.ringWrap}>
          <svg width="132" height="132" viewBox="0 0 132 132">
            <circle
              cx="66" cy="66" r={RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="8"
            />
            <circle
              cx="66" cy="66" r={RADIUS}
              fill="none"
              stroke={ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
            />
          </svg>
          <div className={[
            styles.countdown,
            isOvertime ? styles['countdown--overtime'] : '',
          ].filter(Boolean).join(' ')}>
            {formatCountdown(secondsLeft)}
          </div>
        </div>

        {tasks.length > 0 && (
          <div className={styles.subtasks}>
            {tasks.map(task => (
              <div
                key={task.id}
                className={styles.subtaskRow}
                onClick={() => toggleTask(task.id)}
              >
                <button
                  className={[
                    styles.subtaskCheck,
                    task.completed ? styles['subtaskCheck--done'] : '',
                  ].filter(Boolean).join(' ')}
                  onClick={e => { e.stopPropagation(); toggleTask(task.id); }}
                >
                  {task.completed ? '✓' : ''}
                </button>
                <span className={[
                  styles.subtaskText,
                  task.completed ? styles['subtaskText--done'] : '',
                ].filter(Boolean).join(' ')}>
                  {task.content}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <button
            className={styles.btnDone}
            onClick={() => { onUpdate({ completed: true }); onClose(); }}
          >✓ Done</button>
          <button className={styles.btnPause} onClick={onClose}>Pause</button>
          <button className={styles.btnClose} onClick={onClose}>×</button>
        </div>
      </div>
    </div>
  );
}
