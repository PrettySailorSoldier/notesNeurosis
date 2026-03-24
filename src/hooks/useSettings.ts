import { useState, useEffect, useCallback } from 'react';
import { load } from '@tauri-apps/plugin-store';
import type { ReminderSound } from '../types';

const STORE_FILE = 'notes-neurosis-settings.json';
const SETTINGS_BACKUP_KEY = 'settings_backup';

export interface CustomTone {
  id: string;
  name: string;
  dataUrl: string;
}

export interface Settings {
  customTones: CustomTone[];
  volume: number;
  defaultReminderMinutes: number;
  defaultReminderSound: ReminderSound;
  defaultBlockDuration: number;
}

const DEFAULT_SETTINGS: Settings = {
  customTones: [],
  volume: 0.75,
  defaultReminderMinutes: 30,
  defaultReminderSound: 'chime',
  defaultBlockDuration: 60,
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    (async () => {
      try {
        const store = await load(STORE_FILE, { autoSave: false } as any);
        const tones = await store.get<CustomTone[]>('customTones');
        const vol = await store.get<number>('volume');
        const defMin = await store.get<number>('defaultReminderMinutes');
        const defSound = await store.get<ReminderSound>('defaultReminderSound');
        const defBlock = await store.get<number>('defaultBlockDuration');

        const hasData = tones || vol != null || defMin != null || defSound || defBlock != null;

        if (!hasData) {
          // Try restoring from backup
          const backup = await store.get<Settings>(SETTINGS_BACKUP_KEY);
          if (backup) {
            console.warn('[useSettings] main keys empty, restoring from backup');
            setSettings(backup);
            // Restore individual keys
            await store.set('customTones', backup.customTones);
            await store.set('volume', backup.volume);
            await store.set('defaultReminderMinutes', backup.defaultReminderMinutes);
            await store.set('defaultReminderSound', backup.defaultReminderSound);
            await store.set('defaultBlockDuration', backup.defaultBlockDuration);
            await store.save();
            return;
          }
        }

        setSettings(prev => ({
          customTones: tones || prev.customTones,
          volume: vol !== undefined && vol !== null ? vol : prev.volume,
          defaultReminderMinutes: defMin ?? prev.defaultReminderMinutes,
          defaultReminderSound: defSound ?? prev.defaultReminderSound,
          defaultBlockDuration: defBlock ?? prev.defaultBlockDuration,
        }));
      } catch (err) {
        console.warn("[useSettings] load error:", err);
      }
    })();
  }, []);

  const saveSettings = useCallback(async (newSettings: Settings) => {
    setSettings(newSettings);
    try {
      const store = await load(STORE_FILE, { autoSave: false } as any);
      await store.set('customTones', newSettings.customTones);
      await store.set('volume', newSettings.volume);
      await store.set('defaultReminderMinutes', newSettings.defaultReminderMinutes);
      await store.set('defaultReminderSound', newSettings.defaultReminderSound);
      await store.set('defaultBlockDuration', newSettings.defaultBlockDuration);
      await store.set(SETTINGS_BACKUP_KEY, newSettings);
      await store.save();
    } catch (e) {
      console.warn("[useSettings] save error:", e);
    }
  }, []);

  const addCustomTone = useCallback((tone: CustomTone) => {
    setSettings(prev => {
      const next = { ...prev, customTones: [...prev.customTones, tone] };
      saveSettings(next);
      return next;
    });
  }, [saveSettings]);

  const removeCustomTone = useCallback((id: string) => {
    setSettings(prev => {
      const next = { ...prev, customTones: prev.customTones.filter(t => t.id !== id) };
      saveSettings(next);
      return next;
    });
  }, [saveSettings]);

  const setVolume = useCallback((volume: number) => {
    setSettings(prev => {
      const next = { ...prev, volume };
      saveSettings(next);
      return next;
    });
  }, [saveSettings]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, [saveSettings]);

  return { settings, addCustomTone, removeCustomTone, setVolume, updateSettings };
}
