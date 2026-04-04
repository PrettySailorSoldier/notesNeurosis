import { useState, useEffect, useCallback, useRef } from 'react';
import { load } from '@tauri-apps/plugin-store';
import type { Habit, HabitLog, HabitStore, AccentColor, HabitType } from '../types';

const STORE_FILE = 'habits.json';
const STORE_KEY = 'habit-data';
const BACKUP_KEY = 'habit-data-backup';

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [ready, setReady] = useState(false);

  // Stable refs so debounced save always has latest values
  const habitsRef = useRef<Habit[]>([]);
  const logsRef = useRef<HabitLog[]>([]);
  const saveTimeout = useRef<number | null>(null);

  useEffect(() => { habitsRef.current = habits; }, [habits]);
  useEffect(() => { logsRef.current = logs; }, [logs]);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await load(STORE_FILE, { autoSave: false } as any);
        let data = await store.get<HabitStore>(STORE_KEY);

        if (!data) {
          const backup = await store.get<HabitStore>(BACKUP_KEY);
          if (backup) {
            console.warn('[useHabits] main key empty, restoring from backup');
            data = backup;
            await store.set(STORE_KEY, backup);
            await store.save();
          }
        }

        if (!cancelled) {
          setHabits(data?.habits ?? []);
          setLogs(data?.logs ?? []);
          setReady(true);
        }
      } catch (err) {
        console.error('[useHabits] load error:', err);
        if (!cancelled) {
          setHabits([]);
          setLogs([]);
          setReady(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveToStore = async (h: Habit[], l: HabitLog[]) => {
    try {
      const store = await load(STORE_FILE, { autoSave: false } as any);
      const data: HabitStore = { habits: h, logs: l };
      await store.set(STORE_KEY, data);
      await store.set(BACKUP_KEY, data);
      await store.save();
    } catch (err) {
      console.error('[useHabits] save error:', err);
    }
  };

  const scheduleSave = (h: Habit[], l: HabitLog[]) => {
    if (saveTimeout.current !== null) window.clearTimeout(saveTimeout.current);
    saveTimeout.current = window.setTimeout(() => saveToStore(h, l), 400);
  };

  // ── Mutations ──────────────────────────────────────────

  const addHabit = useCallback((name: string, emoji: string, color: AccentColor, habitType: HabitType = 'binary', unit?: string, frequency?: 'daily' | 'weekly') => {
    const habit: Habit = { id: makeId(), name, emoji, color, habitType, unit, frequency, createdAt: Date.now() };
    setHabits(prev => {
      const next = [...prev, habit];
      habitsRef.current = next;
      scheduleSave(next, logsRef.current);
      return next;
    });
  }, []);

  const removeHabit = useCallback((id: string) => {
    setHabits(prev => {
      const next = prev.map(h => h.id === id ? { ...h, archivedAt: Date.now() } : h);
      habitsRef.current = next;
      scheduleSave(next, logsRef.current);
      return next;
    });
  }, []);

  const unarchiveHabit = useCallback((id: string) => {
    setHabits(prev => {
      const next = prev.map(h => h.id === id ? { ...h, archivedAt: undefined } : h);
      habitsRef.current = next;
      scheduleSave(next, logsRef.current);
      return next;
    });
  }, []);

  const deleteHabit = useCallback((id: string) => {
    setHabits(prev => {
      const next = prev.filter(h => h.id !== id);
      habitsRef.current = next;
      scheduleSave(next, logsRef.current);
      return next;
    });
  }, []);

  const renameHabit = useCallback((id: string, name: string, emoji: string) => {
    setHabits(prev => {
      const next = prev.map(h => h.id === id ? { ...h, name, emoji } : h);
      habitsRef.current = next;
      scheduleSave(next, logsRef.current);
      return next;
    });
  }, []);

  const toggleLog = useCallback((habitId: string, date: string) => {
    setLogs(prev => {
      const exists = prev.some(l => l.habitId === habitId && l.date === date);
      const next = exists
        ? prev.filter(l => !(l.habitId === habitId && l.date === date))
        : [...prev, { habitId, date }];
      logsRef.current = next;
      scheduleSave(habitsRef.current, next);
      return next;
    });
  }, []);

  // For count habits: set the numeric count for a date (0 removes the log entry)
  const setLogCount = useCallback((habitId: string, date: string, count: number) => {
    setLogs(prev => {
      const idx = prev.findIndex(l => l.habitId === habitId && l.date === date);
      let next: HabitLog[];
      if (count <= 0) {
        next = prev.filter(l => !(l.habitId === habitId && l.date === date));
      } else if (idx === -1) {
        next = [...prev, { habitId, date, count }];
      } else {
        next = prev.map((l, i) => i === idx ? { ...l, count } : l);
      }
      logsRef.current = next;
      scheduleSave(habitsRef.current, next);
      return next;
    });
  }, []);

  const getLogCount = useCallback((habitId: string, date: string): number => {
    return logs.find(l => l.habitId === habitId && l.date === date)?.count ?? 0;
  }, [logs]);

  const updateLogNote = useCallback((habitId: string, date: string, note: string) => {
    setLogs(prev => {
      const idx = prev.findIndex(l => l.habitId === habitId && l.date === date);
      let next: HabitLog[];
      if (idx === -1) {
        next = [...prev, { habitId, date, note }];
      } else {
        next = prev.map((l, i) => i === idx ? { ...l, note } : l);
      }
      logsRef.current = next;
      scheduleSave(habitsRef.current, next);
      return next;
    });
  }, []);

  // ── Queries ────────────────────────────────────────────

  const isLogged = useCallback((habitId: string, date: string): boolean => {
    return logs.some(l => l.habitId === habitId && l.date === date);
  }, [logs]);

  const getLogsForHabit = useCallback((habitId: string, days = 35): HabitLog[] => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffIso = dateToIso(cutoff);
    return logs
      .filter(l => l.habitId === habitId && l.date >= cutoffIso)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [logs]);

  const getStreakForHabit = useCallback((habitId: string): number => {
    const today = dateToIso(new Date());
    if (!logs.some(l => l.habitId === habitId && l.date === today)) return 0;

    let streak = 0;
    const cursor = new Date();
    while (true) {
      const iso = dateToIso(cursor);
      if (!logs.some(l => l.habitId === habitId && l.date === iso)) break;
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [logs]);

  const getLongestStreak = useCallback((habitId: string): number => {
    const sorted = logs
      .filter(l => l.habitId === habitId)
      .map(l => l.date)
      .sort();

    if (sorted.length === 0) return 0;

    let longest = 1;
    let current = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = isoToDate(sorted[i - 1]);
      const curr = isoToDate(sorted[i]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      if (diffDays === 1) {
        current++;
        if (current > longest) longest = current;
      } else {
        current = 1;
      }
    }
    return longest;
  }, [logs]);

  return {
    habits,
    logs,
    ready,
    addHabit,
    removeHabit,
    unarchiveHabit,
    deleteHabit,
    renameHabit,
    toggleLog,
    setLogCount,
    getLogCount,
    updateLogNote,
    isLogged,
    getLogsForHabit,
    getStreakForHabit,
    getLongestStreak,
  };
}
