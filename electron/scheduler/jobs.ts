// Job definitions. Each job is a pure function taking the current Date
// (for logging) and effecting state through the timer service + db.

import { BrowserWindow, Notification } from 'electron';
import type { JobName } from '../../shared/types';
import {
  getSettings,
  getTimerState,
  logJob,
} from '../db';
import { pauseForLater, resumePaused, startTimer, stopTimer, timerBus } from './timer';

const STANDUP_MAX_MS = 20 * 60 * 1000;

interface CronDef {
  name: JobName;
  cron: string; // node-cron expression
  run: (now: Date) => Promise<void>;
}

async function pauseForStandup(name: JobName, standupId: string | null): Promise<void> {
  if (!standupId) {
    logJob(name, 'skipped', `no task configured for ${name}`);
    return;
  }
  const prev = getTimerState();
  try {
    // rememberResume preserves the prior task so stopping standup auto-resumes it.
    await startTimer(standupId, { rememberResume: prev.running });
    logJob(
      name,
      'ok',
      prev.running
        ? `paused "${prev.taskName}" and started standup`
        : 'started standup (no prior timer)'
    );
  } catch (e) {
    logJob(name, 'error', (e as Error).message);
  }
}

export const jobs: CronDef[] = [
  {
    name: 'standup-mon',
    cron: '0 10 * * 1', // Mon 10:00 — "Monday Stand Up - Weekly Planning"
    run: async () => pauseForStandup('standup-mon', getSettings().standupTaskIdMon),
  },
  {
    name: 'standup-tue-thu',
    cron: '30 9 * * 2-4', // Tue/Wed/Thu 09:30 — daily standup
    run: async () =>
      pauseForStandup('standup-tue-thu', getSettings().standupTaskIdTueThu),
  },
  {
    name: 'standup-stop-check',
    cron: '* * * * *', // every minute
    run: async () => {
      const s = getSettings();
      const standupIds = [s.standupTaskIdMon, s.standupTaskIdTueThu].filter(
        (id): id is string => !!id
      );
      if (standupIds.length === 0) return;
      const state = getTimerState();
      if (!state.running || !state.taskId || !standupIds.includes(state.taskId)) return;
      const startedAt = state.startedAt || 0;
      if (Date.now() - startedAt < STANDUP_MAX_MS) return;
      try {
        // stopTimer will auto-resume the paused task because the stopped task
        // is a standup task and resumeTaskId is set.
        await stopTimer({ silent: true });
        logJob('standup-stop-check', 'ok', 'stopped standup after 20m');
      } catch (e) {
        logJob('standup-stop-check', 'error', (e as Error).message);
      }
    },
  },
  {
    name: 'lunch-start',
    cron: '0 13 * * 1-5',
    run: async () => {
      const prev = getTimerState();
      if (!prev.running) {
        logJob('lunch-start', 'skipped', 'no timer running');
        return;
      }
      try {
        await pauseForLater();
        logJob('lunch-start', 'ok', `paused "${prev.taskName}" for lunch`);
      } catch (e) {
        logJob('lunch-start', 'error', (e as Error).message);
      }
    },
  },
  {
    name: 'lunch-end',
    cron: '0 14 * * 1-5',
    run: async () => {
      const state = getTimerState();
      if (!state.resumeTaskId) {
        logJob('lunch-end', 'skipped', 'nothing to resume');
        return;
      }
      try {
        await resumePaused();
        logJob('lunch-end', 'ok', `resumed "${state.resumeTaskName}"`);
      } catch (e) {
        logJob('lunch-end', 'error', (e as Error).message);
      }
    },
  },
  {
    name: 'eod-prompt',
    cron: '55 16 * * 1-5',
    run: async () => {
      try {
        const state = getTimerState();
        if (!state.running) {
          logJob('eod-prompt', 'skipped', 'no timer running');
          return;
        }

        // Tell the renderer to switch to Timesheet and open the running
        // entry's editor so the user can type a description before the
        // 16:59 auto-stop flushes it via stopTimer().
        timerBus.emit('eod-focus-entry', {
          entryId: state.entryId,
          taskId: state.taskId,
        });

        // OS-level reminder for when the window is unfocused or hidden.
        if (Notification.isSupported()) {
          const notif = new Notification({
            title: 'Helm — write your EOD description',
            body: state.taskName
              ? `Add a note for "${state.taskName}" before 4:59 PM stop.`
              : 'Add a note for the current task before 4:59 PM stop.',
          });
          notif.on('click', () => {
            const win = BrowserWindow.getAllWindows()[0];
            if (!win) return;
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
          });
          notif.show();
        }

        logJob(
          'eod-prompt',
          'ok',
          `focus emitted for "${state.taskName || state.taskId}"`
        );
      } catch (e) {
        logJob('eod-prompt', 'error', (e as Error).message);
      }
    },
  },
  {
    name: 'eod-stop',
    cron: '59 16 * * 1-5',
    run: async () => {
      const state = getTimerState();
      if (!state.running) {
        logJob('eod-stop', 'skipped', 'nothing running');
        return;
      }
      try {
        await stopTimer({ silent: true, skipAutoResume: true });
        logJob('eod-stop', 'ok', `stopped "${state.taskName}"`);
      } catch (e) {
        logJob('eod-stop', 'error', (e as Error).message);
      }
    },
  },
];
