import type {
  ClickUpFolder,
  ClickUpList,
  ClickUpSpace,
  Comment,
  CommentSegment,
  ListStatus,
  NewTaskPayload,
  Priority,
  Task,
  TaskDetail,
  TimeEntry,
  WorkspaceMember,
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
  status?: { status: string; color: string; type?: string };
  priority?: { priority: string } | null;
  due_date: string | null;
  url: string;
  parent: string | null;
  list?: { id: string; name: string };
  assignees?: { id: number }[];
  date_updated?: string;
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

interface TasksResp {
  tasks: CUTask[];
  last_page?: boolean;
}

// Recently-closed tasks ("completed", "won't do", etc.) stay visible for
// this many days after their last update. Anything older drops off so the
// list doesn't accumulate years of historical work. Open and in-progress
// tasks are unaffected — they're always visible.
const CLOSED_TASK_VISIBLE_DAYS = 14;

// Run a paginated /team/{id}/task query with the given filter params and
// return all matching CUTask rows. Caller is responsible for normalizing.
async function fetchTasksWithFilters(
  workspaceId: string,
  filter: { assigneeId?: string; spaceIds?: string[] }
): Promise<CUTask[]> {
  // Note on `subtasks`: leaving this OFF. ClickUp's API is significantly
  // slower with subtasks=true (scans subtask trees across the workspace).
  // We accept that subtasks won't appear as top-level TaskList rows;
  // their time still rolls up to parents via Bugfix B (subtask attribution
  // walk in App.tsx taskTotals) and timers are typically started on the
  // parent anyway. If a subtask must be visible, drag it to a configured
  // space instead.
  //
  // include_closed=true so completed work stays visible to the user; we
  // post-filter to a rolling window below to keep the list bounded.
  const params = new URLSearchParams({
    include_closed: 'true',
    order_by: 'updated',
    reverse: 'true',
  });
  if (filter.assigneeId) params.append('assignees[]', filter.assigneeId);
  if (filter.spaceIds) {
    for (const id of filter.spaceIds) params.append('space_ids[]', id);
  }
  const all: CUTask[] = [];
  let page = 0;
  while (true) {
    params.set('page', String(page));
    const { tasks, last_page } = await cu<TasksResp>(
      `/team/${workspaceId}/task?${params.toString()}`
    );
    all.push(...tasks);
    if (last_page || tasks.length === 0) break;
    page++;
    if (page > 10) break; // hard safety
  }
  // Post-filter: drop closed tasks whose last update is outside the
  // visibility window. ClickUp's status.type === 'closed' is the canonical
  // signal (covers "completed", "won't do", and any other closed-type
  // statuses the workspace defines). Open/in-progress/custom statuses are
  // never bounded — they stay visible regardless of age.
  const cutoff = Date.now() - CLOSED_TASK_VISIBLE_DAYS * 86_400_000;
  return all.filter((t) => {
    if (t.status?.type !== 'closed') return true;
    const updated = t.date_updated ? Number(t.date_updated) : 0;
    return updated >= cutoff;
  });
}

export async function getAssignedTasks(): Promise<Task[]> {
  const t0 = Date.now();
  const { workspaceId, userId } = await ensureWorkspace();
  const settings = getSettings();

  // Assignee-filter path. Skipped when `assigneeFilterEnabled` is false —
  // useful when the assignee query is slow on ClickUp's side and the user
  // routes work through a designated space instead (e.g. Hugo's Laboratory).
  let assigned: CUTask[] = [];
  let assignedDur = 0;
  if (settings.assigneeFilterEnabled) {
    const tA = Date.now();
    const assignedRaw = await fetchTasksWithFilters(workspaceId, { assigneeId: userId });
    // Belt-and-suspenders: ClickUp's `assignees[]` filter can leak in tasks
    // the user isn't actually assigned to (e.g. via list membership /
    // permissions). Filter client-side against the explicit assignees array.
    assigned = assignedRaw.filter((t) =>
      (t.assignees || []).some((a) => String(a.id) === userId)
    );
    assignedDur = Date.now() - tA;
  }
  const assignedIds = new Set(assigned.map((t) => t.id));

  // Extra-space path: pull tasks from configured spaces regardless of
  // assignee. When the assignee path is disabled this is the only source.
  let fromSpaces: CUTask[] = [];
  let spaceDur = 0;
  if (settings.extraTaskSpaceIds.length > 0) {
    const tS = Date.now();
    fromSpaces = await fetchTasksWithFilters(workspaceId, {
      spaceIds: settings.extraTaskSpaceIds,
    });
    spaceDur = Date.now() - tS;
  }

  const normalized: Task[] = assigned.map(normalizeTask);
  for (const t of fromSpaces) {
    if (assignedIds.has(t.id)) continue;
    // viaSpace flag only meaningful when the assignee path also ran.
    const viaSpace = settings.assigneeFilterEnabled;
    normalized.push({ ...normalizeTask(t), viaSpace: viaSpace || undefined });
  }

  console.log(
    `[getAssignedTasks] ${normalized.length} tasks in ${Date.now() - t0}ms ` +
      `(assignee path ${assignedDur}ms, space path ${spaceDur}ms)`
  );

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

export async function listSpaces(): Promise<ClickUpSpace[]> {
  const { workspaceId } = await ensureWorkspace();
  interface Resp {
    spaces: { id: string; name: string }[];
  }
  const resp = await cu<Resp>(`/team/${workspaceId}/space?archived=false`);
  return resp.spaces.map((s) => ({ id: s.id, name: s.name }));
}

interface RawCommentSegment {
  text?: string;
  type?: string; // "tag" for @mentions
  user?: { id: number; username?: string };
  // Other ClickUp segment fields (attributes, hyperlinks, etc.) are present
  // but ignored — we collapse rich formatting to plain text segments.
  [key: string]: unknown;
}

interface RawComment {
  id: string;
  comment_text: string;
  // Structured render source. When present, every @mention is encoded as a
  // segment with `type: 'tag'` and a `user.id`. Older comments may omit
  // this; we fall back to a single text segment from `comment_text`.
  comment?: RawCommentSegment[];
  user?: { username: string };
  date: string;
  // Present on top-level comments only. ClickUp uses both naming variants
  // depending on the response context — capture both.
  reply_count?: string | number;
  date_updated?: string;
}

// Convert ClickUp's structured `comment` array (or fall back to plaintext)
// into Helm's `CommentSegment[]`. Adjacent text-only segments are coalesced
// so `[{ text: 'hi ' }, { text: 'there' }]` becomes one segment.
function rawSegmentsToSegments(
  raw: RawCommentSegment[] | undefined,
  fallbackText: string
): CommentSegment[] {
  if (!raw || raw.length === 0) {
    return fallbackText ? [{ kind: 'text', value: fallbackText }] : [];
  }
  const out: CommentSegment[] = [];
  for (const seg of raw) {
    if (seg.type === 'tag' && seg.user && typeof seg.user.id === 'number') {
      out.push({
        kind: 'mention',
        userId: seg.user.id,
        display: seg.user.username || `user-${seg.user.id}`,
      });
      continue;
    }
    const text = typeof seg.text === 'string' ? seg.text : '';
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.kind === 'text') {
      last.value += text;
    } else {
      out.push({ kind: 'text', value: text });
    }
  }
  // Defensive: if the structured array gave us nothing renderable, fall
  // back to plaintext so the user always sees something.
  if (out.length === 0 && fallbackText) {
    out.push({ kind: 'text', value: fallbackText });
  }
  return out;
}

interface CommentsResp {
  comments: RawComment[];
}

// ClickUp's GET /task/{id}/comment paginates ~25 newest-first per page. The
// `start` (oldest comment's unix-ms timestamp) and `start_id` cursor pair
// walks backward through the history. Loop until a page returns empty or
// fewer than 25 comments. Bounded at PAGE_CAP so a runaway never blocks.
const COMMENTS_PAGE_SIZE = 25;
const COMMENTS_PAGE_CAP = 10; // ≈ 250 comments — generous but bounded.

async function fetchAllTaskComments(encodedTaskId: string): Promise<RawComment[]> {
  const out: RawComment[] = [];
  let start: number | undefined;
  let startId: string | undefined;
  for (let page = 0; page < COMMENTS_PAGE_CAP; page++) {
    const params = new URLSearchParams();
    if (start !== undefined) params.set('start', String(start));
    if (startId !== undefined) params.set('start_id', startId);
    const qs = params.toString();
    const resp = await cu<CommentsResp>(
      `/task/${encodedTaskId}/comment${qs ? `?${qs}` : ''}`
    ).catch(() => ({ comments: [] } as CommentsResp));
    if (!resp.comments.length) break;
    out.push(...resp.comments);
    if (resp.comments.length < COMMENTS_PAGE_SIZE) break;
    const oldest = resp.comments[resp.comments.length - 1];
    start = Number(oldest.date);
    startId = oldest.id;
  }
  return out;
}

// Fetch the replies of a single top-level comment. Used eagerly for the
// auto-expanded "head" thread during getTaskDetail, and lazily via the
// loadCommentReplies IPC when the user expands any other thread.
async function fetchCommentReplies(commentId: string): Promise<RawComment[]> {
  const encoded = encodeURIComponent(commentId);
  const resp = await cu<CommentsResp>(`/comment/${encoded}/reply`).catch(
    () => ({ comments: [] } as CommentsResp)
  );
  return resp.comments;
}

function toReplyComment(raw: RawComment, parentId: string): Comment {
  return {
    id: raw.id,
    text: raw.comment_text,
    segments: rawSegmentsToSegments(raw.comment, raw.comment_text),
    user: raw.user?.username || 'unknown',
    dateCreated: Number(raw.date),
    dateUpdated: Number(raw.date),
    replyCount: 0,
    parentId,
    replies: [],
    repliesLoaded: true,
  };
}

function toTopLevelComment(
  raw: RawComment,
  replies: Comment[],
  repliesLoaded: boolean
): Comment {
  const dateCreated = Number(raw.date);
  const dateUpdated = raw.date_updated ? Number(raw.date_updated) : dateCreated;
  const replyCount =
    typeof raw.reply_count === 'number'
      ? raw.reply_count
      : raw.reply_count
      ? Number(raw.reply_count)
      : replies.length;
  // Bubble the most recent activity through dateUpdated so the renderer can
  // pick the head thread by max(top, max(replies)). When ClickUp surfaces
  // date_updated we trust it; otherwise we compute it from any loaded
  // replies, falling back to the comment's own dateCreated.
  const replyMaxCreated = replies.reduce((acc, r) => Math.max(acc, r.dateCreated), 0);
  return {
    id: raw.id,
    text: raw.comment_text,
    segments: rawSegmentsToSegments(raw.comment, raw.comment_text),
    user: raw.user?.username || 'unknown',
    dateCreated,
    dateUpdated: Math.max(dateUpdated, replyMaxCreated, dateCreated),
    replyCount,
    parentId: null,
    replies,
    repliesLoaded,
  };
}

// Workspace-member listing for @mention autocomplete. Used by
// listWorkspaceMembers() with main-process caching layered on top.
async function fetchWorkspaceMembers(): Promise<WorkspaceMember[]> {
  const { workspaceId } = await ensureWorkspace();
  interface CUMember {
    user: {
      id: number;
      username?: string;
      email?: string;
      initials?: string;
      color?: string | null;
      profilePicture?: string | null;
    };
  }
  interface Resp {
    members: CUMember[];
  }
  const resp = await cu<Resp>(`/team/${workspaceId}/member`);
  return resp.members.map((m) => ({
    id: m.user.id,
    username: m.user.username || (m.user.email ? m.user.email.split('@')[0] : `user-${m.user.id}`),
    email: m.user.email || '',
    initials: m.user.initials || '',
    color: m.user.color ?? null,
    profilePicture: m.user.profilePicture ?? null,
  }));
}

// Session-cached member list. The handler layer wraps this with a TTL so
// the renderer can call it freely (e.g. on every `@` keystroke); only the
// first call per window actually hits the network.
let cachedMembers: WorkspaceMember[] | null = null;
let cachedMembersAt = 0;
const MEMBERS_TTL_MS = 10 * 60_000;

export async function listWorkspaceMembers(opts: { force?: boolean } = {}): Promise<
  WorkspaceMember[]
> {
  const now = Date.now();
  if (
    !opts.force &&
    cachedMembers &&
    now - cachedMembersAt < MEMBERS_TTL_MS
  ) {
    return cachedMembers;
  }
  const fresh = await fetchWorkspaceMembers();
  cachedMembers = fresh;
  cachedMembersAt = now;
  return fresh;
}

// Convert Helm's CommentSegment[] back into ClickUp's structured `comment`
// array format. Mention segments become `{ type: 'tag', user: { id } }`;
// text segments become `{ text }`. Empty text segments are dropped.
function segmentsToClickUpComment(
  segments: CommentSegment[]
): Array<{ text?: string; type?: string; user?: { id: number } }> {
  const out: Array<{ text?: string; type?: string; user?: { id: number } }> = [];
  for (const seg of segments) {
    if (seg.kind === 'mention') {
      out.push({ type: 'tag', user: { id: seg.userId } });
    } else if (seg.value) {
      out.push({ text: seg.value });
    }
  }
  return out;
}

export async function createTaskComment(
  taskId: string,
  segments: CommentSegment[],
  notifyAll: boolean
): Promise<Comment> {
  const encoded = encodeURIComponent(taskId);
  const body = {
    comment: segmentsToClickUpComment(segments),
    notify_all: notifyAll,
    assignee: null,
  };
  // ClickUp's create-comment response is a top-level RawComment-shaped
  // object (not wrapped in { comments: [] }). Treat it as such.
  const raw = await cu<RawComment>(`/task/${encoded}/comment`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return toTopLevelComment(raw, [], true);
}

export async function createCommentReply(
  parentCommentId: string,
  segments: CommentSegment[],
  notifyAll: boolean
): Promise<Comment> {
  const encoded = encodeURIComponent(parentCommentId);
  const body = {
    comment: segmentsToClickUpComment(segments),
    notify_all: notifyAll,
  };
  const raw = await cu<RawComment>(`/comment/${encoded}/reply`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return toReplyComment(raw, parentCommentId);
}

export async function loadCommentReplies(commentId: string): Promise<Comment[]> {
  const raws = await fetchCommentReplies(commentId);
  return raws.map((r) => toReplyComment(r, commentId));
}

// ---------- picker tree (Space → Folder → List) for create-task modal ----------
//
// The cascade is stable on the timescale of a session — folders rarely
// move, lists rarely get renamed mid-day. Cache each level in main with a
// 10-min TTL so repeated opens of the modal don't refetch on every keystroke.

const PICKER_TREE_TTL_MS = 10 * 60_000;

interface CachedFolders {
  at: number;
  data: ClickUpFolder[];
}
interface CachedLists {
  at: number;
  data: ClickUpList[];
}

const foldersBySpace = new Map<string, CachedFolders>();
const listsByFolder = new Map<string, CachedLists>();
const folderlessListsBySpace = new Map<string, CachedLists>();

function isFresh(entry: { at: number } | undefined): boolean {
  return !!entry && Date.now() - entry.at < PICKER_TREE_TTL_MS;
}

export async function listFolders(spaceId: string): Promise<ClickUpFolder[]> {
  const cached = foldersBySpace.get(spaceId);
  if (isFresh(cached)) return cached!.data;
  interface Resp {
    folders: { id: string; name: string }[];
  }
  const resp = await cu<Resp>(
    `/space/${encodeURIComponent(spaceId)}/folder?archived=false`
  );
  const data = resp.folders.map((f) => ({ id: f.id, name: f.name }));
  foldersBySpace.set(spaceId, { at: Date.now(), data });
  return data;
}

export async function listListsInFolder(folderId: string): Promise<ClickUpList[]> {
  const cached = listsByFolder.get(folderId);
  if (isFresh(cached)) return cached!.data;
  interface Resp {
    lists: { id: string; name: string }[];
  }
  const resp = await cu<Resp>(
    `/folder/${encodeURIComponent(folderId)}/list?archived=false`
  );
  const data = resp.lists.map((l) => ({ id: l.id, name: l.name, folderless: false }));
  listsByFolder.set(folderId, { at: Date.now(), data });
  return data;
}

export async function listFolderlessLists(spaceId: string): Promise<ClickUpList[]> {
  const cached = folderlessListsBySpace.get(spaceId);
  if (isFresh(cached)) return cached!.data;
  interface Resp {
    lists: { id: string; name: string }[];
  }
  const resp = await cu<Resp>(
    `/space/${encodeURIComponent(spaceId)}/list?archived=false`
  );
  const data = resp.lists.map((l) => ({ id: l.id, name: l.name, folderless: true }));
  folderlessListsBySpace.set(spaceId, { at: Date.now(), data });
  return data;
}

export async function createTask(
  listId: string,
  payload: NewTaskPayload
): Promise<Task> {
  const body: Record<string, unknown> = {
    name: payload.name,
    notify_all: false,
  };
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.status) body.status = payload.status;
  if (payload.priority !== undefined && payload.priority !== null) {
    body.priority = payload.priority;
  }
  if (payload.dueDate !== undefined && payload.dueDate !== null) {
    body.due_date = payload.dueDate;
  }
  if (payload.assignees && payload.assignees.length) {
    body.assignees = payload.assignees;
  }
  const resp = await cu<CUTask>(`/list/${encodeURIComponent(listId)}/task`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return normalizeTask(resp);
}

export async function getTaskDetail(taskId: string): Promise<TaskDetail> {
  const encoded = encodeURIComponent(taskId);
  // Fire both requests concurrently. Comments are best-effort; swallow errors
  // so a permissions blip doesn't bring the whole detail load down.
  const [t, rawComments] = await Promise.all([
    cu<CUTask & { subtasks?: CUTask[] }>(`/task/${encoded}?include_subtasks=true`),
    fetchAllTaskComments(encoded),
  ]);

  // Identify the head thread (most recent activity) and fetch its replies
  // eagerly so the renderer can show it auto-expanded with no extra round
  // trip. "Activity" prefers ClickUp's date_updated; falls back to the
  // top-level comment's own dateCreated when absent.
  let headIndex = -1;
  let headActivity = -Infinity;
  rawComments.forEach((c, i) => {
    const updated = c.date_updated ? Number(c.date_updated) : Number(c.date);
    const replyCount =
      typeof c.reply_count === 'number'
        ? c.reply_count
        : c.reply_count
        ? Number(c.reply_count)
        : 0;
    // Only consider threads that have any activity worth pre-expanding —
    // even a 0-reply thread is fine; we just pick the most recent.
    if (updated > headActivity) {
      headActivity = updated;
      headIndex = i;
    }
    void replyCount;
  });

  const headRawId = headIndex >= 0 ? rawComments[headIndex].id : null;
  const headRawReplyCount =
    headIndex >= 0
      ? typeof rawComments[headIndex].reply_count === 'number'
        ? (rawComments[headIndex].reply_count as number)
        : Number(rawComments[headIndex].reply_count || 0)
      : 0;
  const headReplies: Comment[] =
    headRawId && headRawReplyCount > 0
      ? (await fetchCommentReplies(headRawId)).map((r) => toReplyComment(r, headRawId))
      : [];

  const comments: Comment[] = rawComments.map((c, i) => {
    if (i === headIndex) {
      return toTopLevelComment(c, headReplies, true);
    }
    return toTopLevelComment(c, [], false);
  });

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
  }
  // Note: ClickUp's GET /team/{id}/time_entries does NOT support pagination —
  // it returns the entire result set for the date range in a single response.
  // An earlier "defensive" pagination loop here multiplied every entry ~10x
  // because setting page=0,1,2... returned the same data each time and the
  // endpoint never advertises last_page. Single request only.
  const resp = await cu<Resp>(
    `/team/${workspaceId}/time_entries?${params.toString()}`
  );
  return resp.data.map(normalizeEntry).sort((a, b) => b.start - a.start);
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
