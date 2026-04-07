import { useState, useRef, useCallback, useEffect } from 'react';
import type { SequenceTask, SequenceStatus } from '../types';
import styles from './SequenceView.module.css';

interface Props {
  tasks: SequenceTask[];
  onChange: (tasks: SequenceTask[]) => void;
}

function makeTask(content = ''): SequenceTask {
  return {
    id: crypto.randomUUID(),
    content,
    notes: '',
    status: 'pending',
    createdAt: Date.now(),
  };
}

export const SequenceView: React.FC<Props> = ({ tasks, onChange }) => {
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Seed one empty task if list is empty
  useEffect(() => {
    if (tasks.length === 0) {
      onChange([makeTask('')]);
    }
  }, []);

  const activeIndex = tasks.findIndex(t => t.status === 'active');
  const firstPendingIndex = tasks.findIndex(t => t.status === 'pending');
  const allDone = tasks.length > 0 && tasks.every(t => t.status === 'done' || t.status === 'skipped');
  const sessionStarted = tasks.some(t => t.status === 'active' || t.status === 'done' || t.status === 'skipped');

  // ── Sequence controls ──────────────────────────────────────────────

  const startSequence = useCallback(() => {
    if (firstPendingIndex === -1) return;
    onChange(tasks.map((t, i) =>
      i === firstPendingIndex ? { ...t, status: 'active' as SequenceStatus } : t
    ));
  }, [tasks, firstPendingIndex, onChange]);

  const advanceToNext = useCallback((currentId: string, markAs: 'done' | 'skipped') => {
    const updated = tasks.map(t =>
      t.id === currentId ? { ...t, status: markAs as SequenceStatus } : t
    );
    // Find next pending
    const nextPending = updated.findIndex(t => t.status === 'pending');
    const final = updated.map((t, i) =>
      i === nextPending ? { ...t, status: 'active' as SequenceStatus } : t
    );
    onChange(final);
  }, [tasks, onChange]);

  const resetAll = useCallback(() => {
    onChange(tasks.map(t => ({ ...t, status: 'pending' as SequenceStatus })));
  }, [tasks, onChange]);

  // ── Task editing ───────────────────────────────────────────────────

  const updateTask = useCallback((id: string, patch: Partial<SequenceTask>) => {
    onChange(tasks.map(t => t.id === id ? { ...t, ...patch } : t));
  }, [tasks, onChange]);

  const addTaskAfter = useCallback((afterId: string) => {
    const idx = tasks.findIndex(t => t.id === afterId);
    const newTask = makeTask('');
    const next = [...tasks];
    next.splice(idx + 1, 0, newTask);
    onChange(next);
    setEditingId(newTask.id);
  }, [tasks, onChange]);

  const deleteTask = useCallback((id: string) => {
    const next = tasks.filter(t => t.id !== id);
    onChange(next.length > 0 ? next : [makeTask('')]);
  }, [tasks, onChange]);

  const addTaskAtEnd = useCallback(() => {
    const newTask = makeTask('');
    onChange([...tasks, newTask]);
    setEditingId(newTask.id);
  }, [tasks, onChange]);

  // Drag reorder — only among pending tasks
  const dragId = useRef<string | null>(null);

  const handleDragStart = (id: string) => { dragId.current = id; };
  const handleDragEnter = (targetId: string) => {
    if (!dragId.current || dragId.current === targetId) return;
    const dragged = tasks.find(t => t.id === dragId.current);
    if (!dragged || dragged.status !== 'pending') return;
    const target = tasks.find(t => t.id === targetId);
    if (!target || target.status !== 'pending') return;
    const next = [...tasks];
    const fromIdx = next.findIndex(t => t.id === dragId.current);
    const toIdx = next.findIndex(t => t.id === targetId);
    const [removed] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, removed);
    onChange(next);
  };
  const handleDragEnd = () => { dragId.current = null; };

  const toggleNotes = (id: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>

      {/* ── Header bar ── */}
      <div className={styles.header}>
        {!sessionStarted && (
          <button
            className={styles.btnStart}
            onClick={startSequence}
            disabled={tasks.every(t => t.content.trim() === '')}
          >
            ▶ Start sequence
          </button>
        )}
        {sessionStarted && !allDone && (
          <span className={styles.progressLabel}>
            {tasks.filter(t => t.status === 'done').length} of {tasks.length} done
          </span>
        )}
        {allDone && (
          <span className={styles.allDoneLabel}>✦ All steps complete</span>
        )}
        {sessionStarted && (
          <button className={styles.btnReset} onClick={resetAll} title="Reset sequence">
            ↺ Reset
          </button>
        )}
        {!sessionStarted && (
          <button className={styles.btnAdd} onClick={addTaskAtEnd} title="Add step">
            + Add step
          </button>
        )}
      </div>

      {/* ── Task list ── */}
      <ol className={styles.list}>
        {tasks.map((task, index) => {
          const isActive = task.status === 'active';
          const isDone = task.status === 'done';
          const isSkipped = task.status === 'skipped';
          const isPending = task.status === 'pending';
          const notesOpen = expandedNotes.has(task.id);
          const isEditing = editingId === task.id;
          const draggable = isPending && !sessionStarted;

          return (
            <li
              key={task.id}
              className={[
                styles.step,
                isActive  ? styles.stepActive  : '',
                isDone    ? styles.stepDone    : '',
                isSkipped ? styles.stepSkipped : '',
                isPending && !isActive ? styles.stepPending : '',
              ].join(' ')}
              draggable={draggable}
              onDragStart={() => handleDragStart(task.id)}
              onDragEnter={() => handleDragEnter(task.id)}
              onDragEnd={handleDragEnd}
              onDragOver={e => e.preventDefault()}
            >
              {/* Step number / status icon */}
              <div className={styles.stepNum}>
                {isDone    ? '✓' :
                 isSkipped ? '—' :
                 isActive  ? '▶' :
                 `${index + 1}`}
              </div>

              {/* Main content */}
              <div className={styles.stepBody}>
                {isEditing ? (
                  <input
                    ref={inputRef}
                    className={styles.stepInput}
                    autoFocus
                    defaultValue={task.content}
                    placeholder="Describe this step…"
                    onBlur={e => {
                      updateTask(task.id, { content: e.target.value });
                      setEditingId(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        updateTask(task.id, { content: e.currentTarget.value });
                        setEditingId(null);
                        if (!sessionStarted) addTaskAfter(task.id);
                      }
                      if (e.key === 'Escape') setEditingId(null);
                      if (e.key === 'Backspace' && e.currentTarget.value === '') {
                        setEditingId(null);
                        deleteTask(task.id);
                      }
                    }}
                  />
                ) : (
                  <span
                    className={styles.stepLabel}
                    onDoubleClick={() => { if (!isDone && !isSkipped) setEditingId(task.id); }}
                    title={!isDone && !isSkipped ? 'Double-click to edit' : undefined}
                  >
                    {task.content || <em className={styles.placeholder}>Untitled step</em>}
                  </span>
                )}

                {/* Notes toggle + textarea */}
                <button
                  className={styles.notesToggle}
                  onClick={() => toggleNotes(task.id)}
                  title={notesOpen ? 'Collapse notes' : 'Expand notes'}
                >
                  {notesOpen ? '▲ notes' : '▼ notes'}
                </button>

                {notesOpen && (
                  <textarea
                    className={styles.notesArea}
                    placeholder="Context, sub-steps, links…"
                    value={task.notes}
                    onChange={e => updateTask(task.id, { notes: e.target.value })}
                  />
                )}
              </div>

              {/* Action buttons */}
              <div className={styles.stepActions}>
                {isActive && (
                  <>
                    <button
                      className={styles.btnDone}
                      onClick={() => advanceToNext(task.id, 'done')}
                      title="Mark done, advance"
                    >Done ✓</button>
                    <button
                      className={styles.btnSkip}
                      onClick={() => advanceToNext(task.id, 'skipped')}
                      title="Skip this step"
                    >Skip</button>
                  </>
                )}
                {isPending && !sessionStarted && (
                  <button
                    className={styles.btnDelete}
                    onClick={() => deleteTask(task.id)}
                    title="Remove step"
                    aria-label="Delete step"
                  >✕</button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Add step below list (only pre-session) */}
      {!sessionStarted && (
        <button className={styles.btnAddBottom} onClick={addTaskAtEnd}>
          + Add step
        </button>
      )}

    </div>
  );
};
