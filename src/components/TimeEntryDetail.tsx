import type { TimeEntry } from '../../shared/types';
import {
  fmtDate,
  fmtDuration,
  fromLocalDatetimeInput,
  toLocalDatetimeInput,
} from '../utils/time';

interface Props {
  entry: TimeEntry | null;
  onSave: (id: string, patch: Partial<TimeEntry>) => Promise<TimeEntry | null>;
  onDelete: (id: string) => Promise<boolean>;
  onClose: () => void;
}

export function TimeEntryDetail({ entry, onSave, onDelete, onClose }: Props) {
  if (!entry) {
    return (
      <div className="p-8 text-inkMuted text-center text-sm">
        Click an entry to see and edit its details.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div data-slot="panel-header">
        <span className="title">Entry</span>
        <span className="count font-mono">{entry.id}</span>
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
            className="w-full bg-panel border border-border rounded px-3 py-2 mt-1 min-h-[100px] font-mono text-sm"
            defaultValue={entry.description || ''}
            onBlur={(e) => {
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
              className="w-full bg-panel border border-border rounded px-3 py-2 mt-1"
              defaultValue={toLocalDatetimeInput(entry.start)}
              onBlur={(e) => {
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
              className="w-full bg-panel border border-border rounded px-3 py-2 mt-1"
              defaultValue={toLocalDatetimeInput(entry.end)}
              onBlur={(e) => {
                if (!e.target.value) return;
                const v = fromLocalDatetimeInput(e.target.value);
                if (v !== entry.end) {
                  onSave(entry.id, { end: v, duration: v - entry.start });
                }
              }}
            />
          </div>
        </div>

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
      </div>
    </div>
  );
}
