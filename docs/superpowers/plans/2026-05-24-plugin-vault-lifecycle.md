# Plugin Vault Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load enabled plugins whenever a vault connects and unload them whenever it disconnects or changes, so plugins work regardless of when the user opens a vault.

**Architecture:** Replace the one-shot `loadEnabledPlugins()` call inside `boot()` with a reactive `useEffect([vaultPath])` in `App.tsx`. The effect loads plugins when `vaultPath` becomes non-null and returns a cleanup function that unloads all plugins when `vaultPath` changes or becomes null.

**Tech Stack:** React 18 `useEffect`, existing `loadEnabledPlugins` / `unloadPlugin` from `src/plugins/loader.ts`, `usePluginStore` from `src/plugins/store.ts`.

---

## File Map

**Modify:**
- `src/App.tsx` — add two imports, remove plugin load from `boot()`, add `useEffect([vaultPath])`
- `package.json` — bump Z version

---

## Task 1: Reactive plugin lifecycle in App.tsx

**Files:**
- Modify: `src/App.tsx:13,51-55,59`

**Context:** `src/App.tsx` currently loads plugins once inside `boot()` (lines 53–55). This means plugins never load when the user connects a vault after startup. The fix is a `useEffect` that watches `vaultPath`.

- [ ] **Step 1: Update the loader import on line 13**

Current line 13:
```typescript
import { loadEnabledPlugins } from '@/plugins/loader'
```

Replace with:
```typescript
import { loadEnabledPlugins, unloadPlugin } from '@/plugins/loader'
import { usePluginStore } from '@/plugins/store'
```

- [ ] **Step 2: Remove the plugin load from `boot()`'s finally block**

Current lines 51–56 in `App.tsx`:
```typescript
      } finally {
        setReady(true)
        if (useVaultStore.getState().vaultPath) {
          loadEnabledPlugins().catch(() => {})
        }
      }
```

Replace with:
```typescript
      } finally {
        setReady(true)
      }
```

- [ ] **Step 3: Add the reactive `useEffect` after the boot effect**

After the closing `}, [])` of the boot `useEffect` (currently line 59), add:

```typescript
  // Plugin lifecycle: load on vault connect, unload on vault change/disconnect
  useEffect(() => {
    if (!vaultPath) return

    loadEnabledPlugins().catch(() => {})

    return () => {
      const ids = Array.from(usePluginStore.getState().loaded.keys())
      for (const id of ids) {
        unloadPlugin(id).catch(() => {})
      }
    }
  }, [vaultPath])
```

- [ ] **Step 4: Verify TypeScript**

```
cd C:\Users\erick\Projects\browsidian && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Bump version in `package.json`**

Increment the `Z` in `"version"` (e.g. `1.2.3` → `1.2.4`).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx package.json
git commit -m "feat(plugins): load/unload plugins reactively on vault connect/disconnect"
```

---

## Manual Verification Checklist

After implementing, verify these scenarios manually:

```
1. Boot with existing vault (server mode):
   - Start: node server.js --vault /path/to/vault
   - Open http://localhost:5173
   - Expected: plugins in .obsidian/community-plugins.json load automatically

2. Connect vault after boot (browser FSA mode):
   - Open http://localhost:5173 without --vault flag
   - Click "Choose local vault" and select a vault with plugins
   - Expected: plugins load after vault connects (check browser console)

3. Disconnect vault:
   - With a vault open and plugins loaded, click disconnect
   - Expected: plugins unload (console shows no plugin activity)

4. Switch vaults (if applicable):
   - Open vault A, verify plugins from A load
   - Disconnect, open vault B
   - Expected: A's plugins unload, B's plugins load
```
