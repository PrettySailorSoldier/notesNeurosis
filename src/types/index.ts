export type TaskType = 'bullet' | 'checkbox' | 'heading' | 'plain';

export type PageType = 'notes' | 'todo' | 'interval' | 'planner';
export type PlannerSubtype = 'schedule' | 'caregiving' | 'goals';

export interface Task {
  id: string;
  content: string;
  type: TaskType;
  completed: boolean;
  createdAt: number;
  reminder?: Reminder;
  color?: AccentColor;
}

export interface Reminder {
  id: string;
  taskId: string;
  intervalMinutes: number;   // repeat every N minutes (0 = one-shot)
  fireAt: number;            // next fire timestamp (epoch ms)
  label: string;             // display label e.g. "every 30m"
  sound: ReminderSound;
  active: boolean;
}

export type ReminderSound = 'chime' | 'bell' | 'blip' | 'soft_ding' | 'none' | string;

export type ReminderInterval =
  | { type: 'interval'; minutes: number }
  | { type: 'once'; at: number };

// Interval page — each task is a timed step that runs consecutively
export type IntervalPhaseType = 'work' | 'break' | 'transition' | 'buffer';

export interface IntervalTask {
  id: string;
  label: string;
  durationSeconds: number;
  completed: boolean;
  phaseType?: IntervalPhaseType;
}

export interface SavedSequence {
  id: string;
  name: string;
  tasks: Omit<IntervalTask, 'completed'>[];
}

// Goals page — short or long term goal entries
export interface GoalEntry {
  id: string;
  title: string;
  notes: string;
  horizon: 'short' | 'long';
  completed: boolean;
  createdAt: number;
}

export interface Page {
  id: string;
  name: string;
  tasks: Task[];
  createdAt: number;
  pageType?: PageType;
  plannerSubtype?: PlannerSubtype;
  intervalTasks?: IntervalTask[];
  goals?: GoalEntry[];
}

export interface PlannerBlock {
  id: string;
  date: string;            // ISO date string e.g. "2026-03-07"
  startTime: string;       // "HH:MM" 24-hour format
  endTime: string;         // "HH:MM" 24-hour format
  label: string;           
  notes: string;           
  color: AccentColor;
  completed: boolean;
  tasks?: Task[];
}

export type AccentColor = 
  | 'plum'
  | 'rose'
  | 'peach'
  | 'orange'
  | 'yellow'
  | 'blue'
  | 'ghost'
  
  // legacy for backward compatibility
  | 'violet'
  | 'indigo'
  | 'amber'
  | 'teal';

export type CareCategory =
  | 'medication'
  | 'walk'
  | 'meal'
  | 'hygiene'
  | 'therapy'
  | 'check-in'
  | 'appointment';

export type CareEntry = {
  id: string;
  time: string;            // "HH:MM" 24-hour
  endTime: string;         // "HH:MM" 24-hour — for duration display
  label: string;           // e.g. "Morning Meds — Fludrocortisone + Colace + Keflex"
  person: string;          // "Donna"
  category: CareCategory;
  notes: string;           // detail text, shown as sub-label
  completed: boolean;
  recurring: boolean;
  recurringDays: number[]; // 0=Sun … 6=Sat; [0,1,2,3,4,5,6] = every day
};

