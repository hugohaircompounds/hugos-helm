import { useEffect, useState } from 'react';
import type { ListStatus } from '../../shared/types';

// Session-lifetime cache of per-list status arrays. ClickUp's list object
// (the source of these) changes rarely; a cache keyed by listId is enough.
const cache = new Map<string, ListStatus[]>();

export function useListStatuses(listId: string | null): {
  statuses: ListStatus[];
  loading: boolean;
  error: string | null;
} {
  const [statuses, setStatuses] = useState<ListStatus[]>(
    listId ? cache.get(listId) || [] : []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listId) {
      setStatuses([]);
      return;
    }
    const cached = cache.get(listId);
    if (cached) {
      setStatuses(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.helm
      .getListStatuses(listId)
      .then((list) => {
        if (cancelled) return;
        cache.set(listId, list);
        setStatuses(list);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listId]);

  return { statuses, loading, error };
}
