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
import type { Task, Reminder, ReminderSound, PageType, PlannerSubtype, TodoSubtype } from './types';
import { updateTaskInPage } from './utils/taskLookup';
import appFrame from './assets/frame_blue_orchid.png';
import './App.css';

const appWindow = getCurrentWindow();

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Page type metadata — multitodo removed from picker; existing pages auto-migrate
const PAGE_TYPES: { type: PageType; icon: string; label: string }[] = [
  { type: 'notes',    icon: '📝', label: 'Notes'         },
  { type: 'todo',     icon: '✅', label: 'To-Do'         },
  { type: 'interval', icon: '⏱', label: 'Interval'       },
  { type: 'planner',  icon: '📅', label: 'Planner'       },
  { type: 'habits',   icon: '◉',  label: 'Habit Tracker' },
];

const PLANNER_SUBTYPES: { sub: PlannerSubtype; icon: string; label: string }[] = [
  { sub: 'schedule',    icon: '🗓', label: 'Schedule'    },
  { sub: 'caregiving',  icon: '🩺', label: 'Caregiving'  },
  { sub: 'goals',       icon: '🎯', label: 'Goals'       },
];

const TODO_SUBTYPES: { sub: TodoSubtype; icon: string; label: string }[] = [
  { sub: 'list',  icon: '📋', label: 'List'  },
  { sub: 'board', icon: '⊞',  label: 'Board' },
];

function pageTypeIcon(type?: PageType, plannerSubtype?: PlannerSubtype, todoSubtype?: TodoSubtype): string {
  if (type === 'planner') {
    return PLANNER_SUBTYPES.find(s => s.sub === plannerSubtype)?.icon ?? '📅';
  }
  if (type === 'todo') {
    return todoSubtype === 'board' ? '⊞' : '✅';
  }
  return PAGE_TYPES.find(p => p.type === type)?.icon ?? '📝';
}


interface TabContextMenu {
  x: number;
  y: number;
  pageId: string;
  phase: 'main' | 'type' | 'subtype' | 'todostyle';
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
    updateTodoSubtypeForPage,
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

  /**
   * Generic reminder updater — works for tasks in flat lists AND in board columns.
   */
  const handleUpdateReminder = useCallback((taskId: string, pageId: string, reminder: Reminder | undefined) => {
    const pageToUpdate = pages.find(p => p.id === pageId);
    if (!pageToUpdate) return;
    const updatedPage = updateTaskInPage(pageToUpdate, taskId, t => ({ ...t, reminder }));
    // Determine which update fn to call based on what changed
    if (updatedPage.tasks !== pageToUpdate.tasks) {
      updateTasksForPage(pageId, updatedPage.tasks);
    } else if (updatedPage.todoBoards !== pageToUpdate.todoBoards) {
      updateTodoBoardsForPage(pageId, updatedPage.todoBoards!);
    }
  }, [pages, updateTasksForPage, updateTodoBoardsForPage]);

  const { ringingIds, stopRinging } = useReminders(pages, handleUpdateReminder, settings.customTones, settings.volume);

  const handleTasksChange = useCallback((updated: Task[]) => {
    if (currentPageId) updateTasksForPage(currentPageId, updated);
  }, [currentPageId, updateTasksForPage]);

  const handleSetReminder = useCallback((taskId: string, intervalMinutes: number, sound: ReminderSound, alarmEnabled = true) => {
    if (!currentPage) return;
    const nextTasks = currentPage.tasks.map(t => {
      if (t.id !== taskId) return t;
      const reminder: Reminder = {
        id: makeId(),
        taskId,
        intervalMinutes,
        fireAt: Date.now() + intervalMinutes * 60 * 1000,
        label: intervalMinutes >= 60 ? `every ${intervalMinutes / 60}h` : `every ${intervalMinutes}m`,
        sound,
        active: true,
        alarmEnabled,
      };
      return { ...t, reminder };
    });
    updateTasksForPage(currentPageId, nextTasks);
  }, [currentPage, currentPageId, updateTasksForPage]);

