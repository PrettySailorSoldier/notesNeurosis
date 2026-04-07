import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './NoteEditor.module.css';
import { BoardTabStrip } from './BoardTabStrip';
import type { NoteBoard } from '../types';

interface Props {
  boards: NoteBoard[];
  onBoardsChange: (boards: NoteBoard[]) => void;
  legacyContent?: string;   // one-time migration: if boards is empty, use this
  placeholder?: string;
}

function wordCount(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

function formatStamp(): string {
  const now = new Date();
  return now.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const NoteEditor: React.FC<Props> = ({
  boards,
  onBoardsChange,
  legacyContent,
  placeholder = 'Begin writing…',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeBoardId, setActiveBoardId] = useState<string>('');
  const [words, setWords] = useState(0);
  const [copied, setCopied] = useState(false);
  const initializedRef = useRef(false);

  // One-time migration from single noteContent to noteBoards
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (boards.length === 0) {
      const seeded: NoteBoard[] = [{
        id: crypto.randomUUID(),
        name: 'Note 1',
        content: legacyContent ?? '',
        createdAt: Date.now(),
      }];
      onBoardsChange(seeded);
      setActiveBoardId(seeded[0].id);
    } else {
      setActiveBoardId(boards[0].id);
    }
  }, []);

  // Snap active board if it becomes stale
  useEffect(() => {
    if (boards.length > 0 && !boards.find(b => b.id === activeBoardId)) {
      setActiveBoardId(boards[0].id);
    }
  }, [boards, activeBoardId]);

  const activeBoard = boards.find(b => b.id === activeBoardId) ?? boards[0];
  const content = activeBoard?.content ?? '';

  // Keep word count in sync
  useEffect(() => {
    setWords(wordCount(content));
  }, [content]);

  // Board CRUD helpers
  const addBoard = () => {
    const n = boards.length + 1;
    const b: NoteBoard = { id: crypto.randomUUID(), name: `Note ${n}`, content: '', createdAt: Date.now() };
    onBoardsChange([...boards, b]);
    setActiveBoardId(b.id);
  };

  const deleteBoard = (id: string) => {
    if (boards.length <= 1) return;
    const remaining = boards.filter(b => b.id !== id);
    onBoardsChange(remaining);
    if (activeBoardId === id) setActiveBoardId(remaining[0].id);
  };

  const renameBoard = (id: string, name: string) => {
    onBoardsChange(boards.map(b => b.id === id ? { ...b, name } : b));
  };

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!activeBoard) return;
      onBoardsChange(boards.map(b => b.id === activeBoard.id ? { ...b, content: e.target.value } : b));
    },
    [activeBoard, boards, onBoardsChange]
  );

  // ── Keyboard shortcuts inside the textarea ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = textareaRef.current;
      if (!ta || !activeBoard) return;

      // Tab → insert 2 spaces (don't lose focus)
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const { selectionStart: s, selectionEnd: end } = ta;
        const next = content.slice(0, s) + '  ' + content.slice(end);
        onBoardsChange(boards.map(b => b.id === activeBoard.id ? { ...b, content: next } : b));
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = s + 2;
        });
      }

      // Ctrl+D → duplicate current line
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        const { selectionStart: s } = ta;
        const lineStart = content.lastIndexOf('\n', s - 1) + 1;
        const lineEnd = content.indexOf('\n', s);
        const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
        const insert = '\n' + line;
        const pos = lineEnd === -1 ? content.length : lineEnd;
        const next = content.slice(0, pos) + insert + content.slice(pos);
        onBoardsChange(boards.map(b => b.id === activeBoard.id ? { ...b, content: next } : b));
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = pos + insert.length;
        });
      }
    },
    [content, activeBoard, boards, onBoardsChange]
  );

  // Insert timestamp at cursor
  const insertStamp = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || !activeBoard) return;
    const s = ta.selectionStart;
    const stamp = `\n— ${formatStamp()} —\n`;
    const next = content.slice(0, s) + stamp + content.slice(s);
    onBoardsChange(boards.map(b => b.id === activeBoard.id ? { ...b, content: next } : b));
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = s + stamp.length;
      ta.focus();
    });
  }, [content, activeBoard, boards, onBoardsChange]);

  const handleCopyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      textareaRef.current?.select();
    }
  }, [content]);

  // Wrap selection helper
  const wrapSelection = useCallback(
    (prefix: string, suffix = prefix) => {
      const ta = textareaRef.current;
      if (!ta || !activeBoard) return;
      const { selectionStart: s, selectionEnd: e } = ta;
      const selected = content.slice(s, e);
      const next = content.slice(0, s) + prefix + selected + suffix + content.slice(e);
      onBoardsChange(boards.map(b => b.id === activeBoard.id ? { ...b, content: next } : b));
      requestAnimationFrame(() => {
        if (selected.length > 0) {
          ta.selectionStart = s + prefix.length;
          ta.selectionEnd = e + prefix.length;
        } else {
          ta.selectionStart = ta.selectionEnd = s + prefix.length;
        }
        ta.focus();
      });
    },
    [content, activeBoard, boards, onBoardsChange]
  );

  // Prefix current line
  const prefixLine = useCallback(
    (marker: string) => {
      const ta = textareaRef.current;
      if (!ta || !activeBoard) return;
      const s = ta.selectionStart;
      const lineStart = content.lastIndexOf('\n', s - 1) + 1;
      const alreadyHas = content.slice(lineStart).startsWith(marker);
      let next: string;
      let newCursor: number;
      if (alreadyHas) {
        next = content.slice(0, lineStart) + content.slice(lineStart + marker.length);
        newCursor = s - marker.length;
      } else {
        next = content.slice(0, lineStart) + marker + content.slice(lineStart);
        newCursor = s + marker.length;
      }
      onBoardsChange(boards.map(b => b.id === activeBoard.id ? { ...b, content: next } : b));
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = Math.max(lineStart, newCursor);
        ta.focus();
      });
    },
    [content, activeBoard, boards, onBoardsChange]
  );

  if (!activeBoard) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <BoardTabStrip
        tabs={boards.map(b => ({ id: b.id, name: b.name }))}
        activeId={activeBoardId}
        onSelect={setActiveBoardId}
        onRename={renameBoard}
        onAdd={addBoard}
        onDelete={deleteBoard}
        addLabel="+ note"
      />
      <div className={styles.container}>
        {/* Floating toolbar — appears on focus/hover */}
        <div className={styles.toolbar}>
          <button
            className={styles.toolbarBtn}
            title="Bold (wrap selected text)"
            onMouseDown={e => { e.preventDefault(); wrapSelection('**'); }}
          >
            <strong>B</strong>
          </button>
          <button
            className={styles.toolbarBtn}
            title="Italic (wrap selected text)"
            onMouseDown={e => { e.preventDefault(); wrapSelection('_'); }}
          >
            <em>I</em>
          </button>
          <button
            className={styles.toolbarBtn}
            title="Heading line (prefix ##)"
            style={{ fontSize: 11, fontWeight: 700 }}
            onMouseDown={e => { e.preventDefault(); prefixLine('## '); }}
          >
            H
          </button>
          <button
            className={styles.toolbarBtn}
            title="Bullet point"
            onMouseDown={e => { e.preventDefault(); prefixLine('• '); }}
          >
            •
          </button>
          <button
            className={styles.toolbarBtn}
            title="Numbered list item"
            onMouseDown={e => { e.preventDefault(); prefixLine('1. '); }}
          >
            1.
          </button>
          <button
            className={styles.toolbarBtn}
            title="Checklist item"
            onMouseDown={e => { e.preventDefault(); prefixLine('[ ] '); }}
          >
            ☐
          </button>

          <div className={styles.toolbarSep} />

          <button
            className={styles.stampBtn}
            title="Insert timestamp at cursor"
            onMouseDown={e => { e.preventDefault(); insertStamp(); }}
          >
            🕐 timestamp
          </button>

          <div className={styles.toolbarSep} />

          <button
            className={styles.toolbarBtn}
            onClick={handleCopyAll}
            title="Copy all text"
            aria-label="Copy all text"
          >
            {copied ? '✓' : '⎘'}
          </button>

          <span className={styles.wordCount}>
            {words === 0 ? '' : `${words}w · ${content.length}c`}
          </span>
        </div>

        <div className={styles.rule} />

        <textarea
          ref={textareaRef}
          className={styles.textArea}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck
          autoFocus
        />
      </div>
    </div>
  );
};
