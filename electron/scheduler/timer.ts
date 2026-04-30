// Authoritative timer service (main process only).
// Owns the single timer_state row and emits events when it changes.
// All ClickUp timer API calls route through here — never call clickup.startTimer/stopTimer
// directly from the scheduler or IPC handlers; always go through startTimer()/stopTimer()
// below so state + audit logging stay consistent.

import { EventEmitter } from 'node:events';
import type {
  DescriptionPromptPayload,
  EodFocusEntryPayload,
  IdleTruncatePromptPayload,
  TimerState,
} from '../../shared/types';
import {
  getCachedTask,
  getSettings,
  getTimerState,
  logJob,
  saveTimerState,
} from '../db';
import * as clickup from '../services/clickup';

// Typed facade over a plain EventEmitter to keep dependencies on @types/node generics minimal.
export interface TimerBus {
  on(event: 'change', cb: (state: TimerState) => void): void;
  on(event: 'description-prompt', cb: (payload: DescriptionPromptPayload) => void): void;
  on(event: 'eod-focus-entry', cb: (payload: EodFocusEntryPayload) => void): void;
  on(event: 'idle-truncate-prompt', cb: (payload: IdleTruncatePromptPayload) => void): void;
  off(event: 'change', cb: (state: TimerState) => void): void;
  off(event: 'description-prompt', cb: (payload: DescriptionPromptPayload) => void): void;
  off(event: 'eod-focus-entry', cb: (payload: EodFocusEntryPayload) => void): void;
  off(event: 'idle-truncate-prompt', cb: (payload: IdleTruncatePromptPayload) => void): void;
  emit(event: 'change', state: TimerState): void;
  emit(event: 'description-prompt', payload: DescriptionPromptPayload): void;
  emit(event: 'eod-focus-entry', payload: EodFocusEntryPayload): void;
  emit(event: 'idle-truncate-prompt', payload: IdleTruncatePromptPayload): void;
}

export const timerBus: TimerBus = new EventEmitter();

// Description the user is typing into the Timesheet editor for the running
// timer. Held in memory and flushed via clickup.updateTimeEntry() when the
// timer stops, so a scheduler-driven EOD stop captures whatever was typed.
let pendingRunningDescription = '';

export function setRunningDescription(text: string): void {
  pendingRunningDescription = text;
}

export function getRunningDescription(): string {
  return pendingRunningDescription;
}

function emitChange(state: TimerState): void {
  timerBus.emit('change', state);
}

export function currentState(): TimerState {
  return getTimerState();
}

interface StartOpts {
  /** if true, stash the currently running task id as resumeTaskId before starting this one */
  rememberResume?: boolean;
}

export async function startTimer(taskId: string, opts: StartOpts = {}): Promise<TimerState> {
  const prev = getTimerState();

  let resumeTaskId = prev.resumeTaskId;
  let resumeTaskName = prev.resumeTaskName;

  if (prev.running && prev.taskId && prev.taskId !== taskId) {
    // If asked to remember the previous task for later resume, capture it.
    if (opts.rememberResume) {
      resumeTaskId = prev.taskId;
      resumeTaskName = prev.taskName;
    }
    // Stop the running one first. Suppress prompts and resume logic — this is a switch.
    await stopTimer({ silent: true, skipAutoResume: true });
  }

  const entry = await clickup.startTimer(taskId);
  const cached = getCachedTask(taskId);
  // Seed the description buffer from whatever ClickUp returns for the new
  // entry (typically '' for a fresh start). This is what TimeEntryDetail
  // reads via getRunningDescription() so a remounted textarea reflects the
  // same description ClickUp has, not a stale empty value.
  pendingRunningDescription = entry.description ?? '';
  const next: TimerState = {
    running: true,
    taskId,
    taskName: entry.taskName || cached?.name || taskId,
    entryId: entry.id,
    startedAt: entry.start,
    resumeTaskId,
    resumeTaskName,
  };
  saveTimerState(next);
  emitChange(next);
  return next;
}

interface StopOpts {
  /** do not emit the manual-stop description prompt */
  silent?: boolean;
  /** do not auto-resume a paused task even if one is pending */
  skipAutoResume?: boolean;
  /** override default description-prompt text (used by EOD) */
  promptKind?: 'manual-stop' | 'eod';
}

