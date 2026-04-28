import { useEffect, useMemo, useState } from 'react';
import type { TimeEntry } from '../../shared/types';
import { fmtTime, minuteOfDay, startOfToday } from '../utils/time';
import { colorForTaskId, hueForTaskId } from '../utils/entryColor';

interface Props {
  entries: TimeEntry[];
  selectedEntryId: string | null;
  onSelect: (id: string) => void;
  // Local-day-aligned midnight (unix ms). Defaults to today's midnight so
  // existing call sites keep working. Pass an earlier dayStart to render a
  // past day's bar in the week view.
  dayStart?: number;
  // Local-time work-hour bounds in minutes from midnight. When provided,
  // diagonal stripes render across any minute inside [start, end) that no
  // entry covers — visible "you didn't track this slot" awareness. Omit to
  // disable.
  workHoursStart?: number;
  workHoursEnd?: number;
}

const DEFAULT_START_MIN = 8 * 60;   // 8:00
const DEFAULT_END_MIN = 17 * 60;    // 17:00
const LUNCH_START_MIN = 13 * 60;    // 13:00
const LUNCH_END_MIN = 14 * 60;      // 14:00
const MIN_SEGMENT_PX_FOR_LABEL = 80;
const RUNNING_TICK_MS = 30_000;

interface ResolvedEntry {
  entry: TimeEntry;
  startMin: number;
  endMin: number;
  running: boolean;
}

// Build per-entry projections onto a single day's minute axis. Entries that
// started before midnight or ended after midnight are clamped to 0 / 24h so we
// never render off-day fragments twice. `dayStart` is the local-midnight unix
// ms anchor for whichever day this bar represents.
function resolveDay(
  entries: TimeEntry[],
  now: number,
  dayStart: number
): ResolvedEntry[] {
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  return entries
    .map<ResolvedEntry | null>((e) => {
      if (e.start >= dayEnd) return null;
      const running = e.end === null;
      const endTs = running ? now : (e.end as number);
      if (endTs <= dayStart) return null;
      const clampedStart = Math.max(e.start, dayStart);
      const clampedEnd = Math.min(endTs, dayEnd);
      return {
        entry: e,
        startMin: minuteOfDay(clampedStart),
        endMin:
          clampedEnd >= dayEnd
            ? 24 * 60
            : minuteOfDay(clampedEnd) || 24 * 60,
        running,
      };
    })
    .filter((x): x is ResolvedEntry => x !== null);
}

function computeRange(resolved: ResolvedEntry[]): { startMin: number; endMin: number } {
  if (resolved.length === 0) {
    return { startMin: DEFAULT_START_MIN, endMin: DEFAULT_END_MIN };
  }
  const earliest = Math.min(...resolved.map((r) => r.startMin));
  const latest = Math.max(...resolved.map((r) => r.endMin));
  return {
    startMin: Math.min(DEFAULT_START_MIN, earliest),
    endMin: Math.max(DEFAULT_END_MIN, latest),
  };
}

interface Overlap {
  a: ResolvedEntry;
  b: ResolvedEntry;
  startMin: number;
  endMin: number;
}

// Detect pairs of overlapping entries and compute the overlap span. This runs
// on a sorted copy so it's O(n log n) sort + O(n^2) pairs in the worst case —
// fine for the few dozen entries a real day generates.
function findOverlaps(resolved: ResolvedEntry[]): Overlap[] {
  const sorted = [...resolved].sort((a, b) => a.startMin - b.startMin);
  const out: Overlap[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (b.startMin >= a.endMin) break;
      out.push({
        a,
        b,
        startMin: Math.max(a.startMin, b.startMin),
        endMin: Math.min(a.endMin, b.endMin),
      });
    }
  }
  return out;
}

