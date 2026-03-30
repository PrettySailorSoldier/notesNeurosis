import React, { useState } from 'react';
import { useHabits } from '../hooks/useHabits';
import { accentToHex } from '../utils/accentToHex';
import type { AccentColor, HabitType, Habit } from '../types';
import '../styles/habits.css';

const ACCENT_COLORS: AccentColor[] = ['plum', 'rose', 'peach', 'orange', 'yellow', 'blue', 'ghost'];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLast35Days(): string[] {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  const start = new Date(sunday);
  start.setDate(sunday.getDate() - 28);
  return Array.from({ length: 35 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return formatDate(d);
  });
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

// ── Binary dot grid ───────────────────────────────────────
interface BinaryGridProps {
  habit: Habit;
  dotDates: string[];
  todayISO: string;
  isLogged: (id: string, date: string) => boolean;
  toggleLog: (id: string, date: string) => void;
}

function BinaryGrid({ habit, dotDates, todayISO, isLogged, toggleLog }: BinaryGridProps) {
  const hexColor = accentToHex(habit.color);
  return (
    <div className="habits-dot-grid">
      <div className="habits-dot-weekdays">
        {WEEKDAY_LABELS.map((d, i) => (
          <span key={i} className="habits-dot-weekday">{d}</span>
        ))}
      </div>
      {dotDates.map(date => {
        const logged = isLogged(habit.id, date);
        const isToday = date === todayISO;
        return (
          <button
            key={date}
            className={[
              'habits-dot',
              logged ? 'habits-dot--logged' : '',
              isToday ? 'habits-dot--today' : '',
            ].filter(Boolean).join(' ')}
            style={{ '--habit-color': hexColor } as React.CSSProperties}
            onClick={() => toggleLog(habit.id, date)}
            title={date}
          />
        );
      })}
    </div>
  );
}

// ── Count cell grid ───────────────────────────────────────
interface CountGridProps {
  habit: Habit;
  dotDates: string[];
  todayISO: string;
  getLogCount: (id: string, date: string) => number;
  setLogCount: (id: string, date: string, count: number) => void;
}

function CountGrid({ habit, dotDates, todayISO, getLogCount, setLogCount }: CountGridProps) {
  const hexColor = accentToHex(habit.color);
  const counts = dotDates.map(d => getLogCount(habit.id, d));
  const maxCount = Math.max(1, ...counts);

  return (
    <div className="habits-dot-grid habits-count-grid">
      <div className="habits-dot-weekdays">
        {WEEKDAY_LABELS.map((d, i) => (
          <span key={i} className="habits-dot-weekday">{d}</span>
        ))}
      </div>
      {dotDates.map((date, i) => {
        const count = counts[i];
        const isToday = date === todayISO;
        const fillOpacity = count > 0 ? 0.25 + (count / maxCount) * 0.75 : 0;

        return (
          <div
            key={date}
            className={[
              'habits-count-cell',
              count > 0 ? 'habits-count-cell--active' : '',
              isToday ? 'habits-count-cell--today' : '',
            ].filter(Boolean).join(' ')}
            style={{ '--habit-color': hexColor, '--fill-opacity': fillOpacity } as React.CSSProperties}
            title={`${date}: ${count}${habit.unit ? ' ' + habit.unit : ''}`}
          >
            <button
              className="habits-count-cell__tap"
              onClick={() => setLogCount(habit.id, date, count + 1)}
              title={`+1 (${date})`}
            >
              {count > 0 ? count : ''}
            </button>
            {count > 0 && (
              <button
                className="habits-count-cell__dec"
                onClick={e => { e.stopPropagation(); setLogCount(habit.id, date, count - 1); }}
                title="−1"
              >−</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Linear view ───────────────────────────────────────────
type LinearWindow = 'today' | '7d' | '30d' | '90d';

interface LinearViewProps {
  habits: Habit[];
  isLogged: (id: string, date: string) => boolean;
  getLogCount: (id: string, date: string) => number;
  toggleLog: (id: string, date: string) => void;
  setLogCount: (id: string, date: string, count: number) => void;
}

function LinearView({ habits, isLogged, getLogCount, toggleLog, setLogCount }: LinearViewProps) {
  const [win, setWin] = useState<LinearWindow>('today');
  // Draft values while user is typing (keyed by habitId)
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const today = new Date();
  const todayISO = formatDate(today);

  const windowDays: Record<LinearWindow, number> = { 'today': 1, '7d': 7, '30d': 30, '90d': 90 };
  const days = windowDays[win];

  const windowDates: string[] = win === 'today'
    ? [todayISO]
    : Array.from({ length: days }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (days - 1 - i));
        return formatDate(d);
      });

  const activeHabits = habits.filter(h => !h.archivedAt);

  const habitTotals = activeHabits.map(h => {
    const total = h.habitType === 'count'
      ? windowDates.reduce((s, d) => s + getLogCount(h.id, d), 0)
      : windowDates.filter(d => isLogged(h.id, d)).length;
    return { habit: h, total };
  });

  const grandTotal = habitTotals.reduce((s, x) => s + x.total, 0);
  const maxTotal = Math.max(1, ...habitTotals.map(x => x.total));
  const sorted = [...habitTotals].sort((a, b) => b.total - a.total);
  const tickDates = win !== 'today'
    ? windowDates.filter((_, i) => i === 0 || i === days - 1 || i % Math.round(days / 4) === 0)
    : [];
  const isToday = win === 'today';

  const commitDraft = (habitId: string) => {
    const raw = drafts[habitId];
    if (raw === undefined) return;
    const val = parseFloat(raw);
    setLogCount(habitId, todayISO, isNaN(val) || val < 0 ? 0 : val);
    setDrafts(prev => { const next = { ...prev }; delete next[habitId]; return next; });
  };

  return (
    <div className="habits-linear">
      {/* Window toggle */}
      <div className="habits-linear-controls">
        {(['today', '7d', '30d', '90d'] as LinearWindow[]).map(w => (
          <button
            key={w}
            className={`habits-linear-win-btn ${win === w ? 'habits-linear-win-btn--active' : ''}`}
            onClick={() => setWin(w)}
          >{w}</button>
        ))}
      </div>

      {activeHabits.length === 0 && (
        <div className="habits-linear-empty">No habits yet — add some from the grid view.</div>
      )}

      {/* ── TODAY: editable list + stacked bar ── */}
      {isToday && activeHabits.length > 0 && (
        <div className="habits-today-section">

          {/* Stacked bar — only when something is logged */}
          {grandTotal > 0 && (
            <div className="habits-today-bar">
              {sorted.filter(x => x.total > 0).map(({ habit, total }) => (
                <div
                  key={habit.id}
                  className="habits-today-bar__seg"
                  style={{ flex: total, backgroundColor: accentToHex(habit.color) }}
                  title={`${habit.name}: ${total}${habit.unit ? ' ' + habit.unit : ''}`}
                />
              ))}
            </div>
          )}

          {/* Editable rows — every habit */}
          <div className="habits-today-rows">
            {activeHabits.map(h => {
              const hexColor = accentToHex(h.color);
              const isCount = h.habitType === 'count';
              const currentCount = getLogCount(h.id, todayISO);
              const logged = isLogged(h.id, todayISO);
              const total = isCount ? currentCount : (logged ? 1 : 0);
              const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;

              return (
                <div key={h.id} className="habits-today-row">
                  {/* Color bar on left */}
                  <div className="habits-today-row__bar" style={{ backgroundColor: hexColor, opacity: total > 0 ? 0.85 : 0.18 }} />

                  {/* Emoji + name */}
                  <span className="habits-today-row__emoji">{h.emoji}</span>
                  <span className="habits-today-row__name">{h.name}</span>

                  {/* Input: number for count habits, checkbox toggle for binary */}
                  {isCount ? (
                    <div className="habits-today-row__count-wrap">
                      <input
                        className="habits-today-row__input"
                        type="number"
                        min="0"
                        step="0.5"
                        value={drafts[h.id] !== undefined ? drafts[h.id] : (currentCount || '')}
                        placeholder="0"
                        onChange={e => setDrafts(prev => ({ ...prev, [h.id]: e.target.value }))}
                        onBlur={() => commitDraft(h.id)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                      />
                      <span className="habits-today-row__unit">{h.unit ?? '×'}</span>
                    </div>
                  ) : (
                    <button
                      className={`habits-today-row__toggle ${logged ? 'habits-today-row__toggle--on' : ''}`}
                      style={logged ? { borderColor: hexColor, color: hexColor } : {}}
                      onClick={() => toggleLog(h.id, todayISO)}
                    >
                      {logged ? '✓ done' : '○ log'}
                    </button>
                  )}

                  {/* Percentage — only if something logged */}
                  <span className="habits-today-row__pct" style={{ color: hexColor }}>
                    {total > 0 ? `${pct}%` : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {grandTotal > 0 && (
            <div className="habits-today-summary">
              {habitTotals.filter(x => x.total > 0 && x.habit.habitType === 'count').length > 0
                ? `${grandTotal} ${activeHabits.find(h => h.habitType === 'count')?.unit ?? '×'} tracked today`
                : `${grandTotal} ${grandTotal === 1 ? 'habit' : 'habits'} done today`}
            </div>
          )}
        </div>
      )}

      {/* ── MULTI-DAY: segmented bar rows ── */}
      {!isToday && sorted.map(({ habit, total }) => {
        const hexColor = accentToHex(habit.color);
        const barPct = (total / maxTotal) * 100;
        const unit = habit.habitType === 'count' ? (habit.unit ?? '×') : 'days';
        const segmentCounts = windowDates.map(d =>
          habit.habitType === 'count' ? getLogCount(habit.id, d) : (isLogged(habit.id, d) ? 1 : 0)
        );
        const segMax = Math.max(1, ...segmentCounts);

        return (
          <div key={habit.id} className="habits-linear-row">
            <div className="habits-linear-label">
              <span className="habits-linear-emoji">{habit.emoji}</span>
              <span className="habits-linear-name">{habit.name}</span>
            </div>
            <div className="habits-linear-track">
              <div className="habits-linear-segments" style={{ width: `${barPct}%` }}>
                {segmentCounts.map((count, i) => (
                  <div
                    key={i}
                    className="habits-linear-seg"
                    style={{
                      flex: 1,
                      opacity: count > 0 ? 0.3 + (count / segMax) * 0.7 : 0.04,
                      backgroundColor: hexColor,
                    }}
                    title={`${windowDates[i]}: ${count}${habit.unit ? ' ' + habit.unit : ''}`}
                  />
                ))}
              </div>
            </div>
            <div className="habits-linear-total" style={{ color: hexColor }}>
              {total > 0 ? `${total} ${unit}` : '—'}
            </div>
          </div>
        );
      })}

      {!isToday && activeHabits.length > 0 && tickDates.length > 0 && (
        <div className="habits-linear-axis">
          {tickDates.map(d => (
            <span key={d} className="habits-linear-tick">{formatShortDate(d)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────
interface Props { pageId: string; }

type ViewMode = 'grid' | 'linear';

export function HabitsPage({ pageId: _pageId }: Props) {
  const {
    habits, ready,
    addHabit, removeHabit,
    isLogged, toggleLog,
    getLogCount, setLogCount,
    getStreakForHabit,
  } = useHabits();

  const [view, setView] = useState<ViewMode>('grid');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [newColor, setNewColor] = useState<AccentColor>('plum');
  const [newType, setNewType] = useState<HabitType>('binary');
  const [newUnit, setNewUnit] = useState('');

  const todayISO = formatDate(new Date());
  const dotDates = getLast35Days();
  const activeHabits = habits.filter(h => !h.archivedAt);

  const handleAddHabit = () => {
    const name = newName.trim();
    if (!name) return;
    addHabit(name, newEmoji || '●', newColor, newType, newUnit.trim() || undefined);
    setNewName(''); setNewEmoji(''); setNewColor('plum');
    setNewType('binary'); setNewUnit('');
    setShowAddForm(false);
  };

  if (!ready) return <div className="loading-hint">✦</div>;

  return (
    <div className="habits-page">
      {/* Header */}
      <div className="habits-header">
        <h2 className="habits-title">Rhythm Tracker</h2>
        <p className="habits-subtitle">No streaks. Just patterns.</p>
        <div className="habits-view-toggle">
          <button
            className={`habits-view-btn ${view === 'grid' ? 'habits-view-btn--active' : ''}`}
            onClick={() => setView('grid')}
            title="Grid view"
          >▦</button>
          <button
            className={`habits-view-btn ${view === 'linear' ? 'habits-view-btn--active' : ''}`}
            onClick={() => setView('linear')}
            title="Linear view"
          >▬</button>
        </div>
        <button className="habits-add-btn" onClick={() => setShowAddForm(true)}>+ habit</button>
      </div>

      {/* Linear view */}
      {view === 'linear' && (
        <LinearView
          habits={habits}
          isLogged={isLogged}
          getLogCount={getLogCount}
          toggleLog={toggleLog}
          setLogCount={setLogCount}
        />
      )}

      {/* Grid view — habit cards */}
      {view === 'grid' && (
        <>
          {activeHabits.map(habit => {
            const streak = getStreakForHabit(habit.id);
            const isCount = habit.habitType === 'count';
            const totalCount = isCount
              ? dotDates.reduce((s, d) => s + getLogCount(habit.id, d), 0)
              : null;

            return (
              <div key={habit.id} className="habits-card">
                <div className="habits-card__header">
                  <span className="habits-card__emoji">{habit.emoji}</span>
                  <span className="habits-card__name">{habit.name}</span>
                  {isCount && totalCount !== null && totalCount > 0 && (
                    <span className="habits-card__streak">
                      {totalCount}{habit.unit ? ' ' + habit.unit : ''} / 5w
                    </span>
                  )}
                  {!isCount && streak > 0 && (
                    <span className="habits-card__streak">{streak}d</span>
                  )}
                  <span className="habits-card__type-badge">{isCount ? 'count' : 'binary'}</span>
                  <button
                    className="habits-card__archive"
                    onClick={() => removeHabit(habit.id)}
                    title="Archive habit"
                  >×</button>
                </div>

                {isCount ? (
                  <CountGrid
                    habit={habit}
                    dotDates={dotDates}
                    todayISO={todayISO}
                    getLogCount={getLogCount}
                    setLogCount={setLogCount}
                  />
                ) : (
                  <BinaryGrid
                    habit={habit}
                    dotDates={dotDates}
                    todayISO={todayISO}
                    isLogged={isLogged}
                    toggleLog={toggleLog}
                  />
                )}
              </div>
            );
          })}

          {activeHabits.length === 0 && !showAddForm && (
            <div style={{ color: 'var(--text-faint)', fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginTop: 24 }}>
              No habits yet — click <em>+ habit</em> to begin.
            </div>
          )}
        </>
      )}

      {/* Add form — shown in both views */}
      {showAddForm && (
        <div className="habits-add-form">
          <input
            className="habits-add-input"
            type="text"
            placeholder="Habit name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddHabit(); if (e.key === 'Escape') setShowAddForm(false); }}
            autoFocus
          />

          <div className="habits-type-toggle">
            <button
              className={`habits-type-btn ${newType === 'binary' ? 'habits-type-btn--active' : ''}`}
              onClick={() => setNewType('binary')}
            >● did / didn't</button>
            <button
              className={`habits-type-btn ${newType === 'count' ? 'habits-type-btn--active' : ''}`}
              onClick={() => setNewType('count')}
            ># how many</button>
          </div>

          {newType === 'count' && (
            <input
              className="habits-add-input"
              type="text"
              placeholder="unit label (e.g. hrs, glasses, ×)…"
              value={newUnit}
              onChange={e => setNewUnit(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddHabit(); }}
            />
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="habits-emoji-input"
              type="text"
              placeholder="emoji"
              maxLength={2}
              value={newEmoji}
              onChange={e => setNewEmoji(e.target.value)}
            />
            <div className="habits-color-picker">
              {ACCENT_COLORS.map(c => (
                <button
                  key={c}
                  className={`habits-color-dot ${newColor === c ? 'habits-color-dot--selected' : ''}`}
                  style={{ '--habit-color': accentToHex(c) } as React.CSSProperties}
                  onClick={() => setNewColor(c)}
                  title={c}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="habits-form-submit" onClick={handleAddHabit}>Add</button>
            <button className="habits-form-cancel" onClick={() => setShowAddForm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
