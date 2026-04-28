import { useState } from 'react';
import type { ThemeLexicon, TimerState } from '../../shared/types';

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

interface Props {
  state: TimerState;
  elapsedMs: number;
  onStop: () => void;
  // Click handler for the running task name. App.tsx wires this to switch
  // tabs + select the task in TaskList. Omit / no-op when no behavior is
  // wanted (idle state ignores it regardless).
  onTaskClick?: (taskId: string) => void;
  lexicon: ThemeLexicon;
}

export function TimerBar({ state, elapsedMs, onStop, onTaskClick, lexicon }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function fetchFromClickUp() {
    setSyncing(true);
    setSyncError(null);
    try {
      await window.helm.syncTimerFromRemote();
    } catch (e) {
      setSyncError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  if (!state.running) {
    return (
      <div
        data-slot="timer-bar"
        className="relative h-16 grid grid-cols-[1fr_auto_1fr] items-center px-4 bg-panel border-b border-border"
      >
        <div className="flex items-center gap-3 text-inkMuted min-w-0">
          <span data-slot="timer-indicator" data-state="idle" />
          <button
            onClick={fetchFromClickUp}
            disabled={syncing}
            title="Pull the current timer from ClickUp"
            className="px-2 py-0.5 rounded text-xs border border-border text-inkMuted hover:text-ink hover:bg-panelHi disabled:opacity-50"
          >
            {syncing ? 'Fetching…' : `Fetch from ClickUp`}
          </button>
          {state.resumeTaskName && (
            <span className="text-warn text-xs truncate">
              Paused: <span className="text-ink">{state.resumeTaskName}</span>
            </span>
          )}
          {syncError && <span className="text-danger text-xs truncate">{syncError}</span>}
        </div>

        <div className="text-center min-w-0">
          <div data-slot="timer-label">{lexicon.currentTaskLabel}</div>
          <div
            data-slot="timer-task"
            className="text-inkMuted text-lg font-medium truncate"
          >
            {lexicon.noTimerLabel}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <div className="text-right">
            <div data-slot="timer-label">{lexicon.elapsedLabel}</div>
            <div data-slot="timer-clock" className="text-inkMuted">
              00:00:00
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-slot="timer-bar"
      className="relative h-16 grid grid-cols-[1fr_auto_1fr] items-center px-4 bg-panel border-b border-border"
    >
      <div data-slot="timer-actions" className="flex items-center gap-3 min-w-0">
        <span data-slot="timer-indicator" data-state="running" />
        <button
          onClick={fetchFromClickUp}
          disabled={syncing}
          title="Re-sync the timer with ClickUp"
          className="px-2 py-0.5 rounded text-xs border border-border text-inkMuted hover:text-ink hover:bg-panelHi disabled:opacity-50"
        >
          {syncing ? '…' : lexicon.syncVerb}
        </button>
        {state.resumeTaskName && (
          <span className="text-warn text-xs truncate">
            Paused: <span className="text-ink">{state.resumeTaskName}</span>
          </span>
        )}
      </div>

      <div className="text-center min-w-0 px-4">
        <div data-slot="timer-label">{lexicon.currentTaskLabel}</div>
        {onTaskClick && state.taskId ? (
          <button
            data-slot="timer-task"
            onClick={() => onTaskClick(state.taskId!)}
            title="Open this task in the Tasks tab"
            className="text-ink text-lg font-semibold truncate hover:underline cursor-pointer block w-full"
          >
            {state.taskName || state.taskId}
          </button>
        ) : (
          <div
            data-slot="timer-task"
            className="text-ink text-lg font-semibold truncate"
          >
            {state.taskName || state.taskId}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-4">
        <div className="text-right">
          <div data-slot="timer-label">{lexicon.elapsedLabel}</div>
          <div data-slot="timer-clock" className="text-ink">
            {fmt(elapsedMs)}
          </div>
        </div>
        <button
          onClick={onStop}
          className="px-3 py-1 rounded bg-danger/20 text-danger hover:bg-danger/30 border border-danger/40"
        >
          {lexicon.stopVerb}
        </button>
      </div>
    </div>
  );
}
