import type { EmailMessage } from '../../shared/types';

interface Props {
  emails: EmailMessage[];
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function EmailFeed({ emails, error, loading, onRefresh }: Props) {
  return (
    <div className="flex flex-col h-full">
      <header className="h-10 flex items-center justify-between px-3 border-b border-border">
        <h2 className="text-xs uppercase tracking-wider text-inkMuted">Inbox</h2>
        <button onClick={onRefresh} className="text-xs text-inkMuted hover:text-ink">
          {loading ? '…' : 'Refresh'}
        </button>
      </header>
      {error && <div className="p-3 text-xs text-danger">{error}</div>}
      <ul className="flex-1 overflow-auto p-2 flex flex-col gap-1">
        {emails.map((m) => (
          <li
            key={m.id}
            onClick={() => window.helm.openExternal(m.url)}
            className="px-2 py-1.5 rounded bg-panel border border-border hover:bg-panelHi cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`truncate text-sm ${m.unread ? 'text-ink font-semibold' : 'text-inkMuted'}`}
              >
                {m.fromName || m.from}
              </span>
              <span className="text-xs text-inkMuted shrink-0">{formatDate(m.date)}</span>
            </div>
            <div className={`truncate text-sm ${m.unread ? 'text-ink' : 'text-inkMuted'}`}>
              {m.subject}
            </div>
            <div className="truncate text-xs text-inkMuted/80">{m.snippet}</div>
          </li>
        ))}
        {!loading && emails.length === 0 && !error && (
          <li className="text-inkMuted text-xs p-3">Inbox empty.</li>
        )}
      </ul>
    </div>
  );
}
