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

function playCompletionTone() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch (_) {}
}

function offsetDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`;
}

function fmtViewDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === todayKey()) return 'today';
  if (dt.toDateString() === yesterday.toDateString()) return 'yesterday';
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const CIRC = 2 * Math.PI * 52;

interface Props {
  data: Record<string, TimeblockTask[]>;
  onChange: (data: Record<string, TimeblockTask[]>) => void;
}

export function TimeblockView({ data, onChange }: Props) {
  const [viewDate, setViewDate] = useState<string>(todayKey);
  const dateKey = viewDate;
  const isToday = viewDate === todayKey();
  const [_tick, setTick] = useState(0);
  const [newName, setNewName] = useState('');
  const [newEst, setNewEst] = useState('');
  const [mode, setMode] = useState<'gather' | 'execute'>('gather');
  const [estimatorOpen, setEstimatorOpen] = useState(false);
  const [estimatorInput, setEstimatorInput] = useState('');
  const [estimatorLoading, setEstimatorLoading] = useState(false);
  const [estimatorResult, setEstimatorResult] = useState<{ est: string; reason: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const completedTonesRef = useRef<Set<string>>(new Set());
  const initialModeSet = useRef(false);

  const tasks: TimeblockTask[] = data[dateKey] ?? [];

  useEffect(() => {
    if (!initialModeSet.current) {
      initialModeSet.current = true;
      if (tasks.length > 0) setMode('execute');
    }
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setTick(t => t + 1);
      const currentTasks: TimeblockTask[] = data[dateKey] ?? [];
      currentTasks.forEach(t => {
        if (!t.running || !t.estMs || !t.runningStartedAt) return;
        const elapsed = (t.elapsedMs || 0) + (Date.now() - t.runningStartedAt);
        if (t.estMs - elapsed <= 0 && !completedTonesRef.current.has(t.id)) {
          completedTonesRef.current.add(t.id);
          playCompletionTone();
        }
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [data, dateKey]);

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
    completedTonesRef.current.delete(id);
  }, [setTasks]);

  const updateTask = useCallback((id: string, changes: Partial<TimeblockTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
    if (changes.completed === true) completedTonesRef.current.delete(id);
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

  /* ── done by ── */
  const remainingEstMs = Math.max(0, totalEstMs - totalActMs);
  const doneByStr = (totalEstMs > 0 && remainingEstMs > 0)
    ? new Date(Date.now() + remainingEstMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

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

  /* ── carry forward ── */
  const uncompletedTasks = tasks.filter(t => !t.completed);
  const showCarryForward = !isToday && uncompletedTasks.length > 0;
  function handleCarryForward() {
    const todayStr = todayKey();
    const todayTasks = data[todayStr] ?? [];
    const carried = uncompletedTasks.map(t => ({
      ...t, id: uid(), elapsedMs: 0, running: false as const, runningStartedAt: null, completed: false,
    }));
    onChange({ ...data, [todayStr]: [...todayTasks, ...carried] });
    setViewDate(todayStr);
  }

  /* ── estimator ── */
  async function runEstimate() {
    if (!estimatorInput.trim() || estimatorLoading) return;
    setEstimatorLoading(true); setEstimatorResult(null);
    try {
      const raw = await (window as any).claude.complete({
        messages: [{ role: 'user', content: `You are a realistic time estimation assistant for a productivity app for neurodivergent people.\nTask description: "${estimatorInput}"\nReturn ONLY a JSON object, no markdown:\n{ "est": "45m", "reason": "Brief honest reason under 80 chars" }\nRules: est format: "15m","30m","1h","1h30m","2h". Err toward more time.` }]
      });
      setEstimatorResult(JSON.parse(raw.replace(/```json|```/g, '').trim()));
    } catch (e) { console.error('Estimate failed:', e); }
    finally { setEstimatorLoading(false); }
  }

  function acceptEstimate() {
    if (!estimatorResult) return;
    setNewEst(estimatorResult.est);
    if (!newName && estimatorInput.trim()) setNewName(estimatorInput.trim());
    setEstimatorOpen(false); setEstimatorInput(''); setEstimatorResult(null);
    nameRef.current?.focus();
  }

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
          {totalEstMs > 0 && doneByStr && (
            <div className="tb-accum-row tb-doneby-row">
              <span className="tb-accum-label">done by</span>
              <span className="tb-doneby-time">{doneByStr}</span>
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
          <button
            className={`tb-mode-toggle ${mode === 'gather' ? 'gather' : 'execute'}`}
            onClick={() => setMode(m => m === 'gather' ? 'execute' : 'gather')}
            title={mode === 'gather' ? 'Switch to execute mode' : 'Back to planning'}
          >
            {mode === 'gather' ? '✦ plan' : '▶ working'}
          </button>
        </div>
      </div>

      {/* ── Date nav ── */}
      <div className="tb-date-nav">
        <button className="tb-date-arrow" onClick={() => setViewDate(d => offsetDate(d, -1))} title="Previous day">‹</button>
        <div className="tb-date-center">
          <span className="tb-date-label">{fmtViewDate(viewDate)}</span>
          {!isToday && (
            <button className="tb-date-today" onClick={() => setViewDate(todayKey())}>today</button>
          )}
        </div>
        <button className="tb-date-arrow right" onClick={() => setViewDate(d => offsetDate(d, 1))} disabled={isToday} title="Next day">›</button>
      </div>

      {/* ── Mode content ── */}
      {mode === 'gather' ? (
        <GatherPanel
          tasks={tasks}
          onAddTasks={newTasks => { setTasks(prev => [...prev, ...newTasks]); setMode('execute'); }}
        />
      ) : (
        <>
      {activeTask && (
        <ActiveHero
          task={activeTask}
          elapsed={activeElapsed}
          remain={activeRemain}
          isOver={activeOver}
          onStop={() => stopTask(activeTask.id)}
        />
      )}

      {/* ── Estimator ── */}
      <div className={`tb-estimator ${estimatorOpen ? 'open' : ''}`}>
        <button className="tb-estimator-toggle"
          onClick={() => setEstimatorOpen(o => !o)}
          title="Estimate how long a task will take">
          {estimatorOpen ? '▾ estimator' : '▸ not sure how long?'}
        </button>
        {estimatorOpen && (
          <div className="tb-estimator-body">
            <div className="tb-estimator-input-row">
              <input className="tb-estimator-input" value={estimatorInput}
                onChange={e => setEstimatorInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') runEstimate(); }}
                placeholder="Describe the task…" disabled={estimatorLoading} />
              <button className="tb-estimator-btn" onClick={runEstimate}
                disabled={!estimatorInput.trim() || estimatorLoading}>
                {estimatorLoading ? '…' : 'estimate'}
              </button>
            </div>
            {estimatorResult && (
              <div className="tb-estimator-result">
                <span className="tb-estimator-est">{estimatorResult.est}</span>
                <span className="tb-estimator-reason">{estimatorResult.reason}</span>
                <button className="tb-estimator-accept" onClick={acceptEstimate}>use this →</button>
              </div>
            )}
          </div>
        )}
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
          {showCarryForward && (
            <div className="tb-carry-banner">
              <span className="tb-carry-label">{uncompletedTasks.length} task{uncompletedTasks.length !== 1 ? 's' : ''} unfinished</span>
              <button className="tb-carry-btn" onClick={handleCarryForward}>carry forward to today →</button>
            </div>
          )}
          </div>
        </>
      )}
    </div>
  );
}

interface GatherPanelProps {
  tasks: TimeblockTask[];
  onAddTasks: (tasks: TimeblockTask[]) => void;
}

function GatherPanel({ tasks, onAddTasks }: GatherPanelProps) {
  const [dump, setDump] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<{ name: string; est: string }[] | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleOrganize() {
    if (!dump.trim() || loading) return;
    setLoading(true); setParsed(null);
    try {
      const raw = await (window as any).claude.complete({
        messages: [{ role: 'user', content: `You are a task organizer for a neurodivergent productivity app. The user has written a brain dump below.

