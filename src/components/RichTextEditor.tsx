import React, { useRef, useEffect, useState, useCallback } from 'react';
import styles from './RichTextEditor.module.css';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  words?: number;
  chars?: number;
  onCopy?: () => void;
  copied?: boolean;
  stampText?: string;
}

export const RichTextEditor: React.FC<Props> = ({ 
  content, 
  onChange, 
  placeholder,
  words,
  chars,
  onCopy,
  copied,
  stampText 
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showFormatMenu, setShowFormatMenu] = useState(false);

  // Focus and formatting state
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content;
    }
  }, [content]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const execCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
    updateActiveFormats();
  };

  const toggleFormatMenu = () => setShowFormatMenu(!showFormatMenu);

  const applyStyle = (tag: string) => {
    execCommand('formatBlock', `<${tag}>`);
    setShowFormatMenu(false);
  };

  const insertStamp = () => {
    if (stampText) {
      execCommand('insertHTML', `<br><span style="color: rgba(130, 80, 170, 0.5)">${stampText}</span><br>`);
    }
  };

  const updateActiveFormats = useCallback(() => {
    if (!editorRef.current) return;
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
    });
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        execCommand('outdent');
      } else {
        execCommand('indent');
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.formatGroup}>
          <button 
            className={styles.toolbarBtn} 
            onClick={toggleFormatMenu}
            title="Text Style"
          >
            Aa
          </button>
          
          {showFormatMenu && (
            <div className={styles.formatMenu}>
              <button onClick={() => applyStyle('h1')} className={styles.menuItem}>Title</button>
              <button onClick={() => applyStyle('h2')} className={styles.menuItem}>Heading</button>
              <button onClick={() => applyStyle('h3')} className={styles.menuItem}>Subheading</button>
              <button onClick={() => applyStyle('p')} className={styles.menuItem}>Body</button>
            </div>
          )}
        </div>

        <div className={styles.sep} />

        <button className={`${styles.toolbarBtn} ${activeFormats.bold ? styles.active : ''}`} onClick={() => execCommand('bold')} title="Bold"><b>B</b></button>
        <button className={`${styles.toolbarBtn} ${activeFormats.italic ? styles.active : ''}`} onClick={() => execCommand('italic')} title="Italic"><i>I</i></button>
        <button className={`${styles.toolbarBtn} ${activeFormats.underline ? styles.active : ''}`} onClick={() => execCommand('underline')} title="Underline"><u>U</u></button>
        <button className={`${styles.toolbarBtn} ${activeFormats.strikeThrough ? styles.active : ''}`} onClick={() => execCommand('strikeThrough')} title="Strikethrough"><s>S</s></button>

        <div className={styles.sep} />

        <button className={`${styles.toolbarBtn} ${activeFormats.insertUnorderedList ? styles.active : ''}`} onClick={() => execCommand('insertUnorderedList')} title="Bullet List">•</button>
        <button className={`${styles.toolbarBtn} ${activeFormats.insertOrderedList ? styles.active : ''}`} onClick={() => execCommand('insertOrderedList')} title="Numbered List">1.</button>
        
        <button 
          className={styles.toolbarBtn} 
          onClick={() => {
            execCommand('insertHTML', '☐ ');
          }} 
          title="Checklist Item"
        >
          ☐
        </button>

        <div className={styles.sep} />

        <button className={styles.toolbarBtn} onClick={() => execCommand('outdent')} title="Decrease Indent">←</button>
        <button className={styles.toolbarBtn} onClick={() => execCommand('indent')} title="Increase Indent">→</button>

        {/* Extras aligned to right */}
        <div className={styles.toolbarRight}>
          {stampText && (
            <button
              className={styles.stampBtn}
              onClick={insertStamp}
              title="Insert timestamp"
            >
              🕐 timestamp
            </button>
          )}

          {onCopy && (
            <>
              <div className={styles.sep} />
              <button
                className={styles.toolbarBtn}
                onClick={onCopy}
                title="Copy all text"
                aria-label="Copy all text"
              >
                {copied ? '✓' : '⎘'}
              </button>
            </>
          )}
          
          {words !== undefined && (
            <span className={styles.wordCount}>
              {words === 0 ? '' : `${words}w · ${chars}c`}
            </span>
          )}
        </div>
      </div>

      <div
        ref={editorRef}
        className={styles.editor}
        contentEditable
        onInput={handleInput}
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck
      />
    </div>
  );
};
