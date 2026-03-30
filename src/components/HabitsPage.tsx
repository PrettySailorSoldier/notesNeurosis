import React, { useState } from 'react';
import { useHabits } from '../hooks/useHabits';
import { accentToHex } from '../utils/accentToHex';
import type { AccentColor } from '../types';
import '../styles/habits.css';

const ACCENT_COLORS: AccentColor[] = ['plum', 'rose', 'peach', 'orange', 'yellow', 'blue', 'ghost'];

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns 35 dates (5 complete weeks, Sun–Sat) covering the most recent 5 weeks. */
function getLast35Days(): string[] {
  const today = new Date();
  // Sunday of the current week
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  // Go back 4 more weeks to get 5 weeks total
  const start = new Date(sunday);
  start.setDate(sunday.getDate() - 28);

  return Array.from({ length: 35 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return formatDate(d);
  });
}

interface Props {
  pageId: string;
}

export function HabitsPage({ pageId: _pageId }: Props) {
  const {
    habits,
    ready,
    addHabit,
    removeHabit,
    isLogged,
    toggleLog,
    getStreakForHabit,
  } = useHabits();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [newColor, setNewColor] = useState<AccentColor>('plum');

  const todayISO = formatDate(new Date());
  const dotDates = getLast35Days();
  const activeHabits = habits.filter(h => !h.archivedAt);

  const handleAddHabit = () => {
    const name = newName.trim();
    if (!name) return;
    addHabit(name, newEmoji || '●', newColor);
    setNewName('');
    setNewEmoji('');
    setNewColor('plum');
    setShowAddForm(false);
  };

  if (!ready) {
    return <div className="loading-hint">✦</div>;
  }

  return (
    <div className="habits-page">
      {/* Header */}
      <div className="habits-header">
        <h2 className="habits-title">Rhythm Tracker</h2>
        <p className="habits-subtitle">No streaks. Just patterns.</p>
        <button
          className="habits-add-btn"
          onClick={() => setShowAddForm(true)}
        >
          + habit
        </button>
      </div>

      {/* Habit cards */}
      {activeHabits.map(habit => {
        const streak = getStreakForHabit(habit.id);
        const hexColor = accentToHex(habit.color);

        return (
          <div key={habit.id} className="habits-card">
            <div className="habits-card__header">
              <span className="habits-card__emoji">{habit.emoji}</span>
              <span className="habits-card__name">{habit.name}</span>
              {streak > 0 && (
                <span className="habits-card__streak">{streak}d</span>
              )}
              <button
                className="habits-card__archive"
                onClick={() => removeHabit(habit.id)}
                title="Archive habit"
              >
                ×
              </button>
            </div>

            {/* Dot grid: 5 weeks × 7 days */}
            <div className="habits-dot-grid">
              <div className="habits-dot-weekdays">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
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
          </div>
        );
      })}

      {activeHabits.length === 0 && !showAddForm && (
        <div style={{ color: 'var(--text-faint)', fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginTop: 24 }}>
          No habits yet — click <em>+ habit</em> to begin.
        </div>
      )}

      {/* Add form */}
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="habits-form-submit" onClick={handleAddHabit}>Add</button>
            <button className="habits-form-cancel" onClick={() => setShowAddForm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
