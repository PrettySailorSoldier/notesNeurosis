import { useEffect, useRef, useCallback, useState } from 'react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import type { Task, Reminder, Page } from '../types';
import { useAudio } from './useAudio';
import type { CustomTone } from './useSettings';

type TimerHandle = ReturnType<typeof setTimeout>;

export function useReminders(
  pages: Page[],
  onUpdateReminder: (taskId: string, pageId: string, reminder: Reminder | undefined) => void,
  customTones: CustomTone[] = [],
  volume: number = 0.75
) {
  const handles = useRef<Map<string, TimerHandle>>(new Map());
  const stops = useRef<Map<string, () => void>>(new Map());
  const [ringingIds, setRingingIds] = useState<string[]>([]);
  const { playTone } = useAudio();

  const stopRinging = useCallback((reminderId: string) => {
    const stop = stops.current.get(reminderId);
    if (stop) {
      stop();
      stops.current.delete(reminderId);
      setRingingIds(prev => prev.filter(id => id !== reminderId));
    }
  }, []);

  const cancelReminder = useCallback((reminderId: string) => {
    const handle = handles.current.get(reminderId);
    if (handle !== undefined) {
      clearTimeout(handle);
      handles.current.delete(reminderId);
    }
    stopRinging(reminderId);
  }, [stopRinging]);

  const scheduleReminder = useCallback((reminder: Reminder, task: Task, pageName: string, pageId: string) => {
    const existingHandle = handles.current.get(reminder.id);
    if (existingHandle !== undefined) clearTimeout(existingHandle);

    const msUntilFire = Math.max(0, reminder.fireAt - Date.now());

    const handle = setTimeout(async () => {
      // 1. Play audio tone (loops indefinitely)
      const stopAud = playTone(reminder.sound, volume, customTones);
      stops.current.set(reminder.id, stopAud);
      setRingingIds(prev => {
        if (!prev.includes(reminder.id)) return [...prev, reminder.id];
        return prev;
      });

      // 2. Show native Tauri notification
      try {
        let granted = await isPermissionGranted();
        if (!granted) {
          const perm = await requestPermission();
          granted = perm === 'granted';
        }
        if (granted) {
          await sendNotification({
            title: 'Orchid Notes',
            body: `[${pageName}] ${task.content.slice(0, 80) || 'Reminder'}`,
          });
        }
      } catch (err) {
        console.warn('[useReminders] notification error:', err);
      }

      // 3. Reschedule if interval, otherwise mark inactive
      if (reminder.intervalMinutes > 0) {
        const nextFire = Date.now() + reminder.intervalMinutes * 60 * 1000;
        const updated: Reminder = {
          ...reminder,
          fireAt: nextFire,
          label: `every ${reminder.intervalMinutes}m`,
        };
        onUpdateReminder(task.id, pageId, updated);
        scheduleReminder(updated, task, pageName, pageId);
      } else {
        // One-shot: deactivate
        onUpdateReminder(task.id, pageId, undefined);
      }
    }, msUntilFire);

    handles.current.set(reminder.id, handle);
  }, [playTone, customTones, volume, onUpdateReminder]);

  // Sync reminder schedules for all tasks across all pages
  useEffect(() => {
    const now = Date.now();
    const activeIds = new Set<string>();

    pages.forEach(page => {
      page.tasks.forEach(task => {
        if (!task.reminder?.active) return;
        const r = task.reminder;
        activeIds.add(r.id);

        if (!handles.current.has(r.id)) {
          if (r.fireAt > now) {
            scheduleReminder(r, task, page.name, page.id);
          } else if (r.intervalMinutes > 0) {
            const nextFire = now + r.intervalMinutes * 60 * 1000;
            const updated: Reminder = { ...r, fireAt: nextFire };
            onUpdateReminder(task.id, page.id, updated);
            scheduleReminder(updated, task, page.name, page.id);
          }
        }
      });
    });

    handles.current.forEach((_, id) => {
      if (!activeIds.has(id)) cancelReminder(id);
    });

  }, [pages, scheduleReminder, cancelReminder, onUpdateReminder]);

  useEffect(() => {
    return () => {
      handles.current.forEach(h => clearTimeout(h));
      handles.current.clear();
      stops.current.forEach(s => s());
      stops.current.clear();
    };
  }, []);

  return { scheduleReminder, cancelReminder, ringingIds, stopRinging };
}
