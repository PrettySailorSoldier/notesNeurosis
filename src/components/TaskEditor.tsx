import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Task, TaskType, ReminderSound, PageType, TaskListBoard } from '../types';
import { TaskItem } from './TaskItem';
import { BoardTabStrip } from './BoardTabStrip';
import styles from './TaskEditor.module.css';

interface Props {
  boards: TaskListBoard[];
  onBoardsChange: (boards: TaskListBoard[]) => void;
  legacyTasks?: Task[];       // one-time migration
  onSetReminder: (taskId: string, intervalMinutes: number, sound: ReminderSound, alarmEnabled?: boolean) => void;
  onClearReminder: (taskId: string) => void;
  pageType?: PageType;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function makeTask(type: TaskType = 'plain'): Task {
  return {
    id: makeId(),
    content: '',
    type,
    completed: false,
    createdAt: Date.now(),
  };
}

export const TaskEditor: React.FC<Props> = ({
  boards,
  onBoardsChange,
  legacyTasks,
  onSetReminder,
  onClearReminder,
  pageType,
}) => {
  const [activeBoardId, setActiveBoardId] = useState<string>('');
  // Drag state — we use refs during the drag so React never re-renders mid-drag
  // (any setState during a drag severs the browser's dragged-element reference → 🚫)
  const [draggedId, setDraggedId] = useState<string | null>(null);   // for opacity dimming only
  const draggedIdRef = useRef<string | null>(null);
  const pendingOrderRef = useRef<string[]>([]);  // IDs in the intended final order
  const rowRefsMap = useRef<Map<string, HTMLDivElement>>(new Map()); // for direct DOM highlight
  const highlightedRowId = useRef<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);

  // One-time migration from flat tasks to taskListBoards
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (boards.length === 0) {
      const seed: TaskListBoard = {
        id: crypto.randomUUID(),
        name: 'List 1',
        tasks: legacyTasks && legacyTasks.length > 0
          ? legacyTasks
          : [{ id: crypto.randomUUID(), content: '', type: 'plain', completed: false, createdAt: Date.now() }],
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

  // Clear selection when switching boards
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeBoardId]);

  const activeBoard = boards.find(b => b.id === activeBoardId) ?? boards[0];
  const tasks = activeBoard?.tasks ?? [];

