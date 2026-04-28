import { useEffect, useMemo, useRef, useState } from 'react';
import type { DescriptionPromptPayload, IdleTruncatePromptPayload } from '../shared/types';
import { useClickUp } from './hooks/useClickUp';
import { useTimer } from './hooks/useTimer';
import { useCalendar } from './hooks/useCalendar';
import { useEmail } from './hooks/useEmail';
import { useLayout } from './hooks/useLayout';
import { useTheme } from './hooks/useTheme';
import { useTimeEntries, type TimesheetRange } from './hooks/useTimeEntries';
import { TimerBar } from './components/TimerBar';
import { ThemePicker } from './components/ThemePicker';
import { ModeToggle } from './components/ModeToggle';
import { TaskList } from './components/TaskList';
import { TaskDetail } from './components/TaskDetail';
import { CalendarFeed } from './components/CalendarFeed';
import { EmailFeed } from './components/EmailFeed';
import { TimesheetEditor } from './components/TimesheetEditor';
import { TimeEntryDetail } from './components/TimeEntryDetail';
import { NewTimeEntryForm } from './components/NewTimeEntryForm';
import { DescriptionPrompt } from './components/DescriptionPrompt';
import { IdleTruncatePrompt } from './components/IdleTruncatePrompt';
import { Settings } from './components/Settings';
import { StatsPanel } from './components/StatsPanel';
import { ResizableColumns } from './components/ResizableColumns';
import { isRunningId, mergeRunningEntry, runningIdFor } from './utils/runningEntry';
import { startOfToday } from './utils/time';

type Tab = 'tasks' | 'timesheet' | 'stats' | 'settings';

