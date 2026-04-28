import type { IdleTruncatePromptPayload } from '../../shared/types';
import { fmtDuration, fmtTime } from '../utils/time';

interface Props {
  payload: IdleTruncatePromptPayload | null;
  onClose: () => void;
}

export function IdleTruncatePrompt({ payload, onClose }: Props) {
  if (!payload) return null;

  const idleMs = payload.idleEndedAt - payload.idleStartedAt;

  async function truncate() {
    await window.helm.truncateRunningEntry(payload!.idleStartedAt);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="w-[520px] bg-panel border border-border rounded-lg shadow-xl">
        <header className="px-5 py-4 border-b border-border">
          <h3 className="text-ink font-medium">You were away — truncate the entry?</h3>
        </header>
        <div className="p-5 flex flex-col gap-3 text-sm">
          <p className="text-ink/90">
            The screen was locked from{' '}
            <strong>{fmtTime(payload.idleStartedAt)}</strong> to{' '}
            <strong>{fmtTime(payload.idleEndedAt)}</strong> (
            <span className="font-mono">{fmtDuration(idleMs)}</span> idle), and a timer was
            running on{' '}
            <strong>{payload.taskName || payload.taskId || '(untracked)'}</strong>.
          </p>
          <p className="text-inkMuted text-xs">
            Truncate stops the entry as if you'd hit Stop right when the screen locked. Keep
            leaves the entry as-is. The timer is still running until you choose.
          </p>
        </div>
        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 text-sm rounded border border-border text-inkMuted hover:bg-panelHi"
          >
            Keep
          </button>
          <button
            onClick={truncate}
            className="px-3 py-1 text-sm rounded bg-warn/20 text-warn border border-warn/40 hover:bg-warn/30"
          >
            Truncate to lock time
          </button>
        </footer>
      </div>
    </div>
  );
}
