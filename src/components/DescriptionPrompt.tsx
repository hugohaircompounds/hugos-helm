import { useEffect, useState } from 'react';
import type { DescriptionPromptPayload } from '../../shared/types';

interface Props {
  payload: DescriptionPromptPayload | null;
  onClose: () => void;
}

export function DescriptionPrompt({ payload, onClose }: Props) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (payload) setText(payload.defaultText || '');
  }, [payload]);

  if (!payload) return null;
  // EOD now flows through the Timesheet inline editor (see eod-focus-entry).
  // The modal is reserved for manual stops.
  if (payload.kind === 'eod') return null;

  async function submit() {
    await window.helm.submitDescriptionPrompt(payload!.entryId, text);
    onClose();
  }

  async function dismiss() {
    await window.helm.dismissDescriptionPrompt();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="w-[560px] bg-panel border border-border rounded-lg shadow-xl">
        <header className="px-5 py-4 border-b border-border">
          <h3 className="text-ink font-medium">Describe this time entry</h3>
        </header>
        <div className="p-5">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-bg border border-border rounded px-3 py-2 min-h-[160px] text-sm"
          />
        </div>
        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={dismiss}
            className="px-3 py-1 text-sm rounded border border-border text-inkMuted hover:bg-panelHi"
          >
            Skip
          </button>
          <button
            onClick={submit}
            className="px-3 py-1 text-sm rounded bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30"
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
