-- Helm local state. All timestamps are unix ms.

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

-- Single-row authoritative timer state. id is fixed to 1.
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
