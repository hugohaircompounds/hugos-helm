import type { CalendarEvent } from '../../shared/types';

interface Props {
  events: CalendarEvent[];
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
}

function formatWhen(e: CalendarEvent): string {
  if (e.allDay) return new Date(e.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · All day';
  const s = new Date(e.start);
  const t = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const d = s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${d} · ${t}`;
}

function dayKey(ts: number, allDay: boolean): string {
  const d = new Date(ts);
  if (allDay) d.setHours(12, 0, 0, 0); // guard against TZ edge cases
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function CalendarFeed({ events, error, loading, onRefresh }: Props) {
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = dayKey(e.start, e.allDay);
    const arr = groups.get(k) || [];
    arr.push(e);
    groups.set(k, arr);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-10 flex items-center justify-between px-3 border-b border-border">
        <h2 className="text-xs uppercase tracking-wider text-inkMuted">Calendar</h2>
        <button onClick={onRefresh} className="text-xs text-inkMuted hover:text-ink">
          {loading ? '…' : 'Refresh'}
        </button>
      </header>
      {error && <div className="p-3 text-xs text-danger">{error}</div>}
      <div className="flex-1 overflow-auto p-2 flex flex-col gap-3">
        {Array.from(groups.entries()).map(([day, items]) => (
          <section key={day}>
            <h3 className="text-xs text-inkMuted px-1 mb-1">{day}</h3>
            <ul className="flex flex-col gap-1">
              {items.map((e) => (
                <li
                  key={e.id + e.calendarId}
                  onClick={() => window.helm.openExternal(e.htmlLink)}
                  className="flex gap-2 px-2 py-1.5 rounded bg-panel border border-border hover:bg-panelHi cursor-pointer"
                >
                  <span
                    className="w-1 rounded-sm"
                    style={{ background: e.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{e.title}</div>
                    <div className="text-xs text-inkMuted truncate">{formatWhen(e)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!loading && events.length === 0 && !error && (
          <div className="text-inkMuted text-xs p-3">No upcoming events.</div>
        )}
      </div>
    </div>
  );
}
