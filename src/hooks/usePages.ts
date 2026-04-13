import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { load } from '@tauri-apps/plugin-store';
import type { Page, Task, PageType, PlannerSubtype, TodoList, TodoBoard, TodoSubtype, SequenceTask, TaskListBoard, NoteBoard, SequenceBoard } from '../types';

const STORE_FILE = 'planner.json';
const PAGES_KEY = 'pages';
const PAGES_BACKUP_KEY = 'pages_backup';
const CURRENT_PAGE_KEY = 'currentPageId';

function makeTask(content = '') {
  return { id: crypto.randomUUID(), content, type: 'plain' as const, completed: false, createdAt: Date.now() };
}

function makeSequenceTask(content = ''): SequenceTask {
  return {
    id: crypto.randomUUID(),
    content,
    notes: '',
    status: 'pending',
    createdAt: Date.now(),
  };
}

function makeTodoList(label = 'List'): TodoList {
  return {
    id: crypto.randomUUID(),
    label,
    tasks: [{ id: crypto.randomUUID(), content: '', type: 'plain' as const, completed: false, createdAt: Date.now() }],
    collapsed: false,
    createdAt: Date.now(),
  };
}

function makeTaskListBoard(name = 'List 1'): TaskListBoard {
  return { id: crypto.randomUUID(), name, tasks: [makeTask('')], createdAt: Date.now() };
}

function makeNoteBoard(name = 'Note 1'): NoteBoard {
  return { id: crypto.randomUUID(), name, content: '', createdAt: Date.now() };
}

function makeSequenceBoard(name = 'Sequence 1'): SequenceBoard {
  return {
    id: crypto.randomUUID(),
    name,
    tasks: [makeSequenceTask('')],
    createdAt: Date.now(),
  };
}

function makeTodoBoard(name = 'Board'): TodoBoard {
  return {
    id: crypto.randomUUID(),
    name,
    lists: [
      { ...makeTodoList('To-Do'),       color: 'plum'  as const },
      { ...makeTodoList('In Progress'), color: 'blue'  as const },
      { ...makeTodoList('Done'),        color: 'ghost' as const },
    ],
    createdAt: Date.now(),
  };
}

/** Migrate a page that has only legacy todoLists into the new todoBoards shape */
function migrateTodoBoards(p: Page): Page {
  if (p.pageType !== 'multitodo') return p;
  if (p.todoBoards && p.todoBoards.length > 0) return p; // already migrated
  const lists = p.todoLists ?? [];
  return {
    ...p,
    todoBoards: [{ id: crypto.randomUUID(), name: 'Board 1', lists, createdAt: Date.now() }],
  };
}

/**
 * Migrate multitodo → unified todo/board, and ensure all todo pages have todoSubtype.
 */
function migrateTodoSubtype(p: Page): Page {
  // multitodo → todo + board subtype
  if (p.pageType === 'multitodo') {
    return { ...p, pageType: 'todo', todoSubtype: 'board' };
  }
  // todo without subtype → list
  if (p.pageType === 'todo' && !p.todoSubtype) {
    return { ...p, todoSubtype: 'list' };
  }
  return p;
}

const DEFAULT_PAGES: Page[] = [
  { id: crypto.randomUUID(), name: 'To-Do', tasks: [makeTask('')], createdAt: Date.now(), pageType: 'todo', todoSubtype: 'list' },
  { id: crypto.randomUUID(), name: 'Notes', tasks: [makeTask('')], createdAt: Date.now() + 1, pageType: 'notes' }
];

