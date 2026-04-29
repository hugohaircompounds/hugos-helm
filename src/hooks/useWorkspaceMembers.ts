import { useEffect, useMemo, useState } from 'react';
import type { WorkspaceMember } from '../../shared/types';

// Session-lifetime cache of the workspace member list. Main-process keeps a
// 10-min TTL on top, so this hook is cheap to instantiate from many
// components (compose textarea, assignee picker, etc.) — only the first
// call per window hits the network.
let cached: WorkspaceMember[] | null = null;
let inFlight: Promise<WorkspaceMember[]> | null = null;

export function useWorkspaceMembers(): {
  members: WorkspaceMember[];
  loading: boolean;
  error: string | null;
  search: (query: string) => WorkspaceMember[];
} {
  const [members, setMembers] = useState<WorkspaceMember[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached) {
      setMembers(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (!inFlight) {
      inFlight = window.helm
        .listWorkspaceMembers()
        .then((list) => {
          cached = list;
          inFlight = null;
          return list;
        })
        .catch((e) => {
          inFlight = null;
          throw e;
        });
    }
    inFlight
      .then((list) => {
        if (cancelled) return;
        setMembers(list);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const search = useMemo(() => {
    return (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return members;
      return members.filter((m) => {
        const username = m.username.toLowerCase();
        const initials = m.initials.toLowerCase();
        const emailPrefix = (m.email.split('@')[0] || '').toLowerCase();
        return (
          username.includes(q) ||
          initials.startsWith(q) ||
          emailPrefix.includes(q)
        );
      });
    };
  }, [members]);

  return { members, loading, error, search };
}
