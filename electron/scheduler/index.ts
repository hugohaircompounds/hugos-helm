// node-cron wiring. The scheduler is the single source of truth for time —
// every fire comes from `new Date()` inside the main process, never the renderer.

import cron, { type ScheduledTask } from 'node-cron';
import { getSettings, logJob } from '../db';
import { jobs } from './jobs';

interface ActiveJob {
  name: string;
  task: ScheduledTask;
}

let active: ActiveJob[] = [];
let currentTz: string | null = null;

export function startScheduler(): void {
  const s = getSettings();
  currentTz = s.timezone;
  scheduleAll();
  logJob('scheduler-start', 'ok', `tz=${currentTz}`);
}

export function restartScheduler(): void {
  stopAll();
  startScheduler();
}

function stopAll(): void {
  for (const a of active) {
    try {
      a.task.stop();
    } catch {
      /* noop */
    }
  }
  active = [];
}

function scheduleAll(): void {
  const s = getSettings();
  const tz = s.timezone || 'America/New_York';
  for (const j of jobs) {
    if (s.jobsEnabled[j.name] === false) continue;
    const task = cron.schedule(
      j.cron,
      async () => {
        const now = new Date();
        try {
          await j.run(now);
        } catch (e) {
          logJob(j.name, 'error', (e as Error).message);
        }
      },
      { timezone: tz }
    );
    active.push({ name: j.name, task });
  }
}

export function getSchedulerStatus(): { timezone: string | null; jobs: string[] } {
  return { timezone: currentTz, jobs: active.map((a) => a.name) };
}
