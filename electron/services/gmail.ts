import { google } from 'googleapis';
import type { EmailMessage } from '../../shared/types';
import { getAuthedGoogleClient } from './auth';

function headerVal(
  headers: { name?: string | null; value?: string | null }[] | undefined,
  key: string
): string {
  if (!headers) return '';
  const found = headers.find((h) => h.name?.toLowerCase() === key.toLowerCase());
  return found?.value || '';
}

function parseFrom(raw: string): { from: string; name: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { name: m[1].trim(), from: m[2].trim() };
  return { name: raw, from: raw };
}

export async function listInboxMessages(): Promise<EmailMessage[]> {
  const auth = await getAuthedGoogleClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const list = await gmail.users.messages.list({
    userId: 'me',
    q: 'in:inbox',
    maxResults: 25,
  });

  const ids = (list.data.messages || []).map((m) => m.id).filter((x): x is string => !!x);
  const out: EmailMessage[] = [];

  // Fetch metadata in parallel. Gmail quota is generous for this size.
  const fetched = await Promise.all(
    ids.map((id) =>
      gmail.users.messages
        .get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        })
        .then((r) => r.data)
        .catch(() => null)
    )
  );

  for (const m of fetched) {
    if (!m || !m.id) continue;
    const headers = m.payload?.headers || undefined;
    const { from, name } = parseFrom(headerVal(headers, 'From'));
    const subject = headerVal(headers, 'Subject') || '(no subject)';
    const dateHeader = headerVal(headers, 'Date');
    const date = dateHeader
      ? new Date(dateHeader).getTime()
      : Number(m.internalDate) || Date.now();
    const labels = m.labelIds || [];
    out.push({
      id: m.id,
      threadId: m.threadId || m.id,
      from,
      fromName: name || from,
      subject,
      snippet: m.snippet || '',
      unread: labels.includes('UNREAD'),
      date,
      url: `https://mail.google.com/mail/u/0/#inbox/${m.id}`,
    });
  }

  return out.sort((a, b) => b.date - a.date);
}
