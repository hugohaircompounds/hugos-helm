# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev          # Vite (5173) + Electron main process with TS compile
npm run typecheck    # tsc --noEmit for both renderer and main-process configs
npm run build        # Vite + tsc -p tsconfig.electron.json
npm run dist         # Package NSIS installer to release/
npm run dist:portable
npm run dist:all
```

Native modules (`better-sqlite3`, `keytar`) must be rebuilt for Electron's Node ABI on first install:
```bash
npx electron-rebuild -f -w better-sqlite3
npx electron-rebuild -f -w keytar
```

Dev loop: **changes to `electron/**/*.ts` require a full `npm run dev` restart** — Vite HMR only reloads the renderer. The preload script in particular is loaded once at `BrowserWindow` creation; edits to `electron/preload.ts` are invisible until Electron restarts.

There are no unit tests. Verification is manual via the running app.

## High-level architecture

Helm is an Electron dashboard wrapping ClickUp, Google Calendar, and Gmail with deterministic time-based automations (node-cron) against ClickUp timers. No LLM involvement anywhere.

### Process boundary (the thing that matters most)

- **Main process** (`electron/`) owns: external API I/O, the scheduler, SQLite, the timer state, the keychain. Anything touching network or disk lives here.
- **Renderer** (`src/`) is pure UI. It can only reach the outside world through `window.helm.*` methods exposed by `electron/preload.ts`.
- **The IPC contract** is `shared/types.ts`. Adding a renderer→main call means editing four files in lockstep:
  1. `shared/types.ts` (add to `HelmApi`)
  2. `electron/preload.ts` (wire `ipcRenderer.invoke`)
  3. `electron/ipc/handlers.ts` (register `ipcMain.handle`)
  4. implement the work in `electron/services/` or `electron/scheduler/`

Never call external APIs from renderer code. Never call `window.helm.*` methods that aren't in `HelmApi`.

### The timer service is the single authority for timer state

Everything related to starting/stopping a ClickUp timer routes through `electron/scheduler/timer.ts` (`startTimer`, `stopTimer`, `pauseForLater`, `resumePaused`, `syncFromRemote`). Direct calls to `clickup.startTimer`/`clickup.stopTimer` from anywhere else (IPC handlers, cron jobs) will desync `timer_state` and break the audit log.

`stopTimer` has three orthogonal side effects worth knowing:
- **Auto-resume after standup**: if the stopped task id matches either `standupTaskIdMon` or `standupTaskIdTueThu` and `resumeTaskId` is set, it starts the stashed task. Pass `skipAutoResume: true` to suppress (used by EOD).
- **Description prompt**: emits a `description-prompt` event on `timerBus` unless `silent: true`. Scheduler-driven stops are always silent; manual stops are not. The renderer ignores `kind: 'eod'` payloads — EOD uses the inline timesheet editor instead (see scheduled-jobs section below).
- **Description flush**: any text the renderer buffered via `setRunningDescription` is applied to the just-stopped entry through a follow-up `clickup.updateTimeEntry` call. The buffer is cleared on both `startTimer` and `stopTimer`. This is how a description typed into the running row during 16:55–16:59 lands on the entry that the 16:59 cron auto-stops.

`timerBus` is a typed `EventEmitter` (see the `TimerBus` interface in `timer.ts`). The IPC layer relays its events to the renderer over named IPC channels (`helm:timer-changed`, `helm:description-prompt`, `helm:eod-focus-entry`).

### The scheduler is the single source of time

`electron/scheduler/index.ts` registers cron jobs from `jobs.ts` with `node-cron`, using the timezone from `Settings`. **Never trust the renderer clock for anything consequential** — the renderer is remote-controlled, it may be asleep, the machine may have been suspended.

Every fire writes to `job_logs` (SQLite) via `logJob(name, outcome, detail)`. Jobs that skip (no timer running, no standup task configured) log `'skipped'` with a reason — do not silently return.

Settings changes that affect scheduling (`timezone`, `jobsEnabled`) call `restartScheduler()` inside the `settings:save` handler; new cron definitions must be added to `jobs.ts`'s exported `jobs` array to pick this up.

### Settings persist via a KV table with type coercion

`electron/db/index.ts` stores settings as TEXT rows in `settings(key, value)`. Booleans serialize as `'0'`/`'1'`, objects as JSON. `getSettings()` reassembles a typed `Settings` object; `saveSettings(patch)` accepts a `Partial<Settings>` and writes only the provided keys.

When adding a new `Settings` field:
1. Add to `Settings` interface in `shared/types.ts`
2. Add a default in `DEFAULT_SETTINGS` in `db/index.ts`
3. Add a `stored[...]` read + typed return in `getSettings()`
4. `saveSettings` handles the write automatically

A migration pattern exists for renaming keys (see the `standupTaskId` → `standupTaskIdTueThu` fallback in `getSettings`).

### ClickUp API quirks to remember

- `GET /team/{id}/task` wants `assignees[]=ID` **array-bracket notation** — plain `assignees=ID` returns `PUBAPITASK_017`.
- `PUT /time_entries/{id}` and `PUT /task/{id}` responses can omit fields the server just persisted — most consistently `description`, but also task reference / duration / list / start. **Never blindly spread the server response over local state.** For time entries, the merge lives in `src/hooks/useTimeEntries.ts`'s `save()` and uses precedence `patch` (user intent) → `updated` (server) → `e` (prev local) per field; reversing that order silently drops the user's edit and the next view shows stale text. New editable fields on `TimeEntry` need their own clause in this merge.
- `GET /team/{id}/time_entries/current` returns `{ data: {} }` (empty object, not null) when no timer is running. `clickup.getCurrentTimer` normalizes this.
- ClickUp's gateway returns HTML 502s during transient backend outages. Caller must handle non-JSON error bodies gracefully.

### Theme system

Colors are CSS custom properties (space-separated RGB channel triples) in `src/styles/index.css`, scoped to `:root` / `[data-theme='dark']` and `[data-theme='light']`. Tailwind's `tailwind.config.cjs` references them via `rgb(var(--x) / <alpha-value>)` so opacity modifiers like `bg-danger/20` continue to work. Switching themes is a single attribute write on `<html>` — no component changes required.

When adding a new color token: add RGB triple to both `:root/dark` and `[data-theme='light']` blocks in CSS, then add the Tailwind name mapping in `tailwind.config.cjs`.

### Renderer caches and layout persistence

- `src/hooks/useTaskDetailCache.ts` — session-lifetime `Map<string, TaskDetail>`. `TaskDetail.tsx` serves from cache instantly, then refetches and updates. Invalidation happens on save (the post-PUT result replaces the cache entry).
- `src/hooks/useLayout.ts` + `useTheme.ts` — debounced saves to the `settings` table so column widths and theme persist across restarts.
- `ResizableColumns.tsx` owns drag state locally and calls `onChange(leftPct, midPct)` while dragging; persistence is the hook's concern, not the component's.

## Important behavioral contracts

- **Renderer clock is untrusted.** The only timer tick in `useTimer.ts` is a visual display of `Date.now() - state.startedAt`. All authoritative timing (job firing, elapsed-time accumulation for stop decisions) uses `new Date()` in the main process.
- **Scheduler jobs must log even when they skip.** The audit log in Settings → "Recent job fires" is the only visibility into what the scheduler did overnight. An error caught and swallowed without a `logJob(name, 'error', msg)` call is an invisible bug.
- **OAuth redirect URI is hardcoded by port.** `electron/services/auth.ts` uses `http://127.0.0.1:{HELM_OAUTH_PORT}/callback` (default 53217). Changing this requires a matching entry in the Google Cloud OAuth client (though Desktop-type clients auto-allow loopback on any port).
- **Some timesheet rows are synthetic.** ClickUp's `GET /time_entries` does not include the in-progress entry, so the renderer prepends a synthetic `TimeEntry` whose `id` starts with `__running:` whenever a timer is running. The merge happens in `src/App.tsx` via `mergeRunningEntry()` from `src/utils/runningEntry.ts`. Use `isRunningId(id)` before any code path that calls ClickUp with that id — `updateTimeEntry`/`deleteTimeEntry` against a synthetic id will 404. Description edits on the running row go through `setRunningDescription` (renderer→main buffer), not `updateTimeEntry`. After the timer stops, `App.tsx` reloads `useTimeEntries` and re-selects the now-real entry by `taskId` so the user keeps viewing what they were working on.
- **Native notifications need `app.setAppUserModelId` on Windows.** Set in `electron/main.ts` to match electron-builder's `appId` (`com.alon.helm`). Without it, `new Notification(...)` silently no-ops on Windows even though `Notification.isSupported()` returns true.

