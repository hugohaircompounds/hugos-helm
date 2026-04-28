import { powerMonitor } from 'electron';
import { getSettings, getTimerState, logJob } from '../db';
import { timerBus } from '../scheduler/timer';

// Tracks the moment the OS reported the screen locked or the system
// suspended. On unlock/resume, if a timer was running and elapsed exceeds
// `idleTimeoutMin`, fire the truncate prompt to the renderer.
let idleStartedAt: number | null = null;

function startIdle(reason: 'lock-screen' | 'suspend'): void {
  const settings = getSettings();
  if (!settings.idleDetectionEnabled) return;
  if (reason === 'lock-screen' && !settings.lockTriggersIdle) return;
  const state = getTimerState();
  if (!state.running) return;
  // Don't override a still-pending lock with a later one.
  if (idleStartedAt !== null) return;
  idleStartedAt = Date.now();
}

function endIdle(): void {
  const start = idleStartedAt;
  idleStartedAt = null;
  if (start === null) return;
  const settings = getSettings();
  if (!settings.idleDetectionEnabled) return;
  const now = Date.now();
  const elapsedMs = now - start;
  if (elapsedMs < settings.idleTimeoutMin * 60_000) return;
  // Timer might have been stopped during the lock (e.g. eod-stop at 16:59).
  // If so, nothing to truncate.
  const state = getTimerState();
  if (!state.running || !state.taskId || !state.startedAt) return;
  // Don't suggest a truncation that precedes the entry's start.
  if (start <= state.startedAt) return;
  timerBus.emit('idle-truncate-prompt', {
    idleStartedAt: start,
    idleEndedAt: now,
    taskId: state.taskId,
    taskName: state.taskName,
  });
  logJob(
    'idle-detect',
    'ok',
    `prompted truncate after ${Math.round(elapsedMs / 60_000)}m idle`
  );
}

export function startIdleService(): void {
  // Wired once from main.ts on app ready. powerMonitor is only available
  // after the app is ready, so calling earlier crashes.
  powerMonitor.on('lock-screen', () => startIdle('lock-screen'));
  powerMonitor.on('unlock-screen', endIdle);
  powerMonitor.on('suspend', () => startIdle('suspend'));
  powerMonitor.on('resume', endIdle);
}
