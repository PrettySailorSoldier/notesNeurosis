import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { TimeblockTask, TimeblockSubtask } from '../types';

/* ── helpers ── */
const uid = () => crypto.randomUUID();
const pad = (n: number) => String(n).padStart(2, '0');
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const fmtMs = (ms: number): string => {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
};

const fmtDur = (ms: number): string => {
  if (!ms || ms <= 0) return '—';
  const m = Math.floor(ms / 60000);
  if (m === 0) return '<1m';
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0 && rem > 0) return `${h}h ${rem}m`;
  if (h > 0) return `${h}h`;
  return `${rem}m`;
};

const parseEst = (raw: string): number => {
  if (!raw || !raw.trim()) return 0;
  const s = raw.trim().toLowerCase();
  const colonMatch = s.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) return (parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2])) * 60000;
  const hm = s.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (hm && (hm[1] || hm[2])) return ((parseInt(hm[1] || '0') * 60) + parseInt(hm[2] || '0')) * 60000;
  const n = parseFloat(s);
  if (!isNaN(n) && n > 0) return n * 60000;
  return 0;
};

const fmtEst = (ms: number): string => {
  if (!ms || ms <= 0) return '';
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0 && rem > 0) return `${h}h${rem}m`;
  if (h > 0) return `${h}h`;
  return `${rem}m`;
};

interface Props {
  data: Record<string, TimeblockTask[]>;
  onChange: (data: Record<string, TimeblockTask[]>) => void;
}

