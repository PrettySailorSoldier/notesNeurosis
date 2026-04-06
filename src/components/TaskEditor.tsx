import React, { useCallback, useEffect, useState } from 'react';
import type { Task, TaskType, ReminderSound, PageType } from '../types';
import { TaskItem } from './TaskItem';
import styles from './TaskEditor.module.css';

interface Props {
  tasks: Task[];
  onChange: (tasks: Task[]) => void;
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

export const TaskEditor: React.FC<Props> = ({ tasks, onChange, onSetReminder, onClearReminder, pageType }) => {
  useEffect(() => {
    if (tasks.length === 0) {
      onChange([makeTask(pageType === 'todo' ? 'checkbox' : 'plain')]);
    }
  }, [tasks, onChange, pageType]);

  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Clear selection when task list changes significantly (page switch)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [pageType]);

  const handleUpdate = useCallback((updated: Task) => {
    onChange(tasks.map(t => t.id === updated.id ? updated : t));
  }, [tasks, onChange]);

  const handleDelete = useCallback((id: string) => {
    const next = tasks.filter(t => t.id !== id);
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    onChange(next.length > 0 ? next : [makeTask('plain')]);
  }, [tasks, onChange]);

  const handleAddAfter = useCallback((afterId: string, type: TaskType) => {
    const idx = tasks.findIndex(t => t.id === afterId);
    const defaultType = pageType === 'todo' ? 'checkbox' : 'plain';
    const newTask = makeTask(type === 'heading' ? defaultType : type);
    const next = [...tasks];
    next.splice(idx + 1, 0, newTask);
    onChange(next);
  }, [tasks, onChange, pageType]);

  const handleMergePrev = useCallback((id: string) => {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === 0) return;
    handleDelete(id);
  }, [tasks, handleDelete]);

  const handleDragStart = useCallback((id: string) => {
    setDraggedId(id);
  }, []);

  const handleDragEnter = useCallback((targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const next = [...tasks];
    const sourceIdx = next.findIndex(t => t.id === draggedId);
    const targetIdx = next.findIndex(t => t.id === targetId);
    const [removed] = next.splice(sourceIdx, 1);
    next.splice(targetIdx, 0, removed);
    onChange(next);
  }, [draggedId, tasks, onChange]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
  }, []);

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
    onChange(next.length > 0 ? next : [makeTask('plain')]);
    setSelectedIds(new Set());
  }, [tasks, selectedIds, onChange]);

  const handleClearCompleted = useCallback(() => {
    const next = tasks.filter(t => !(t.type === 'checkbox' && t.completed));
    onChange(next.length > 0 ? next : [makeTask('checkbox')]);
  }, [tasks, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'a') {
      // Only intercept if focus is NOT inside a contenteditable (let the text field handle its own Ctrl+A)
      const active = document.activeElement;
      if (active && (active as HTMLElement).contentEditable === 'true') return;
      e.preventDefault();
      handleSelectAll();
    }
  }, [handleSelectAll]);

  if (tasks.length === 0) return null;

  // Status strip derived values (todo pages only)
  const checkboxTasks = tasks.filter(t => t.type === 'checkbox');
  const completedCount = checkboxTasks.filter(t => t.completed).length;
  const totalCheckbox = checkboxTasks.length;
  const hasCompleted = completedCount > 0;
  const allDone = totalCheckbox > 0 && completedCount === totalCheckbox;

  // Soft-sink completed checkboxes to bottom (cosmetic only — drag still uses real `tasks`)
  const displayTasks = [
    ...tasks.filter(t => !(t.type === 'checkbox' && t.completed)),
    ...tasks.filter(t => t.type === 'checkbox' && t.completed),
  ];

  return (
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
        <div key={task.id} style={{ opacity: draggedId === task.id ? 0.3 : 1 }}>
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
  );
};