export async function stopTimer(opts: StopOpts = {}): Promise<TimerState> {
  const prev = getTimerState();
  if (!prev.running) {
    return prev;
  }

  const stoppedEntry = await clickup.stopTimer();
  const stoppedTaskId = prev.taskId;
  const stoppedTaskName = prev.taskName;
  const entryId = stoppedEntry?.id || prev.entryId;

  // Flush any description the renderer buffered for the running entry. The
  // ClickUp stop endpoint doesn't accept a description, so update separately.
  // Best-effort: errors are logged but don't block the stop.
  const buffered = pendingRunningDescription;
  pendingRunningDescription = '';
  if (buffered.trim() && entryId) {
    try {
      await clickup.updateTimeEntry(entryId, { description: buffered });
    } catch (e) {
      logJob('eod-stop', 'error', `description flush failed: ${(e as Error).message}`);
    }
  }

  const settings = getSettings();
  const standupIds = [settings.standupTaskIdMon, settings.standupTaskIdTueThu].filter(
    (id): id is string => !!id
  );
  const wasStandup = !!stoppedTaskId && standupIds.includes(stoppedTaskId);

  // Persist cleared state first.
  let next: TimerState = {
    running: false,
    taskId: null,
    taskName: null,
    entryId: null,
    startedAt: null,
    resumeTaskId: prev.resumeTaskId,
    resumeTaskName: prev.resumeTaskName,
  };
  saveTimerState(next);
  emitChange(next);

  // Auto-resume after a standup stop, if we paused something for it.
  if (wasStandup && !opts.skipAutoResume && prev.resumeTaskId) {
    const resumeId = prev.resumeTaskId;
    const resumeName = prev.resumeTaskName;
    try {
      const resumed = await clickup.startTimer(resumeId);
      pendingRunningDescription = resumed.description ?? '';
      next = {
        running: true,
        taskId: resumeId,
        taskName: resumeName,
        entryId: resumed.id,
        startedAt: resumed.start,
        resumeTaskId: null,
        resumeTaskName: null,
      };
      saveTimerState(next);
      emitChange(next);
      logJob('auto-resume', 'ok', `resumed ${resumeName || resumeId} after standup`);
    } catch (e) {
      logJob('auto-resume', 'error', (e as Error).message);
    }
  }

  // Manual-stop prompt is orthogonal — fire unless silenced.
  if (!opts.silent) {
    const payload: DescriptionPromptPayload = {
      kind: opts.promptKind || 'manual-stop',
      entryId,
      taskId: stoppedTaskId,
      defaultText: stoppedTaskName || '',
      taskTitles: [],
    };
    timerBus.emit('description-prompt', payload);
  }

  return next;
}

/**
 * Pause the running timer without auto-resume or description prompt, but
 * remember the current task in resumeTaskId so a later cron can restart it.
 */
export async function pauseForLater(): Promise<TimerState> {
  const prev = getTimerState();
  if (!prev.running) return prev;
  const resumeId = prev.taskId;
  const resumeName = prev.taskName;

  await clickup.stopTimer();

  const next: TimerState = {
    running: false,
    taskId: null,
    taskName: null,
    entryId: null,
    startedAt: null,
    resumeTaskId: resumeId,
    resumeTaskName: resumeName,
  };
  saveTimerState(next);
  emitChange(next);
  return next;
}

/**
 * Reconcile local timer_state with whatever ClickUp says is currently running
 * across all clients (web, mobile, other machines). Writes state and emits
 * a change event if anything differs.
 */
