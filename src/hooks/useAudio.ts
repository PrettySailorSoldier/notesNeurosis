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
      // Re-attempt resume whenever the page visibility changes (window un-minimized)
      document.addEventListener('visibilitychange', () => {
        if (ctxRef.current?.state === 'suspended') {
          ctxRef.current.resume().catch(() => {});
        }
      });
    }
    return ctxRef.current;
  }

  /**
   * Start a silent looping buffer to prevent WebView2 from auto-suspending
   * the AudioContext while an alarm is ringing. Wrapped in try/catch so a
   * WebView2 quirk can't silently kill the whole playTone call.
   */
  function startKeepAlive(ctx: AudioContext) {
    keepAliveCount.current++;
    if (keepAliveCount.current > 1 || keepAliveRef.current) return;
    try {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate), ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(ctx.destination);
      source.start(0);
      keepAliveRef.current = source;
    } catch (_) {
      // Non-fatal — audio can still play without keep-alive
    }
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

    // Start keep-alive AFTER getCtx so ctx exists (errors are swallowed internally)
    startKeepAlive(ctx);

    function scheduleSynth(ctx: AudioContext) {
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
    }

    function playSynth() {
      if (isStopped) return;
      try {
        if (ctx.state === 'running') {
          scheduleSynth(ctx);
        } else {
          // Context is suspended — resume first, then play once it's running
          ctx.resume().then(() => {
            if (!isStopped) scheduleSynth(ctx);
          }).catch(err => console.warn('[useAudio] resume failed:', err));
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
