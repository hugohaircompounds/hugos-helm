# Helm

Personal work dashboard. ClickUp + Google Calendar + Gmail, with deterministic time-based automations against ClickUp timers.

## Stack

- Electron + Vite + React + TypeScript
- `better-sqlite3` for local state (settings, timer state, job audit log)
- `node-cron` for scheduling — authoritative time source is the OS clock in the main process
- `googleapis` (Calendar + Gmail) + native `fetch` for ClickUp
- `keytar` for OS-keychain token storage
- Tailwind for styling

No LLM involvement. All schedules are deterministic cron code.

## Install

```
npm install
```

Rebuilding native modules for Electron may be required the first time:

```
npx electron-rebuild -f -w better-sqlite3
npx electron-rebuild -f -w keytar
```

## Dev

```
npm run dev
```

Vite runs on `http://localhost:5173` and Electron opens once it's up.

## Packaging into a .exe

1. Drop a `icon.ico` file into `build/` (see `build/README.md`).
2. Run one of:

   ```
   npm run dist            # NSIS installer
   npm run dist:portable   # single .exe, no install
   npm run dist:all        # both
   ```

3. Output lands in `release/`.
4. Double-click the installer (or portable exe) and you're off — no more `npm run dev` needed. SQLite DB + keychain tokens are persisted in your user profile, so the installed app has the same settings as the dev build on first launch.

## Layout

```
electron/
  main.ts            entry, window, IPC wiring
  preload.ts         contextBridge → window.helm
  scheduler/         node-cron jobs, the time authority
  services/          clickup, gcal, gmail, auth — all external API I/O
  db/                better-sqlite3 setup + schema
  ipc/handlers.ts    ipcMain.handle() for every renderer request
src/                 React renderer
shared/types.ts      IPC contract shared by main and renderer
```

## Architecture rules

- External API calls only in `electron/services/`
- Renderer talks to main via typed IPC defined in `shared/types.ts` (exposed on `window.helm`)
- Scheduler uses `new Date()` in the main process; renderer clock is never trusted
- Every scheduled job writes to `job_logs` (SQLite) with fire time + outcome

## First-run

1. Paste your ClickUp personal API token in Settings. Helm fetches your workspace & user id.
2. Paste your Google OAuth client id + secret (Desktop application type), then click **Connect**.
   A browser opens, you consent, and the refresh token lands in your OS keychain.
3. Pick your **two** standup tasks: "Monday Stand Up - Weekly Planning" for Mondays and your regular daily standup for Tue/Wed/Thu. Confirm the timezone.

## Scheduled jobs (America/New_York by default)

| Job                | When                        | Effect                                                      |
|--------------------|-----------------------------|-------------------------------------------------------------|
| standup-mon        | Mon 10:00                   | Pause current timer, start Monday standup task              |
| standup-tue-thu    | Tue/Wed/Thu 09:30           | Pause current timer, start daily standup task               |
| standup-stop-check | Every minute while running  | After 20 min on a standup, stop it and resume paused task   |
| lunch-start        | Mon–Fri 13:00               | Pause current timer, remember it                            |
| lunch-end          | Mon–Fri 14:00               | Resume the remembered timer                                 |
| eod-prompt         | Mon–Fri 16:55               | Pop modal for today's work description                      |
| eod-stop           | Mon–Fri 16:59               | Stop whatever timer is running                              |

Toggle individual jobs from Settings. All fires — including skips — are logged.
