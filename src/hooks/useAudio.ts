import { useRef } from 'react';
import type { ReminderSound } from '../types';
import type { CustomTone } from './useSettings';

export function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const keepAliveRef = useRef<AudioBufferSourceNode | null>(null);
  const keepAliveCount = useRef(0);

  function getCtx(): AudioContext {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
      // Resume AudioContext whenever the page becomes hidden (minimized window)
      document.addEventListener('visibilitychange', () => {
        if (ctxRef.current && ctxRef.current.state === 'suspended') {
          ctxRef.current.resume().catch(() => {});
        }
      });
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }

  /**
   * Start a silent looping buffer source on the AudioContext.
   * Keeps WebView2 from auto-suspending the context while an alarm is ringing.
   */
  function startKeepAlive(ctx: AudioContext) {
    keepAliveCount.current++;
    if (keepAliveCount.current > 1) return;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // 1s silence
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(ctx.destination);
    source.start();
    keepAliveRef.current = source;
  }

  function stopKeepAlive() {
    keepAliveCount.current = Math.max(0, keepAliveCount.current - 1);
    if (keepAliveCount.current === 0 && keepAliveRef.current) {
      try { keepAliveRef.current.stop(); } catch (_) {}
      keepAliveRef.current = null;
    }
  }

  function playTone(type: ReminderSound, volume = 0.5, customTones: CustomTone[] = []): () => void {
    if (type === 'none') return () => {};

    // Custom tone (uploaded audio file)
    if (type.startsWith('custom_')) {
      const tone = customTones.find(t => t.id === type);
      if (tone) {
        const audio = new Audio(tone.dataUrl);
        audio.volume = volume;
        audio.loop = true;

        // Resume playback if the WebView pauses it on minimize
        function onVisibilityChange() {
          if (audio.paused) audio.play().catch(() => {});
        }
        document.addEventListener('visibilitychange', onVisibilityChange);

        audio.play().catch(e => console.warn('[useAudio] HTML Audio failed:', e));
        return () => {
          document.removeEventListener('visibilitychange', onVisibilityChange);
          audio.pause();
          audio.currentTime = 0;
        };
      }
    }

    let isStopped = false;
    let intervalId: number | undefined = undefined;
    const ctx = getCtx();
    startKeepAlive(ctx);

    function playSynth() {
      if (isStopped) return;
      // Un-suspend before playing in case WebView tried to suspend it
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      try {
        const master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);

        if (type === 'chime') {
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

    playSynth();
    intervalId = window.setInterval(playSynth, 3000);

    return () => {
      isStopped = true;
      if (intervalId !== undefined) clearInterval(intervalId);
      stopKeepAlive();
    };
  }

  return { playTone };
}
