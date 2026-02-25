# Soccer Technique Tracker

Local-first Electron desktop app for soccer trainers to import, triage, review, and re-label short technique videos by Player and Skill.

## Stack

- Electron + Electron IPC
- React + TypeScript renderer (Vite via `electron-vite`)
- SQLite (`better-sqlite3`)
- Packaging with `electron-builder` (Windows NSIS + macOS DMG)

## Features

- Player-centric review flow: Player selector, Skill sidebar (`All`, `Unassigned`, skill list), center video player, right-side video list.
- Fast `New Session` flow:
  - pick player
  - optional session notes
  - import files and/or folders
  - triage imported clips with keyboard shortcuts
- Re-triage any existing video and move file on disk if skill changes.
- Deterministic local library file layout (no video blobs in SQLite).
- Fully offline; all files and metadata stay local.

## Requirements

- Node.js 20+
- npm 10+
- Ubuntu/macOS/Windows supported for development

## Install

```bash
npm install
```

## Run in development

```bash
npm run dev
```

## Build app bundles

```bash
npm run build
```

This outputs compiled app files in `out/`.

## Build installers

### Ubuntu host (recommended for your current setup)

```bash
npm run dist
```

`dist` is configured to produce a Windows NSIS installer on Linux:

- `dist/*.exe`

If you want Linux artifacts from Ubuntu:

```bash
npm run dist:linux
```

### macOS host

```bash
npm run dist:mac
```

Produces:

- `dist/*.dmg`

## GitHub Release Automation

- Workflow file: `.github/workflows/release.yml`
- Trigger:
  - push tag like `v0.1.0`
  - or manual run via Actions tab with a tag input
- Output:
  - Windows NSIS installer (`.exe`)
  - macOS DMG (`.dmg`)
  - both uploaded to a GitHub Release for that tag

### First release

```bash
git add .
git commit -m "Prepare v0 release"
git tag v0.1.0
git push origin main --tags
```

## Cross-platform notes

- Ubuntu can build Windows NSIS installers via `npm run dist` / `npm run dist:win`.
- Ubuntu cannot produce macOS `.dmg`; run `npm run dist:mac` on a Mac.
- Best practice for release: build each OS artifact on that OS (or matching CI runner).

## Library and data locations

- On first run, choose a Library Root folder.
- SQLite DB: Electron `userData` directory (`soccer-technique.db`).
- Videos copied into:

```text
library/
  players/{playerNameSlug}-{shortid4}/
    skills/{skillSlug|unassigned}/
      {YYYY-MM-DD}/
        {timestamp}_{shortid}.ext
```

## Keyboard shortcuts in Session Triage

- `J` / `K` or `Down` / `Up`: next/previous video
- `1..9`: quick skill assignment (`1` = Unassigned, `2..9` = first 8 skills)
- `S`: toggle star
- `Enter`: focus notes
- `Esc`: blur notes

## Code signing placeholders

- `electron-builder` config includes standard fields but no required signing setup.
- Add your signing config/certs later for notarized/distributed builds.

## Seed data

At first DB initialization, the app creates:

- player: `Demo Player`
- skills: `First Touch`, `Passing`

## Safety

- Relative video paths are validated to prevent traversal outside library root.
- Video deletion removes both DB row and file.
- Skill changes move the video into the new skill folder safely (rename with EXDEV fallback).

## Machine Transfer Backup/Restore

- Open `Storage` in the app header.
- `Create Backup Bundle`:
  - choose destination parent folder
  - app creates a timestamped backup directory containing:
    - `manifest.json`
    - SQLite snapshot
    - full library file copy
- `Restore From Backup Bundle`:
  - choose backup folder
  - choose destination parent for restored library
  - app restores metadata and library data, then points settings to the restored location
  - existing data is not deleted automatically
