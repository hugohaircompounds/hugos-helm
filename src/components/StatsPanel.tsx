import { useMemo, useState } from 'react';
import type { Task, TimeEntry } from '../../shared/types';
import { fmtDuration, startOfDay } from '../utils/time';

interface Props {
  entries: TimeEntry[];
  tasks: Task[];
}

type View = 'status' | 'list' | 'task';

interface Row {
  label: string;
  ms: number;
  color: string | null;
  // Per-day breakdown, length 7, indexed Mon=0 ... Sun=6. Local-time aligned.
  perDay: number[];
}

const TOP_TASKS = 12;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Mon=0 .. Sun=6 — JS getDay() is Sun=0 so we shift.
function dayOfWeek(ts: number): number {
  return (new Date(ts).getDay() + 6) % 7;
}

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

    const dur = e.duration || 0;
    const day = dayOfWeek(e.start);
    const existing = map.get(key);
    if (existing) {
      existing.ms += dur;
      existing.perDay[day] += dur;
    } else {
      const perDay = [0, 0, 0, 0, 0, 0, 0];
      perDay[day] = dur;
      map.set(key, { label, ms: dur, color, perDay });
    }
  }

  const list = Array.from(map.values()).sort((a, b) => b.ms - a.ms);
  return view === 'task' ? list.slice(0, TOP_TASKS) : list;
}

function DayBreakdown({ row }: { row: Row }) {
  const max = Math.max(...row.perDay, 1);
  // Compute today's day-of-week for highlighting context.
  const todayDow = dayOfWeek(startOfDay(Date.now()));
  return (
    <div className="absolute right-0 top-full mt-1 z-20 w-72 bg-panel border border-border rounded shadow-lg p-3 pointer-events-none">
      <div className="text-xs uppercase tracking-wider text-inkMuted mb-2 truncate">
        {row.label} · day breakdown
      </div>
      <div className="flex flex-col gap-1">
        {DAY_LABELS.map((d, i) => {
          const ms = row.perDay[i];
          const pct = max > 0 ? (ms / max) * 100 : 0;
          const isToday = i === todayDow;
          return (
            <div key={d} className="flex items-center gap-2 text-xs">
              <div
                className={`w-8 text-right ${
                  isToday ? 'text-ink font-medium' : 'text-inkMuted'
                }`}
              >
                {d}
              </div>
              <div className="flex-1 h-3 bg-bg border border-border rounded overflow-hidden relative">
                {ms > 0 && (
                  <div
                    className="h-full"
                    style={{
                      width: `${pct}%`,
                      background: row.color || 'rgb(var(--accent) / 0.6)',
                    }}
                  />
                )}
              </div>
              <div
                className={`w-14 text-right font-mono ${
                  ms > 0 ? 'text-ink/80' : 'text-inkMuted/50'
                }`}
              >
                {fmtDuration(ms)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bar({
  row,
  max,
  hovered,
  onHoverStart,
  onHoverEnd,
}: {
  row: Row;
  max: number;
  hovered: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const pct = max > 0 ? (row.ms / max) * 100 : 0;
  return (
    <div
      className="relative flex items-center gap-3"
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
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
      {hovered && <DayBreakdown row={row} />}
    </div>
  );
}

export function StatsPanel({ entries, tasks }: Props) {
  const [view, setView] = useState<View>('task');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

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
          rows.map((r) => (
            <Bar
              key={r.label}
              row={r}
              max={max}
              hovered={hoveredKey === r.label}
              onHoverStart={() => setHoveredKey(r.label)}
              onHoverEnd={() => setHoveredKey((k) => (k === r.label ? null : k))}
            />
          ))
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
