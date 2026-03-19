import { useState } from 'react';
import type { GoalEntry } from '../types';
import styles from './GoalsView.module.css';

interface Props {
  goals: GoalEntry[];
  onChange: (goals: GoalEntry[]) => void;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function GoalsView({ goals, onChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const shortGoals = goals.filter(g => g.horizon === 'short');
  const longGoals = goals.filter(g => g.horizon === 'long');

  const addGoal = (horizon: 'short' | 'long') => {
    const newGoal: GoalEntry = {
      id: makeId(),
      title: '',
      notes: '',
      horizon,
      completed: false,
      createdAt: Date.now(),
    };
    onChange([...goals, newGoal]);
    setExpandedId(newGoal.id);
  };

  const updateGoal = (id: string, changes: Partial<GoalEntry>) => {
    onChange(goals.map(g => g.id === id ? { ...g, ...changes } : g));
  };

  const removeGoal = (id: string) => {
    onChange(goals.filter(g => g.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const toggleComplete = (id: string) => {
    onChange(goals.map(g => g.id === id ? { ...g, completed: !g.completed } : g));
  };

  const shortDone = shortGoals.filter(g => g.completed).length;
  const longDone = longGoals.filter(g => g.completed).length;

  return (
    <div className={styles.container}>
      <GoalSection
        title="Short-term"
        subtitle="Days to weeks"
        goals={shortGoals}
        doneCount={shortDone}
        expandedId={expandedId}
        onExpand={setExpandedId}
        onAdd={() => addGoal('short')}
        onUpdate={updateGoal}
        onRemove={removeGoal}
        onToggle={toggleComplete}
        accentClass={styles.accentShort}
      />
      <div className={styles.divider} />
      <GoalSection
        title="Long-term"
        subtitle="Months to years"
        goals={longGoals}
        doneCount={longDone}
        expandedId={expandedId}
        onExpand={setExpandedId}
        onAdd={() => addGoal('long')}
        onUpdate={updateGoal}
        onRemove={removeGoal}
        onToggle={toggleComplete}
        accentClass={styles.accentLong}
      />
    </div>
  );
}

interface SectionProps {
  title: string;
  subtitle: string;
  goals: GoalEntry[];
  doneCount: number;
  expandedId: string | null;
  accentClass: string;
  onExpand: (id: string | null) => void;
  onAdd: () => void;
  onUpdate: (id: string, changes: Partial<GoalEntry>) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
}

function GoalSection({
  title, subtitle, goals, doneCount, expandedId, accentClass,
  onExpand, onAdd, onUpdate, onRemove, onToggle
}: SectionProps) {
  const total = goals.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={`${styles.sectionTitle} ${accentClass}`}>{title}</h2>
          <span className={styles.sectionSubtitle}>{subtitle}</span>
        </div>
        {total > 0 && (
          <span className={styles.progress}>{doneCount}/{total} · {pct}%</span>
        )}
      </div>

      {total > 0 && (
        <div className={styles.progressBar}>
          <div className={`${styles.progressFill} ${accentClass}`} style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className={styles.goalList}>
        {goals.length === 0 && (
          <div className={styles.emptyHint}>No goals yet.</div>
        )}
        {goals.map(goal => {
          const isExpanded = expandedId === goal.id;
          return (
            <div key={goal.id} className={`${styles.goalCard} ${goal.completed ? styles.done : ''}`}>
              <div className={styles.goalRow}>
                <button
                  className={`${styles.checkBtn} ${goal.completed ? styles.checked : ''}`}
                  onClick={() => onToggle(goal.id)}
                  title={goal.completed ? 'Mark incomplete' : 'Mark complete'}
                />
                <input
                  className={styles.goalTitle}
                  value={goal.title}
                  placeholder="Goal..."
                  onChange={e => onUpdate(goal.id, { title: e.target.value })}
                  onClick={() => onExpand(isExpanded ? null : goal.id)}
                />
                <button
                  className={styles.expandBtn}
                  onClick={() => onExpand(isExpanded ? null : goal.id)}
                  title={isExpanded ? 'Collapse' : 'Add notes'}
                >
                  {isExpanded ? '▲' : '▾'}
                </button>
                <button
                  className={styles.removeBtn}
                  onClick={() => onRemove(goal.id)}
                  title="Remove"
                >×</button>
              </div>
              {isExpanded && (
                <textarea
                  className={styles.goalNotes}
                  value={goal.notes}
                  placeholder="Notes, milestones, context..."
                  rows={3}
                  onChange={e => {
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                    onUpdate(goal.id, { notes: e.target.value });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <button className={styles.addBtn} onClick={onAdd}>+ add goal</button>
    </div>
  );
}
