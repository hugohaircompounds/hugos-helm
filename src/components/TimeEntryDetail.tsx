import { useEffect, useRef, useState } from 'react';
import type { TimeEntry } from '../../shared/types';
import {
  fmtDate,
  fmtDuration,
  fmtTime,
  fromLocalDatetimeInput,
  toLocalDatetimeInput,
} from '../utils/time';
import { isRunningId } from '../utils/runningEntry';

interface Props {
  entry: TimeEntry | null;
  onSave: (id: string, patch: Partial<TimeEntry>) => Promise<TimeEntry>;
  onDelete: (id: string) => Promise<boolean>;
  onClose: () => void;
  // Bumping this counter requests focus on the description textarea — used by
  // the EOD flow to land the cursor in the right place after the scheduler
  // navigates the user here.
  focusDescriptionTick?: number;
  // ClickUp URL for the entry's task. Looked up by App.tsx from the loaded
  // task list. When present, an "Open in ClickUp" button renders in the
  // panel header. Hidden when the entry has no task or its task isn't
  // in the user's loaded list.
  taskUrl?: string | null;
  // Notifies the parent when the description textarea has unsaved edits.
  // App.tsx uses this to gate entry switches and window close behind a
  // confirm prompt so typed text isn't silently dropped now that the
  // description no longer implicitly saves on blur.
  onDirtyChange?: (dirty: boolean) => void;
}

const RUNNING_DESCRIPTION_DEBOUNCE_MS = 300;

type SaveStatus = 'idle' | 'saving' | 'failed';

