import { useState, useEffect, useCallback, useRef } from 'react';
import { load } from '@tauri-apps/plugin-store';
import type { Page, Task } from '../types';

const STORE_FILE = 'planner.json';
const PAGES_KEY = 'pages';
const CURRENT_PAGE_KEY = 'currentPageId';

// Fallback logic for generating an empty task if needed
function makeTask(content = '') {
  return { id: crypto.randomUUID(), content, type: 'plain' as const, completed: false, createdAt: Date.now() };
}

const DEFAULT_PAGES: Page[] = [
  { id: crypto.randomUUID(), name: 'To-Do', tasks: [makeTask('')], createdAt: Date.now() },
  { id: crypto.randomUUID(), name: 'Notes', tasks: [makeTask('')], createdAt: Date.now() + 1 }
];

export function usePages() {
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string>('');
  const [ready, setReady] = useState(false);
  const saveTimeout = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await load(STORE_FILE, { autoSave: false } as any);
        const storedPages = await store.get<Page[]>(PAGES_KEY);
        const storedPageId = await store.get<string>(CURRENT_PAGE_KEY);

        if (!cancelled) {
          if (storedPages && storedPages.length > 0) {
            setPages(storedPages);
            setCurrentPageId(storedPageId && storedPages.find(p => p.id === storedPageId) ? storedPageId : storedPages[0].id);
          } else {
            // First time setup or empty
            setPages(DEFAULT_PAGES);
            setCurrentPageId(DEFAULT_PAGES[0].id);
            debouncedSave(DEFAULT_PAGES, DEFAULT_PAGES[0].id);
          }
          setReady(true);
        }
      } catch (err) {
        console.error('[usePages] load error:', err);
        if (!cancelled) {
          setPages(DEFAULT_PAGES);
          setCurrentPageId(DEFAULT_PAGES[0].id);
          setReady(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveToStore = async (p: Page[], cId: string) => {
    try {
      const store = await load(STORE_FILE, { autoSave: false } as any);
      await store.set(PAGES_KEY, p);
      await store.set(CURRENT_PAGE_KEY, cId);
      await store.save();
    } catch (err) {
      console.error('[usePages] save error:', err);
    }
  };

  const debouncedSave = (newPages: Page[], cId: string) => {
    if (saveTimeout.current !== null) {
      window.clearTimeout(saveTimeout.current);
    }
    saveTimeout.current = window.setTimeout(() => {
      saveToStore(newPages, cId);
    }, 400);
  };

  const updatePages = useCallback((newPages: Page[], newPageId?: string) => {
    const pId = newPageId || currentPageId;
    setPages(newPages);
    if (newPageId) setCurrentPageId(newPageId);
    debouncedSave(newPages, pId);
  }, [currentPageId]);

  const addPage = useCallback((name = 'New Page') => {
    const newPage: Page = {
      id: crypto.randomUUID(),
      name,
      tasks: [makeTask('')],
      createdAt: Date.now()
    };
    const nextPages = [...pages, newPage];
    updatePages(nextPages, newPage.id);
    return newPage;
  }, [pages, updatePages]);

  const renamePage = useCallback((id: string, name: string) => {
    const nextPages = pages.map(p => p.id === id ? { ...p, name } : p);
    updatePages(nextPages);
  }, [pages, updatePages]);

  const deletePage = useCallback((id: string) => {
    if (pages.length <= 1) return; // Need at least one
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
    updateTasksForPage
  };
}
