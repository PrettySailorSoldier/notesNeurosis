import { Store } from '@tauri-apps/plugin-store';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { CareEntry, CareCategory } from '../types';

const STORE_KEY = 'care_entries';

function seedDonnaSchedule(): Record<string, CareEntry[]> {
  const make = (
    time: string, endTime: string, label: string, notes: string,
    category: CareCategory, recurringDays: number[] = [0,1,2,3,4,5,6]
  ): CareEntry => ({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + label.slice(0,3),
    time, endTime, label,
    person: 'Donna',
    category, notes,
    completed: false,
    recurring: true,
    recurringDays
  });

  const entries: CareEntry[] = [
    make('06:30', '07:00', 'Morning Meds', 'Fludrocortisone 0.1mg + Colace 100mg (1st dose) + Keflex 500mg (1st of 3). Give with small food/water. Log each dose. PRN Norco only if pain 4+/10.', 'medication'),
    make('07:00', '07:30', 'Walk #1 + Bathroom Assist', 'First bathroom trip of the day. Walk to kitchen and back minimum. Check pain level (1–10). Check surgical site briefly. Offer water after.', 'walk'),
    make('07:30', '08:30', 'Hygiene & Breakfast', 'Face/hands/teeth. Assist dressing (no bending past 90°). Prepare breakfast together — protein-rich, calcium-rich. Hydration priority.', 'hygiene'),
    make('08:30', '09:30', 'Morning PT Exercises', 'Prescribed exercises: ankle pumps, quad sets, bed mobility as directed. Stop if pain >5/10. Log completion — PT will ask.', 'therapy'),
    make('09:30', '10:00', 'Walk #2 + Bathroom Assist', 'Mid-morning bathroom + short supervised walk (hallway loop). Offer water after.', 'walk'),
    make('11:00', '11:15', 'Keflex 2nd Dose', 'Keflex 500mg — 2nd of 3 doses (8hr spacing from morning). Give with small snack. Log time given.', 'medication'),
    make('11:30', '12:00', 'Walk #3 + Bathroom Assist', 'Mid-morning bathroom + brief walk. Small snack or water after helps anchor the routine.', 'walk'),
    make('12:30', '13:30', 'Lunch Together', 'Protein + veggies + whole grains. Soft options: soup, scrambled eggs, yogurt. Encourage water intake. Assess pain after activity.', 'meal'),
    make('13:00', '13:30', 'Walk #4 + Bathroom Assist', 'Post-lunch bathroom trip (IBS — predictable timing). Brief supervised walk before rest.', 'walk'),
    make('13:30', '15:00', 'Afternoon Rest', 'Post-surgery fatigue is normal. Nap okay but keep under 90 min. Low stimulation — music, TV, photo album.', 'check-in'),
    make('15:00', '15:15', 'Keflex 3rd Dose', 'Keflex 500mg — 3rd/final dose of the day (if started at 7AM). Give with food/water. Log time.', 'medication'),
    make('14:30', '15:00', 'Walk #5 + Bathroom Assist', 'Gentle wake after rest. Offer bathroom trip, then brief supervised walk before afternoon activities.', 'walk'),
    make('15:00', '16:00', 'Afternoon PT Exercises', 'Second PT session if prescribed twice daily. Skip if pain is 5+/10 — log the skip. Celebrate small wins with Donna.', 'therapy'),
    make('15:00', '16:00', 'Afternoon Snack & Hydration', 'Small healthy snack + water. Donna may not ask — offer proactively. Helps prevent late-day confusion from low blood sugar.', 'meal'),
    make('16:30', '17:00', 'Walk #6 + Bathroom Assist', 'Pre-dinner walk — often a small late-afternoon energy uptick. Short, at her pace. Good window.', 'walk'),
    make('17:00', '18:00', 'Dinner Together', 'Warm familiar foods. Keep calm — no stressful conversations or loud TV. Involve Donna in small ways if possible (stirring, setting table seated).', 'meal'),
    make('18:00', '18:15', 'Evening Meds', 'Colace 100mg (2nd daily dose, with dinner). Weekly Vitamin D on scheduled day only. PRN Norco if pain 4+/10. Log everything.', 'medication'),
    make('18:30', '19:00', 'Walk #7 + Bathroom Assist', 'Last active walk of the day — post-dinner (important with IBS). Keep very short and calm. Evening hygiene prep follows.', 'walk'),
    make('19:00', '21:00', 'Evening Wind-Down', 'Dim lights, lower TV volume. Soothing music if she enjoys it. No new topics, no stimulating activities. Critical sundowning prevention window.', 'check-in'),
    make('20:00', '20:15', 'Evening Bathroom Assist', 'Pre-bedtime prep trip. Offer warm decaf tea or water before she settles for the night.', 'walk'),
    make('21:00', '22:00', 'Bedtime Routine', 'Teeth, face wash, comfortable sleepwear. Assist into bed — proper positioning, no sharp hip turns, pillows between knees if side sleeper.', 'hygiene'),
    make('21:30', '22:00', 'Final Bathroom Assist', 'Last trip before sleep. Reduces overnight urgency and nighttime fall risk. Ensure path is clear and nightlight is on.', 'walk'),
    make('22:00', '22:15', 'End-of-Day Meds Check', 'Review med log: all scheduled meds given? Any refusals? Check pain (1–10). Offer Norco if 4+ and 4+ hours since last dose. Note anything unusual.', 'medication'),
  ];

  return { recurring: entries };
}

