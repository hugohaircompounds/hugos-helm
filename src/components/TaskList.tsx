import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Priority,
  Task,
  TaskFiltersState,
  ThemeLexicon,
  TimerState,
} from '../../shared/types';
import { dueUrgency, fmtDuration } from '../utils/time';
import { TaskFilterBar } from './TaskFilterBar';

interface Props {
  tasks: Task[];
  timer: TimerState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onStop: () => void;
  lexicon: ThemeLexicon;
  // Map of taskId → ms tracked over the current badge range. Empty/undefined
  // gracefully renders as "no badge". Computed in App.tsx from weekly entries.
  taskTotals?: Map<string, number>;
  badgeRange?: 'today' | 'week';
  onBadgeRangeChange?: (range: 'today' | 'week') => void;
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

// Single scope key for the cross-list default view. If later we split the UI
// per ClickUp list, the ordering can be re-keyed on listId.
const SCOPE = '__all__';
const PINNED_KEY = '__pinned__';
const SAVE_DEBOUNCE_MS = 400;

const EMPTY_FILTERS: TaskFiltersState = {
  statuses: [],
  listNames: [],
  priorities: [],
  dueFrom: null,
  dueTo: null,
};

function passesFilters(t: Task, f: TaskFiltersState): boolean {
  if (f.statuses.length && !f.statuses.includes(t.status || 'open')) return false;
  if (f.listNames.length && (!t.listName || !f.listNames.includes(t.listName))) return false;
  if (f.priorities.length && (!t.priority || !f.priorities.includes(t.priority))) return false;
  if (f.dueFrom !== null && (t.dueDate === null || t.dueDate < f.dueFrom)) return false;
  if (f.dueTo !== null && (t.dueDate === null || t.dueDate > f.dueTo)) return false;
  return true;
}

export function TaskList({
  tasks,
  timer,
  selectedId,
  onSelect,
  onStart,
  onStop,
  lexicon,
  taskTotals,
  badgeRange = 'week',
  onBadgeRangeChange,
}: Props) {
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [filters, setFilters] = useState<TaskFiltersState>(EMPTY_FILTERS);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted prefs once.
  useEffect(() => {
    window.helm
      .getSettings()
      .then((s) => {
        setGroupOrder(s.taskStatusGroupOrder?.[SCOPE] || []);
        setCollapsed(s.collapsedStatusGroups || []);
        setFilters({
          statuses: s.taskFilters?.statuses || [],
          listNames: s.taskFilters?.listNames || [],
          priorities: s.taskFilters?.priorities || [],
          dueFrom: s.taskFilters?.dueFrom ?? null,
          dueTo: s.taskFilters?.dueTo ?? null,
        });
        setPinnedIds(s.pinnedTaskIds || []);
      })
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  // Debounced save wrapper. Coalesces rapid reorders/collapses/pins into one write.
  const scheduleSave = useCallback(
    (patch: {
      order?: string[];
      collapsed?: string[];
      filters?: TaskFiltersState;
      pinned?: string[];
    }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const payload: Parameters<typeof window.helm.saveSettings>[0] = {};
        if (patch.order !== undefined) {
          payload.taskStatusGroupOrder = { [SCOPE]: patch.order };
        }
        if (patch.collapsed !== undefined) {
          payload.collapsedStatusGroups = patch.collapsed;
        }
        if (patch.filters !== undefined) {
          payload.taskFilters = patch.filters;
        }
        if (patch.pinned !== undefined) {
          payload.pinnedTaskIds = patch.pinned;
        }
        window.helm.saveSettings(payload).catch(() => {
          /* non-fatal */
        });
      }, SAVE_DEBOUNCE_MS);
    },
    []
  );

  const filtered = useMemo(() => tasks.filter((t) => passesFilters(t, filters)), [tasks, filters]);

  // Pinned tasks bubble to a synthetic group above all status groups. They're
  // filtered out of their normal status groups so the same task never renders
  // twice. Insertion order is preserved by walking pinnedIds in order.
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);

