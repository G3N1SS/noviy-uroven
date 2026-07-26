import type { Db } from './db'

/**
 * OTA-конфиг баланса (Этап 6, конспект 4.6: «GET /api/config — balance.json с сервера»).
 * Позволяет тюнить экономику/спавн без релиза. Хранится одной строкой в `config` под
 * ключом `balance`. Если оверрайда нет — клиент падает на встроенный `balance.json`
 * (фолбэк в Инкременте 5), поэтому пустой ответ здесь — это норма, а не ошибка.
 */

export interface ServerConfig {
  /** Оверрайд баланса или null (тогда клиент берёт встроенный). */
  balance: unknown | null
  /** Метка версии для кэша на клиенте (0, если оверрайда нет). */
  updatedAt: number
}

interface ConfigRow {
  value: unknown
  updated_at: number
}

export async function getServerConfig(db: Db): Promise<ServerConfig> {
  const rows = await db.query<ConfigRow>(
    `SELECT value, updated_at FROM config WHERE key = 'balance'`,
  )
  if (rows.length === 0) return { balance: null, updatedAt: 0 }
  return { balance: rows[0].value, updatedAt: Number(rows[0].updated_at) }
}

/** Записать/обновить оверрайд баланса; `null` — снять оверрайд (вернуться к встроенному). */
export async function setServerConfig(db: Db, balance: unknown): Promise<void> {
  if (balance == null) {
    await db.query(`DELETE FROM config WHERE key = 'balance'`)
    return
  }
  const now = Date.now()
  await db.query(
    `INSERT INTO config (key, value, updated_at) VALUES ('balance', $1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [JSON.stringify(balance), now],
  )
}