## Scheduled jobs reference

| Job                | Cron (in user timezone)     | Effect                                                      |
|--------------------|-----------------------------|-------------------------------------------------------------|
| standup-mon        | Mon 10:00                   | Pause current, start `standupTaskIdMon`, stash previous     |
| standup-tue-thu    | Tue/Wed/Thu 09:30           | Pause current, start `standupTaskIdTueThu`, stash previous  |
| standup-stop-check | every minute                | If a standup id has run ≥ 20 min, stop (triggers auto-resume)|
| lunch-start        | Mon–Fri 13:00               | `pauseForLater()` — stash running task                      |
| lunch-end          | Mon–Fri 14:00               | `resumePaused()` — resume stashed task                      |
| eod-prompt         | Mon–Fri 16:55               | If timer running: emit `eod-focus-entry` + fire OS Notification. Skips if nothing running. |
| eod-stop           | Mon–Fri 16:59               | `stopTimer({ silent: true, skipAutoResume: true })` — also flushes any buffered description |

A periodic `syncFromRemote()` (60s interval, see `electron/main.ts`) also reconciles local `timer_state` with whatever ClickUp thinks is running, so timers started/stopped from the web or mobile clients appear in Helm.

**EOD flow (16:55 → 16:59)**: the renderer subscribes to `eod-focus-entry`, switches to the Timesheet tab, selects the synthetic running entry, and auto-focuses the description textarea via a `focusDescriptionTick` prop on `TimeEntryDetail`. Keystrokes are debounced (300ms) and shipped to main via `setRunningDescription`, which holds them in `pendingRunningDescription` inside `electron/scheduler/timer.ts`. At 16:59, `eod-stop` calls `stopTimer`, which after stopping the ClickUp timer applies the buffered description through `clickup.updateTimeEntry` (the stop endpoint itself does not accept a description). The legacy autofill modal in `DescriptionPrompt.tsx` no longer renders for `kind: 'eod'`; it remains the path for manual stops.

## Secret storage

`keytar` holds the ClickUp personal API token and the Google OAuth refresh token. Account names: `clickup.token`, `google.refresh_token`, service `helm`. OAuth client id/secret are non-secret and live in the SQLite `settings` table.
