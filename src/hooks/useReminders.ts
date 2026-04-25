import { useEffect, useRef, useCallback, useState } from 'react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Task, Reminder, Page } from '../types';
import { useAudio } from './useAudio';
import type { CustomTone } from './useSettings';
import { onModalMount, onModalUnmount } from '../utils/modalAlwaysOnTop';

type TimerHandle = ReturnType<typeof setTimeout>;

export function useReminders(
  pages: Page[],
  onUpdateReminder: (taskId: string, pageId: string, reminder: Reminder | undefined) => void,
  customTones: CustomTone[] = [],
  volume: number = 0.75
) {
  const handles = useRef<Map<string, TimerHandle>>(new Map());
  const stops = useRef<Map<string, () => void>>(new Map());
  const ringingMountedRef = useRef<Set<string>>(new Set());
  const [ringingIds, setRingingIds] = useState<string[]>([]);
  const { playTone } = useAudio();

  // Keep a stable ref to onUpdateReminder so timer callbacks always use the
  // latest version even after pages state has changed.
  const onUpdateReminderRef = useRef(onUpdateReminder);
  useEffect(() => { onUpdateReminderRef.current = onUpdateReminder; });

  // Stable ref to scheduleReminder so the recursive reschedule inside the
  // setTimeout callback never captures a stale closure.
  const scheduleReminderRef = useRef<(r: Reminder, task: Task, pageName: string, pageId: string) => void>(() => {});

  /**
   * Snooze: stop only the audio for this fire cycle — the alarm remains
   * scheduled and will fire again at the next interval.
   */
  const stopRinging = useCallback((reminderId: string) => {
    const stop = stops.current.get(reminderId);
    if (stop) {
      stop();
      stops.current.delete(reminderId);
      setRingingIds(prev => prev.filter(id => id !== reminderId));
    }
    if (ringingMountedRef.current.has(reminderId)) {
      ringingMountedRef.current.delete(reminderId);
      onModalUnmount();
    }
  }, []);

  /**
   * Fully cancel a reminder's timer and any ringing sound.
   * Used when the reminder is deleted or its active flag is cleared.
   */
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

    // If alarm is explicitly disabled, don't schedule
    if (reminder.alarmEnabled === false) return;

    const msUntilFire = Math.max(0, reminder.fireAt - Date.now());

    const handle = setTimeout(async () => {
      // 1. Bring window to front and keep it on top while ringing
      if (!ringingMountedRef.current.has(reminder.id)) {
        ringingMountedRef.current.add(reminder.id);
        getCurrentWindow().setFocus().catch(console.warn);
        onModalMount();
      }

      // 2. Play audio tone (loops indefinitely until stopRinging is called)
      const stopAud = playTone(reminder.sound, volume, customTones);
      stops.current.set(reminder.id, stopAud);
      setRingingIds(prev => {
        if (!prev.includes(reminder.id)) return [...prev, reminder.id];
        return prev;
      });

      // 3. Show native Tauri notification
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

      // 4. Reschedule if interval — use refs so we always get the latest state
      if (reminder.intervalMinutes > 0) {
        const nextFire = Date.now() + reminder.intervalMinutes * 60 * 1000;
        const label = reminder.intervalMinutes >= 60
          ? `every ${reminder.intervalMinutes / 60}h`
          : `every ${reminder.intervalMinutes}m`;
        const updated: Reminder = {
          ...reminder,
          fireAt: nextFire,
          label,
        };
        onUpdateReminderRef.current(task.id, pageId, updated);
        scheduleReminderRef.current(updated, task, pageName, pageId);
      } else {
        // One-shot: deactivate
        onUpdateReminderRef.current(task.id, pageId, undefined);
      }
    }, msUntilFire);

    handles.current.set(reminder.id, handle);
  }, [playTone, customTones, volume]);

  // Keep the scheduleReminder ref in sync
  useEffect(() => { scheduleReminderRef.current = scheduleReminder; });

  // Collect all tasks with active reminders across flat tasks, board tasks, and taskListBoards
  useEffect(() => {
    const now = Date.now();
    const activeIds = new Set<string>();

    pages.forEach(page => {
      // Helper to process a single task
      const processTask = (task: Task) => {
        if (!task.reminder?.active) return;
        if (task.reminder.alarmEnabled === false) return;
        const r = task.reminder;
        activeIds.add(r.id);

        if (!handles.current.has(r.id)) {
          if (r.fireAt > now) {
            scheduleReminder(r, task, page.name, page.id);
          } else if (r.intervalMinutes > 0) {
            // Overdue repeating reminder — fire immediately at next interval
            const nextFire = now + r.intervalMinutes * 60 * 1000;
            const updated: Reminder = { ...r, fireAt: nextFire };
            onUpdateReminderRef.current(task.id, page.id, updated);
            scheduleReminder(updated, task, page.name, page.id);
          }
        }
      };

      // Flat tasks
      page.tasks.forEach(processTask);

      // TodoBoard tasks (board/kanban columns)
      if (page.todoBoards) {
        page.todoBoards.forEach(board =>
          board.lists.forEach(list =>
            list.tasks.forEach(processTask)
          )
        );
      }

      // TaskListBoard tasks (multi-tab list mode)
      if (page.taskListBoards) {
        page.taskListBoards.forEach(board =>
          board.tasks.forEach(processTask)
        );
      }
    });

    // Cancel timers for reminders that are no longer active
    handles.current.forEach((_, id) => {
      if (!activeIds.has(id)) cancelReminder(id);
    });

  }, [pages, scheduleReminder, cancelReminder]);

  useEffect(() => {
    return () => {
      handles.current.forEach(h => clearTimeout(h));
      handles.current.clear();
      stops.current.forEach(s => s());
      stops.current.clear();
      ringingMountedRef.current.forEach(() => onModalUnmount());
      ringingMountedRef.current.clear();
    };
  }, []);

  return { scheduleReminder, cancelReminder, ringingIds, stopRinging };
}
