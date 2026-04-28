import { useMemo } from 'react';
import type { TimeEntry } from '../../shared/types';
import { fmtDayHeader, fmtDuration, fmtTime, startOfDay } from '../utils/time';
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
  onNewEntry: () => void;
  workHoursStart?: number;
  workHoursEnd?: number;
}

interface DayGroup {
  dayStart: number;
  entries: TimeEntry[];
  total: number;
}

// Bucket entries by their start's local-midnight, sorted desc (most recent
// day first). Empty days get no group, so the renderer skips them entirely.
function groupByDay(entries: TimeEntry[]): DayGroup[] {
  const buckets = new Map<number, TimeEntry[]>();
  for (const e of entries) {
    const key = startOfDay(e.start);
    const arr = buckets.get(key);
    if (arr) arr.push(e);
    else buckets.set(key, [e]);
  }
  const groups: DayGroup[] = [];
  for (const [dayStart, dayEntries] of buckets) {
    groups.push({
      dayStart,
      entries: dayEntries,
      total: dayEntries.reduce((a, e) => a + (e.duration || 0), 0),
    });
  }
  groups.sort((a, b) => b.dayStart - a.dayStart);
  return groups;
}

function EntryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: TimeEntry;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const running = isRunningId(entry.id);
  return (
    <li
      onClick={() => onSelect(entry.id)}
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
          <div className="text-sm truncate">{entry.taskName || '(untracked)'}</div>
          <div className="text-xs text-inkMuted">
            {fmtTime(entry.start)} → {entry.end ? fmtTime(entry.end) : 'running'} ·{' '}
            {fmtDuration(entry.duration)}
          </div>
        </div>
      </div>
    </li>
  );
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
  onNewEntry,
  workHoursStart,
  workHoursEnd,
}: Props) {
  const total = entries.reduce((a, e) => a + (e.duration || 0), 0);
  const days = useMemo(() => groupByDay(entries), [entries]);
  const showDayHeaders = range === 'week';

  return (
    <div className="flex flex-col h-full">
      <header className="h-10 flex items-center justify-between px-3 border-b border-border flex-shrink-0">
        <h2 className="text-xs uppercase tracking-wider text-inkMuted">
          Timesheet · {fmtDuration(total)}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewEntry}
            className="text-xs px-2 py-1 rounded border border-border text-inkMuted hover:text-ink hover:bg-panelHi"
            title="Add a manual time entry"
          >
            + New entry
          </button>
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

      {error && <div className="p-3 text-xs text-danger flex-shrink-0">{error}</div>}

      {/* Re-key on range change so scroll resets to top when switching today/week. */}
      <div key={range} className="flex-1 overflow-auto min-h-0">
        {days.map((g) => (
          <section key={g.dayStart} className="flex flex-col">
            {showDayHeaders && (
              <div className="px-3 py-1.5 text-xs uppercase tracking-wider text-inkMuted bg-panel border-b border-border flex items-center justify-between">
                <span>{fmtDayHeader(g.dayStart)}</span>
                <span className="font-mono text-ink/80">{fmtDuration(g.total)}</span>
              </div>
            )}
            <TimelineBar
              entries={g.entries}
              selectedEntryId={selectedEntryId}
              onSelect={onSelectEntry}
              dayStart={g.dayStart}
              workHoursStart={workHoursStart}
              workHoursEnd={workHoursEnd}
            />
            <ul className="p-2 flex flex-col gap-1">
              {g.entries.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  selected={selectedEntryId === e.id}
                  onSelect={onSelectEntry}
                />
              ))}
            </ul>
          </section>
        ))}
        {!loading && days.length === 0 && !error && (
          <div className="text-inkMuted text-xs p-3">No entries in this range.</div>
        )}
      </div>
    </div>
  );
}
