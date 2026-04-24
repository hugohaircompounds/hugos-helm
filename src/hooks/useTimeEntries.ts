import { useCallback, useEffect, useState } from 'react';
import type { TimeEntry } from '../../shared/types';

export type TimesheetRange = 'today' | 'week';

// Lifted time-entries state so both TimesheetEditor (the list) and
// TimeEntryDetail (the middle-column editor) can share the same entries
// and stay in sync after edits.
export function useTimeEntries(range: TimesheetRange) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.helm.listTimeEntries(range);
      setEntries(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (entryId: string, patch: Partial<TimeEntry>): Promise<TimeEntry | null> => {
      try {
        const updated = await window.helm.updateTimeEntry(entryId, patch);
        let merged: TimeEntry | null = null;
        setEntries((prev) =>
          prev.map((e) => {
            if (e.id !== entryId) return e;
            // ClickUp's PUT response can omit task info and mis-format duration.
            // Merge defensively so we don't lose locally-known fields.
            const mergedDuration =
              Number.isFinite(updated.duration) && updated.duration > 0
                ? updated.duration
                : e.duration;
            const next: TimeEntry = {
              ...e,
              description: updated.description ?? e.description,
              start:
                Number.isFinite(updated.start) && updated.start > 0 ? updated.start : e.start,
              end: updated.end ?? e.end,
              duration: mergedDuration,
              taskId: updated.taskId || e.taskId,
              taskName: updated.taskName || e.taskName,
            };
            merged = next;
            return next;
          })
        );
        setError(null);
        return merged;
      } catch (e) {
        setError((e as Error).message);
        return null;
      }
    },
    []
  );

  const remove = useCallback(async (entryId: string): Promise<boolean> => {
    try {
      await window.helm.deleteTimeEntry(entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      setError(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }, []);

  return { entries, loading, error, load, save, remove, setError };
}