// Find work-hour minute spans that no entry covers. Bounded by `upperBound`
// so today's bar doesn't paint stripes across the future.
function findGaps(
  resolved: ResolvedEntry[],
  workStart: number,
  workEnd: number,
  upperBound: number
): { start: number; end: number }[] {
  const cap = Math.min(workEnd, upperBound);
  if (cap <= workStart) return [];
  const sorted = [...resolved].sort((a, b) => a.startMin - b.startMin);
  const gaps: { start: number; end: number }[] = [];
  let cursor = workStart;
  for (const r of sorted) {
    const segStart = Math.max(r.startMin, workStart);
    const segEnd = Math.min(r.endMin, cap);
    if (segEnd <= cursor) continue;
    if (segStart > cursor) gaps.push({ start: cursor, end: segStart });
    cursor = Math.max(cursor, segEnd);
  }
  if (cursor < cap) gaps.push({ start: cursor, end: cap });
  return gaps;
}

function hourMark(min: number): string {
  const h = Math.floor(min / 60) % 24;
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

export function TimelineBar({
  entries,
  selectedEntryId,
  onSelect,
  dayStart,
  workHoursStart,
  workHoursEnd,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const hasRunning = useMemo(() => entries.some((e) => e.end === null), [entries]);
  const anchor = dayStart ?? startOfToday();
  const isToday = anchor === startOfToday();

  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => setNow(Date.now()), RUNNING_TICK_MS);
    return () => clearInterval(id);
  }, [hasRunning]);

  const resolved = useMemo(
    () => resolveDay(entries, now, anchor),
    [entries, now, anchor]
  );
  const { startMin, endMin } = useMemo(() => computeRange(resolved), [resolved]);
  const overlaps = useMemo(() => findOverlaps(resolved), [resolved]);
  const totalMin = Math.max(1, endMin - startMin);

  // Untracked-gap stripes: compute spans inside [workHoursStart, workHoursEnd)
  // that no entry covers. For today, clamp upper bound to "now" so we don't
  // paint over the future. For past days, the whole work-hour range is past.
  const gaps = useMemo(() => {
    if (workHoursStart === undefined || workHoursEnd === undefined) return [];
    const upperBound = isToday ? minuteOfDay(now) : 24 * 60;
    return findGaps(resolved, workHoursStart, workHoursEnd, upperBound);
  }, [resolved, workHoursStart, workHoursEnd, isToday, now]);

  const pct = (m: number) => ((m - startMin) / totalMin) * 100;

  // Hour tick marks. Build at each whole hour in range (inclusive of endMin).
  const ticks: number[] = [];
  const firstHour = Math.ceil(startMin / 60) * 60;
  for (let m = firstHour; m <= endMin; m += 60) ticks.push(m);

  const lunchVisible = LUNCH_END_MIN > startMin && LUNCH_START_MIN < endMin;

  return (
    <div className="px-3 py-3 border-b border-border flex-shrink-0">
      <div className="relative h-16 bg-panel rounded border border-border overflow-hidden">
        {/* Hour ticks + labels */}
        {ticks.map((m) => (
          <div
            key={m}
            className="absolute top-0 h-full border-l border-border/60 pointer-events-none"
            style={{ left: `${pct(m)}%` }}
          >
            <span className="absolute top-0.5 left-1 text-[9px] text-inkMuted/70 uppercase">
              {hourMark(m)}
            </span>
          </div>
        ))}

        {/* Lunch ghost band */}
        {lunchVisible && (
          <div
            className="absolute top-0 h-full pointer-events-none"
            style={{
              left: `${pct(Math.max(LUNCH_START_MIN, startMin))}%`,
              width: `${
                pct(Math.min(LUNCH_END_MIN, endMin)) -
                pct(Math.max(LUNCH_START_MIN, startMin))
              }%`,
              background: 'rgb(var(--ink-muted) / 0.08)',
            }}
          >
            <span className="absolute bottom-0.5 right-1 text-[9px] text-inkMuted/70 uppercase tracking-wider">
              Lunch
            </span>
          </div>
        )}

        {/* Untracked-gap stripes — rendered behind entry segments and lunch band */}
        {gaps.map((g, i) => {
          const left = pct(Math.max(g.start, startMin));
          const right = pct(Math.min(g.end, endMin));
          const width = right - left;
          if (width <= 0) return null;
          return (
            <div
              key={`gap-${i}`}
              className="absolute bottom-2 h-8 pointer-events-none"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background:
                  'repeating-linear-gradient(45deg, transparent 0 6px, rgb(var(--ink-muted) / 0.18) 6px 8px)',
                borderRadius: 3,
              }}
              title="Untracked time during work hours"
            />
          );
        })}

        {/* Entry segments */}
        {resolved.map((r) => {
          const left = pct(r.startMin);
          const width = pct(r.endMin) - left;
          const color = colorForTaskId(r.entry.taskId);
          const selected = selectedEntryId === r.entry.id;
          const widthPxApprox = (width / 100) * 500; // heuristic — ~500px bar on a 1024+ panel
          const showTitle = widthPxApprox >= MIN_SEGMENT_PX_FOR_LABEL;
          return (
            <button
              key={r.entry.id}
              onClick={() => onSelect(r.entry.id)}
              title={`${r.entry.taskName || '(untracked)'}\n${fmtTime(r.entry.start)} → ${
                r.entry.end ? fmtTime(r.entry.end) : 'running'
              }`}
              className={`absolute bottom-2 h-8 text-left overflow-hidden transition-all ${
                selected ? 'ring-2 ring-accent z-10' : 'hover:brightness-110'
              } ${r.running ? 'animate-pulse' : ''}`}
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: color.bg,
                border: `1px solid ${color.border}`,
                borderRadius: 3,
              }}
            >
              {showTitle && (
                <span className="px-1.5 text-[10px] text-white font-medium drop-shadow truncate block leading-8">
                  {r.entry.taskName || '(untracked)'}
                </span>
              )}
            </button>
          );
        })}

        {/* Overlap strips — render on top of normal segments with diagonal stripes */}
        {overlaps.map((o, i) => {
          const left = pct(o.startMin);
          const width = pct(o.endMin) - left;
          const ca = colorForTaskId(o.a.entry.taskId);
          const hueA = o.a.entry.taskId ? hueForTaskId(o.a.entry.taskId) : 0;
          const hueB = o.b.entry.taskId ? hueForTaskId(o.b.entry.taskId) : 180;
          const stripeA = `hsl(${hueA} var(--entry-sat) var(--entry-light))`;
          const stripeB = `hsl(${hueB} var(--entry-sat) var(--entry-light))`;
          return (
            <div
              key={`overlap-${i}`}
              title={`Overlap: ${o.a.entry.taskName || '(untracked)'} / ${
                o.b.entry.taskName || '(untracked)'
              }`}
              className="absolute bottom-2 h-8 pointer-events-none"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: `repeating-linear-gradient(45deg, ${stripeA} 0 8px, ${stripeB} 8px 16px)`,
                border: `1px solid ${ca.border}`,
                borderRadius: 3,
                opacity: 0.95,
              }}
            />
          );
        })}

        {/* Start/end labels on each segment (rendered outside the button so
            they don't get clipped when the segment is narrow) */}
        {resolved.map((r) => {
          const left = pct(r.startMin);
          const right = pct(r.endMin);
          return (
            <div key={`labels-${r.entry.id}`} className="pointer-events-none">
              <span
                className="absolute top-6 text-[9px] text-inkMuted/80 font-mono"
                style={{ left: `calc(${left}% + 2px)` }}
              >
                {fmtTime(r.entry.start)}
              </span>
              {r.entry.end && (
                <span
                  className="absolute top-6 text-[9px] text-inkMuted/80 font-mono"
                  style={{ left: `calc(${right}% - 34px)` }}
                >
                  {fmtTime(r.entry.end)}
                </span>
              )}
            </div>
          );
        })}

        {resolved.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-inkMuted/50 uppercase tracking-wider">
            No entries tracked today
          </div>
        )}
      </div>
    </div>
  );
}
