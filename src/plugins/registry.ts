import { useVaultStore } from '@/stores/vault'
import { usePluginStore } from './store'
import type { CommunityPlugin } from './store'

const COMMUNITY_LIST_URL =
  'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json'

export async function fetchCommunityList(): Promise<CommunityPlugin[]> {
  const { communityFetched, communityList } = usePluginStore.getState()
  if (communityFetched) return communityList

  const res = await fetch(COMMUNITY_LIST_URL)
  if (!res.ok) throw new Error(`Failed to fetch plugin list: ${res.status}`)
  const list = await res.json() as CommunityPlugin[]
  usePluginStore.getState().setCommunityList(list)
  return list
}

export async function installPlugin(plugin: CommunityPlugin): Promise<void> {
  const { setInstalling } = usePluginStore.getState()
  const adapter = useVaultStore.getState().adapter
  if (!adapter) throw new Error('No vault adapter')

  setInstalling(plugin.id, true)
  try {
    // Resolve latest release tag
    const releaseRes = await fetch(
      `https://api.github.com/repos/${plugin.repo}/releases/latest`
    )
    if (!releaseRes.ok) {
      throw new Error(`GitHub API error ${releaseRes.status} for ${plugin.repo}`)
    }
    const release = await releaseRes.json() as { tag_name: string }
    const base = `https://github.com/${plugin.repo}/releases/download/${release.tag_name}`

    const pluginDir = `.obsidian/plugins/${plugin.id}`
    if (adapter.mkdir) await adapter.mkdir(pluginDir)

    // Download required files (main.js + manifest.json)
    for (const file of ['main.js', 'manifest.json']) {
      const fileRes = await fetch(`${base}/${file}`)
      if (!fileRes.ok) throw new Error(`Failed to download ${file}: ${fileRes.status}`)
      await adapter.writeFile(`${pluginDir}/${file}`, await fileRes.text())
    }

    // styles.css is optional — ignore errors
    try {
      const stylesRes = await fetch(`${base}/styles.css`)
      if (stylesRes.ok) {
        await adapter.writeFile(`${pluginDir}/styles.css`, await stylesRes.text())
      }
    } catch {}
  } finally {
    setInstalling(plugin.id, false)
  }
}

export async function uninstallPlugin(id: string): Promise<void> {
  const adapter = useVaultStore.getState().adapter
  if (!adapter) throw new Error('No vault adapter')
  await adapter.deleteFile(`.obsidian/plugins/${id}`)
}
