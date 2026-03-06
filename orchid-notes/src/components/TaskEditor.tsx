import React, { useCallback, useEffect } from 'react';
import type { Task, TaskType, ReminderSound } from '../types';
import { TaskItem } from './TaskItem';
import styles from './TaskEditor.module.css';

interface Props {
  tasks: Task[];
  onChange: (tasks: Task[]) => void;
  onSetReminder: (taskId: string, intervalMinutes: number, sound: ReminderSound) => void;
  onClearReminder: (taskId: string) => void;
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

export const TaskEditor: React.FC<Props> = ({ tasks, onChange, onSetReminder, onClearReminder }) => {
  // Ensure there's always at least one task
  useEffect(() => {
    if (tasks.length === 0) {
      onChange([makeTask('plain')]);
    }
  }, [tasks, onChange]);

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

  if (tasks.length === 0) return null;

  return (
    <div className={styles.editor}>
      {tasks.map((task, i) => (
        <TaskItem
          key={task.id}
          task={task}
          isNew={i === tasks.length - 1 && task.content === ''}
          autoFocus={i === 0 && task.content === '' && tasks.length === 1}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAddAfter={handleAddAfter}
          onMergePrev={handleMergePrev}
          onSetReminder={onSetReminder}
          onClearReminder={onClearReminder}
        />
      ))}
    </div>
  );
};
