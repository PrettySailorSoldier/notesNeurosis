import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import type { TodoBoard, TodoList, Task, TaskType, AccentColor, ReminderSound } from '../types';
import { TimerModal } from './TimerModal';
import styles from './MultiTodoView.module.css';

interface Props {
  boards: TodoBoard[];
  onChange: (boards: TodoBoard[]) => void;
  onSetReminder: (taskId: string, intervalMinutes: number, sound: ReminderSound, alarmEnabled?: boolean) => void;
  onClearReminder: (taskId: string) => void;
}

const ACCENT_MAP: Record<AccentColor, string> = {
  plum:    '#661A4E',
  rose:    '#B55F7C',
  peach:   '#FD8D79',
  orange:  '#FCA324',
  yellow:  '#FCCD38',
  blue:    '#5A8EFC',
  ghost:   'rgba(180,140,220,0.3)',
  violet:  '#8B5CF6',
  indigo:  '#6366F1',
  amber:   '#F59E0B',
  teal:    '#14B8A6',
};

const ACCENT_CYCLE: AccentColor[] = ['plum', 'rose', 'peach', 'orange', 'yellow', 'blue', 'ghost'];

function makeId() { return crypto.randomUUID(); }

function makeTask(type: TaskType = 'checkbox'): Task {
  return { id: makeId(), content: '', type, completed: false, createdAt: Date.now() };
}

function makeTodoList(label = 'New List'): TodoList {
  return { id: makeId(), label, tasks: [makeTask()], collapsed: false, createdAt: Date.now() };
}

function makeBoard(name = 'Board'): TodoBoard {
  return {
    id: makeId(),
    name,
    lists: [
      { ...makeTodoList('To-Do'),       color: 'plum'  },
      { ...makeTodoList('In Progress'), color: 'blue'  },
      { ...makeTodoList('Done'),        color: 'ghost' },
    ],
    createdAt: Date.now(),
  };
}

