import { useEffect, useState } from 'react';
import type { TimerState } from '../../shared/types';

const EMPTY: TimerState = {
  running: false,
  taskId: null,
  taskName: null,
  entryId: null,
  startedAt: null,
  resumeTaskId: null,
  resumeTaskName: null,
};

export function useTimer() {
  const [state, setState] = useState<TimerState>(EMPTY);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    window.helm.getTimerState().then(setState).catch(() => {});
    const off = window.helm.onTimerChanged(setState);
    return off;
  }, []);

  useEffect(() => {
    if (!state.running) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [state.running]);

  const elapsedMs = state.running && state.startedAt ? Date.now() - state.startedAt : 0;
  // tick is read so lint doesn't complain and so elapsed re-renders each second
  void tick;

  return {
    state,
    elapsedMs,
    start: (taskId: string) => window.helm.startTimer(taskId),
    stop: () => window.helm.stopTimer(),
  };
}
