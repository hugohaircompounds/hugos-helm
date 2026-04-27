import type { TimeEntry } from '../../shared/types';
import { fmtDuration, fmtTime } from '../utils/time';
import { isRunningId } from '../utils/runningEntry';
import type { TimesheetRange } from '../hooks/useTimeEntries';
import { TimelineBar } from './TimelineBar';

interface Props {
  entries: TimeEntry[];
  loading: boolean;
  error: string | null;
  range: TimesheetRange;
  onRangeChange: (range: TimesheetRange) => void;
  onRefresh: () => void;
  selectedEntryId: string | null;
  onSelectEntry: (id: string | null) => void;
}

export function TimesheetEditor({
  entries,
  loading,
  error,
  range,
  onRangeChange,
  onRefresh,
  selectedEntryId,
  onSelectEntry,
}: Props) {
  const total = entries.reduce((a, e) => a + (e.duration || 0), 0);

  return (
    <div className="flex flex-col h-full">
      <header className="h-10 flex items-center justify-between px-3 border-b border-border flex-shrink-0">
        <h2 className="text-xs uppercase tracking-wider text-inkMuted">
          Timesheet · {fmtDuration(total)}
        </h2>
        <div className="flex items-center gap-2">
          <select
            className="bg-panel border border-border rounded px-2 py-1 text-xs"
            value={range}
            onChange={(e) => onRangeChange(e.target.value as TimesheetRange)}
          >
            <option value="today">Today</option>
            <option value="week">This week</option>
          </select>
          <button onClick={onRefresh} className="text-xs text-inkMuted hover:text-ink">
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </header>

      {range === 'today' && (
        <TimelineBar
          entries={entries}
          selectedEntryId={selectedEntryId}
          onSelect={onSelectEntry}
        />
      )}

      {error && <div className="p-3 text-xs text-danger flex-shrink-0">{error}</div>}
      <ul className="flex-1 overflow-auto p-2 flex flex-col gap-1 min-h-0">
        {entries.map((e) => {
          const selected = selectedEntryId === e.id;
          const running = isRunningId(e.id);
          return (
            <li
              key={e.id}
              onClick={() => onSelectEntry(e.id)}
              className={`px-3 py-2 rounded border cursor-pointer ${
                selected
                  ? 'bg-panelHi border-accent/50'
                  : running
                  ? 'bg-panel border-accent/40 hover:bg-panelHi'
                  : 'bg-panel border-border hover:bg-panelHi'
              }`}
            >
              <div className="min-w-0 flex items-center gap-2">
                {running && (
                  <span
                    className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0"
                    aria-label="Running"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{e.taskName || '(untracked)'}</div>
                  <div className="text-xs text-inkMuted">
                    {fmtTime(e.start)} → {e.end ? fmtTime(e.end) : 'running'} ·{' '}
                    {fmtDuration(e.duration)}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {!loading && entries.length === 0 && !error && (
          <li className="text-inkMuted text-xs p-3">No entries in this range.</li>
        )}
      </ul>
    </div>
  );
}
