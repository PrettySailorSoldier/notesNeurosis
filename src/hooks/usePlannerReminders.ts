import { useEffect, useRef, useCallback, useState } from 'react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import type { PlannerBlock, Reminder, ReminderSound } from '../types';
import { useAudio } from './useAudio';
import type { CustomTone } from './useSettings';

type TimerHandle = ReturnType<typeof setTimeout>;

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Converts a planner block date + time string to epoch ms.
 * e.g. date="2026-04-12", time="09:30" → epoch ms
 */
export function blockDateTimeToMs(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0).getTime();
}

/**
 * Builds a one-shot Reminder for firing at a block's start time,
 * or N minutes before it.
 */
export function makeBlockReminder(
  block: PlannerBlock,
  minutesBefore: number,
  sound: ReminderSound
): Reminder {
  const blockStartMs = blockDateTimeToMs(block.date, block.startTime);
  const fireAt = blockStartMs - minutesBefore * 60 * 1000;
  const label = minutesBefore === 0
    ? 'at start'
    : `${minutesBefore}m before`;
  return {
    id: makeId(),
    taskId: block.id,
    intervalMinutes: 0, // one-shot
    fireAt,
    label,
    sound,
    active: true,
    alarmEnabled: true,
  };
}

export function usePlannerReminders(
  blocks: PlannerBlock[],
  onUpdateBlock: (id: string, changes: Partial<PlannerBlock>) => void,
  customTones: CustomTone[] = [],
  volume: number = 0.75
) {
  const handles = useRef<Map<string, TimerHandle>>(new Map());
  const stops   = useRef<Map<string, () => void>>(new Map());
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

  const scheduleReminder = useCallback((
    reminder: Reminder,
    block: PlannerBlock
  ) => {
    const existing = handles.current.get(reminder.id);
    if (existing !== undefined) clearTimeout(existing);
    if (reminder.alarmEnabled === false) return;

    const msUntilFire = Math.max(0, reminder.fireAt - Date.now());

    const handle = setTimeout(async () => {
      // 1. Play audio
      const stopAud = playTone(reminder.sound, volume, customTones);
      stops.current.set(reminder.id, stopAud);
      setRingingIds(prev => prev.includes(reminder.id) ? prev : [...prev, reminder.id]);

      // 2. Native notification
      try {
        let granted = await isPermissionGranted();
        if (!granted) {
          const perm = await requestPermission();
          granted = perm === 'granted';
        }
        if (granted) {
          const timeStr = block.startTime;
          const title = reminder.label === 'at start'
            ? `🗓 Now: ${block.label || 'Block starting'}`
            : `🗓 ${reminder.label}: ${block.label || 'Upcoming block'}`;
          await sendNotification({ title, body: `${block.date} · ${timeStr}` });
        }
      } catch (err) {
        console.warn('[usePlannerReminders] notification error:', err);
      }

      // 3. One-shot: deactivate after firing
      onUpdateBlock(block.id, { reminder: undefined });
      handles.current.delete(reminder.id);
    }, msUntilFire);

    handles.current.set(reminder.id, handle);
  }, [playTone, customTones, volume, onUpdateBlock]);

  // Schedule / cancel as blocks change
  useEffect(() => {
    const now = Date.now();
    const activeIds = new Set<string>();

    blocks.forEach(block => {
      if (!block.reminder?.active) return;
      const r = block.reminder;
      activeIds.add(r.id);

      if (!handles.current.has(r.id)) {
        if (r.fireAt > now) {
          scheduleReminder(r, block);
        } else {
          // Already passed — clear the stale reminder
          onUpdateBlock(block.id, { reminder: undefined });
        }
      }
    });

    // Cancel timers for removed reminders
    handles.current.forEach((_, id) => {
      if (!activeIds.has(id)) cancelReminder(id);
    });
  }, [blocks, scheduleReminder, cancelReminder, onUpdateBlock]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      handles.current.forEach(h => clearTimeout(h));
      handles.current.clear();
      stops.current.forEach(s => s());
      stops.current.clear();
    };
  }, []);

  return { ringingIds, stopRinging, cancelReminder, makeBlockReminder };
}
