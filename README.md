<p align="center">
  <img src="img/browsidian.png" alt="Browsidian" width="96" />
</p>

# Browsidian

Browsidian is a local web app to browse and edit an Obsidian vault directly in your browser.

![Screenshot](img/screenshot.png)

It supports four working modes:

- **Server mode**: a local Node.js server reads/writes files on disk in a configured vault folder.
- **Browser mode**: the browser accesses a folder you pick (File System Access API) and edits it directly (no vault configured on the server).
- **Demo mode**: a small in-browser “vault” stored in `localStorage` (useful for agents or browsers without folder picker support).
- **Dropbox mode**: connect to Dropbox and work on a remote vault (all file operations happen in the cloud).

## Features

- Browse vault folders and files (tree view)
- Search files by path/name (client-side filter)
- Create folders and files
- In creation dialogs, press Enter to confirm
- New files must be Markdown (`.md`)
- Edit Markdown with **auto-save** (~1s inactivity) and **Ctrl+S**
- **Preview mode** (basic Markdown → HTML) when not focused; click to edit Markdown
- Non-`.md` files show "File not supported" in preview
- Obsidian **wikilinks** in preview: `[[Note]]`, `[[Note|Alias]]` (click to navigate)
- Basic Markdown tables in preview
- Drag & drop a file onto a folder to move it
- Click a folder to select it (used as default destination for new files/folders)
- Dark / Light mode toggle (persisted in `localStorage`)
- Subtle, consistent UI styling (dark + light)
- Flat, subtle SVG icon set (no external dependencies)
- App logo + favicon
- Footer shows app version (from `/api/config` when available)
- **Plugin support**: Install and run Obsidian community plugins. Open the plugin manager from the ⬡ button in the status bar.
- **Dataview support:** The app builds an internal metadata cache on vault load (frontmatter + inline tags) so `TABLE`, `LIST`, and `TASK` queries with `FROM #tag` clauses return real results.
- `.canvas` files — Interactive canvas editor with pan, zoom, drag, node creation (text, file, group), edge drawing, and auto-save. Compatible with Obsidian's JSON Canvas format.
- `.excalidraw` and `.excalidraw.md` files — Full interactive Excalidraw whiteboard editor (lazy-loaded) with auto-save. Compatible with both raw Excalidraw JSON and the Obsidian Excalidraw plugin wrapper format. Grid is enabled by default (20px); toggle it with the **⊞ Grid** button in the canvas toolbar or `Ctrl+'`. `.excalidraw.md` files show **Excalidraw** / **Código** tabs — switch to Código to view and edit the raw markdown source.
- **Electron layout fix:** The Electron titlebar is now correctly positioned via an explicit CSS grid row (`auto 1fr`), so the editor and sidebar fill the full remaining height without a gap or collapsed content area.
- **Dataview fix:** `app.workspace.trigger()` now correctly fires registered workspace event listeners, enabling Dataview's `dataview:refresh-views` mechanism to notify views after the index finishes building.
- **Plugin CSS:** Each plugin's `styles.css` is now injected into the document on load and removed on unload, fixing missing plugin styles (e.g., Dataview's `(count)` formatting in table headers).
- **Graph view:** Click the graph icon in the status bar to open a full-screen force-directed graph showing wikilink connections and shared tags between markdown files. Supports zoom, pan, drag, node click to open file, and search/filter.
- **File watching:** The app detects external changes to vault files without requiring a restart. In Electron mode, native `fs.watch` pushes events instantly. In Server mode, the server pushes changes via SSE. In Browser mode, the app polls every 15 s using the File System Access API. The file tree refreshes automatically. If the active file is modified externally while you have unsaved edits, a toast prompts you to reload or keep your version.
- **Obsidian ignore filters:** Patterns configured in `.obsidian/app.json` (`userIgnoreFilters`) are respected — matching files are excluded from wikilink resolution, graph view, and MetadataCache while still appearing in the file tree.
- **Plugin context menus:** Sidebar tree items now carry `data-path` attributes, and a `file-menu` workspace event fires on right-click — enabling plugins like **OA-file-hider** to contribute "Hide/Unhide" menu items and manipulate sidebar visibility via the standard Obsidian plugin API. The `hide()`/`show()` DOM augmentations are supported so plugin modals can toggle element visibility.

## Requirements

- Node.js 18+ (recommended)
- For **Browser mode**: Chrome / Edge / Brave (File System Access API)

## Production

Use the hosted app (Browser + Demo modes):

- https://browsidian.app.lamouche.fr/

Notes:

- The hosted app cannot access your filesystem in Server mode. Use Browser mode (folder picker) or Demo mode.
- The hosted app exposes `/api/config` (for the version), but not the vault file APIs.
- Dropbox mode requires server-side OAuth endpoints and `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET` env vars.

## Getting started

### Server mode (recommended for full Obsidian vault access)

Start the server with a vault:

```bash
node server.js --vault /path/to/your/vault
```

Or via env var:

```bash
OBSIDIAN_VAULT=/path/to/your/vault npm start
```

