import { useState, useEffect, useCallback } from 'react';
import { load } from '@tauri-apps/plugin-store';

const STORE_FILE = 'notes-neurosis-settings.json';

export interface CustomTone {
  id: string;
  name: string;
  dataUrl: string;
}

export interface Settings {
  customTones: CustomTone[];
  volume: number;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({ customTones: [], volume: 0.75 });

  useEffect(() => {
    (async () => {
      try {
        const store = await load(STORE_FILE, { autoSave: false } as any);
        const tones = await store.get<CustomTone[]>('customTones');
        const vol = await store.get<number>('volume');
        setSettings(prev => ({
          customTones: tones || prev.customTones,
          volume: vol !== undefined && vol !== null ? vol : prev.volume
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

  return { settings, addCustomTone, removeCustomTone, setVolume };
}
