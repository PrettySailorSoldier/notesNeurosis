
```
TASK: Add a "Planner" tab to NoteNeurosis — a day scheduler with time blocking, fully editable, stacked layout, integrated into the existing page tabs system.

═══════════════════════════════════════════════════════════
CONTEXT: NoteNeurosis App Architecture
═══════════════════════════════════════════════════════════

NoteNeurosis is a Tauri v2 + React + TypeScript desktop app.

EXISTING STRUCTURE:
- src/App.tsx — root component
- src/components/TaskEditor.tsx — main writing zone rendered per page
- src/components/ClockDisplay.tsx — clock in top circular ornament
- src/components/OptionsModal.tsx — settings/reminders overlay
- src/hooks/usePages.ts — manages pages array, currentPageId, addPage/renamePage/deletePage/switchPage/updateTasksForPage; persists via @tauri-apps/plugin-store
- src/hooks/useReminders.ts — per-task reminders
- src/hooks/useSettings.ts — volume, custom tones, etc.
- src/types.ts — Task, Reminder, ReminderSound interfaces
- src/App.css — all CSS; NO Tailwind; uses CSS custom properties
- src/assets/orchid.png — transparent window frame image

TECH STACK:
- React 19, TypeScript, Vite
- Tauri v2
- @tauri-apps/plugin-store (persistence)
- @tauri-apps/plugin-notification
- NO Tailwind, NO CSS modules — inline styles OR rules in App.css using CSS variables
- CSS vars in use: --text-primary, --text-secondary, --bg-elevated, --border, --accent (violet/indigo), --font-primary

TAB SYSTEM (how it works now):
- `pages` array from usePages, each page has: { id, name, tasks[] }
- Tabs render in `.page-tabs` div positioned absolutely above `.writing-zone`
- Active tab renders its page's TaskEditor inside `.writing-zone`
- Tab buttons: click = switchPage, double-click = rename prompt, right-click = delete confirm
- "+" button calls addPage()

CURRENT TAB BUTTON STYLES (from App.css):
```css
.tab-btn {
  flex-shrink: 0;
  padding: 4px 14px;
  border-radius: 8px 8px 0 0;
  border: 1px solid rgba(180, 130, 220, 0.4);
  border-bottom: none;
  background: rgba(40, 20, 60, 0.85);
  color: rgba(240, 230, 255, 0.9);
  font-family: 'Cormorant Garamond', serif;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.tab-btn.active {
  background: rgba(70, 30, 100, 0.95);
  color: #fff;
  border-color: rgba(210, 160, 255, 0.8);
  box-shadow: 0 -2px 8px rgba(180, 130, 220, 0.3);
}
```

WRITING ZONE (from App.css, abbreviated):
```css
.writing-zone {
  position: absolute;
  top: var(--zone-top);
  left: var(--zone-left);
  width: var(--zone-width);
  height: var(--zone-height);
  overflow-y: auto;
  overflow-x: hidden;
  background: transparent;
  padding: 10px 14px;
}
```

═══════════════════════════════════════════════════════════
TASK: BUILD THE PLANNER TAB
═══════════════════════════════════════════════════════════

Add a special built-in "Planner" tab that is always present and cannot be renamed or deleted. It lives alongside the user's note pages but renders a day scheduler instead of a TaskEditor.

---

PART 1 — DATA MODEL

Add a new store key `planner-data` separate from the pages store.

PlannerBlock interface (add to src/types.ts):
```typescript
export interface PlannerBlock {
  id: string;
  date: string;            // ISO date string e.g. "2026-03-07" — which day this block belongs to
  startTime: string;       // "HH:MM" 24-hour format
  endTime: string;         // "HH:MM" 24-hour format
  label: string;           // The block's title/name — editable inline
  notes: string;           // Optional freetext notes — editable inline
  color: PlannerBlockColor;
  completed: boolean;
}

export type PlannerBlockColor = 
  | 'violet'    // #a78bfa
  | 'indigo'    // #818cf8
  | 'rose'      // #fb7185
  | 'amber'     // #fbbf24
  | 'teal'      // #2dd4bf
  | 'ghost';    // rgba(255,255,255,0.07) — "invisible" / uncolored
```

---

PART 2 — PERSISTENCE HOOK

Create src/hooks/usePlanner.ts

```typescript
// Manages planner blocks, persisted via @tauri-apps/plugin-store
// Store key: 'planner-data'
// Stored value: PlannerBlock[]

export function usePlanner() {
  // Returns:
  // blocks: PlannerBlock[]
  // ready: boolean
  // addBlock(date: string, startTime: string): void  — adds a new empty block at given time
  // updateBlock(id: string, changes: Partial<PlannerBlock>): void
  // deleteBlock(id: string): void
  // getBlocksForDate(date: string): PlannerBlock[]  — returns sorted by startTime ascending
}
```

Implementation notes:
- On mount, load from store. Set ready=true after load.
- After every mutation, save the full blocks array to store.
- getBlocksForDate filters by date and sorts by startTime.
- addBlock creates a block with: id = makeId(), date, startTime, endTime = startTime + 1hr, label = '', notes = '', color = 'ghost', completed = false.

makeId function (copy from App.tsx):
```typescript
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
```

---

PART 3 — PLANNER COMPONENT

Create src/components/PlannerView.tsx

LAYOUT CONCEPT:
The planner fills the `.writing-zone` area. It shows one day at a time (default: today). Navigation: ← prev day / today button / → next day. The time blocks stack vertically in chronological order. Empty hours between blocks are implied (not rendered as rows) — this is NOT a traditional 24-row grid. It's a clean list of blocks with their times shown.

VISUAL DESIGN (must match NoteNeurosis aesthetic):
- Background: transparent (inherits from writing zone)
- Fonts: 'Cormorant Garamond' for labels, 'Inter' or system-sans for times/meta
- Colors: use the PlannerBlockColor values above as left-border accent and subtle bg tint
- Blocks: each block is a card with a colored left border (3-4px), very subtle semi-transparent background, rounded corners (8px)
- Time display: small, secondary color, top-left of card — format "9:00 – 10:30"
- Label: larger, primary color, editable inline (contentEditable or input that looks like text)
- Notes: small, secondary, below label, editable inline, only shows if non-empty OR in edit mode
- Completed: clicking a ✓ button on the right toggles completed state; completed blocks get 50% opacity + strikethrough on label
- Color picker: a row of 6 small colored dots on hover/focus of a block — clicking sets the block's color
- Delete: a small × button appears on hover, top-right of block

DAY NAVIGATION BAR (above blocks, inside the component):
```
← [Wed, Mar 5] [Today] [Fri, Mar 7] →
```
- Styled to match tab aesthetic — small, subtle
- "Today" button always jumps to current date; highlights if currently on today
- Current date shown in center, formatted as "Day, Mon D" (e.g. "Sat, Mar 7")

ADD BLOCK BUTTON:
- A subtle "+ add block" button at the bottom of the block list
- Clicking opens a small inline form OR directly appends a new empty block at a sensible default time (last block's end time, or 09:00 if no blocks)
- After adding, the new block's label field is auto-focused

TIME EDITING:
- Start/end times are editable via <input type="time"> that appears on focus/click
- On blur, validate: endTime must be after startTime; if not, auto-correct endTime to startTime + 30min
- Display the time inputs inline, small, styled to match (no browser default styling)

FULL COMPONENT INTERFACE:
```typescript
interface PlannerViewProps {
  // no props needed — uses usePlanner() internally
}
```

CSS additions to add to App.css (do NOT use Tailwind):

```css
/* ── Planner ── */
.planner-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 0;
}

