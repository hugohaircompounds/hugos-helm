import { useEffect, useRef } from 'react';
import type { TimeEntry } from '../../shared/types';
import {
  fmtDate,
  fmtDuration,
  fromLocalDatetimeInput,
  toLocalDatetimeInput,
} from '../utils/time';
import { isRunningId } from '../utils/runningEntry';

interface Props {
  entry: TimeEntry | null;
  onSave: (id: string, patch: Partial<TimeEntry>) => Promise<TimeEntry | null>;
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
}

const RUNNING_DESCRIPTION_DEBOUNCE_MS = 300;

export function TimeEntryDetail({
  entry,
  onSave,
  onDelete,
  onClose,
  focusDescriptionTick,
  taskUrl,
}: Props) {
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const runningSaveTimer = useRef<number | null>(null);

  // Focus the description textarea when the EOD flow asks us to. Keyed on the
  // tick so a second EOD signal in the same session re-focuses.
  useEffect(() => {
    if (!focusDescriptionTick) return;
    const ta = descriptionRef.current;
    if (!ta) return;
    ta.focus();
    // Move cursor to end so existing buffered text isn't selected/overwritten.
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
  }, [focusDescriptionTick, entry?.id]);

  // Reset the running-description buffer in main when switching away from the
  // running entry, so an unrelated keystroke elsewhere doesn't get re-used.
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

  const running = isRunningId(entry.id);

  function scheduleRunningDescriptionSave(text: string) {
    if (runningSaveTimer.current) {
      window.clearTimeout(runningSaveTimer.current);
    }
    runningSaveTimer.current = window.setTimeout(() => {
      window.helm.setRunningDescription(text).catch(() => {
        /* main-process buffer is best-effort */
      });
      runningSaveTimer.current = null;
    }, RUNNING_DESCRIPTION_DEBOUNCE_MS);
  }

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
            defaultValue={entry.description || ''}
            placeholder={
              running
                ? 'What are you working on? Saved when the timer stops.'
                : undefined
            }
            onChange={(e) => {
              if (!running) return;
              scheduleRunningDescriptionSave(e.target.value);
            }}
            onBlur={(e) => {
              if (running) {
                // Flush immediately on blur so we don't lose the last keystrokes.
                if (runningSaveTimer.current) {
                  window.clearTimeout(runningSaveTimer.current);
                  runningSaveTimer.current = null;
                }
                window.helm.setRunningDescription(e.target.value).catch(() => {});
                return;
              }
              if (e.target.value !== (entry.description || '')) {
                onSave(entry.id, { description: e.target.value });
              }
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-inkMuted uppercase tracking-wider">Start</label>
            <input
              key={`start-${entry.id}`}
              type="datetime-local"
              className="w-full bg-panel border border-border rounded px-3 py-2 mt-1 disabled:opacity-60"
              defaultValue={toLocalDatetimeInput(entry.start)}
              disabled={running}
              onBlur={(e) => {
                if (running) return;
                if (!e.target.value) return;
                const v = fromLocalDatetimeInput(e.target.value);
                if (v !== entry.start) {
                  onSave(entry.id, {
                    start: v,
                    duration: (entry.end || Date.now()) - v,
                  });
                }
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
                  onSave(entry.id, { end: v, duration: v - entry.start });
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
