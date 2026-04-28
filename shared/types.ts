// Shared types between main (Electron) and renderer (React).
// Keep this file free of Node/Electron imports.

export type Priority = 1 | 2 | 3 | 4 | null;

export interface Task {
  id: string;
  name: string;
  description: string | null;
  status: string;
  statusColor: string | null;
  priority: Priority;
  dueDate: number | null; // unix ms
  url: string;
  listId: string | null;
  listName: string | null;
  parentId: string | null;
  // True when this task only appears in TaskList because its space is in
  // Settings.extraTaskSpaceIds — i.e. the user is NOT a direct assignee.
  // Used by TaskList to render a "Lab" pill so the user can tell why an
  // unassigned task is showing up.
  viaSpace?: boolean;
}

export interface ClickUpSpace {
  id: string;
  name: string;
}

export interface TaskDetail extends Task {
  subtasks: Task[];
  comments: Comment[];
}

export interface Comment {
  id: string;
  text: string;
  user: string;
  dateCreated: number;
}

export interface TimeEntry {
  id: string;
  taskId: string | null;
  taskName: string | null;
  description: string;
  start: number; // unix ms
  end: number | null; // null = running
  duration: number; // ms
}

export interface TimerState {
  running: boolean;
  taskId: string | null;
  taskName: string | null;
  entryId: string | null;
  startedAt: number | null; // unix ms
  // The timer the scheduler intends to resume (e.g. after lunch or standup)
  resumeTaskId: string | null;
  resumeTaskName: string | null;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  calendarName: string;
  title: string;
  description: string | null;
  location: string | null;
  start: number; // unix ms
  end: number;
  allDay: boolean;
  color: string;
  htmlLink: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  unread: boolean;
  date: number; // unix ms
  url: string; // mail.google.com/mail/u/0/#inbox/{messageId}
}

export type JobName =
  | 'standup-mon'
  | 'standup-tue-thu'
  | 'standup-stop-check'
  | 'lunch-start'
  | 'lunch-end'
  | 'eod-prompt'
  | 'eod-stop';

export interface JobLog {
  id: number;
  job: JobName | string;
  firedAt: number;
  outcome: 'ok' | 'skipped' | 'error';
  detail: string;
}

export interface LayoutState {
  leftPct: number; // % width of tasks column
  midPct: number; // % width of detail column (right col = 100 - leftPct - midPct)
}

export type ThemeId =
  | 'default'
  | 'tactical-hud'
  | 'ethereal'
  | 'neon'
  | 'cyberpunk'
  | 'terraria'
  | 'factorio'
  | 'ror2';

export type ThemeMode = 'dark' | 'light';

export interface ThemeLexicon {
  /** Panel title over the task list */
  taskListTitle: string;
  /** Panel title over the task detail pane */
  detailTitle: string;
  /** Suffix for total count in the task list header, e.g. "14 quests" */
  tasksNoun: string;
  /** Short verb for start button ("Start", "Go", "Cast", "Activate") */
  startVerb: string;
  /** Short verb for stop button ("Stop", "Halt", "Abort", "Kill") */
  stopVerb: string;
  /** Short verb for sync/fetch button */
  syncVerb: string;
  /** Status group label for tasks that are in progress */
  inProgressLabel: string;
  /** Status group label for tasks that are open / not started */
  openLabel: string;
  /** Label over the timer bar's task name ("Current Task", "Active Mission") */
  currentTaskLabel: string;
  /** Label over the timer bar's elapsed time ("Elapsed", "T+", "Channeling") */
  elapsedLabel: string;
  /** Shown when no timer is running */
  noTimerLabel: string;
  /** Header over the description textarea */
  descriptionHeading: string;
  /** Header over the subtasks list */
  subtasksHeading: string;
}

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  group: 'subtle' | 'sci-fi' | 'game';
  blurb: string;
  lexicon: ThemeLexicon;
}

