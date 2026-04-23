# Releasing Helm

Helm ships via GitHub Releases with auto-update. When you publish a new release, every running installed copy of Helm will detect it on next launch, download silently, and prompt the user to restart.

Repo: [hugohaircompounds/hugos-helm](https://github.com/hugohaircompounds/hugos-helm)

---

## One-time setup

### Persist your GitHub token

`electron-builder` uses `$env:GH_TOKEN` to upload to GitHub Releases. Set it once as a Windows user env var so every new PowerShell session picks it up automatically:

```powershell
[Environment]::SetEnvironmentVariable("GH_TOKEN", "<your token>", "User")
```

Close and reopen PowerShell after setting it.

**To update the token** (e.g., when the PAT expires in 90 days):

```powershell
[Environment]::SetEnvironmentVariable("GH_TOKEN", "<new token>", "User")
```

**To remove it**:

```powershell
[Environment]::SetEnvironmentVariable("GH_TOKEN", $null, "User")
```

### Token requirements

The PAT needs:

- **Type**: fine-grained personal access token
- **Resource owner**: `hugohaircompounds`
- **Repository access**: Only select repositories → `hugos-helm`
- **Repository permissions** → **Contents**: Read and write
- Everything else stays "No access"

Create new ones at https://github.com/settings/personal-access-tokens/new.

---

## The release loop

After making code changes:

```powershell
# 1. Commit your changes
git add -A
git commit -m "feat: whatever you did"

# 2. Bump the version (auto-commits + tags)
npm version patch     # 0.1.1 → 0.1.2 — bug fixes, tiny changes
# npm version minor   # 0.1.2 → 0.2.0 — new features
# npm version major   # 0.2.0 → 1.0.0 — breaking changes

# 3. Build + publish to GitHub Releases
npm run release

# 4. Push code + the version tag
git push --follow-tags
```

That's it. Your installed Helm will pick up the update on next launch.

---

## What each step does

| Command | What it does |
|---|---|
| `git commit` | Saves your code changes. Required before `npm version`. |
| `npm version patch\|minor\|major` | Bumps `version` in `package.json`, creates a commit (`"0.1.2"`), tags it (`v0.1.2`). Refuses if the working tree is dirty. |
| `npm run release` | Runs `vite build` → `tsc` → `electron-builder --publish=always`. Uses `$env:GH_TOKEN`. Creates the GitHub Release and uploads installer + `latest.yml`. |
| `git push --follow-tags` | Sends commits plus the version tag. Tags let you jump to "what code shipped as 0.1.2" later. |

---

## Verifying a release worked

1. https://github.com/hugohaircompounds/hugos-helm/releases should show the new version at the top with three assets: `Helm-Setup-X.Y.Z.exe`, `Helm-Setup-X.Y.Z.exe.blockmap`, `latest.yml`.
2. Make sure it's **Published**, not Draft. `electron-updater` only finds published releases.
3. Relaunch your installed Helm. Within ~10–30 seconds, an **"Update ready"** dialog should appear.
4. Restart now → Helm closes, updater runs silently, Helm reopens on the new version.

---

## Edge cases and recovery

### Build-only (test locally, don't publish)

```powershell
npm run dist
```

Produces `release\Helm Setup X.Y.Z.exe` locally without touching GitHub.

### File locks during build (`EPERM`, `Access is denied`)

Usually a running Electron/Helm process or a File Explorer window with `release/` open. Fix:

```powershell
taskkill /F /IM Helm.exe
taskkill /F /IM electron.exe
Remove-Item -Recurse -Force release\win-unpacked
```

Close any Explorer windows showing `release/` and retry.

### Native module errors after `npm install`

`better-sqlite3` and `keytar` need rebuilding against Electron's Node ABI:

```powershell
npx electron-rebuild -f -w better-sqlite3
npx electron-rebuild -f -w keytar
```

### `npm version` refuses ("Git working directory not clean")

You have uncommitted changes. Either commit them first, or `git stash` and pop after.

### Publish failed halfway

Go to https://github.com/hugohaircompounds/hugos-helm/releases, delete the broken release, then re-run `npm run release`.

### Need to re-publish the *same* version (rare)

Delete the git tag locally and remotely, then bump/release again:

```powershell
git tag -d v0.1.2
git push origin :refs/tags/v0.1.2
```

### Force a test update without a real code change

Bump version, add a one-char comment somewhere trivial, `npm run release`. The "Update ready" dialog will still fire.

---

## Semver quick reference

| Change type | Command | Example |
|---|---|---|
| Bug fix, typo, tiny tweak | `npm version patch` | `0.1.1` → `0.1.2` |
| New feature (backwards compatible) | `npm version minor` | `0.1.2` → `0.2.0` |
| Breaking change (rare for a personal app) | `npm version major` | `0.2.0` → `1.0.0` |

For a personal tool, almost everything is `patch` or `minor`.

---

## What's stored where

| Thing | Location | Notes |
|---|---|---|
| Your code | `C:\Users\hair\Helm\` + GitHub `main` branch | |
| Installed Helm binary | `%LOCALAPPDATA%\Programs\Helm\` | Replaced by each update |
| App state (SQLite DB, settings) | `%APPDATA%\Helm\` | Persists across updates |
| Secrets (ClickUp token, Google refresh token) | Windows Credential Manager, service `helm` | Persists across updates |
| Build output | `C:\Users\hair\Helm\release\` | Gitignored; regenerated per build |
| GitHub Releases | https://github.com/hugohaircompounds/hugos-helm/releases | Source of truth for what's shipped |
