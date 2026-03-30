import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TodoList, Task, TaskType, AccentColor } from '../types';
import styles from './MultiTodoView.module.css';

interface Props {
  lists: TodoList[];
  onChange: (lists: TodoList[]) => void;
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

function makeId() {
  return crypto.randomUUID();
}

function makeTask(type: TaskType = 'checkbox'): Task {
  return { id: makeId(), content: '', type, completed: false, createdAt: Date.now() };
}

function makeTodoList(label = 'New List'): TodoList {
  return {
    id: makeId(),
    label,
    tasks: [makeTask()],
    collapsed: false,
    createdAt: Date.now(),
  };
}

export const MultiTodoView: React.FC<Props> = ({ lists, onChange }) => {
  // Stable ref to onChange so the bootstrap effect never goes stale
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  const bootstrapped = useRef(false);

  // Track which task should be auto-focused after the next render
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);

  // Bootstrap: seed three default columns when the page has no lists yet.
  // Must be a useEffect — hooks cannot appear after a conditional return.
  useEffect(() => {
    if (lists.length === 0 && !bootstrapped.current) {
      bootstrapped.current = true;
      onChangeRef.current([
        { ...makeTodoList('To-Do'),       color: 'plum'  },
        { ...makeTodoList('In Progress'), color: 'blue'  },
        { ...makeTodoList('Done'),        color: 'ghost' },
      ]);
    }
  }, [lists.length]);

  const updateList = useCallback((id: string, patch: Partial<TodoList>) => {
    onChange(lists.map(l => l.id === id ? { ...l, ...patch } : l));
  }, [lists, onChange]);

  const deleteList = useCallback((id: string) => {
    if (lists.length <= 1) return;
    onChange(lists.filter(l => l.id !== id));
  }, [lists, onChange]);

  const addList = useCallback(() => {
    const colorIdx = lists.length % ACCENT_CYCLE.length;
    onChange([...lists, { ...makeTodoList(), color: ACCENT_CYCLE[colorIdx] }]);
  }, [lists, onChange]);

  const updateTask = useCallback((listId: string, updated: Task) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    updateList(listId, { tasks: list.tasks.map(t => t.id === updated.id ? updated : t) });
  }, [lists, updateList]);

  const addTask = useCallback((listId: string, afterId?: string) => {
    const list = lists.find(l => l.id === listId);
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
  }, [lists, updateList]);

  const deleteTask = useCallback((listId: string, taskId: string) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    const next = list.tasks.filter(t => t.id !== taskId);
    updateList(listId, { tasks: next.length > 0 ? next : [makeTask()] });
  }, [lists, updateList]);

  const cycleColor = useCallback((listId: string, current?: AccentColor) => {
    const idx = ACCENT_CYCLE.indexOf(current ?? 'ghost');
    const next = ACCENT_CYCLE[(idx + 1) % ACCENT_CYCLE.length];
    updateList(listId, { color: next });
  }, [updateList]);

  // Render nothing while the bootstrap effect hasn't fired yet
  if (lists.length === 0) return null;

  return (
    <div className={styles.board}>
      {lists.map(list => (
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
          canDelete={lists.length > 1}
          focusTaskId={focusTaskId}
          onFocusConsumed={() => setFocusTaskId(null)}
        />
      ))}

      <button className={styles.addListBtn} onClick={addList} title="Add a new list">
        <span className={styles.addListIcon}>+</span>
        <span className={styles.addListLabel}>Add List</span>
      </button>
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
}

const TodoColumn: React.FC<ColumnProps> = ({
  list, accentColor, onUpdate, onDelete,
  onAddTask, onUpdateTask, onDeleteTask,
  onCycleColor, canDelete, focusTaskId, onFocusConsumed,
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
}

const MiniTaskRow: React.FC<RowProps> = ({ task, accentColor, onChange, onDelete, onAddBelow, autoFocus, onFocusConsumed }) => {
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      onFocusConsumed?.();
    }
  }, [autoFocus, onFocusConsumed]);

  return (
    <div
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

      {hovered && (
        <button className={styles.deleteBtn} onClick={onDelete} title="Delete item">×</button>
      )}
    </div>
  );
};
