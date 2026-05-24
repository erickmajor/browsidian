# Plugin Vault Lifecycle Design

**Date:** 2026-05-24
**Status:** Approved
**Branch:** electron-support

---

## Goal

Automatically load enabled plugins whenever a vault connects, and unload them whenever the vault disconnects or changes — matching Obsidian's behavior regardless of how the vault was opened (server, browser FSA, Dropbox, Electron, demo).

---

## Problem

The current implementation calls `loadEnabledPlugins()` once inside `boot()` in `App.tsx`, inside the `finally` block. This means:

- Vault connected at startup → plugins load ✅
- Vault connected after startup (user clicks "Choose local vault", connects Dropbox, etc.) → plugins **never load** ❌
- Vault disconnected → plugins stay loaded in memory ❌
- Vault switched (A → B) → A's plugins stay loaded, B's never load ❌

---

## Design

Replace the one-shot `loadEnabledPlugins()` call in `boot()` with a `useEffect` that reacts to `vaultPath` changes.

### App.tsx change

**Remove** from `boot()`'s finally block:
```typescript
if (useVaultStore.getState().vaultPath) {
  loadEnabledPlugins().catch(() => {})
}
```

**Add** a new `useEffect` (alongside the existing boot and OAuth effects):
```typescript
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

**Add** to existing imports (already present from Task 14 — no new imports needed):
- `loadEnabledPlugins` from `@/plugins/loader`
- `unloadPlugin` from `@/plugins/loader`
- `usePluginStore` from `@/plugins/store`

### Behavior table

| Event | Trigger | Result |
|-------|---------|--------|
| App boots, no vault | `vaultPath` stays null | No plugins loaded |
| App boots with vault (server/Electron) | `vaultPath` set during boot | `loadEnabledPlugins()` runs |
| User opens vault (browser FSA / Dropbox) | `vaultPath` changes null → path | `loadEnabledPlugins()` runs |
| User disconnects | `vaultPath` changes path → null | Cleanup: all plugins unloaded |
| User switches vaults | `vaultPath` changes A → B | Cleanup unloads A, new effect loads B |
| Demo mode | `vaultPath` = `'demo'` | `loadEnabledPlugins()` runs; `discoverPlugins()` returns `[]` silently |

### Race condition analysis

`unloadPlugin` is synchronous internally (removes from Zustand Maps, calls `instance.unload()`). The async wrapper awaits only the file write for saving enabled IDs, which is not triggered during unload. When vault switches (A → B):

1. Cleanup fires — removes all A's plugins from store immediately
2. New effect fires — `loadEnabledPlugins()` reads B's `community-plugins.json`

No overlap: `loadEnabledPlugins` reads from the vault adapter (now pointing at B) and the store (now empty). Safe.

---

## Files Changed

| File | Change |
|------|--------|
| `src/App.tsx` | Remove `loadEnabledPlugins()` from `boot()`, add `useEffect([vaultPath])` |
| `package.json` | Bump Z version |

No other files change. The plugin loader, store, and all shim files are unchanged.

---

## Out of Scope

- Demo mode plugin support (demo vault has no `.obsidian/plugins/`) — already handled gracefully by `discoverPlugins()` returning `[]`
- Plugin state persistence across sessions — already handled by `community-plugins.json`
- Hot-reload when vault files change on disk — not in scope
