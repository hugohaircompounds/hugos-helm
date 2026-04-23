import { useEffect, useState, type CSSProperties } from 'react';
import type {
  Priority,
  Task,
  TaskDetail as TaskDetailType,
  ThemeLexicon,
} from '../../shared/types';
import { useTaskDetailCache } from '../hooks/useTaskDetailCache';

interface Props {
  taskId: string | null;
  initialTask: Task | null;
  onUpdated: () => void;
  lexicon: ThemeLexicon;
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: null, label: 'None' },
  { value: 1, label: 'Urgent' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Low' },
];

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

function taskToDetailShell(t: Task): TaskDetailType {
  return { ...t, subtasks: [], comments: [] };
}

export function TaskDetail({ taskId, initialTask, onUpdated, lexicon }: Props) {
  const cache = useTaskDetailCache();
  const [detail, setDetail] = useState<TaskDetailType | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!taskId) {
      setDetail(null);
      return;
    }

    // Seed immediately from cache if we have it — zero-flicker navigation.
    const cached = cache.get(taskId);
    if (cached) {
      setDetail(cached);
    } else if (initialTask && initialTask.id === taskId) {
      // Otherwise paint from the list-row data we already have, then upgrade.
      setDetail(taskToDetailShell(initialTask));
    } else {
      setDetail(null);
    }

    let cancelled = false;
    setFetching(true);
    window.helm
      .getTask(taskId)
      .then((full) => {
        if (cancelled) return;
        cache.set(taskId, full);
        setDetail(full);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (!taskId) {
    return (
      <div className="p-8 text-inkMuted text-center">
        Select a task to see details.
      </div>
    );
  }

  if (error && !detail) return <div className="p-8 text-danger">{error}</div>;
  if (!detail) return <div className="p-8 text-inkMuted">Loading…</div>;

  async function save<K extends 'name' | 'description' | 'status' | 'priority' | 'dueDate'>(
    field: K,
    value: TaskDetailType[K]
  ) {
    if (!detail) return;
    setSaving(true);
    try {
      const patch = { [field]: value } as Partial<
        Pick<TaskDetailType, 'name' | 'description' | 'status' | 'priority' | 'dueDate'>
      >;
      const updated = await window.helm.updateTask(detail.id, patch);
      const next = { ...detail, ...updated };
      setDetail(next);
      cache.set(detail.id, next);
      onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const stillLoading = fetching && detail.comments.length === 0 && detail.subtasks.length === 0;

  const prioKey = priorityKey(detail.priority);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div data-slot="panel-header">
        <span className="title">{lexicon.detailTitle}</span>
        <span className="count font-mono">{detail.id}</span>
      </div>
      <div className="p-4 flex flex-col gap-4 overflow-auto">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            data-slot="task-pill"
            data-kind="status"
            style={
              detail.statusColor
                ? ({ ['--status-color' as string]: detail.statusColor } as CSSProperties)
                : undefined
            }
          >
            {detail.status}
          </span>
          {detail.priority && (
            <span data-slot="task-pill" data-priority={prioKey}>
              {PRIORITY_LABEL[detail.priority]}
            </span>
          )}
          {detail.listName && (
            <span data-slot="task-pill" data-kind="list">
              {detail.listName}
            </span>
          )}
          {detail.dueDate && (
            <span
              data-slot="task-pill"
              data-kind="due"
              data-urgency={dueUrgency(detail.dueDate)}
            >
              Due{' '}
              {new Date(detail.dueDate).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}
        </div>

        <div>
          <label className="text-xs text-inkMuted uppercase tracking-wider">Title</label>
          <input
            key={`name-${detail.id}`}
            className="w-full bg-panel border border-border rounded px-3 py-2 mt-1"
            defaultValue={detail.name}
            onBlur={(e) => {
              if (e.target.value !== detail.name) save('name', e.target.value);
            }}
          />
        </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-inkMuted uppercase tracking-wider">Status</label>
          <input
            key={`status-${detail.id}`}
            className="w-full bg-panel border border-border rounded px-3 py-2 mt-1"
            defaultValue={detail.status}
            onBlur={(e) => {
              if (e.target.value !== detail.status) save('status', e.target.value);
            }}
          />
        </div>
        <div>
          <label className="text-xs text-inkMuted uppercase tracking-wider">Priority</label>
          <select
            className="w-full bg-panel border border-border rounded px-3 py-2 mt-1"
            value={detail.priority ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? null : (Number(e.target.value) as Priority);
              save('priority', v);
            }}
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={String(opt.value)} value={opt.value ?? ''}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-inkMuted uppercase tracking-wider">Due</label>
          <input
            key={`due-${detail.id}`}
            type="date"
            className="w-full bg-panel border border-border rounded px-3 py-2 mt-1"
            defaultValue={
              detail.dueDate
                ? new Date(detail.dueDate).toISOString().slice(0, 10)
                : ''
            }
            onBlur={(e) => {
              const newVal = e.target.value ? new Date(e.target.value).getTime() : null;
              if (newVal !== detail.dueDate) save('dueDate', newVal);
            }}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-inkMuted uppercase tracking-wider">{lexicon.descriptionHeading}</label>
        <textarea
          key={`desc-${detail.id}`}
          className="w-full bg-panel border border-border rounded px-3 py-2 mt-1 min-h-[140px] font-mono text-sm"
          defaultValue={detail.description || ''}
          onBlur={(e) => {
            if (e.target.value !== (detail.description || '')) save('description', e.target.value);
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <a
          href={detail.url}
          onClick={(e) => {
            e.preventDefault();
            window.helm.openExternal(detail.url);
          }}
          className="text-accent text-sm"
        >
          Open in ClickUp →
        </a>
        <div className="text-inkMuted text-xs flex items-center gap-3">
          {stillLoading && <span>Loading comments…</span>}
          {saving && <span>Saving…</span>}
          {error && <span className="text-danger">{error}</span>}
        </div>
      </div>

      {detail.subtasks.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-inkMuted mb-2">{lexicon.subtasksHeading}</h3>
          <ul className="flex flex-col gap-1">
            {detail.subtasks.map((st) => (
              <li key={st.id} className="text-sm px-2 py-1 rounded bg-panel border border-border">
                <span className="text-inkMuted mr-2">[{st.status}]</span>
                {st.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.comments.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-inkMuted mb-2">Comments</h3>
          <ul className="flex flex-col gap-2">
            {detail.comments.map((c) => (
              <li key={c.id} className="text-sm px-3 py-2 rounded bg-panel border border-border">
                <div className="text-inkMuted text-xs mb-1">
                  {c.user} · {new Date(c.dateCreated).toLocaleString()}
                </div>
                <div className="whitespace-pre-wrap">{c.text}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </div>
  );
}
