import { getPlayerId, setPlayerId } from '../storage/local'

/**
 * Анонимная идентичность игрока (Этап 6). Все серверные запросы (профиль, синк, лидерборд)
 * привязаны к `playerId` — UUID, сгенерированному на первом запуске. Регистрации
 * нет: вход по номеру через T2 SSO придёт на Этапе 7 и сольётся с этим id (тот же профиль,
 * рекорд и кошелёк — миграция без потери прогресса).
 *
 * Хранение: LS (читаем синхронно перед каждым запросом) + зеркало в IDB-профиль
 * (`initStorage` в db.ts), чтобы идентичность пережила очистку localStorage — та же
 * гарантия «прогресс не теряется», что и у рекорда на Этапе 5.
 */

/** UUID с фолбэком: `crypto.randomUUID` есть не везде (старый Safari). */
function uuid(): string {
  const c = globalThis.crypto
  if (c && 'randomUUID' in c) return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Текущий playerId, генерируя и сохраняя при первом обращении. Идемпотентно:
 * второй вызов вернёт тот же id.
 */
export function ensurePlayerId(): string {
  let id = getPlayerId()
  if (!id) {
    id = uuid()
    setPlayerId(id)
  }
  return id
}
