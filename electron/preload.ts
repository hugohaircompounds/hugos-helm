import { contextBridge, ipcRenderer } from 'electron';
import type {
  DescriptionPromptPayload,
  HelmApi,
  JobLog,
  TimerState,
} from '../shared/types';

const api: HelmApi = {
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

  startTimer: (id) => ipcRenderer.invoke('timer:start', id),
  stopTimer: (opts) => ipcRenderer.invoke('timer:stop', opts),
  getTimerState: () => ipcRenderer.invoke('timer:state'),
  syncTimerFromRemote: () => ipcRenderer.invoke('timer:syncFromRemote'),

  listTimeEntries: (range) => ipcRenderer.invoke('clickup:listTimeEntries', range),
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
  onJobFired: (cb) => {
    const h = (_e: unknown, log: JobLog) => cb(log);
    ipcRenderer.on('helm:job-fired', h);
    return () => ipcRenderer.removeListener('helm:job-fired', h);
  },
};

contextBridge.exposeInMainWorld('helm', api);