  // Board CRUD helpers
  const addBoard = () => {
    const n = boards.length + 1;
    const b: TaskListBoard = {
      id: crypto.randomUUID(),
      name: `List ${n}`,
      tasks: [{ id: crypto.randomUUID(), content: '', type: 'plain', completed: false, createdAt: Date.now() }],
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

  const updateActiveTasks = useCallback((newTasks: Task[]) => {
    if (!activeBoard) return;
    onBoardsChange(boards.map(b => b.id === activeBoard.id ? { ...b, tasks: newTasks } : b));
  }, [boards, activeBoard, onBoardsChange]);

  const handleUpdate = useCallback((updated: Task) => {
    updateActiveTasks(tasks.map(t => t.id === updated.id ? updated : t));
  }, [tasks, updateActiveTasks]);

  const handleDelete = useCallback((id: string) => {
    const next = tasks.filter(t => t.id !== id);
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    updateActiveTasks(next.length > 0 ? next : [makeTask('plain')]);
  }, [tasks, updateActiveTasks]);

  const handleAddAfter = useCallback((afterId: string, type: TaskType) => {
    const idx = tasks.findIndex(t => t.id === afterId);
    const defaultType = pageType === 'todo' ? 'checkbox' : 'plain';
    const newTask = makeTask(type === 'heading' ? defaultType : type);
    const next = [...tasks];
    next.splice(idx + 1, 0, newTask);
    updateActiveTasks(next);
  }, [tasks, updateActiveTasks, pageType]);

  const handleMergePrev = useCallback((id: string) => {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === 0) return;
    handleDelete(id);
  }, [tasks, handleDelete]);

  const handleDragStart = useCallback((id: string) => {
    draggedIdRef.current = id;
    pendingOrderRef.current = tasks.map(t => t.id);
    setDraggedId(id); // only state update before drag starts — safe
  }, [tasks]);

  const handleDragEnter = useCallback((targetId: string) => {
    const srcId = draggedIdRef.current;
    if (!srcId || srcId === targetId) return;
    if (highlightedRowId.current === targetId) return;
    // Recompute intended order in ref — NO state updates → NO re-renders during drag
    const ids = [...pendingOrderRef.current];
    const srcIdx = ids.indexOf(srcId);
    const tgtIdx = ids.indexOf(targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    ids.splice(srcIdx, 1);
    ids.splice(tgtIdx, 0, srcId);
    pendingOrderRef.current = ids;
    // Direct DOM mutation for the drop-target highlight — bypasses React entirely
    if (highlightedRowId.current) {
      const prev = rowRefsMap.current.get(highlightedRowId.current);
      if (prev) prev.style.borderTop = '2px solid transparent';
    }
    const el = rowRefsMap.current.get(targetId);
    if (el) el.style.borderTop = '2px solid rgba(180,130,220,0.7)';
    highlightedRowId.current = targetId;
  }, []);

  const handleDragEnd = useCallback(() => {
    // Clear DOM highlight
    if (highlightedRowId.current) {
      const el = rowRefsMap.current.get(highlightedRowId.current);
      if (el) el.style.borderTop = '2px solid transparent';
      highlightedRowId.current = null;
    }
    // Now that the drag session is done, commit the new order to state
    const srcId = draggedIdRef.current;
    const ids = pendingOrderRef.current;
    if (srcId && ids.length > 0) {
      const taskMap = new Map(tasks.map(t => [t.id, t]));
      const reordered = ids.map(id => taskMap.get(id)).filter(Boolean) as Task[];
      if (reordered.length === tasks.length) {
        updateActiveTasks(reordered);
      }
    }
    draggedIdRef.current = null;
    pendingOrderRef.current = [];
    setDraggedId(null);
  }, [tasks, updateActiveTasks]);

  // --- Multi-select ---
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = tasks.length > 0 && selectedIds.size === tasks.length;

  const handleSelectAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(tasks.map(t => t.id)));
  }, [allSelected, tasks]);

  const handleCopySelected = useCallback(async () => {
    const text = tasks
      .filter(t => selectedIds.has(t.id))
      .map(t => t.content)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setSelectedIds(new Set());
  }, [tasks, selectedIds]);

  const handleDeleteSelected = useCallback(() => {
    const next = tasks.filter(t => !selectedIds.has(t.id));
    updateActiveTasks(next.length > 0 ? next : [makeTask('plain')]);
    setSelectedIds(new Set());
  }, [tasks, selectedIds, updateActiveTasks]);

  const handleClearCompleted = useCallback(() => {
    const next = tasks.filter(t => !(t.type === 'checkbox' && t.completed));
    updateActiveTasks(next.length > 0 ? next : [makeTask('checkbox')]);
  }, [tasks, updateActiveTasks]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'a') {
      const active = document.activeElement;
      if (active && (active as HTMLElement).contentEditable === 'true') return;
      e.preventDefault();
      handleSelectAll();
    }
  }, [handleSelectAll]);

  if (!activeBoard) return null;

  // Status strip derived values (todo pages only)
  const checkboxTasks = tasks.filter(t => t.type === 'checkbox');
  const completedCount = checkboxTasks.filter(t => t.completed).length;
  const totalCheckbox = checkboxTasks.length;
  const hasCompleted = completedCount > 0;
  const allDone = totalCheckbox > 0 && completedCount === totalCheckbox;

  // Soft-sink completed checkboxes to bottom — but skip reordering while dragging
  // so the dragged element doesn't visually jump out of position mid-drag.
  const displayTasks = draggedId
    ? tasks
    : [
        ...tasks.filter(t => !(t.type === 'checkbox' && t.completed)),
        ...tasks.filter(t => t.type === 'checkbox' && t.completed),
      ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <BoardTabStrip
        tabs={boards.map(b => ({ id: b.id, name: b.name }))}
        activeId={activeBoardId}
        onSelect={setActiveBoardId}
        onRename={renameBoard}
        onAdd={addBoard}
        onDelete={deleteBoard}
        addLabel="+ list"
      />
      <div className={styles.editor} onKeyDown={handleKeyDown}>
        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className={styles.bulkBar}>
            <span className={styles.bulkCount}>
              {selectedIds.size} of {tasks.length} selected
            </span>
            <button className={styles.bulkBtn} onClick={handleSelectAll}>
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            <button className={styles.bulkBtn} onClick={handleCopySelected}>
              Copy
            </button>
            <button className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`} onClick={handleDeleteSelected}>
              Delete
            </button>
            <button className={`${styles.bulkBtn} ${styles.bulkBtnCancel}`} onClick={() => setSelectedIds(new Set())}>
              ✕
            </button>
          </div>
        )}

        {/* Status strip — todo pages with at least one checkbox task */}
        {pageType === 'todo' && totalCheckbox > 0 && (
          <div className={styles.statusStrip}>
            <span className={styles.statusCount}>
              {completedCount}/{totalCheckbox} done
            </span>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${Math.round((completedCount / totalCheckbox) * 100)}%` }}
              />
            </div>
            {hasCompleted && (
              <button
                className={styles.clearBtn}
                onClick={handleClearCompleted}
                title="Remove completed tasks"
              >
                clear ✓
              </button>
            )}
          </div>
        )}

        {displayTasks.map((task, i) => (
          <div
            key={task.id}
            ref={el => {
              if (el) rowRefsMap.current.set(task.id, el);
              else rowRefsMap.current.delete(task.id);
            }}
            style={{
              opacity: draggedId === task.id ? 0.3 : 1,
              borderTop: '2px solid transparent',
              transition: 'border-color 0.1s',
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              handleDragEnter(task.id);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => e.preventDefault()}
          >
            <TaskItem
              task={task}
              isNew={i === tasks.length - 1 && task.content === ''}
              autoFocus={i === 0 && task.content === '' && tasks.length === 1}
              placeholder={pageType === 'todo' ? "Get 'er done…" : 'Note…'}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onAddAfter={handleAddAfter}
              onMergePrev={handleMergePrev}
              onSetReminder={onSetReminder}
              onClearReminder={onClearReminder}
              onDragStart={handleDragStart}
              onDragEnter={handleDragEnter}
              onDragEnd={handleDragEnd}
              selected={selectedIds.has(task.id)}
              onSelect={toggleSelect}
            />
          </div>
        ))}

        {allDone && pageType === 'todo' && (
          <div className={styles.allDoneState}>
            ✦ all clear ✦
          </div>
        )}
      </div>
    </div>
  );
};
