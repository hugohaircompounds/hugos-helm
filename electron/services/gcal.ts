import { google } from 'googleapis';
import type { CalendarEvent } from '../../shared/types';
import { getAuthedGoogleClient } from './auth';

// Google API doesn't return a color on the event unless it's explicitly set,
// so we derive a color from the calendar id hash for consistency.
function colorFromCalendar(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const palette = [
    '#7aa2ff',
    '#4ade80',
    '#fbbf24',
    '#f87171',
    '#c084fc',
    '#22d3ee',
    '#fb7185',
    '#a3e635',
    '#60a5fa',
  ];
  return palette[Math.abs(h) % palette.length];
}

export async function listUpcomingEvents(): Promise<CalendarEvent[]> {
  const auth = await getAuthedGoogleClient();
  const cal = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const timeMin = new Date(now);
  timeMin.setHours(0, 0, 0, 0);

  const calList = await cal.calendarList.list({ minAccessRole: 'reader' });
  const calendars = calList.data.items || [];

  const out: CalendarEvent[] = [];
  for (const c of calendars) {
    if (!c.id || c.selected === false) continue;
    try {
      const ev = await cal.events.list({
        calendarId: c.id,
        timeMin: timeMin.toISOString(),
        timeMax: in7.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
      });
      for (const e of ev.data.items || []) {
        if (!e.id) continue;
        const startIso = e.start?.dateTime || e.start?.date;
        const endIso = e.end?.dateTime || e.end?.date;
        if (!startIso || !endIso) continue;
        const allDay = !e.start?.dateTime;
        out.push({
          id: e.id,
          calendarId: c.id,
          calendarName: c.summary || c.id,
          title: e.summary || '(no title)',
          description: e.description || null,
          location: e.location || null,
          start: new Date(startIso).getTime(),
          end: new Date(endIso).getTime(),
          allDay,
          color: c.backgroundColor || colorFromCalendar(c.id),
          htmlLink: e.htmlLink || 'https://calendar.google.com/',
        });
      }
    } catch {
      // skip calendar on error
    }
  }

  return out.sort((a, b) => a.start - b.start);
}
