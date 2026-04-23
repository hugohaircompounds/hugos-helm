import { useEffect, useState } from 'react';
import type { DescriptionPromptPayload } from '../shared/types';
import { useClickUp } from './hooks/useClickUp';
import { useTimer } from './hooks/useTimer';
import { useCalendar } from './hooks/useCalendar';
import { useEmail } from './hooks/useEmail';
import { useLayout } from './hooks/useLayout';
import { useTheme } from './hooks/useTheme';
import { TimerBar } from './components/TimerBar';
import { ThemePicker } from './components/ThemePicker';
import { ModeToggle } from './components/ModeToggle';
import { TaskList } from './components/TaskList';
import { TaskDetail } from './components/TaskDetail';
import { CalendarFeed } from './components/CalendarFeed';
import { EmailFeed } from './components/EmailFeed';
import { TimesheetEditor } from './components/TimesheetEditor';
import { DescriptionPrompt } from './components/DescriptionPrompt';
import { Settings } from './components/Settings';
import { ResizableColumns } from './components/ResizableColumns';

type Tab = 'tasks' | 'timesheet' | 'settings';

export default function App() {
  const { tasks, refresh: refreshTasks, loading: tasksLoading, error: tasksError } = useClickUp();
  const { state: timer, elapsedMs, start, stop } = useTimer();
  const calendar = useCalendar();
  const email = useEmail();
  const { layout, update: updateLayout } = useLayout();
  const { themeId, themeMode, lexicon, setThemeId, toggleMode } = useTheme();

  const [tab, setTab] = useState<Tab>('tasks');
  const [selected, setSelected] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<DescriptionPromptPayload | null>(null);

  useEffect(() => {
    return window.helm.onDescriptionPrompt(setPrompt);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-bg text-ink">
      <TimerBar state={timer} elapsedMs={elapsedMs} onStop={() => stop()} lexicon={lexicon} />

      <nav data-slot="nav" className="h-10 flex items-center gap-1 px-2 border-b border-border">
        {(['tasks', 'timesheet', 'settings'] as Tab[]).map((t) => (
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
              />
            )}
            {tab === 'timesheet' && <TimesheetEditor />}
            {tab === 'settings' && <Settings tasks={tasks} onChanged={refreshTasks} />}
          </section>
        }
        middle={
          <section data-slot="panel" className="h-full overflow-auto">
            {tab === 'tasks' ? (
              <TaskDetail
                taskId={selected}
                initialTask={tasks.find((t) => t.id === selected) || null}
                onUpdated={refreshTasks}
                lexicon={lexicon}
              />
            ) : (
              <div className="p-4 text-inkMuted text-sm">
                {tab === 'timesheet'
                  ? 'Click Edit on an entry to adjust it.'
                  : 'Settings saved automatically.'}
              </div>
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
    </div>
  );
}
