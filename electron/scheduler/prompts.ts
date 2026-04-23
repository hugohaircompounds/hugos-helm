// Relays description-prompt events from the timer service to the renderer.
// The timer service emits on timerBus; main.ts wires the listener and forwards
// over IPC so the renderer can show a modal.

import type { BrowserWindow } from 'electron';
import type { DescriptionPromptPayload } from '../../shared/types';
import { timerBus } from './timer';

export function attachPromptRelay(getWindow: () => BrowserWindow | null): () => void {
  const onPrompt = (payload: DescriptionPromptPayload) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send('helm:description-prompt', payload);
  };
  timerBus.on('description-prompt', onPrompt);
  return () => {
    timerBus.off('description-prompt', onPrompt);
  };
}
