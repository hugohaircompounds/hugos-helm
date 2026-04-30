import { contextBridge, ipcRenderer } from 'electron';
import type {
  DescriptionPromptPayload,
  EodFocusEntryPayload,
  HelmApi,
  IdleTruncatePromptPayload,
  JobLog,
  TimerState,
} from '../shared/types';

const api: HelmApi = {
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  setClickUpToken: (token) => ipcRenderer.invoke('settings:setClickUpToken', token),
  setGoogleClientCreds: (id, secret) =>
    ipcRenderer.invoke('settings:setGoogleClientCreds', id, secret),
  connectGoogle: () => ipcRenderer.invoke('auth:connectGoogle'),
  disconnectGoogle: () => ipcRenderer.invoke('auth:disconnectGoogle'),
  disconnectClickUp: () => ipcRenderer.invoke('auth:disconnectClickUp'),

  listTasks: () => ipcRenderer.invoke('clickup:listTasks'),
  getTask: (id) => ipcRenderer.invoke('clickup:getTask', id),
  updateTask: (id, patch) => ipcRenderer.invoke('clickup:updateTask', id, patch),
  listSpaces: () => ipcRenderer.invoke('clickup:listSpaces'),
  getListStatuses: (listId) => ipcRenderer.invoke('clickup:getListStatuses', listId),
  loadCommentReplies: (commentId) =>
    ipcRenderer.invoke('clickup:loadCommentReplies', commentId),
  listWorkspaceMembers: () => ipcRenderer.invoke('clickup:listWorkspaceMembers'),
  createTaskComment: (taskId, segments, notifyAll) =>
    ipcRenderer.invoke('clickup:createTaskComment', taskId, segments, notifyAll),
  createCommentReply: (parentCommentId, segments, notifyAll) =>
    ipcRenderer.invoke('clickup:createCommentReply', parentCommentId, segments, notifyAll),
  listFolders: (spaceId) => ipcRenderer.invoke('clickup:listFolders', spaceId),
  listListsInFolder: (folderId) =>
    ipcRenderer.invoke('clickup:listListsInFolder', folderId),
  listFolderlessLists: (spaceId) =>
    ipcRenderer.invoke('clickup:listFolderlessLists', spaceId),
  createTask: (listId, payload) =>
    ipcRenderer.invoke('clickup:createTask', listId, payload),

  startTimer: (id) => ipcRenderer.invoke('timer:start', id),
  stopTimer: (opts) => ipcRenderer.invoke('timer:stop', opts),
  getTimerState: () => ipcRenderer.invoke('timer:state'),
  syncTimerFromRemote: () => ipcRenderer.invoke('timer:syncFromRemote'),
  truncateRunningEntry: (at) => ipcRenderer.invoke('timer:truncateRunningEntry', at),
  updateRunningEntryStart: (start) =>
    ipcRenderer.invoke('timer:updateRunningEntryStart', start),

  listTimeEntries: (range) => ipcRenderer.invoke('clickup:listTimeEntries', range),
  createTimeEntry: (opts) => ipcRenderer.invoke('clickup:createTimeEntry', opts),
  updateTimeEntry: (id, patch) =>
    ipcRenderer.invoke('clickup:updateTimeEntry', id, patch),
  deleteTimeEntry: (id) => ipcRenderer.invoke('clickup:deleteTimeEntry', id),

  listCalendarEvents: () => ipcRenderer.invoke('gcal:list'),
  listEmails: () => ipcRenderer.invoke('gmail:list'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  listJobLogs: (limit) => ipcRenderer.invoke('logs:list', limit),
  submitDescriptionPrompt: (entryId, text) =>
    ipcRenderer.invoke('prompt:submit', entryId, text),
  dismissDescriptionPrompt: () => ipcRenderer.invoke('prompt:dismiss'),
  setRunningDescription: (text) =>
    ipcRenderer.invoke('timer:setRunningDescription', text),
  flushRunningDescription: (text) =>
    ipcRenderer.invoke('timer:flushRunningDescription', text),
  getRunningDescription: () => ipcRenderer.invoke('timer:getRunningDescription'),

  onTimerChanged: (cb) => {
    const h = (_e: unknown, state: TimerState) => cb(state);
    ipcRenderer.on('helm:timer-changed', h);
    return () => ipcRenderer.removeListener('helm:timer-changed', h);
  },
  onDescriptionPrompt: (cb) => {
    const h = (_e: unknown, payload: DescriptionPromptPayload) => cb(payload);
    ipcRenderer.on('helm:description-prompt', h);
    return () => ipcRenderer.removeListener('helm:description-prompt', h);
  },
  onEodFocusEntry: (cb) => {
    const h = (_e: unknown, payload: EodFocusEntryPayload) => cb(payload);
    ipcRenderer.on('helm:eod-focus-entry', h);
    return () => ipcRenderer.removeListener('helm:eod-focus-entry', h);
  },
  onIdleTruncatePrompt: (cb) => {
    const h = (_e: unknown, payload: IdleTruncatePromptPayload) => cb(payload);
    ipcRenderer.on('helm:idle-truncate-prompt', h);
    return () => ipcRenderer.removeListener('helm:idle-truncate-prompt', h);
  },
  onJobFired: (cb) => {
    const h = (_e: unknown, log: JobLog) => cb(log);
    ipcRenderer.on('helm:job-fired', h);
    return () => ipcRenderer.removeListener('helm:job-fired', h);
  },
};

contextBridge.exposeInMainWorld('helm', api);
