import type {
  Comment,
  ListStatus,
  Priority,
  Task,
  TaskDetail,
  TimeEntry,
} from '../../shared/types';
import { getClickUpToken } from './auth';
import { getSettings, saveSettings, upsertCachedTasks } from '../db';

const BASE = 'https://api.clickup.com/api/v2';

async function headers(): Promise<Record<string, string>> {
  const token = await getClickUpToken();
  if (!token) throw new Error('ClickUp token not set. Paste it in Settings.');
  return {
    Authorization: token,
    'Content-Type': 'application/json',
  };
}

async function cu<T>(
  path: string,
  init: RequestInit = {},
  opts: { allowEmpty?: boolean } = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(await headers()), ...(init.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp ${init.method || 'GET'} ${path} ${res.status}: ${body}`);
  }
  if (opts.allowEmpty && res.status === 204) return undefined as T;
  const txt = await res.text();
  if (!txt) return undefined as T;
  return JSON.parse(txt) as T;
}

// ---------- bootstrap (workspace + user id) ----------

interface CUUser {
  user: { id: number; username: string; email: string };
}

interface CUTeams {
  teams: { id: string; name: string; members: { user: { id: number } }[] }[];
}

export async function bootstrapWorkspace(): Promise<{
  workspaceId: string;
  userId: string;
}> {
  const me = await cu<CUUser>('/user');
  const teams = await cu<CUTeams>('/team');
  if (!teams.teams.length) throw new Error('No ClickUp workspaces found for this user.');
  // Prefer whatever workspace is already configured; otherwise pick the first.
  const existing = getSettings().clickupWorkspaceId;
  const picked =
    teams.teams.find((t) => t.id === existing) || teams.teams[0];
  const userId = String(me.user.id);
  saveSettings({ clickupWorkspaceId: picked.id, clickupUserId: userId });
  return { workspaceId: picked.id, userId };
}

async function ensureWorkspace(): Promise<{ workspaceId: string; userId: string }> {
  const s = getSettings();
  if (s.clickupWorkspaceId && s.clickupUserId) {
    return { workspaceId: s.clickupWorkspaceId, userId: s.clickupUserId };
  }
  return bootstrapWorkspace();
}

// ---------- tasks ----------

interface CUTask {
  id: string;
  name: string;
  text_content: string | null;
  description: string | null;
  status?: { status: string; color: string };
  priority?: { priority: string } | null;
  due_date: string | null;
  url: string;
  parent: string | null;
  list?: { id: string; name: string };
}

const PRIORITY_MAP: Record<string, Priority> = {
  urgent: 1,
  high: 2,
  normal: 3,
  low: 4,
};

function normalizeTask(t: CUTask): Task {
  const priorityLabel = t.priority?.priority?.toLowerCase() || null;
  return {
    id: t.id,
    name: t.name,
    description: t.description || t.text_content || null,
    status: t.status?.status || 'open',
    statusColor: t.status?.color || null,
    priority: priorityLabel ? PRIORITY_MAP[priorityLabel] ?? null : null,
    dueDate: t.due_date ? Number(t.due_date) : null,
    url: t.url,
    listId: t.list?.id || null,
    listName: t.list?.name || null,
    parentId: t.parent || null,
  };
}

export async function getAssignedTasks(): Promise<Task[]> {
  const { workspaceId, userId } = await ensureWorkspace();
  // ClickUp wants array-style query params (assignees[]=..., not assignees=...).
  const baseParams = new URLSearchParams({
    include_closed: 'false',
    subtasks: 'true',
    order_by: 'updated',
    reverse: 'true',
  });
  baseParams.append('assignees[]', userId);
  interface Resp {
    tasks: CUTask[];
    last_page?: boolean;
  }
  const all: CUTask[] = [];
  let page = 0;
  while (true) {
    baseParams.set('page', String(page));
    const { tasks, last_page } = await cu<Resp>(
      `/team/${workspaceId}/task?${baseParams.toString()}`
    );
    all.push(...tasks);
    if (last_page || tasks.length === 0) break;
    page++;
    if (page > 10) break; // hard safety
  }
  const normalized = all.map(normalizeTask);
  upsertCachedTasks(
    normalized.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      statusColor: t.statusColor,
      listId: t.listId,
      listName: t.listName,
      priority: t.priority,
      dueDate: t.dueDate,
      url: t.url,
    }))
  );
  return normalized;
}

export async function getTaskDetail(taskId: string): Promise<TaskDetail> {
  interface CommentsResp {
    comments: {
      id: string;
      comment_text: string;
      user?: { username: string };
      date: string;
    }[];
  }
  const encoded = encodeURIComponent(taskId);
  // Fire both requests concurrently. Comments are best-effort; swallow errors
  // so a permissions blip doesn't bring the whole detail load down.
  const [t, commentsResp] = await Promise.all([
    cu<CUTask & { subtasks?: CUTask[] }>(`/task/${encoded}?include_subtasks=true`),
    cu<CommentsResp>(`/task/${encoded}/comment`).catch(
      () => ({ comments: [] } as CommentsResp)
    ),
  ]);
  const comments: Comment[] = commentsResp.comments.map((c0) => ({
    id: c0.id,
    text: c0.comment_text,
    user: c0.user?.username || 'unknown',
    dateCreated: Number(c0.date),
  }));
  const subtasks = (t.subtasks || []).map(normalizeTask);
  return { ...normalizeTask(t), subtasks, comments };
}

// ClickUp's `GET /list/{id}` response includes the list's configured statuses.
// Used by the task detail pane's status dropdown so only valid statuses are offered.
export async function getListStatuses(listId: string): Promise<ListStatus[]> {
  interface CUListStatus {
    status: string;
    color: string;
    orderindex: number;
    type?: string;
  }
  interface Resp {
    statuses?: CUListStatus[];
  }
  const resp = await cu<Resp>(`/list/${encodeURIComponent(listId)}`);
  const raw = resp.statuses || [];
  return raw
    .map((s) => ({
      status: s.status,
      color: s.color,
      orderindex: typeof s.orderindex === 'number' ? s.orderindex : 0,
    }))
    .sort((a, b) => a.orderindex - b.orderindex);
}

export async function updateTask(
  taskId: string,
  patch: Partial<Pick<Task, 'name' | 'description' | 'status' | 'priority' | 'dueDate'>>
): Promise<Task> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.priority !== undefined) body.priority = patch.priority;
  if (patch.dueDate !== undefined) body.due_date = patch.dueDate;
  const updated = await cu<CUTask>(`/task/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return normalizeTask(updated);
}

// ---------- time entries ----------

interface CUTimeEntry {
  id: string;
  task?: { id: string; name: string } | null;
  description: string | null;
  start: string;
  end: string | null; // "0" or null when running
  duration: string;
}

function normalizeEntry(e: CUTimeEntry): TimeEntry {
  const start = Number(e.start);
  const endRaw = e.end;
  const running = !endRaw || endRaw === '0' || endRaw === '';
  const end = running ? null : Number(endRaw);
  return {
    id: e.id,
    taskId: e.task?.id || null,
    taskName: e.task?.name || null,
    description: e.description || '',
    start,
    end,
    duration: Number(e.duration) || (end ? end - start : Date.now() - start),
  };
}

export async function startTimer(taskId: string): Promise<TimeEntry> {
  const { workspaceId } = await ensureWorkspace();
  interface Resp {
    data: CUTimeEntry;
  }
  const resp = await cu<Resp>(`/team/${workspaceId}/time_entries/start`, {
    method: 'POST',
    body: JSON.stringify({ tid: taskId }),
  });
  return normalizeEntry(resp.data);
}

export async function stopTimer(): Promise<TimeEntry | null> {
  const { workspaceId } = await ensureWorkspace();
  interface Resp {
    data: CUTimeEntry | null;
  }
  try {
    const resp = await cu<Resp>(`/team/${workspaceId}/time_entries/stop`, {
      method: 'POST',
    });
    return resp.data ? normalizeEntry(resp.data) : null;
  } catch (e) {
    // ClickUp returns 400 when no timer is running. Treat as a no-op.
    const msg = (e as Error).message;
    if (/no timer/i.test(msg) || /not running/i.test(msg) || /400/.test(msg)) {
      return null;
    }
    throw e;
  }
}

export async function getCurrentTimer(): Promise<TimeEntry | null> {
  const { workspaceId } = await ensureWorkspace();
  interface Resp {
    data: CUTimeEntry | Record<string, never> | null;
  }
  const resp = await cu<Resp>(`/team/${workspaceId}/time_entries/current`);
  if (!resp.data || !('id' in resp.data)) return null;
  return normalizeEntry(resp.data as CUTimeEntry);
}

export async function listTimeEntries(range: 'today' | 'week'): Promise<TimeEntry[]> {
  const { workspaceId, userId } = await ensureWorkspace();
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'week') {
    // Monday start
    const day = start.getDay(); // 0=Sun
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
  }
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    start_date: String(start.getTime()),
    end_date: String(end.getTime()),
    assignee: userId,
  });
  interface Resp {
    data: CUTimeEntry[];
    last_page?: boolean;
  }
  // Defensive pagination — ClickUp's /time_entries returns ~100 per page by
  // default. A typical week is well under that, but during heavy weeks we
  // would silently truncate. Mirrors the loop in getAssignedTasks above.
  const all: CUTimeEntry[] = [];
  let page = 0;
  while (true) {
    params.set('page', String(page));
    const resp = await cu<Resp>(
      `/team/${workspaceId}/time_entries?${params.toString()}`
    );
    all.push(...resp.data);
    if (resp.last_page || resp.data.length === 0) break;
    page++;
    if (page > 10) break; // hard safety
  }
  return all.map(normalizeEntry).sort((a, b) => b.start - a.start);
}