// ─────────────────────────────────────────────
// MultiTodoView — top-level with board tabs
// ─────────────────────────────────────────────
export const MultiTodoView: React.FC<Props> = ({ boards, onChange, onSetReminder, onClearReminder }) => {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  const bootstrapped = useRef(false);
  const [activeBoardId, setActiveBoardId] = useState<string>('');
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);

  // Bootstrap: seed one default board when there are none
  useEffect(() => {
    if (boards.length === 0 && !bootstrapped.current) {
      bootstrapped.current = true;
      const first = makeBoard('Board 1');
      onChangeRef.current([first]);
      setActiveBoardId(first.id);
    }
  }, [boards.length]);

  // If activeBoardId is stale (e.g. after delete), snap to first board
  useEffect(() => {
    if (boards.length > 0 && !boards.find(b => b.id === activeBoardId)) {
      setActiveBoardId(boards[0].id);
    }
  }, [boards, activeBoardId]);

  // ── Derived active board (may be undefined while boards is empty) ──
  const activeBoard = boards.find(b => b.id === activeBoardId) ?? boards[0];

  // ══ ALL hooks must appear before any conditional return ══

  // Board-level
  const updateBoard = useCallback((id: string, patch: Partial<TodoBoard>) => {
    onChange(boards.map(b => b.id === id ? { ...b, ...patch } : b));
  }, [boards, onChange]);

  const addBoard = useCallback(() => {
    const num = boards.length + 1;
    const b = makeBoard(`Board ${num}`);
    onChange([...boards, b]);
    setActiveBoardId(b.id);
  }, [boards, onChange]);

  const deleteBoard = useCallback((id: string) => {
    if (boards.length <= 1) return;
    const remaining = boards.filter(b => b.id !== id);
    onChange(remaining);
    if (activeBoardId === id) setActiveBoardId(remaining[0].id);
  }, [boards, onChange, activeBoardId]);

  // List-level (within active board — guarded by activeBoard check)
  const updateList = useCallback((listId: string, patch: Partial<TodoList>) => {
    if (!activeBoard) return;
    updateBoard(activeBoard.id, {
      lists: activeBoard.lists.map(l => l.id === listId ? { ...l, ...patch } : l),
    });
  }, [activeBoard, updateBoard]);

  const deleteList = useCallback((listId: string) => {
    if (!activeBoard || activeBoard.lists.length <= 1) return;
    updateBoard(activeBoard.id, { lists: activeBoard.lists.filter(l => l.id !== listId) });
  }, [activeBoard, updateBoard]);

  const addList = useCallback(() => {
    if (!activeBoard) return;
    const colorIdx = activeBoard.lists.length % ACCENT_CYCLE.length;
    const newList = { ...makeTodoList(), color: ACCENT_CYCLE[colorIdx] };
    updateBoard(activeBoard.id, { lists: [...activeBoard.lists, newList] });
  }, [activeBoard, updateBoard]);

  const updateTask = useCallback((listId: string, updated: Task) => {
    if (!activeBoard) return;
    const list = activeBoard.lists.find(l => l.id === listId);
    if (!list) return;
    updateList(listId, { tasks: list.tasks.map(t => t.id === updated.id ? updated : t) });
  }, [activeBoard, updateList]);

  const addTask = useCallback((listId: string, afterId?: string) => {
    if (!activeBoard) return;
    const list = activeBoard.lists.find(l => l.id === listId);
    if (!list) return;
    const newTask = makeTask();
    setFocusTaskId(newTask.id);
    if (!afterId) {
      updateList(listId, { tasks: [...list.tasks, newTask] });
      return;
    }
    const idx = list.tasks.findIndex(t => t.id === afterId);
    const next = [...list.tasks];
    next.splice(idx + 1, 0, newTask);
    updateList(listId, { tasks: next });
  }, [activeBoard, updateList]);

  const deleteTask = useCallback((listId: string, taskId: string) => {
    if (!activeBoard) return;
    const list = activeBoard.lists.find(l => l.id === listId);
    if (!list) return;
    const next = list.tasks.filter(t => t.id !== taskId);
    updateList(listId, { tasks: next.length > 0 ? next : [makeTask()] });
  }, [activeBoard, updateList]);

  const cycleColor = useCallback((listId: string, current?: AccentColor) => {
    const idx = ACCENT_CYCLE.indexOf(current ?? 'ghost');
    const next = ACCENT_CYCLE[(idx + 1) % ACCENT_CYCLE.length];
    updateList(listId, { color: next });
  }, [updateList]);

  const moveTask = useCallback((fromListId: string, taskId: string, toListId: string) => {
    if (!activeBoard) return;
    const fromList = activeBoard.lists.find(l => l.id === fromListId);
    const toList   = activeBoard.lists.find(l => l.id === toListId);
    if (!fromList || !toList) return;
    const task = fromList.tasks.find(t => t.id === taskId);
    if (!task) return;
    const newFromTasks = fromList.tasks.filter(t => t.id !== taskId);
    const newToTasks   = [...toList.tasks, task];
    updateBoard(activeBoard.id, {
      lists: activeBoard.lists.map(l => {
        if (l.id === fromListId) return { ...l, tasks: newFromTasks.length > 0 ? newFromTasks : [makeTask()] };
        if (l.id === toListId)   return { ...l, tasks: newToTasks };
        return l;
      }),
    });
  }, [activeBoard, updateBoard]);

  // ── Early return ONLY after all hooks ──
  if (boards.length === 0 || !activeBoard) return null;

  return (
    <div className={styles.root}>
      {/* Board tab strip */}
      <div className={styles.boardTabs}>
        {boards.map(board => (
          <div
            key={board.id}
            className={`${styles.boardTab} ${board.id === activeBoard.id ? styles.boardTabActive : ''}`}
          >
            {editingBoardId === board.id ? (
              <input
                className={styles.boardTabInput}
                defaultValue={board.name}
                autoFocus
                onBlur={e => {
                  updateBoard(board.id, { name: e.target.value.trim() || board.name });
                  setEditingBoardId(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              <span
                className={styles.boardTabLabel}
                onClick={() => setActiveBoardId(board.id)}
                onDoubleClick={() => setEditingBoardId(board.id)}
                title="Click to switch · Double-click to rename"
              >
                {board.name}
              </span>
            )}
            {boards.length > 1 && (
              <button
                className={styles.boardTabClose}
                onClick={e => { e.stopPropagation(); deleteBoard(board.id); }}
                title="Delete board"
              >×</button>
            )}
          </div>
        ))}
        <button className={styles.addBoardBtn} onClick={addBoard} title="Add a new board">
          + board
        </button>
      </div>

      {/* Column area */}
      <div className={styles.board}>
        {activeBoard.lists.map((list, idx) => {
          const prevList = activeBoard.lists[idx - 1];
          const nextList = activeBoard.lists[idx + 1];
          return (
            <TodoColumn
              key={list.id}
              list={list}
              accentColor={list.color ? ACCENT_MAP[list.color] : ACCENT_MAP.plum}
              onUpdate={patch => updateList(list.id, patch)}
              onDelete={() => deleteList(list.id)}
              onAddTask={(afterId) => addTask(list.id, afterId)}
              onUpdateTask={task => updateTask(list.id, task)}
              onDeleteTask={taskId => deleteTask(list.id, taskId)}
              onCycleColor={() => cycleColor(list.id, list.color)}
              canDelete={activeBoard.lists.length > 1}
              focusTaskId={focusTaskId}
              onFocusConsumed={() => setFocusTaskId(null)}
              prevListLabel={prevList?.label}
              nextListLabel={nextList?.label}
              onMoveLeft={prevList  ? (taskId) => moveTask(list.id, taskId, prevList.id)  : undefined}
              onMoveRight={nextList ? (taskId) => moveTask(list.id, taskId, nextList.id) : undefined}
              onSetReminder={onSetReminder}
              onClearReminder={onClearReminder}
            />
          );
        })}

        <button className={styles.addListBtn} onClick={addList} title="Add a new list">
          <span className={styles.addListIcon}>+</span>
          <span className={styles.addListLabel}>Add List</span>
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// TodoColumn — one list panel
// ─────────────────────────────────────────────
interface ColumnProps {
  list: TodoList;
  accentColor: string;
  onUpdate: (patch: Partial<TodoList>) => void;
  onDelete: () => void;
  onAddTask: (afterId?: string) => void;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onCycleColor: () => void;
  canDelete: boolean;
  focusTaskId: string | null;
  onFocusConsumed: () => void;
  prevListLabel?: string;
  nextListLabel?: string;
  onMoveLeft?: (taskId: string) => void;
  onMoveRight?: (taskId: string) => void;
  onSetReminder: (taskId: string, intervalMinutes: number, sound: ReminderSound, alarmEnabled?: boolean) => void;
  onClearReminder: (taskId: string) => void;
}

const TodoColumn: React.FC<ColumnProps> = ({
  list, accentColor, onUpdate, onDelete,
  onAddTask, onUpdateTask, onDeleteTask,
  onCycleColor, canDelete, focusTaskId, onFocusConsumed,
  prevListLabel, nextListLabel, onMoveLeft, onMoveRight,
  onSetReminder, onClearReminder,
}) => {
  const [editingLabel, setEditingLabel] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  const completedCount = list.tasks.filter(t => t.completed).length;
  const totalCount = list.tasks.length;

  const startEditLabel = () => {
    setEditingLabel(true);
    setTimeout(() => labelRef.current?.select(), 0);
  };

  return (
    <div
      className={styles.column}
      style={{ '--col-accent': accentColor } as React.CSSProperties}
    >
      {/* Column Header */}
      <div className={styles.colHeader}>
        <button
          className={styles.accentDot}
          style={{ background: accentColor }}
          onClick={onCycleColor}
          title="Click to change color"
        />

        {editingLabel ? (
          <input
            ref={labelRef}
            className={styles.labelInput}
            defaultValue={list.label}
            onBlur={e => {
              onUpdate({ label: e.target.value.trim() || 'List' });
              setEditingLabel(false);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        ) : (
          <span className={styles.colLabel} onDoubleClick={startEditLabel} title="Double-click to rename">
            {list.label}
          </span>
        )}

        <span className={styles.colCount}>{completedCount}/{totalCount}</span>

        <div className={styles.colActions}>
          <button
            className={styles.colBtn}
            onClick={() => onUpdate({ collapsed: !list.collapsed })}
            title={list.collapsed ? 'Expand' : 'Collapse'}
          >
            {list.collapsed ? '▸' : '▾'}
          </button>
          {canDelete && (
            <button
              className={`${styles.colBtn} ${styles.colBtnDanger}`}
              onClick={onDelete}
              title="Delete list"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Task List */}
      {!list.collapsed && (
        <div className={styles.taskList}>
          {list.tasks.map(task => (
            <MiniTaskRow
              key={task.id}
              task={task}
              accentColor={accentColor}
              onChange={onUpdateTask}
              onDelete={() => onDeleteTask(task.id)}
              onAddBelow={() => onAddTask(task.id)}
              autoFocus={focusTaskId === task.id}
              onFocusConsumed={onFocusConsumed}
              onMoveLeft={onMoveLeft ? () => onMoveLeft(task.id) : undefined}
              onMoveRight={onMoveRight ? () => onMoveRight(task.id) : undefined}
              prevListLabel={prevListLabel}
              nextListLabel={nextListLabel}
              onSetReminder={onSetReminder}
              onClearReminder={onClearReminder}
            />
          ))}

          <button
            className={styles.addTaskBtn}
            onClick={() => onAddTask()}
          >
            + add item
          </button>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// MiniTaskRow — single task within a column
// ─────────────────────────────────────────────
interface RowProps {
  task: Task;
  accentColor: string;
  onChange: (task: Task) => void;
  onDelete: () => void;
  onAddBelow: () => void;
  autoFocus?: boolean;
  onFocusConsumed?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  prevListLabel?: string;
  nextListLabel?: string;
  onSetReminder: (taskId: string, intervalMinutes: number, sound: ReminderSound, alarmEnabled?: boolean) => void;
  onClearReminder: (taskId: string) => void;
}

const MiniTaskRow: React.FC<RowProps> = ({
  task, accentColor, onChange, onDelete, onAddBelow, autoFocus, onFocusConsumed,
  onMoveLeft, onMoveRight, prevListLabel, nextListLabel,
  onSetReminder, onClearReminder,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAnchor, setModalAnchor] = useState<DOMRect | null>(null);
  const [hovered, setHovered] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      onFocusConsumed?.();
    }
  }, [autoFocus, onFocusConsumed]);

  // Countdown for reminder badge
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    if (!task.reminder?.active) { setCountdown(''); return; }
    function update() {
      if (!task.reminder?.active) { setCountdown(''); return; }
      const ms = task.reminder.fireAt - Date.now();
      if (ms <= 0) { setCountdown('now'); return; }
      const totalMins = Math.ceil(ms / 60000);
      if (totalMins >= 60) {
        const h = Math.floor(totalMins / 60), m = totalMins % 60;
        setCountdown(`${h}h${m > 0 ? ` ${m}m` : ''}`);
      } else {
        setCountdown(`${totalMins}m`);
      }
    }
    update();
    const iv = setInterval(update, 15000);
    return () => clearInterval(iv);
  }, [task.reminder]);

  function openModal() {
    const el = rowRef.current;
    const rect = el?.getBoundingClientRect() ?? new DOMRect(60, 200, 300, 24);
    setModalAnchor(rect);
    setShowModal(true);
  }

  const isPaused = task.reminder?.active && task.reminder.alarmEnabled === false;

  return (
    <div
      ref={rowRef}
      className={`${styles.taskRow} ${task.completed ? styles.taskDone : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        className={styles.checkBtn}
        style={{ borderColor: accentColor, background: task.completed ? accentColor : undefined }}
        onClick={() => onChange({ ...task, completed: !task.completed })}
        title="Toggle complete"
      >
        {task.completed && <span className={styles.checkMark}>✓</span>}
      </button>

      <input
        ref={inputRef}
        className={styles.taskInput}
        value={task.content}
        placeholder="New item…"
        onChange={e => onChange({ ...task, content: e.target.value })}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onAddBelow(); }
          if (e.key === 'Backspace' && task.content === '') { e.preventDefault(); onDelete(); }
        }}
      />

      {/* Reminder badge shown when alarm active */}
      {task.reminder?.active && countdown && (
        <button
          className={`${styles.reminderBadge} ${isPaused ? styles.reminderBadgePaused : ''}`}
          onClick={openModal}
          title={isPaused ? 'Alarm paused — click to edit' : 'Edit reminder'}
        >
          {isPaused ? '○' : '⏱'} {countdown}
        </button>
      )}

      <div className={styles.rowActions}>
        {/* Bell button — shown on hover */}
        <button
          className={`${styles.bellBtn} ${(hovered || showModal) ? styles.bellVisible : ''}`}
          onClick={openModal}
          title="Set reminder (Alt+T)"
          tabIndex={-1}
        >
          🔔
        </button>

        {onMoveLeft && (
          <button
            className={styles.moveBtn}
            onClick={onMoveLeft}
            title={`Move to "${prevListLabel ?? 'previous'}"`}
          >◀</button>
        )}
        {onMoveRight && (
          <button
            className={styles.moveBtn}
            onClick={onMoveRight}
            title={`Move to "${nextListLabel ?? 'next'}"`}
          >▶</button>
        )}
        <button className={styles.deleteBtn} onClick={onDelete} title="Delete item">×</button>
      </div>

      {/* Timer Modal — portalled to body */}
      {showModal && modalAnchor && ReactDOM.createPortal(
        <TimerModal
          taskId={task.id}
          taskContent={task.content}
          existing={task.reminder?.active ? task.reminder : undefined}
          anchorRect={modalAnchor}
          onSet={(mins, sound, alarmEnabled) => {
            onSetReminder(task.id, mins, sound, alarmEnabled);
            setShowModal(false);
          }}
          onClear={() => {
            onClearReminder(task.id);
            setShowModal(false);
          }}
          onClose={() => setShowModal(false)}
        />,
        document.body
      )}
    </div>
  );
};
