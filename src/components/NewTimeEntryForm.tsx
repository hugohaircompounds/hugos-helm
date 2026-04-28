import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task, TimeEntry } from '../../shared/types';
import {
  fmtDuration,
  fromLocalDatetimeInput,
  toLocalDatetimeInput,
} from '../utils/time';

interface Props {
  tasks: Task[];
  // Optional default task id — typically the most-recently-tracked task so the
  // common "I forgot to start the timer" flow is one click less.
  defaultTaskId?: string | null;
  onCreate: (opts: {
    taskId: string | null;
    start: number;
    duration: number;
    description?: string;
  }) => Promise<TimeEntry | null>;
  onClose: () => void;
}

// Round `now` down to the nearest 5 minutes so the datetime-local picker
// shows clean times. Returns local-time iso for the input.
function defaultStart(): number {
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  return Math.floor(now / fiveMin) * fiveMin - 60 * 60 * 1000; // 1h ago, snapped
}

function defaultEnd(): number {
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  return Math.floor(now / fiveMin) * fiveMin;
}

export function NewTimeEntryForm({ tasks, defaultTaskId, onCreate, onClose }: Props) {
  const [taskId, setTaskId] = useState<string>(defaultTaskId || '');
  const [start, setStart] = useState<string>(toLocalDatetimeInput(defaultStart()));
  const [end, setEnd] = useState<string>(toLocalDatetimeInput(defaultEnd()));
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const firstFieldRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  // Sort tasks by listName then name for a predictable picker. Group via
  // <optgroup> so visually scannable when there are 30+ tasks.
  const grouped = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = t.listName || '(no list)';
      const arr = map.get(key);
      if (arr) arr.push(t);
      else map.set(key, [t]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [tasks]);

  const startMs = start ? fromLocalDatetimeInput(start) : NaN;
  const endMs = end ? fromLocalDatetimeInput(end) : NaN;
  const duration =
    Number.isFinite(startMs) && Number.isFinite(endMs) ? endMs - startMs : NaN;
  const validDuration = Number.isFinite(duration) && duration > 0;

  async function submit() {
    setError(null);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      setError('Pick valid start and end times.');
      return;
    }
    if (endMs <= startMs) {
      setError('End must be after start.');
      return;
    }
    setSubmitting(true);
    const result = await onCreate({
      taskId: taskId || null,
      start: startMs,
      duration: endMs - startMs,
      description: description.trim() || undefined,
    });
    setSubmitting(false);
    if (result) {
      onClose();
    } else {
      setError('Failed to create entry. Check the timesheet for details.');
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div data-slot="panel-header">
        <span className="title">New entry</span>
        <span className="count">
          {validDuration ? fmtDuration(duration) : '—'}
        </span>
      </div>
      <div className="p-4 flex flex-col gap-4 overflow-auto">
        <div>
          <label className="text-xs text-inkMuted uppercase tracking-wider">Task</label>
          <select
            ref={firstFieldRef}
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="w-full bg-panel border border-border rounded px-3 py-2 mt-1 text-sm"
          >
            <option value="">(no task — untracked)</option>
            {grouped.map(([listName, list]) => (
              <optgroup key={listName} label={listName}>
                {list.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-inkMuted uppercase tracking-wider">Start</label>
            <input
              type="datetime-local"
              className="w-full bg-panel border border-border rounded px-3 py-2 mt-1"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-inkMuted uppercase tracking-wider">End</label>
            <input
              type="datetime-local"
              className="w-full bg-panel border border-border rounded px-3 py-2 mt-1"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-inkMuted uppercase tracking-wider">
            Description
          </label>
          <textarea
            className="w-full bg-panel border border-border rounded px-3 py-2 mt-1 min-h-[80px] font-mono text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </div>

        {error && <div className="text-xs text-danger">{error}</div>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-border text-inkMuted hover:bg-panelHi"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !validDuration}
            className="px-3 py-1.5 text-sm rounded bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