  const handleClearReminder = useCallback((taskId: string) => {
    if (!currentPage) return;
    const nextTasks = currentPage.tasks.map(t =>
      t.id !== taskId ? t : { ...t, reminder: undefined }
    );
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

  /** Set reminder on a board task — called from MultiTodoView */
  const handleSetBoardReminder = useCallback((
    taskId: string,
    intervalMinutes: number,
    sound: ReminderSound,
    alarmEnabled = true
  ) => {
    if (!currentPage) return;
    const reminder: Reminder = {
      id: makeId(),
      taskId,
      intervalMinutes,
      fireAt: Date.now() + intervalMinutes * 60 * 1000,
      label: intervalMinutes >= 60 ? `every ${intervalMinutes / 60}h` : `every ${intervalMinutes}m`,
      sound,
      active: true,
      alarmEnabled,
    };
    const updatedPage = updateTaskInPage(currentPage, taskId, t => ({ ...t, reminder }));
    if (updatedPage.todoBoards !== currentPage.todoBoards) {
      updateTodoBoardsForPage(currentPage.id, updatedPage.todoBoards!);
    }
  }, [currentPage, updateTodoBoardsForPage]);

  const handleClearBoardReminder = useCallback((taskId: string) => {
    if (!currentPage) return;
    const updatedPage = updateTaskInPage(currentPage, taskId, t => ({ ...t, reminder: undefined }));
    if (updatedPage.todoBoards !== currentPage.todoBoards) {
      updateTodoBoardsForPage(currentPage.id, updatedPage.todoBoards!);
    }
  }, [currentPage, updateTodoBoardsForPage]);

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

  // ── Global keyboard shortcuts ──
  useEffect(() => {
    function isEditableTarget(e: Event) {
      const t = e.target as HTMLElement | null;
      if (!t) return false;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (t.isContentEditable) return true;
      return false;
    }

    function onKeyDown(e: KeyboardEvent) {
      // Escape — close any open menu
      if (e.key === 'Escape') {
        // Don't call e.preventDefault() so content-editable IME can still cancel
        setTabMenu(null);
        return;
      }

      // Don't fire shortcuts while typing
      if (isEditableTarget(e)) return;

      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        // Open the page-type picker centered on screen
        setTabMenu({
          x: Math.round(window.innerWidth / 2 - 70),
          y: Math.round(window.innerHeight / 2 - 80),
          pageId: '__new__',
          phase: 'type',
        });
        return;
      }

      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        addPage('New Page', 'notes');
        return;
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [addPage]);


  // Build context menu options based on current phase
  const buildMenuOptions = () => {
    if (!tabMenu) return [];
    const page = pages.find(p => p.id === tabMenu.pageId);
    // '__new__' sentinel for the new-page type picker — page will be undefined, that's fine
    if (!page && tabMenu.pageId !== '__new__') return [];

    if (tabMenu.phase === 'type') {
      const isNewPage = tabMenu.pageId === '__new__';
      return PAGE_TYPES.map(pt => ({
        icon: pt.icon,
        label: pt.label,
        onClick: () => {
          if (pt.type === 'planner') {
            setTabMenu(prev => prev ? { ...prev, phase: 'subtype' } : null);
          } else if (isNewPage) {
            addPage('New Page', pt.type);
            closeTabMenu();
          } else {
            changePageType(page?.id ?? '', pt.type);
            closeTabMenu();
          }
        },
      }));
    }

    if (tabMenu.phase === 'subtype') {
      const isNewPage = tabMenu.pageId === '__new__';
      return PLANNER_SUBTYPES.map(ps => ({
        icon: ps.icon,
        label: ps.label,
        onClick: () => {
          if (isNewPage) {
            addPage('New Page', 'planner', ps.sub);
          } else {
            changePageType(page?.id ?? '', 'planner', ps.sub);
          }
          closeTabMenu();
        },
      }));
    }

    if (tabMenu.phase === 'todostyle') {
      if (!page) return [];
      return TODO_SUBTYPES.map(ts => ({
        icon: ts.icon,
        label: ts.label,
        onClick: () => {
          updateTodoSubtypeForPage(page.id, ts.sub);
          closeTabMenu();
        },
      }));
    }

    // main phase — only reachable via right-click on a real tab, so page is always defined
    if (!page) return [];
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

    if (page.pageType === 'todo') {
      options.push({
        icon: page.todoSubtype === 'board' ? '⊞' : '📋',
        label: 'Todo style →',
        onClick: () => setTabMenu(prev => prev ? { ...prev, phase: 'todostyle' } : null),
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
          onUpdateSettings={updateSettings}
          pageId={currentPage.id}
        />
      );
    }

    if (type === 'habits') {
      return <HabitsPage pageId={currentPage.id} />;
    }

    // Unified todo: list OR board subtype
    if (type === 'todo' || type === 'multitodo') {
      const todoSubtype = currentPage.todoSubtype ?? (type === 'multitodo' ? 'board' : 'list');
      if (todoSubtype === 'board') {
        return (
          <MultiTodoView
            boards={currentPage.todoBoards ?? []}
            onChange={boards => updateTodoBoardsForPage(currentPage.id, boards)}
            onSetReminder={handleSetBoardReminder}
            onClearReminder={handleClearBoardReminder}
          />
        );
      }
      // List mode — falls through to TaskEditor below
    }

    // notes + todo/list both use TaskEditor
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

  const isBoardMode = (currentPage?.pageType === 'todo' && currentPage?.todoSubtype === 'board')
    || currentPage?.pageType === 'multitodo';

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
              <span className="tab-type-icon">{pageTypeIcon(page.pageType, page.plannerSubtype, page.todoSubtype)}</span>
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
      <div className={`writing-zone${isBoardMode ? ' writing-zone--board' : ''}`}>
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
