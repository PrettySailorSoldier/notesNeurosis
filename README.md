# Notes Neurosis

> A transparent, orchid-themed desktop productivity app built for the way neurodivergent brains actually work.

**Notes Neurosis** is a Tauri v2 + React 19 + TypeScript desktop application. It runs as a frameless, transparent window and stores all data locally — no accounts, no cloud sync, no telemetry. Pages are organised in a draggable tab strip and each tab can be one of six distinct page types, switchable at any time via right-click.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Page Types](#page-types)
  - [📝 Notes](#-notes)
  - [✅ To-Do (List · Board · Sequence)](#-to-do-list--board--sequence)
  - [⏱ Interval Timer](#-interval-timer)
  - [📅 Planner (Schedule · Caregiving · Goals)](#-planner-schedule--caregiving--goals)
  - [◉ Habit Tracker](#-habit-tracker)
  - [⏲ Time Tracker](#-time-tracker)
- [Cross-Cutting Features](#cross-cutting-features)
- [Options Modal](#options-modal)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Development](#development)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| App shell | [Tauri v2](https://tauri.app/) (Rust backend) |
| Frontend | React 19 + TypeScript |
| Build | Vite 7 |
| Persistence | `@tauri-apps/plugin-store` (local JSON files) |
| Notifications | `@tauri-apps/plugin-notification` |
| AI features | `@anthropic-ai/sdk` (Claude, via injected `window.claude`) |
| Styling | Vanilla CSS with CSS custom properties |

The window is **frameless and transparent** (`decorations: false`, `transparent: true`), overlaid with a custom blue-orchid PNG frame. A Tauri drag region sits at the top so the window is still movable.

---

## Page Types

Every page tab shows a type-specific icon and can be renamed (double-click or right-click → Rename). Pages can be reordered by dragging. Right-clicking any tab opens a context menu to change type, change sub-style, rename, or delete.

### 📝 Notes

A freeform writing surface. Supports **multiple named boards** (tabs), each holding independent rich text. Content is saved automatically.

- Boards can be added, renamed, and deleted via the tab strip
- Legacy single-note pages migrate automatically to the multi-board format on first load
- Supports basic inline formatting (bold, italic) via keyboard shortcuts

---

### ✅ To-Do (List · Board · Sequence)

A single `todo` page type with three switchable sub-styles:

#### List
A classic flat task list backed by **multi-board tabs** (one tab = one list). Each task supports:
- Four task types cycled with `Tab`: **bullet**, **checkbox**, **heading**, **plain**
- Indentation (subtask depth)
- Per-task accent color
- **Reminders** — attach a repeating or one-shot alarm to any task (bell icon or `Alt+T`)
- Inline bold/italic formatting
- `Enter` to add a new item, `Backspace` on an empty line to merge upward

#### Board (Kanban)
A multi-column board layout. Each page can hold **multiple named boards** (e.g. "Week 1", "Week 2"), each with unlimited columns. Columns support:
- Collapsible bodies
- Per-column accent color dot
- Drag-and-drop cards between columns
- Reminders on individual cards
- Column-level bulk controls

#### Sequence
A numbered, step-through checklist designed for routines or procedures. Each page holds **multiple named sequences**. Steps can be:
- Reordered by drag-and-drop (before starting)
- Expanded to show a notes/context textarea
- Advanced one-by-one as Done ✓ or Skipped
- Reset to restart the sequence
- Started with ▶ Start sequence, showing live progress ("3 of 7 done")

---

### ⏱ Interval Timer

A structured productivity timer where each interval is a named **block** with a duration and phase type. Designed for workflows like Pomodoro, deep work, or custom routines.

**Edit mode:**
- Add, label, and reorder blocks via drag-and-drop (mouse-event based to avoid WebView2 issues)
- Set per-block duration with ±1m buttons, Alt+click for ±5s, or direct text entry (`MM:SS` or minutes)
- Assign a **phase type** (Work 🟣 · Break 🔵 · Transition 🟡 · Buffer ⚪) cycled with a click
- Choose a **completion sound** and **start sound** per block from built-in or custom tones
- Load a built-in template: 🍅 Pomodoro, 🌊 Flow, ⚡ Sprint, 🎯 Deep Work, 🌅 Morning Routine
- Save the current block set as a named **saved sequence** and reload it later

**Run mode:**
- Full-screen countdown with an animated SVG arc ring
- Phase-color arc (purple for work, blue for break, etc.)
- Sequence strip showing all blocks at a glance, colored and scaled by duration
- "Up next" preview of the next two blocks
- **Break gate**: after a break ends, a 10-second countdown prompts "Ready for the next block?" with a "1 more minute" escape hatch
- **Session complete** overlay with stats (blocks completed, total minutes) and a 15-minute rest countdown option
- Timer state is persisted to disk every 15 seconds, so progress survives app restarts

---

### 📅 Planner (Schedule · Caregiving · Goals)

A `planner` page type with three sub-modes:

#### Schedule
A **visual day planner** with a 6 am–2 am timeline grid.

- **Week mini-calendar** strip for quick day navigation; ← → week navigation
- **"Now" line** auto-scrolls into view on load and updates live every second
- **Quick-add bar**: type a block label (with optional natural-language time parsing — e.g. "9am standup" or "14:30 review") + duration, press Enter
- **Overlap layout**: simultaneous blocks are arranged into columns automatically
- **Block editor** (click to expand inline):
  - Editable start/end times and a clickable duration pill (`90m`, `2h`, etc.)
  - Freeform notes field
  - Sub-task checklist per block
  - 7-color accent picker (plum · rose · peach · orange · yellow · blue · ghost)
  - Reminder picker: fire at start or N minutes before, with sound selection
  - Duplicate block action
- **Energy rating**: 1–5 star rating for each day, persisted in `planner-meta.json`
- **All-day items**: lightweight checklist above the timeline for non-timed events
- **Integrated Schedule Panel**: a collapsible sidebar showing caregiving entries alongside timed blocks for the selected day

#### Caregiving
A structured **caregiving log** for tracking another person's daily care activities. Each entry has:
- Time range (start + end in HH:MM)
- Person name and free-text label
- Category: medication · walk · meal · hygiene · therapy · check-in · appointment
- Notes field
- Completed toggle
- **Recurring** flag with day-of-week selection (e.g. every Mon/Wed/Fri)

#### Goals
A simple **goals tracker** with short-term and long-term horizons. Each goal has a title, notes, completion toggle, and a pin-to-top flag.

---

### ◉ Habit Tracker

A fully-featured habit tracking system stored in a per-page store.

**Habit types:**
- **Binary** — did / didn't (dot grid, one tap per day)
- **Count** — how many times / how many glasses / etc. (heat-map grid with increment/decrement)
- **Duration** — time spent in hours (same grid, values in 0.5h steps)
- **Weekly** — binary but tracked per ISO week rather than per day

**Views:**
- **Grid view** — 5-week dot grid (daily habits) or 10-week dot strip (weekly habits), with streak and longest-streak counters
- **Day view** — navigate any date with ←/→; shows a completeness progress bar and grouped rows per type (time spent · did/didn't · how many); per-day free-text note
- **Linear view** — horizontal bar chart over Today / 7d / 30d / 90d windows; today shows a stacked colour bar and individual habit rows with log buttons
- **Today strip** — a compact pill strip at the top of the grid view showing all habits for today and overall progress (e.g. "3/6")

**Management:**
- Add custom habits: name, emoji, accent color, type, unit, frequency
- Archive (soft-delete) habits without losing history
- Starter suggestions panel for new pages (Water, Move, Meds, Outside, Journal, Sleep goal)

---

### ⏲ Time Tracker

A **daily time-blocking and actual-time tracker** with two modes:

**Gather mode (plan):**
- Free-form **brain dump** textarea
- One-click AI organisation: Claude parses the dump and returns a list of actionable tasks with time estimates
- Review the extracted tasks before committing

**Execute mode (work):**
- Task list with estimated vs. actual time bars
- Per-task **live stopwatch** (start/stop toggle); only one task can run at a time
- Per-task **estimate field** (accepts `30m`, `1h`, `1h30m`, `1:30`)
- **AI estimator**: describe a task, get a realistic estimate and short reasoning, accept with one click
- Circular SVG arc for the active task (cyan while on-track, amber when over)
- Overtime detection: task and totals bar both highlight when over estimate
- **"Done by" projection**: shows the predicted finish time based on remaining estimated time
- **Subtasks** per item, each with their own completion checkbox
- **Date navigation** (←/→ days) with a "carry forward" button to move unfinished tasks to today
- All data keyed by ISO date string, so history is preserved per day

---

## Cross-Cutting Features

### Reminders & Alarms
Any task in a List, Board, or Planner block can have a **repeating alarm** attached:
- Intervals from 5 m to 24 h, or custom minutes
- Sound choices: 🎵 Chime · 🔔 Bell · 📡 Blip · ✨ Soft Ding · 🔇 None · custom uploaded audio
- The Options button (⚙) pulses with a red badge when a timer is ringing
- Snooze or clear ringing timers directly from the Options modal
- Timer state is scanned every second and fires desktop notifications via Tauri

### Custom Sounds
Upload any audio file as a custom tone. Custom tones are stored as base-64 data URLs in `settings.json` and are available in every sound picker across the app.

### Accent Color
The primary accent color is a CSS custom property (`--accent-primary`) applied globally. Choose from preset swatches (Lavender, Cyan, Lime, Coral, Pink) or enter any hex value in the Settings tab. The color is also applied as a translucent border and glow variant automatically.

### Per-item Colors
Tasks, board columns, planner blocks, and habits all support an **accent color** from the app's palette (plum · rose · peach · orange · yellow · blue · ghost), each mapped to a specific hex value via `accentToHex`.

### Data Persistence
- All page data is stored via `@tauri-apps/plugin-store` in local JSON files
- Planner blocks are stored in `planner-{pageId}.json`
- Planner metadata (energy ratings, all-day items) in `planner-meta.json`
- Interval timer state (active block, seconds remaining) in `interval-{pageId}.json`
- Settings (volume, tones, accent color, reminder defaults, saved sequences) in `settings.json`
- Habit logs in `habits-{pageId}.json`
- App pages in the primary store

### Tab Management
- Tabs show a type icon and a keyboard shortcut hint (1–9)
- Drag to reorder tabs
- Double-click to rename inline; right-click for the full context menu
- `+` button adds a new notes page; `Ctrl+Shift+N` opens a type picker at the centre of the screen

---

## Options Modal

Opened via the ⚙ button (top-right). The modal is **draggable** and raises itself to always-on-top while open.

| Tab | Contents |
|-----|----------|
| **⏱ Timers** | All active task reminders across every page — shows task name, page, interval, sound, countdown. Edit interval/sound or clear inline. Snooze ringing timers. Also lists all Interval pages with their block sequences and per-block sound assignments. |
| **🔊 Sounds** | Volume slider with live test button. Preview each built-in sound. Upload custom audio files; delete them. |
| **✦ Settings** | Accent color swatches + hex input. Default reminder duration/sound presets. Default planner block duration. |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New notes page |
| `Ctrl+Shift+N` | New page — type picker |
| `Ctrl+1`–`Ctrl+9` | Switch to tab by index (9 = last tab) |
| `Esc` | Close open menus / modals |
| `?` | Toggle keyboard shortcut cheatsheet |
| `Enter` | New task / line (Notes & To-Do) |
| `Tab` | Cycle task type (bullet → checkbox → heading → plain) |
| `Backspace` | Merge with previous line when current line is empty |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Alt+T` | Set reminder on focused task |
| `Space` | Play / Pause (Interval run mode) |
| `→` | Skip to next block (Interval run mode) |
| `M` | Mute / Unmute (Interval run mode) |
| `Esc` | Stop and return to edit (Interval run mode) |
| `/` | Focus quick-add bar (Planner schedule view) |

---

## Development

```bash
# Install dependencies
npm install

# Start the Vite dev server + Tauri hot-reload
npm run tauri dev

# Build a production bundle
npm run tauri build
```

**Requirements:** Node 18+, Rust (stable), Tauri CLI v2.

The app targets Windows primarily (frameless transparent window), but the Tauri build targets are set to `"all"`.

---

*Version 0.1.7 · ISC License · [GitHub](https://github.com/PrettySailorSoldier/notesNeurosis)*