export async function updateTimeEntry(
  entryId: string,
  patch: Partial<Pick<TimeEntry, 'description' | 'start' | 'end' | 'duration'>>
): Promise<TimeEntry> {
  const { workspaceId } = await ensureWorkspace();
  const body: Record<string, unknown> = {};
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.start !== undefined) body.start = patch.start;
  if (patch.end !== undefined && patch.end !== null) body.end = patch.end;
  if (patch.duration !== undefined) body.duration = patch.duration;
  interface Resp {
    data: CUTimeEntry;
  }
  const resp = await cu<Resp>(
    `/team/${workspaceId}/time_entries/${encodeURIComponent(entryId)}`,
    { method: 'PUT', body: JSON.stringify(body) }
  );
  return normalizeEntry(resp.data);
}

export async function createTimeEntry(opts: {
  taskId: string | null;
  start: number;
  duration: number;
  description?: string;
}): Promise<TimeEntry> {
  const { workspaceId } = await ensureWorkspace();
  const body: Record<string, unknown> = {
    start: opts.start,
    duration: opts.duration,
  };
  if (opts.taskId) body.tid = opts.taskId;
  if (opts.description) body.description = opts.description;
  interface Resp {
    data: CUTimeEntry;
  }
  const resp = await cu<Resp>(`/team/${workspaceId}/time_entries`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return normalizeEntry(resp.data);
}

export async function deleteTimeEntry(entryId: string): Promise<void> {
  const { workspaceId } = await ensureWorkspace();
  await cu(
    `/team/${workspaceId}/time_entries/${encodeURIComponent(entryId)}`,
    { method: 'DELETE' },
    { allowEmpty: true }
  );
}
