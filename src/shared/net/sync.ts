import { ensurePlayerId } from './identity'
import { postSync, type SyncSession } from './api'
import { getUnsyncedSessions, markSessionsSynced, applyServerProfile } from '../storage/db'
import { getDisplayName, hasCustomName, adoptServerName } from '../storage/local'

/**
 * Оркестратор синка (Этап 6, Инкремент 2). Выгружает несинхронизированные партии из IDB
 * на бэкенд и сводит авторитетный профиль обратно. Полностью офлайн-безопасен: любая
 * сетевая ошибка молча откладывает синк до следующего триггера — прогресс уже в IDB.
 *
 * Триггеры (покрывают DoD «включил связь → рекорд в лидерборде без действий игрока»
 * на обеих платформах): старт приложения, событие `online`, возврат вкладки на передний
 * план (`visibilitychange`). Фоновый Background Sync (партия ушла при закрытом приложении)
 * требует injectManifest-режима SW — отложен; форграунд-триггеров хватает под DoD, т.к.
 * связь возвращается при открытом приложении.
 *
 * Пустой батч допустим и полезен: это «подтяни мой профиль» — так рекорд с другого
 * устройства долетает без нового забега.
 */

let syncing = false
let lastSyncAt = 0
const MIN_INTERVAL_MS = 3000 // не долбим сервер на серии триггеров подряд

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/** Событие для живого UI (меню/лидерборд): профиль сведён с сервером. */
function emitSynced(detail: { bestHeight: number; totalCrystals: number }): void {
  try {
    window.dispatchEvent(new CustomEvent('nu:profile-synced', { detail }))
  } catch {
    /* нет window (тест) — не важно */
  }
}

/**
 * Один проход синка. `force` игнорирует троттлинг (ручной вызов из UI). Возвращает true,
 * если синк реально сходил на сервер (для тестов/диагностики).
 */
export async function syncNow(force = false): Promise<boolean> {
  if (syncing || !online()) return false
  if (!force && Date.now() - lastSyncAt < MIN_INTERVAL_MS) return false
  syncing = true
  try {
    const playerId = ensurePlayerId()
    const unsynced = await getUnsyncedSessions()
    const sessions: SyncSession[] = unsynced.map((s) => ({
      id: s.id,
      height: s.height,
      crystals: s.crystals,
      epoch: s.epoch,
      boostersUsed: s.boostersUsed,
      timestamp: s.timestamp,
      durationMs: s.durationMs,
      jumps: s.jumps,
    }))
    // Свой ник шлём как авторитетный; иначе — не трогаем серверное имя.
    const name = hasCustomName() ? getDisplayName() || undefined : undefined
    const res = await postSync(playerId, sessions, { name })
    await markSessionsSynced(res.accepted)
    // Не задавал ник сам — принимаем серверное имя для показа (дефолт/ник с другого устройства).
    adoptServerName(res.profile.name)
    const merged = await applyServerProfile({
      bestHeight: res.profile.bestHeight,
      totalCrystals: res.profile.crystals,
    })
    lastSyncAt = Date.now()
    emitSynced(merged)
    return true
  } catch {
    return false // офлайн/бэкенд недоступен — молча, повторим на следующем триггере
  } finally {
    syncing = false
  }
}

let started = false

/** Навесить триггеры синка. Идемпотентно (StrictMode монтит дважды). Зовётся из main.tsx. */
export function startSync(): void {
  if (started || typeof window === 'undefined') return
  started = true
  const kick = (): void => {
    void syncNow()
  }
  window.addEventListener('online', kick)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick()
  })
  // Первый заход: дать initStorage свести IDB↔LS, затем синкнуть.
  setTimeout(kick, 1500)
}

if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>
  w.__sync = { syncNow }
}
