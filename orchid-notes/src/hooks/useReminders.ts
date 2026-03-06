import { useEffect, useRef, useCallback } from 'react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import type { Task, Reminder } from '../types';
import { useAudio } from './useAudio';

type TimerHandle = ReturnType<typeof setTimeout>;

export function useReminders(
  tasks: Task[],
  onUpdateReminder: (taskId: string, reminder: Reminder | undefined) => void
) {
  const handles = useRef<Map<string, TimerHandle>>(new Map());
  const { playTone } = useAudio();
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const cancelReminder = useCallback((reminderId: string) => {
    const handle = handles.current.get(reminderId);
    if (handle !== undefined) {
      clearTimeout(handle);
      handles.current.delete(reminderId);
    }
  }, []);

  const scheduleReminder = useCallback((reminder: Reminder, task: Task) => {
    cancelReminder(reminder.id);

    const msUntilFire = Math.max(0, reminder.fireAt - Date.now());

    const handle = setTimeout(async () => {
      // 1. Play audio tone
      playTone(reminder.sound);

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
            body: task.content.slice(0, 80) || 'Reminder',
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
        onUpdateReminder(task.id, updated);
        scheduleReminder(updated, task);
      } else {
        // One-shot: deactivate
        onUpdateReminder(task.id, undefined);
      }
    }, msUntilFire);

    handles.current.set(reminder.id, handle);
  }, [cancelReminder, onUpdateReminder, playTone]);

  // On mount and whenever tasks change: sync reminder schedules
  useEffect(() => {
    const now = Date.now();

    tasks.forEach(task => {
      if (!task.reminder?.active) return;
      const r = task.reminder;

      if (!handles.current.has(r.id)) {
        if (r.fireAt > now) {
          // Future: schedule normally
          scheduleReminder(r, task);
        } else if (r.intervalMinutes > 0) {
          // Missed interval: reschedule from now
          const nextFire = now + r.intervalMinutes * 60 * 1000;
          const updated: Reminder = { ...r, fireAt: nextFire };
          onUpdateReminder(task.id, updated);
          scheduleReminder(updated, task);
        }
        // Missed one-shot: skip (better UX)
      }
    });

    // Cancel handles for removed/deactivated reminders
    const activeIds = new Set(
      tasks.filter(t => t.reminder?.active).map(t => t.reminder!.id)
    );
    handles.current.forEach((_, id) => {
      if (!activeIds.has(id)) cancelReminder(id);
    });

  }, [tasks, scheduleReminder, cancelReminder, onUpdateReminder]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      handles.current.forEach(h => clearTimeout(h));
      handles.current.clear();
    };
  }, []);

  return { scheduleReminder, cancelReminder };
}