const DEFAULT_LEXICON: ThemeLexicon = {
  taskListTitle: 'Tasks',
  detailTitle: 'Task Detail',
  tasksNoun: 'tasks',
  startVerb: 'Start',
  stopVerb: 'Stop',
  syncVerb: 'Sync',
  inProgressLabel: 'In progress',
  openLabel: 'Open',
  currentTaskLabel: 'Current task',
  elapsedLabel: 'Elapsed',
  noTimerLabel: 'No active timer',
  descriptionHeading: 'Description',
  subtasksHeading: 'Subtasks',
};

export const THEMES: ThemeInfo[] = [
  {
    id: 'default',
    label: 'Default',
    group: 'subtle',
    blurb: 'Clean, quiet, no opinions',
    lexicon: DEFAULT_LEXICON,
  },
  {
    id: 'tactical-hud',
    label: 'Tactical HUD',
    group: 'sci-fi',
    blurb: 'Cyan + orange ops console',
    lexicon: {
      taskListTitle: 'Task Registry',
      detailTitle: 'Target Dossier',
      tasksNoun: 'ops',
      startVerb: 'Go',
      stopVerb: 'Abort',
      syncVerb: 'Sync',
      inProgressLabel: 'Active',
      openLabel: 'Queued',
      currentTaskLabel: 'Current Op',
      elapsedLabel: 'T+',
      noTimerLabel: 'Standby',
      descriptionHeading: 'Briefing',
      subtasksHeading: 'Objectives',
    },
  },
  {
    id: 'ethereal',
    label: 'Ethereal',
    group: 'sci-fi',
    blurb: 'Soft glow, glass, starfield',
    lexicon: {
      taskListTitle: 'Intentions',
      detailTitle: 'Focus',
      tasksNoun: 'intentions',
      startVerb: 'Begin',
      stopVerb: 'Pause',
      syncVerb: 'Refresh',
      inProgressLabel: 'Unfolding',
      openLabel: 'Waiting',
      currentTaskLabel: 'Now',
      elapsedLabel: 'Presence',
      noTimerLabel: 'Stillness',
      descriptionHeading: 'Notes',
      subtasksHeading: 'Threads',
    },
  },
  {
    id: 'neon',
    label: 'Neon',
    group: 'sci-fi',
    blurb: 'Magenta + cyan grid, loud',
    lexicon: {
      taskListTitle: 'Task Stack',
      detailTitle: 'Signal',
      tasksNoun: 'runs',
      startVerb: 'Run',
      stopVerb: 'Kill',
      syncVerb: 'Ping',
      inProgressLabel: 'Hot',
      openLabel: 'Queue',
      currentTaskLabel: 'Live',
      elapsedLabel: 'Uptime',
      noTimerLabel: 'Idle',
      descriptionHeading: 'Payload',
      subtasksHeading: 'Subroutines',
    },
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk 2077',
    group: 'game',
    blurb: 'Yellow brutalism, jack in',
    lexicon: {
      taskListTitle: 'Task Stack',
      detailTitle: 'Brain Dance',
      tasksNoun: 'gigs',
      startVerb: 'Jack In',
      stopVerb: 'Flatline',
      syncVerb: 'Scan',
      inProgressLabel: 'Jacked In',
      openLabel: 'Open',
      currentTaskLabel: 'Active Gig',
      elapsedLabel: 'Burn',
      noTimerLabel: 'Cold',
      descriptionHeading: 'Intel',
      subtasksHeading: 'Waypoints',
    },
  },
  {
    id: 'terraria',
    label: 'Terraria',
    group: 'game',
    blurb: 'Wood + parchment, pixel art',
    lexicon: {
      taskListTitle: 'Quest Log',
      detailTitle: 'Quest Scroll',
      tasksNoun: 'quests',
      startVerb: 'Use',
      stopVerb: 'Stow',
      syncVerb: 'Scry',
      inProgressLabel: 'Active',
      openLabel: 'Available',
      currentTaskLabel: 'Current Quest',
      elapsedLabel: 'Duration',
      noTimerLabel: 'Resting',
      descriptionHeading: 'Lore',
      subtasksHeading: 'Objectives',
    },
  },
  {
    id: 'factorio',
    label: 'Factorio',
    group: 'game',
    blurb: 'Industrial orange, rivets, LEDs',
    lexicon: {
      taskListTitle: 'Production Queue',
      detailTitle: 'Recipe Inspector',
      tasksNoun: 'recipes',
      startVerb: 'Craft',
      stopVerb: 'Halt',
      syncVerb: 'Sync',
      inProgressLabel: 'Crafting',
      openLabel: 'Ready',
      currentTaskLabel: 'Active Recipe',
      elapsedLabel: 'T+',
      noTimerLabel: 'Assembler Idle',
      descriptionHeading: 'Spec',
      subtasksHeading: 'Steps',
    },
  },
  {
    id: 'ror2',
    label: 'Risk of Rain 2',
    group: 'game',
    blurb: 'Teleporter cyan, rarity frames',
    lexicon: {
      taskListTitle: 'Item Pool',
      detailTitle: 'Logbook',
      tasksNoun: 'items',
      startVerb: 'Activate',
      stopVerb: 'Halt',
      syncVerb: 'Scan',
      inProgressLabel: 'In Combat',
      openLabel: 'Available',
      currentTaskLabel: 'Active Mission',
      elapsedLabel: 'Elapsed',
      noTimerLabel: 'No Mission',
      descriptionHeading: 'Field Notes',
      subtasksHeading: 'Challenges',
    },
  },
];

