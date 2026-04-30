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
    async (entryId: string, patch: Partial<TimeEntry>): Promise<TimeEntry> => {
      try {
        const updated = await window.helm.updateTimeEntry(entryId, patch);
        // Fall back to the server response when the entry isn't in the
        // local list (rare — e.g. weekly view filtering or a race with
        // a list reload). The merge below upgrades to the per-field
        // patch→server→local precedence when the entry IS present.
        let merged: TimeEntry = updated;
        setEntries((prev) =>
          prev.map((e) => {
            if (e.id !== entryId) return e;
            // Merge precedence: patch (user's intent) → updated (server) → e
            // (previous local). ClickUp's PUT response routinely omits fields
            // it just persisted (notably description), so a merge that only
            // consults the response would silently drop the user's edit and
            // leave the local list showing the stale value.
            const mergedDuration =
              patch.duration !== undefined
                ? patch.duration
                : Number.isFinite(updated.duration) && updated.duration > 0
                ? updated.duration
                : e.duration;
            const next: TimeEntry = {
              ...e,
              description:
                patch.description !== undefined
                  ? patch.description
                  : updated.description ?? e.description,
              start:
                patch.start !== undefined
                  ? patch.start
                  : Number.isFinite(updated.start) && updated.start > 0
                  ? updated.start
                  : e.start,
              end:
                patch.end !== undefined ? patch.end : updated.end ?? e.end,
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
        // Rethrow so callers see the actual ClickUp error (timeouts, 5xx,
        // 401, etc.) instead of a generic "no result" placeholder. Fire-
        // and-forget callers should attach .catch().
        throw e;
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

  const create = useCallback(
    async (opts: {
      taskId: string | null;
      start: number;
      duration: number;
      description?: string;
    }): Promise<TimeEntry | null> => {
      try {
        const created = await window.helm.createTimeEntry(opts);
        setEntries((prev) => [created, ...prev].sort((a, b) => b.start - a.start));
        setError(null);
        return created;
      } catch (e) {
        setError((e as Error).message);
        return null;
      }
    },
    []
  );

  return { entries, loading, error, load, save, remove, create, setError };
}