export default function App() {
  const { tasks, refresh: refreshTasks, loading: tasksLoading, error: tasksError } = useClickUp();
  const { state: timer, elapsedMs, start, stop } = useTimer();
  const calendar = useCalendar();
  const email = useEmail();
  const { layout, update: updateLayout } = useLayout();
  const { themeId, themeMode, lexicon, setThemeId, toggleMode } = useTheme();

  const [tab, setTab] = useState<Tab>('tasks');
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [timesheetRange, setTimesheetRange] = useState<TimesheetRange>('today');
  // Single weekly fetch serves both the timesheet panel and the TaskList
  // badge. Range switching happens entirely in the renderer (filter below)
  // so the user never sees a flash of stale data while waiting for an API
  // roundtrip. Also halves API calls (was: weekly + range-driven duo).
  const allEntries = useTimeEntries('week');
  const [prompt, setPrompt] = useState<DescriptionPromptPayload | null>(null);
  const [idlePrompt, setIdlePrompt] = useState<IdleTruncatePromptPayload | null>(null);
  // Manual time-entry creation mode. When true, the middle column shows the
  // NewTimeEntryForm in place of TimeEntryDetail.
  const [creatingEntry, setCreatingEntry] = useState(false);
  const [badgeRange, setBadgeRange] = useState<'today' | 'week'>('week');
  const [workHoursStart, setWorkHoursStart] = useState<number>(8 * 60);
  const [workHoursEnd, setWorkHoursEnd] = useState<number>(17 * 60);

  // Load app-level settings once. TaskList loads its own scoped settings;
  // these are settings the rest of the UI (TimelineBar gap stripes) needs.
  useEffect(() => {
    window.helm
      .getSettings()
      .then((s) => {
        if (typeof s.workHoursStart === 'number') setWorkHoursStart(s.workHoursStart);
        if (typeof s.workHoursEnd === 'number') setWorkHoursEnd(s.workHoursEnd);
      })
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  // Filter the weekly entries down to today when the timesheet panel asks
  // for "today". Pure renderer-side — no fetch, instant switch.
  const timesheetEntries = useMemo(() => {
    if (timesheetRange === 'today') {
      const cutoff = startOfToday();
      return allEntries.entries.filter((e) => e.start >= cutoff);
    }
    return allEntries.entries;
  }, [allEntries.entries, timesheetRange]);

  // Merge the synthetic running entry into the timesheet so the active timer
  // shows up in the list and on the TimelineBar. Recomputes each render so the
  // synthetic duration tracks with useTimer's tick.
  const mergedEntries = useMemo(
    () => mergeRunningEntry(timesheetEntries, timer, Date.now()),
    // elapsedMs intentionally drives the recompute so the duration ticks live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timesheetEntries, timer, elapsedMs]
  );

  // Per-task time totals for the TaskList badge. Always builds off the weekly
  // entry set so the totals are stable across timesheet-range changes; the
  // synthetic running entry is merged in so the badge ticks live. Each
  // entry's duration is credited to its task AND every ancestor via
  // Task.parentId, so a parent task in the list rolls up the time logged
  // on its subtasks.
  const taskTotals = useMemo(() => {
    const cutoff = badgeRange === 'today' ? startOfToday() : 0;
    const merged = mergeRunningEntry(allEntries.entries, timer, Date.now());
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const map = new Map<string, number>();
    for (const e of merged) {
      if (!e.taskId) continue;
      if (e.start < cutoff) continue;
      const dur = e.duration || 0;
      let cursor: string | null = e.taskId;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        map.set(cursor, (map.get(cursor) || 0) + dur);
        cursor = taskById.get(cursor)?.parentId || null;
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEntries.entries, timer, elapsedMs, badgeRange, tasks]);

  const selectedEntry = selectedEntryId
    ? mergedEntries.find((e) => e.id === selectedEntryId) || null
    : null;

  // When the timer stops, reload entries so ClickUp's just-persisted real
  // entry replaces the synthetic. If the user was viewing the synthetic,
  // capture the running task so we can re-select the real entry once it
  // appears in the next entries refresh.
  const prevRunning = useRef(timer.running);
  const pendingReselectTaskId = useRef<string | null>(null);
  useEffect(() => {
    if (prevRunning.current && !timer.running) {
      if (selectedEntryId && isRunningId(selectedEntryId)) {
        pendingReselectTaskId.current =
          selectedEntryId.slice(runningIdFor('').length) || null;
      }
      allEntries.load();
    }
    prevRunning.current = timer.running;
  }, [timer.running, selectedEntryId, allEntries]);

  // After a stop-driven reload, find the matching real entry by taskId and
  // select it so the user keeps viewing what they were just working on.
  useEffect(() => {
    if (!pendingReselectTaskId.current) return;
    const target = allEntries.entries.find(
      (e) => e.taskId === pendingReselectTaskId.current
    );
    if (target) {
      setSelectedEntryId(target.id);
      pendingReselectTaskId.current = null;
    }
  }, [allEntries.entries]);

  useEffect(() => {
    return window.helm.onDescriptionPrompt(setPrompt);
  }, []);

  useEffect(() => {
    return window.helm.onIdleTruncatePrompt(setIdlePrompt);
  }, []);

  // Auto-focus signal that bumps when the EOD scheduler tells us to focus the
  // running entry's description. Bumping a counter (instead of a boolean) lets
  // the same effect re-fire if EOD somehow triggers twice in one session.
  const [eodFocusTick, setEodFocusTick] = useState(0);
  useEffect(() => {
    return window.helm.onEodFocusEntry((payload) => {
      if (!payload.taskId) return;
      setTab('timesheet');
      setSelectedEntryId(runningIdFor(payload.taskId));
      setEodFocusTick((n) => n + 1);
    });
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-bg text-ink">
      <TimerBar state={timer} elapsedMs={elapsedMs} onStop={() => stop()} lexicon={lexicon} />

      <nav data-slot="nav" className="h-10 flex items-center gap-1 px-2 border-b border-border">
        {(['tasks', 'timesheet', 'stats', 'settings'] as Tab[]).map((t) => (
          <button
            key={t}
            data-slot="nav-tab"
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-sm rounded ${
              tab === t ? 'bg-panelHi text-ink' : 'text-inkMuted hover:text-ink'
            }`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pr-2">
          <span className="text-xs text-inkMuted">
            {tasksLoading ? 'syncing…' : tasksError ? <span className="text-danger">{tasksError}</span> : ''}
          </span>
          <ThemePicker themeId={themeId} onChange={setThemeId} />
          <ModeToggle mode={themeMode} onToggle={toggleMode} />
        </div>
      </nav>

      <ResizableColumns
        leftPct={layout.leftPct}
        midPct={layout.midPct}
        onChange={updateLayout}
        left={
          <section data-slot="panel" className="h-full overflow-auto">
            {tab === 'tasks' && (
              <TaskList
                tasks={tasks}
                timer={timer}
                selectedId={selected}
                onSelect={setSelected}
                onStart={(id) => start(id)}
                onStop={() => stop()}
                lexicon={lexicon}
                taskTotals={taskTotals}
                badgeRange={badgeRange}
                onBadgeRangeChange={setBadgeRange}
              />
            )}
            {tab === 'timesheet' && (
              <TimesheetEditor
                entries={mergedEntries}
                loading={allEntries.loading}
                error={allEntries.error}
                range={timesheetRange}
                onRangeChange={setTimesheetRange}
                onRefresh={allEntries.load}
                selectedEntryId={selectedEntryId}
                onSelectEntry={(id) => {
                  setSelectedEntryId(id);
                  setCreatingEntry(false);
                }}
                onNewEntry={() => {
                  setSelectedEntryId(null);
                  setCreatingEntry(true);
                }}
                workHoursStart={workHoursStart}
                workHoursEnd={workHoursEnd}
              />
            )}
            {tab === 'stats' && <StatsPanel entries={allEntries.entries} tasks={tasks} />}
            {tab === 'settings' && <Settings tasks={tasks} onChanged={refreshTasks} />}
          </section>
        }
        middle={
          <section data-slot="panel" className="h-full overflow-auto">
            {tab === 'tasks' && (
              <TaskDetail
                taskId={selected}
                initialTask={tasks.find((t) => t.id === selected) || null}
                onUpdated={refreshTasks}
                lexicon={lexicon}
              />
            )}
            {tab === 'timesheet' && creatingEntry && (
              <NewTimeEntryForm
                tasks={tasks}
                defaultTaskId={timer.taskId}
                onCreate={allEntries.create}
                onClose={() => setCreatingEntry(false)}
              />
            )}
            {tab === 'timesheet' && !creatingEntry && (
              <TimeEntryDetail
                entry={selectedEntry}
                onSave={allEntries.save}
                onDelete={allEntries.remove}
                onClose={() => setSelectedEntryId(null)}
                focusDescriptionTick={eodFocusTick}
              />
            )}
            {tab === 'stats' && (
              <div className="p-4 text-inkMuted text-sm">
                Pick a view above. Bars are stacked left-to-right by total time this week.
              </div>
            )}
            {tab === 'settings' && (
              <div className="p-4 text-inkMuted text-sm">Settings saved automatically.</div>
            )}
          </section>
        }
        right={
          <aside data-slot="panel" className="flex flex-col h-full min-h-0">
            <div className="h-1/2 border-b border-border min-h-0">
              <CalendarFeed
                events={calendar.events}
                error={calendar.error}
                loading={calendar.loading}
                onRefresh={calendar.refresh}
              />
            </div>
            <div className="h-1/2 min-h-0">
              <EmailFeed
                emails={email.emails}
                error={email.error}
                loading={email.loading}
                onRefresh={email.refresh}
              />
            </div>
          </aside>
        }
      />

      <DescriptionPrompt payload={prompt} onClose={() => setPrompt(null)} />
      <IdleTruncatePrompt payload={idlePrompt} onClose={() => setIdlePrompt(null)} />
    </div>
  );
}
