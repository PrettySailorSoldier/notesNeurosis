import { useState, useEffect, useRef, useCallback } from 'react';
import type { IntervalTask } from '../types';
import styles from './IntervalView.module.css';

interface Props {
  tasks: IntervalTask[];
  onChange: (tasks: IntervalTask[]) => void;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatTime(seconds: number) {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function IntervalView({ tasks, onChange }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const [editingDuration, setEditingDuration] = useState<string | null>(null); // task id being edited
  const intervalRef = useRef<number | null>(null);

  // Sync secondsLeft when active task changes while not running
  useEffect(() => {
    if (!running && activeIdx !== null && tasks[activeIdx]) {
      setSecondsLeft(tasks[activeIdx].durationSeconds);
    }
  }, [activeIdx, tasks, running]);

  const clearTimer = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const advanceToNext = useCallback((currentIdx: number, currentTasks: IntervalTask[]) => {
    // Mark current as completed
    const updated = currentTasks.map((t, i) =>
      i === currentIdx ? { ...t, completed: true } : t
    );
    onChange(updated);

    // Find next incomplete
    const nextIdx = updated.findIndex((t, i) => i > currentIdx && !t.completed);
    if (nextIdx !== -1) {
      setActiveIdx(nextIdx);
      setSecondsLeft(updated[nextIdx].durationSeconds);
      // timer keeps running — effect will restart it
    } else {
      setRunning(false);
      setActiveIdx(null);
    }
  }, [onChange]);

  useEffect(() => {
    if (!running || activeIdx === null) {
      clearTimer();
      return;
    }
    clearTimer();
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          // Will advance on next render cycle
          setRunning(false); // pause briefly; advanceToNext handles restart
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return clearTimer;
  }, [running, activeIdx]);

  // When timer hits 0 and was running
  useEffect(() => {
    if (!running && secondsLeft === 0 && activeIdx !== null) {
      advanceToNext(activeIdx, tasks);
    }
  }, [running, secondsLeft, activeIdx, tasks, advanceToNext]);

  const handleStart = () => {
    if (tasks.length === 0) return;
    if (activeIdx === null) {
      const firstIdx = tasks.findIndex(t => !t.completed);
      if (firstIdx === -1) return;
      setActiveIdx(firstIdx);
      setSecondsLeft(tasks[firstIdx].durationSeconds);
    }
    setRunning(true);
  };

  const handlePause = () => setRunning(false);

  const handleReset = () => {
    setRunning(false);
    setActiveIdx(null);
    setSecondsLeft(0);
    onChange(tasks.map(t => ({ ...t, completed: false })));
  };

  const handleSkip = () => {
    if (activeIdx === null) return;
    setRunning(false);
    advanceToNext(activeIdx, tasks);
  };

  const addTask = () => {
    const newTask: IntervalTask = {
      id: makeId(),
      label: '',
      durationSeconds: 300, // 5 min default
      completed: false,
    };
    onChange([...tasks, newTask]);
  };

  const updateTask = (id: string, changes: Partial<IntervalTask>) => {
    onChange(tasks.map(t => t.id === id ? { ...t, ...changes } : t));
  };

  const removeTask = (id: string) => {
    const idx = tasks.findIndex(t => t.id === id);
    const next = tasks.filter(t => t.id !== id);
    onChange(next);
    if (activeIdx !== null) {
      if (idx === activeIdx) {
        setRunning(false);
        setActiveIdx(null);
      } else if (idx < activeIdx) {
        setActiveIdx(activeIdx - 1);
      }
    }
  };

  const parseDurationInput = (val: string): number => {
    // Accept MM:SS or plain seconds number
    if (val.includes(':')) {
      const [m, s] = val.split(':').map(n => parseInt(n, 10) || 0);
      return m * 60 + s;
    }
    return parseInt(val, 10) || 0;
  };

  const totalSeconds = tasks.reduce((s, t) => s + t.durationSeconds, 0);
  const completedSeconds = tasks.filter(t => t.completed).reduce((s, t) => s + t.durationSeconds, 0);
  const progressPercent = totalSeconds > 0 ? Math.round((completedSeconds / totalSeconds) * 100) : 0;

  return (
    <div className={styles.container}>
      {/* Timer display */}
      <div className={styles.timerSection}>
        <div className={styles.timerDisplay}>
          <span className={styles.timerDigits}>
            {activeIdx !== null ? formatTime(secondsLeft) : '--:--'}
          </span>
          {activeIdx !== null && tasks[activeIdx] && (
            <span className={styles.timerLabel}>{tasks[activeIdx].label || 'Untitled task'}</span>
          )}
        </div>
        <div className={styles.controls}>
          {!running ? (
            <button className={`${styles.controlBtn} ${styles.startBtn}`} onClick={handleStart}>
              ▶ {activeIdx !== null ? 'Resume' : 'Start'}
            </button>
          ) : (
            <button className={`${styles.controlBtn} ${styles.pauseBtn}`} onClick={handlePause}>
              ⏸ Pause
            </button>
          )}
          <button className={styles.controlBtn} onClick={handleSkip} disabled={activeIdx === null}>
            ⏭ Skip
          </button>
          <button className={`${styles.controlBtn} ${styles.resetBtn}`} onClick={handleReset}>
            ↺ Reset
          </button>
        </div>
        {totalSeconds > 0 && (
          <div className={styles.progressRow}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
            </div>
            <span className={styles.progressLabel}>{progressPercent}% · {formatTime(totalSeconds - completedSeconds)} left</span>
          </div>
        )}
      </div>

      {/* Task list */}
      <div className={styles.taskList}>
        {tasks.length === 0 && (
          <div className={styles.emptyHint}>No tasks yet — add one below to get started.</div>
        )}
        {tasks.map((task, idx) => {
          const isActive = idx === activeIdx;
          return (
            <div
              key={task.id}
              className={`${styles.taskRow} ${task.completed ? styles.completed : ''} ${isActive ? styles.active : ''}`}
              onClick={() => { if (!running) { setActiveIdx(idx); setSecondsLeft(task.durationSeconds); } }}
            >
              <div className={styles.taskOrder}>{idx + 1}</div>
              <input
                className={styles.taskLabel}
                value={task.label}
                placeholder="Task name..."
                onChange={e => updateTask(task.id, { label: e.target.value })}
                onClick={e => e.stopPropagation()}
              />
              {editingDuration === task.id ? (
                <input
                  className={styles.durationInput}
                  defaultValue={formatTime(task.durationSeconds)}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                  onBlur={e => {
                    const secs = parseDurationInput(e.target.value);
                    if (secs > 0) updateTask(task.id, { durationSeconds: secs });
                    setEditingDuration(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                />
              ) : (
                <button
                  className={styles.durationBtn}
                  onClick={e => { e.stopPropagation(); setEditingDuration(task.id); }}
                  title="Click to edit duration"
                >
                  {formatTime(task.durationSeconds)}
                </button>
              )}
              <button
                className={styles.removeBtn}
                onClick={e => { e.stopPropagation(); removeTask(task.id); }}
                title="Remove"
              >×</button>
            </div>
          );
        })}
        <button className={styles.addBtn} onClick={addTask}>+ add task</button>
      </div>
    </div>
  );
}