export interface TaskFiltersState {
  statuses: string[];
  listNames: string[];
  priorities: number[]; // 1 | 2 | 3 | 4
  dueFrom: number | null; // unix ms
  dueTo: number | null;
}

export interface Settings {
  timezone: string; // IANA, default America/New_York
  clickupWorkspaceId: string | null;
  clickupUserId: string | null;
  standupTaskIdMon: string | null; // "Monday Stand Up - Weekly Planning"
  standupTaskIdTueThu: string | null; // Tue/Wed/Thu daily standup
  googleClientId: string | null;
  googleClientSecret: string | null;
  googleConnected: boolean;
  clickupConnected: boolean;
  jobsEnabled: Record<string, boolean>; // keyed by JobName
  layout: LayoutState;
  themeId: ThemeId;
  themeMode: ThemeMode;
  // User-customized order of status groups in TaskList. Keyed by a list scope
  // identifier ('__all__' for the cross-list default view). Unknown statuses
  // fall back to ClickUp's orderindex.
  taskStatusGroupOrder: Record<string, string[]>;
  // Status group names the user has collapsed in TaskList.
  collapsedStatusGroups: string[];
  // Last-used filter state in TaskList; persists across restarts.
  taskFilters: TaskFiltersState;
  // User-pinned task ids — render in a sticky "Pinned" group at the top of
  // TaskList regardless of status. Insertion order is preserved.
  pinnedTaskIds: string[];
  // Local-time work-hour bounds in minutes from midnight. Used by TimelineBar
  // to render diagonal "untracked gap" stripes during work hours where no
  // entry covers the minute. Defaults: 8:00 → 17:00.
  workHoursStart: number;
  workHoursEnd: number;
  // Extra ClickUp space ids to pull tasks from regardless of assignee. Tasks
  // arriving via this path get `viaSpace: true` so the UI can flag them.
  extraTaskSpaceIds: string[];
  // When false, getAssignedTasks skips the assignee-filtered query entirely
  // and pulls only from extraTaskSpaceIds. Use when ClickUp's assignee path
  // is too slow and the user routes their work through a designated space.
  assigneeFilterEnabled: boolean;
  // UI-only status grouping. Each equivalence merges multiple raw ClickUp
  // statuses into one Helm-side display group. Purely cosmetic — never
  // written back to ClickUp. Order in the array is preserved.
  statusEquivalences: StatusEquivalence[];
  // Idle / lock detection. When the OS reports the screen locked or the
  // system suspended for longer than `idleTimeoutMin` while a timer was
  // running, the renderer is prompted to truncate the running entry.
  idleDetectionEnabled: boolean;
  idleTimeoutMin: number;
  lockTriggersIdle: boolean;
}

