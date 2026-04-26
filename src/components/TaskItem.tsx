import React, { useRef, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import type { Task, TaskType, ReminderSound, AccentColor } from '../types';
import { TimerModal } from './TimerModal';
import { ContextMenu } from './ContextMenu';
import styles from './TaskItem.module.css';

interface Props {
  task: Task;
  isNew?: boolean;
  onUpdate: (updated: Task) => void;
  onDelete: (id: string) => void;
  onAddAfter: (afterId: string, type: TaskType, indent: number, forceIndent?: boolean) => void;
  onMergePrev: (id: string) => void;
  onSetReminder: (taskId: string, intervalMinutes: number, sound: ReminderSound, alarmEnabled?: boolean) => void;
  onClearReminder: (taskId: string) => void;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
  autoFocus?: boolean;
  onFocusConsumed?: () => void;   // called after autoFocus focus fires, so parent can clear pendingFocusId
  placeholder?: string;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

// Strips unsafe/block HTML from clipboard content, keeping only inline formatting
function sanitizePasteHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;

  const INLINE = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'del', 'mark', 'br']);
  const BLOCKS = new Set(['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'td', 'blockquote']);

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const inner = Array.from(el.childNodes).map(walk).join('');
    if (INLINE.has(tag)) return `<${tag}>${inner}</${tag}>`;
    if (BLOCKS.has(tag)) return inner + (inner.trim() ? '<br>' : '');
    return inner; // strip unknown tags but keep their text
  }

  return walk(div).replace(/<br>$/, ''); // trim trailing <br>
}

