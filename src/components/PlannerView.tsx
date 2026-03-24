import { useState, useEffect } from 'react';
import { usePlanner } from '../hooks/usePlanner';
import type { AccentColor, PlannerBlock, Task, GoalEntry, PlannerSubtype } from '../types';
import type { Settings } from '../hooks/useSettings';
import { IntegratedSchedulePanel } from './IntegratedSchedulePanel';
import { GoalsView } from './GoalsView';

const COLORS: AccentColor[] = ['plum', 'rose', 'peach', 'orange', 'yellow', 'blue', 'ghost'];

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

  useEffect(() => {
    const todayStr = formatDate(new Date());
    setIsToday(currentDate === todayStr);
  }, [currentDate]);

  // Update current time every second to stay in sync with the clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentMinutes(now.getHours() * 60 + now.getMinutes());
    }, 1000);
    return () => clearInterval(timer);
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

  const handleAddBlock = () => {
    const dailyBlocks = getBlocksForDate(currentDate);
    let defaultTime = "09:00";
    if (dailyBlocks.length > 0) {
      defaultTime = dailyBlocks[dailyBlocks.length - 1].endTime;
    }
    addBlock(currentDate, defaultTime, settings.defaultBlockDuration);
  };

  const minutesToTime = (m: number) => {
    m = Math.max(0, Math.min(23 * 60 + 59, m));
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const handleTimeChange = (id: string, field: 'start' | 'end', val: string, allBlocks: PlannerBlock[]) => {
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

      // Close the gap: if previous block ended exactly where this one started, stretch it
      if (idx > 0) {
        const prev = sorted[idx - 1];
        if (prev.endTime === block.startTime) {
          updates.push({ id: prev.id, changes: { endTime: val } });
        }
      }

      // Cascade all subsequent blocks by the same delta
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

      // Ensure end > start + 5 min
      const minEnd = timeToMinutes(block.startTime) + 5;
      const clampedEnd = minutesToTime(Math.max(newMins, minEnd));
      const clampedDelta = timeToMinutes(clampedEnd) - oldEndMins;
      updates.push({ id: block.id, changes: { endTime: clampedEnd } });

      // Cascade all subsequent blocks
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
  };

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
  const dailyBlocks = getBlocksForDate(currentDate);
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

  // Current time display string for "now" badge
  const nowHH = String(Math.floor(currentMinutes / 60)).padStart(2, '0');
  const nowMM = String(currentMinutes % 60).padStart(2, '0');
  const nowStr = `${nowHH}:${nowMM}`;

  // Block count per day for week strip indicators
  const weekBlockCounts = currentWeekDays.reduce((acc, day) => {
    acc[day] = getBlocksForDate(day).length;
    return acc;
  }, {} as Record<string, number>);

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

        {/* Single scrollable area: blocks + care schedule */}
        <div className="planner-scroll-area">
          <div className="planner-blocks">
            {dailyBlocks.length === 0 && (
              <div className="planner-empty">No blocks scheduled. Press <em>+ add block</em> to begin.</div>
            )}

            {dailyBlocks.map((block) => {
              const blockStart = timeToMinutes(block.startTime);
              const blockEnd = timeToMinutes(block.endTime);
              const isCurrent = isToday && currentMinutes >= blockStart && currentMinutes < blockEnd;

              return (
                <div
                  key={block.id}
                  className={`planner-block color-${block.color} ${block.completed ? 'completed' : ''} ${isCurrent ? 'planner-block--current' : ''}`}
                >
                  <div className="planner-block-time">
                    <input
                      type="time"
                      className="planner-time-input"
                      value={block.startTime}
                      onChange={(e) => handleTimeChange(block.id, 'start', e.target.value, dailyBlocks)}
                    />
                    <span>–</span>
                    <input
                      type="time"
                      className="planner-time-input"
                      value={block.endTime}
                      onChange={(e) => handleTimeChange(block.id, 'end', e.target.value, dailyBlocks)}
                    />
                    {isCurrent && <span className="planner-current-indicator">● now</span>}
                  </div>

                  <input
                    type="text"
                    className="planner-block-label"
                    value={block.label}
                    placeholder="Block title..."
                    autoFocus={block.label === ''}
                    onChange={(e) => updateBlock(block.id, { label: e.target.value })}
                  />

                  <textarea
                    className="planner-block-notes"
                    value={block.notes}
                    placeholder="Notes..."
                    rows={1}
                    onChange={(e) => {
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                      updateBlock(block.id, { notes: e.target.value });
                    }}
                  />

                  <div className="planner-block-tasks">
                    {(block.tasks || []).map(task => (
                      <div key={task.id} className="planner-task-item">
                        <button
                          className={`planner-task-check ${task.completed ? 'checked' : ''}`}
                          onClick={() => {
                            const newTasks = (block.tasks || []).map(t =>
                              t.id === task.id ? { ...t, completed: !t.completed } : t
                            );
                            updateBlock(block.id, { tasks: newTasks });
                          }}
                        >
                          {task.completed ? '✓' : ''}
                        </button>
                        <input
                          type="text"
                          className={`planner-task-input ${task.completed ? 'completed' : ''}`}
                          value={task.content}
                          placeholder="Task..."
                          onChange={(e) => {
                            const newTasks = (block.tasks || []).map(t =>
                              t.id === task.id ? { ...t, content: e.target.value } : t
                            );
                            updateBlock(block.id, { tasks: newTasks });
                          }}
                        />
                        <button
                          className="planner-task-delete"
                          onClick={() => {
                            const newTasks = (block.tasks || []).filter(t => t.id !== task.id);
                            updateBlock(block.id, { tasks: newTasks });
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="planner-task-add-btn"
                      onClick={() => {
                        const newTask: Task = {
                          id: Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
                          content: '',
                          type: 'checkbox',
                          completed: false,
                          createdAt: Date.now(),
                        };
                        updateBlock(block.id, { tasks: [...(block.tasks || []), newTask] });
                      }}
                    >
                      + add subtask
                    </button>
                  </div>

                  <div className="planner-color-picker">
                    {COLORS.map(c => (
                      <div
                        key={c}
                        className={`planner-color-dot ${block.color === c ? 'active' : ''}`}
                        style={{ background: getColorHex(c) }}
                        onClick={() => updateBlock(block.id, { color: c })}
                      />
                    ))}
                  </div>

                  <div className="planner-block-actions">
                    <button
                      className={`planner-action-btn ${block.completed ? 'done' : ''}`}
                      onClick={() => updateBlock(block.id, { completed: !block.completed })}
                      title={block.completed ? 'Mark incomplete' : 'Mark complete'}
                    >✓</button>
                    <button
                      className="planner-action-btn delete"
                      onClick={() => deleteBlock(block.id)}
                      title="Delete block"
                    >×</button>
                  </div>
                </div>
              );
            })}

            <button className="planner-add-btn" onClick={handleAddBlock}>+ add block</button>
          </div>

          {/* Care schedule — only shown on caregiving subtype */}
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
          <h3 className="summary-title">Daily Summary</h3>

          <div className="summary-stat">
            <span className="stat-label">Blocks</span>
            <span className="stat-value">{completedBlocks} / {totalBlocks} done</span>
          </div>

          <div className="summary-stat">
            <span className="stat-label">Scheduled</span>
            <span className="stat-value">{hours > 0 ? `${hours}h ` : ''}{mins > 0 ? `${mins}m` : hours === 0 ? '—' : ''}</span>
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

function getColorHex(color: AccentColor) {
  switch (color) {
    case 'plum': return '#661A4E';
    case 'rose': return '#B55F7C';
    case 'peach': return '#FD8D79';
    case 'orange': return '#FCA324';
    case 'yellow': return '#FCCD38';
    case 'blue': return '#5A8EFC';
    case 'violet': return '#a78bfa';
    case 'indigo': return '#818cf8';
    case 'amber': return '#fbbf24';
    case 'teal': return '#2dd4bf';
    case 'ghost': return 'rgba(180,140,220,0.2)';
    default: return 'transparent';
  }
}
