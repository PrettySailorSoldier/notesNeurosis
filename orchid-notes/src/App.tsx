import { useCallback, useRef, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TaskEditor } from './components/TaskEditor';
import { useStore } from './hooks/useStore';
import { useReminders } from './hooks/useReminders';
import { useImageProcessor } from './hooks/useImageProcessor';
import type { Task, Reminder, ReminderSound } from './types';
import orchidFrame from './assets/orchid.png';
import './App.css';

const appWindow = getCurrentWindow();

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(fn: () => void) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(fn, 500);
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function App() {
  const { tasks, setTasks, saveTasks, ready } = useStore();
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const handleUpdateReminder = useCallback((taskId: string, reminder: Reminder | undefined) => {
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id !== taskId) return t;
        return { ...t, reminder };
      });
      debouncedSave(() => saveTasks(next));
      return next;
    });
  }, [setTasks, saveTasks]);

  useReminders(tasks, handleUpdateReminder);

  const handleTasksChange = useCallback((updated: Task[]) => {
    setTasks(updated);
    debouncedSave(() => saveTasks(updated));
  }, [setTasks, saveTasks]);

  const handleSetReminder = useCallback((taskId: string, intervalMinutes: number, sound: ReminderSound) => {
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id !== taskId) return t;
        const reminder: Reminder = {
          id: makeId(),
          taskId,
          intervalMinutes,
          fireAt: Date.now() + intervalMinutes * 60 * 1000,
          label: `every ${intervalMinutes}m`,
          sound,
          active: true,
        };
        return { ...t, reminder };
      });
      debouncedSave(() => saveTasks(next));
      return next;
    });
  }, [setTasks, saveTasks]);

  const handleClearReminder = useCallback((taskId: string) => {
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id !== taskId) return t;
        return { ...t, reminder: undefined };
      });
      debouncedSave(() => saveTasks(next));
      return next;
    });
  }, [setTasks, saveTasks]);

  // Unlock AudioContext on first user interaction
  useEffect(() => {
    function unlock() {
      try {
        const ctx = new AudioContext();
        ctx.resume().then(() => ctx.close());
      } catch (_) {}
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    }
    document.addEventListener('click', unlock, true);
    document.addEventListener('keydown', unlock, true);
    return () => {
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
  }, []);

  const processedFrameParams = useImageProcessor(orchidFrame);

  return (
    <div className="frame-container">
      {/* Orchid frame image — white pixels stripped by Canvas */}
      {processedFrameParams && (
        <img
          src={processedFrameParams}
          className="orchid-frame"
          alt=""
          draggable={false}
        />
      )}

      {/* Drag region — top 80px, over the circular ornament */}
      <div className="drag-region" data-tauri-drag-region />

      {/* Window controls — close & minimize */}
      <div className="window-controls">
        <button
          className="win-btn win-minimize"
          onClick={() => appWindow.minimize()}
          title="Minimize"
        >−</button>
        <button
          className="win-btn win-maximize"
          onClick={() => appWindow.toggleMaximize()}
          title="Maximize"
        >▢</button>
        <button
          className="win-btn win-close"
          onClick={() => appWindow.close()}
          title="Close"
        >×</button>
      </div>

      {/* Writing zone */}
      <div className="writing-zone">
        {ready && (
          <TaskEditor
            tasks={tasks}
            onChange={handleTasksChange}
            onSetReminder={handleSetReminder}
            onClearReminder={handleClearReminder}
          />
        )}
        {!ready && (
          <div className="loading-hint">✦</div>
        )}
      </div>
    </div>
  );
}
