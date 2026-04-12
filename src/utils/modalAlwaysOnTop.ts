/**
 * Tracks how many modals/popups are currently open and keeps the window
 * always-on-top while any are showing. Reverts when all are closed.
 *
 * Usage — call onModalMount() in a useEffect and return onModalUnmount():
 *
 *   useEffect(() => {
 *     onModalMount();
 *     return () => onModalUnmount();
 *   }, []);
 */
import { getCurrentWindow } from '@tauri-apps/api/window';

let openCount = 0;

export function onModalMount(): void {
  openCount++;
  if (openCount === 1) {
    getCurrentWindow().setAlwaysOnTop(true).catch(console.warn);
  }
}

export function onModalUnmount(): void {
  openCount = Math.max(0, openCount - 1);
  if (openCount === 0) {
    getCurrentWindow().setAlwaysOnTop(false).catch(console.warn);
  }
}
