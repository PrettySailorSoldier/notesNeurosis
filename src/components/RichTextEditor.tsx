import React, { useRef, useEffect, useState, useCallback } from 'react';
import styles from './RichTextEditor.module.css';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export const RichTextEditor: React.FC<Props> = ({ content, onChange, placeholder }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showFormatMenu, setShowFormatMenu] = useState(false);

  // Sync content from props only if it's different from what's currently in the editor
  // to avoid cursor jumping issues.
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
  };

  const toggleFormatMenu = () => setShowFormatMenu(!showFormatMenu);

  const applyStyle = (tag: string) => {
    execCommand('formatBlock', `<${tag}>`);
    setShowFormatMenu(false);
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

        <button className={styles.toolbarBtn} onClick={() => execCommand('bold')} title="Bold"><b>B</b></button>
        <button className={styles.toolbarBtn} onClick={() => execCommand('italic')} title="Italic"><i>I</i></button>
        <button className={styles.toolbarBtn} onClick={() => execCommand('underline')} title="Underline"><u>U</u></button>
        <button className={styles.toolbarBtn} onClick={() => execCommand('strikeThrough')} title="Strikethrough"><s>S</s></button>

        <div className={styles.sep} />

        <button className={styles.toolbarBtn} onClick={() => execCommand('insertUnorderedList')} title="Bullet List">•</button>
        <button className={styles.toolbarBtn} onClick={() => execCommand('insertOrderedList')} title="Numbered List">1.</button>
        
        {/* Checklist item — custom implementation needed for full Apple style, but for now we use a block */}
        <button 
          className={styles.toolbarBtn} 
          onClick={() => {
            // Basic checklist simulation using bullet list + custom class could work, 
            // but execCommand is limited. We'll use a specific bullet style for now.
            execCommand('insertUnorderedList');
          }} 
          title="Checklist"
        >
          ☑
        </button>

        <div className={styles.sep} />

        <button className={styles.toolbarBtn} onClick={() => execCommand('outdent')} title="Decrease Indent">←</button>
        <button className={styles.toolbarBtn} onClick={() => execCommand('indent')} title="Increase Indent">→</button>
      </div>

      <div
        ref={editorRef}
        className={styles.editor}
        contentEditable
        onInput={handleInput}
        placeholder={placeholder}
        spellCheck
      />
    </div>
  );
};
