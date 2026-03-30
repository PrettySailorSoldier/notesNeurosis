import { useState, useEffect, useRef, useCallback } from 'react';
import { load } from '@tauri-apps/plugin-store';
import type { IntervalTask, IntervalPhaseType, SavedSequence, ReminderSound } from '../types';
import type { Settings } from '../hooks/useSettings';
import { useAudio } from '../hooks/useAudio';
import styles from './IntervalView.module.css';

interface Props {
  tasks: IntervalTask[];
  onChange: (tasks: IntervalTask[]) => void;
  settings: Settings;
  pageId: string;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatTime(seconds: number) {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const PHASE_ORDER: IntervalPhaseType[] = ['work', 'break', 'transition', 'buffer'];

const PHASE_META: Record<IntervalPhaseType, { emoji: string; label: string }> = {
  work:       { emoji: '🟣', label: 'Work'   },
  break:      { emoji: '🔵', label: 'Break'  },
  transition: { emoji: '🟡', label: 'Trans'  },
  buffer:     { emoji: '⚪', label: 'Buffer' },
};

const DEFAULT_SOUNDS: ReminderSound[] = ['chime', 'bell', 'blip', 'soft_ding', 'none'];
const SOUND_EMOJI: Record<string, string> = {
  chime: '🎵', bell: '🔔', blip: '⚡', soft_ding: '✨', none: '🔇',
};
const SOUND_LABEL: Record<string, string> = {
  chime: 'chime', bell: 'bell', blip: 'blip', soft_ding: 'ding', none: 'mute',
};

// Change 5 — quick-start templates
const QUICK_TEMPLATES: Record<string, Omit<IntervalTask, 'id' | 'completed'>[]> = {
  pomodoro: [
    { label: 'Focus',      durationSeconds: 1500, phaseType: 'work'  },
    { label: 'Break',      durationSeconds: 300,  phaseType: 'break' },
    { label: 'Focus',      durationSeconds: 1500, phaseType: 'work'  },
    { label: 'Break',      durationSeconds: 300,  phaseType: 'break' },
    { label: 'Focus',      durationSeconds: 1500, phaseType: 'work'  },
    { label: 'Long Break', durationSeconds: 900,  phaseType: 'break' },
  ],
  flow: [
    { label: 'Warm Up',   durationSeconds: 300,  phaseType: 'transition' },
    { label: 'Deep Work', durationSeconds: 2700, phaseType: 'work'       },
    { label: 'Rest',      durationSeconds: 600,  phaseType: 'break'      },
  ],
  sprint: [
    { label: 'Sprint', durationSeconds: 900, phaseType: 'work'  },
    { label: 'Sprint', durationSeconds: 900, phaseType: 'work'  },
    { label: 'Sprint', durationSeconds: 900, phaseType: 'work'  },
    { label: 'Rest',   durationSeconds: 300, phaseType: 'break' },
  ],
};

export function IntervalView({ tasks, onChange, settings, pageId }: Props) {
  // ── Core timer state ──────────────────────────────────────────────────────
  const [activeIdx,       setActiveIdx]       = useState<number | null>(null);
  const [secondsLeft,     setSecondsLeft]     = useState(0);
  const [running,         setRunning]         = useState(false);
  const [editingDuration, setEditingDuration] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Change 4 — auto-focus new task row
  const pendingFocusId = useRef<string | null>(null);

  // Change 9 — drag to reorder
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // ── Break gate ────────────────────────────────────────────────────────────
  const [breakGate,          setBreakGate]          = useState(false);
  const [breakGateCountdown, setBreakGateCountdown] = useState(10);
  const breakGateNextIdxRef  = useRef<number | null>(null);
  const breakGateIntervalRef = useRef<number | null>(null);

  // ── Session completion ────────────────────────────────────────────────────
  const [sessionComplete, setSessionComplete] = useState(false);

  // ── Rest mode standalone countdown ───────────────────────────────────────
  const [restSecondsLeft, setRestSecondsLeft] = useState<number | null>(null);
  const restIntervalRef = useRef<number | null>(null);

  // ── Saved sequences ───────────────────────────────────────────────────────
  const [savedSequences,   setSavedSequences]   = useState<SavedSequence[]>([]);
  const [savingSequence,   setSavingSequence]   = useState(false);
  const [saveSequenceName, setSaveSequenceName] = useState('');

  // ── Audio ─────────────────────────────────────────────────────────────────
  const { playTone } = useAudio();
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const playSoundOnce = useCallback((sound: ReminderSound | undefined, fallback: ReminderSound = 'none') => {
    const s = sound ?? fallback;
    if (s === 'none') return;
    const stop = playTone(s, settingsRef.current.volume, settingsRef.current.customTones);
    setTimeout(stop, 2500);
  }, [playTone]);

  // ── Persistence ───────────────────────────────────────────────────────────
  const loadedRef            = useRef(false);
  const sequencesLoadedRef   = useRef(false);
  const restoredFromPersistence = useRef(false);
  const secondsLeftRef       = useRef(secondsLeft);
  useEffect(() => { secondsLeftRef.current = secondsLeft; }, [secondsLeft]);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await load(`interval-${pageId}.json`, { autoSave: false } as any);

        const seqs = await store.get<SavedSequence[]>('sequences');
        if (!cancelled && seqs) setSavedSequences(seqs);
        sequencesLoadedRef.current = true;

        const timerState = await store.get<{
          activeIdx: number | null;
          secondsLeft: number;
          startedAt: number | null;
        }>('timer-state');

        if (!cancelled && timerState && timerState.activeIdx !== null && tasks[timerState.activeIdx]) {
          let remaining = timerState.secondsLeft;
          if (timerState.startedAt !== null) {
            const elapsed = Math.floor((Date.now() - timerState.startedAt) / 1000);
            remaining = Math.max(0, remaining - elapsed);
          }
          restoredFromPersistence.current = true;
          setActiveIdx(timerState.activeIdx);
          if (remaining > 0) setSecondsLeft(remaining);
        }

        if (!cancelled) loadedRef.current = true;
      } catch (e) {
        console.warn('[IntervalView] load error:', e);
        loadedRef.current = true;
        sequencesLoadedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // Persist timer state when activeIdx / running changes, and every 15s while running
  useEffect(() => {
    if (!loadedRef.current) return;
    const doSave = async () => {
      try {
        const store = await load(`interval-${pageId}.json`, { autoSave: false } as any);
        await store.set('timer-state', {
          activeIdx,
          secondsLeft: secondsLeftRef.current,
          startedAt: running ? Date.now() : null,
        });
        await store.save();
      } catch (e) {
        console.warn('[IntervalView] timer state save error:', e);
      }
    };
    doSave();
    if (!running) return;
    const id = window.setInterval(doSave, 15_000);
    return () => clearInterval(id);
  }, [activeIdx, running, pageId]);

  // Persist sequences
  useEffect(() => {
    if (!sequencesLoadedRef.current) return;
    (async () => {
      try {
        const store = await load(`interval-${pageId}.json`, { autoSave: false } as any);
        await store.set('sequences', savedSequences);
        await store.save();
      } catch (e) {
        console.warn('[IntervalView] sequences save error:', e);
      }
    })();
  }, [savedSequences, pageId]);

  // ── Sync secondsLeft when idle (skip if restoring from persistence) ───────
  useEffect(() => {
    if (restoredFromPersistence.current) {
      restoredFromPersistence.current = false;
      return;
    }
    if (!running && activeIdx !== null && tasks[activeIdx]) {
      setSecondsLeft(tasks[activeIdx].durationSeconds);
    }
  }, [activeIdx, tasks, running]);

  // Change 4 — focus newly added task label
  useEffect(() => {
    if (pendingFocusId.current) {
      const input = document.querySelector(
        `[data-task-id="${pendingFocusId.current}"] .${styles.taskLabel}`
      ) as HTMLInputElement | null;
      if (input) {
        input.focus();
        pendingFocusId.current = null;
      }
    }
  }, [tasks]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const clearTimer = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const advanceToNext = useCallback(
    (currentIdx: number, currentTasks: IntervalTask[], shouldContinue = false) => {
      // Fire completion sound for finished task
      playSoundOnce(currentTasks[currentIdx]?.completionSound, 'chime');

      const updated = currentTasks.map((t, i) =>
        i === currentIdx ? { ...t, completed: true } : t
      );
      onChange(updated);
      const nextIdx = updated.findIndex((t, i) => i > currentIdx && !t.completed);
      if (nextIdx !== -1) {
        // Fire start sound for next task
        playSoundOnce(updated[nextIdx].startSound);
        setActiveIdx(nextIdx);
        setSecondsLeft(updated[nextIdx].durationSeconds);
        if (shouldContinue) setRunning(true);
      } else {
        setRunning(false);
        setActiveIdx(null);
        setSessionComplete(true);
      }
    },
    [onChange, playSoundOnce]
  );

  // ── Main countdown interval ───────────────────────────────────────────────
  useEffect(() => {
    if (!running || activeIdx === null) {
      clearTimer();
      return;
    }
    clearTimer();
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { setRunning(false); return 0; }
        return prev - 1;
      });
    }, 1000);
    return clearTimer;
  }, [running, activeIdx]);

  // ── Timer-hit-zero: break gate OR advance ─────────────────────────────────
  useEffect(() => {
    if (!running && secondsLeft === 0 && activeIdx !== null && !breakGate) {
      const currentTask  = tasks[activeIdx];
      const currentPhase = currentTask?.phaseType ?? 'work';
      const nextIdx      = tasks.findIndex((t, i) => i > activeIdx && !t.completed);
      if (
        nextIdx !== -1 &&
        currentPhase === 'break' &&
        (tasks[nextIdx].phaseType ?? 'work') === 'work'
      ) {
        onChange(tasks.map((t, i) => i === activeIdx ? { ...t, completed: true } : t));
        breakGateNextIdxRef.current = nextIdx;
        setBreakGate(true);
      } else {
        advanceToNext(activeIdx, tasks, true);
      }
    }
  }, [running, secondsLeft, activeIdx, tasks, advanceToNext, onChange, breakGate]);

  // ── Break gate countdown ──────────────────────────────────────────────────
  useEffect(() => {
    if (!breakGate) return;
    setBreakGateCountdown(10);
    breakGateIntervalRef.current = window.setInterval(() => {
      setBreakGateCountdown(prev => {
        if (prev <= 1) {
          clearInterval(breakGateIntervalRef.current!);
          breakGateIntervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (breakGateIntervalRef.current) {
        clearInterval(breakGateIntervalRef.current);
        breakGateIntervalRef.current = null;
      }
    };
  }, [breakGate]);

  const handleBreakGateStart = useCallback(() => {
    const nextIdx = breakGateNextIdxRef.current;
    setBreakGate(false);
    if (breakGateIntervalRef.current) {
      clearInterval(breakGateIntervalRef.current);
      breakGateIntervalRef.current = null;
    }
    if (nextIdx !== null && tasks[nextIdx]) {
      playSoundOnce(tasks[nextIdx].startSound);
      setActiveIdx(nextIdx);
      setSecondsLeft(tasks[nextIdx].durationSeconds);
      setRunning(true);
    }
  }, [tasks, playSoundOnce]);

  useEffect(() => {
    if (breakGate && breakGateCountdown === 0) handleBreakGateStart();
  }, [breakGate, breakGateCountdown, handleBreakGateStart]);

  const handleBreakGateOneMore = useCallback(() => {
    setBreakGate(false);
    if (breakGateIntervalRef.current) {
      clearInterval(breakGateIntervalRef.current);
      breakGateIntervalRef.current = null;
    }
    if (activeIdx !== null) {
      onChange(tasks.map((t, i) => i === activeIdx ? { ...t, completed: false } : t));
      setSecondsLeft(60);
      setRunning(true);
    }
  }, [activeIdx, tasks, onChange]);

  // ── Timer controls ────────────────────────────────────────────────────────
  const handleStart = () => {
    if (tasks.length === 0) return;
    if (activeIdx === null) {
      const firstIdx = tasks.findIndex(t => !t.completed);
      if (firstIdx === -1) return;
      setActiveIdx(firstIdx);
      setSecondsLeft(tasks[firstIdx].durationSeconds);
      playSoundOnce(tasks[firstIdx].startSound);
    }
    setRunning(true);
  };

  const handlePause = () => setRunning(false);

  const handleReset = useCallback(() => {
    setRunning(false);
    setActiveIdx(null);
    setSecondsLeft(0);
    setSessionComplete(false);
    setBreakGate(false);
    setRestSecondsLeft(null);
    if (restIntervalRef.current)      { clearInterval(restIntervalRef.current);      restIntervalRef.current = null; }
    if (breakGateIntervalRef.current) { clearInterval(breakGateIntervalRef.current); breakGateIntervalRef.current = null; }
    onChange(tasks.map(t => ({ ...t, completed: false })));
  }, [tasks, onChange]);

  const handleSkip = () => {
    if (activeIdx === null) return;
    setRunning(false);
    advanceToNext(activeIdx, tasks);
  };

  // ── Rest mode ─────────────────────────────────────────────────────────────
  const startRestMode = () => {
    setSessionComplete(false);
    setRestSecondsLeft(15 * 60);
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    restIntervalRef.current = window.setInterval(() => {
      setRestSecondsLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(restIntervalRef.current!);
          restIntervalRef.current = null;
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ── Task CRUD ─────────────────────────────────────────────────────────────
  const addTask = () => {
    const newTask: IntervalTask = {
      id: makeId(), label: '', durationSeconds: 300, completed: false, phaseType: 'work',
    };
    pendingFocusId.current = newTask.id;
    onChange([...tasks, newTask]);
  };

  const updateTask = (id: string, changes: Partial<IntervalTask>) => {
    onChange(tasks.map(t => (t.id === id ? { ...t, ...changes } : t)));
  };

  const removeTask = (id: string) => {
    const idx = tasks.findIndex(t => t.id === id);
    onChange(tasks.filter(t => t.id !== id));
    if (activeIdx !== null) {
      if (idx === activeIdx)  { setRunning(false); setActiveIdx(null); }
      else if (idx < activeIdx) setActiveIdx(activeIdx - 1);
    }
  };

  const cyclePhaseType = (id: string, current: IntervalPhaseType = 'work') => {
    updateTask(id, { phaseType: PHASE_ORDER[(PHASE_ORDER.indexOf(current) + 1) % PHASE_ORDER.length] });
  };

  // Change 2 — seconds-based adjustDuration with isActive param
  const adjustDuration = (id: string, deltaSecs: number, isActive: boolean) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const newDuration = Math.max(60, Math.min(7200, task.durationSeconds + deltaSecs));
    updateTask(id, { durationSeconds: newDuration });
    if (isActive) setSecondsLeft(prev => Math.max(1, prev + deltaSecs));
  };

  const openDurationEdit = (id: string) => setEditingDuration(id);

  const parseDurationInput = (val: string): number => {
    if (val.includes(':')) {
      const [m, s] = val.split(':').map(n => parseInt(n, 10) || 0);
      return Math.max(60, Math.min(7200, m * 60 + s));
    }
    return Math.max(60, Math.min(7200, parseInt(val, 10) || 0));
  };

  // Change 5 — apply quick-start template
  const applyTemplate = (name: keyof typeof QUICK_TEMPLATES) => {
    onChange(QUICK_TEMPLATES[name].map(t => ({ ...t, id: makeId(), completed: false })));
  };

  const handleSaveSequence = () => {
    if (!saveSequenceName.trim()) return;
    setSavedSequences(prev => [...prev, {
      id: makeId(),
      name: saveSequenceName.trim(),
      tasks: tasks.map(({ id, label, durationSeconds, phaseType, completionSound, startSound }) => ({
        id, label, durationSeconds, phaseType, completionSound, startSound,
      })),
    }]);
    setSavingSequence(false);
    setSaveSequenceName('');
  };

  const loadSequence = (seqTasks: Omit<IntervalTask, 'completed'>[]) => {
    onChange(seqTasks.map(t => ({ ...t, completed: false })));
    setActiveIdx(null);
    setSecondsLeft(0);
    setRunning(false);
    setSessionComplete(false);
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const totalSeconds     = tasks.reduce((s, t) => s + t.durationSeconds, 0);
  const completedSeconds = tasks.filter(t => t.completed).reduce((s, t) => s + t.durationSeconds, 0);
  const completedCount   = tasks.filter(t => t.completed).length;
  const progressPercent  = totalSeconds > 0 ? Math.round((completedSeconds / totalSeconds) * 100) : 0;
  const totalMinutes     = Math.round(totalSeconds / 60);

  // ── Clock-time projection ─────────────────────────────────────────────────
  // For each task: when will it end based on current timer state?
  const clockEndTimes: (number | null)[] = (() => {
    let cursor = Date.now();
    return tasks.map((task, idx) => {
      if (task.completed) return null;
      const secs = (idx === activeIdx && secondsLeft > 0) ? secondsLeft : task.durationSeconds;
      cursor += secs * 1000;
      return cursor;
    });
  })();

  // ════════════════════════════════════════════════════════════════════════
  //  SESSION COMPLETE OVERLAY
  // ════════════════════════════════════════════════════════════════════════
  if (sessionComplete) {
    return (
      <div className={styles.container}>
        <div className={styles.intervalCompleteOverlay}>
          <div className={styles.intervalCompleteCard}>
            <h2 className={styles.intervalCompleteTitle}>Session Complete</h2>
            <p className={styles.intervalCompleteStat}>
              {completedCount} blocks · {Math.round(completedSeconds / 60)} minutes
            </p>
            <div className={styles.intervalCompleteActions}>
              <button className={`${styles.controlBtn} ${styles.startBtn}`} onClick={startRestMode}>
                Rest (15 min)
              </button>
              <button className={styles.controlBtn} onClick={handleReset}>Done</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  //  EMPTY STATE — Change 5: warm prompt + quick-start
  // ════════════════════════════════════════════════════════════════════════
  if (tasks.length === 0) {
    return (
      <div className={styles.container}>
        {savedSequences.length > 0 && (
          <div className={styles.intervalPickerSection}>
            <span className={styles.intervalSectionLabel}>Saved</span>
            <div className={styles.intervalPillRow}>
              {savedSequences.map(seq => (
                <button
                  key={seq.id}
                  className={`${styles.intervalTemplatePill} ${styles.intervalSavedPill}`}
                  onClick={() => loadSequence(seq.tasks)}
                >
                  {seq.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>What are we working on?</p>
          <p className={styles.emptyBody}>Add your first interval below, or use a quick-start pattern:</p>
          <div className={styles.quickStart}>
            <button className={styles.quickBtn} onClick={() => applyTemplate('pomodoro')}>🍅 Pomodoro</button>
            <button className={styles.quickBtn} onClick={() => applyTemplate('flow')}>🌊 Flow</button>
            <button className={styles.quickBtn} onClick={() => applyTemplate('sprint')}>⚡ Sprint</button>
          </div>
        </div>
        <button className={styles.addBtn} onClick={addTask}>+ build your own</button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  //  MAIN VIEW
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className={styles.container}>
      {/* Rest banner */}
      {restSecondsLeft !== null && (
        <div className={styles.intervalRestBanner}>
          <span>Rest · {formatTime(restSecondsLeft)}</span>
          <button
            className={styles.intervalRestDismiss}
            onClick={() => {
              setRestSecondsLeft(null);
              if (restIntervalRef.current) { clearInterval(restIntervalRef.current); restIntervalRef.current = null; }
            }}
          >×</button>
        </div>
      )}

      {/* Sequence strip */}
      <div className={styles.intervalStripWrapper}>
        <span className={styles.intervalStripTotal}>{totalMinutes} min total</span>
        <div className={styles.intervalStrip}>
          {tasks.map((task, idx) => {
            const widthPct = Math.max((task.durationSeconds / totalSeconds) * 100, 4);
            const phase    = task.phaseType ?? 'work';
            return (
              <div
                key={task.id}
                className={[
                  styles.intervalCapsule,
                  styles[`intervalCapsule_${phase}`],
                  idx === activeIdx ? styles.intervalCapsuleActive    : '',
                  task.completed    ? styles.intervalCapsuleCompleted : '',
                ].filter(Boolean).join(' ')}
                style={{ '--capsule-w': `${widthPct}%` } as React.CSSProperties}
                title={`${task.label || 'Untitled'} · ${formatTime(task.durationSeconds)}`}
              />
            );
          })}
        </div>
      </div>

      {/* Timer section */}
      <div className={styles.timerSection}>
        {breakGate && (
          <div className={styles.intervalBreakGate}>
            <p className={styles.intervalBreakGateText}>
              Break&rsquo;s over. Ready for the next block?
            </p>
            <div className={styles.intervalBreakGateActions}>
              <button
                className={`${styles.controlBtn} ${styles.startBtn}`}
                onClick={handleBreakGateStart}
              >
                Start Now{breakGateCountdown > 0 ? ` (${breakGateCountdown})` : ''}
              </button>
              <button className={styles.controlBtn} onClick={handleBreakGateOneMore}>
                1 more minute
              </button>
            </div>
          </div>
        )}

        <div className={styles.timerDisplay}>
          <span className={styles.timerDigits}>
            {activeIdx !== null ? formatTime(secondsLeft) : '--:--'}
          </span>
          {activeIdx !== null && tasks[activeIdx] && (
            <span className={styles.timerLabel}>{tasks[activeIdx].label || 'Untitled task'}</span>
          )}
        </div>

        {/* Change 7 — button hierarchy + title attributes */}
        <div className={styles.controls}>
          {!running ? (
            <button
              className={`${styles.controlBtn} ${styles.startBtn}`}
              onClick={handleStart}
              title="Start sequence"
            >
              ▶ {activeIdx !== null ? 'Resume' : 'Start'}
            </button>
          ) : (
            <button
              className={`${styles.controlBtn} ${styles.pauseBtn}`}
              onClick={handlePause}
              title="Pause timer"
            >
              ⏸ Pause
            </button>
          )}
          <button
            className={styles.controlBtn}
            onClick={handleSkip}
            disabled={activeIdx === null}
            title="Skip to next interval"
          >
            ⏭ Skip
          </button>
          <button
            className={`${styles.controlBtn} ${styles.resetBtn}`}
            onClick={handleReset}
            title="Reset all intervals"
          >
            ↺ Reset
          </button>
        </div>

        {/* Change 8 — progress bar */}
        {totalSeconds > 0 && (
          <div className={styles.progressRow}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ '--fill-pct': `${progressPercent}%` } as React.CSSProperties}
              />
            </div>
            <span className={styles.progressLabel}>
              {progressPercent}% · {formatTime(totalSeconds - completedSeconds)} left
            </span>
          </div>
        )}
      </div>

      {/* Task list */}
      <div className={styles.taskList}>
        {tasks.map((task, idx) => {
          const isActive   = idx === activeIdx;
          const phase      = task.phaseType ?? 'work';
          const phaseMeta  = PHASE_META[phase];
          const isBreakRow = phase === 'break';
          const endTimeMs  = clockEndTimes[idx];
          const soundKey = task.completionSound ?? 'chime';

          return (
            <div
              key={task.id}
              data-task-id={task.id}
              className={[
                styles.taskRow,
                task.completed ? styles.completed        : '',
                isActive       ? styles.active           : '',
                isBreakRow     ? styles.intervalBreakRow : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                if (!running) { setActiveIdx(idx); setSecondsLeft(task.durationSeconds); }
              }}
              /* Change 9 — drag to reorder */
              draggable={!running}
              onDragStart={() => setDraggedTaskId(task.id)}
              onDragEnter={() => {
                if (!draggedTaskId || draggedTaskId === task.id || running) return;
                const next = [...tasks];
                const fromIdx = next.findIndex(t => t.id === draggedTaskId);
                const [removed] = next.splice(fromIdx, 1);
                next.splice(idx, 0, removed);
                onChange(next);
              }}
              onDragEnd={() => setDraggedTaskId(null)}
              onDragOver={e => e.preventDefault()}
              style={{
                opacity: draggedTaskId === task.id ? 0.4 : 1,
                cursor: running ? 'default' : 'grab',
              }}
            >
              {/* Change 9 — drag handle */}
              {!running && (
                <div className={styles.dragHandle}>
                  <svg viewBox="0 0 8 12" fill="currentColor" width="8" height="12">
                    <circle cx="2" cy="2"  r="1.2"/><circle cx="6" cy="2"  r="1.2"/>
                    <circle cx="2" cy="6"  r="1.2"/><circle cx="6" cy="6"  r="1.2"/>
                    <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
                  </svg>
                </div>
              )}

              {/* Change 1 — status dot */}
              <div
                className={styles.statusDot}
                data-state={task.completed ? 'done' : isActive ? 'active' : 'waiting'}
              >
                {task.completed && (
                  <svg viewBox="0 0 8 8" width="8" height="8">
                    <polyline
                      points="1,4 3,6.5 7,1.5"
                      stroke="rgba(160,100,220,0.6)"
                      strokeWidth="1.5"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </div>

              {/* Change 3 — task label */}
              <input
                className={[
                  styles.taskLabel,
                  isBreakRow ? styles.intervalBreakLabel : '',
                ].filter(Boolean).join(' ')}
                value={task.label}
                placeholder="Task name..."
                onChange={e => updateTask(task.id, { label: e.target.value })}
                onClick={e => e.stopPropagation()}
              />

              {/* Projected end time */}
              {endTimeMs !== null && (
                <span className={styles.taskClockTime} title="Projected finish time">
                  {fmtClock(endTimeMs)}
                </span>
              )}

              {/* Change 2 — durationGroup with ±5 step buttons */}
              <div className={styles.durationGroup}>
                <button
                  className={styles.durationStep}
                  onClick={e => { e.stopPropagation(); adjustDuration(task.id, -300, isActive); }}
                  disabled={task.durationSeconds <= 60}
                >
                  −5
                </button>
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
                      e.stopPropagation();
                    }}
                  />
                ) : (
                  <span
                    className={styles.durationDisplay}
                    onClick={e => { e.stopPropagation(); openDurationEdit(task.id); }}
                  >
                    {formatTime(task.durationSeconds)}
                  </span>
                )}
                <button
                  className={styles.durationStep}
                  onClick={e => { e.stopPropagation(); adjustDuration(task.id, 300, isActive); }}
                  disabled={task.durationSeconds >= 7200}
                >
                  +5
                </button>
              </div>

              {/* Completion sound cycle button */}
              {/* Completion sound select */}
              <select
                className={styles.soundSelect}
                value={soundKey}
                onClick={e => e.stopPropagation()}
                onChange={e => {
                  const next = e.target.value as ReminderSound;
                  updateTask(task.id, { completionSound: next });
                  playSoundOnce(next);
                }}
                title="End sound"
              >
                {DEFAULT_SOUNDS.map(s => (
                  <option key={s} value={s}>
                    {SOUND_EMOJI[s]} {SOUND_LABEL[s]}
                  </option>
                ))}
                {settings.customTones.map(tone => (
                  <option key={tone.id} value={tone.id}>🔈 {tone.name}</option>
                ))}
              </select>

              {/* Phase badge */}
              <button
                className={[
                  styles.intervalPhaseBadge,
                  styles[`intervalPhase_${phase}`],
                ].filter(Boolean).join(' ')}
                onClick={e => { e.stopPropagation(); cyclePhaseType(task.id, phase); }}
                title="Click to change phase type"
              >
                {phaseMeta.emoji} {phaseMeta.label}
              </button>

              <button
                className={styles.removeBtn}
                onClick={e => { e.stopPropagation(); removeTask(task.id); }}
                title="Remove"
              >
                ×
              </button>
            </div>
          );
        })}

        <div className={styles.intervalTaskFooter}>
          <button className={styles.addBtn} onClick={addTask}>+ add task</button>

          {!running && (
            savingSequence ? (
              <div className={styles.intervalSaveRow}>
                <input
                  className={styles.intervalSaveInput}
                  value={saveSequenceName}
                  onChange={e => setSaveSequenceName(e.target.value)}
                  placeholder="Name this sequence"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter')  handleSaveSequence();
                    if (e.key === 'Escape') { setSavingSequence(false); setSaveSequenceName(''); }
                  }}
                />
                <button className={`${styles.controlBtn} ${styles.startBtn}`} onClick={handleSaveSequence}>Save</button>
                <button className={styles.controlBtn} onClick={() => { setSavingSequence(false); setSaveSequenceName(''); }}>Cancel</button>
              </div>
            ) : (
              <button className={styles.intervalSaveBtn} onClick={() => setSavingSequence(true)}>
                Save Sequence
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
