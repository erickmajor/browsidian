import { create } from 'zustand'
import type { DropboxAuth } from '@/adapters/dropbox'
import {
  randomString,
  sha256Base64Url,
  normRoot,
} from '@/adapters/dropbox'

const STORAGE_KEY = 'dropboxAuthV1'

function loadAuth(): DropboxAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.accessToken || !parsed?.refreshToken) return null
    return parsed as DropboxAuth
  } catch {
    return null
  }
}

function saveAuth(auth: DropboxAuth): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(auth)) } catch {}
}

function clearAuth(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

interface DropboxStore {
  auth: DropboxAuth | null

  // OAuth state (session-only)
  _oauthState: string | null
  _codeVerifier: string | null

  load(): DropboxAuth | null
  save(auth: DropboxAuth): void
  clear(): void
  startOAuth(appKey: string, redirectUri: string): Promise<string>
  finishOAuth(code: string, redirectUri: string): Promise<DropboxAuth>
  setRootPath(path: string): void
}

export const useDropboxStore = create<DropboxStore>((set, get) => ({
  auth: loadAuth(),
  _oauthState: null,
  _codeVerifier: null,

  load() {
    const auth = loadAuth()
    set({ auth })
    return auth
  },

  save(auth) {
    saveAuth(auth)
    set({ auth })
  },

  clear() {
    clearAuth()
    set({ auth: null, _oauthState: null, _codeVerifier: null })
  },

  async startOAuth(appKey, redirectUri): Promise<string> {
    const oauthState = randomString(16)
    const codeVerifier = randomString(64)
    const codeChallenge = await sha256Base64Url(codeVerifier)
    set({ _oauthState: oauthState, _codeVerifier: codeVerifier })

    return (
      `https://www.dropbox.com/oauth2/authorize` +
      `?client_id=${encodeURIComponent(appKey)}` +
      `&response_type=code` +
      `&token_access_type=offline` +
      `&code_challenge_method=S256` +
      `&code_challenge=${encodeURIComponent(codeChallenge)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(oauthState)}`
    )
  },

  async finishOAuth(code, redirectUri): Promise<DropboxAuth> {
    const { _codeVerifier } = get()
    if (!_codeVerifier) throw new Error('No OAuth session in progress')

    const res = await fetch('/api/dropbox/oauth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, codeVerifier: _codeVerifier, redirectUri }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      accessToken?: string
      refreshToken?: string
      expiresIn?: number
      accountId?: string
      error?: string
    }
    if (!res.ok || !data.accessToken || !data.refreshToken) {
      throw new Error(data.error ?? 'OAuth exchange failed')
    }

    const auth: DropboxAuth = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + (data.expiresIn ?? 0) * 1000,
      accountId: data.accountId ?? '',
      rootPath: '',
    }
    get().save(auth)
    set({ _oauthState: null, _codeVerifier: null })
    return auth
  },

  setRootPath(path) {
    const { auth } = get()
    if (!auth) return
    const updated = { ...auth, rootPath: normRoot(path) }
    get().save(updated)
  },
}))
