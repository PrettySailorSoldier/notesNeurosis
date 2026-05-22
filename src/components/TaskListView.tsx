import { useState, useRef, useEffect } from 'react';
import type { TaskListPage, TaskListItem, TaskListSubtask } from '../types';
import { BoardTabStrip } from './BoardTabStrip';
import styles from './TaskListView.module.css';

interface Props {
  pages: TaskListPage[];
  onPagesChange: (pages: TaskListPage[]) => void;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function computeItemMinutes(item: TaskListItem): number {
  if (item.subtasks.length > 0) {
    return item.subtasks.reduce((s, st) => s + (st.estimatedMinutes ?? 0), 0);
  }
  return item.estimatedMinutes ?? 0;
}

export function TaskListView({ pages, onPagesChange }: Props) {
  const [activeBoardId, setActiveBoardId] = useState(() => pages[0]?.id ?? '');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingSubTimeId, setEditingSubTimeId] = useState<string | null>(null);
  const [timeValue, setTimeValue] = useState('');

  const itemInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const subInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const pendingFocus = useRef<string | null>(null);

  // Ensure activeBoardId is valid after pages change (e.g. after delete)
  useEffect(() => {
    if (pages.length === 0) return;
    if (!pages.find(p => p.id === activeBoardId)) {
      setActiveBoardId(pages[0].id);
    }
  }, [pages, activeBoardId]);

  // Focus pending element after render
  useEffect(() => {
    if (!pendingFocus.current) return;
    const id = pendingFocus.current;
    const el = itemInputRefs.current.get(id) ?? subInputRefs.current.get(id);
    if (el) {
      el.focus();
      pendingFocus.current = null;
    }
  });

  const activeBoard = pages.find(p => p.id === activeBoardId) ?? pages[0];
  if (!activeBoard) return null;

  const items = activeBoard.items;

  const updateItems = (nextItems: TaskListItem[]) => {
    onPagesChange(pages.map(p => p.id === activeBoard.id ? { ...p, items: nextItems } : p));
  };

  const updateItem = (itemId: string, changes: Partial<TaskListItem>) => {
    updateItems(items.map(it => it.id === itemId ? { ...it, ...changes } : it));
  };

  const updateSubtask = (itemId: string, subId: string, changes: Partial<TaskListSubtask>) => {
    updateItems(items.map(it => {
      if (it.id !== itemId) return it;
      const subtasks = it.subtasks.map(st => st.id === subId ? { ...st, ...changes } : st);
      const allDone = subtasks.length > 0 && subtasks.every(st => st.completed);
      return { ...it, subtasks, completed: allDone ? true : it.completed };
    }));
  };

  const addItem = () => {
    const newItem: TaskListItem = {
      id: makeId(),
      content: '',
      completed: false,
      subtasks: [],
      createdAt: Date.now(),
    };
    pendingFocus.current = newItem.id;
    updateItems([...items, newItem]);
  };

  const addItemAfter = (afterId: string) => {
    const idx = items.findIndex(it => it.id === afterId);
    const newItem: TaskListItem = {
      id: makeId(),
      content: '',
      completed: false,
      subtasks: [],
      createdAt: Date.now(),
    };
    pendingFocus.current = newItem.id;
    const next = [...items];
    next.splice(idx + 1, 0, newItem);
    updateItems(next);
  };

  const deleteItem = (itemId: string) => {
    updateItems(items.filter(it => it.id !== itemId));
  };

  const addSubtask = (itemId: string, afterSubId?: string) => {
    const newSub: TaskListSubtask = {
      id: makeId(),
      content: '',
      completed: false,
      createdAt: Date.now(),
    };
    pendingFocus.current = newSub.id;
    setExpandedIds(prev => new Set([...prev, itemId]));
    updateItems(items.map(it => {
      if (it.id !== itemId) return it;
      const subtasks = [...it.subtasks];
      if (afterSubId) {
        const idx = subtasks.findIndex(st => st.id === afterSubId);
        subtasks.splice(idx + 1, 0, newSub);
      } else {
        subtasks.push(newSub);
      }
      return { ...it, subtasks };
    }));
  };

