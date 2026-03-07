# 🌸 Orchid Notes — Antigravity Build Prompt
**Tauri 2 + React + TypeScript | Transparent Windowed Desktop App**

---

## PROJECT OVERVIEW

Build **Orchid Notes** — a transparent Tauri 2 desktop note-taking app where the window chrome IS the orchid frame image. The writing area sits inside the frame's "paper" region. Tasks support bullet points, checkboxes, and interval-based reminders using the Web Audio API (same pattern as Spore Cache Desktop).

---

## TECH STACK

- **Frontend**: React 18 + TypeScript + Vite
- **Desktop**: Tauri 2
- **Styling**: CSS Modules (no Tailwind — need precise pixel positioning for frame overlay)
- **Storage**: `@tauri-apps/plugin-store` (JSON file, persisted)
- **Notifications**: `@tauri-apps/plugin-notification`
- **Audio**: Web Audio API (inline, no npm package)
- **Rich Text**: Custom contenteditable implementation (no heavy lib)

---

## WINDOW CONFIGURATION (`src-tauri/tauri.conf.json`)

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Orchid Notes",
  "version": "0.1.0",
  "identifier": "com.prettysailorsoldier.orchid-notes",
  "build": {
    "frontendDist": "../dist"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "title": "Orchid Notes",
        "width": 520,
        "height": 680,
        "resizable": false,
        "decorations": false,
        "transparent": true,
        "shadow": false,
        "alwaysOnTop": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

**CRITICAL**: `transparent: true` + `decorations: false` makes the OS window chrome invisible. The orchid image (with its natural black background) becomes the visual frame. Anywhere the image is black/near-black will visually recede. The actual transparent regions (around the orchids) must be handled by making the HTML `body` background `transparent` and using the PNG's alpha channel.

---

## ASSET SETUP

1. Place `orchids.png` in `src/assets/orchids.png`
2. The image is 1000×1200px approximately — scale to fit 520×680 window
3. The "writing zone" (the grey rectangle in the frame's center) maps to approximately:
   - Top: 180px from top
   - Left: 60px from left  
   - Width: 400px
   - Height: 380px
   (Adjust these values by eyeballing the rendered result — document them as CSS variables)

---

## FILE STRUCTURE

```
orchid-notes/
├── src/
│   ├── assets/
│   │   └── orchids.png
│   ├── components/
│   │   ├── TaskEditor.tsx       # contenteditable rich text area
│   │   ├── TaskItem.tsx         # individual task row with checkbox + timer
│   │   ├── ReminderBadge.tsx    # countdown display on task
│   │   ├── TimerModal.tsx       # interval/time picker popup
│   │   └── WindowDrag.tsx       # invisible drag region for moving window
│   ├── hooks/
│   │   ├── useStore.ts          # tauri-plugin-store wrapper
│   │   ├── useReminders.ts      # interval timer logic + Web Audio alerts
│   │   └── useAudio.ts          # Web Audio API tones (same as Spore Cache)
│   ├── types/
│   │   └── index.ts             # Task, Reminder, ReminderInterval types
│   ├── App.tsx
│   ├── App.css
│   └── main.tsx
├── src-tauri/
│   ├── src/
│   │   └── main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── vite.config.ts
```

---

## TYPE DEFINITIONS (`src/types/index.ts`)

```typescript
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
  intervalMinutes: number;    // repeat every N minutes (0 = one-shot)
  fireAt: number;             // next fire timestamp (epoch ms)
  label: string;              // display label e.g. "every 30m"
  sound: ReminderSound;
  active: boolean;
}

export type ReminderSound = 'chime' | 'bell' | 'blip' | 'soft_ding' | 'none';

export type ReminderInterval =
  | { type: 'interval'; minutes: number }   // "remind me every X minutes"
  | { type: 'once'; at: number };           // "remind me at HH:MM today"
```

---

## STORE SCHEMA (`useStore.ts`)

Use `@tauri-apps/plugin-store` with key `orchid-notes-store.json`:

```typescript
interface StoreSchema {
  tasks: Task[];
  windowPosition?: { x: number; y: number };
}
```

**Operations needed:**
- `loadTasks(): Promise<Task[]>`
- `saveTasks(tasks: Task[]): Promise<void>`
- On app start: load tasks, restore any active reminders

---

## CORE COMPONENTS

### `App.tsx` — Root Layout

```
Body = transparent
  └── div.frame-container (position: relative, width: 520px, height: 680px)
       ├── img.orchid-frame (position: absolute, inset: 0, width: 100%, height: 100%, pointer-events: none, z-index: 0)
       ├── div.drag-region (position: absolute, top: 0, height: 60px, width: 100%, data-tauri-drag-region, z-index: 10)
       ├── div.writing-zone (position: absolute, top: 180px, left: 60px, width: 400px, height: 380px, z-index: 5, overflow-y: auto)
       │    └── TaskEditor
       └── div.controls-bar (position: absolute, bottom: 20px, left: 60px, width: 400px, z-index: 5)
            └── [close button, minimize button — minimal, styled to match frame]
```

**CSS for body:**
```css
html, body {
  margin: 0;
  padding: 0;
  background: transparent !important;
  overflow: hidden;
  user-select: none;
}
```

### `TaskEditor.tsx` — The Main Writing Area

Contenteditable div that manages a list of `Task` objects. Each line is a `TaskItem`.

**Keyboard behavior:**
- `Enter` → create new task (same type as current line)
- `Tab` → toggle type: plain → bullet → checkbox → plain
- `Ctrl+B` → bold selection
- `Ctrl+I` → italic selection
- `Backspace` on empty line → delete task, move to previous
- `Alt+T` → open TimerModal for current line

**Visual style for writing zone:**
```css
.writing-zone {
  background: transparent;
  color: #e8e0f0;              /* soft lavender-white for readability */
  font-family: 'Crimson Pro', Georgia, serif;
  font-size: 15px;
  line-height: 1.7;
  padding: 12px 16px;
  scrollbar-width: thin;
  scrollbar-color: rgba(180, 140, 220, 0.3) transparent;
}
```

### `TaskItem.tsx` — Individual Task Row

```tsx
interface Props {
  task: Task;
  onUpdate: (updated: Task) => void;
  onDelete: (id: string) => void;
  onSetReminder: (taskId: string) => void;
}
```

Renders differently per type:
- `bullet` → `•` prefix, editable span
- `checkbox` → custom checkbox (circle → checkmark on click), strikethrough on complete
- `heading` → larger, slightly bolder text
- `plain` → no prefix

**Checkbox styling** — no browser default checkbox. Use SVG circle that fills/checks on click:
```css
.custom-checkbox {
  width: 14px;
  height: 14px;
  border: 1.5px solid rgba(180, 140, 220, 0.6);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.custom-checkbox.checked {
  background: rgba(180, 140, 220, 0.4);
  border-color: rgba(180, 140, 220, 0.9);
}
```

**Reminder badge** on each task — if task has active reminder, show small countdown pill:
```
[⏱ 28m]  — clicking it opens TimerModal to edit/cancel
```

**Timer bell icon** — appears on hover (like Spore Cache's hover-reveal checkbox):
```
[🔔] — clicking opens TimerModal for that task
```

### `TimerModal.tsx` — Interval/Time Picker

Floating modal positioned near the task row. Styled with a semi-transparent dark background with orchid-purple border.

**UI:**
```
┌─────────────────────────────┐
│  ⏱ Set Reminder             │
│  ─────────────────────────  │
│  Repeat every:              │
│  [5m] [15m] [30m] [1h] [—] │
│                             │
│  Or fire once at: [HH:MM]  │
│                             │
│  Sound: [chime ▼]           │
│                             │
│  [Set]  [Cancel]            │
└─────────────────────────────┘
```

Interval presets: 5, 10, 15, 20, 30, 45, 60 minutes. Custom input too.

### `useReminders.ts` — The Reminder Engine

This is the heart of the timer system. Pattern matches Spore Cache's alarm approach but adapted for Tauri (no Chrome alarms API — use `setInterval` + `setTimeout` + Tauri notifications plugin).

```typescript
// On app load:
// 1. Load all tasks with reminders from store
// 2. For each active reminder, calculate ms until next fire
// 3. Set setTimeout for that duration
// 4. On fire: play audio tone + show Tauri notification + reschedule if interval

function scheduleReminder(reminder: Reminder, task: Task): void {
  const now = Date.now();
  const msUntilFire = Math.max(0, reminder.fireAt - now);
  
  setTimeout(async () => {
    // 1. Play audio
    playReminderTone(reminder.sound);
    
    // 2. Show native notification
    await sendNotification({
      title: 'Orchid Notes',
      body: task.content.slice(0, 80),
      icon: 'icons/icon.png'
    });
    
    // 3. Reschedule if interval-based
    if (reminder.intervalMinutes > 0) {
      const nextFire = Date.now() + reminder.intervalMinutes * 60 * 1000;
      const updated = { ...reminder, fireAt: nextFire };
      // update store + reschedule
      scheduleReminder(updated, task);
    } else {
      // one-shot: mark inactive
      cancelReminder(reminder.id);
    }
  }, msUntilFire);
}
```

Keep a `Map<string, ReturnType<typeof setTimeout>>` of active timer handles for cancellation.

### `useAudio.ts` — Web Audio Tones

**Copy the exact tone engine from Age Quod Agis / Spore Cache.** Same tones:
- `chime` — ascending 3-note (880, 1100, 1320 Hz)
- `bell` — triangle wave 660Hz
- `blip` — square wave 1000Hz
- `soft_ding` — sine 528Hz
- `fanfare` — 4-note ascending

```typescript
export function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  
  function getCtx() {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }
  
  function playTone(type: ReminderSound, volume = 0.5): void { ... }
  
  return { playTone };
}
```

### `WindowDrag.tsx` — Draggable Region

Invisible div across the top of the window (over the circular ornament area):
```tsx
<div
  data-tauri-drag-region
  style={{
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '80px',
    zIndex: 10,
    cursor: 'grab'
  }}
/>
```

### Window Controls

Minimal close/minimize buttons styled to feel organic with the frame. Place at top-right corner, inside the frame decoration area. Use Tauri's `getCurrentWindow().close()` and `.minimize()`.

Style: small circular buttons, deep purple/orchid tint, 24px diameter, no text — just × and − glyphs in a delicate font.

---

## TAURI RUST SIDE (`src-tauri/src/main.rs`)

Minimal — let the frontend handle logic. Only needs:

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error while running Orchid Notes");
}
```

**`Cargo.toml` dependencies to add:**
```toml
[dependencies]
tauri = { version = "2", features = ["devtools"] }
tauri-plugin-store = "2"
tauri-plugin-notification = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**`tauri.conf.json` permissions to add:**
```json
{
  "permissions": [
    "store:default",
    "notification:default"
  ]
}
```

---

## VISUAL DESIGN DETAILS

### Color Palette
```css
:root {
  --orchid-purple: rgba(180, 130, 220, 1);
  --orchid-blue: rgba(110, 160, 220, 1);
  --orchid-glow: rgba(200, 160, 255, 0.15);
  --text-primary: #ede8f5;
  --text-muted: rgba(220, 200, 240, 0.6);
  --checkbox-border: rgba(180, 140, 220, 0.5);
  --reminder-pill: rgba(140, 100, 200, 0.3);
  --scrollbar: rgba(180, 140, 220, 0.2);
}
```

### Typography
- Body/tasks: `'Crimson Pro'` (Google Fonts, elegant serif, great for notes)
- UI labels: `'Cormorant Garamond'` (very delicate, matches floral art nouveau vibe)
- Fallback: Georgia, serif

Load via: `@import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=Cormorant+Garamond:wght@300;400&display=swap');`

### Reminder Pill Style
```css
.reminder-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-family: 'Cormorant Garamond', serif;
  color: var(--orchid-purple);
  background: var(--reminder-pill);
  border: 1px solid rgba(180, 130, 220, 0.3);
  border-radius: 10px;
  padding: 1px 7px;
  margin-left: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.reminder-pill:hover {
  background: rgba(140, 100, 200, 0.45);
}
```

### Scrollbar (writing zone)
```css
.writing-zone::-webkit-scrollbar { width: 4px; }
.writing-zone::-webkit-scrollbar-track { background: transparent; }
.writing-zone::-webkit-scrollbar-thumb {
  background: rgba(180, 140, 220, 0.25);
  border-radius: 2px;
}
```

### Completed Task Style
```css
.task-item.completed .task-content {
  text-decoration: line-through;
  color: var(--text-muted);
  opacity: 0.6;
}
```

---

## IMPLEMENTATION ORDER

### Phase 1 — Shell (Day 1)
1. `npm create tauri-app@latest orchid-notes -- --template react-ts`
2. Install plugins: `npm i @tauri-apps/plugin-store @tauri-apps/plugin-notification`
3. Configure `tauri.conf.json` — transparent window, no decorations, 520×680
4. Add `transparent: true` to body CSS
5. Place orchid PNG, overlay as `position: absolute, inset: 0`
6. Verify the frame renders correctly and OS shows transparency around orchids
7. Add drag region — confirm window is draggable by orchid area
8. Add close/minimize buttons

**Checkpoint**: Beautiful orchid-framed transparent window that can be dragged and closed.

### Phase 2 — Task Editor (Day 2)
1. Build `Task` type and `useStore` hook
2. Implement `TaskEditor` with contenteditable
3. Implement `TaskItem` with bullet/checkbox/heading rendering
4. Wire Enter/Tab/Backspace keyboard behavior
5. Persist tasks to store on every change (debounced 500ms)
6. Load tasks on app start

**Checkpoint**: Can type, create tasks, check checkboxes, and tasks persist across app restarts.

### Phase 3 — Reminders (Day 3)
1. Build `useAudio` (copy from Age Quod Agis tone engine)
2. Build `TimerModal` component
3. Build `useReminders` hook with setTimeout scheduling
4. Add Tauri notification plugin integration
5. Wire reminder bell icon (hover reveal on task rows)
6. Add ReminderBadge countdown display
7. Handle app restart: reschedule any reminders whose `fireAt` is still in the future

**Checkpoint**: Can set "remind me every 30 minutes" on a task, hear the chime, see the native notification, watch it reschedule.

### Phase 4 — Polish (Day 4)
1. Smooth animations (task appear/delete, checkbox click, modal open)
2. Right-click context menu on tasks (delete, change type, set reminder)
3. Task reordering (drag-to-reorder within writing zone)
4. Font loading fallback handling
5. App icon (orchid-themed, use orchids.png as base)
6. System tray icon + "Open Orchid Notes" menu item

---

## KNOWN GOTCHAS

1. **PNG transparency**: The orchid PNG must have a transparent alpha channel around the flowers. If the original has a solid black background, you'll need to use CSS `mix-blend-mode: screen` or pre-process the image in Photoshop/Affinity to add transparency. Check if the uploaded image has actual alpha — it appears to have a solid black BG, so you may need to use `mix-blend-mode: screen` on the frame image to let the orchids show against any desktop.

2. **Tauri transparent window on Windows**: Requires `"shadow": false` AND the WebView2 background must be set to transparent. Add this to `main.rs`:
   ```rust
   .setup(|app| {
     let win = app.get_webview_window("main").unwrap();
     win.set_background_color(Some(tauri::window::Color(0, 0, 0, 0))).ok();
     Ok(())
   })
   ```

3. **Audio context requires user gesture**: First tone won't play until user clicks somewhere. Create AudioContext on first click, not on mount.

4. **Reminder persistence across app restart**: Store `fireAt` timestamps in the store. On load, if `fireAt < Date.now()`, either fire immediately or skip (configurable — skip is better UX). If `fireAt > Date.now()`, reschedule normally.

5. **contenteditable + React**: Don't use React state to control the contenteditable innerHTML — you'll get cursor jumping. Use uncontrolled refs and sync to React state on blur/change with careful caret position preservation.

---

## FUTURE ADDITIONS (post-MVP)

- **Tags/colors per task**: Pill tags that can be color-coded
- **Multiple pages/notes**: Swipe or button to go to a second "petal" of notes
- **Export**: Copy all tasks as plain text to clipboard
- **Global hotkey**: `Ctrl+Alt+O` to bring window to focus from anywhere
- **Themes**: Swap orchid frame for other botanical frames (rose, lotus, wisteria)
- **Monetization**: Sell additional frame themes as one-time IAP ($2–5 each) via Gumroad + a manual license key system

