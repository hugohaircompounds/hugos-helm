import { useEffect, useState, type CSSProperties } from 'react';
import type {
  Comment as CommentType,
  Priority,
  Task,
  TaskDetail as TaskDetailType,
  ThemeLexicon,
} from '../../shared/types';
import { dueUrgency } from '../utils/time';
import { useTaskDetailCache } from '../hooks/useTaskDetailCache';
import { useListStatuses } from '../hooks/useListStatuses';

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
          <StatusSelect
            listId={detail.listId}
            currentStatus={detail.status}
            currentColor={detail.statusColor}
            onChange={(next) => save('status', next)}
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
              <CommentThread
                key={c.id}
                comment={c}
                onRepliesLoaded={(parentId, replies) => {
                  if (!detail) return;
                  const next: TaskDetailType = {
                    ...detail,
                    comments: detail.comments.map((existing) =>
                      existing.id === parentId
                        ? { ...existing, replies, repliesLoaded: true }
                        : existing
                    ),
                  };
                  setDetail(next);
                  cache.set(detail.id, next);
                }}
              />
            ))}
          </ul>
        </section>
      )}
      </div>
    </div>
  );
}

function CommentThread({
  comment,
  onRepliesLoaded,
}: {
  comment: CommentType;
  onRepliesLoaded: (parentId: string, replies: CommentType[]) => void;
}) {
  // Head thread (replies eagerly loaded server-side) starts expanded; every
  // other thread starts collapsed. The user toggles individual threads
  // independently from there.
  const initiallyExpanded = comment.repliesLoaded && comment.replies.length > 0;
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (!comment.repliesLoaded && comment.replyCount > 0) {
      setLoading(true);
      setError(null);
      try {
        const replies = await window.helm.loadCommentReplies(comment.id);
        onRepliesLoaded(comment.id, replies);
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    setExpanded(true);
  }

  const showDisclosure = comment.replyCount > 0;

  return (
    <li className="text-sm rounded bg-panel border border-border">
      <div className="px-3 py-2">
        <div className="text-inkMuted text-xs mb-1">
          {comment.user} · {new Date(comment.dateCreated).toLocaleString()}
        </div>
        <CommentBody comment={comment} />
        {showDisclosure && (
          <button
            onClick={toggle}
            disabled={loading}
            className="text-inkMuted hover:text-ink text-xs mt-2 flex items-center gap-1 disabled:opacity-60"
          >
            {expanded ? '▾' : '▸'}{' '}
            {loading
              ? 'Loading…'
              : `${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}`}
          </button>
        )}
        {error && <div className="text-danger text-xs mt-1">{error}</div>}
      </div>

      {expanded && comment.replies.length > 0 && (
        <ul className="border-t border-border pl-6 pr-3 py-2 flex flex-col gap-2 bg-panel/40">
          {comment.replies.map((r) => (
            <li key={r.id} className="text-sm">
              <div className="text-inkMuted text-xs mb-1">
                {r.user} · {new Date(r.dateCreated).toLocaleString()}
              </div>
              <CommentBody comment={r} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Walks a Comment's structured `segments` to render text + mention chips.
// Falls back to plaintext when segments are empty (defensive — every code
// path that produces a Comment should populate segments).
function CommentBody({ comment }: { comment: CommentType }) {
  const segments =
    comment.segments && comment.segments.length > 0
      ? comment.segments
      : comment.text
      ? [{ kind: 'text' as const, value: comment.text }]
      : [];
  return (
    <div className="whitespace-pre-wrap">
      {segments.map((seg, i) => {
        if (seg.kind === 'mention') {
          return (
            <span
              key={i}
              data-mention-user-id={seg.userId}
              className="inline-block px-1 rounded bg-accent/15 text-accent"
            >
              @{seg.display}
            </span>
          );
        }
        return <span key={i}>{seg.value}</span>;
      })}
    </div>
  );
}

function StatusSelect({
  listId,
  currentStatus,
  currentColor,
  onChange,
}: {
  listId: string | null;
  currentStatus: string;
  currentColor: string | null;
  onChange: (next: string) => void;
}) {
  const { statuses, loading, error } = useListStatuses(listId);

  // If the list-statuses call fails or the current status isn't in the list
  // (can happen for statuses from other spaces), fall back to a text input
  // so the user never loses the ability to change state.
  const hasCurrent = statuses.some((s) => s.status === currentStatus);
  const showFallback = !listId || error || (!loading && !hasCurrent && statuses.length === 0);

  if (showFallback) {
    return (
      <input
        key={`status-fallback-${currentStatus}`}
        className="w-full bg-panel border border-border rounded px-3 py-2 mt-1"
        defaultValue={currentStatus}
        onBlur={(e) => {
          if (e.target.value !== currentStatus) onChange(e.target.value);
        }}
      />
    );
  }

  const options = hasCurrent
    ? statuses
    : [
        ...statuses,
        { status: currentStatus, color: currentColor || '#8b93a7', orderindex: 999 },
      ];

  return (
    <div className="relative flex items-center">
      <span
        className="absolute left-2 h-2 w-2 rounded-full pointer-events-none"
        style={{ background: currentColor || '#8b93a7' }}
      />
      <select
        className="w-full bg-panel border border-border rounded pl-6 pr-2 py-2 mt-1 appearance-none"
        value={currentStatus}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((s) => (
          <option key={s.status} value={s.status}>
            {s.status}
          </option>
        ))}
      </select>
    </div>
  );
}