.planner-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 2px 10px;
  flex-shrink: 0;
}

.planner-nav-btn {
  background: none;
  border: none;
  color: rgba(200, 170, 255, 0.7);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.12s;
}
.planner-nav-btn:hover {
  background: rgba(180, 130, 220, 0.15);
  color: rgba(220, 200, 255, 1);
}

.planner-nav-date {
  font-family: 'Cormorant Garamond', serif;
  font-size: 15px;
  color: rgba(230, 210, 255, 0.9);
  letter-spacing: 0.02em;
}

.planner-today-btn {
  background: rgba(140, 100, 210, 0.2);
  border: 1px solid rgba(180, 130, 220, 0.3);
  border-radius: 6px;
  color: rgba(200, 170, 255, 0.8);
  font-family: 'Cormorant Garamond', serif;
  font-size: 13px;
  cursor: pointer;
  padding: 2px 10px;
  transition: all 0.12s;
}
.planner-today-btn:hover, .planner-today-btn.is-today {
  background: rgba(140, 100, 210, 0.4);
  border-color: rgba(200, 160, 255, 0.6);
  color: #fff;
}

.planner-blocks {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 12px;
  scrollbar-width: thin;
  scrollbar-color: rgba(180, 140, 220, 0.25) transparent;
}

.planner-block {
  position: relative;
  border-radius: 8px;
  padding: 8px 10px 8px 14px;
  border-left: 3px solid transparent;
  background: rgba(255, 255, 255, 0.04);
  transition: background 0.15s, opacity 0.15s;
  cursor: default;
}
.planner-block:hover {
  background: rgba(255, 255, 255, 0.07);
}
.planner-block.completed {
  opacity: 0.5;
}