export async function syncFromRemote(): Promise<TimerState> {
  const prev = getTimerState();
  let remote;
  try {
    remote = await clickup.getCurrentTimer();
  } catch {
    // If bootstrap isn't done (no token yet) we just stay with local state.
    return prev;
  }

  if (!remote) {
    // ClickUp says nothing is running — if we thought something was, clear.
    if (prev.running) {
      const cleared: TimerState = {
        running: false,
        taskId: null,
        taskName: null,
        entryId: null,
        startedAt: null,
        resumeTaskId: prev.resumeTaskId,
        resumeTaskName: prev.resumeTaskName,
      };
      saveTimerState(cleared);
      emitChange(cleared);
      return cleared;
    }
    return prev;
  }

  // Remote timer exists. Check whether it already matches what we have locally.
  const matches =
    prev.running &&
    prev.entryId === remote.id &&
    prev.taskId === remote.taskId &&
    prev.startedAt === remote.start;

  if (matches) return prev;

  const cached = remote.taskId ? getCachedTask(remote.taskId) : null;
  // Seed the description buffer from the remote entry so a re-launched Helm
  // or a timer started elsewhere shows the right description in the
  // Timesheet textarea. Only seed if the local buffer is empty — don't
  // clobber unsaved typing from this client.
  if (!pendingRunningDescription) {
    pendingRunningDescription = remote.description ?? '';
  }
  const next: TimerState = {
    running: true,
    taskId: remote.taskId,
    taskName: remote.taskName || cached?.name || remote.taskId,
    entryId: remote.id,
    startedAt: remote.start,
    resumeTaskId: prev.resumeTaskId,
    resumeTaskName: prev.resumeTaskName,
  };
  saveTimerState(next);
  emitChange(next);
  return next;
}

/**
 * Resume whatever pauseForLater() stashed. No-op if nothing pending.
 */
export async function resumePaused(): Promise<TimerState> {
  const prev = getTimerState();
  if (!prev.resumeTaskId) return prev;
  const id = prev.resumeTaskId;
  const name = prev.resumeTaskName;
  const entry = await clickup.startTimer(id);
  const next: TimerState = {
    running: true,
    taskId: id,
    taskName: name || entry.taskName || id,
    entryId: entry.id,
    startedAt: entry.start,
    resumeTaskId: null,
    resumeTaskName: null,
  };
  saveTimerState(next);
  emitChange(next);
  return next;
}

/**
 * Push the running entry's description to ClickUp without stopping the
 * timer. The buffer is updated to the saved value too, so a later
 * stopTimer flush is an idempotent re-PUT (same value, no double-write
 * surprise). Throws if no timer is running or the entry id is unknown.
 */
export async function flushRunningDescription(text: string): Promise<void> {
  const prev = getTimerState();
  if (!prev.running || !prev.entryId) {
    throw new Error('No running timer to save description for.');
  }
  const desc = typeof text === 'string' ? text : '';
  await clickup.updateTimeEntry(prev.entryId, { description: desc });
  pendingRunningDescription = desc;
}

/**
 * Edit the start time of the currently running entry. Pushes the new start
 * to ClickUp via PUT /time_entries/{id}, then mirrors the change to local
 * timer_state so the renderer's elapsed-time display + synthetic running
 * entry rebuild against the corrected start. Used to fix "I forgot to start
 * the timer 30 minutes ago" without losing the running window.
 */
export async function updateRunningEntryStart(start: number): Promise<TimerState> {
  const prev = getTimerState();
  if (!prev.running || !prev.entryId) {
    throw new Error('No running timer to edit.');
  }
  if (!Number.isFinite(start) || start <= 0) {
    throw new Error('Invalid start time.');
  }
  if (start > Date.now()) {
    throw new Error('Start time cannot be in the future.');
  }
  await clickup.updateTimeEntry(prev.entryId, { start });
  const next: TimerState = { ...prev, startedAt: start };
  saveTimerState(next);
  emitChange(next);
  return next;
}

/**
 * Stop the running timer and retroactively rewrite its end timestamp to `at`
 * (and recompute duration). Used by the idle-truncate flow when the user
 * was locked or away from their machine while a timer was running. No
 * description prompt, no auto-resume — this is a "I wasn't actually
 * working" correction, not a normal stop.
 */
export async function truncateRunningEntry(at: number): Promise<void> {
  const prev = getTimerState();
  if (!prev.running || !prev.startedAt || prev.startedAt >= at) {
    return;
  }
  const entryId = prev.entryId;
  await stopTimer({ silent: true, skipAutoResume: true });
  if (!entryId) return;
  try {
    await clickup.updateTimeEntry(entryId, {
      end: at,
      duration: at - prev.startedAt,
    });
  } catch (e) {
    logJob('idle-truncate', 'error', (e as Error).message);
  }
}
