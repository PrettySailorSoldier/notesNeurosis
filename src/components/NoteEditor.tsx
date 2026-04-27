import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './NoteEditor.module.css';
import { BoardTabStrip } from './BoardTabStrip';
import { RichTextEditor } from './RichTextEditor';
import type { NoteBoard } from '../types';

interface Props {
  boards: NoteBoard[];
  onBoardsChange: (boards: NoteBoard[]) => void;
  legacyContent?: string;   // one-time migration: if boards is empty, use this
  placeholder?: string;
}

function getTextFromHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function wordCount(html: string): number {
  const text = getTextFromHtml(html);
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

function charCount(html: string): number {
  return getTextFromHtml(html).length;
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
  const [activeBoardId, setActiveBoardId] = useState<string>('');
  const [words, setWords] = useState(0);
  const [chars, setChars] = useState(0);
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
    setChars(charCount(content));
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
    (newHtml: string) => {
      if (!activeBoard) return;
      onBoardsChange(boards.map(b => b.id === activeBoard.id ? { ...b, content: newHtml } : b));
    },
    [activeBoard, boards, onBoardsChange]
  );

  const handleCopyAll = useCallback(async () => {
    try {
      const text = getTextFromHtml(content);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback
    }
  }, [content]);

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
        <RichTextEditor
          content={content}
          onChange={handleChange}
          placeholder={placeholder}
          words={words}
          chars={chars}
          onCopy={handleCopyAll}
          copied={copied}
          stampText={`— ${formatStamp()} —`}
        />
      </div>
    </div>
  );
};
