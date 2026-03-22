import React, { useCallback, useEffect } from 'react';
import type { Task, TaskType, ReminderSound, PageType } from '../types';
import { TaskItem } from './TaskItem';
import styles from './TaskEditor.module.css';

interface Props {
  tasks: Task[];
  onChange: (tasks: Task[]) => void;
  onSetReminder: (taskId: string, intervalMinutes: number, sound: ReminderSound) => void;
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
  // Ensure there's always at least one task
  useEffect(() => {
    if (tasks.length === 0) {
      onChange([makeTask('plain')]);
    }
  }, [tasks, onChange]);

  const [draggedId, setDraggedId] = React.useState<string | null>(null);

  const handleUpdate = useCallback((updated: Task) => {
    onChange(tasks.map(t => t.id === updated.id ? updated : t));
  }, [tasks, onChange]);

  const handleDelete = useCallback((id: string) => {
    const next = tasks.filter(t => t.id !== id);
    onChange(next.length > 0 ? next : [makeTask('plain')]);
  }, [tasks, onChange]);

  const handleAddAfter = useCallback((afterId: string, type: TaskType) => {
    const idx = tasks.findIndex(t => t.id === afterId);
    const newTask = makeTask(type === 'heading' ? 'plain' : type);
    const next = [...tasks];
    next.splice(idx + 1, 0, newTask);
    onChange(next);
  }, [tasks, onChange]);

  const handleMergePrev = useCallback((id: string) => {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === 0) return; // nothing to merge into
    handleDelete(id);
    // Focus will naturally go to previous item after delete re-render
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

  if (tasks.length === 0) return null;

  return (
    <div className={styles.editor}>
      {tasks.map((task, i) => (
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
          />
        </div>
      ))}
    </div>
  );
};
