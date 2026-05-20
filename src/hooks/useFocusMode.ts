import { useState, useEffect, useRef, useCallback } from 'react';
import type { PlannerBlock } from '../types';

export interface FocusSession {
  block: PlannerBlock;
  totalSeconds: number;
  secondsLeft: number;
  running: boolean;
  startedAt: number | null;
  overtimeSeconds: number;     // seconds past the end time (count-up after 0)
  isOvertime: boolean;
}

export function useFocusMode() {
  const [session, setSession] = useState<FocusSession | null>(null);
  const tickRef = useRef<number | null>(null);

  const clearTick = () => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  // Start tick loop
  const startTick = useCallback(() => {
    clearTick();
    tickRef.current = window.setInterval(() => {
      setSession(prev => {
        if (!prev || !prev.running) return prev;
        if (prev.isOvertime) {
          return { ...prev, overtimeSeconds: prev.overtimeSeconds + 1 };
        }
        const next = prev.secondsLeft - 1;
        if (next <= 0) {
          return { ...prev, secondsLeft: 0, isOvertime: true, overtimeSeconds: 0 };
        }
        return { ...prev, secondsLeft: next };
      });
    }, 1000);
  }, []);

  const startSession = useCallback((block: PlannerBlock) => {
    const [sh, sm] = block.startTime.split(':').map(Number);
    const [eh, em] = block.endTime.split(':').map(Number);
    const total = Math.max((eh * 60 + em) - (sh * 60 + sm), 1) * 60;

    // If the block is already running (now is between start and end), resume mid-block
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    let secondsLeft = total;
    let isOvertime = false;
    let overtimeSeconds = 0;
    if (nowMins >= startMins && nowMins < endMins) {
      secondsLeft = Math.max(0, Math.round((endMins - nowMins) * 60));
    } else if (nowMins >= endMins) {
      secondsLeft = 0;
      isOvertime = true;
      overtimeSeconds = Math.round((nowMins - endMins) * 60);
    }

    setSession({
      block,
      totalSeconds: total,
      secondsLeft,
      running: true,
      startedAt: Date.now(),
      overtimeSeconds,
      isOvertime,
    });
    startTick();
  }, [startTick]);

  const pause = useCallback(() => {
    clearTick();
    setSession(prev => prev ? { ...prev, running: false } : null);
  }, []);

  const resume = useCallback(() => {
    setSession(prev => prev ? { ...prev, running: true } : null);
    startTick();
  }, [startTick]);

  const addTime = useCallback((minutes: number) => {
    setSession(prev => {
      if (!prev) return null;
      const add = minutes * 60;
      return {
        ...prev,
        secondsLeft: Math.max(0, prev.secondsLeft + add),
        totalSeconds: prev.totalSeconds + add,
        isOvertime: prev.isOvertime && prev.overtimeSeconds > add
          ? true
          : prev.secondsLeft + add > 0 ? false : prev.isOvertime,
        overtimeSeconds: prev.isOvertime
          ? Math.max(0, prev.overtimeSeconds - add)
          : prev.overtimeSeconds,
      };
    });
  }, []);

  const endSession = useCallback(() => {
    clearTick();
    setSession(null);
  }, []);

  useEffect(() => () => clearTick(), []);

  return { session, startSession, pause, resume, addTime, endSession };
}