  const deleteSubtask = (itemId: string, subId: string) => {
    updateItems(items.map(it => {
      if (it.id !== itemId) return it;
      return { ...it, subtasks: it.subtasks.filter(st => st.id !== subId) };
    }));
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const saveItemTime = (itemId: string, raw: string) => {
    const mins = parseInt(raw.trim(), 10);
    updateItem(itemId, { estimatedMinutes: isNaN(mins) || mins <= 0 ? undefined : mins });
    setEditingTimeId(null);
    setTimeValue('');
  };

  const saveSubTime = (itemId: string, subId: string, raw: string) => {
    const mins = parseInt(raw.trim(), 10);
    updateSubtask(itemId, subId, { estimatedMinutes: isNaN(mins) || mins <= 0 ? undefined : mins });
    setEditingSubTimeId(null);
    setTimeValue('');
  };

  // ── Board tab management ──
  const handleAddBoard = () => {
    const newBoard: TaskListPage = {
      id: makeId(),
      name: `List ${pages.length + 1}`,
      items: [],
      createdAt: Date.now(),
    };
    onPagesChange([...pages, newBoard]);
    setActiveBoardId(newBoard.id);
  };

  const handleRenameBoard = (id: string, name: string) => {
    onPagesChange(pages.map(p => p.id === id ? { ...p, name } : p));
  };

  const handleDeleteBoard = (id: string) => {
    if (pages.length <= 1) return;
    const next = pages.filter(p => p.id !== id);
    onPagesChange(next);
    if (activeBoardId === id) setActiveBoardId(next[0].id);
  };

  return (
    <div className={styles.root}>
      <BoardTabStrip
        tabs={pages.map(p => ({ id: p.id, name: p.name }))}
        activeId={activeBoard.id}
        onSelect={setActiveBoardId}
        onRename={handleRenameBoard}
        onAdd={handleAddBoard}
        onDelete={handleDeleteBoard}
        addLabel="+ list"
      />

      <div className={styles.list}>
        {items.map(item => {
          const isExpanded = expandedIds.has(item.id);
          const totalMins = computeItemMinutes(item);

          return (
            <div key={item.id} className={styles.itemWrap}>
              {/* Top-level item row */}
              <div className={styles.itemRow}>
                <button
                  className={`${styles.checkBtn}${item.completed ? ` ${styles['checkBtn--done']}` : ''}`}
                  onClick={() => updateItem(item.id, { completed: !item.completed })}
                  title={item.completed ? 'Mark incomplete' : 'Mark complete'}
                >
                  {item.completed ? '✓' : ''}
                </button>

                <input
                  ref={el => {
                    if (el) itemInputRefs.current.set(item.id, el);
                    else itemInputRefs.current.delete(item.id);
                  }}
                  className={`${styles.itemName}${item.completed ? ` ${styles['itemName--done']}` : ''}`}
                  type="text"
                  placeholder="Task name…"
                  defaultValue={item.content}
                  onBlur={e => updateItem(item.id, { content: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                      addItemAfter(item.id);
                    }
                    if (e.key === 'Backspace') {
                      const val = (e.target as HTMLInputElement).value;
                      if (val === '' && item.subtasks.length === 0) {
                        e.preventDefault();
                        deleteItem(item.id);
                      }
                    }
                  }}
                />

                {/* Time badge */}
                {editingTimeId === item.id ? (
                  <input
                    className={styles.timeInput}
                    type="number"
                    min="1"
                    placeholder="min"
                    autoFocus
                    value={timeValue}
                    onChange={e => setTimeValue(e.target.value)}
                    onBlur={() => saveItemTime(item.id, timeValue)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); saveItemTime(item.id, timeValue); }
                      if (e.key === 'Escape') { setEditingTimeId(null); setTimeValue(''); }
                    }}
                  />
                ) : totalMins > 0 ? (
                  <span
                    className={styles.timeBadge}
                    onClick={() => {
                      if (item.subtasks.length === 0) {
                        setTimeValue(String(item.estimatedMinutes ?? ''));
                        setEditingTimeId(item.id);
                      }
                    }}
                    style={item.subtasks.length === 0 ? { cursor: 'pointer' } : undefined}
                    title={item.subtasks.length === 0 ? 'Click to edit' : 'Sum of subtasks'}
                  >
                    {fmtMinutes(totalMins)}
                  </span>
                ) : (
                  <button
                    className={styles.addTimeBtn}
                    onClick={() => {
                      setTimeValue('');
                      setEditingTimeId(item.id);
                    }}
                    title="Add time estimate"
                  >+ time</button>
                )}

                {/* Expand toggle — only when subtasks exist */}
                {item.subtasks.length > 0 && (
                  <button
                    className={styles.expandBtn}
                    onClick={() => toggleExpanded(item.id)}
                    title={isExpanded ? 'Collapse' : 'Expand subtasks'}
                  >
                    {isExpanded ? '▾' : '▶'}
                  </button>
                )}

                {/* Add subtask (hover) */}
                <button
                  className={styles.addSubBtn}
                  onClick={() => addSubtask(item.id)}
                  title="Add subtask"
                >+ sub</button>

                {/* Delete item (hover) */}
                <button
                  className={styles.deleteItemBtn}
                  onClick={() => deleteItem(item.id)}
                  title="Delete task"
                >×</button>
              </div>

              {/* Subtask list */}
              {isExpanded && item.subtasks.length > 0 && (
                <div className={styles.subtaskList}>
                  {item.subtasks.map(sub => (
                    <div key={sub.id} className={styles.subtaskRow}>
                      <button
                        className={`${styles.checkBtn}${sub.completed ? ` ${styles['checkBtn--done']}` : ''}`}
                        onClick={() => updateSubtask(item.id, sub.id, { completed: !sub.completed })}
                        title={sub.completed ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {sub.completed ? '✓' : ''}
                      </button>

                      <input
                        ref={el => {
                          if (el) subInputRefs.current.set(sub.id, el);
                          else subInputRefs.current.delete(sub.id);
                        }}
                        className={`${styles.subtaskName}${sub.completed ? ` ${styles['subtaskName--done']}` : ''}`}
                        type="text"
                        placeholder="Subtask…"
                        defaultValue={sub.content}
                        onBlur={e => updateSubtask(item.id, sub.id, { content: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                            addSubtask(item.id, sub.id);
                          }
                          if (e.key === 'Backspace') {
                            const val = (e.target as HTMLInputElement).value;
                            if (val === '') {
                              e.preventDefault();
                              deleteSubtask(item.id, sub.id);
                            }
                          }
                        }}
                      />

                      {/* Subtask time badge */}
                      {editingSubTimeId === sub.id ? (
                        <input
                          className={styles.timeInput}
                          type="number"
                          min="1"
                          placeholder="min"
                          autoFocus
                          value={timeValue}
                          onChange={e => setTimeValue(e.target.value)}
                          onBlur={() => saveSubTime(item.id, sub.id, timeValue)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); saveSubTime(item.id, sub.id, timeValue); }
                            if (e.key === 'Escape') { setEditingSubTimeId(null); setTimeValue(''); }
                          }}
                        />
                      ) : sub.estimatedMinutes ? (
                        <span
                          className={styles.timeBadge}
                          onClick={() => {
                            setTimeValue(String(sub.estimatedMinutes ?? ''));
                            setEditingSubTimeId(sub.id);
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to edit"
                        >
                          {fmtMinutes(sub.estimatedMinutes)}
                        </span>
                      ) : (
                        <button
                          className={styles.addTimeBtn}
                          onClick={() => {
                            setTimeValue('');
                            setEditingSubTimeId(sub.id);
                          }}
                          title="Add time estimate"
                        >+ time</button>
                      )}

                      <button
                        className={styles.deleteSubBtn}
                        onClick={() => deleteSubtask(item.id, sub.id)}
                        title="Delete subtask"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <button className={styles.addItemBtn} onClick={addItem}>
          + add task
        </button>
      </div>
    </div>
  );
}
