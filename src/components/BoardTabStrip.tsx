import React, { useState } from 'react';
import styles from './BoardTabStrip.module.css';

export interface BoardTab {
  id: string;
  name: string;
}

interface Props {
  tabs: BoardTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  addLabel?: string;
}

export const BoardTabStrip: React.FC<Props> = ({
  tabs, activeId, onSelect, onRename, onAdd, onDelete, addLabel = '+ tab',
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className={styles.strip}>
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`${styles.tab} ${tab.id === activeId ? styles.tabActive : ''}`}
        >
          {editingId === tab.id ? (
            <input
              className={styles.tabInput}
              autoFocus
              defaultValue={tab.name}
              onBlur={e => {
                onRename(tab.id, e.target.value.trim() || tab.name);
                setEditingId(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          ) : (
            <span
              className={styles.tabLabel}
              onClick={() => onSelect(tab.id)}
              onDoubleClick={() => setEditingId(tab.id)}
              title="Click to switch · Double-click to rename"
            >
              {tab.name}
            </span>
          )}
          {tabs.length > 1 && (
            <button
              className={styles.tabClose}
              onClick={e => { e.stopPropagation(); onDelete(tab.id); }}
              title="Delete tab"
            >×</button>
          )}
        </div>
      ))}
      <button className={styles.addBtn} onClick={onAdd} title="Add a new tab">
        {addLabel}
      </button>
    </div>
  );
};
