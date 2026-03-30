import type { AccentColor } from '../types';

export function accentToHex(color: AccentColor): string {
  const map: Record<AccentColor, string> = {
    plum:   '#9b6fa6',
    rose:   '#c47b8e',
    peach:  '#d4956a',
    orange: '#c97e4a',
    yellow: '#c4a84a',
    blue:   '#6a8fc4',
    ghost:  '#9090a0',
    // legacy
    violet: '#7b6fb0',
    indigo: '#6a7bbf',
    amber:  '#c4a050',
    teal:   '#5a9a9a',
  };
  return map[color] ?? '#9090a0';
}