export function TimeEntryDetail({
  entry,
  onSave,
  onDelete,
  onClose,
  focusDescriptionTick,
  taskUrl,
  onDirtyChange,
}: Props) {
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const runningSaveTimer = useRef<number | null>(null);
  // Monotonic token so a slow getRunningDescription response doesn't clobber
  // the textarea after the user has navigated to a different entry.
  const seedReqRef = useRef(0);

  const [text, setText] = useState('');
  const [lastSaved, setLastSaved] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const running = entry ? isRunningId(entry.id) : false;
  const dirty = !!entry && text !== lastSaved;

  // Seed textarea state on entry change. Running entries pull from main —
  // the synthetic running TimeEntry always has description: '' so the
  // entry-level value isn't enough; main's pendingRunningDescription
  // combines the in-memory typing buffer with ClickUp's last-saved value.
  useEffect(() => {
    setSavedAt(null);
    setSaveStatus('idle');
    setSaveError(null);
    if (!entry) {
      setText('');
      setLastSaved('');
      return;
    }
    if (running) {
      const token = ++seedReqRef.current;
      const optimistic = entry.description ?? '';
      setText(optimistic);
      setLastSaved(optimistic);
      window.helm
        .getRunningDescription()
        .then((desc) => {
          if (seedReqRef.current !== token) return;
          setText(desc);
          setLastSaved(desc);
        })
        .catch(() => {
          /* fall back to whatever entry.description was */
        });
    } else {
      const initial = entry.description ?? '';
      setText(initial);
      setLastSaved(initial);
    }
  }, [entry?.id, running]);

  // Bubble dirty state to App.tsx for the entry-switch / window-close guards.
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Focus the description textarea when the EOD flow asks us to. Keyed on the
  // tick so a second EOD signal in the same session re-focuses.
  useEffect(() => {
    if (!focusDescriptionTick) return;
    const ta = descriptionRef.current;
    if (!ta) return;
    ta.focus();
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
  }, [focusDescriptionTick, entry?.id]);

  useEffect(() => {
    return () => {
      if (runningSaveTimer.current) {
        window.clearTimeout(runningSaveTimer.current);
        runningSaveTimer.current = null;
      }
    };
  }, []);

  if (!entry) {
    return (
      <div className="p-8 text-inkMuted text-center text-sm">
        Click an entry to see and edit its details.
      </div>
    );
  }

  function scheduleRunningDescriptionSave(value: string) {
    if (runningSaveTimer.current) {
      window.clearTimeout(runningSaveTimer.current);
    }
    runningSaveTimer.current = window.setTimeout(() => {
      window.helm.setRunningDescription(value).catch(() => {
        /* main-process buffer is best-effort */
      });
      runningSaveTimer.current = null;
    }, RUNNING_DESCRIPTION_DEBOUNCE_MS);
  }

  async function handleSave(): Promise<void> {
    if (!entry || !dirty || saveStatus === 'saving') return;
    const value = text;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      if (running) {
        await window.helm.flushRunningDescription(value);
        if (runningSaveTimer.current) {
          window.clearTimeout(runningSaveTimer.current);
          runningSaveTimer.current = null;
        }
      } else {
        await onSave(entry.id, { description: value });
      }
      setLastSaved(value);
      setSavedAt(Date.now());
      setSaveStatus('idle');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setSaveError(msg);
      setSaveStatus('failed');
    }
  }

  let statusText = '';
  let statusClass = 'text-inkMuted';
  if (saveStatus === 'saving') {
    statusText = 'Saving…';
  } else if (saveStatus === 'failed') {
    statusText = `Save failed: ${saveError || 'Unknown error'}`;
    statusClass = 'text-danger';
  } else if (dirty) {
    statusText = 'Unsaved changes';
  } else if (savedAt !== null) {
    statusText = `Saved · ${fmtTime(savedAt)}`;
  }

  const saveDisabled = !dirty || saveStatus === 'saving';

  return (
    <div className="flex flex-col h-full min-h-0">
      <div data-slot="panel-header">
        <span className="title">Entry</span>
        <span className="count font-mono">{running ? 'running' : entry.id}</span>
      </div>
      <div className="p-4 flex flex-col gap-4 overflow-auto">
        <div className="flex flex-wrap items-center gap-1.5">
          <span data-slot="task-pill">{fmtDuration(entry.duration)}</span>
          <span data-slot="task-pill" data-kind="list">
            {entry.taskName || '(untracked)'}
          </span>
          <span data-slot="task-pill">{fmtDate(entry.start)}</span>
          {!entry.end && (
            <span data-slot="task-pill" data-priority="urgent">
              Running
            </span>
          )}
        </div>

        <div>
          <label className="text-xs text-inkMuted uppercase tracking-wider">Description</label>
          <textarea
            key={`desc-${entry.id}`}
            ref={descriptionRef}
            className="w-full bg-panel border border-border rounded px-3 py-2 mt-1 min-h-[100px] font-mono text-sm"
            value={text}
            placeholder={
              running
                ? 'What are you working on? Save (or ⌘/Ctrl+Enter) to push to ClickUp without stopping.'
                : 'Save (or ⌘/Ctrl+Enter) to push your changes to ClickUp.'
            }
            onChange={(e) => {
              const v = e.target.value;
              setText(v);
              if (running) scheduleRunningDescriptionSave(v);
            }}
            onBlur={(e) => {
              // Running entries: keep the buffer fresh so a scheduler-driven
              // stop (EOD, lunch, manual stop) flushes the latest text even
              // if the user never clicks Save.
              // Non-running entries: no implicit save — Save button is the
              // only path.
              if (!running) return;
              if (runningSaveTimer.current) {
                window.clearTimeout(runningSaveTimer.current);
                runningSaveTimer.current = null;
              }
              window.helm.setRunningDescription(e.target.value).catch(() => {});
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void handleSave();
              }
            }}
          />
          <div className="flex items-center justify-end gap-3 mt-1.5">
            <span className={`text-xs ${statusClass}`}>{statusText}</span>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saveDisabled}
              className="px-3 py-1 text-sm rounded border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              Save
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-inkMuted uppercase tracking-wider">Start</label>
            <input
              key={`start-${entry.id}`}
              type="datetime-local"
              className="w-full bg-panel border border-border rounded px-3 py-2 mt-1 disabled:opacity-60"
              defaultValue={toLocalDatetimeInput(entry.start)}
              onBlur={(e) => {
                if (!e.target.value) return;
                const v = fromLocalDatetimeInput(e.target.value);
                if (v === entry.start) return;
                if (running) {
                  window.helm.updateRunningEntryStart(v).catch((err: unknown) => {
                    const msg = err instanceof Error ? err.message : 'Unknown error';
                    alert(`Could not update start time: ${msg}`);
                  });
                  return;
                }
                // Fire-and-forget: save throws on failure (rejection lands on
                // the unhandled-rejection path otherwise). The error message
                // surfaces in the timesheet panel via useTimeEntries.error.
                onSave(entry.id, {
                  start: v,
                  duration: (entry.end || Date.now()) - v,
                }).catch(() => {});
              }}
            />
          </div>
          <div>
            <label className="text-xs text-inkMuted uppercase tracking-wider">End</label>
            <input
              key={`end-${entry.id}`}
              type="datetime-local"
              className="w-full bg-panel border border-border rounded px-3 py-2 mt-1 disabled:opacity-60"
              defaultValue={toLocalDatetimeInput(entry.end)}
              disabled={running}
              onBlur={(e) => {
                if (running) return;
                if (!e.target.value) return;
                const v = fromLocalDatetimeInput(e.target.value);
                if (v !== entry.end) {
                  onSave(entry.id, { end: v, duration: v - entry.start }).catch(() => {});
                }
              }}
            />
          </div>
        </div>

        {taskUrl && (
          <div>
            <a
              href={taskUrl}
              onClick={(e) => {
                e.preventDefault();
                window.helm.openExternal(taskUrl);
              }}
              className="text-accent text-sm"
            >
              Open in ClickUp →
            </a>
          </div>
        )}

        {!running && (
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={async () => {
                if (!confirm('Delete this time entry?')) return;
                const ok = await onDelete(entry.id);
                if (ok) onClose();
              }}
              className="px-3 py-1.5 text-sm rounded border border-danger/40 text-danger hover:bg-danger/10"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
