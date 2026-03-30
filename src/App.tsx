import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TaskEditor } from './components/TaskEditor';
import { usePages } from './hooks/usePages';
import { useReminders } from './hooks/useReminders';
import { useSettings } from './hooks/useSettings';
import { OptionsModal } from './components/OptionsModal';
import { PlannerView } from './components/PlannerView';
import { IntervalView } from './components/IntervalView';
import { HabitsPage } from './components/HabitsPage';
import { MultiTodoView } from './components/MultiTodoView';
import { ContextMenu } from './components/ContextMenu';
import { ClockDisplay } from './components/ClockDisplay';
import type { Task, Reminder, ReminderSound, PageType, PlannerSubtype } from './types';
import appFrame from './assets/frame_blue_orchid.png';
import './App.css';

const appWindow = getCurrentWindow();

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Page type metadata
const PAGE_TYPES: { type: PageType; icon: string; label: string }[] = [
  { type: 'notes',    icon: '📝', label: 'Notes'         },
  { type: 'todo',     icon: '✅', label: 'To-Do'         },
  { type: 'interval', icon: '⏱', label: 'Interval'       },
  { type: 'planner',  icon: '📅', label: 'Planner'       },
  { type: 'habits',   icon: '◉',  label: 'Habit Tracker' },
  { type: 'multitodo', icon: '⊞', label: 'Multi-List'    },
];

const PLANNER_SUBTYPES: { sub: PlannerSubtype; icon: string; label: string }[] = [
  { sub: 'schedule',    icon: '🗓', label: 'Schedule'    },
  { sub: 'caregiving',  icon: '🩺', label: 'Caregiving'  },
  { sub: 'goals',       icon: '🎯', label: 'Goals'       },
];

function pageTypeIcon(type?: PageType, subtype?: PlannerSubtype): string {
  if (type === 'planner') {
    return PLANNER_SUBTYPES.find(s => s.sub === subtype)?.icon ?? '📅';
  }
  return PAGE_TYPES.find(p => p.type === type)?.icon ?? '📝';
}


