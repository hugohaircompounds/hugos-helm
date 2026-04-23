import { useMemo } from 'react';
import type { Priority, Task, ThemeLexicon, TimerState } from '../../shared/types';

interface Props {
  tasks: Task[];
  timer: TimerState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onStop: () => void;
  lexicon: ThemeLexicon;
}

const PRIORITY_LABEL: Record<number, string> = {
  1: 'Urgent',
  2: 'High',
  3: 'Normal',
  4: 'Low',
};

function priorityKey(p: Priority): string | undefined {
  if (p === 1) return 'urgent';
  if (p === 2) return 'high';
  if (p === 3) return 'normal';
  if (p === 4) return 'low';
  return undefined;
}

function dueUrgency(due: number): 'overdue' | 'soon' | undefined {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfTomorrow = startOfToday + 2 * 24 * 60 * 60 * 1000;
  if (due < startOfToday) return 'overdue';
  if (due < endOfTomorrow) return 'soon';
  return undefined;
}

export function TaskList({ tasks, timer, selectedId, onSelect, onStart, onStop, lexicon }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<string, { color: string | null; tasks: Task[] }>();
    for (const t of tasks) {
      const key = t.status || 'open';
      const g = map.get(key) || { color: t.statusColor, tasks: [] };
      g.tasks.push(t);
      map.set(key, g);
    }
    return Array.from(map.entries());
  }, [tasks]);

  const total = tasks.length;
  const active = tasks.filter((t) => timer.running && timer.taskId === t.id).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div data-slot="panel-header">
        <span className="title">{lexicon.taskListTitle}</span>
        <span className="count">
          <strong>{total}</strong> {lexicon.tasksNoun}
          {active > 0 && (
            <>
              {' · '}
              <strong>{active}</strong> active
            </>
          )}
        </span>
      </div>

      {tasks.length === 0 ? (
        <div className="p-8 text-inkMuted text-center">
          No tasks assigned. Configure your ClickUp token in Settings.
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4 overflow-auto">
          {grouped.map(([status, { color, tasks: list }]) => (
            <section key={status}>
              <header className="flex items-center gap-2 mb-2 px-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: color || '#8b93a7' }}
                />
                <h2 className="text-xs uppercase tracking-wider text-inkMuted">
                  {status} <span className="text-inkMuted/60">· {list.length}</span>
                </h2>
              </header>
              <ul className="flex flex-col gap-1">
                {list.map((t) => {
                  const running = timer.running && timer.taskId === t.id;
                  const selected = selectedId === t.id;
                  const prioKey = priorityKey(t.priority);
                  return (
                    <li
                      key={t.id}
                      onClick={() => onSelect(t.id)}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded cursor-pointer border ${
                        selected
                          ? 'bg-panelHi border-accent/50'
                          : 'bg-panel border-transparent hover:bg-panelHi'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{t.name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {t.priority && (
                            <span data-slot="task-pill" data-priority={prioKey}>
                              {PRIORITY_LABEL[t.priority]}
                            </span>
                          )}
                          {t.listName && (
                            <span data-slot="task-pill" data-kind="list">
                              {t.listName}
                            </span>
                          )}
                          {t.dueDate && (
                            <span
                              data-slot="task-pill"
                              data-kind="due"
                              data-urgency={dueUrgency(t.dueDate)}
                            >
                              Due {new Date(t.dueDate).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (running) onStop();
                          else onStart(t.id);
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium border ${
                          running
                            ? 'bg-danger/20 text-danger border-danger/40'
                            : 'bg-success/10 text-success border-success/30 hover:bg-success/20'
                        }`}
                      >
                        {running ? lexicon.stopVerb : lexicon.startVerb}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