/* Color variants — left border + subtle bg */
.planner-block.color-violet  { border-left-color: #a78bfa; background: rgba(167,139,250,0.08); }
.planner-block.color-indigo  { border-left-color: #818cf8; background: rgba(129,140,248,0.08); }
.planner-block.color-rose    { border-left-color: #fb7185; background: rgba(251,113,133,0.08); }
.planner-block.color-amber   { border-left-color: #fbbf24; background: rgba(251,191,36,0.08); }
.planner-block.color-teal    { border-left-color: #2dd4bf; background: rgba(45,212,191,0.08); }
.planner-block.color-ghost   { border-left-color: rgba(180,140,220,0.2); background: rgba(255,255,255,0.03); }

.planner-block-time {
  font-size: 11px;
  color: rgba(180, 150, 220, 0.7);
  margin-bottom: 3px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.planner-time-input {
  background: none;
  border: none;
  border-bottom: 1px solid rgba(180, 140, 220, 0.3);
  color: rgba(180, 150, 220, 0.9);
  font-size: 11px;
  width: 52px;
  padding: 0 2px;
  outline: none;
  font-family: inherit;
}
.planner-time-input:focus {
  border-bottom-color: rgba(200, 160, 255, 0.7);
}

.planner-block-label {
  font-family: 'Cormorant Garamond', serif;
  font-size: 16px;
  color: rgba(240, 230, 255, 0.95);
  background: none;
  border: none;
  width: 100%;
  padding: 0;
  outline: none;
  font-weight: 500;
}
.planner-block-label::placeholder {
  color: rgba(180, 150, 220, 0.35);
}
.completed .planner-block-label {
  text-decoration: line-through;
}

.planner-block-notes {
  font-size: 12px;
  color: rgba(180, 160, 220, 0.65);
  background: none;
  border: none;
  width: 100%;
  padding: 2px 0 0;
  outline: none;
  resize: none;
  font-family: inherit;
  min-height: 0;
}
.planner-block-notes::placeholder {
  color: rgba(160, 130, 200, 0.25);
}

.planner-block-actions {
  position: absolute;
  top: 6px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.12s;
}
.planner-block:hover .planner-block-actions { opacity: 1; }

.planner-action-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 4px;
  color: rgba(180, 150, 220, 0.6);
  transition: all 0.1s;
  line-height: 1;
}
.planner-action-btn:hover { color: rgba(220, 200, 255, 1); background: rgba(180, 130, 220, 0.15); }
.planner-action-btn.done { color: rgba(100, 220, 150, 0.6); }
.planner-action-btn.done:hover { color: rgba(100, 240, 160, 1); }
.planner-action-btn.delete:hover { color: rgba(240, 100, 120, 1); background: rgba(200, 60, 80, 0.15); }

.planner-color-picker {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  opacity: 0;
  height: 0;
  overflow: hidden;
  transition: opacity 0.15s, height 0.15s;
}
.planner-block:focus-within .planner-color-picker,
.planner-block:hover .planner-color-picker {
  opacity: 1;
  height: 14px;
}

.planner-color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  cursor: pointer;
  border: 1px solid rgba(0,0,0,0.2);
  transition: transform 0.1s;
}
.planner-color-dot:hover { transform: scale(1.3); }
.planner-color-dot.active { outline: 2px solid rgba(255,255,255,0.5); outline-offset: 1px; }

.planner-add-btn {
  background: none;
  border: 1px dashed rgba(180, 130, 220, 0.25);
  border-radius: 8px;
  color: rgba(180, 150, 220, 0.5);
  font-family: 'Cormorant Garamond', serif;
  font-size: 14px;
  padding: 8px;
  cursor: pointer;
  width: 100%;
  text-align: center;
  transition: all 0.15s;
  flex-shrink: 0;
}
.planner-add-btn:hover {
  border-color: rgba(180, 130, 220, 0.55);
  color: rgba(210, 185, 255, 0.85);
  background: rgba(180, 130, 220, 0.06);
}

.planner-empty {
  text-align: center;
  color: rgba(180, 150, 220, 0.3);
  font-family: 'Cormorant Garamond', serif;
  font-size: 15px;
  padding: 32px 0;
}
```

---

PART 4 — WIRE INTO App.tsx

The Planner tab is a special built-in tab that always appears FIRST in the tab row, before the user's note pages. It is distinguished visually with a small calendar emoji prefix: "📅 Planner".

Changes to App.tsx:

1. Import PlannerView:
```typescript
import { PlannerView } from './components/PlannerView';
```

2. Add state to track if planner tab is active:
```typescript
const [showPlanner, setShowPlanner] = useState(false);
```

3. The rendering logic for tabs should be:
```tsx
<div className="page-tabs">
  {/* Built-in Planner tab — always first, not deletable/renameable */}
  <button
    className={`tab-btn ${showPlanner ? 'active' : ''}`}
    onClick={() => setShowPlanner(true)}
  >
    📅 Planner
  </button>

  {/* User's note pages */}
  {pages.map(page => (
    <button
      key={page.id}
      className={`tab-btn ${!showPlanner && page.id === currentPageId ? 'active' : ''}`}
      onClick={() => { setShowPlanner(false); switchPage(page.id); }}
      onDoubleClick={() => { /* existing rename logic */ }}
      onContextMenu={(e) => { /* existing delete logic */ }}
    >
      {page.name}
    </button>
  ))}
  <button className="tab-btn tab-btn-add" onClick={() => { setShowPlanner(false); addPage(); }}>+</button>
</div>
```

4. The writing zone conditional:
```tsx
<div className="writing-zone">
  {ready && showPlanner && <PlannerView />}
  {ready && !showPlanner && currentPage && (
    <TaskEditor
      tasks={currentPage.tasks}
      onChange={handleTasksChange}
      onSetReminder={handleSetReminder}
      onClearReminder={handleClearReminder}
    />
  )}
  {!ready && <div className="loading-hint">✦</div>}
</div>
```

---

PART 5 — ACCEPTANCE CRITERIA

- [ ] "📅 Planner" tab appears first, always visible
- [ ] Clicking Planner tab switches writing zone to PlannerView; existing note tabs are unaffected
- [ ] Switching back to any note page works normally
- [ ] Planner shows today's date by default on open
- [ ] ← → navigation changes the displayed date by ±1 day
- [ ] "Today" button returns to current date; has highlighted style when on today
- [ ] "+ add block" creates a new empty block and focuses its label field
- [ ] Label is editable inline (no modal needed)
- [ ] Notes field is editable inline, appears below label
- [ ] Start/end time inputs are editable, validated on blur (end > start)
- [ ] Colored left border reflects block color
- [ ] Color picker dots appear on hover/focus; clicking one updates block color
- [ ] ✓ button toggles completed (opacity + strikethrough)
- [ ] × button deletes block (no confirmation needed — it's a planner, not precious data)
- [ ] All planner data persists across app restarts via plugin-store key 'planner-data'
- [ ] Planner blocks from different dates are stored and retrieved correctly
- [ ] Visual style matches existing NoteNeurosis aesthetic (transparent bg, violet palette, Cormorant Garamond)

---

CONSTRAINTS:
- Do NOT change any existing TaskEditor, usePages, useReminders, or OptionsModal logic
- Do NOT add any new npm dependencies
- All styles go in App.css or as inline style objects — no new CSS files
- TypeScript — all new code must be typed
- usePlanner hook handles ALL data logic; PlannerView is purely presentational + local UI state
- Auto-save after every mutation (no save button)
```

---

