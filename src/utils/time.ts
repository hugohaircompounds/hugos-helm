// Shared time/date helpers used across the renderer. Keep this module
// dependency-free and pure — no imports, no side effects — so it can be
// consumed from any component or hook.

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

// Local-day-aligned midnight for any timestamp. Used for grouping time entries
// by day in week view and as the dayStart anchor for per-day TimelineBars.
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Day header label for the week-view timesheet groups. Renders as e.g.
// "Tuesday, Apr 28". Uses the system locale.
export function fmtDayHeader(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function minuteOfDay(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

export type DueUrgency = 'overdue' | 'soon' | undefined;

export function dueUrgency(due: number): DueUrgency {
  const start = startOfToday();
  const endOfTomorrow = start + 2 * 24 * 60 * 60 * 1000;
  if (due < start) return 'overdue';
  if (due < endOfTomorrow) return 'soon';
  return undefined;
}

export function toLocalDatetimeInput(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalDatetimeInput(s: string): number {
  return new Date(s).getTime();
}
