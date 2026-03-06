import { useState, useEffect, useCallback } from 'react';
import { load } from '@tauri-apps/plugin-store';
import type { Task } from '../types';

const STORE_FILE = 'orchid-notes-store.json';
const TASKS_KEY = 'tasks';

export function useStore() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await load(STORE_FILE, { autoSave: false });
        const stored = await store.get<Task[]>(TASKS_KEY);
        if (!cancelled) {
          setTasks(stored ?? []);
          setReady(true);
        }
      } catch (err) {
        console.error('[useStore] load error:', err);
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveTasks = useCallback(async (updated: Task[]) => {
    try {
      const store = await load(STORE_FILE, { autoSave: false });
      await store.set(TASKS_KEY, updated);
      await store.save();
    } catch (err) {
      console.error('[useStore] save error:', err);
    }
  }, []);

  return { tasks, setTasks, saveTasks, ready };
}
