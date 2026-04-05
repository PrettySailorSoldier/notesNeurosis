import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './NoteEditor.module.css';

interface Props {
  /** Raw text content of the note */
  value: string;
  onChange: (value: string) => void;
  /** Optional placeholder; defaults to a writing prompt */
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
  value,
  onChange,
  placeholder = 'Begin writing…',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [words, setWords] = useState(wordCount(value));
  const [copied, setCopied] = useState(false);

  // Keep word count in sync
  useEffect(() => {
    setWords(wordCount(value));
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // ── Keyboard shortcuts inside the textarea ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = textareaRef.current;
      if (!ta) return;

      // Tab → insert 2 spaces (don't lose focus)
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const { selectionStart: s, selectionEnd: end } = ta;
        const next = value.slice(0, s) + '  ' + value.slice(end);
        onChange(next);
        // restore cursor after state update
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = s + 2;
        });
      }

      // Ctrl+D → duplicate current line
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        const { selectionStart: s } = ta;
        const lineStart = value.lastIndexOf('\n', s - 1) + 1;
        const lineEnd = value.indexOf('\n', s);
        const line = value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
        const insert = '\n' + line;
        const pos = lineEnd === -1 ? value.length : lineEnd;
        const next = value.slice(0, pos) + insert + value.slice(pos);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = pos + insert.length;
        });
      }
    },
    [value, onChange]
  );

  // Insert timestamp at cursor
  const insertStamp = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const stamp = `\n— ${formatStamp()} —\n`;
    const next = value.slice(0, s) + stamp + value.slice(s);
    onChange(next);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = s + stamp.length;
      ta.focus();
    });
  }, [value, onChange]);

  const handleCopyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      textareaRef.current?.select();
    }
  }, [value]);

  // Wrap selection helper
  const wrapSelection = useCallback(
    (prefix: string, suffix = prefix) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const { selectionStart: s, selectionEnd: e } = ta;
      const selected = value.slice(s, e);
      const next = value.slice(0, s) + prefix + selected + suffix + value.slice(e);
      onChange(next);
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
    [value, onChange]
  );

  // Prefix current line
  const prefixLine = useCallback(
    (marker: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const s = ta.selectionStart;
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      const alreadyHas = value.slice(lineStart).startsWith(marker);
      let next: string;
      let newCursor: number;
      if (alreadyHas) {
        next = value.slice(0, lineStart) + value.slice(lineStart + marker.length);
        newCursor = s - marker.length;
      } else {
        next = value.slice(0, lineStart) + marker + value.slice(lineStart);
        newCursor = s + marker.length;
      }
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = Math.max(lineStart, newCursor);
        ta.focus();
      });
    },
    [value, onChange]
  );

  const wc = words;

  return (
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
          {wc === 0 ? '' : `${wc}w · ${value.length}c`}
        </span>
      </div>

      <div className={styles.rule} />

      <textarea
        ref={textareaRef}
        className={styles.textArea}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck
        autoFocus
      />
    </div>
  );
};