export function useCareSchedule() {
  const storeRef = useRef<Store | null>(null);
  const [entries, setEntries] = useState<Record<string, CareEntry[]>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await Store.load('care-schedule.json');
      storeRef.current = s;
      const saved = await s.get<Record<string, CareEntry[]>>(STORE_KEY);
      if (saved && Object.keys(saved).length > 0) {
        setEntries(saved);
      } else {
        // First run — seed with Donna's real schedule
        const seeded = seedDonnaSchedule();
        setEntries(seeded);
        await s.set(STORE_KEY, seeded);
        await s.save();
      }
      setReady(true);
    })();
  }, []);

  const save = useCallback(async (next: Record<string, CareEntry[]>) => {
    setEntries(next);
    if (storeRef.current) {
      await storeRef.current.set(STORE_KEY, next);
      await storeRef.current.save();
    }
  }, []);

  const getEntriesForDate = useCallback((date: string): CareEntry[] => {
    const direct = entries[date] ?? [];
    const directIds = new Set(direct.map((e: CareEntry) => e.id));

    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();

    const recurring = (entries['recurring'] ?? []).filter(
      (e: CareEntry) => e.recurringDays.includes(dow) && !directIds.has(e.id)
    );

    const merged = [...recurring, ...direct];
    return merged.sort((a, b) => a.time.localeCompare(b.time));
  }, [entries]);

  const addEntry = useCallback(async (date: string, entry: Omit<CareEntry, 'id'>) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const key = entry.recurring ? 'recurring' : date;
    const next = {
      ...entries,
      [key]: [...(entries[key] ?? []), { ...entry, id }]
    };
    await save(next);
  }, [entries, save]);

  const updateEntry = useCallback(async (date: string, id: string, patch: Partial<CareEntry>) => {
    const key = (entries[date] ?? []).find((e: CareEntry) => e.id === id) ? date : 'recurring';
    const next = {
      ...entries,
      [key]: (entries[key] ?? []).map((e: CareEntry) => e.id === id ? { ...e, ...patch } : e)
    };
    await save(next);
  }, [entries, save]);

  const toggleComplete = useCallback(async (date: string, id: string) => {
    const baseEntry = (entries['recurring'] ?? []).find((e: CareEntry) => e.id === id);
    if (baseEntry) {
      const dateOverrides = entries[date] ?? [];
      const existing = dateOverrides.find((e: CareEntry) => e.id === id);
      if (existing) {
        const next = {
          ...entries,
          [date]: dateOverrides.map((e: CareEntry) => e.id === id ? { ...e, completed: !e.completed } : e)
        };
        await save(next);
      } else {
        const next = {
          ...entries,
          [date]: [...dateOverrides, { ...baseEntry, id, recurring: false, completed: true }]
        };
        await save(next);
      }
    } else {
      await updateEntry(date, id, {
        completed: !(entries[date] ?? []).find((e: CareEntry) => e.id === id)?.completed
      });
    }
  }, [entries, updateEntry, save]);

  const deleteEntry = useCallback(async (date: string, id: string) => {
    const key = (entries[date] ?? []).find((e: CareEntry) => e.id === id) ? date : 'recurring';
    const next = {
      ...entries,
      [key]: (entries[key] ?? []).filter((e: CareEntry) => e.id !== id)
    };
    await save(next);
  }, [entries, save]);

  const reorderEntries = useCallback(async (date: string, reordered: CareEntry[]) => {
    const next = { ...entries, [date]: reordered };
    await save(next);
  }, [entries, save]);

  const importSchedule = useCallback(async (newEntries: Record<string, CareEntry[]>) => {
    await save(newEntries);
  }, [save]);

  return {
    ready,
    getEntriesForDate,
    addEntry,
    updateEntry,
    toggleComplete,
    deleteEntry,
    reorderEntries,
    importSchedule
  };
}