export function usePages() {
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string>('');
  const [ready, setReady] = useState(false);
  const saveTimeout = useRef<number | null>(null);

  // Always-current refs so the close-flush can write the latest state
  const latestPagesRef = useRef<Page[]>([]);
  const latestPageIdRef = useRef<string>('');
  const pendingSaveRef = useRef(false); // true when a debounced save is queued

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await load(STORE_FILE, { autoSave: false } as any);
        const storedPages = await store.get<Page[]>(PAGES_KEY);
        const storedPageId = await store.get<string>(CURRENT_PAGE_KEY);

        if (!cancelled) {
          if (storedPages && storedPages.length > 0) {
            const migrated = storedPages
              .map(p => ({ ...p, pageType: p.pageType ?? 'notes' as PageType }))
              .map(migrateTodoBoards)
              .map(migrateTodoSubtype);
            setPages(migrated);
            latestPagesRef.current = migrated;
            const cId = storedPageId && migrated.find(p => p.id === storedPageId) ? storedPageId : migrated[0].id;
            setCurrentPageId(cId);
            latestPageIdRef.current = cId;
          } else {
            const backupPages = await store.get<Page[]>(PAGES_BACKUP_KEY);
            if (backupPages && backupPages.length > 0) {
              console.warn('[usePages] main key empty, restoring from backup');
              const migrated = backupPages
                .map(p => ({ ...p, pageType: p.pageType ?? 'notes' as PageType }))
                .map(migrateTodoBoards)
                .map(migrateTodoSubtype);
              setPages(migrated);
              latestPagesRef.current = migrated;
              const cId = storedPageId && migrated.find(p => p.id === storedPageId) ? storedPageId : migrated[0].id;
              setCurrentPageId(cId);
              latestPageIdRef.current = cId;
              await store.set(PAGES_KEY, migrated);
              await store.save();
            } else {
              setPages(DEFAULT_PAGES);
              latestPagesRef.current = DEFAULT_PAGES;
              setCurrentPageId(DEFAULT_PAGES[0].id);
              latestPageIdRef.current = DEFAULT_PAGES[0].id;
              debouncedSave(DEFAULT_PAGES, DEFAULT_PAGES[0].id);
            }
          }
          setReady(true);
        }
      } catch (err) {
        console.error('[usePages] load error:', err);
        if (!cancelled) {
          setPages(DEFAULT_PAGES);
          latestPagesRef.current = DEFAULT_PAGES;
          setCurrentPageId(DEFAULT_PAGES[0].id);
          latestPageIdRef.current = DEFAULT_PAGES[0].id;
          setReady(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Intercept the Tauri close request: flush any pending debounced save first,
  // then allow the window to close. Without this, the 400ms timer is killed
  // before it fires whenever the user closes right after making changes.
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    appWindow.onCloseRequested(async (event) => {
      event.preventDefault(); // hold the close
      if (saveTimeout.current !== null) {
        window.clearTimeout(saveTimeout.current);
        saveTimeout.current = null;
      }
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        await saveToStore(latestPagesRef.current, latestPageIdRef.current);
      }
      await appWindow.destroy(); // now really close
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  const saveToStore = async (p: Page[], cId: string) => {
    try {
      const store = await load(STORE_FILE, { autoSave: false } as any);
      await store.set(PAGES_KEY, p);
      await store.set(CURRENT_PAGE_KEY, cId);
      await store.set(PAGES_BACKUP_KEY, p);
      await store.save();
    } catch (err) {
      console.error('[usePages] save error:', err);
    }
  };

  const debouncedSave = (newPages: Page[], cId: string) => {
    if (saveTimeout.current !== null) {
      window.clearTimeout(saveTimeout.current);
    }
    pendingSaveRef.current = true;
    saveTimeout.current = window.setTimeout(() => {
      pendingSaveRef.current = false;
      saveToStore(newPages, cId);
    }, 400);
  };

  const updatePages = useCallback((newPages: Page[], newPageId?: string) => {
    const pId = newPageId || currentPageId;
    setPages(newPages);
    latestPagesRef.current = newPages;
    if (newPageId) {
      setCurrentPageId(newPageId);
      latestPageIdRef.current = newPageId;
    }
    debouncedSave(newPages, pId);
  }, [currentPageId]);

  const addPage = useCallback((
    name = 'New Page',
    pageType: PageType = 'notes',
    plannerSubtype?: PlannerSubtype
  ) => {
    const newPage: Page = {
      id: crypto.randomUUID(),
      name,
      tasks: [makeTask('')],
      createdAt: Date.now(),
      pageType,
      plannerSubtype: pageType === 'planner' ? (plannerSubtype ?? 'schedule') : undefined,
      intervalTasks: pageType === 'interval' ? [] : undefined,
      goals: pageType === 'planner' && plannerSubtype === 'goals' ? [] : undefined,
      todoBoards: pageType === 'todo' ? [makeTodoBoard('Board 1')] : undefined,
      todoSubtype: pageType === 'todo' ? 'list' : undefined,
      sequenceTasks: pageType === 'todo' ? [makeSequenceTask('')] : undefined,
      taskListBoards: pageType === 'todo'  ? [makeTaskListBoard('List 1')]     : undefined,
      noteBoards:     pageType === 'notes' ? [makeNoteBoard('Note 1')]         : undefined,
      sequenceBoards: pageType === 'todo'  ? [makeSequenceBoard('Sequence 1')] : undefined,
    };
    const nextPages = [...pages, newPage];
    updatePages(nextPages, newPage.id);
    return newPage;
  }, [pages, updatePages]);

  const renamePage = useCallback((id: string, name: string) => {
    const nextPages = pages.map(p => p.id === id ? { ...p, name } : p);
    updatePages(nextPages);
  }, [pages, updatePages]);

  const changePageType = useCallback((
    id: string,
    pageType: PageType,
    plannerSubtype?: PlannerSubtype
  ) => {
    const nextPages = pages.map(p => {
      if (p.id !== id) return p;
      return {
        ...p,
        pageType,
        plannerSubtype: pageType === 'planner' ? (plannerSubtype ?? p.plannerSubtype ?? 'schedule') : undefined,
        intervalTasks: pageType === 'interval' ? (p.intervalTasks ?? []) : p.intervalTasks,
        goals: pageType === 'planner' && (plannerSubtype ?? p.plannerSubtype) === 'goals'
          ? (p.goals ?? [])
          : p.goals,
        // When switching to todo, default to list subtype if not already set
        todoSubtype: pageType === 'todo' ? (p.todoSubtype ?? 'list') : p.todoSubtype,
        // Seed todoBoards when switching to todo if not already present
        todoBoards: pageType === 'todo' && !p.todoBoards?.length
          ? [makeTodoBoard('Board 1')]
          : p.todoBoards,
        taskListBoards: pageType === 'todo' && !p.taskListBoards?.length
          ? [makeTaskListBoard('List 1')]
          : p.taskListBoards,
        noteBoards: pageType === 'notes' && !p.noteBoards?.length
          ? [makeNoteBoard('Note 1')]
          : p.noteBoards,
        sequenceBoards: pageType === 'todo' && !p.sequenceBoards?.length
          ? [makeSequenceBoard('Sequence 1')]
          : p.sequenceBoards,
      };
    });
    updatePages(nextPages);
  }, [pages, updatePages]);

  const updateTodoSubtypeForPage = useCallback((pageId: string, todoSubtype: TodoSubtype) => {
    const nextPages = pages.map(p => p.id === pageId ? { ...p, todoSubtype } : p);
    updatePages(nextPages);
  }, [pages, updatePages]);

  const deletePage = useCallback((id: string) => {
    if (pages.length <= 1) return;
    const idx = pages.findIndex(p => p.id === id);
    const nextPages = pages.filter(p => p.id !== id);
    let switchId = currentPageId;
    if (currentPageId === id) {
      switchId = nextPages[Math.min(idx, nextPages.length - 1)].id;
    }
    updatePages(nextPages, switchId);
  }, [pages, currentPageId, updatePages]);

  const switchPage = useCallback((id: string) => {
    updatePages(pages, id);
  }, [pages, updatePages]);

  const updateTasksForPage = useCallback((pageId: string, newTasks: Task[]) => {
    const nextPages = pages.map(p => p.id === pageId ? { ...p, tasks: newTasks } : p);
    updatePages(nextPages);
  }, [pages, updatePages]);

  const updateIntervalTasksForPage = useCallback((pageId: string, intervalTasks: import('../types').IntervalTask[]) => {
    const nextPages = pages.map(p => p.id === pageId ? { ...p, intervalTasks } : p);
    updatePages(nextPages);
  }, [pages, updatePages]);

  const updateGoalsForPage = useCallback((pageId: string, goals: import('../types').GoalEntry[]) => {
    const nextPages = pages.map(p => p.id === pageId ? { ...p, goals } : p);
    updatePages(nextPages);
  }, [pages, updatePages]);

  const updateTodoListsForPage = useCallback((pageId: string, todoLists: TodoList[]) => {
    const nextPages = pages.map(p => p.id === pageId ? { ...p, todoLists } : p);
    updatePages(nextPages);
  }, [pages, updatePages]);

  const updateTodoBoardsForPage = useCallback((pageId: string, todoBoards: TodoBoard[]) => {
    const nextPages = pages.map(p => p.id === pageId ? { ...p, todoBoards } : p);
    updatePages(nextPages);
  }, [pages, updatePages]);

  const updateNoteContentForPage = useCallback((pageId: string, noteContent: string) => {
    const nextPages = pages.map(p => p.id === pageId ? { ...p, noteContent } : p);
    updatePages(nextPages);
  }, [pages, updatePages]);

  const updateSequenceTasksForPage = useCallback((pageId: string, tasks: SequenceTask[]) => {
    const nextPages = pages.map(p =>
      p.id === pageId ? { ...p, sequenceTasks: tasks } : p
    );
    updatePages(nextPages);
  }, [pages, updatePages]);

  const updateTaskListBoardsForPage = useCallback((pageId: string, boards: TaskListBoard[]) => {
    const nextPages = pages.map(p => p.id === pageId ? { ...p, taskListBoards: boards } : p);
    updatePages(nextPages);
  }, [pages, updatePages]);

  const updateNoteBoardsForPage = useCallback((pageId: string, boards: NoteBoard[]) => {
    const nextPages = pages.map(p => p.id === pageId ? { ...p, noteBoards: boards } : p);
    updatePages(nextPages);
  }, [pages, updatePages]);

  const updateSequenceBoardsForPage = useCallback((pageId: string, boards: SequenceBoard[]) => {
    const nextPages = pages.map(p => p.id === pageId ? { ...p, sequenceBoards: boards } : p);
    updatePages(nextPages);
  }, [pages, updatePages]);

  const reorderPages = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    const from = pages.findIndex(p => p.id === fromId);
    const to = pages.findIndex(p => p.id === toId);
    if (from === -1 || to === -1) return;
    const next = [...pages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updatePages(next);
  }, [pages, updatePages]);

  const currentPage = pages.find(p => p.id === currentPageId);

  return {
    pages,
    currentPageId,
    currentPage,
    ready,
    addPage,
    renamePage,
    deletePage,
    switchPage,
    changePageType,
    reorderPages,
    updateTasksForPage,
    updateIntervalTasksForPage,
    updateGoalsForPage,
    updateTodoListsForPage,
    updateTodoBoardsForPage,
    updateTodoSubtypeForPage,
    updateNoteContentForPage,
    updateSequenceTasksForPage,
    updateTaskListBoardsForPage,
    updateNoteBoardsForPage,
    updateSequenceBoardsForPage,
  };
}
