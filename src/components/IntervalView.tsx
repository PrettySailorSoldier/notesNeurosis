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
  onUpdateSettings: (patch: Partial<Settings>) => void;
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

const PHASE_META: Record<IntervalPhaseType, { emoji: string; label: string; color: string }> = {
  work:       { emoji: '🟣', label: 'Work',   color: '#661A4E' },
  break:      { emoji: '🔵', label: 'Break',  color: '#5A8EFC' },
  transition: { emoji: '🟡', label: 'Trans',  color: '#B55F7C' },
  buffer:     { emoji: '⚪', label: 'Buffer', color: '#8A8A8A' },
};

const DEFAULT_SOUNDS: ReminderSound[] = ['chime', 'bell', 'blip', 'soft_ding', 'none'];
const SOUND_EMOJI: Record<string, string> = {
  chime: '🎵', bell: '🔔', blip: '⚡', soft_ding: '✨', none: '🔇',
};
const SOUND_LABEL: Record<string, string> = {
  chime: 'chime', bell: 'bell', blip: 'blip', soft_ding: 'ding', none: 'mute',
};

const BUILT_IN_TEMPLATES: { key: string; label: string; tasks: Omit<IntervalTask, 'id' | 'completed'>[] }[] = [
  {
    key: 'pomodoro', label: '🍅 Pomodoro',
    tasks: [
      { label: 'Focus',      durationSeconds: 1500, phaseType: 'work'  },
      { label: 'Break',      durationSeconds: 300,  phaseType: 'break' },
      { label: 'Focus',      durationSeconds: 1500, phaseType: 'work'  },
      { label: 'Break',      durationSeconds: 300,  phaseType: 'break' },
      { label: 'Focus',      durationSeconds: 1500, phaseType: 'work'  },
      { label: 'Long Break', durationSeconds: 900,  phaseType: 'break' },
    ],
  },
  {
    key: 'flow', label: '🌊 Flow',
    tasks: [
      { label: 'Warm Up',   durationSeconds: 300,  phaseType: 'transition' },
      { label: 'Deep Work', durationSeconds: 2700, phaseType: 'work'       },
      { label: 'Rest',      durationSeconds: 600,  phaseType: 'break'      },
    ],
  },
  {
    key: 'sprint', label: '⚡ Sprint',
    tasks: [
      { label: 'Sprint', durationSeconds: 900, phaseType: 'work'  },
      { label: 'Sprint', durationSeconds: 900, phaseType: 'work'  },
      { label: 'Sprint', durationSeconds: 900, phaseType: 'work'  },
      { label: 'Rest',   durationSeconds: 300, phaseType: 'break' },
    ],
  },
  {
    key: 'deepwork', label: '🎯 Deep Work',
    tasks: [
      { label: 'Warm-up',    durationSeconds: 300,  phaseType: 'transition' },
      { label: 'Deep Focus', durationSeconds: 3600, phaseType: 'work'       },
      { label: 'Break',      durationSeconds: 900,  phaseType: 'break'      },
    ],
  },
  {
    key: 'morning', label: '🌅 Morning',
    tasks: [
      { label: 'Mindfulness', durationSeconds: 600,  phaseType: 'buffer'     },
      { label: 'Planning',    durationSeconds: 900,  phaseType: 'transition' },
      { label: 'First block', durationSeconds: 1800, phaseType: 'work'       },
    ],
  },
];

const SVG_R    = 68;
const SVG_CIRC = 2 * Math.PI * SVG_R;

