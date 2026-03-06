import { useRef } from 'react';
import type { ReminderSound } from '../types';

export function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);

  function getCtx(): AudioContext {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }

  function playTone(type: ReminderSound, volume = 0.5): void {
    if (type === 'none') return;

    try {
      const ctx = getCtx();
      const master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);

      if (type === 'chime') {
        // Ascending 3-note chime
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          osc.connect(g);
          g.connect(master);
          const t = ctx.currentTime + i * 0.18;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.6, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
          osc.start(t);
          osc.stop(t + 0.55);
        });

      } else if (type === 'bell') {
        // Triangle wave bell 660Hz
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 660;
        osc.connect(g);
        g.connect(master);
        g.gain.setValueAtTime(0.7, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.2);

      } else if (type === 'blip') {
        // Square wave blip 1000Hz — short
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 1000;
        osc.connect(g);
        g.connect(master);
        g.gain.setValueAtTime(0.3, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.12);

      } else if (type === 'soft_ding') {
        // Sine 528Hz — soft, healing frequency
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 528;
        osc.connect(g);
        g.connect(master);
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.5);
      }

    } catch (err) {
      console.warn('[useAudio] playTone failed:', err);
    }
  }

  return { playTone };
}