export function TimeblockView({ data, onChange }: Props) {
  const dateKey = todayKey();
  const [_tick, setTick] = useState(0);
  const [newName, setNewName] = useState('');
  const [newEst, setNewEst] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const tasks: TimeblockTask[] = data[dateKey] ?? [];

  const setTasks = useCallback((fn: (prev: TimeblockTask[]) => TimeblockTask[]) => {
    const cur = data[dateKey] ?? [];
    const next = fn(cur);
    onChange({ ...data, [dateKey]: next });
  }, [data, dateKey, onChange]);

  const getElapsed = (t: TimeblockTask): number => {
    const base = t.elapsedMs || 0;
    if (t.running && t.runningStartedAt) return base + (Date.now() - t.runningStartedAt);
    return base;
  };

  /* ── actions ── */
  const addTask = () => {
    const name = newName.trim();
    if (!name) return;
    const estMs = parseEst(newEst);
    const task: TimeblockTask = {
      id: uid(), name, estMs,
      elapsedMs: 0, running: false, runningStartedAt: null,
      completed: false, subtasks: [],
    };
    setTasks(prev => [...prev, task]);
    setNewName('');
    setNewEst('');
    nameRef.current?.focus();
  };

  const startTask = useCallback((id: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) return { ...t, running: true, runningStartedAt: Date.now() };
      if (t.running && t.runningStartedAt) {
        return { ...t, running: false, runningStartedAt: null, elapsedMs: (t.elapsedMs || 0) + (Date.now() - t.runningStartedAt) };
      }
      return t;
    }));
  }, [setTasks]);

  const stopTask = useCallback((id: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id || !t.running) return t;
      const added = t.runningStartedAt ? Date.now() - t.runningStartedAt : 0;
      return { ...t, running: false, runningStartedAt: null, elapsedMs: (t.elapsedMs || 0) + added };
    }));
  }, [setTasks]);

  const updateTask = useCallback((id: string, changes: Partial<TimeblockTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
  }, [setTasks]);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, [setTasks]);

  const addSubtask = useCallback((taskId: string, content: string) => {
    if (!content.trim()) return;
    const sub: TimeblockSubtask = { id: uid(), content: content.trim(), completed: false };
    setTasks(prev => prev.map(t => t.id !== taskId ? t : { ...t, subtasks: [...(t.subtasks || []), sub] }));
  }, [setTasks]);

  const updateSubtask = useCallback((taskId: string, subId: string, changes: Partial<TimeblockSubtask>) => {
    setTasks(prev => prev.map(t => t.id !== taskId ? t : {
      ...t, subtasks: (t.subtasks || []).map(s => s.id === subId ? { ...s, ...changes } : s),
    }));
  }, [setTasks]);

  const deleteSubtask = useCallback((taskId: string, subId: string) => {
    setTasks(prev => prev.map(t => t.id !== taskId ? t : {
      ...t, subtasks: (t.subtasks || []).filter(s => s.id !== subId),
    }));
  }, [setTasks]);

  /* ── totals ── */
  const activeTask = tasks.find(t => t.running);
  const totalEstMs = tasks.reduce((s, t) => s + (t.estMs || 0), 0);
  const totalActMs = tasks.reduce((s, t) => s + getElapsed(t), 0);
  const totalDone = tasks.filter(t => t.completed).length;
  const isOver = totalEstMs > 0 && totalActMs > totalEstMs;

  const activeElapsed = activeTask ? getElapsed(activeTask) : 0;
  const activeEst = activeTask?.estMs || 0;
  const activeRemain = activeEst > 0 ? activeEst - activeElapsed : null;
  const activeOver = activeRemain !== null && activeRemain < 0;

  const maxMs = Math.max(totalEstMs, totalActMs, 1);
  const estBarW = totalEstMs > 0 ? Math.min(100, (totalEstMs / maxMs) * 100) : 0;
  const actBarW = totalEstMs > 0
    ? Math.min(100, (Math.min(totalActMs, totalEstMs) / totalEstMs) * 100)
    : Math.min(100, (totalActMs / maxMs) * 100);
  const overBarW = isOver ? Math.min(100, ((totalActMs - totalEstMs) / totalEstMs) * 100) : 0;

  const allSubs = tasks.flatMap(t => t.subtasks || []);
  const doneSubs = allSubs.filter(s => s.completed).length;

  return (
    <div className="tb-shell">
      {/* ── Totals bar ── */}
      <div className="tb-totals">
        <div className="tb-active">
          {activeTask && <div className="tb-active-dot" />}
          <div className="tb-active-label">{activeTask ? 'active task' : 'no active task'}</div>
          <div className={`tb-active-time ${!activeTask ? 'idle' : activeOver ? 'over' : 'running'}`}>
            {activeTask
              ? (activeRemain !== null ? fmtMs(Math.abs(activeRemain)) : fmtMs(activeElapsed))
              : '--:--'}
          </div>
          {activeTask && !activeOver && (
            <div className="tb-active-name">{activeTask.name}</div>
          )}
          {activeTask && activeOver && (
            <div className="tb-overtime-badge">+{fmtMs(Math.abs(activeRemain!))} over</div>
          )}
        </div>

        <div className="tb-accum">
          {totalEstMs > 0 && (
            <div className="tb-accum-row">
              <span className="tb-accum-label">estimated</span>
              <div className="tb-bar-track">
                <div className="tb-bar-fill tb-bar-est" style={{ width: estBarW + '%' }} />
              </div>
              <span className="tb-accum-val">{fmtDur(totalEstMs)}</span>
            </div>
          )}
          <div className="tb-accum-row">
            <span className="tb-accum-label">actual</span>
            <div className="tb-bar-track">
              <div className={`tb-bar-fill tb-bar-act${isOver ? ' over' : ''}`} style={{ width: actBarW + '%' }} />
            </div>
            <span className={`tb-accum-val${isOver ? ' over' : ''}`}>{fmtDur(totalActMs)}</span>
          </div>
          {overBarW > 0 && (
            <div className="tb-accum-row">
              <span className="tb-accum-label over">overtime</span>
              <div className="tb-bar-track">
                <div className="tb-bar-fill tb-bar-over" style={{ width: overBarW + '%' }} />
              </div>
              <span className="tb-accum-val over">+{fmtDur(totalActMs - totalEstMs)}</span>
            </div>
          )}
          {tasks.length === 0 && (
            <span className="tb-accum-hint">Add tasks — estimated vs. actual time will appear here</span>
          )}
        </div>

        <div className="tb-counts">
          <div className="tb-count-row">
            <span className="tb-count-label">tasks</span>
            <span className={`tb-count-val${totalDone === tasks.length && tasks.length > 0 ? ' done' : ''}`}>
              {totalDone}/{tasks.length}
            </span>
          </div>
          {allSubs.length > 0 && (
            <div className="tb-count-row">
              <span className="tb-count-label">subtasks</span>
              <span className={`tb-count-val${doneSubs === allSubs.length && allSubs.length > 0 ? ' done' : ''}`}>
                {doneSubs}/{allSubs.length}
              </span>
            </div>
          )}
          {tasks.length > 0 && (
            <div className="tb-count-row">
              <span className="tb-count-label">progress</span>
              <span className="tb-count-val progress">
                {Math.round((totalDone / tasks.length) * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Add task bar ── */}
      <form className="tb-add-bar" onSubmit={e => { e.preventDefault(); addTask(); }}>
        <input
          ref={nameRef}
          className="tb-add-input"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Add a task…"
        />
        <div className="tb-add-sep" />
        <div className="tb-add-est">
          <span className="tb-add-est-label">est.</span>
          <input
            className="tb-est-field"
            value={newEst}
            onChange={e => setNewEst(e.target.value)}
            placeholder="30m"
            title="30m · 1h · 1h30m · 1:30"
          />
        </div>
        <button type="submit" className="tb-add-btn">+ Add</button>
      </form>

      {/* ── Task list ── */}
      <div className="tb-task-list">
        {tasks.length === 0 && (
          <div className="tb-empty">No tasks yet.<br />Type a task name above and press Enter.</div>
        )}
        {tasks.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            getElapsed={getElapsed}
            onStart={() => startTask(task.id)}
            onStop={() => stopTask(task.id)}
            onUpdate={ch => updateTask(task.id, ch)}
            onDelete={() => deleteTask(task.id)}
            onAddSubtask={c => addSubtask(task.id, c)}
            onUpdateSubtask={(sid, ch) => updateSubtask(task.id, sid, ch)}
            onDeleteSubtask={sid => deleteSubtask(task.id, sid)}
          />
        ))}
      </div>
    </div>
  );
}

