import { useState, useRef, useCallback } from 'react';

interface DragPos { x: number; y: number }

export function useDraggable() {
  const [dragPos, setDragPos] = useState<DragPos | null>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef<DragPos>({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement | null>(null);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea')) return;

    isDragging.current = true;
    const rect = modalRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      setDragPos({ x: ev.clientX - dragOffset.current.x, y: ev.clientY - dragOffset.current.y });
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  }, []);

  return { dragPos, modalRef, onHandleMouseDown };
}