export function IntervalView({ tasks, onChange, settings, onUpdateSettings, pageId }: Props) {
  // ── Mode & UI state ───────────────────────────────────────────────────────
  const [mode,          setMode]          = useState<'edit' | 'run'>('edit');
  const [muted,         setMuted]         = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(tasks.length === 0);

  // ── Core timer state ──────────────────────────────────────────────────────
  const [activeIdx,       setActiveIdx]       = useState<number | null>(null);
  const [secondsLeft,     setSecondsLeft]     = useState(0);
  const [running,         setRunning]         = useState(false);
  const [editingDuration, setEditingDuration] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const pendingFocusId       = useRef<string | null>(null);
  // Drag refs — zero setState during drag to avoid breaking the browser's drag session
  const draggedTaskIdRef     = useRef<string | null>(null);
  const [draggedTaskId,
         setDraggedTaskId]   = useState<string | null>(null); // opacity only
  const pendingDragOrderRef  = useRef<string[]>([]);
  const dragRowRefsMap       = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragHighlightedId    = useRef<string | null>(null);

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

  // ── Saved sequences (read from settings.json via prop; write via onUpdateSettings) ──
  const savedSequences = settings.savedSequences ?? [];
  const [savingSequence,   setSavingSequence]   = useState(false);
  const [saveSequenceName, setSaveSequenceName] = useState('');

  // ── Audio ─────────────────────────────────────────────────────────────────
  const { playTone } = useAudio();
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const playSoundOnce = useCallback((sound: ReminderSound | undefined, fallback: ReminderSound = 'none') => {
    if (mutedRef.current) return;
    const s = sound ?? fallback;
    if (s === 'none') return;
    const stop = playTone(s, settingsRef.current.volume, settingsRef.current.customTones);
    setTimeout(stop, 2500);
  }, [playTone]);

  // ── Persistence ───────────────────────────────────────────────────────────
  const loadedRef               = useRef(false);
  const restoredFromPersistence = useRef(false);
  const secondsLeftRef          = useRef(secondsLeft);
  useEffect(() => { secondsLeftRef.current = secondsLeft; }, [secondsLeft]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await load(`interval-${pageId}.json`, { autoSave: false } as any);
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
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

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

  // ── Sync secondsLeft when idle ────────────────────────────────────────────
  useEffect(() => {
    if (restoredFromPersistence.current) {
      restoredFromPersistence.current = false;
      return;
    }
    if (!running && activeIdx !== null && tasks[activeIdx]) {
      setSecondsLeft(tasks[activeIdx].durationSeconds);
    }
  }, [activeIdx, tasks, running]);

  // ── Focus newly added task label ──────────────────────────────────────────
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
      playSoundOnce(currentTasks[currentIdx]?.completionSound, 'chime');
      const updated = currentTasks.map((t, i) =>
        i === currentIdx ? { ...t, completed: true } : t
      );
      onChange(updated);
      const nextIdx = updated.findIndex((t, i) => i > currentIdx && !t.completed);
      if (nextIdx !== -1) {
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

  // Stable refs for keyboard handler
  const advanceToNextRef = useRef(advanceToNext);
  useEffect(() => { advanceToNextRef.current = advanceToNext; }, [advanceToNext]);
  const tasksRef     = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  const runningRef   = useRef(running);
  useEffect(() => { runningRef.current = running; }, [running]);
  const activeIdxRef = useRef(activeIdx);
  useEffect(() => { activeIdxRef.current = activeIdx; }, [activeIdx]);

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
    setMode('edit');
    if (restIntervalRef.current)      { clearInterval(restIntervalRef.current);      restIntervalRef.current = null; }
    if (breakGateIntervalRef.current) { clearInterval(breakGateIntervalRef.current); breakGateIntervalRef.current = null; }
    onChange(tasks.map(t => ({ ...t, completed: false })));
  }, [tasks, onChange]);

  const handleSkip = () => {
    if (activeIdx === null) return;
    setRunning(false);
    advanceToNext(activeIdx, tasks);
  };

  const startRun = () => {
    handleStart();
    setMode('run');
  };

  const stopRun = () => {
    setRunning(false);
    setMode('edit');
  };

  // ── Keyboard shortcuts (RUN mode only) ───────────────────────────────────
  useEffect(() => {
    if (mode !== 'run') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (runningRef.current) {
          setRunning(false);
        } else {
          const idx = activeIdxRef.current;
          if (idx === null) {
            const firstIdx = tasksRef.current.findIndex(t => !t.completed);
            if (firstIdx !== -1) {
              setActiveIdx(firstIdx);
              setSecondsLeft(tasksRef.current[firstIdx].durationSeconds);
            }
          }
          setRunning(true);
        }
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        const idx = activeIdxRef.current;
        if (idx !== null) {
          setRunning(false);
          advanceToNextRef.current(idx, tasksRef.current, false);
        }
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        setMode('edit');
        setRunning(false);
      }
      if (e.key === 'm' || e.key === 'M') {
        setMuted(m => !m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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
      if (idx === activeIdx)    { setRunning(false); setActiveIdx(null); }
      else if (idx < activeIdx) setActiveIdx(activeIdx - 1);
    }
  };

  const duplicateTask = (id: string) => {
    const src = tasks.find(t => t.id === id);
    if (!src) return;
    const clone: IntervalTask = { ...src, id: makeId(), completed: false };
    const idx = tasks.findIndex(t => t.id === id);
    const next = [
      ...tasks.slice(0, idx + 1),
      clone,
      ...tasks.slice(idx + 1),
    ];
    onChange(next);
  };

  const cyclePhaseType = (id: string, current: IntervalPhaseType = 'work') => {
    updateTask(id, { phaseType: PHASE_ORDER[(PHASE_ORDER.indexOf(current) + 1) % PHASE_ORDER.length] });
  };

  // ±1m buttons; Alt+click → ±5s; min 10s, max 14400s
  const adjustDuration = (id: string, deltaSecs: number, isActive: boolean) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const newDuration = Math.max(10, Math.min(14400, task.durationSeconds + deltaSecs));
    updateTask(id, { durationSeconds: newDuration });
    if (isActive) setSecondsLeft(prev => Math.max(1, prev + deltaSecs));
  };

  const openDurationEdit = (id: string) => setEditingDuration(id);

  const parseDurationInput = (val: string): number => {
    if (val.includes(':')) {
      const [m, s] = val.split(':').map(n => parseInt(n, 10) || 0);
      return Math.max(10, Math.min(14400, m * 60 + s));
    }
    return Math.max(10, Math.min(14400, parseInt(val, 10) || 0));
  };

  const loadSequence = (seqTasks: Array<Omit<IntervalTask, 'id' | 'completed'> & { id?: string }>) => {
    onChange(seqTasks.map(t => ({ ...t, id: makeId(), completed: false })));
    setActiveIdx(null);
    setSecondsLeft(0);
    setRunning(false);
    setSessionComplete(false);
  };

  const handleSaveSequence = () => {
    if (!saveSequenceName.trim()) return;
    const newSeq: SavedSequence = {
      id: makeId(),
      name: saveSequenceName.trim(),
      tasks: tasks.map(({ id, label, durationSeconds, phaseType, completionSound, startSound }) => ({
        id, label, durationSeconds, phaseType, completionSound, startSound,
      })),
    };
    onUpdateSettings({ savedSequences: [...savedSequences, newSeq] });
    setSavingSequence(false);
    setSaveSequenceName('');
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const totalSeconds     = tasks.reduce((s, t) => s + t.durationSeconds, 0);
  const completedSeconds = tasks.filter(t => t.completed).reduce((s, t) => s + t.durationSeconds, 0);
  const completedCount   = tasks.filter(t => t.completed).length;
  const progressPercent  = totalSeconds > 0 ? Math.round((completedSeconds / totalSeconds) * 100) : 0;
  const totalMinutes     = Math.round(totalSeconds / 60);

  const clockEndTimes: (number | null)[] = (() => {
    let cursor = Date.now();
    return tasks.map((task, idx) => {
      if (task.completed) return null;
      const secs = (idx === activeIdx && secondsLeft > 0) ? secondsLeft : task.durationSeconds;
      cursor += secs * 1000;
      return cursor;
    });
  })();

  // RUN mode arc
  const currentTask   = activeIdx !== null ? tasks[activeIdx] : null;
  const currentPhase  = (currentTask?.phaseType ?? 'work') as IntervalPhaseType;
  const phaseTotal    = currentTask ? currentTask.durationSeconds : 1;
  const phaseElapsed  = phaseTotal - secondsLeft;
  const phaseProgress = Math.max(0, Math.min(1, phaseElapsed / phaseTotal));
  const arcDashOffset = SVG_CIRC * (1 - phaseProgress);
  const arcColor      = PHASE_META[currentPhase].color;
  const upcomingTasks = tasks.filter((t, i) => i > (activeIdx ?? -1) && !t.completed).slice(0, 2);

  // ── Shared sub-components ─────────────────────────────────────────────────
  const sequenceStrip = (
    <div className={styles.intervalStrip}>
      {tasks.map((task, idx) => {
        const widthPct = totalSeconds > 0 ? Math.max((task.durationSeconds / totalSeconds) * 100, 4) : 10;
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
            style={{ '--capsule-w': `${widthPct}%` } as any}
            title={`${task.label || 'Untitled'} · ${formatTime(task.durationSeconds)}`}
          />
        );
      })}
    </div>
  );

  const restBanner = restSecondsLeft !== null ? (
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
  ) : null;

  const templatesPanel = (
    <div className={styles.intervalTemplatesPanel}>
      <button
        className={styles.intervalTemplatesToggle}
        onClick={() => setTemplatesOpen(o => !o)}
      >
        {templatesOpen ? '▾' : '▸'} Templates
      </button>
      <div className={[
        styles.intervalTemplatesBody,
        templatesOpen ? styles.intervalTemplatesBodyOpen : '',
      ].filter(Boolean).join(' ')}>
        <div className={styles.intervalTemplatesList}>
          {BUILT_IN_TEMPLATES.map(tpl => (
            <button
              key={tpl.key}
              className={styles.intervalTemplatePill}
              onClick={() => loadSequence(tpl.tasks)}
            >
              {tpl.label}
            </button>
          ))}
          {savedSequences.map(seq => (
            <div key={seq.id} className={styles.intervalSavedEntry}>
              <button
                className={`${styles.intervalTemplatePill} ${styles.intervalSavedPill}`}
                onClick={() => loadSequence(seq.tasks)}
              >
                {seq.name}
              </button>
              <button
                className={styles.intervalSavedDelete}
                onClick={() => onUpdateSettings({ savedSequences: savedSequences.filter(s => s.id !== seq.id) })}
                title="Delete"
              >×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

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
  //  EMPTY STATE
  // ════════════════════════════════════════════════════════════════════════
  if (tasks.length === 0) {
    return (
      <div className={styles.container}>
        {templatesPanel}
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>What are we working on?</p>
          <p className={styles.emptyBody}>Add your first interval below, or pick a template above.</p>
        </div>
        <button className={styles.addBtn} onClick={addTask}>+ build your own</button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  //  RUN MODE
  // ════════════════════════════════════════════════════════════════════════
  if (mode === 'run') {
    return (
      <div className={styles.container}>
        {restBanner}

        {/* Sequence strip */}
        <div className={styles.intervalStripWrapper}>
          <span className={styles.intervalStripTotal}>{totalMinutes} min total</span>
          {sequenceStrip}
        </div>

        {/* Break gate overlay */}
        {breakGate && (
          <div className={styles.intervalBreakGate} style={{ position: 'relative', inset: 'auto', borderRadius: 12 }}>
            <p className={styles.intervalBreakGateText}>Break&rsquo;s over. Ready for the next block?</p>
            <div className={styles.intervalBreakGateActions}>
              <button className={`${styles.controlBtn} ${styles.startBtn}`} onClick={handleBreakGateStart}>
                Start Now{breakGateCountdown > 0 ? ` (${breakGateCountdown})` : ''}
              </button>
              <button className={styles.controlBtn} onClick={handleBreakGateOneMore}>1 more minute</button>
            </div>
          </div>
        )}

        {/* Big countdown */}
        <div className={styles.runModeCenter}>
          <div className={styles.runArcWrapper}>
            <svg viewBox="0 0 160 160" width="160" height="160" className={styles.runArcSvg}>
              <circle
                cx="80" cy="80" r={SVG_R}
                fill="none"
                stroke="rgba(180,100,220,0.1)"
                strokeWidth="7"
              />
              <circle
                cx="80" cy="80" r={SVG_R}
                fill="none"
                stroke={arcColor}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={SVG_CIRC}
                strokeDashoffset={arcDashOffset}
                transform="rotate(-90 80 80)"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div className={styles.runArcInner}>
              <span className={styles.runDigits}>
                {activeIdx !== null ? formatTime(secondsLeft) : '--:--'}
              </span>
              {currentTask && (
                <span className={styles.runLabel}>{currentTask.label || 'Untitled'}</span>
              )}
              {muted && <span className={styles.runMutedBadge}>muted</span>}
            </div>
          </div>

          {/* Upcoming strip */}
          {upcomingTasks.length > 0 && (
            <div className={styles.runUpcoming}>
              <span className={styles.runUpcomingLabel}>up next</span>
              {upcomingTasks.map(t => {
                const ph = (t.phaseType ?? 'work') as IntervalPhaseType;
                return (
                  <div key={t.id} className={styles.runUpcomingItem}>
                    <span
                      className={styles.runUpcomingDot}
                      style={{ background: PHASE_META[ph].color } as any}
                    />
                    <span className={styles.runUpcomingName}>{t.label || 'Untitled'}</span>
                    <span className={styles.runUpcomingTime}>{formatTime(t.durationSeconds)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Controls */}
          <div className={styles.controls}>
            {!running ? (
              <button className={`${styles.controlBtn} ${styles.startBtn}`} onClick={handleStart} title="Resume (Space)">
                ▶ {activeIdx !== null ? 'Resume' : 'Start'}
              </button>
            ) : (
              <button className={`${styles.controlBtn} ${styles.pauseBtn}`} onClick={handlePause} title="Pause (Space)">
                ⏸ Pause
              </button>
            )}
            <button
              className={styles.controlBtn}
              onClick={handleSkip}
              disabled={activeIdx === null}
              title="Skip (→)"
            >
              ⏭ Skip
            </button>
            <button
              className={`${styles.controlBtn} ${styles.resetBtn}`}
              onClick={stopRun}
              title="Stop and return to edit (Esc)"
            >
              ✕ Stop
            </button>
            <button
              className={`${styles.controlBtn} ${muted ? styles.mutedBtn : ''}`}
              onClick={() => setMuted(m => !m)}
              title="Toggle mute (m)"
            >
              {muted ? '🔇' : '🔔'}
            </button>
          </div>

          {totalSeconds > 0 && (
            <div className={styles.progressRow}>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ '--fill-pct': `${progressPercent}%` } as any}
                />
              </div>
              <span className={styles.progressLabel}>
                {progressPercent}% · {formatTime(totalSeconds - completedSeconds)} left
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  //  EDIT MODE
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className={styles.container}>
      {restBanner}

      {/* Sequence strip + Run button */}
      <div className={styles.intervalStripWrapper}>
        <div className={styles.intervalStripHeader}>
          <span className={styles.intervalStripTotal}>{totalMinutes} min total</span>
          <button
            className={`${styles.controlBtn} ${styles.startBtn}`}
            onClick={startRun}
            title="Start session"
          >
            ▶ {activeIdx !== null ? 'Resume' : 'Run'}
          </button>
        </div>
        {sequenceStrip}
      </div>

      {/* Templates panel */}
      {templatesPanel}

      {/* Task list */}
      <div className={styles.taskList}>
        {tasks.map((task, idx) => {
          const isActive   = idx === activeIdx;
          const phase      = (task.phaseType ?? 'work') as IntervalPhaseType;
          const phaseMeta  = PHASE_META[phase];
          const isBreakRow = phase === 'break';
          const endTimeMs  = clockEndTimes[idx];
          const soundKey   = task.completionSound ?? 'chime';

          return (
            <div
              key={task.id}
              data-task-id={task.id}
              ref={el => {
                if (el) dragRowRefsMap.current.set(task.id, el as HTMLDivElement);
                else dragRowRefsMap.current.delete(task.id);
              }}
              className={[
                styles.taskRow,
                styles[`phaseCard--${phase}`],
                task.completed ? styles.completed        : '',
                isActive       ? styles.active           : '',
                isBreakRow     ? styles.intervalBreakRow : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                if (!running) { setActiveIdx(idx); setSecondsLeft(task.durationSeconds); }
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                const srcId = draggedTaskIdRef.current;
                if (!srcId || running) return;
                
                // If mousing over itself, clear border and reset to original
                if (srcId === task.id) {
                  if (dragHighlightedId.current) {
                    const prev = dragRowRefsMap.current.get(dragHighlightedId.current);
                    if (prev) prev.style.borderTop = '';
                  }
                  dragHighlightedId.current = null;
                  pendingDragOrderRef.current = tasks.map(t => t.id);
                  return;
                }

                if (dragHighlightedId.current === task.id) return;

                // Base calculation entirely on original state
                const baseIds = tasks.map(t => t.id);
                if (!baseIds.includes(srcId) || !baseIds.includes(task.id)) return;
                
                // Remove source, then find target's current position to insert BEFORE it
                const filtered = baseIds.filter(id => id !== srcId);
                const insertIdx = filtered.indexOf(task.id);
                filtered.splice(insertIdx, 0, srcId);
                
                pendingDragOrderRef.current = filtered;

                // Direct DOM highlight — bypasses React
                if (dragHighlightedId.current) {
                  const prev = dragRowRefsMap.current.get(dragHighlightedId.current);
                  if (prev) prev.style.borderTop = '';
                }
                const el = dragRowRefsMap.current.get(task.id);
                if (el) el.style.borderTop = '2px solid rgba(180,130,220,0.7)';
                dragHighlightedId.current = task.id;
              }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => e.preventDefault()}
              draggable={!running}
              onDragStart={(e) => {
                if (running) {
                  e.preventDefault();
                  return;
                }
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'BUTTON') {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', task.id);
                draggedTaskIdRef.current = task.id;
                pendingDragOrderRef.current = tasks.map(t => t.id);
                setDraggedTaskId(task.id);
              }}
              onDragEnd={() => {
                if (dragHighlightedId.current) {
                  const el = dragRowRefsMap.current.get(dragHighlightedId.current);
                  if (el) el.style.borderTop = '';
                  dragHighlightedId.current = null;
                }
                const srcId = draggedTaskIdRef.current;
                const ids = pendingDragOrderRef.current;
                if (srcId && ids.length > 0) {
                  const taskMap = new Map(tasks.map(t => [t.id, t]));
                  const reordered = ids.map(id => taskMap.get(id)).filter(Boolean) as IntervalTask[];
                  if (reordered.length === tasks.length) onChange(reordered);
                }
                draggedTaskIdRef.current = null;
                pendingDragOrderRef.current = [];
                setDraggedTaskId(null);
              }}
              style={{
                opacity: draggedTaskId === task.id ? 0.4 : 1,
                cursor: running ? 'default' : 'grab',
              }}
            >


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

              {endTimeMs !== null && (
                <span className={styles.taskClockTime} title="Projected finish time">
                  {fmtClock(endTimeMs)}
                </span>
              )}

              <div className={styles.durationGroup}>
                <button
                  className={styles.durationStep}
                  onClick={e => { e.stopPropagation(); adjustDuration(task.id, e.altKey ? -5 : -60, isActive); }}
                  disabled={task.durationSeconds <= 10}
                  title="−1 min (Alt: −5 s)"
                >
                  −1m
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
                  onClick={e => { e.stopPropagation(); adjustDuration(task.id, e.altKey ? 5 : 60, isActive); }}
                  disabled={task.durationSeconds >= 14400}
                  title="+1 min (Alt: +5 s)"
                >
                  +1m
                </button>
              </div>

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
                  <option key={s} value={s}>{SOUND_EMOJI[s]} {SOUND_LABEL[s]}</option>
                ))}
                {settings.customTones.map(tone => (
                  <option key={tone.id} value={tone.id}>🔈 {tone.name}</option>
                ))}
              </select>

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
                className={styles.taskDupeBtn}
                onClick={e => { e.stopPropagation(); duplicateTask(task.id); }}
                title="Duplicate this block"
              >
                ⊕
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
