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
  lexicon: ThemeLexicon;
}

export function TimerBar({ state, elapsedMs, onStop, lexicon }: Props) {
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
        className="relative h-14 flex items-center justify-between px-4 bg-panel border-b border-border"
      >
        <div className="flex items-center gap-3 text-inkMuted">
          <span data-slot="timer-indicator" data-state="idle" />
          <div>
            <div data-slot="timer-label">{lexicon.currentTaskLabel}</div>
            <div data-slot="timer-task" className="text-ink/80">
              {lexicon.noTimerLabel}
            </div>
          </div>
          <button
            onClick={fetchFromClickUp}
            disabled={syncing}
            title="Pull the current timer from ClickUp"
            className="ml-2 px-2 py-0.5 rounded text-xs border border-border text-inkMuted hover:text-ink hover:bg-panelHi disabled:opacity-50"
          >
            {syncing ? 'Fetching…' : `Fetch from ClickUp`}
          </button>
          {state.resumeTaskName && (
            <span className="text-warn ml-3 text-xs">
              Paused: <span className="text-ink">{state.resumeTaskName}</span>
            </span>
          )}
          {syncError && <span className="text-danger text-xs ml-2">{syncError}</span>}
        </div>
        <div className="flex items-center gap-3">
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
      className="relative h-14 flex items-center justify-between px-4 bg-panel border-b border-border"
    >
      <div data-slot="timer-actions" className="flex items-center gap-3">
        <span data-slot="timer-indicator" data-state="running" />
        <div className="min-w-0">
          <div data-slot="timer-label">{lexicon.currentTaskLabel}</div>
          <div data-slot="timer-task" className="text-ink font-medium truncate max-w-xl">
            {state.taskName || state.taskId}
          </div>
        </div>
        <button
          onClick={fetchFromClickUp}
          disabled={syncing}
          title="Re-sync the timer with ClickUp"
          className="ml-2 px-2 py-0.5 rounded text-xs border border-border text-inkMuted hover:text-ink hover:bg-panelHi disabled:opacity-50"
        >
          {syncing ? '…' : lexicon.syncVerb}
        </button>
      </div>
      <div className="flex items-center gap-4">
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
