export type TaskType = 'bullet' | 'checkbox' | 'heading' | 'plain';

export interface Task {
  id: string;
  content: string;
  type: TaskType;
  completed: boolean;
  createdAt: number;
  reminder?: Reminder;
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

export type ReminderSound = 'chime' | 'bell' | 'blip' | 'soft_ding' | 'none';

export type ReminderInterval =
  | { type: 'interval'; minutes: number }
  | { type: 'once'; at: number };

export interface Page {
  id: string;
  name: string;
  tasks: Task[];
  createdAt: number;
}
