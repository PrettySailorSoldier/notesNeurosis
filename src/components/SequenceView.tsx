import { useState, useRef, useCallback, useEffect } from 'react';
import type { SequenceTask, SequenceStatus, SequenceBoard } from '../types';
import { BoardTabStrip } from './BoardTabStrip';
import styles from './SequenceView.module.css';

interface Props {
  boards: SequenceBoard[];
  onBoardsChange: (boards: SequenceBoard[]) => void;
  legacyTasks?: SequenceTask[];   // one-time migration
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

export const SequenceView: React.FC<Props> = ({ boards, onBoardsChange, legacyTasks }) => {
  const [activeBoardId, setActiveBoardId] = useState<string>('');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  // One-time migration from flat sequenceTasks to sequenceBoards
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (boards.length === 0) {
      const seed: SequenceBoard = {
        id: crypto.randomUUID(),
        name: 'Sequence 1',
        tasks: legacyTasks && legacyTasks.length > 0
          ? legacyTasks
          : [makeTask('')],
        createdAt: Date.now(),
      };
      onBoardsChange([seed]);
      setActiveBoardId(seed.id);
    } else {
      setActiveBoardId(boards[0].id);
    }
  }, []);

  // Snap active board if it becomes stale
  useEffect(() => {
    if (boards.length > 0 && !boards.find(b => b.id === activeBoardId)) {
      setActiveBoardId(boards[0].id);
    }
  }, [boards, activeBoardId]);

  // Clear transient UI state when switching boards
  useEffect(() => {
    setExpandedNotes(new Set());
    setEditingId(null);
  }, [activeBoardId]);

  const activeBoard = boards.find(b => b.id === activeBoardId) ?? boards[0];
  const tasks = activeBoard?.tasks ?? [];

  // Board CRUD helpers
  const addBoard = () => {
    const n = boards.length + 1;
    const b: SequenceBoard = {
      id: crypto.randomUUID(),
      name: `Sequence ${n}`,
      tasks: [makeTask('')],
      createdAt: Date.now(),
    };
    onBoardsChange([...boards, b]);
    setActiveBoardId(b.id);
  };

  const deleteBoard = (id: string) => {
    if (boards.length <= 1) return;
    const remaining = boards.filter(b => b.id !== id);
    onBoardsChange(remaining);
    if (activeBoardId === id) setActiveBoardId(remaining[0].id);
  };

  const renameBoard = (id: string, name: string) => {
    onBoardsChange(boards.map(b => b.id === id ? { ...b, name } : b));
  };

  const updateActiveTasks = useCallback((newTasks: SequenceTask[]) => {
    if (!activeBoard) return;
    onBoardsChange(boards.map(b => b.id === activeBoard.id ? { ...b, tasks: newTasks } : b));
  }, [boards, activeBoard, onBoardsChange]);

  const firstPendingIndex = tasks.findIndex(t => t.status === 'pending');
  const allDone = tasks.length > 0 && tasks.every(t => t.status === 'done' || t.status === 'skipped');
  const sessionStarted = tasks.some(t => t.status === 'active' || t.status === 'done' || t.status === 'skipped');

  // ── Sequence controls ──────────────────────────────────────────────

  const startSequence = useCallback(() => {
    if (firstPendingIndex === -1) return;
    updateActiveTasks(tasks.map((t, i) =>
      i === firstPendingIndex ? { ...t, status: 'active' as SequenceStatus } : t
    ));
  }, [tasks, firstPendingIndex, updateActiveTasks]);

  const advanceToNext = useCallback((currentId: string, markAs: 'done' | 'skipped') => {
    const updated = tasks.map(t =>
      t.id === currentId ? { ...t, status: markAs as SequenceStatus } : t
    );
    const nextPending = updated.findIndex(t => t.status === 'pending');
    const final = updated.map((t, i) =>
      i === nextPending ? { ...t, status: 'active' as SequenceStatus } : t
    );
    updateActiveTasks(final);
  }, [tasks, updateActiveTasks]);

  const resetAll = useCallback(() => {
    updateActiveTasks(tasks.map(t => ({ ...t, status: 'pending' as SequenceStatus })));
  }, [tasks, updateActiveTasks]);

  // ── Task editing ───────────────────────────────────────────────────

  const updateTask = useCallback((id: string, patch: Partial<SequenceTask>) => {
    updateActiveTasks(tasks.map(t => t.id === id ? { ...t, ...patch } : t));
  }, [tasks, updateActiveTasks]);

  const addTaskAfter = useCallback((afterId: string) => {
    const idx = tasks.findIndex(t => t.id === afterId);
    const newTask = makeTask('');
    const next = [...tasks];
    next.splice(idx + 1, 0, newTask);
    updateActiveTasks(next);
    setEditingId(newTask.id);
  }, [tasks, updateActiveTasks]);

  const deleteTask = useCallback((id: string) => {
    const next = tasks.filter(t => t.id !== id);
    updateActiveTasks(next.length > 0 ? next : [makeTask('')]);
  }, [tasks, updateActiveTasks]);

  const addTaskAtEnd = useCallback(() => {
    const newTask = makeTask('');
    updateActiveTasks([...tasks, newTask]);
    setEditingId(newTask.id);
  }, [tasks, updateActiveTasks]);

  // Drag reorder — only among pending tasks
  const dragId = useRef<string | null>(null);
  const pendingDragOrder = useRef<string[]>([]);

  const handleDragStart = (id: string) => {
    dragId.current = id;
    pendingDragOrder.current = tasks.map(t => t.id);
  };
  const handleDragEnter = (targetId: string) => {
    if (!dragId.current || dragId.current === targetId) return;
    const dragged = tasks.find(t => t.id === dragId.current);
    if (!dragged || dragged.status !== 'pending') return;
    const target = tasks.find(t => t.id === targetId);
    if (!target || target.status !== 'pending') return;
    // Recompute order in ref — no React state updates during drag
    const ids = [...pendingDragOrder.current];
    const fromIdx = ids.indexOf(dragId.current);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragId.current);
    pendingDragOrder.current = ids;
  };
  const handleDragEnd = () => {
    const srcId = dragId.current;
    const ids = pendingDragOrder.current;
    if (srcId && ids.length > 0) {
      const taskMap = new Map(tasks.map(t => [t.id, t]));
      const reordered = ids.map(id => taskMap.get(id)).filter(Boolean) as SequenceTask[];
      if (reordered.length === tasks.length) updateActiveTasks(reordered);
    }
    dragId.current = null;
    pendingDragOrder.current = [];
  };

  const toggleNotes = (id: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────

  if (!activeBoard) return null;

  return (
    <div className={styles.root}>
      <BoardTabStrip
        tabs={boards.map(b => ({ id: b.id, name: b.name }))}
        activeId={activeBoardId}
        onSelect={setActiveBoardId}
        onRename={renameBoard}
        onAdd={addBoard}
        onDelete={deleteBoard}
        addLabel="+ sequence"
      />

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
