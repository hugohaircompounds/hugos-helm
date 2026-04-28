import { useEffect, useState } from 'react';
import type {
  ClickUpSpace,
  JobLog,
  Settings as SettingsT,
  Task,
} from '../../shared/types';

interface Props {
  tasks: Task[];
  onChanged: () => void;
}

const JOB_LABELS: Record<string, string> = {
  'standup-mon': 'Standup (Mon 10:00)',
  'standup-tue-thu': 'Standup (Tue/Wed/Thu 09:30)',
  'standup-stop-check': 'Auto-stop standup after 20m',
  'lunch-start': 'Lunch pause (13:00)',
  'lunch-end': 'Lunch resume (14:00)',
  'eod-prompt': 'EOD prompt (16:55)',
  'eod-stop': 'EOD stop (16:59)',
};

function minutesToTimeInput(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeInputToMinutes(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 24 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

export function Settings({ tasks, onChanged }: Props) {
  const [s, setS] = useState<SettingsT | null>(null);
  const [clickupToken, setClickupToken] = useState('');
  const [googleId, setGoogleId] = useState('');
  const [googleSecret, setGoogleSecret] = useState('');
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<ClickUpSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [spacesError, setSpacesError] = useState<string | null>(null);

  async function loadSpaces() {
    setSpacesLoading(true);
    setSpacesError(null);
    try {
      const list = await window.helm.listSpaces();
      setSpaces(list);
    } catch (e) {
      setSpacesError((e as Error).message);
    } finally {
      setSpacesLoading(false);
    }
  }

  const refresh = async () => {
    const next = await window.helm.getSettings();
    setS(next);
    setGoogleId(next.googleClientId || '');
    setGoogleSecret(next.googleClientSecret ? '••••••••' : '');
    setLogs(await window.helm.listJobLogs(100));
  };

  useEffect(() => {
    refresh();
  }, []);

  if (!s) return <div className="p-8 text-inkMuted">Loading…</div>;

  async function save(patch: Partial<SettingsT>) {
    const next = await window.helm.saveSettings(patch);
    setS(next);
    onChanged();
  }

  async function saveClickUpToken() {
    if (!clickupToken.trim()) return;
    setStatus('Saving ClickUp token…');
    try {
      await window.helm.setClickUpToken(clickupToken.trim());
      setClickupToken('');
      await refresh();
      onChanged();
      setStatus('ClickUp connected.');
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function saveGoogleCreds() {
    setStatus('Saving Google client credentials…');
    await window.helm.setGoogleClientCreds(googleId.trim(), googleSecret === '••••••••' ? s!.googleClientSecret || '' : googleSecret.trim());
    await refresh();
    setStatus('Client creds saved.');
  }

  async function connectGoogle() {
    setStatus('Opening browser for Google consent…');
    const res = await window.helm.connectGoogle();
    setStatus(res.ok ? 'Google connected.' : `Google error: ${res.error}`);
    await refresh();
  }

  return (
    <div className="flex flex-col gap-6 p-6 overflow-auto max-w-3xl">
      <section>
        <h2 className="text-sm uppercase tracking-wider text-inkMuted mb-2">ClickUp</h2>
        <div className="flex flex-col gap-2 bg-panel border border-border rounded p-4">
          <div className="flex items-center gap-3">
            <span
              className={`h-2 w-2 rounded-full ${s.clickupConnected ? 'bg-success' : 'bg-inkMuted'}`}
            />
            <span>{s.clickupConnected ? 'Connected' : 'Not connected'}</span>
            {s.clickupWorkspaceId && (
              <span className="text-xs text-inkMuted">workspace {s.clickupWorkspaceId}</span>
            )}
            {s.clickupConnected && (
              <button
                onClick={async () => {
                  await window.helm.disconnectClickUp();
                  await refresh();
                  onChanged();
                }}
                className="ml-auto text-xs text-danger"
              >
                Disconnect
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Personal API token (pk_…)"
              className="flex-1 bg-bg border border-border rounded px-3 py-2 text-sm"
              value={clickupToken}
              onChange={(e) => setClickupToken(e.target.value)}
            />
            <button
              onClick={saveClickUpToken}
              className="px-3 py-1 rounded bg-accent/20 text-accent border border-accent/40 text-sm"
            >
              Save
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-inkMuted mb-2">Google</h2>
        <div className="flex flex-col gap-2 bg-panel border border-border rounded p-4">
          <div className="flex items-center gap-3">
            <span
              className={`h-2 w-2 rounded-full ${s.googleConnected ? 'bg-success' : 'bg-inkMuted'}`}
            />
            <span>{s.googleConnected ? 'Connected' : 'Not connected'}</span>
            {s.googleConnected && (
              <button
                onClick={async () => {
                  await window.helm.disconnectGoogle();
                  await refresh();
                }}
                className="ml-auto text-xs text-danger"
              >
                Disconnect
              </button>
            )}
          </div>
          <label className="text-xs text-inkMuted">
            OAuth Client ID
            <input
              className="w-full bg-bg border border-border rounded px-3 py-2 text-sm mt-1"
              value={googleId}
              onChange={(e) => setGoogleId(e.target.value)}
            />
          </label>
          <label className="text-xs text-inkMuted">
            OAuth Client Secret
            <input
              type="password"
              className="w-full bg-bg border border-border rounded px-3 py-2 text-sm mt-1"
              value={googleSecret}
              onChange={(e) => setGoogleSecret(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={saveGoogleCreds}
              className="px-3 py-1 rounded border border-border text-sm"
            >
              Save creds
            </button>
            <button
              onClick={connectGoogle}
              className="px-3 py-1 rounded bg-accent/20 text-accent border border-accent/40 text-sm"
            >
              Connect
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-inkMuted mb-2">Extra task spaces</h2>
        <div className="flex flex-col gap-2 bg-panel border border-border rounded p-4">
          <p className="text-xs text-inkMuted/80">
            By default Helm only pulls tasks you're directly assigned to. Add ClickUp spaces here
            and Helm will also pull tasks from them regardless of assignee — useful for personal /
            lab spaces. Tasks coming in via this path are tagged with a "Lab" pill in TaskList.
          </p>
          <label className="flex items-start gap-2 text-sm border-t border-border pt-3 mt-1">
            <input
              type="checkbox"
              checked={!s.assigneeFilterEnabled}
              onChange={async (e) => {
                await save({ assigneeFilterEnabled: !e.target.checked });
                onChanged();
              }}
              className="mt-0.5"
            />
            <span>
              Skip assignee filter — pull tasks <em>only</em> from the spaces below.
              <div className="text-xs text-inkMuted/70 mt-0.5">
                Use this if ClickUp's assignee query is slow. You'll need at least one space
                checked, and you'll need to route any task you want to track to one of those
                spaces (e.g. drag everything important into Hugo's Laboratory).
              </div>
            </span>
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={loadSpaces}
              disabled={spacesLoading || !s.clickupConnected}
              className="px-3 py-1 rounded border border-border text-sm hover:bg-panelHi disabled:opacity-50"
            >
              {spacesLoading ? 'Loading…' : spaces.length ? 'Reload spaces' : 'Load my spaces'}
            </button>
            <button
              onClick={() => {
                onChanged();
                setStatus('Refreshing tasks…');
                window.setTimeout(() => setStatus(null), 1500);
              }}
              className="px-3 py-1 rounded border border-border text-sm hover:bg-panelHi"
              title="Re-pull tasks from ClickUp using the current space selection"
            >
              Refresh tasks
            </button>
            {spacesError && <span className="text-xs text-danger">{spacesError}</span>}
            {!s.clickupConnected && (
              <span className="text-xs text-inkMuted">Connect ClickUp first.</span>
            )}
          </div>
          {spaces.length > 0 && (
            <div className="flex flex-col gap-1 mt-1 max-h-48 overflow-auto">
              {spaces.map((sp) => {
                const checked = s.extraTaskSpaceIds.includes(sp.id);
                return (
                  <label
                    key={sp.id}
                    className="flex items-center gap-2 text-sm hover:bg-panelHi rounded px-2 py-1 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={async () => {
                        const next = checked
                          ? s.extraTaskSpaceIds.filter((id) => id !== sp.id)
                          : [...s.extraTaskSpaceIds, sp.id];
                        await save({ extraTaskSpaceIds: next });
                        // Belt-and-suspenders: save() already calls onChanged()
                        // (which refreshes tasks), but on toggle we want to
                        // make absolutely sure the task list updates. Calling
                        // a second time is harmless and de-duped by ClickUp.
                        onChanged();
                      }}
                    />
                    <span>{sp.name}</span>
                    <span className="text-xs text-inkMuted/70 font-mono ml-auto">{sp.id}</span>
                  </label>
                );
              })}
            </div>
          )}
          {s.extraTaskSpaceIds.length > 0 && spaces.length === 0 && (
            <p className="text-xs text-inkMuted/80">
              {s.extraTaskSpaceIds.length} space(s) currently active — load to manage.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-inkMuted mb-2">Status equivalences</h2>
        <div className="flex flex-col gap-3 bg-panel border border-border rounded p-4">
          <p className="text-xs text-inkMuted/80">
            Merge multiple raw ClickUp statuses into a single display group in the task list.
            Purely cosmetic — your tasks' actual statuses in ClickUp are not changed. The status
            dropdown on the task detail still shows raw statuses (because that's what ClickUp
            accepts on save).
          </p>
          {(() => {
            // Union of all currently-seen statuses across the user's tasks.
            const allRawStatuses = Array.from(
              new Set(tasks.map((t) => t.status || 'open'))
            ).sort();
            return (
              <>
                {s.statusEquivalences.length === 0 && (
                  <p className="text-xs text-inkMuted">
                    No equivalences yet. Add one to merge statuses like "In Design" + "Scoping" → "Scoping".
                  </p>
                )}
                {s.statusEquivalences.map((eq, i) => {
                  const update = (next: Partial<typeof eq>) => {
                    const list = [...s.statusEquivalences];
                    list[i] = { ...eq, ...next };
                    save({ statusEquivalences: list });
                  };
                  const remove = () => {
                    const list = s.statusEquivalences.filter((_, j) => j !== i);
                    save({ statusEquivalences: list });
                  };
                  return (
                    <div
                      key={i}
                      className="flex flex-col gap-2 border border-border rounded p-3 bg-bg"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          defaultValue={eq.groupName}
                          placeholder="Display name"
                          className="flex-1 bg-panel border border-border rounded px-2 py-1 text-sm"
                          onBlur={(e) => {
                            if (e.target.value !== eq.groupName) {
                              update({ groupName: e.target.value });
                            }
                          }}
                        />
                        <input
                          type="color"
                          defaultValue={eq.color || '#888888'}
                          title="Group color (optional)"
                          className="w-8 h-8 bg-panel border border-border rounded cursor-pointer"
                          onChange={(e) => update({ color: e.target.value })}
                        />
                        <button
                          onClick={remove}
                          className="px-2 py-1 text-xs rounded border border-danger/40 text-danger hover:bg-danger/10"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {allRawStatuses.map((status) => {
                          const checked = eq.members.includes(status);
                          return (
                            <label
                              key={status}
                              className={`text-xs px-2 py-0.5 rounded border cursor-pointer ${
                                checked
                                  ? 'bg-accent/20 text-accent border-accent/40'
                                  : 'bg-panel text-inkMuted border-border hover:bg-panelHi'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? eq.members.filter((m) => m !== status)
                                    : [...eq.members, status];
                                  update({ members: next });
                                }}
                                className="hidden"
                              />
                              {status}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() =>
                    save({
                      statusEquivalences: [
                        ...s.statusEquivalences,
                        { groupName: 'New group', members: [] },
                      ],
                    })
                  }
                  className="self-start px-3 py-1 rounded border border-border text-sm hover:bg-panelHi"
                >
                  + Add equivalence
                </button>
              </>
            );
          })()}
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-inkMuted mb-2">Standup & Timezone</h2>
        <div className="flex flex-col gap-2 bg-panel border border-border rounded p-4">
          <label className="text-xs text-inkMuted">
            Monday standup task (10:00) — "Monday Stand Up - Weekly Planning"
            <select
              className="w-full bg-bg border border-border rounded px-3 py-2 text-sm mt-1"
              value={s.standupTaskIdMon || ''}
              onChange={(e) => save({ standupTaskIdMon: e.target.value || null })}
            >
              <option value="">— pick one —</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-inkMuted">
            Tue/Wed/Thu standup task (09:30)
            <select
              className="w-full bg-bg border border-border rounded px-3 py-2 text-sm mt-1"
              value={s.standupTaskIdTueThu || ''}
              onChange={(e) => save({ standupTaskIdTueThu: e.target.value || null })}
            >
              <option value="">— pick one —</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-inkMuted">
            Timezone (IANA)
            <input
              className="w-full bg-bg border border-border rounded px-3 py-2 text-sm mt-1"
              defaultValue={s.timezone}
              onBlur={(e) => {
                if (e.target.value !== s.timezone) save({ timezone: e.target.value });
              }}
            />
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-inkMuted mb-2">Idle detection</h2>
        <div className="flex flex-col gap-2 bg-panel border border-border rounded p-4">
          <p className="text-xs text-inkMuted/80">
            When the screen is locked or the system suspends with a timer running, Helm can offer
            to truncate the entry to the lock time on resume — so a forgotten timer doesn't
            silently log lunch as work.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.idleDetectionEnabled}
              onChange={(e) => save({ idleDetectionEnabled: e.target.checked })}
            />
            <span>Enable idle detection</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.lockTriggersIdle}
              disabled={!s.idleDetectionEnabled}
              onChange={(e) => save({ lockTriggersIdle: e.target.checked })}
            />
            <span>
              Treat <code>lock-screen</code> as idle (uncheck if you lock briefly without leaving)
            </span>
          </label>
          <label className="text-xs text-inkMuted">
            Idle threshold (minutes)
            <input
              type="number"
              min={1}
              max={120}
              defaultValue={s.idleTimeoutMin}
              disabled={!s.idleDetectionEnabled}
              className="w-24 bg-bg border border-border rounded px-3 py-2 text-sm mt-1 ml-2"
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n > 0 && n !== s.idleTimeoutMin) {
                  save({ idleTimeoutMin: n });
                }
              }}
            />
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-inkMuted mb-2">Timeline</h2>
        <div className="flex flex-col gap-2 bg-panel border border-border rounded p-4">
          <p className="text-xs text-inkMuted/80">
            Work-hour bounds drive the timeline's "untracked gap" stripes — minutes inside this
            range with no entry get diagonal-stripe shading so you can see what you forgot to track.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-inkMuted">
              Work hours start
              <input
                type="time"
                className="w-full bg-bg border border-border rounded px-3 py-2 text-sm mt-1"
                defaultValue={minutesToTimeInput(s.workHoursStart)}
                onBlur={(e) => {
                  const next = timeInputToMinutes(e.target.value);
                  if (next !== null && next !== s.workHoursStart) save({ workHoursStart: next });
                }}
              />
            </label>
            <label className="text-xs text-inkMuted">
              Work hours end
              <input
                type="time"
                className="w-full bg-bg border border-border rounded px-3 py-2 text-sm mt-1"
                defaultValue={minutesToTimeInput(s.workHoursEnd)}
                onBlur={(e) => {
                  const next = timeInputToMinutes(e.target.value);
                  if (next !== null && next !== s.workHoursEnd) save({ workHoursEnd: next });
                }}
              />
            </label>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-inkMuted mb-2">Scheduled jobs</h2>
        <ul className="flex flex-col gap-1 bg-panel border border-border rounded p-4">
          {Object.keys(JOB_LABELS).map((k) => (
            <li key={k} className="flex items-center justify-between">
              <span className="text-sm">{JOB_LABELS[k]}</span>
              <label className="inline-flex items-center gap-2 text-xs text-inkMuted">
                <input
                  type="checkbox"
                  checked={s.jobsEnabled[k] !== false}
                  onChange={(e) =>
                    save({ jobsEnabled: { ...s.jobsEnabled, [k]: e.target.checked } })
                  }
                />
                enabled
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-inkMuted mb-2">Recent job fires</h2>
        <ul className="flex flex-col gap-1 bg-panel border border-border rounded p-4 max-h-64 overflow-auto font-mono text-xs">
          {logs.length === 0 && <li className="text-inkMuted">None yet.</li>}
          {logs.map((l) => (
            <li key={l.id} className="flex gap-3">
              <span className="text-inkMuted w-40 shrink-0">
                {new Date(l.firedAt).toLocaleString()}
              </span>
              <span
                className={`w-24 shrink-0 ${
                  l.outcome === 'error'
                    ? 'text-danger'
                    : l.outcome === 'skipped'
                    ? 'text-warn'
                    : 'text-success'
                }`}
              >
                {l.outcome}
              </span>
              <span className="w-40 shrink-0 text-ink">{l.job}</span>
              <span className="text-inkMuted truncate">{l.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      {status && <div className="text-sm text-inkMuted">{status}</div>}
    </div>
  );
}
