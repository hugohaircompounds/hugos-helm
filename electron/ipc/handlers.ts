import { app, ipcMain, shell, BrowserWindow } from 'electron';
import type {
  CommentSegment,
  DescriptionPromptPayload,
  NewTaskPayload,
  Settings,
  Task,
  TimeEntry,
} from '../../shared/types';
import {
  getSettings,
  getTimerState,
  listJobLogs,
  saveSettings,
} from '../db';
import * as clickup from '../services/clickup';
import * as gcal from '../services/gcal';
import * as gmail from '../services/gmail';
import * as auth from '../services/auth';
import {
  setRunningDescription,
  startTimer as timerStart,
  stopTimer as timerStop,
  syncFromRemote as timerSyncFromRemote,
  timerBus,
  truncateRunningEntry,
} from '../scheduler/timer';
import { restartScheduler } from '../scheduler';

let pendingPrompt: DescriptionPromptPayload | null = null;

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  // ---------- app ----------
  ipcMain.handle('app:getVersion', () => app.getVersion());

  // ---------- settings ----------
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:save', (_e, patch: Partial<Settings>) => {
    const prev = getSettings();
    const next = saveSettings(patch);
    if (patch.timezone && patch.timezone !== prev.timezone) restartScheduler();
    if (patch.jobsEnabled) restartScheduler();
    return next;
  });

  ipcMain.handle('settings:setClickUpToken', async (_e, token: string) => {
    await auth.setClickUpToken(token);
    if (token.trim()) {
      try {
        await clickup.bootstrapWorkspace();
      } catch (e) {
        throw new Error('Token saved but bootstrap failed: ' + (e as Error).message);
      }
    }
  });

  ipcMain.handle('settings:setGoogleClientCreds', (_e, clientId: string, secret: string) => {
    auth.setGoogleClientCreds(clientId, secret);
  });

  ipcMain.handle('auth:connectGoogle', async () => {
    return auth.connectGoogle();
  });

  ipcMain.handle('auth:disconnectGoogle', async () => {
    await auth.clearGoogleCreds();
  });

  ipcMain.handle('auth:disconnectClickUp', async () => {
    await auth.clearClickUpToken();
  });

  // ---------- clickup ----------
  ipcMain.handle('clickup:listTasks', () => clickup.getAssignedTasks());
  ipcMain.handle('clickup:getTask', (_e, id: string) => clickup.getTaskDetail(id));
  ipcMain.handle(
    'clickup:updateTask',
    (_e, id: string, patch: Partial<Task>) => clickup.updateTask(id, patch)
  );
  ipcMain.handle('clickup:listSpaces', () => clickup.listSpaces());
  ipcMain.handle('clickup:getListStatuses', (_e, listId: string) =>
    clickup.getListStatuses(listId)
  );
  ipcMain.handle('clickup:loadCommentReplies', (_e, commentId: string) =>
    clickup.loadCommentReplies(commentId)
  );
  ipcMain.handle('clickup:listWorkspaceMembers', () => clickup.listWorkspaceMembers());
  ipcMain.handle(
    'clickup:createTaskComment',
    (_e, taskId: string, segments: CommentSegment[], notifyAll: boolean) =>
      clickup.createTaskComment(taskId, segments, notifyAll)
  );
  ipcMain.handle(
    'clickup:createCommentReply',
    (_e, parentCommentId: string, segments: CommentSegment[], notifyAll: boolean) =>
      clickup.createCommentReply(parentCommentId, segments, notifyAll)
  );
  ipcMain.handle('clickup:listFolders', (_e, spaceId: string) =>
    clickup.listFolders(spaceId)
  );
  ipcMain.handle('clickup:listListsInFolder', (_e, folderId: string) =>
    clickup.listListsInFolder(folderId)
  );
  ipcMain.handle('clickup:listFolderlessLists', (_e, spaceId: string) =>
    clickup.listFolderlessLists(spaceId)
  );
  ipcMain.handle(
    'clickup:createTask',
    (_e, listId: string, payload: NewTaskPayload) =>
      clickup.createTask(listId, payload)
  );

  ipcMain.handle('timer:start', async (_e, taskId: string) => {
    return timerStart(taskId, { rememberResume: false });
  });
  ipcMain.handle(
    'timer:stop',
    async (_e, opts?: { silent?: boolean }) => timerStop({ silent: !!opts?.silent })
  );
  ipcMain.handle('timer:state', () => getTimerState());
  ipcMain.handle('timer:syncFromRemote', () => timerSyncFromRemote());

  ipcMain.handle(
    'clickup:listTimeEntries',
    (_e, range: 'today' | 'week') => clickup.listTimeEntries(range)
  );
  ipcMain.handle(
    'clickup:createTimeEntry',
    (
      _e,
      opts: {
        taskId: string | null;
        start: number;
        duration: number;
        description?: string;
      }
    ) => clickup.createTimeEntry(opts)
  );
  ipcMain.handle(
    'clickup:updateTimeEntry',
    (_e, id: string, patch: Partial<TimeEntry>) => clickup.updateTimeEntry(id, patch)
  );
  ipcMain.handle('clickup:deleteTimeEntry', (_e, id: string) =>
    clickup.deleteTimeEntry(id)
  );

  // ---------- google ----------
  ipcMain.handle('gcal:list', () => gcal.listUpcomingEvents());
  ipcMain.handle('gmail:list', () => gmail.listInboxMessages());

  // ---------- misc ----------
  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url));
  ipcMain.handle('logs:list', (_e, limit?: number) => listJobLogs(limit));

  // ---------- description prompt bridge ----------
  ipcMain.handle('prompt:submit', (_e, _entryId: string | null, text: string) => {
    // The renderer submits the edited description. Route it to updateTimeEntry
    // if we have an entryId from the pending prompt.
    if (pendingPrompt?.entryId) {
      clickup
        .updateTimeEntry(pendingPrompt.entryId, { description: text })
        .catch(() => {
          /* swallow — logged via job table if needed */
        });
    }
    pendingPrompt = null;
  });
  ipcMain.handle('prompt:dismiss', () => {
    pendingPrompt = null;
  });

  ipcMain.handle('timer:setRunningDescription', (_e, text: string) => {
    setRunningDescription(typeof text === 'string' ? text : '');
  });

  ipcMain.handle('timer:truncateRunningEntry', async (_e, at: number) => {
    if (!Number.isFinite(at)) return;
    await truncateRunningEntry(at);
  });

  // Relay timer + prompt events to the renderer.
  timerBus.on('change', (state) => {
    const w = getWindow();
    if (!w || w.isDestroyed()) return;
    w.webContents.send('helm:timer-changed', state);
  });
  timerBus.on('description-prompt', (payload) => {
    pendingPrompt = payload;
    const w = getWindow();
    if (!w || w.isDestroyed()) return;
    w.webContents.send('helm:description-prompt', payload);
  });
  timerBus.on('eod-focus-entry', (payload) => {
    const w = getWindow();
    if (!w || w.isDestroyed()) return;
    w.webContents.send('helm:eod-focus-entry', payload);
  });
  timerBus.on('idle-truncate-prompt', (payload) => {
    const w = getWindow();
    if (!w || w.isDestroyed()) return;
    w.webContents.send('helm:idle-truncate-prompt', payload);
  });
}
