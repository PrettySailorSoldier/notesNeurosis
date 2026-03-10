import { useState, useEffect, useCallback, useRef } from 'react';
import { load } from '@tauri-apps/plugin-store';
import type { PlannerBlock } from '../types';

const STORE_FILE = 'notes-neurosis-store.json';
const PLANNER_KEY = 'planner-data';

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function usePlanner() {
  const [blocks, setBlocks] = useState<PlannerBlock[]>([]);
  const [ready, setReady] = useState(false);
  const saveTimeout = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await load(STORE_FILE, { autoSave: false } as any);
        const storedBlocks = await store.get<PlannerBlock[]>(PLANNER_KEY);

        if (!cancelled) {
          if (storedBlocks) {
            setBlocks(storedBlocks);
          } else {
            setBlocks([]);
          }
          setReady(true);
        }
      } catch (err) {
        console.error('[usePlanner] load error:', err);
        if (!cancelled) {
          setBlocks([]);
          setReady(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveToStore = async (b: PlannerBlock[]) => {
    try {
      const store = await load(STORE_FILE, { autoSave: false } as any);
      await store.set(PLANNER_KEY, b);
      await store.save();
    } catch (err) {
      console.error('[usePlanner] save error:', err);
    }
  };

  const debouncedSave = (newBlocks: PlannerBlock[]) => {
    if (saveTimeout.current !== null) {
      window.clearTimeout(saveTimeout.current);
    }
    saveTimeout.current = window.setTimeout(() => {
      saveToStore(newBlocks);
    }, 400);
  };

  const addBlock = useCallback((date: string, startTime: string) => {
    const parts = startTime.split(':');
    let hours = parseInt(parts[0] || '0', 10);
    const minutes = parseInt(parts[1] || '0', 10);
    
    let endHours = hours + 1;
    if (endHours > 23) endHours = 23;
    
    const endHoursStr = String(endHours).padStart(2, '0');
    const endMinutesStr = String(minutes).padStart(2, '0');
    const endTime = `${endHoursStr}:${endMinutesStr}`;

    const newBlock: PlannerBlock = {
      id: makeId(),
      date,
      startTime,
      endTime,
      label: '',
      notes: '',
      color: 'ghost',
      completed: false,
      tasks: []
    };
    
    setBlocks(prev => {
      const next = [...prev, newBlock];
      debouncedSave(next);
      return next;
    });
  }, []);

  const updateBlock = useCallback((id: string, changes: Partial<PlannerBlock>) => {
    setBlocks(prev => {
      const next = prev.map(b => b.id === id ? { ...b, ...changes } : b);
      debouncedSave(next);
      return next;
    });
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const next = prev.filter(b => b.id !== id);
      debouncedSave(next);
      return next;
    });
  }, []);

  const getBlocksForDate = useCallback((date: string) => {
    return blocks
      .filter(b => b.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [blocks]);

  return {
    blocks,
    ready,
    addBlock,
    updateBlock,
    deleteBlock,
    getBlocksForDate
  };
}
