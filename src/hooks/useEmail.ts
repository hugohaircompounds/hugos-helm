import { useCallback, useEffect, useState } from 'react';
import type { EmailMessage } from '../../shared/types';

const POLL_MS = 2 * 60 * 1000;

export function useEmail() {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.helm.listEmails();
      setEmails(list);
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

  return { emails, loading, error, refresh };
}