interface TaskRowProps {
  task: TimeblockTask;
  getElapsed: (t: TimeblockTask) => number;
  onStart: () => void;
  onStop: () => void;
  onUpdate: (ch: Partial<TimeblockTask>) => void;
  onDelete: () => void;
  onAddSubtask: (content: string) => void;
  onUpdateSubtask: (subId: string, ch: Partial<TimeblockSubtask>) => void;
  onDeleteSubtask: (subId: string) => void;
}

function TaskRow({ task, getElapsed, onStart, onStop, onUpdate, onDelete, onAddSubtask, onUpdateSubtask, onDeleteSubtask }: TaskRowProps) {
  const [newSub, setNewSub] = useState('');
  const [subFocused, setSubFocused] = useState(false);
  const estRef = useRef<HTMLInputElement>(null);

  const elapsed = getElapsed(task);
  const estMs = task.estMs || 0;
  const remain = estMs > 0 ? estMs - elapsed : null;
  const isOver = remain !== null && remain < 0;
  const isRunning = task.running;

  let progressPct = 0;
  let progressColor = 'var(--accent-primary)';
  if (estMs > 0) {
    progressPct = Math.min(100, (elapsed / estMs) * 100);
    if (isOver) { progressPct = 100; progressColor = 'rgba(252,163,36,0.9)'; }
    else if (progressPct > 80) progressColor = 'rgba(252,205,56,0.85)';
  }

  let timerClass = 'zero';
  let timerStr = '--:--';
  if (elapsed > 0 || isRunning) {
    timerStr = fmtMs(elapsed);
    timerClass = isRunning ? (isOver ? 'running-over' : 'running-up') : 'stopped';
  }

  const handleEstBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const ms = parseEst(e.target.value);
    onUpdate({ estMs: ms });
    e.target.value = fmtEst(ms);
  };

  const handleSubKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onAddSubtask(newSub);
      setNewSub('');
    }
  };

  return (
    <div className={`tb-task-row${isRunning ? ' is-active' : ''}${task.completed ? ' is-done' : ''}`}>
      <div className="tb-check-col" onClick={() => onUpdate({ completed: !task.completed })}>
        <div className={`tb-check${task.completed ? ' done' : ''}`}>{task.completed ? '✓' : ''}</div>
      </div>

      <div className="tb-name-col">
        <input
          className={`tb-name-input${task.completed ? ' done' : ''}`}
          value={task.name}
          placeholder="Task name…"
          onChange={e => onUpdate({ name: e.target.value })}
        />
        <div className="tb-subtasks">
          {(task.subtasks || []).map(s => (
            <div key={s.id} className="tb-subtask-row">
              <div className={`tb-sub-check${s.completed ? ' done' : ''}`}
                onClick={() => onUpdateSubtask(s.id, { completed: !s.completed })}>
                {s.completed ? '✓' : ''}
              </div>
              <input
                className={`tb-sub-input${s.completed ? ' done' : ''}`}
                value={s.content}
                placeholder="Subtask…"
                onChange={e => onUpdateSubtask(s.id, { content: e.target.value })}
              />
              <button className="tb-sub-del" onClick={() => onDeleteSubtask(s.id)}>×</button>
            </div>
          ))}
          <input
            className="tb-sub-input tb-sub-add"
            style={{ opacity: subFocused ? 1 : 0, marginLeft: 17 }}
            value={newSub}
            onChange={e => setNewSub(e.target.value)}
            onFocus={() => setSubFocused(true)}
            onBlur={() => setSubFocused(false)}
            onKeyDown={handleSubKey}
            placeholder="+ subtask…"
          />
        </div>
      </div>

      <div className="tb-timer-col">
        <span className={`tb-elapsed ${timerClass}`}>{timerStr}</span>
        {estMs > 0 && remain !== null && (
          <div className="tb-countdown">
            {!isOver
              ? <><span className="tb-cd-label">left</span><span className="tb-cd-time">{fmtMs(remain)}</span></>
              : <span className="tb-cd-over">+{fmtMs(Math.abs(remain))} over</span>
            }
          </div>
        )}
      </div>

      <div className="tb-est-col">
        <input
          ref={estRef}
          className="tb-est-input"
          defaultValue={fmtEst(task.estMs)}
          key={task.id + '_est'}
          onBlur={handleEstBlur}
          placeholder="est."
          title="30m · 1h · 1h30m"
        />
      </div>

      <div className="tb-actions-col">
        {!task.completed && (
          isRunning
            ? <button className="tb-play-btn stop" onClick={onStop} title="Stop">■</button>
            : <button className="tb-play-btn play" onClick={onStart} title="Start">▶</button>
        )}
        <button className="tb-del-btn" onClick={onDelete} title="Delete">×</button>
      </div>

      {estMs > 0 && (
        <div className="tb-progress-bar">
          <div className="tb-progress-fill" style={{ width: progressPct + '%', background: progressColor }} />
        </div>
      )}
    </div>
  );
}
