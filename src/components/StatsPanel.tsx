import { useMemo, useState } from 'react';
import type { Task, TimeEntry } from '../../shared/types';
import { fmtDuration } from '../utils/time';

interface Props {
  entries: TimeEntry[];
  tasks: Task[];
}

type View = 'status' | 'list' | 'task';

interface Row {
  label: string;
  ms: number;
  color: string | null;
}

const TOP_TASKS = 12;

function aggregate(entries: TimeEntry[], tasks: Task[], view: View): Row[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const map = new Map<string, Row>();

  for (const e of entries) {
    const task = e.taskId ? taskById.get(e.taskId) : undefined;
    let key: string;
    let label: string;
    let color: string | null = null;

    if (view === 'status') {
      key = task?.status || (e.taskId ? '(unknown status)' : 'Untracked');
      label = key;
      color = task?.statusColor || null;
    } else if (view === 'list') {
      key = task?.listName || (e.taskId ? '(unknown list)' : 'Untracked');
      label = key;
    } else {
      key = e.taskId || '__untracked__';
      label = task?.name || e.taskName || (e.taskId ? `(unknown task ${e.taskId})` : 'Untracked');
      color = task?.statusColor || null;
    }

    const existing = map.get(key);
    if (existing) {
      existing.ms += e.duration || 0;
    } else {
      map.set(key, { label, ms: e.duration || 0, color });
    }
  }

  const list = Array.from(map.values()).sort((a, b) => b.ms - a.ms);
  return view === 'task' ? list.slice(0, TOP_TASKS) : list;
}

function Bar({ row, max }: { row: Row; max: number }) {
  const pct = max > 0 ? (row.ms / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 text-sm text-ink truncate" title={row.label}>
        {row.label}
      </div>
      <div className="flex-1 h-5 bg-bg border border-border rounded overflow-hidden relative">
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            background: row.color || 'rgb(var(--accent) / 0.6)',
          }}
        />
      </div>
      <div className="w-20 text-right text-xs font-mono text-ink/80">
        {fmtDuration(row.ms)}
      </div>
    </div>
  );
}

export function StatsPanel({ entries, tasks }: Props) {
  const [view, setView] = useState<View>('task');

  const rows = useMemo(() => aggregate(entries, tasks, view), [entries, tasks, view]);
  const total = useMemo(
    () => entries.reduce((a, e) => a + (e.duration || 0), 0),
    [entries]
  );
  const max = rows.length > 0 ? rows[0].ms : 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="h-10 flex items-center justify-between px-3 border-b border-border flex-shrink-0">
        <h2 className="text-xs uppercase tracking-wider text-inkMuted">
          Stats · this week · {fmtDuration(total)}
        </h2>
        <div className="flex items-center gap-px">
          {(['task', 'status', 'list'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2 py-1 text-xs uppercase tracking-wider border ${
                view === v
                  ? 'bg-panelHi text-ink border-accent/40'
                  : 'bg-panel text-inkMuted/70 border-border hover:text-ink'
              } first:rounded-l last:rounded-r -ml-px first:ml-0`}
            >
              by {v}
            </button>
          ))}
        </div>
      </header>
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-2">
        {rows.length === 0 ? (
          <div className="text-inkMuted text-sm p-3 text-center">
            No time tracked this week yet.
          </div>
        ) : (
          rows.map((r) => <Bar key={r.label} row={r} max={max} />)
        )}
        {view === 'task' && rows.length === TOP_TASKS && (
          <div className="text-xs text-inkMuted text-center pt-2">
            Showing top {TOP_TASKS} tasks.
          </div>
        )}
      </div>
    </div>
  );
}
