# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start with server-mode vault
node server.js --vault /path/to/your/vault
# or
OBSIDIAN_VAULT=/path/to/your/vault npm start

# Start without vault (browser/demo mode only)
npm start

# Custom port/host
node server.js --vault /path --port 3000 --host 0.0.0.0
```

App runs at `http://127.0.0.1:5173` by default. No build step. No test suite.

## Mandatory on every commit

1. **Bump version** in `package.json`:
   - `Z` increments every commit on a branch
   - `Y` increments when starting a new branch
   - `X` is set only by the user
2. **Update `README.md`** to reflect any behavior or usage change.

## Architecture

### No framework, no bundler

`server.js` is a single-file Node.js HTTP server (raw `http` module, no Express). `public/app.js` is a single vanilla JS file (~2400 lines). Files are served directly — no compilation step.

### Four operating modes

The frontend's global `state.mode` drives all file I/O:

| Mode | Backend |
|------|---------|
| `server` | REST API on the local Node.js server (`/api/*`) |
| `browser` | Browser File System Access API (no server vault needed) |
| `demo` | `localStorage` via `demoVaultStore` IIFE |
| `dropbox` | Dropbox API proxied through the server (`/api/dropbox/*`) |

Every file operation (`listDir`, `readFile`, `writeFile`, `mkdir`, `deleteFilePath`, `moveFilePath`) dispatches on `state.mode`. When adding a new file operation, implement all four branches.

### Server (`server.js`)

- **Static serving**: `public/` directory. At serve time, `__APP_VERSION__` in `index.html` is replaced with the version from `package.json`.
- **Vault API** (`/api/*`): list, read, write, move, delete, mkdir. All paths go through `ensureInsideVault()` to prevent traversal attacks — never bypass this.
- **Dropbox OAuth proxy** (`/api/dropbox/oauth/*`): exchanges and refreshes tokens server-side (keeps `DROPBOX_APP_SECRET` out of the browser).
- **Dropbox file proxy** (`/api/dropbox/files/*`): proxies Dropbox API calls to avoid browser CORS. Access token arrives in `x-dropbox-access-token` header from the client.

### Frontend (`public/app.js`)

- **State**: single `state` object at the top of the file. All UI state lives here.
- **Persistence**:
  - `dropboxAuthStore` — Dropbox tokens in `localStorage`
  - `vaultHandleStore` — browser-mode `FileSystemDirectoryHandle` in IndexedDB
  - `demoVaultStore` — demo vault files/dirs in `localStorage`
- **File index**: `ensureFileIndex()` builds a lazy `Map<name→paths[]>` for wikilink resolution. Call `invalidateFileIndex()` after any create/move/delete.
- **Markdown**: `renderMarkdownBasic()` is a hand-rolled parser with no external dependencies. Keep it that way.
- **Version display**: resolved via `/api/config` → embedded `<meta name="app-version">` → `/package.json`, in that order.

### Dropbox button visibility

The Dropbox button in the vault dialog is hidden unless `?dropbox` is present in the URL. This is intentional (production hosted app behavior).

## UI consistency rules

- Use existing CSS variables and component classes. Do not introduce one-off colors, radii, or spacing.
- Hover/focus/active/disabled states must match existing components.
- Dark and light themes are both supported via `data-theme` on `<html>`. Test both.
