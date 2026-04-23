import { useRef } from 'react';
import type { TaskDetail } from '../../shared/types';

// Session-lifetime in-memory cache. A single shared Map across the app.
// Replaced entries (on edit) just overwrite the key; invalidation is explicit.
const cache = new Map<string, TaskDetail>();

export function useTaskDetailCache() {
  const ref = useRef(cache);

  return {
    get: (id: string): TaskDetail | undefined => ref.current.get(id),
    set: (id: string, detail: TaskDetail): void => {
      ref.current.set(id, detail);
    },
    invalidate: (id: string): void => {
      ref.current.delete(id);
    },
    clear: (): void => {
      ref.current.clear();
    },
  };
}