Open: `http://127.0.0.1:5173`

### Browser mode (no server vault)

Start the server without `OBSIDIAN_VAULT`/`--vault`:

```bash
npm start
```

Open the app, then click **Choose local vault** and select your vault folder.

### Demo mode

If your browser (or an automation agent) cannot use the folder picker, click **Try demo vault** in the “Open a vault” dialog.
The demo opens `Welcome.md` by default.

### Dropbox mode

To use a vault stored on Dropbox, click **Connect Dropbox** in the “Open a vault” dialog and follow the OAuth flow.
Then pick the vault folder using the built-in Dropbox folder navigator (browse subfolders, go up, and optionally create a new folder).

Server configuration (local or Vercel):

- `DROPBOX_APP_KEY`
- `DROPBOX_APP_SECRET`
- `DROPBOX_REDIRECT_URI` (must be whitelisted in your Dropbox app, e.g. `https://your-domain/dropbox-oauth.html`)

Note: Dropbox file operations are proxied through the app backend (`/api/dropbox/files/*`) to avoid browser CORS limitations.

Troubleshooting:

- If Dropbox connect fails with an HTTP error, check the status bar message (it includes the backend error body when available).
- The Dropbox folder path is a Dropbox path (e.g. `/Apps/ObsidianVault`), not a local path like `/Applications/...`.
- If the folder doesn’t exist, the app can create it for you (optional prompt).

## Contributing (GitHub workflow)

This project uses a simple GitHub collaboration flow: work on a dedicated branch, then open a Pull Request (PR) to merge into `main`.

### 1) Create a working branch

Always branch from `main` and use the `features/my-feature` naming convention:

```bash
git checkout main
git pull --ff-only
git checkout -b features/my-feature
```

### 2) Develop and commit

- Keep changes focused (small PRs are easier to review).
- Use clear commit messages (what/why). If you rewrite history on your branch, use `git push --force-with-lease` (never on `main`).
- Update documentation (`README.md`) when behavior/usage changes.
- Avoid committing personal vault content or secrets (this app is meant to run locally).

### 3) Push and open a Pull Request

```bash
git push -u origin features/my-feature
```

Then on GitHub:

- Open a **Pull Request** from `features/my-feature` → `main`.
- Describe the change, add screenshots if UI changes, and list any manual checks you ran (e.g. `npm start`).
- Request a review and address feedback with follow-up commits.

### 4) Keep your branch up to date (optional)

If `main` moved while you were working:

```bash
git fetch origin
git rebase origin/main
```

## UI behavior

- **Preview vs Edit**
  - When a file is opened, the app shows an HTML preview.
  - Click the preview to switch to Markdown editing.
  - When the editor loses focus, it switches back to preview.
- **Vault controls**
  - Change/Disconnect actions are shown next to the current vault name.
- **Folder selection**
  - Click a folder row (name) to select it.
  - Selecting a folder clears the currently selected file.
  - Creating a new file/folder pre-fills its path using the selected folder.
  - Click the folder icon to expand/collapse.
  - When a folder path is pre-filled (ending with `/`), the cursor is placed at the end (no auto-selection).
- **Saving**
  - Auto-save runs after ~1.2s without typing (when a file is dirty).
  - You can always press **Ctrl+S** (or click **Save**) to save immediately.
- **Moving files**
  - Drag a file from the tree and drop it on a folder to move it there (a confirmation dialog is shown).
  - You can also drop on empty tree space to move into the selected folder (or the vault root if none is selected).

## Markdown preview support (basic)

The preview is intentionally simple (no external dependencies). It supports:

- Headings (`#` to `####`)
- Paragraphs
- Line breaks inside paragraphs (single newline → line break)
- Bold/italic
- Inline code and fenced code blocks (```…```)
- Blockquotes
- Horizontal rules
- Links: `[label](https://example.com)`
- Images: `![alt](/img/browsidian.png)`
- Tables (header + separator row)
- Obsidian wikilinks: `[[Note]]`, `[[Note|Alias]]`

Notes:

- Section anchors in wikilinks (e.g. `[[Note#Heading]]`) are ignored for now (the file opens, but it does not scroll).
- Table alignment markers are ignored (rendered as a normal table).

## Security model

- In **Server mode**, file operations are restricted to the configured vault root (prevents `..` path traversal).
- In both modes, some directories are hidden from the tree: `.obsidian`, `.git`, `node_modules`, `.trash`, `.DS_Store`.
- In **Demo mode**, files are stored in your browser `localStorage` (no disk access).
- This app is meant to run locally on your laptop. Do not expose it publicly.

## Troubleshooting

- **I still see old UI text / behavior**
  - Hard refresh the page (disable cache).
  - Ensure you restarted the running `node server.js` process.
- **Choose local vault button is disabled**
  - Use Chrome/Edge/Brave and serve the app from `http://127.0.0.1` (recommended).
- **I can’t edit files in Browser mode**
  - The browser will ask for permission to read/write the selected folder. Accept it.

## License

Not specified.