  const pinnedTasks = useMemo(() => {
    const byId = new Map(filtered.map((t) => [t.id, t]));
    const list: Task[] = [];
    for (const id of pinnedIds) {
      const t = byId.get(id);
      if (t) list.push(t);
    }
    return list;
  }, [filtered, pinnedIds]);

  const grouped = useMemo(() => {
    const map = new Map<string, { color: string | null; tasks: Task[] }>();
    for (const t of filtered) {
      if (pinnedSet.has(t.id)) continue;
      const key = t.status || 'open';
      const g = map.get(key) || { color: t.statusColor, tasks: [] };
      g.tasks.push(t);
      map.set(key, g);
    }
    const all = Array.from(map.entries());
    // Apply stored order. Unknown statuses (new ones or ones not yet
    // touched by the user) go after known ones in first-seen order.
    const knownSet = new Set(groupOrder);
    const known: typeof all = [];
    for (const s of groupOrder) {
      const hit = all.find(([k]) => k === s);
      if (hit) known.push(hit);
    }
    const unknown = all.filter(([k]) => !knownSet.has(k));
    return [...known, ...unknown];
  }, [filtered, groupOrder, pinnedSet]);

  const total = tasks.length;
  const filteredCount = filtered.length;
  const active = tasks.filter((t) => timer.running && timer.taskId === t.id).length;

  const moveGroup = useCallback(
    (status: string, direction: -1 | 1) => {
      // Resolve the current effective order (persisted + unknowns appended).
      const effective = grouped.map(([s]) => s);
      const idx = effective.indexOf(status);
      if (idx < 0) return;
      const swapWith = idx + direction;
      if (swapWith < 0 || swapWith >= effective.length) return;
      const next = [...effective];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      setGroupOrder(next);
      scheduleSave({ order: next });
    },
    [grouped, scheduleSave]
  );

  const toggleCollapsed = useCallback(
    (status: string) => {
      const isOpen = !collapsed.includes(status);
      const next = isOpen ? [...collapsed, status] : collapsed.filter((s) => s !== status);
      setCollapsed(next);
      scheduleSave({ collapsed: next });
    },
    [collapsed, scheduleSave]
  );

  const togglePinned = useCallback(
    (taskId: string) => {
      const isPinned = pinnedIds.includes(taskId);
      const next = isPinned
        ? pinnedIds.filter((id) => id !== taskId)
        : [...pinnedIds, taskId];
      setPinnedIds(next);
      scheduleSave({ pinned: next });
    },
    [pinnedIds, scheduleSave]
  );

  const applyFilters = useCallback(
    (next: TaskFiltersState) => {
      setFilters(next);
      scheduleSave({ filters: next });
    },
    [scheduleSave]
  );

  // Available values for filter chips (derived from the unfiltered task set
  // so you can re-widen a filter without first clearing it).
  const filterOptions = useMemo(() => {
    const statusSet = new Set<string>();
    const listSet = new Set<string>();
    for (const t of tasks) {
      statusSet.add(t.status || 'open');
      if (t.listName) listSet.add(t.listName);
    }
    return {
      statuses: Array.from(statusSet).sort(),
      listNames: Array.from(listSet).sort(),
    };
  }, [tasks]);

