/**
 * Клиент REST-API бэкенда (Этап 6, конспект 4.6). Тонкие типизированные обёртки над fetch,
 * same-origin (`/api/*`). Всё офлайн-безопасно: сетевая ошибка/таймаут → throw, вызывающий
 * (sync-оркестратор) молча откладывает до следующего триггера. Прогресс живёт локально,
 * сеть — бонус.
 */

export interface ServerProfile {
  id: string
  name: string
  city: string | null
  bestHeight: number
  crystals: number
  crystalsEarned: number
  crystalsSpent: number
  gamesPlayed: number
  flagged: boolean
}

export interface SyncResponse {
  profile: ServerProfile
  accepted: string[]
}

/** Партия в формате бэкенда (совпадает с журналом IDB минус флаг synced). */
export interface SyncSession {
  id: string
  height: number
  crystals: number
  epoch: number
  boostersUsed: string[]
  timestamp: number
  /** (Этап 6 anti-cheat) журнал: длительность и число прыжков — для серверной валидации. */
  durationMs?: number
  jumps?: number
}

const BASE = '/api'
const TIMEOUT_MS = 8000

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(BASE + path, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

export function fetchProfile(playerId: string): Promise<ServerProfile> {
  return request<ServerProfile>(`/profile?playerId=${encodeURIComponent(playerId)}`)
}

export interface ServerConfig {
  balance: unknown | null
  updatedAt: number
}

export function fetchConfig(): Promise<ServerConfig> {
  return request<ServerConfig>('/config')
}

export type LbScope = 'global' | 'city' | 'friends'
export type LbPeriod = 'week' | 'all'

export interface LeaderboardEntry {
  rank: number
  playerId: string
  name: string
  city: string | null
  height: number
}

export interface LeaderboardResult {
  scope: LbScope
  period: LbPeriod
  periodStart: number
  periodEnd: number
  entries: LeaderboardEntry[]
  me: { rank: number; height: number } | null
  supported: boolean
}

export function fetchLeaderboard(opts: {
  scope: LbScope
  period: LbPeriod
  playerId?: string
}): Promise<LeaderboardResult> {
  const q = new URLSearchParams({ scope: opts.scope, period: opts.period })
  if (opts.playerId) q.set('playerId', opts.playerId)
  return request<LeaderboardResult>(`/leaderboard?${q.toString()}`)
}

/** Сменить ник немедленно (мгновенный отклик в настройках). Сервер валидирует → 400. */
export function updateName(playerId: string, name: string): Promise<ServerProfile> {
  return request<ServerProfile>('/profile', {
    method: 'POST',
    body: JSON.stringify({ playerId, name }),
  })
}

export function postSync(
  playerId: string,
  sessions: SyncSession[],
  opts?: { city?: string; name?: string },
): Promise<SyncResponse> {
  return request<SyncResponse>('/sessions/sync', {
    method: 'POST',
    body: JSON.stringify({ playerId, sessions, city: opts?.city, name: opts?.name }),
  })
}