Extract every distinct actionable task from this text. For each task, provide a short clean name and a realistic time estimate.

Brain dump:
---
${dump}
---

Return ONLY a JSON array. No markdown, no explanation, no preamble. Format:
[
  { "name": "Task name", "est": "30m" },
  { "name": "Another task", "est": "1h" }
]

Rules:
- est format: "15m", "30m", "1h", "1h30m" — always include a unit
- Keep task names concise (under 60 chars) but specific
- Maximum 12 tasks
- Return ONLY valid JSON array, nothing else` }]
      });
      setParsed(JSON.parse(raw.replace(/```json|```/g, '').trim()));
    } catch (e) { console.error('Organize failed:', e); }
    finally { setLoading(false); }
  }

  function handleLetSGo() {
    if (!parsed || parsed.length === 0) return;
    onAddTasks(parsed.map(p => ({
      id: uid(), name: p.name, estMs: parseEst(p.est),
      elapsedMs: 0, running: false, runningStartedAt: null,
      completed: false, subtasks: [],
    })));
  }

  return (
    <div className="tb-gather-panel">
      <div className="tb-gather-header">
        <span className="tb-gather-title">brain dump</span>
        {tasks.length > 0 && (
          <span className="tb-gather-existing">{tasks.length} task{tasks.length !== 1 ? 's' : ''} already queued</span>
        )}
      </div>
      <textarea ref={textareaRef} className="tb-gather-textarea"
        value={dump} onChange={e => setDump(e.target.value)}
        placeholder={"Just type. Don't organize.\n\nEverything on your mind, messy is fine."}
        spellCheck={true} disabled={loading}
      />
      <div className="tb-gather-actions">
        <button className="tb-gather-clear"
          onClick={() => { setDump(''); setParsed(null); }}
          disabled={!dump && !parsed}>clear</button>
        <button className={`tb-gather-organize ${loading ? 'loading' : ''}`}
          onClick={handleOrganize} disabled={!dump.trim() || loading}>
          {loading ? 'organizing…' : 'Organize ✶'}
        </button>
      </div>
      {parsed && parsed.length > 0 && (
        <div className="tb-gather-results">
          <div className="tb-gather-results-header">
            <span className="tb-gather-results-title">{parsed.length} tasks found</span>
            <button className="tb-gather-letsgo" onClick={handleLetSGo}>Let's go ✶</button>
          </div>
          {parsed.map((p, i) => (
            <div key={i} className="tb-gather-item">
              <span className="tb-gather-item-name">{p.name}</span>
              <span className="tb-gather-item-est">{p.est}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ActiveHeroProps {
  task: TimeblockTask;
  elapsed: number;
  remain: number | null;
  isOver: boolean;
  onStop: () => void;
}

function ActiveHero({ task, elapsed, remain, isOver, onStop }: ActiveHeroProps) {
  const estMs = task.estMs || 0;
  let dashOffset: number;
  let arcColor: string;
  if (estMs > 0 && !isOver) {
    const fraction = Math.min(1, elapsed / estMs);
    dashOffset = Math.max(0, Math.min(CIRC, CIRC * (1 - fraction)));
    arcColor = 'rgba(45, 212, 191, 0.85)';
  } else {
    dashOffset = 0;
    arcColor = 'rgba(252, 163, 36, 0.85)';
  }
  let timeStr: string;
  if (remain !== null && !isOver) timeStr = fmtMs(remain);
  else if (isOver && remain !== null) timeStr = '+' + fmtMs(Math.abs(remain));
  else timeStr = fmtMs(elapsed);

  const endsAt = estMs > 0
    ? new Date(Date.now() + Math.max(0, remain ?? 0))
        .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className="tb-active-hero">
      <div className="tb-hero-arc-wrapper">
        <svg className="tb-hero-arc-svg" width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none"
            stroke="rgba(180,130,220,0.12)" strokeWidth="6" />
          <circle cx="60" cy="60" r="52" fill="none"
            stroke={arcColor} strokeWidth="6"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="tb-hero-arc-inner">
          <span className={`tb-hero-time ${isOver ? 'over' : 'running'}`}>{timeStr}</span>
        </div>
      </div>
      <div className="tb-hero-name">{task.name}</div>
      {endsAt && <div className="tb-hero-endsat">ends at {endsAt}</div>}
      <button className="tb-hero-stop" onClick={onStop}>■ Stop</button>
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
  const [flashing, setFlashing] = useState(false);
  const estRef = useRef<HTMLInputElement>(null);
  const prevRemainRef = useRef<number | null>(null);

  const elapsed = getElapsed(task);
  const estMs = task.estMs || 0;
  const remain = estMs > 0 ? estMs - elapsed : null;
  const isOver = remain !== null && remain < 0;
  const isRunning = task.running;

  useEffect(() => {
    if (task.running && remain !== null && remain <= 0 && prevRemainRef.current !== null && prevRemainRef.current > 0) {
      setFlashing(true);
      setTimeout(() => setFlashing(false), 1200);
    }
    prevRemainRef.current = remain;
  }, [remain, task.running]);

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
    <div className={`tb-task-row${isRunning ? ' is-active' : ''}${task.completed ? ' is-done' : ''}${flashing ? ' tb-flash' : ''}`}>
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