interface TabContextMenu {
  x: number;
  y: number;
  pageId: string;
  phase: 'main' | 'type' | 'subtype';
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
    changePageType,
    updateTasksForPage,
    updateIntervalTasksForPage,
    updateGoalsForPage,
    updateTodoBoardsForPage,
    reorderPages,
  } = usePages();

  const { settings, addCustomTone, removeCustomTone, setVolume, updateSettings } = useSettings();
  const [showOptions, setShowOptions] = useState(false);
  const [tabMenu, setTabMenu] = useState<TabContextMenu | null>(null);
  const draggedTabId = useRef<string | null>(null);
  const tabDragHappened = useRef(false);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const dragOverTabIdRef = useRef<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const reorderPagesRef = useRef(reorderPages);
  useEffect(() => { reorderPagesRef.current = reorderPages; }, [reorderPages]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggedTabId.current || !dragStartPos.current) return;
      if (!isDragging.current) {
        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;
        if (dx * dx + dy * dy < 25) return;
        isDragging.current = true;
        tabDragHappened.current = true;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tabEl = el?.closest('[data-tab-id]') as HTMLElement | null;
      const hoveredId = tabEl?.dataset.tabId ?? null;
      const next = hoveredId && hoveredId !== draggedTabId.current ? hoveredId : null;
      if (next !== dragOverTabIdRef.current) {
        dragOverTabIdRef.current = next;
        setDragOverTabId(next);
      }
    };
    const onUp = () => {
      if (draggedTabId.current && isDragging.current && dragOverTabIdRef.current) {
        reorderPagesRef.current(draggedTabId.current, dragOverTabIdRef.current);
      }
      draggedTabId.current = null;
      dragStartPos.current = null;
      isDragging.current = false;
      dragOverTabIdRef.current = null;
      setDragOverTabId(null);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, []);

  const handleUpdateReminder = useCallback((taskId: string, pageId: string, reminder: Reminder | undefined) => {
    const pageToUpdate = pages.find(p => p.id === pageId);
    if (!pageToUpdate) return;
    const nextTasks = pageToUpdate.tasks.map(t => {
      if (t.id !== taskId) return t;
      return { ...t, reminder };
    });
    updateTasksForPage(pageId, nextTasks);
  }, [pages, updateTasksForPage]);

  const { ringingIds, stopRinging } = useReminders(pages, handleUpdateReminder, settings.customTones, settings.volume);

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

  const handleUpdateTimerSettings = useCallback((taskId: string, pageId: string, intervalMinutes: number, sound: ReminderSound) => {
    const pageToUpdate = pages.find(p => p.id === pageId);
    if (!pageToUpdate) return;
    const label = intervalMinutes >= 60
      ? `every ${intervalMinutes / 60}h`
      : `every ${intervalMinutes}m`;
    const nextTasks = pageToUpdate.tasks.map(t => {
      if (t.id !== taskId || !t.reminder) return t;
      return {
        ...t,
        reminder: {
          ...t.reminder,
          id: makeId(),
          intervalMinutes,
          sound,
          fireAt: Date.now() + intervalMinutes * 60 * 1000,
          label,
        },
      };
    });
    updateTasksForPage(pageId, nextTasks);
  }, [pages, updateTasksForPage]);

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

  // Context menu helpers
  const openTabMenu = (e: React.MouseEvent, pageId: string) => {
    e.preventDefault();
    setTabMenu({ x: e.clientX, y: e.clientY, pageId, phase: 'main' });
  };

  const closeTabMenu = () => setTabMenu(null);

  // Build context menu options based on current phase
  const buildMenuOptions = () => {
    if (!tabMenu) return [];
    const page = pages.find(p => p.id === tabMenu.pageId);
    if (!page) return [];

    if (tabMenu.phase === 'type') {
      return PAGE_TYPES.map(pt => ({
        icon: pt.icon,
        label: pt.label,
        onClick: () => {
          if (pt.type === 'planner') {
            setTabMenu(prev => prev ? { ...prev, phase: 'subtype' } : null);
          } else {
            changePageType(page.id, pt.type);
            closeTabMenu();
          }
        },
      }));
    }

    if (tabMenu.phase === 'subtype') {
      return PLANNER_SUBTYPES.map(ps => ({
        icon: ps.icon,
        label: ps.label,
        onClick: () => {
          changePageType(page.id, 'planner', ps.sub);
          closeTabMenu();
        },
      }));
    }

    // main phase
    const options: Parameters<typeof ContextMenu>[0]['options'] = [
      {
        icon: '🎨',
        label: 'Set page type →',
        onClick: () => setTabMenu(prev => prev ? { ...prev, phase: 'type' } : null),
      },
    ];

    if (page.pageType === 'planner') {
      options.push({
        icon: '🔀',
        label: 'Planner style →',
        onClick: () => setTabMenu(prev => prev ? { ...prev, phase: 'subtype' } : null),
      });
    }

    options.push({ label: '', divider: true, onClick: () => {} });
    options.push({
      icon: '✏️',
      label: 'Rename',
      onClick: () => {
        const newName = prompt('Rename page:', page.name);
        if (newName) renamePage(page.id, newName);
        closeTabMenu();
      },
    });
    options.push({
      icon: '🗑',
      label: 'Delete page',
      danger: true,
      onClick: () => {
        if (pages.length <= 1) return;
        deletePage(page.id);
        closeTabMenu();
      },
    });

    return options;
  };

  const renderPageContent = () => {
    if (!ready) return <div className="loading-hint">✦</div>;
    if (!currentPage) return null;

    const type = currentPage.pageType ?? 'notes';

    if (type === 'planner') {
      return (
        <PlannerView
          pageId={currentPage.id}
          subtype={currentPage.plannerSubtype ?? 'schedule'}
          goals={currentPage.goals ?? []}
          onGoalsChange={g => updateGoalsForPage(currentPage.id, g)}
        />
      );
    }

    if (type === 'interval') {
      return (
        <IntervalView
          tasks={currentPage.intervalTasks ?? []}
          onChange={t => updateIntervalTasksForPage(currentPage.id, t)}
          settings={settings}
          pageId={currentPage.id}
        />
      );
    }

    if (type === 'habits') {
      return <HabitsPage pageId={currentPage.id} />;
    }

    if (type === 'multitodo') {
      return (
        <MultiTodoView
          boards={currentPage.todoBoards ?? []}
          onChange={boards => updateTodoBoardsForPage(currentPage.id, boards)}
        />
      );
    }

    // notes + todo both use TaskEditor
    return (
      <TaskEditor
        tasks={currentPage.tasks}
        onChange={handleTasksChange}
        onSetReminder={handleSetReminder}
        onClearReminder={handleClearReminder}
        pageType={currentPage.pageType}
      />
    );
  };

  return (
    <div className="frame-container">
      {/* Application frame image */}
      <img
        src={appFrame}
        className="app-frame"
        alt=""
        draggable={false}
      />

      {/* Drag region */}
      <div className="drag-region" data-tauri-drag-region />

      {/* Clock display */}
      <ClockDisplay />

      {/* Window controls */}
      <div className="window-controls">
        <button
          className="win-btn win-options"
          onClick={() => setShowOptions(true)}
          title="Options"
        >⚙</button>
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
              data-tab-id={page.id}
              className={`tab-btn ${page.id === currentPageId ? 'active' : ''} ${dragOverTabId === page.id ? 'tab-drag-over' : ''}`}
              onClick={() => {
                if (tabDragHappened.current) { tabDragHappened.current = false; return; }
                switchPage(page.id);
              }}
              onDoubleClick={() => {
                const newName = prompt('Rename page:', page.name);
                if (newName) renamePage(page.id, newName);
              }}
              onContextMenu={e => openTabMenu(e, page.id)}
              title={`${page.name} — right-click to set type`}
              onPointerDown={e => {
                if (e.button !== 0) return;
                e.preventDefault();
                draggedTabId.current = page.id;
                dragStartPos.current = { x: e.clientX, y: e.clientY };
                isDragging.current = false;
                tabDragHappened.current = false;
              }}
            >
              <span className="tab-type-icon">{pageTypeIcon(page.pageType, page.plannerSubtype)}</span>
              {page.name}
            </button>
          ))}
          <button
            className="tab-btn tab-btn-add"
            onClick={() => addPage()}
            title="Add page"
          >+</button>
        </div>
      )}

      {/* Writing zone */}
      <div className={`writing-zone${(currentPage?.pageType === 'multitodo') ? ' writing-zone--board' : ''}`}>
        {renderPageContent()}
      </div>

      {/* Tab context menu */}
      {tabMenu && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          onClose={closeTabMenu}
          options={buildMenuOptions()}
        />
      )}

      {/* Options Modal */}
      {showOptions && (
        <OptionsModal
          pages={pages}
          ringingIds={ringingIds}
          settings={settings}
          onClose={() => setShowOptions(false)}
          onStopRinging={stopRinging}
          onClearReminder={(taskId, pageId) => {
            const pageToUpdate = pages.find(p => p.id === pageId);
            if (!pageToUpdate) return;
            const nextTasks = pageToUpdate.tasks.map(t => t.id === taskId ? { ...t, reminder: undefined } : t);
            updateTasksForPage(pageId, nextTasks);
          }}
          onUpdateTimerSettings={handleUpdateTimerSettings}
          onUpdateIntervalTask={(pageId, taskId, sound) => {
            const p = pages.find(pg => pg.id === pageId);
            if (!p) return;
            updateIntervalTasksForPage(pageId, (p.intervalTasks ?? []).map(t =>
              t.id === taskId ? { ...t, completionSound: sound } : t
            ));
          }}
          onAddCustomTone={addCustomTone}
          onRemoveCustomTone={removeCustomTone}
          onSetVolume={setVolume}
          onUpdateSettings={updateSettings}
        />
      )}
    </div>
  );
}
