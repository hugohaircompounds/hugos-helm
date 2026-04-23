import { useEffect, useState } from 'react';
import type { Settings as SettingsT, Task, JobLog } from '../../shared/types';

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

export function Settings({ tasks, onChanged }: Props) {
  const [s, setS] = useState<SettingsT | null>(null);
  const [clickupToken, setClickupToken] = useState('');
  const [googleId, setGoogleId] = useState('');
  const [googleSecret, setGoogleSecret] = useState('');
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [status, setStatus] = useState<string | null>(null);

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
