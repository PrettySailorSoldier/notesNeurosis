import React, { useState, useEffect, useRef, useCallback } from 'react';
import { load } from '@tauri-apps/plugin-store';
import { usePlanner } from '../hooks/usePlanner';
import { usePlannerReminders, makeBlockReminder } from '../hooks/usePlannerReminders';
import { useSettings } from '../hooks/useSettings';
import type { AccentColor, PlannerBlock, Task, GoalEntry, PlannerSubtype, ReminderSound } from '../types';
import { IntegratedSchedulePanel } from './IntegratedSchedulePanel';
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

function roundToNextHalfHour(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  let newH = h;
  let newM: number;
  if (m < 30) {
    newM = 30;
  } else {
    newM = 0;
    newH = (h + 1) % 24;
  }
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * Given a sorted list of blocks, computes layout columns for overlapping
 * blocks. Returns a map of blockId → { col: number, totalCols: number }.
 * Non-overlapping blocks get col=0, totalCols=1 (full width).
 */
function computeOverlapColumns(
  blocks: PlannerBlock[]
): Map<string, { col: number; totalCols: number }> {
  const result = new Map<string, { col: number; totalCols: number }>();
  if (blocks.length === 0) return result;

  // Sort by start time
  const sorted = [...blocks].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );

  // Find overlap groups using a sweep
  const groups: PlannerBlock[][] = [];
  let currentGroup: PlannerBlock[] = [];
  let groupEnd = -1;

  for (const block of sorted) {
    const start = timeToMinutes(block.startTime);
    const end   = timeToMinutes(block.endTime);
    if (currentGroup.length === 0 || start < groupEnd) {
      currentGroup.push(block);
      groupEnd = Math.max(groupEnd, end);
    } else {
      groups.push(currentGroup);
      currentGroup = [block];
      groupEnd = end;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  for (const group of groups) {
    const n = group.length;
    group.forEach((block, i) => {
      result.set(block.id, { col: i, totalCols: n });
    });
  }

  return result;
}

/**
 * Parse natural time expressions from a string.
 * Supports: "9am", "9:30am", "14:00", "2pm", "930"
 * Returns HH:MM string or null if nothing found.
 * Also returns the cleaned label with the time token removed.
 */
function parseTimeFromText(text: string): {
  time: string | null;
  cleanedLabel: string;
} {
  // Patterns: 9am, 9:30am, 9:30pm, 14:30, 9:00
  const patterns = [
    // "9:30am" or "9:30pm"
    /\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i,
    // "9am" or "9pm"
    /\b(\d{1,2})\s*(am|pm)\b/i,
    // "14:30" or "09:00"
    /\b([01]?\d|2[0-3]):([0-5]\d)\b/,
    // "930" interpreted as 9:30 if 3-4 digits
    /\b([0-9]{3,4})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let hours = 0;
    let mins  = 0;
    const full = match[0];

    if (pattern === patterns[0]) {
      // "9:30am"
      hours = parseInt(match[1], 10);
      mins  = parseInt(match[2], 10);
      const meridiem = match[3].toLowerCase();
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
    } else if (pattern === patterns[1]) {
      // "9am"
      hours = parseInt(match[1], 10);
      const meridiem = match[2].toLowerCase();
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
    } else if (pattern === patterns[2]) {
      // "14:30"
      hours = parseInt(match[1], 10);
      mins  = parseInt(match[2], 10);
    } else {
      // "930" → 9:30
      const raw = match[1];
      if (raw.length === 3) {
        hours = parseInt(raw[0], 10);
        mins  = parseInt(raw.slice(1), 10);
      } else {
        hours = parseInt(raw.slice(0, 2), 10);
        mins  = parseInt(raw.slice(2), 10);
      }
      // Skip ambiguous 4-digit numbers that don't look like times
      if (hours > 23 || mins > 59) continue;
    }

    if (hours < 0 || hours > 23 || mins < 0 || mins > 59) continue;

    const time = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    const cleanedLabel = text.replace(full, '').replace(/\s{2,}/g, ' ').trim();
    return { time, cleanedLabel };
  }

  return { time: null, cleanedLabel: text };
}

const REMINDER_SOUNDS: { value: ReminderSound; label: string }[] = [
  { value: 'chime',    label: '🎵 Chime'    },
  { value: 'bell',     label: '🔔 Bell'     },
  { value: 'blip',     label: '📡 Blip'     },
  { value: 'soft_ding',label: '✨ Soft Ding'},
  { value: 'none',     label: '🔇 None'     },
];

const REMINDER_PRESETS: { label: string; minutesBefore: number }[] = [
  { label: 'At start', minutesBefore: 0  },
  { label: '5m early', minutesBefore: 5  },
  { label: '10m',      minutesBefore: 10 },
  { label: '15m',      minutesBefore: 15 },
  { label: '30m',      minutesBefore: 30 },
];

// ── Block editor sub-component (avoids contentEditable/re-render issues) ──
interface BlockEditorProps {
  block: PlannerBlock;
  onUpdate: (changes: Partial<PlannerBlock>) => void;
  onClose: () => void;
  allBlocks: PlannerBlock[];
  onTimeChange: (id: string, field: 'start' | 'end', val: string, all: PlannerBlock[]) => void;
  isRinging?: boolean;
  onStopRinging?: (reminderId: string) => void;
  defaultSound?: ReminderSound;
}

function BlockEditor({ block, onUpdate, onClose, allBlocks, onTimeChange, isRinging, onStopRinging, defaultSound = 'chime' }: BlockEditorProps) {
  const labelRef = useRef<HTMLDivElement>(null);
  const labelTextRef = useRef(block.label);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; });

  const [subtaskInput, setSubtaskInput] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  // Reminder picker state
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [reminderSound, setReminderSound] = useState<ReminderSound>(
    block.reminder?.sound ?? defaultSound
  );

  // Duration display — derived from block times, updated when times change
  const [durationMins, setDurationMins] = useState(() => {
    const s = block.startTime.split(':').map(Number);
    const e = block.endTime.split(':').map(Number);
    return Math.max(15, (e[0] * 60 + e[1]) - (s[0] * 60 + s[1]));
  });
  const [durationInput, setDurationInput] = useState('');
  const [editingDuration, setEditingDuration] = useState(false);

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

  const parseDurationInput = (raw: string): number | null => {
    const s = raw.trim().toLowerCase();
    // "90m" or "90min"
    const mMatch = s.match(/^(\d+)\s*m(in)?$/);
    if (mMatch) return parseInt(mMatch[1], 10);
    // "1h", "2h"
    const hMatch = s.match(/^(\d+(?:\.\d+)?)\s*h(r|ours?)?$/);
    if (hMatch) return Math.round(parseFloat(hMatch[1]) * 60);
    // "1h30m" or "1h 30m"
    const hmMatch = s.match(/^(\d+)\s*h\s*(\d+)\s*m/);
    if (hmMatch) return parseInt(hmMatch[1], 10) * 60 + parseInt(hmMatch[2], 10);
    // plain number → treat as minutes
    const n = parseInt(s, 10);
    if (!isNaN(n) && n > 0) return n;
    return null;
  };

  const applyDuration = (raw: string) => {
    const mins = parseDurationInput(raw);
    if (!mins || mins < 5 || mins > 1440) {
      setEditingDuration(false);
      setDurationInput('');
      return;
    }
    const [sh, sm] = block.startTime.split(':').map(Number);
    const totalEnd = sh * 60 + sm + mins;
    const eh = Math.floor(totalEnd / 60) % 24;
    const em = totalEnd % 60;
    const newEnd = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
    setDurationMins(mins);
    onTimeChange(block.id, 'end', newEnd, allBlocks);
    setEditingDuration(false);
    setDurationInput('');
  };

  const formatDurationMins = (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  useEffect(() => {
    const s = block.startTime.split(':').map(Number);
    const e = block.endTime.split(':').map(Number);
    const computed = (e[0] * 60 + e[1]) - (s[0] * 60 + s[1]);
    if (computed > 0) setDurationMins(computed);
  }, [block.startTime, block.endTime]);

  return (
    <div className="planner-block-editor" onClick={e => e.stopPropagation()}>

      {/* Row 1: Start time → duration → end time */}
      <div className="planner-block-editor__times">
        <input
          type="time"
          className="planner-be-time-input"
          value={block.startTime}
          onChange={e => onTimeChange(block.id, 'start', e.target.value, allBlocks)}
          title="Start time"
        />

        <span className="planner-be-sep">+</span>

        {editingDuration ? (
          <input
            className="planner-be-dur-input"
            type="text"
            autoFocus
            placeholder="e.g. 90m, 2h"
            value={durationInput}
            onChange={e => setDurationInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); applyDuration(durationInput); }
              if (e.key === 'Escape') { setEditingDuration(false); setDurationInput(''); }
            }}
            onBlur={() => {
              if (durationInput.trim()) applyDuration(durationInput);
              else setEditingDuration(false);
            }}
          />
        ) : (
          <button
            className="planner-be-dur-pill"
            onClick={() => {
              setDurationInput(formatDurationMins(durationMins));
              setEditingDuration(true);
            }}
            title="Click to edit duration"
          >
            {formatDurationMins(durationMins)}
          </button>
        )}

        <span className="planner-be-sep">→</span>

        <input
          type="time"
          className="planner-be-time-input"
          value={block.endTime}
          onChange={e => onTimeChange(block.id, 'end', e.target.value, allBlocks)}
          title="End time"
        />
      </div>

      {/* Row 2: Block title */}
      <div
        ref={labelRef}
        className="planner-block-editor__label"
        contentEditable
        suppressContentEditableWarning
        onInput={() => { labelTextRef.current = labelRef.current?.textContent ?? ''; }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          if (e.key === 'Enter') { e.preventDefault(); subtaskInputRef.current?.focus(); }
        }}
      />

      {/* Row 3: Notes */}
      <div
        className="planner-block-editor__notes"
        contentEditable
        suppressContentEditableWarning
        onBlur={e => onUpdate({ notes: e.currentTarget.textContent ?? '' })}
        dangerouslySetInnerHTML={undefined}
        ref={(el) => {
          if (el && el.textContent === '' && block.notes) {
            el.textContent = block.notes;
          }
        }}
        onInput={() => {/* notes saved on blur */}}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        }}
      />

      {/* Row 4: Subtasks */}
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
            <button className="planner-subtask-remove" onClick={() => removeSubtask(task.id)}>×</button>
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

      {/* Row 5: Color picker */}
      <div className="planner-be-color-row">
        <span className="planner-be-color-label">color</span>
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

      {/* Row 6: Reminder */}
      <div className="planner-be-reminder-row">
        {isRinging && block.reminder ? (
          <div className="planner-be-reminder-ringing">
            <span className="planner-be-reminder-ringing-label">🔔 Ringing!</span>
            <button
              className="planner-be-reminder-stop"
              onClick={() => onStopRinging?.(block.reminder!.id)}
            >Stop sound</button>
            <button
              className="planner-be-reminder-clear"
              onClick={() => onUpdate({ reminder: undefined })}
            >Clear ✕</button>
          </div>
        ) : block.reminder?.active ? (
          <div className="planner-be-reminder-active">
            <span className="planner-be-reminder-icon">🔔</span>
            <span className="planner-be-reminder-info">{block.reminder.label} · {block.reminder.sound}</span>
            <button
              className="planner-be-reminder-clear"
              onClick={() => onUpdate({ reminder: undefined })}
            >✕</button>
          </div>
        ) : (
          <button
            className={`planner-be-reminder-btn${showReminderPicker ? ' planner-be-reminder-btn--open' : ''}`}
            onClick={() => setShowReminderPicker(v => !v)}
            title="Set a reminder for this block"
          >
            🔔 Remind me
          </button>
        )}

        {showReminderPicker && !block.reminder?.active && (
          <div className="planner-be-reminder-picker">
            <div className="planner-be-reminder-presets">
              {REMINDER_PRESETS.map(p => (
                <button
                  key={p.minutesBefore}
                  className="planner-be-reminder-preset"
                  onClick={() => {
                    const r = makeBlockReminder(block, p.minutesBefore, reminderSound);
                    onUpdate({ reminder: r });
                    setShowReminderPicker(false);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="planner-be-reminder-sound-row">
              <span className="planner-be-reminder-sound-label">Sound:</span>
              <select
                className="planner-be-reminder-sound-select"
                value={reminderSound}
                onChange={e => setReminderSound(e.target.value as ReminderSound)}
              >
                {REMINDER_SOUNDS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

interface Props {
  pageId: string;
  subtype?: PlannerSubtype;
  goals?: GoalEntry[];
  onGoalsChange?: (goals: GoalEntry[]) => void;
}

export function PlannerView({ pageId, subtype = 'schedule', goals = [], onGoalsChange }: Props) {
  const { ready, blocks, addBlock, updateBlock, batchUpdateBlocks, deleteBlock, getBlocksForDate } = usePlanner(pageId);
  const { settings } = useSettings();
  const { ringingIds: plannerRingingIds, stopRinging: stopPlannerRinging } = usePlannerReminders(
    blocks,
    updateBlock,
    settings.customTones,
    settings.volume
  );
  const [currentDate, setCurrentDate] = useState(() => formatDate(new Date()));
  const [isToday, setIsToday] = useState(true);
  const [currentMinutes, setCurrentMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  // Scroll refs for now-line auto-scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const nowLineRef = useRef<HTMLDivElement>(null);

  const scrollToNow = () => {
    const container = scrollContainerRef.current;
    const line = nowLineRef.current;
    if (!container || !line) return;
    container.scrollTop = line.offsetTop - container.clientHeight / 2;
  };

  // Auto-scroll to now-line once on mount (schedule subtype only)
  useEffect(() => {
    if (subtype !== 'schedule') return;
    // After paint so offsetTop is accurate
    const id = requestAnimationFrame(() => scrollToNow());
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, subtype]);

  // Quick-add state
  const [quickAddValue,    setQuickAddValue]    = useState('');
  const [quickAddDuration, setQuickAddDuration] = useState(60);
  const [quickAddTime,     setQuickAddTime]     = useState(() => roundToNextHalfHour(new Date()));
  const quickAddRef     = useRef<HTMLInputElement>(null);
  const quickAddTimeRef = useRef<HTMLInputElement>(null);

  // Expanded block state
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const expandedCardRef = useRef<HTMLDivElement | null>(null);

  // Pending label after addBlock (since addBlock doesn't return the id)
  const pendingLabel = useRef<string | null>(null);
  const pendingExpand = useRef(false);
  const pendingDupe = useRef<{
    color: PlannerBlock['color'];
    notes: string;
    tasks: Task[];
  } | null>(null);

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
        const changes: Partial<PlannerBlock> = { label: pendingLabel.current };
        if (pendingDupe.current) {
          changes.color = pendingDupe.current.color;
          changes.notes = pendingDupe.current.notes;
          changes.tasks = pendingDupe.current.tasks;
          pendingDupe.current = null;
        }
        updateBlock(latest.id, changes);
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
    const rawLabel = quickAddValue.trim();
    if (!rawLabel) return;

    // Try to extract time from the label text
    const { time: parsedTime, cleanedLabel } = parseTimeFromText(rawLabel);
    const startTime = parsedTime ?? quickAddTime;
    const label     = cleanedLabel || rawLabel;

    // If a time was parsed from text, update the time field too
    if (parsedTime) setQuickAddTime(parsedTime);

    pendingLabel.current = label;
    addBlock(currentDate, startTime, quickAddDuration);
    setQuickAddValue('');
    quickAddRef.current?.focus();
  };

  const addBlockAtNow = () => {
    pendingExpand.current = true;
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const exactNow = `${hh}:${mm}`;
    setQuickAddTime(exactNow);
    addBlock(currentDate, exactNow, quickAddDuration);
  };

  const duplicateBlock = useCallback((block: PlannerBlock) => {
    const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    // Offset start time by the block's duration to avoid perfect overlap
    const startMins = timeToMinutes(block.startTime);
    const endMins   = timeToMinutes(block.endTime);
    const duration  = Math.max(15, endMins - startMins);
    const newStart  = startMins + duration;
    const newEnd    = newStart  + duration;
    const clamp     = (m: number) => Math.min(m, 23 * 60 + 59);
    const toTime    = (m: number) => {
      const h = Math.floor(clamp(m) / 60);
      const min = clamp(m) % 60;
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    };
    const duped: PlannerBlock = {
      ...block,
      id: newId,
      startTime: toTime(newStart),
      endTime:   toTime(newEnd),
      completed: false,
    };
    // Insert via updateBlock pattern — we need access to setBlocks directly,
    // but usePlanner doesn't expose it. Instead, we use addBlock for the
    // startTime/duration and then immediately update the label/color/notes.
    //
    // Strategy: use the pendingLabel ref + a new pendingMeta ref to apply
    // all block properties after addBlock creates the unlabeled shell.
    pendingLabel.current = duped.label || 'Copy';
    pendingDupe.current  = { color: duped.color, notes: duped.notes, tasks: duped.tasks ?? [] };
    addBlock(currentDate, duped.startTime, duration);
  }, [currentDate, addBlock]);

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
      <GoalsPanel
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

  const overlapMap = computeOverlapColumns(sortedDailyBlocks);

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
        <div className="planner-quick-add-wrap">
          <div className="planner-quick-add-bar">
            <input
              ref={quickAddRef}
              className="planner-quick-add-input"
              type="text"
              placeholder="block name… or '9am meeting 1h'"
              value={quickAddValue}
              onChange={e => setQuickAddValue(e.target.value)}
              onKeyDown={handleQuickAdd}
            />
            <span className="planner-quick-add-start-label">start</span>
            <input
              ref={quickAddTimeRef}
              className="planner-quick-add-time-native"
              type="time"
              value={quickAddTime}
              onChange={e => setQuickAddTime(e.target.value)}
              title="Start time"
            />
            <button
              className="planner-quick-add-now-btn"
              onMouseDown={e => e.preventDefault()}
              onClick={addBlockAtNow}
              title="Use current time"
            >now</button>
          </div>

          {/* Duration pills — always visible, not focus-gated */}
          <div className="planner-duration-pills">
            {([['15m', 15], ['30m', 30], ['45m', 45], ['1h', 60], ['90m', 90], ['2h', 120], ['3h', 180]] as [string, number][]).map(([label, mins]) => (
              <button
                key={label}
                className={`planner-duration-pill${quickAddDuration === mins ? ' planner-duration-pill--active' : ''}`}
                onMouseDown={e => e.preventDefault()}
                onClick={() => setQuickAddDuration(mins)}
              >
                {label}
              </button>
            ))}
            <span className="planner-duration-hint">
              → {(() => {
                const [h, m] = quickAddTime.split(':').map(Number);
                const endMins = h * 60 + m + quickAddDuration;
                const eh = Math.floor(endMins / 60) % 24;
                const em = endMins % 60;
                return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
              })()}
            </span>
          </div>
        </div>

        {/* Focus bar — pinned short-horizon goals, schedule subtype only */}
        {(() => {
          const pinned = goals.filter(g => g.pinned && !g.completed);
          return pinned.length > 0 ? (
            <div className="planner-focus-bar">
              <span className="planner-focus-bar-label">focus</span>
              {pinned.map(g => (
                <span key={g.id} className="planner-focus-bar-chip">
                  {g.title || 'Untitled'}
                </span>
              ))}
            </div>
          ) : null;
        })()}

        {/* Scrollable timeline + blocks */}
        <div className="planner-scroll-area" ref={scrollContainerRef}>
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
                ref={nowLineRef}
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
                const isCompact     = (blockEndMin - blockStartMin) < 30;

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
                      isExpanded && isCompact ? 'planner-block-card--expanded-compact' : '',
                    ].filter(Boolean).join(' ')}
                    style={(() => {
                      const layout = overlapMap.get(block.id) ?? { col: 0, totalCols: 1 };
                      const timelineLeft  = 40; // px offset for hour labels
                      const timelineRight = 8;  // px right margin
                      const availableWidth = `calc(100% - ${timelineLeft}px - ${timelineRight}px)`;
                      const colWidth = `calc(${availableWidth} / ${layout.totalCols})`;
                      const colLeft  = `calc(${timelineLeft}px + ${colWidth} * ${layout.col})`;
                      return {
                        position: 'absolute' as const,
                        top: `${topPct}%`,
                        ...(isExpanded
                          ? { minHeight: `${heightPct}%` }
                          : { height: `max(${layout.totalCols > 1 ? '36px' : '48px'}, ${heightPct}%)` }),
                        left: colLeft,
                        width: `calc(${colWidth} - 4px)`,
                        right: undefined,
                        zIndex: isExpanded ? 20 : 1,
                      };
                    })()}
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
                      {block.reminder?.active && (
                        <span
                          className={`planner-block-reminder-badge${block.reminder && plannerRingingIds.includes(block.reminder.id) ? ' planner-block-reminder-badge--ringing' : ''}`}
                          title={`Reminder: ${block.reminder.label}`}
                        > 🔔</span>
                      )}
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
                        className="planner-block-btn--dupe"
                        onClick={e => { e.stopPropagation(); duplicateBlock(block); }}
                        title="Duplicate block"
                      >⊕</button>
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
                        isRinging={!!(block.reminder && plannerRingingIds.includes(block.reminder.id))}
                        onStopRinging={stopPlannerRinging}
                        defaultSound={settings.defaultReminderSound}
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

          {/* Jump to now button — sticky inside scroll area */}
          {isToday && (
            <button
              className="planner-jump-now-btn"
              onClick={scrollToNow}
            >
              ↓ now
            </button>
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

// ─────────────────────────────────────────────
// GoalCard — single goal with contenteditable inline editing
// ─────────────────────────────────────────────
interface GoalCardProps {
  goal: GoalEntry;
  onToggle: () => void;
  onUpdate: (changes: Partial<GoalEntry>) => void;
  onRemove: () => void;
  onPin: () => void;
  pinDisabled: boolean;
}

function GoalCard({ goal, onToggle, onUpdate, onRemove, onPin, pinDisabled }: GoalCardProps) {
  const titleRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [notesOpen, setNotesOpen] = useState(!!goal.notes);

  // Keep DOM in sync with prop without clobbering cursor
  useEffect(() => {
    if (titleRef.current && titleRef.current.textContent !== goal.title) {
      titleRef.current.textContent = goal.title;
    }
  }, [goal.title]);

  useEffect(() => {
    if (notesRef.current && notesRef.current.textContent !== goal.notes) {
      notesRef.current.textContent = goal.notes;
    }
  }, [goal.notes]);

  return (
    <div
      className={`planner-goals-card${goal.completed ? ' planner-goals-card--done' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="planner-goals-card-row">
        {/* Completion dot */}
        <button
          className={`planner-goals-dot${goal.completed ? ' planner-goals-dot--done' : ''}`}
          onClick={onToggle}
          title={goal.completed ? 'Mark incomplete' : 'Mark complete'}
        />

        {/* Title — contenteditable */}
        <div
          ref={titleRef}
          className="planner-goals-title"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Goal…"
          onInput={() => onUpdate({ title: titleRef.current?.textContent ?? '' })}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); }
            if (e.key === 'Escape') {
              e.preventDefault();
              if (titleRef.current) titleRef.current.textContent = goal.title;
              (e.target as HTMLElement).blur();
            }
          }}
          onClick={() => setNotesOpen(true)}
        />

        {/* Pin button */}
        <button
          className={`planner-goals-pin${goal.pinned ? ' planner-goals-pin--active' : ''}`}
          onClick={onPin}
          disabled={pinDisabled}
          title={goal.pinned ? "Unpin from today's focus" : "Pin to today's focus (max 3)"}
          style={{ opacity: hovered || goal.pinned ? 1 : 0, transition: 'opacity 0.15s' }}
        >◈</button>

        {/* Delete button — hover only */}
        {hovered && (
          <button className="planner-goals-delete" onClick={onRemove} title="Delete goal">×</button>
        )}
      </div>

      {/* Notes — contenteditable, revealed on title click */}
      {notesOpen && (
        <div
          ref={notesRef}
          className="planner-goals-notes"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Notes, milestones, context…"
          onInput={() => onUpdate({ notes: notesRef.current?.textContent ?? '' })}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); (e.target as HTMLElement).blur(); }
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// GoalsPanel — tabs, list, quick-entry, focus chips
// ─────────────────────────────────────────────
interface GoalsPanelProps {
  goals: GoalEntry[];
  onChange: (goals: GoalEntry[]) => void;
}

function GoalsPanel({ goals, onChange }: GoalsPanelProps) {
  const [activeHorizon, setActiveHorizon] = useState<'short' | 'long'>('short');
  const [goalInput, setGoalInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const filteredGoals = goals.filter(g => g.horizon === activeHorizon);
  const pinnedGoals = goals.filter(g => g.pinned && !g.completed);
  const pinnedCount = goals.filter(g => g.pinned).length;

  const addGoal = () => {
    const title = goalInput.trim();
    if (!title) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const newGoal: GoalEntry = {
      id, title, notes: '', horizon: activeHorizon,
      completed: false, createdAt: Date.now(),
    };
    onChange([...goals, newGoal]);
    setGoalInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const updateGoal = (id: string, changes: Partial<GoalEntry>) =>
    onChange(goals.map(g => g.id === id ? { ...g, ...changes } : g));

  const removeGoal = (id: string) =>
    onChange(goals.filter(g => g.id !== id));

  const toggleComplete = (id: string) =>
    onChange(goals.map(g => g.id === id ? { ...g, completed: !g.completed } : g));

  const togglePin = (id: string) => {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;
    if (!goal.pinned && pinnedCount >= 3) return;
    onChange(goals.map(g => g.id === id ? { ...g, pinned: !g.pinned } : g));
  };

  return (
    <div className="planner-goals-container">
      {/* Today's focus chips — above horizon tabs */}
      {pinnedGoals.length > 0 && (
        <div className="planner-goals-focus-chips">
          <span className="planner-goals-focus-label">today's focus</span>
          {pinnedGoals.map(g => (
            <span key={g.id} className="planner-goals-focus-chip">
              {g.title || 'Untitled'}
            </span>
          ))}
        </div>
      )}

      {/* Horizon tabs */}
      <div className="planner-goals-tabs">
        {(['short', 'long'] as const).map(h => (
          <button
            key={h}
            className={`planner-goals-tab ${activeHorizon === h ? 'planner-goals-tab--active' : 'planner-goals-tab--inactive'}`}
            onClick={() => setActiveHorizon(h)}
          >
            {h === 'short' ? 'This Season' : 'Long Arc'}
          </button>
        ))}
      </div>

      {/* Goal list */}
      <div className="planner-goals-list">
        {filteredGoals.length === 0 && (
          <div className="planner-goals-empty">No goals here yet.</div>
        )}
        {filteredGoals.map(goal => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onToggle={() => toggleComplete(goal.id)}
            onUpdate={changes => updateGoal(goal.id, changes)}
            onRemove={() => removeGoal(goal.id)}
            onPin={() => togglePin(goal.id)}
            pinDisabled={!goal.pinned && pinnedCount >= 3}
          />
        ))}
      </div>

      {/* Quick-entry bar */}
      <div className="planner-goals-quick-bar">
        <textarea
          ref={inputRef}
          className="planner-goals-quick-input"
          rows={1}
          placeholder={activeHorizon === 'short' ? 'a goal for this season…' : 'a long-arc goal…'}
          value={goalInput}
          onChange={e => {
            setGoalInput(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 56) + 'px';
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addGoal(); }
          }}
        />
        <button
          className="planner-goals-quick-btn"
          onClick={addGoal}
          disabled={!goalInput.trim()}
        >Add</button>
      </div>
    </div>
  );
}