export const TaskItem: React.FC<Props> = ({
  task,
  isNew,
  onUpdate,
  onDelete,
  onAddAfter,
  onMergePrev,
  onSetReminder,
  onClearReminder,
  onDragStart,
  onDragEnter,
  onDragEnd,
  autoFocus,
  onFocusConsumed,
  placeholder = 'Note…',
  selected = false,
  onSelect,
}) => {
  const contentRef = useRef<HTMLSpanElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAnchor, setModalAnchor] = useState<DOMRect | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [typeHint, setTypeHint] = useState(isNew ?? false);
  const composingRef = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);

  // Sync content → DOM without cursor jump
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    if (el.textContent !== task.content) {
      el.textContent = task.content;
    }
  }, [task.content]);

  useEffect(() => {
    if (autoFocus || isNew) {
      const el = contentRef.current;
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      // Scroll the new row into view inside the scrollable editor
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      // Notify parent that this focus request was consumed
      if (autoFocus) onFocusConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, isNew]);

  // Reminder countdown display
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

  function handlePaste(e: React.ClipboardEvent<HTMLSpanElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  function handleInput() {
    if (composingRef.current) return;
    const el = contentRef.current;
    if (!el) return;
    onUpdate({ ...task, content: el.textContent ?? '' });
  }

  function handleCompositionStart() { composingRef.current = true; }
  function handleCompositionEnd() {
    composingRef.current = false;
    handleInput();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLSpanElement>) {
    if (composingRef.current) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const el = contentRef.current;
      const isEmpty = !el || (el.textContent ?? '').trim() === '';
      if (isEmpty && (task.indent ?? 0) > 0) {
        // Empty subtask → jump back to main level by resetting indent and adding a fresh main task
        onUpdate({ ...task, indent: undefined });
      } else if (e.shiftKey && (task.indent ?? 0) > 0) {
        // Shift+Enter within a subtask → force-continue at same indent level
        onAddAfter(task.id, task.type, task.indent ?? 0, true);
      } else {
        // Default: handleAddAfter resolves to main level unless mid-chain sibling exists.
        onAddAfter(task.id, task.type, task.indent ?? 0);
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        onUpdate({ ...task, indent: Math.max(0, (task.indent ?? 0) - 1) });
      } else {
        onUpdate({ ...task, indent: Math.min(4, (task.indent ?? 0) + 1) });
      }
    }

    if (e.key === 'Backspace') {
      const el = contentRef.current;
      if (!el || el.textContent !== '') return;
      e.preventDefault();
      if ((task.indent ?? 0) > 0) {
        // Empty indented task → un-indent before merging
        onUpdate({ ...task, indent: (task.indent ?? 0) - 1 });
      } else {
        onMergePrev(task.id);
      }
    }

    if (e.key === 'Alt' && false) { /* Alt+T handled globally */ }
    if (e.altKey && e.key === 't') {
      e.preventDefault();
      openModal();
    }

    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      document.execCommand('bold');
    }
    if (e.ctrlKey && e.key === 'i') {
      e.preventDefault();
      document.execCommand('italic');
    }
  }

  function toggleComplete() {
    onUpdate({ ...task, completed: !task.completed });
  }

  function openModal() {
    const el = contentRef.current;
    const rect = el?.getBoundingClientRect() ?? new DOMRect(60, 200, 300, 24);
    setModalAnchor(rect);
    setShowModal(true);
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // Save current text selection so cut/copy/paste can restore it after menu click
    const sel = window.getSelection();
    savedRangeRef.current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const restoreSelection = () => {
    if (!savedRangeRef.current) return;
    contentRef.current?.focus();
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(savedRangeRef.current);
  };

  const TASK_TYPE_CYCLE: TaskType[] = ['plain', 'bullet', 'checkbox', 'heading'];
  const TYPE_ICONS: Record<TaskType, string> = {
    plain: 'T', bullet: '•', checkbox: '☐', heading: 'H',
  };

  function cycleType() {
    const cycle = TASK_TYPE_CYCLE;
    const next = cycle[(cycle.indexOf(task.type) + 1) % cycle.length];
    onUpdate({ ...task, type: next });
  }

  const prefix = task.type === 'bullet' ? '•' : null;

  const indentPx = (task.indent ?? 0) * 20;

  return (
    <div
      className={`${styles.taskItem} ${styles[`type_${task.type}`]} ${task.completed ? styles.completed : ''} ${hovered ? styles.hovered : ''} ${selected ? styles.selected : ''}`}
      data-indent={(task.indent ?? 0).toString()}
      style={indentPx > 0 ? { marginLeft: indentPx } : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={handleContextMenu}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragEnter(task.id);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      {/* Selection checkbox */}
      {onSelect && (
        <button
          className={`${styles.selectBox} ${(hovered || selected) ? styles.selectVisible : ''}`}
          onClick={() => onSelect(task.id)}
          aria-label={selected ? 'Deselect' : 'Select'}
          tabIndex={-1}
        >
          {selected && (
            <svg viewBox="0 0 10 10" fill="none">
              <polyline points="1.5,5 4,7.5 8.5,2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      )}

      {/* Drag handle */}
      <div
        className={`${styles.dragHandle} ${hovered ? styles.dragVisible : ''}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', task.id);
          onDragStart(task.id);
        }}
        onDragEnd={onDragEnd}
        title="Drag to reorder"
      >
        <svg viewBox="0 0 10 14" fill="currentColor">
          <circle cx="3" cy="3" r="1.5" />
          <circle cx="7" cy="3" r="1.5" />
          <circle cx="3" cy="7" r="1.5" />
          <circle cx="7" cy="7" r="1.5" />
          <circle cx="3" cy="11" r="1.5" />
          <circle cx="7" cy="11" r="1.5" />
        </svg>
      </div>

      {/* Type toggle gutter button */}
      <button
        className={`${styles.typeToggle} ${hovered ? styles.typeToggleVisible : ''} ${typeHint ? styles.typeHint : ''}`}
        onClick={cycleType}
        title="Click to change type (bullet → checkbox → heading → plain)"
        tabIndex={-1}
        onAnimationEnd={() => setTypeHint(false)}
      >
        {TYPE_ICONS[task.type]}
      </button>

      {/* Checkbox */}
      {task.type === 'checkbox' && (
        <button
          className={`${styles.checkbox} ${task.completed ? styles.checked : ''}`}
          onClick={toggleComplete}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
          tabIndex={-1}
        >
          {task.completed && (
            <svg viewBox="0 0 10 10" fill="none">
              <polyline points="1.5,5 4,7.5 8.5,2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      )}

      {/* Bullet prefix */}
      {prefix && <span className={styles.bullet}>{prefix}</span>}

      {/* Content */}
      <span
        ref={contentRef}
        contentEditable
        suppressContentEditableWarning
        className={`${styles.content} ${task.color && task.color !== 'ghost' ? 'text-color-' + task.color : ''}`}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        data-placeholder={task.type === 'heading' ? 'Heading…' : placeholder}
        spellCheck={false}
      />

      {/* Reminder badge */}
      {task.reminder?.active && countdown && (
        <button
          className={`${styles.reminderPill} ${task.reminder.alarmEnabled === false ? styles.reminderPillDisabled : ''}`}
          onClick={openModal}
          title={task.reminder.alarmEnabled === false ? 'Alarm paused — click to edit' : 'Edit reminder'}
        >
          {task.reminder.alarmEnabled === false ? '○' : '⏱'} {countdown}
        </button>
      )}

      {/* Bell icon — appears on hover */}
      <button
        className={`${styles.bellBtn} ${hovered || showModal ? styles.bellVisible : ''}`}
        onClick={openModal}
        title="Set reminder (Alt+T)"
        tabIndex={-1}
      >
        🔔
      </button>

      {/* Timer Modal — portalled to body to escape stacking context */}
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

      {/* Context Menu — rendered via portal to escape writing-zone stacking context */}
      {contextMenu && ReactDOM.createPortal(
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          colors={[
            { name: 'plum', hex: '#661A4E' },
            { name: 'rose', hex: '#B55F7C' },
            { name: 'peach', hex: '#FD8D79' },
            { name: 'orange', hex: '#FCA324' },
            { name: 'yellow', hex: '#FCCD38' },
            { name: 'blue', hex: '#5A8EFC' },
            { name: 'ghost', hex: 'rgba(180,140,220,0.2)' }
          ]}
          activeColor={task.color || 'ghost'}
          onColorSelect={(c) => onUpdate({ ...task, color: c as AccentColor })}
          options={[
            { label: 'Cut', icon: '✂', onClick: () => { restoreSelection(); document.execCommand('cut'); } },
            { label: 'Copy', icon: '⎘', onClick: () => { restoreSelection(); document.execCommand('copy'); } },
            { label: 'Paste', icon: '⎗', onClick: async () => {
                restoreSelection();
                try {
                  const items = await navigator.clipboard.read();
                  for (const item of items) {
                    if (item.types.includes('text/html')) {
                      const blob = await item.getType('text/html');
                      const html = sanitizePasteHtml(await blob.text());
                      document.execCommand('insertHTML', false, html);
                      return;
                    }
                  }
                } catch { /* clipboard.read() not available, fall through */ }
                const text = await navigator.clipboard.readText();
                document.execCommand('insertText', false, text);
              }
            },
            { divider: true, label: '', onClick: () => {} },
            { label: 'Add Reminder', icon: '⏱', onClick: openModal },
            { divider: true, label: '', onClick: () => {} },
            { label: 'Plain Text', icon: 'T', onClick: () => onUpdate({ ...task, type: 'plain' }) },
            { label: 'Checklist', icon: '☑', onClick: () => onUpdate({ ...task, type: 'checkbox' }) },
            { label: 'Bullet Point', icon: '•', onClick: () => onUpdate({ ...task, type: 'bullet' }) },
            { label: 'Heading', icon: 'H', onClick: () => onUpdate({ ...task, type: 'heading' }) },
            { divider: true, label: '', onClick: () => {} },
            { label: 'Delete Task', icon: '✕', danger: true, onClick: () => onDelete(task.id) },
          ]}
        />,
        document.body
      )}
    </div>
  );
};