  const renderTaskRow = (t: Task) => {
    const running = timer.running && timer.taskId === t.id;
    const selected = selectedId === t.id;
    const prioKey = priorityKey(t.priority);
    const pinned = pinnedSet.has(t.id);
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
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePinned(t.id);
          }}
          title={pinned ? 'Unpin' : 'Pin to top'}
          className={`flex-shrink-0 text-base leading-none w-5 text-center ${
            pinned ? 'text-warn' : 'text-inkMuted/40 hover:text-inkMuted'
          }`}
          aria-label={pinned ? 'Unpin task' : 'Pin task'}
        >
          {pinned ? '★' : '☆'}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate">{t.name}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {(() => {
              const ms = taskTotals?.get(t.id);
              if (!ms || ms <= 0) return null;
              return (
                <span data-slot="task-pill" data-kind="duration">
                  {fmtDuration(ms)}
                </span>
              );
            })()}
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
  };

  const pinnedCollapsed = collapsed.includes(PINNED_KEY);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div data-slot="panel-header">
        <span className="title">{lexicon.taskListTitle}</span>
        <span className="count">
          <strong>{filteredCount}</strong>
          {filteredCount !== total && (
            <span className="text-inkMuted/80"> / {total}</span>
          )}{' '}
          {lexicon.tasksNoun}
          {active > 0 && (
            <>
              {' · '}
              <strong>{active}</strong> active
            </>
          )}
        </span>
        {onBadgeRangeChange && (
          <span
            className="ml-auto inline-flex items-center gap-px text-[10px] uppercase tracking-wider"
            title="Time-logged badge range"
          >
            {(['today', 'week'] as const).map((r) => (
              <button
                key={r}
                onClick={() => onBadgeRangeChange(r)}
                className={`px-1.5 py-0.5 border ${
                  badgeRange === r
                    ? 'bg-panelHi text-ink border-accent/40'
                    : 'bg-panel text-inkMuted/70 border-border hover:text-ink'
                } first:rounded-l last:rounded-r -ml-px first:ml-0`}
              >
                {r}
              </button>
            ))}
          </span>
        )}
      </div>

      <TaskFilterBar
        filters={filters}
        onChange={applyFilters}
        availableStatuses={filterOptions.statuses}
        availableListNames={filterOptions.listNames}
      />

      {tasks.length === 0 ? (
        <div className="p-8 text-inkMuted text-center">
          No tasks assigned. Configure your ClickUp token in Settings.
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-inkMuted text-center text-sm">
          No tasks match the current filters.
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4 overflow-auto">
          {pinnedTasks.length > 0 && (
            <section>
              <header className="flex items-center gap-2 mb-2 px-2">
                <button
                  onClick={() => toggleCollapsed(PINNED_KEY)}
                  className="text-inkMuted/60 hover:text-ink w-4 text-center text-xs leading-none"
                  title={pinnedCollapsed ? 'Expand' : 'Collapse'}
                >
                  {pinnedCollapsed ? '▸' : '▾'}
                </button>
                <span className="text-warn flex-shrink-0">★</span>
                <h2 className="text-xs uppercase tracking-wider text-inkMuted flex-1">
                  Pinned <span className="text-inkMuted/60">· {pinnedTasks.length}</span>
                </h2>
              </header>
              {!pinnedCollapsed && (
                <ul className="flex flex-col gap-1">{pinnedTasks.map(renderTaskRow)}</ul>
              )}
            </section>
          )}

          {grouped.map(([status, { color, tasks: list }], i) => {
            const isCollapsed = collapsed.includes(status);
            const atTop = i === 0;
            const atBottom = i === grouped.length - 1;
            return (
              <section key={status}>
                <header className="flex items-center gap-2 mb-2 px-2">
                  <button
                    onClick={() => toggleCollapsed(status)}
                    className="text-inkMuted/60 hover:text-ink w-4 text-center text-xs leading-none"
                    title={isCollapsed ? 'Expand' : 'Collapse'}
                  >
                    {isCollapsed ? '▸' : '▾'}
                  </button>
                  <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ background: color || '#8b93a7' }}
                  />
                  <h2 className="text-xs uppercase tracking-wider text-inkMuted flex-1">
                    {status} <span className="text-inkMuted/60">· {list.length}</span>
                  </h2>
                  <div className="flex items-center gap-0.5 text-xs text-inkMuted/60">
                    <button
                      onClick={() => moveGroup(status, -1)}
                      disabled={atTop}
                      className="w-5 h-5 leading-none hover:text-ink disabled:opacity-20 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveGroup(status, 1)}
                      disabled={atBottom}
                      className="w-5 h-5 leading-none hover:text-ink disabled:opacity-20 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>
                </header>
                {!isCollapsed && (
                  <ul className="flex flex-col gap-1">{list.map(renderTaskRow)}</ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
