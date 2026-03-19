import React, { useEffect, useRef } from 'react';
import styles from './ContextMenu.module.css';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  options: {
    label: string;
    icon?: string;
    onClick: () => void;
    danger?: boolean;
    divider?: boolean;
  }[];
  colors?: { name: string; hex: string }[];
  activeColor?: string;
  onColorSelect?: (name: string) => void;
}

export const ContextMenu: React.FC<Props> = ({ x, y, onClose, options, colors, activeColor, onColorSelect }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Prevent menu from overflowing the window
  let top = y;
  let left = x;
  // We approximate width/height if it hasn't mounted, but CSS handles it gracefully
  if (top + 160 > window.innerHeight) top -= 160;
  if (left + 140 > window.innerWidth) left -= 140;

  return (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{ top, left }}
      onContextMenu={(e) => e.preventDefault()} // prevent native context menu
    >
      {options.map((opt, i) =>
        opt.divider ? (
          <div key={`div-${i}`} className={styles.divider} />
        ) : (
          <button
            key={i}
            className={`${styles.menuItem} ${opt.danger ? styles.danger : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              opt.onClick();
            }}
          >
            {opt.icon && <span className={styles.icon}>{opt.icon}</span>}
            {opt.label}
          </button>
        )
      )}

      {colors && onColorSelect && (
        <div className={styles.colorRow}>
          {colors.map(c => (
            <button
              key={c.name}
              className={`${styles.colorDot} ${activeColor === c.name ? styles.activeDot : ''}`}
              style={{ background: c.hex }}
              onClick={(e) => {
                e.stopPropagation();
                onColorSelect(c.name);
                onClose();
              }}
              title={c.name}
            />
          ))}
        </div>
      )}
    </div>
  );
};
