import { useCallback, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TaskEditor } from './components/TaskEditor';
import { usePages } from './hooks/usePages';
import { useReminders } from './hooks/useReminders';

import { ClockDisplay } from './components/ClockDisplay';
import type { Task, Reminder, ReminderSound } from './types';
import orchidFrame from './assets/orchid.png';
import './App.css';

const appWindow = getCurrentWindow();

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function App() {
  const { 
    pages, 
    currentPageId, 
    currentPage, 
    ready, 
    addPage, 
    renamePage, 
    deletePage, 
    switchPage,
    updateTasksForPage 
  } = usePages();

  const handleUpdateReminder = useCallback((taskId: string, pageId: string, reminder: Reminder | undefined) => {
    const pageToUpdate = pages.find(p => p.id === pageId);
    if (!pageToUpdate) return;
    const nextTasks = pageToUpdate.tasks.map(t => {
      if (t.id !== taskId) return t;
      return { ...t, reminder };
    });
    updateTasksForPage(pageId, nextTasks);
  }, [pages, updateTasksForPage]);

  useReminders(pages, handleUpdateReminder);

  const handleTasksChange = useCallback((updated: Task[]) => {
    if (currentPageId) updateTasksForPage(currentPageId, updated);
  }, [currentPageId, updateTasksForPage]);

  const handleSetReminder = useCallback((taskId: string, intervalMinutes: number, sound: ReminderSound) => {
    if (!currentPage) return;
    const nextTasks = currentPage.tasks.map(t => {
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
    updateTasksForPage(currentPageId, nextTasks);
  }, [currentPage, currentPageId, updateTasksForPage]);

  const handleClearReminder = useCallback((taskId: string) => {
    if (!currentPage) return;
    const nextTasks = currentPage.tasks.map(t => {
      if (t.id !== taskId) return t;
      return { ...t, reminder: undefined };
    });
    updateTasksForPage(currentPageId, nextTasks);
  }, [currentPage, currentPageId, updateTasksForPage]);

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

  return (
    <div className="frame-container">
      {/* Orchid frame image */}
      <img
        src={orchidFrame}
        className="orchid-frame"
        alt=""
        draggable={false}
      />

      {/* Drag region — top 80px, over the circular ornament */}
      <div className="drag-region" data-tauri-drag-region />

      {/* Clock display placed inside the top circular ornament */}
      <ClockDisplay />

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

      {/* Page Tabs */}
      {ready && pages.length > 0 && (
        <div className="page-tabs">
          {pages.map(page => (
            <button
              key={page.id}
              className={`tab-btn ${page.id === currentPageId ? 'active' : ''}`}
              onClick={() => switchPage(page.id)}
              onDoubleClick={() => {
                const newName = prompt('Rename page:', page.name);
                if (newName) renamePage(page.id, newName);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (confirm(`Delete page "${page.name}"?`)) {
                  deletePage(page.id);
                }
              }}
            >
              {page.name}
            </button>
          ))}
          <button className="tab-btn tab-btn-add" onClick={() => addPage()}>+</button>
        </div>
      )}

      {/* Writing zone */}
      <div className="writing-zone">
        {ready && currentPage && (
          <TaskEditor
            tasks={currentPage.tasks}
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
