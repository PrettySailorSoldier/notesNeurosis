import React, { useRef, useEffect, useState } from 'react';
import type { Task, TaskType, ReminderSound } from '../types';
import { TimerModal } from './TimerModal';
import styles from './TaskItem.module.css';

interface Props {
  task: Task;
  isNew?: boolean;
  onUpdate: (updated: Task) => void;
  onDelete: (id: string) => void;
  onAddAfter: (afterId: string, type: TaskType) => void;
  onMergePrev: (id: string) => void;
  onSetReminder: (taskId: string, intervalMinutes: number, sound: ReminderSound) => void;
  onClearReminder: (taskId: string) => void;
  autoFocus?: boolean;
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
  autoFocus,
}) => {
  const contentRef = useRef<HTMLSpanElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAnchor, setModalAnchor] = useState<DOMRect | null>(null);
  const [hovered, setHovered] = useState(false);
  const composingRef = useRef(false);

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
    }
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
      onAddAfter(task.id, task.type);
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const cycle: TaskType[] = ['plain', 'bullet', 'checkbox', 'heading'];
      const next = cycle[(cycle.indexOf(task.type) + 1) % cycle.length];
      onUpdate({ ...task, type: next });
    }

    if (e.key === 'Backspace') {
      const el = contentRef.current;
      if (!el || el.textContent !== '') return;
      e.preventDefault();
      onMergePrev(task.id);
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

  const prefix = task.type === 'bullet' ? '•' : null;

  return (
    <div
      className={`${styles.taskItem} ${styles[task.type]} ${task.completed ? styles.completed : ''} ${hovered ? styles.hovered : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
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
        className={styles.content}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        data-placeholder={task.type === 'heading' ? 'Heading…' : 'Note…'}
        spellCheck={false}
      />

      {/* Reminder badge */}
      {task.reminder?.active && countdown && (
        <button
          className={styles.reminderPill}
          onClick={openModal}
          title="Edit reminder"
        >
          ⏱ {countdown}
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

      {/* Timer Modal */}
      {showModal && modalAnchor && (
        <TimerModal
          taskId={task.id}
          taskContent={task.content}
          existing={task.reminder?.active ? task.reminder : undefined}
          anchorRect={modalAnchor}
          onSet={(mins, sound) => {
            onSetReminder(task.id, mins, sound);
            setShowModal(false);
          }}
          onClear={() => {
            onClearReminder(task.id);
            setShowModal(false);
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};