export interface IdleTruncatePromptPayload {
  idleStartedAt: number;
  idleEndedAt: number;
  taskId: string | null;
  taskName: string | null;
}

export interface StatusEquivalence {
  groupName: string;
  members: string[];
  color?: string;
}

export interface ListStatus {
  status: string;
  color: string;
  orderindex: number;
}

export interface DescriptionPromptPayload {
  kind: 'manual-stop' | 'eod';
  entryId: string | null;
  taskId: string | null;
  defaultText: string;
  taskTitles: string[]; // for EOD only
}

export interface EodFocusEntryPayload {
  entryId: string | null;
  taskId: string | null;
}

// IPC channel contract — the renderer's preload-exposed API shape.
export interface HelmApi {
  // settings
  getSettings: () => Promise<Settings>;
  saveSettings: (patch: Partial<Settings>) => Promise<Settings>;
  setClickUpToken: (token: string) => Promise<void>;
  setGoogleClientCreds: (clientId: string, clientSecret: string) => Promise<void>;
  connectGoogle: () => Promise<{ ok: boolean; error?: string }>;
  disconnectGoogle: () => Promise<void>;
  disconnectClickUp: () => Promise<void>;

  // clickup
  listTasks: () => Promise<Task[]>;
  getTask: (taskId: string) => Promise<TaskDetail>;
  listSpaces: () => Promise<ClickUpSpace[]>;
  getListStatuses: (listId: string) => Promise<ListStatus[]>;
  updateTask: (
    taskId: string,
    patch: Partial<Pick<Task, 'name' | 'description' | 'status' | 'priority' | 'dueDate'>>
  ) => Promise<Task>;
  startTimer: (taskId: string) => Promise<TimerState>;
  stopTimer: (opts?: { silent?: boolean }) => Promise<TimerState>;
  getTimerState: () => Promise<TimerState>;
  syncTimerFromRemote: () => Promise<TimerState>;
  // Stop the running timer and retroactively rewrite its end timestamp to
  // `at`. Used by the idle-truncate flow when the user was locked/away.
  truncateRunningEntry: (at: number) => Promise<void>;
  listTimeEntries: (range: 'today' | 'week') => Promise<TimeEntry[]>;
  createTimeEntry: (opts: {
    taskId: string | null;
    start: number;
    duration: number;
    description?: string;
  }) => Promise<TimeEntry>;
  updateTimeEntry: (
    entryId: string,
    patch: Partial<Pick<TimeEntry, 'description' | 'start' | 'end' | 'duration'>>
  ) => Promise<TimeEntry>;
  deleteTimeEntry: (entryId: string) => Promise<void>;

  // google
  listCalendarEvents: () => Promise<CalendarEvent[]>;
  listEmails: () => Promise<EmailMessage[]>;
  openExternal: (url: string) => Promise<void>;

  // scheduler / audit
  listJobLogs: (limit?: number) => Promise<JobLog[]>;
  submitDescriptionPrompt: (entryId: string | null, text: string) => Promise<void>;
  dismissDescriptionPrompt: () => Promise<void>;
  // Buffer the description the user is typing for the running timer; flushed
  // by stopTimer() when the timer stops (manual or scheduler-driven). Pass
  // empty string to clear.
  setRunningDescription: (text: string) => Promise<void>;

  // events (renderer subscribes to main)
  onTimerChanged: (cb: (state: TimerState) => void) => () => void;
  onDescriptionPrompt: (cb: (payload: DescriptionPromptPayload) => void) => () => void;
  onEodFocusEntry: (cb: (payload: EodFocusEntryPayload) => void) => () => void;
  onIdleTruncatePrompt: (cb: (payload: IdleTruncatePromptPayload) => void) => () => void;
  onJobFired: (cb: (log: JobLog) => void) => () => void;
}

declare global {
  interface Window {
    helm: HelmApi;
  }
}
