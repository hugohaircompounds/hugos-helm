import Database from 'better-sqlite3';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { JobLog, JobName, Settings, TimerState } from '../../shared/types';

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cached_tasks (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  status       TEXT,
  status_color TEXT,
  list_id      TEXT,
  list_name    TEXT,
  priority     INTEGER,
  due_date     INTEGER,
  url          TEXT,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS timer_state (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  running          INTEGER NOT NULL DEFAULT 0,
  task_id          TEXT,
  task_name        TEXT,
  entry_id         TEXT,
  started_at       INTEGER,
  resume_task_id   TEXT,
  resume_task_name TEXT
);

INSERT OR IGNORE INTO timer_state (id, running) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS job_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  job       TEXT NOT NULL,
  fired_at  INTEGER NOT NULL,
  outcome   TEXT NOT NULL,
  detail    TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_logs_fired_at ON job_logs (fired_at DESC);
`;

const DEFAULT_SETTINGS: Settings = {
  timezone: process.env.HELM_TIMEZONE || 'America/New_York',
  clickupWorkspaceId: null,
  clickupUserId: null,
  standupTaskIdMon: null,
  standupTaskIdTueThu: null,
  googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || null,
  googleConnected: false,
  clickupConnected: false,
  jobsEnabled: {
    'standup-mon': true,
    'standup-tue-thu': true,
    'standup-stop-check': true,
    'lunch-start': true,
    'lunch-end': true,
    'eod-prompt': true,
    'eod-stop': true,
  },
  layout: { leftPct: 40, midPct: 40 },
  themeId: 'default',
  themeMode: 'dark',
};

export function initDb(): Database.Database {
  if (db) return db;
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  const file = path.join(userData, 'helm.sqlite');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

function requireDb(): Database.Database {
  if (!db) throw new Error('db not initialized');
  return db;
}

// ---------- settings ----------

export function getSettings(): Settings {
  const rows = requireDb().prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const stored: Record<string, string> = {};
  for (const r of rows) stored[r.key] = r.value;

  const jobsEnabled = { ...DEFAULT_SETTINGS.jobsEnabled };
  if (stored['jobsEnabled']) {
    try {
      Object.assign(jobsEnabled, JSON.parse(stored['jobsEnabled']));
    } catch {
      // ignore malformed
    }
  }

  // Migration: if the legacy `standupTaskId` value exists and neither new field
  // has been populated, carry it over to the Tue-Thu field. Happens once on upgrade.
  const legacyStandup = stored['standupTaskId'] || null;
  const standupMon = stored['standupTaskIdMon'] || null;
  const standupTueThu = stored['standupTaskIdTueThu'] || legacyStandup || null;

  let layout = DEFAULT_SETTINGS.layout;
  if (stored['layout']) {
    try {
      const parsed = JSON.parse(stored['layout']);
      if (
        typeof parsed?.leftPct === 'number' &&
        typeof parsed?.midPct === 'number'
      ) {
        layout = { leftPct: parsed.leftPct, midPct: parsed.midPct };
      }
    } catch {
      /* ignore malformed */
    }
  }

  // Theme migration:
  //   legacy `theme='dark'` → themeId='default', themeMode='dark'
  //   legacy `theme='light'` → themeId='default', themeMode='light'
  //   legacy `theme='<name>'` → themeId=<name>, themeMode='dark'
  //   new explicit themeId/themeMode keys override legacy when present.
  const validThemeIds: Settings['themeId'][] = [
    'default',
    'tactical-hud',
    'ethereal',
    'neon',
    'cyberpunk',
    'terraria',
    'factorio',
    'ror2',
  ];
  const legacyTheme = stored['theme'];
  let migratedId: Settings['themeId'] = 'default';
  let migratedMode: Settings['themeMode'] = 'dark';
  if (legacyTheme === 'light') {
    migratedMode = 'light';
  } else if (legacyTheme && legacyTheme !== 'dark') {
    if ((validThemeIds as string[]).includes(legacyTheme)) {
      migratedId = legacyTheme as Settings['themeId'];
    }
  }
  const storedThemeId = stored['themeId'] as Settings['themeId'] | undefined;
  const storedThemeMode = stored['themeMode'] as Settings['themeMode'] | undefined;
  const themeId: Settings['themeId'] =
    storedThemeId && validThemeIds.includes(storedThemeId) ? storedThemeId : migratedId;
  const themeMode: Settings['themeMode'] =
    storedThemeMode === 'light' ? 'light' : storedThemeMode === 'dark' ? 'dark' : migratedMode;

  return {
    timezone: stored['timezone'] || DEFAULT_SETTINGS.timezone,
    clickupWorkspaceId: stored['clickupWorkspaceId'] || null,
    clickupUserId: stored['clickupUserId'] || null,
    standupTaskIdMon: standupMon,
    standupTaskIdTueThu: standupTueThu,
    googleClientId: stored['googleClientId'] || DEFAULT_SETTINGS.googleClientId,
    googleClientSecret: stored['googleClientSecret'] || DEFAULT_SETTINGS.googleClientSecret,
    googleConnected: stored['googleConnected'] === '1',
    clickupConnected: stored['clickupConnected'] === '1',
    jobsEnabled,
    layout,
    themeId,
    themeMode,
  };
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const dbh = requireDb();
  const write = dbh.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const asText = (v: unknown): string => {
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  const tx = dbh.transaction((entries: [string, unknown][]) => {
    for (const [k, v] of entries) write.run(k, asText(v));
  });
  tx(Object.entries(patch));

  return getSettings();
}

// ---------- timer state ----------

export function getTimerState(): TimerState {
  const row = requireDb()
    .prepare(
      'SELECT running, task_id, task_name, entry_id, started_at, resume_task_id, resume_task_name FROM timer_state WHERE id = 1'
    )
    .get() as
    | {
        running: number;
        task_id: string | null;
        task_name: string | null;
        entry_id: string | null;
        started_at: number | null;
        resume_task_id: string | null;
        resume_task_name: string | null;
      }
    | undefined;
  if (!row) {
    return {
      running: false,
      taskId: null,
      taskName: null,
      entryId: null,
      startedAt: null,
      resumeTaskId: null,
      resumeTaskName: null,
    };
  }
  return {
    running: !!row.running,
    taskId: row.task_id,
    taskName: row.task_name,
    entryId: row.entry_id,
    startedAt: row.started_at,
    resumeTaskId: row.resume_task_id,
    resumeTaskName: row.resume_task_name,
  };
}

export function saveTimerState(state: TimerState): void {
  requireDb()
    .prepare(
      `UPDATE timer_state SET
         running = ?,
         task_id = ?,
         task_name = ?,
         entry_id = ?,
         started_at = ?,
         resume_task_id = ?,
         resume_task_name = ?
       WHERE id = 1`
    )
    .run(
      state.running ? 1 : 0,
      state.taskId,
      state.taskName,
      state.entryId,
      state.startedAt,
      state.resumeTaskId,
      state.resumeTaskName
    );
}

// ---------- job logs ----------

export function logJob(
  job: JobName | string,
  outcome: JobLog['outcome'],
  detail = ''
): JobLog {
  const firedAt = Date.now();
  const info = requireDb()
    .prepare('INSERT INTO job_logs (job, fired_at, outcome, detail) VALUES (?, ?, ?, ?)')
    .run(job, firedAt, outcome, detail);
  return {
    id: Number(info.lastInsertRowid),
    job,
    firedAt,
    outcome,
    detail,
  };
}

export function listJobLogs(limit = 200): JobLog[] {
  const rows = requireDb()
    .prepare(
      'SELECT id, job, fired_at AS firedAt, outcome, detail FROM job_logs ORDER BY fired_at DESC LIMIT ?'
    )
    .all(limit) as JobLog[];
  return rows;
}

// ---------- task cache (lightweight, used by scheduler for standup task lookup) ----------

export interface CachedTaskRow {
  id: string;
  name: string;
  status: string | null;
  statusColor: string | null;
  listId: string | null;
  listName: string | null;
  priority: number | null;
  dueDate: number | null;
  url: string | null;
}

export function upsertCachedTasks(tasks: CachedTaskRow[]): void {
  const dbh = requireDb();
  const stmt = dbh.prepare(
    `INSERT INTO cached_tasks (id, name, status, status_color, list_id, list_name, priority, due_date, url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       status = excluded.status,
       status_color = excluded.status_color,
       list_id = excluded.list_id,
       list_name = excluded.list_name,
       priority = excluded.priority,
       due_date = excluded.due_date,
       url = excluded.url,
       updated_at = excluded.updated_at`
  );
  const now = Date.now();
  const tx = dbh.transaction((rows: CachedTaskRow[]) => {
    for (const t of rows) {
      stmt.run(
        t.id,
        t.name,
        t.status,
        t.statusColor,
        t.listId,
        t.listName,
        t.priority,
        t.dueDate,
        t.url,
        now
      );
    }
  });
  tx(tasks);
}

export function getCachedTask(id: string): CachedTaskRow | null {
  const row = requireDb()
    .prepare(
      `SELECT id, name, status, status_color AS statusColor, list_id AS listId, list_name AS listName,
              priority, due_date AS dueDate, url
         FROM cached_tasks WHERE id = ?`
    )
    .get(id) as CachedTaskRow | undefined;
  return row || null;
}
