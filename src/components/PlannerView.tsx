import React, { useState, useEffect, useRef, useCallback } from 'react';
import { load } from '@tauri-apps/plugin-store';
import { usePlanner } from '../hooks/usePlanner';
import type { AccentColor, PlannerBlock, Task, GoalEntry, PlannerSubtype } from '../types';
import type { Settings } from '../hooks/useSettings';
import { IntegratedSchedulePanel } from './IntegratedSchedulePanel';
import { GoalsView } from './GoalsView';
import { accentToHex } from '../utils/accentToHex';
import '../styles/planner.css';

const COLORS: AccentColor[] = ['plum', 'rose', 'peach', 'orange', 'yellow', 'blue', 'ghost'];

// Hours 6–26 (26 = 2am next day) for the timeline grid
const TIMELINE_START = 6;
const TIMELINE_END = 26;
const HOURS = Array.from(
  { length: TIMELINE_END - TIMELINE_START + 1 },
  (_, i) => TIMELINE_START + i
);

function hourToPercent(h: number): number {
  return ((h - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * 100;
}

function minutesToPercent(totalMinutes: number): number {
  const startMin = TIMELINE_START * 60;
  const endMin = TIMELINE_END * 60;
  return Math.max(0, Math.min(100, (totalMinutes - startMin) / (endMin - startMin) * 100));
}

function formatHour(h: number): string {
  const actual = h % 24;
  if (actual === 0) return '12 am';
  if (actual === 12) return '12 pm';
  if (actual < 12) return `${actual} am`;
  return `${actual - 12} pm`;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDisplayDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getDisplayMonth(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function getDayOfWeek(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function getDayNumber(dateStr: string) {
  const [, , d] = dateStr.split('-').map(Number);
  return d;
}

function getWeekDays(centerDateStr: string) {
  const [y, m, d] = centerDateStr.split('-').map(Number);
  const center = new Date(y, m - 1, d);
  const dayOfWeek = center.getDay();
  const startOfWeek = new Date(center);
  startOfWeek.setDate(center.getDate() - dayOfWeek);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const dDate = new Date(startOfWeek);
    dDate.setDate(startOfWeek.getDate() + i);
    days.push(formatDate(dDate));
  }
  return days;
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function roundToNearest15(date: Date): string {
  const h = date.getHours();
  let m = Math.round(date.getMinutes() / 15) * 15;
  let adjustedH = h;
  if (m === 60) { m = 0; adjustedH = (h + 1) % 24; }
  return `${String(adjustedH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Block editor sub-component (avoids contentEditable/re-render issues) ──
interface BlockEditorProps {
  block: PlannerBlock;
  onUpdate: (changes: Partial<PlannerBlock>) => void;
  onClose: () => void;
  allBlocks: PlannerBlock[];
  onTimeChange: (id: string, field: 'start' | 'end', val: string, all: PlannerBlock[]) => void;
}

function BlockEditor({ block, onUpdate, onClose, allBlocks, onTimeChange }: BlockEditorProps) {
  const labelRef = useRef<HTMLDivElement>(null);
  const labelTextRef = useRef(block.label);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; });

  const [subtaskInput, setSubtaskInput] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (labelRef.current) {
      labelRef.current.textContent = block.label;
      labelRef.current.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(labelRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    return () => {
      onUpdateRef.current({ label: labelTextRef.current.trim() });
    };
  }, []);

  const subtasks = block.tasks ?? [];

  const addSubtask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const newTask: Task = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      content: trimmed,
      type: 'checkbox',
      completed: false,
      createdAt: Date.now(),
    };
    onUpdate({ tasks: [...subtasks, newTask] });
    setSubtaskInput('');
    subtaskInputRef.current?.focus();
  };

  const toggleSubtask = (id: string) => {
    onUpdate({ tasks: subtasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t) });
  };

  const removeSubtask = (id: string) => {
    onUpdate({ tasks: subtasks.filter(t => t.id !== id) });
  };

  return (
    <div className="planner-block-editor" onClick={e => e.stopPropagation()}>
      {/* Title */}
      <div
        ref={labelRef}
        className="planner-block-editor__label"
        contentEditable
        suppressContentEditableWarning
        onInput={() => { labelTextRef.current = labelRef.current?.textContent ?? ''; }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); subtaskInputRef.current?.focus(); }
        }}
      />

      {/* Times */}
      <div className="planner-block-editor__times">
        <input
          type="time"
          value={block.startTime}
          onChange={e => onTimeChange(block.id, 'start', e.target.value, allBlocks)}
        />
        <span className="planner-block-editor__times-sep">–</span>
        <input
          type="time"
          value={block.endTime}
          onChange={e => onTimeChange(block.id, 'end', e.target.value, allBlocks)}
        />
      </div>

      {/* Subtasks */}
      <div className="planner-subtasks">
        {subtasks.map(task => (
          <div key={task.id} className="planner-subtask-row">
            <button
              className={`planner-subtask-check ${task.completed ? 'planner-subtask-check--done' : ''}`}
              onClick={() => toggleSubtask(task.id)}
            >
              {task.completed ? '✓' : '○'}
            </button>
            <span className={`planner-subtask-text ${task.completed ? 'planner-subtask-text--done' : ''}`}>
              {task.content}
            </span>
            <button
              className="planner-subtask-remove"
              onClick={() => removeSubtask(task.id)}
            >×</button>
          </div>
        ))}
        <div className="planner-subtask-row planner-subtask-add-row">
          <span className="planner-subtask-add-bullet">+</span>
          <input
            ref={subtaskInputRef}
            className="planner-subtask-input"
            type="text"
            placeholder="add subtask…"
            value={subtaskInput}
            onChange={e => setSubtaskInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                addSubtask(subtaskInput);
              }
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            }}
          />
        </div>
      </div>

      {/* Color picker */}
      <div className="planner-color-picker">
        {COLORS.map(c => (
          <button
            key={c}
            className={`planner-color-dot ${block.color === c ? 'planner-color-dot--selected' : ''}`}
            style={{ '--dot-color': accentToHex(c) } as React.CSSProperties}
            onClick={() => onUpdate({ color: c })}
            title={c}
          />
        ))}
      </div>
    </div>
  );
}

interface Props {
  settings: Settings;
  pageId: string;
  subtype?: PlannerSubtype;
  goals?: GoalEntry[];
  onGoalsChange?: (goals: GoalEntry[]) => void;
}

export function PlannerView({ settings, pageId, subtype = 'schedule', goals = [], onGoalsChange }: Props) {
  const { ready, addBlock, updateBlock, batchUpdateBlocks, deleteBlock, getBlocksForDate } = usePlanner(pageId);
  const [currentDate, setCurrentDate] = useState(() => formatDate(new Date()));
  const [isToday, setIsToday] = useState(true);
  const [currentMinutes, setCurrentMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  // Quick-add state
  const [quickAddValue, setQuickAddValue] = useState('');
  const quickAddRef = useRef<HTMLInputElement>(null);

  // Expanded block state
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const expandedCardRef = useRef<HTMLDivElement | null>(null);

  // Pending label after addBlock (since addBlock doesn't return the id)
  const pendingLabel = useRef<string | null>(null);
  const pendingExpand = useRef(false);

  // Energy rating state (per date, loaded from planner-meta.json)
  const [energyRatings, setEnergyRatings] = useState<Record<string, number>>({});

  // All-day items (per date, stored in planner-meta.json)
  interface AllDayItem { id: string; text: string; done: boolean; }
  const [allDayItems, setAllDayItems] = useState<Record<string, AllDayItem[]>>({});
  const [allDayInput, setAllDayInput] = useState('');
  const allDayInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const todayStr = formatDate(new Date());
    setIsToday(currentDate === todayStr);
  }, [currentDate]);

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentMinutes(now.getHours() * 60 + now.getMinutes());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load energy rating + all-day items when date changes
  useEffect(() => {
    (async () => {
      try {
        const store = await load('planner-meta.json', { autoSave: false } as any);
        if (energyRatings[currentDate] === undefined) {
          const val = await store.get<number>(`energy-${currentDate}`);
          setEnergyRatings(prev => ({ ...prev, [currentDate]: val ?? 0 }));
        }
        if (allDayItems[currentDate] === undefined) {
          const items = await store.get<AllDayItem[]>(`allday-${currentDate}`);
          setAllDayItems(prev => ({ ...prev, [currentDate]: items ?? [] }));
        }
      } catch {
        // ignore
      }
    })();
  }, [currentDate]);

  const saveAllDayItems = async (date: string, items: AllDayItem[]) => {
    try {
      const store = await load('planner-meta.json', { autoSave: false } as any);
      await store.set(`allday-${date}`, items);
      await store.save();
    } catch (err) {
      console.error('[PlannerView] allday save error:', err);
    }
  };

  const todayAllDay = allDayItems[currentDate] ?? [];

  const addAllDayItem = () => {
    const text = allDayInput.trim();
    if (!text) return;
    const item: AllDayItem = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, done: false };
    const next = [...todayAllDay, item];
    setAllDayItems(prev => ({ ...prev, [currentDate]: next }));
    saveAllDayItems(currentDate, next);
    setAllDayInput('');
    allDayInputRef.current?.focus();
  };

  const toggleAllDayItem = (id: string) => {
    const next = todayAllDay.map(i => i.id === id ? { ...i, done: !i.done } : i);
    setAllDayItems(prev => ({ ...prev, [currentDate]: next }));
    saveAllDayItems(currentDate, next);
  };

  const removeAllDayItem = (id: string) => {
    const next = todayAllDay.filter(i => i.id !== id);
    setAllDayItems(prev => ({ ...prev, [currentDate]: next }));
    saveAllDayItems(currentDate, next);
  };

  const saveEnergy = async (date: string, rating: number) => {
    setEnergyRatings(prev => ({ ...prev, [date]: rating }));
    try {
      const store = await load('planner-meta.json', { autoSave: false } as any);
      await store.set(`energy-${date}`, rating);
      await store.save();
    } catch (err) {
      console.error('[PlannerView] energy save error:', err);
    }
  };

  // Apply pending label or expand after addBlock
  const dailyBlocks = getBlocksForDate(currentDate);

  useEffect(() => {
    if (pendingLabel.current !== null) {
      const unlabeled = dailyBlocks.filter(b => b.label === '');
      if (unlabeled.length > 0) {
        const latest = unlabeled[unlabeled.length - 1];
        updateBlock(latest.id, { label: pendingLabel.current });
        pendingLabel.current = null;
      }
    }
    if (pendingExpand.current) {
      const unlabeled = dailyBlocks.filter(b => b.label === '');
      if (unlabeled.length > 0) {
        const latest = unlabeled[unlabeled.length - 1];
        setExpandedBlockId(latest.id);
        pendingExpand.current = false;
      }
    }
  }, [dailyBlocks]);

  // Collapse expanded card when clicking outside
  useEffect(() => {
    if (!expandedBlockId) return;
    const handleClick = (e: MouseEvent) => {
      if (expandedCardRef.current && !expandedCardRef.current.contains(e.target as Node)) {
        setExpandedBlockId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expandedBlockId]);

  // "/" shortcut to focus quick-add
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      quickAddRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const goToToday = () => setCurrentDate(formatDate(new Date()));
  const goPrevWeek = () => {
    const [y, m, d] = currentDate.split('-').map(Number);
    setCurrentDate(formatDate(new Date(y, m - 1, d - 7)));
  };
  const goNextWeek = () => {
    const [y, m, d] = currentDate.split('-').map(Number);
    setCurrentDate(formatDate(new Date(y, m - 1, d + 7)));
  };

  const handleQuickAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const label = quickAddValue.trim();
    if (!label) return;
    pendingLabel.current = label;
    addBlock(currentDate, roundToNearest15(new Date()), 60);
    setQuickAddValue('');
    quickAddRef.current?.focus();
  };

  const addBlockAtNow = () => {
    pendingExpand.current = true;
    addBlock(currentDate, roundToNearest15(new Date()), 60);
  };

  const minutesToTime = (m: number) => {
    m = Math.max(0, Math.min(23 * 60 + 59, m));
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const handleTimeChange = useCallback((id: string, field: 'start' | 'end', val: string, allBlocks: PlannerBlock[]) => {
    if (!val) return;
    const sorted = [...allBlocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    const idx = sorted.findIndex(b => b.id === id);
    if (idx === -1) return;

    const block = sorted[idx];
    const newMins = timeToMinutes(val);
    const updates: Array<{ id: string; changes: Partial<PlannerBlock> }> = [];

    if (field === 'start') {
      const oldStartMins = timeToMinutes(block.startTime);
      const oldEndMins = timeToMinutes(block.endTime);
      const delta = newMins - oldStartMins;
      if (delta === 0) return;

      const duration = Math.max(oldEndMins - oldStartMins, 15);
      const newEnd = minutesToTime(newMins + duration);
      updates.push({ id: block.id, changes: { startTime: val, endTime: newEnd } });

      if (idx > 0) {
        const prev = sorted[idx - 1];
        if (prev.endTime === block.startTime) {
          updates.push({ id: prev.id, changes: { endTime: val } });
        }
      }

      for (let j = idx + 1; j < sorted.length; j++) {
        const b = sorted[j];
        updates.push({
          id: b.id,
          changes: {
            startTime: minutesToTime(timeToMinutes(b.startTime) + delta),
            endTime:   minutesToTime(timeToMinutes(b.endTime)   + delta),
          },
        });
      }
    } else {
      const oldEndMins = timeToMinutes(block.endTime);
      const delta = newMins - oldEndMins;
      if (delta === 0) return;

      const minEnd = timeToMinutes(block.startTime) + 5;
      const clampedEnd = minutesToTime(Math.max(newMins, minEnd));
      const clampedDelta = timeToMinutes(clampedEnd) - oldEndMins;
      updates.push({ id: block.id, changes: { endTime: clampedEnd } });

      for (let j = idx + 1; j < sorted.length; j++) {
        const b = sorted[j];
        updates.push({
          id: b.id,
          changes: {
            startTime: minutesToTime(timeToMinutes(b.startTime) + clampedDelta),
            endTime:   minutesToTime(timeToMinutes(b.endTime)   + clampedDelta),
          },
        });
      }
    }

    batchUpdateBlocks(updates);
  }, [batchUpdateBlocks]);

  if (!ready) {
    return <div className="loading-hint">✦</div>;
  }

  // Goals subtype — completely different UI
  if (subtype === 'goals') {
    return (
      <GoalsView
        goals={goals}
        onChange={onGoalsChange ?? (() => {})}
      />
    );
  }

  const currentWeekDays = getWeekDays(currentDate);
  const totalBlocks = dailyBlocks.length;
  const completedBlocks = dailyBlocks.filter(b => b.completed).length;
  const progressPercent = totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 0;

  const calculateTotalMinutes = (blocks: PlannerBlock[]) => {
    let total = 0;
    for (const b of blocks) {
      const tStart = timeToMinutes(b.startTime);
      const tEnd = timeToMinutes(b.endTime);
      if (tEnd > tStart) total += tEnd - tStart;
    }
    return total;
  };
  const totalMin = calculateTotalMinutes(dailyBlocks);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  const nowHH = String(Math.floor(currentMinutes / 60)).padStart(2, '0');
  const nowMM = String(currentMinutes % 60).padStart(2, '0');
  const nowStr = `${nowHH}:${nowMM}`;

  const weekBlockCounts = currentWeekDays.reduce((acc, day) => {
    acc[day] = getBlocksForDate(day).length;
    return acc;
  }, {} as Record<string, number>);

  const weekStats = currentWeekDays.map(day => {
    const blocks = getBlocksForDate(day);
    const total = blocks.length;
    const done  = blocks.filter(b => b.completed).length;
    return { day, total, done, ratio: total > 0 ? done / total : 0 };
  });

  const weekMaxBlocks = Math.max(1, ...weekStats.map(s => s.total));

  const sortedDailyBlocks = [...dailyBlocks].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );

  // First incomplete block for today
  const firstBlock = sortedDailyBlocks.find(b => !b.completed);
  const firstBlockTime = firstBlock?.startTime ?? '—';

  // Energy rating for today
  const energyToday = energyRatings[currentDate] ?? 0;

  return (
    <div className="planner-container">
      {/* MAIN PANEL */}
      <div className="planner-main">
        <div className="planner-main-header">
          <h1 className="planner-day-title">{getDisplayDate(currentDate)}</h1>
          {isToday && (
            <span className="planner-now-badge">now {nowStr}</span>
          )}
        </div>

        {/* All-day / reminders strip */}
        <div className="planner-allday-section">
          <div className="planner-allday-header">
            <span className="planner-allday-label">all day</span>
            <input
              ref={allDayInputRef}
              className="planner-allday-input"
              type="text"
              placeholder="add a task or reminder…"
              value={allDayInput}
              onChange={e => setAllDayInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addAllDayItem(); }}
            />
          </div>
          {todayAllDay.length > 0 && (
            <div className="planner-allday-items">
              {todayAllDay.map(item => (
                <div key={item.id} className={`planner-allday-item ${item.done ? 'planner-allday-item--done' : ''}`}>
                  <button
                    className="planner-allday-check"
                    onClick={() => toggleAllDayItem(item.id)}
                    title={item.done ? 'Mark incomplete' : 'Mark done'}
                  >
                    {item.done ? '✓' : '○'}
                  </button>
                  <span className="planner-allday-text">{item.text}</span>
                  <button
                    className="planner-allday-remove"
                    onClick={() => removeAllDayItem(item.id)}
                    title="Remove"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick-add bar */}
        <div className="planner-quick-add-bar">
          <input
            ref={quickAddRef}
            className="planner-quick-add-input"
            type="text"
            placeholder="+ add block — type a name, hit Enter…"
            value={quickAddValue}
            onChange={e => setQuickAddValue(e.target.value)}
            onKeyDown={handleQuickAdd}
          />
          <button
            className="planner-quick-add-time-btn"
            onClick={addBlockAtNow}
            title="Add empty block at current time"
          >
            now
          </button>
        </div>

        {/* Scrollable timeline + blocks */}
        <div className="planner-scroll-area">
          {/* Timeline grid with hour lines + now-line */}
          <div className="planner-timeline-grid">
            {/* Hour grid lines */}
            {HOURS.map(h => (
              <div
                key={h}
                className="planner-hour-row"
                style={{ top: `${hourToPercent(h)}%` }}
              >
                {h % 2 === 0 && (
                  <span className="planner-hour-label">{formatHour(h)}</span>
                )}
                <div className="planner-hour-line" />
              </div>
            ))}

            {/* Now-line — absolutely positioned at the correct time */}
            {isToday && (
              <div
                className="planner-now-line"
                style={{ top: `${minutesToPercent(currentMinutes)}%` }}
              >
                <span className="planner-now-line-label">{nowStr}</span>
              </div>
            )}

            {/* Blocks — absolutely positioned over the grid */}
            <div className="planner-timeline-blocks">
              {dailyBlocks.length === 0 && (
                <div className="planner-empty">
                  No blocks scheduled. Type a name above and hit Enter, or press <em>now</em> to begin.
                </div>
              )}

              {sortedDailyBlocks.map(block => {
                const blockStartMin = timeToMinutes(block.startTime);
                const blockEndMin   = timeToMinutes(block.endTime);
                const topPct        = minutesToPercent(blockStartMin);
                const heightPct     = Math.max(0, minutesToPercent(blockEndMin) - topPct);
                const isCurrent     = isToday && currentMinutes >= blockStartMin && currentMinutes < blockEndMin;
                const isExpanded    = expandedBlockId === block.id;

                return (
                  <div
                    key={block.id}
                    ref={isExpanded ? expandedCardRef : undefined}
                    className={[
                      'planner-block-card',
                      `planner-block-card--${block.color}`,
                      block.completed ? 'planner-block-card--done' : '',
                      isCurrent ? 'planner-block-card--current' : '',
                      isExpanded ? 'planner-block-card--expanded' : '',
                    ].filter(Boolean).join(' ')}
                    style={{
                      position: 'absolute',
                      top: `${topPct}%`,
                      // When expanded, let the card grow freely; otherwise clamp to duration height
                      ...(isExpanded ? { minHeight: `${heightPct}%` } : { height: `max(48px, ${heightPct}%)` }),
                      left: '40px',
                      right: '8px',
                      zIndex: isExpanded ? 20 : 1,
                    }}
                    onClick={() => {
                      if (!isExpanded) setExpandedBlockId(block.id);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Escape') setExpandedBlockId(null);
                    }}
                  >
                    {/* Time row — always visible */}
                    <div className="planner-block-card__time">
                      {block.startTime} – {block.endTime}
                      {isCurrent && <span className="planner-current-indicator"> ● now</span>}
                    </div>
                    {/* Label — hidden when expanded (editor shows its own title) */}
                    {!isExpanded && (
                      <div className={`planner-block-card__label ${!block.label ? 'planner-block-card__label--empty' : ''}`}>
                        {block.label || 'Untitled block'}
                      </div>
                    )}

                    {/* Action buttons (hover) */}
                    <div className="planner-block-card__actions">
                      <button
                        className="planner-block-btn--check"
                        onClick={e => { e.stopPropagation(); updateBlock(block.id, { completed: !block.completed }); }}
                        title={block.completed ? 'Mark incomplete' : 'Mark complete'}
                      >✓</button>
                      <button
                        className="planner-block-btn--delete"
                        onClick={e => { e.stopPropagation(); deleteBlock(block.id); }}
                        title="Delete block"
                      >×</button>
                    </div>

                    {/* Expanded inline editor */}
                    {isExpanded && (
                      <BlockEditor
                        key={block.id}
                        block={block}
                        onUpdate={changes => updateBlock(block.id, changes)}
                        onClose={() => setExpandedBlockId(null)}
                        allBlocks={dailyBlocks}
                        onTimeChange={handleTimeChange}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Care schedule — caregiving subtype only */}
          {subtype === 'caregiving' && (
            <div className="planner-care-section">
              <div className="planner-care-divider">
                <span>care schedule</span>
              </div>
              <IntegratedSchedulePanel date={currentDate} />
            </div>
          )}
        </div>
      </div>

      {/* SIDEBAR */}
      <div className="planner-sidebar">
        <div className="planner-date-header">
          <h2 className="planner-month-title">{getDisplayMonth(currentDate)}</h2>
          <div className="planner-week-nav">
            <button className="planner-nav-btn" onClick={goPrevWeek} title="Previous week">‹</button>
            <button
              className={`planner-today-btn ${isToday ? 'is-today' : ''}`}
              onClick={goToToday}
              title="Go to today"
            >Today</button>
            <button className="planner-nav-btn" onClick={goNextWeek} title="Next week">›</button>
          </div>
        </div>

        <div className="planner-week-strip">
          {currentWeekDays.map(dayStr => {
            const isActive = dayStr === currentDate;
            const isTodayCell = dayStr === formatDate(new Date());
            const hasBlocks = weekBlockCounts[dayStr] > 0;
            return (
              <div
                key={dayStr}
                className={`planner-day-btn ${isActive ? 'active' : ''} ${isTodayCell ? 'today' : ''}`}
                onClick={() => setCurrentDate(dayStr)}
                title={dayStr}
              >
                <span className="day-name">{getDayOfWeek(dayStr)}</span>
                <span className="day-num">{getDayNumber(dayStr)}</span>
                {isActive && <div className="day-indicator" />}
                {hasBlocks && !isActive && <div className="day-block-dot" />}
              </div>
            );
          })}
        </div>

        <div className="planner-day-summary">
          {/* Weekly arc */}
          <div className="planner-week-arc">
            <span className="planner-week-arc-label">this week</span>
            <div className="planner-week-arc-bars">
              {weekStats.map(({ day, total, done, ratio }) => {
                const isActiveDay  = day === currentDate;
                const isTodayDay   = day === formatDate(new Date());
                const barHeightPct = total === 0
                  ? 0
                  : Math.max(12, Math.round((total / weekMaxBlocks) * 100));

                let barColor: string;
                if (total === 0) {
                  barColor = 'rgba(102,26,78,0.12)';
                } else if (ratio >= 1) {
                  barColor = 'rgba(90,142,252,0.75)';
                } else if (ratio >= 0.5) {
                  barColor = 'rgba(181,95,124,0.7)';
                } else {
                  barColor = 'rgba(181,95,124,0.35)';
                }

                return (
                  <button
                    key={day}
                    className={[
                      'planner-arc-col',
                      isActiveDay ? 'planner-arc-col--active' : '',
                      isTodayDay  ? 'planner-arc-col--today'  : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setCurrentDate(day)}
                    title={`${day}: ${done}/${total} blocks`}
                  >
                    <div className="planner-arc-bar-track">
                      <div
                        className="planner-arc-bar-fill"
                        style={{
                          height: `${barHeightPct}%`,
                          background: barColor,
                          boxShadow: ratio >= 1 ? '0 0 6px rgba(90,142,252,0.4)' : 'none',
                        }}
                      />
                    </div>
                    <span className="planner-arc-day-label">
                      {getDayOfWeek(day).charAt(0)}
                    </span>
                    {total > 0 && (
                      <span className="planner-arc-count">{total}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="planner-summary-divider" />

          {/* Daily stats */}
          <h3 className="summary-title">today</h3>

          <div className="summary-stat">
            <span className="stat-label">blocks</span>
            <span className="stat-value">{completedBlocks} / {totalBlocks} done</span>
          </div>

          <div className="summary-stat">
            <span className="stat-label">scheduled</span>
            <span className="stat-value">
              {hours > 0 ? `${hours}h ` : ''}
              {mins > 0 ? `${mins}m` : hours === 0 ? '—' : ''}
            </span>
          </div>

          {/* First block */}
          <div className="summary-stat">
            <span className="stat-label">first block</span>
            <span className="stat-value">{firstBlockTime}</span>
          </div>

          {/* Energy rating */}
          <div className="summary-stat">
            <span className="stat-label">energy</span>
            <div className="planner-energy-dots">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  className={`planner-energy-dot ${n <= energyToday ? 'planner-energy-dot--filled' : 'planner-energy-dot--empty'}`}
                  onClick={() => saveEnergy(currentDate, n === energyToday ? 0 : n)}
                  title={`Energy: ${n}`}
                />
              ))}
            </div>
          </div>

          {totalBlocks > 0 && (
            <>
              <div className="summary-progress">
                <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="summary-percent">{progressPercent}% complete</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
