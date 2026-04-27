import type { TimeEntry, TimerState } from '../../shared/types';

// Synthetic id prefix for the in-memory "running timer" entry merged into the
// timesheet view. ClickUp's /time_entries endpoint does not return the
// in-progress entry, so we synthesize one in the renderer so the running task
// shows up in the list and on the TimelineBar alongside completed entries.
// The prefix is the marker that tells the UI to render this entry as
// non-persistent (no Delete, no start/end edits).
export const RUNNING_ID_PREFIX = '__running:';

export function isRunningId(id: string): boolean {
  return id.startsWith(RUNNING_ID_PREFIX);
}

export function runningIdFor(taskId: string): string {
  return `${RUNNING_ID_PREFIX}${taskId}`;
}

export function buildRunningEntry(state: TimerState, now: number): TimeEntry | null {
  if (!state.running || !state.taskId || !state.startedAt) return null;
  return {
    id: runningIdFor(state.taskId),
    taskId: state.taskId,
    taskName: state.taskName,
    description: '',
    start: state.startedAt,
    end: null,
    duration: Math.max(0, now - state.startedAt),
  };
}

// Prepend the synthetic running entry to the entries list. If a real entry
// already represents the running timer (rare race after start/refresh), the
// synthetic is dropped so we don't render two rows for one timer.
export function mergeRunningEntry(
  entries: TimeEntry[],
  state: TimerState,
  now: number
): TimeEntry[] {
  const synthetic = buildRunningEntry(state, now);
  if (!synthetic) return entries;
  const realRunning = entries.find(
    (e) => e.taskId === synthetic.taskId && e.end === null
  );
  if (realRunning) return entries;
  return [synthetic, ...entries];
}
