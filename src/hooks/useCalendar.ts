import { useCallback, useEffect, useState } from 'react';
import type { CalendarEvent } from '../../shared/types';

const POLL_MS = 3 * 60 * 1000;

export function useCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.helm.listCalendarEvents();
      setEvents(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { events, loading, error, refresh };
}
