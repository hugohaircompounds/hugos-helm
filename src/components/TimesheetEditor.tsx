import { useCallback, useEffect, useState } from 'react';
import type { TimeEntry } from '../../shared/types';

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toLocalInput(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): number {
  return new Date(s).getTime();
}

export function TimesheetEditor() {
  const [range, setRange] = useState<'today' | 'week'>('today');
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.helm.listTimeEntries(range);
      setEntries(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(entry: TimeEntry, patch: Partial<TimeEntry>) {
    try {
      const updated = await window.helm.updateTimeEntry(entry.id, patch);
      // ClickUp's PUT response can omit task info and mis-format duration.
      // Merge defensively: keep local fields when the server gave us nothing good.
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id !== entry.id) return e;
          const mergedDuration =
            Number.isFinite(updated.duration) && updated.duration > 0
              ? updated.duration
              : e.duration;
          return {
            ...e,
            description: updated.description ?? e.description,
            start: Number.isFinite(updated.start) && updated.start > 0 ? updated.start : e.start,
            end: updated.end ?? e.end,
            duration: mergedDuration,
            taskId: updated.taskId || e.taskId,
            taskName: updated.taskName || e.taskName,
          };
        })
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await window.helm.deleteTimeEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const total = entries.reduce((a, e) => a + (e.duration || 0), 0);

  return (
    <div className="flex flex-col h-full">
      <header className="h-10 flex items-center justify-between px-3 border-b border-border">
        <h2 className="text-xs uppercase tracking-wider text-inkMuted">
          Timesheet · {fmtDuration(total)}
        </h2>
        <div className="flex items-center gap-2">
          <select
            className="bg-panel border border-border rounded px-2 py-1 text-xs"
            value={range}
            onChange={(e) => setRange(e.target.value as 'today' | 'week')}
          >
            <option value="today">Today</option>
            <option value="week">This week</option>
          </select>
          <button onClick={load} className="text-xs text-inkMuted hover:text-ink">
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </header>
      {error && <div className="p-3 text-xs text-danger">{error}</div>}
      <ul className="flex-1 overflow-auto p-2 flex flex-col gap-1">
        {entries.map((e) => {
          const editing = editingId === e.id;
          return (
            <li
              key={e.id}
              className="px-3 py-2 rounded bg-panel border border-border"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">
                    {e.taskName || '(untracked)'}
                  </div>
                  <div className="text-xs text-inkMuted">
                    {fmtTime(e.start)} → {e.end ? fmtTime(e.end) : 'running'} ·{' '}
                    {fmtDuration(e.duration)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingId(editing ? null : e.id)}
                    className="px-2 py-0.5 text-xs rounded border border-border hover:bg-panelHi"
                  >
                    {editing ? 'Close' : 'Edit'}
                  </button>
                  <button
                    onClick={() => remove(e.id)}
                    className="px-2 py-0.5 text-xs rounded border border-danger/40 text-danger hover:bg-danger/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {editing && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-xs text-inkMuted col-span-2">
                    Description
                    <input
                      className="w-full bg-bg border border-border rounded px-2 py-1 mt-0.5 text-sm"
                      defaultValue={e.description}
                      onBlur={(ev) => {
                        if (ev.target.value !== e.description) save(e, { description: ev.target.value });
                      }}
                    />
                  </label>
                  <label className="text-xs text-inkMuted">
                    Start
                    <input
                      type="datetime-local"
                      className="w-full bg-bg border border-border rounded px-2 py-1 mt-0.5 text-sm"
                      defaultValue={toLocalInput(e.start)}
                      onBlur={(ev) => {
                        const v = fromLocalInput(ev.target.value);
                        if (v !== e.start) save(e, { start: v, duration: (e.end || Date.now()) - v });
                      }}
                    />
                  </label>
                  <label className="text-xs text-inkMuted">
                    End
                    <input
                      type="datetime-local"
                      className="w-full bg-bg border border-border rounded px-2 py-1 mt-0.5 text-sm"
                      defaultValue={toLocalInput(e.end)}
                      onBlur={(ev) => {
                        if (!ev.target.value) return;
                        const v = fromLocalInput(ev.target.value);
                        if (v !== e.end) save(e, { end: v, duration: v - e.start });
                      }}
                    />
                  </label>
                </div>
              )}
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
