import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ClickUpFolder,
  ClickUpList,
  ClickUpSpace,
  NewTaskPayload,
  Priority,
  Task,
  ThemeLexicon,
} from '../../shared/types';
import { useListStatuses } from '../hooks/useListStatuses';
import { useWorkspaceMembers } from '../hooks/useWorkspaceMembers';

interface Props {
  // Pre-selected list seed: pass the currently-selected task's space/folder/
  // list to land the picker in context. Falls back to lastCreateTaskListId
  // (loaded from settings) when this is null.
  initialListId: string | null;
  // List name attached to the running timer's task — used as a quality-of-
  // life pre-fill when the user creates a task while one's running.
  onClose: () => void;
  onCreated: (task: Task) => void;
  // Notification copy for the not-assigned-to-me toast surfaced by App.tsx.
  // Modal calls this after a successful create.
  lexicon: ThemeLexicon;
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: null, label: 'None' },
  { value: 1, label: 'Urgent' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Low' },
];

const NAME_MAX = 1024;

export function CreateTaskModal({ initialListId, onClose, onCreated }: Props) {
  // Cascade state ---------------------------------------------------------

  const [spaces, setSpaces] = useState<ClickUpSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(true);
  const [spaceId, setSpaceId] = useState<string | null>(null);

  const [folders, setFolders] = useState<ClickUpFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);

  const [lists, setLists] = useState<ClickUpList[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listId, setListId] = useState<string | null>(null);

  // Form fields -----------------------------------------------------------

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [statusValue, setStatusValue] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>(null);
  const [dueDate, setDueDate] = useState<string>(''); // datetime-local format
  const [assignees, setAssignees] = useState<number[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { statuses, loading: statusesLoading } = useListStatuses(listId);
  const { members } = useWorkspaceMembers();

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const seededRef = useRef(false);

  // Bootstrap: load spaces once. Then if initialListId is set, walk the
  // tree backwards to find which space/folder it belongs in so the picker
  // pre-fills correctly.
  useEffect(() => {
    let cancelled = false;
    setSpacesLoading(true);
    window.helm
      .listSpaces()
      .then((sp) => {
        if (cancelled) return;
        setSpaces(sp);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setSpacesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Once spaces have arrived, attempt to resolve initialListId by walking
  // each space's folders + folderless lists. First match wins. Run only
  // once per modal open (seededRef).
  useEffect(() => {
    if (seededRef.current) return;
    if (!initialListId || spaces.length === 0) return;
    seededRef.current = true;
    let cancelled = false;
    (async () => {
      for (const sp of spaces) {
        if (cancelled) return;
        try {
          const [folderless, fls] = await Promise.all([
            window.helm.listFolderlessLists(sp.id),
            window.helm.listFolders(sp.id),
          ]);
          if (cancelled) return;
          const direct = folderless.find((l) => l.id === initialListId);
          if (direct) {
            setSpaceId(sp.id);
            setLists(folderless);
            setListId(direct.id);
            setFolders(fls);
            return;
          }
          for (const f of fls) {
            if (cancelled) return;
            const lf = await window.helm.listListsInFolder(f.id);
            if (cancelled) return;
            const hit = lf.find((l) => l.id === initialListId);
            if (hit) {
              setSpaceId(sp.id);
              setFolders(fls);
              setFolderId(f.id);
              setLists(lf);
              setListId(hit.id);
              return;
            }
          }
        } catch {
          // Skip space on error; continue scan.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialListId, spaces]);

  // Focus name on first render.
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Default the status dropdown to the list's first non-closed status as
  // soon as statuses load.
  useEffect(() => {
    if (!statuses.length) return;
    if (statusValue) return;
    const firstOpen = statuses.find((s) => s.status?.toLowerCase() !== 'closed');
    setStatusValue((firstOpen ?? statuses[0]).status);
  }, [statuses, statusValue]);

  // Cascade behaviors -----------------------------------------------------

  async function pickSpace(id: string | null) {
    setSpaceId(id);
    setFolderId(null);
    setListId(null);
    setStatusValue(null);
    setFolders([]);
    setLists([]);
    if (!id) return;
    setFoldersLoading(true);
    setListsLoading(true);
    try {
      const [fls, folderless] = await Promise.all([
        window.helm.listFolders(id),
        window.helm.listFolderlessLists(id),
      ]);
      setFolders(fls);
      setLists(folderless);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFoldersLoading(false);
      setListsLoading(false);
    }
  }

  async function pickFolder(id: string | null) {
    setFolderId(id);
    setListId(null);
    setStatusValue(null);
    if (!id) {
      // Switch back to folderless lists for the current space.
      if (!spaceId) return;
      setListsLoading(true);
      try {
        const folderless = await window.helm.listFolderlessLists(spaceId);
        setLists(folderless);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setListsLoading(false);
      }
      return;
    }
    setListsLoading(true);
    try {
      const lf = await window.helm.listListsInFolder(id);
      setLists(lf);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setListsLoading(false);
    }
  }

  // Submit ---------------------------------------------------------------

  const trimmedName = name.trim();
  const nameTooLong = trimmedName.length > NAME_MAX;
  const canSubmit = !!listId && trimmedName.length > 0 && !nameTooLong && !submitting;

  async function submit() {
    if (!listId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    const payload: NewTaskPayload = {
      name: trimmedName,
      description: description.trim() || undefined,
      status: statusValue || undefined,
      priority: priority,
      dueDate: dueDate ? new Date(dueDate).getTime() : null,
      assignees: assignees.length ? assignees : undefined,
    };
    try {
      const created = await window.helm.createTask(listId, payload);
      // Best-effort: persist last list so the next open pre-fills. Failure
      // here doesn't block the create — it just means the next session
      // doesn't get the convenience.
      window.helm.saveSettings({ lastCreateTaskListId: listId }).catch(() => {});
      onCreated(created);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // Render ---------------------------------------------------------------

  const memberSorted = useMemo(
    () => [...members].sort((a, b) => a.username.localeCompare(b.username)),
    [members]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative w-[480px] max-h-[90vh] overflow-auto bg-bg border border-border rounded shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm uppercase tracking-wider">+ New task</h2>
          <button
            onClick={onClose}
            className="text-inkMuted hover:text-ink text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {/* Cascade picker */}
          <div className="grid grid-cols-3 gap-2">
            <Field label="Space">
              <select
                value={spaceId ?? ''}
                onChange={(e) => pickSpace(e.target.value || null)}
                disabled={spacesLoading}
                className="w-full bg-panel border border-border rounded px-2 py-1.5 text-sm"
              >
                <option value="">{spacesLoading ? 'Loading…' : 'Pick…'}</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Folder">
              <select
                value={folderId ?? ''}
                onChange={(e) => pickFolder(e.target.value || null)}
                disabled={!spaceId || foldersLoading}
                className="w-full bg-panel border border-border rounded px-2 py-1.5 text-sm"
              >
                <option value="">{folders.length === 0 && spaceId ? 'No folders' : '(none)'}</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="List *">
              <select
                value={listId ?? ''}
                onChange={(e) => {
                  setListId(e.target.value || null);
                  setStatusValue(null);
                }}
                disabled={listsLoading || (!spaceId && !listId)}
                className="w-full bg-panel border border-border rounded px-2 py-1.5 text-sm"
              >
                <option value="">{listsLoading ? 'Loading…' : 'Pick…'}</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Name */}
          <Field label="Name *">
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
                  void submit();
                }
              }}
              placeholder="What needs to happen?"
              className="w-full bg-panel border border-border rounded px-3 py-2 text-sm"
              disabled={submitting}
            />
            {nameTooLong && (
              <div className="text-danger text-xs mt-1">
                Name must be {NAME_MAX} characters or fewer.
              </div>
            )}
          </Field>

          {/* Description */}
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional"
              className="w-full bg-panel border border-border rounded px-3 py-2 text-sm font-mono"
              disabled={submitting}
            />
          </Field>

          {/* Status / Priority / Due date */}
          <div className="grid grid-cols-3 gap-2">
            <Field label="Status">
              <select
                value={statusValue ?? ''}
                onChange={(e) => setStatusValue(e.target.value || null)}
                disabled={!listId || statusesLoading}
                className="w-full bg-panel border border-border rounded px-2 py-1.5 text-sm"
              >
                <option value="">
                  {!listId ? 'Pick list first' : statusesLoading ? 'Loading…' : '—'}
                </option>
                {statuses.map((s) => (
                  <option key={s.status} value={s.status}>
                    {s.status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                value={priority === null ? '' : String(priority)}
                onChange={(e) => {
                  const v = e.target.value;
                  setPriority(
                    v === '' ? null : (Number(v) as 1 | 2 | 3 | 4)
                  );
                }}
                disabled={submitting}
                className="w-full bg-panel border border-border rounded px-2 py-1.5 text-sm"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option
                    key={p.value === null ? 'none' : p.value}
                    value={p.value === null ? '' : String(p.value)}
                  >
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due date">
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={submitting}
                className="w-full bg-panel border border-border rounded px-2 py-1.5 text-sm"
              />
            </Field>
          </div>

          {/* Assignees */}
          <Field label="Assignees">
            <div className="flex flex-wrap gap-1.5">
              {memberSorted.length === 0 && (
                <span className="text-xs text-inkMuted">Members loading…</span>
              )}
              {memberSorted.map((m) => {
                const checked = assignees.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setAssignees((prev) =>
                        prev.includes(m.id)
                          ? prev.filter((id) => id !== m.id)
                          : [...prev, m.id]
                      )
                    }
                    className={`text-xs px-2 py-0.5 rounded border ${
                      checked
                        ? 'bg-accent/20 text-accent border-accent/40'
                        : 'bg-panel text-inkMuted border-border hover:bg-panelHi'
                    }`}
                  >
                    @{m.username}
                  </button>
                );
              })}
            </div>
          </Field>

          {error && <div className="text-danger text-xs">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-border text-sm hover:bg-panelHi"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="px-3 py-1.5 rounded bg-accent/20 text-accent border border-accent/40 text-sm hover:bg-accent/30 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-inkMuted">{label}</span>
      {children}
    </label>
  );
}
