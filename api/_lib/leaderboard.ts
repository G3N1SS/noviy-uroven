import type { Db } from './db'

/**
 * Лидерборд (Этап 6, конспект 4.6 / ТЗ 3.5). Рейтинг считается из таблицы `sessions`
 * (только `valid = true`, игроки с `flagged` исключены) — значит накрутка, отбитая
 * anti-cheat'ом (Инкремент 4), автоматически не попадает в топ.
 *
 *  - period 'week'  — рекорд в партиях текущей ISO-недели (еженедельный сброс).
 *  - period 'all'   — рекорд за всё время.
 *  - scope 'global' — весь мир (реальный).
 *  - scope 'city'   — фильтр по городу (нужен собранный город; пока обычно пусто).
 *  - scope 'friends'— граф друзей появится с T2 SSO (Этап 7) → supported:false.
 */

export type Period = 'week' | 'all'
export type Scope = 'global' | 'city' | 'friends'

export interface LeaderboardEntry {
  rank: number
  playerId: string
  name: string
  city: string | null
  height: number
}

export interface LeaderboardResult {
  scope: Scope
  period: Period
  /** Начало и конец текущей недели (для 'week'); для 'all' — 0/0. */
  periodStart: number
  periodEnd: number
  entries: LeaderboardEntry[]
  /** Позиция запросившего игрока (даже если вне топа) или null, если нет зачётной партии. */
  me: { rank: number; height: number } | null
  /** false → данных нет по объективной причине (друзья без SSO) — клиент честно скажет. */
  supported: boolean
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Начало ISO-недели (понедельник 00:00 UTC) для метки времени. */
export function weekStartUtc(now: number): number {
  const d = new Date(now)
  const dow = (d.getUTCDay() + 6) % 7 // Пн=0 … Вс=6
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow, 0, 0, 0, 0)
}

export interface LeaderboardOpts {
  scope?: Scope
  period?: Period
  playerId?: string
  city?: string
  limit?: number
}

export async function getLeaderboard(db: Db, opts: LeaderboardOpts = {}): Promise<LeaderboardResult> {
  const scope: Scope = opts.scope ?? 'global'
  const period: Period = opts.period ?? 'week'
  const limit = Math.max(1, Math.min(100, opts.limit ?? 100))
  const now = Date.now()
  const periodStart = period === 'week' ? weekStartUtc(now) : 0
  const periodEnd = period === 'week' ? periodStart + WEEK_MS : 0

  // Друзья — только с T2 SSO (Этап 7). Честно: данных нет.
  if (scope === 'friends') {
    return { scope, period, periodStart, periodEnd, entries: [], me: null, supported: false }
  }

  const city = scope === 'city' ? (opts.city ?? null) : null
  // Город без известного города — пусто (клиент подскажет). Глобальный игнорит city.
  if (scope === 'city' && !city) {
    return { scope, period, periodStart, periodEnd, entries: [], me: null, supported: true }
  }

  // Топ: лучший рекорд каждого игрока за период, по убыванию (тай-брейк по id — стабильно).
  const rows = await db.query<{ id: string; name: string; city: string | null; height: number }>(
    `WITH board AS (
        SELECT player_id, MAX(height) AS height
          FROM sessions
         WHERE valid = true AND created_at >= $1
         GROUP BY player_id
     )
     SELECT p.id, p.name, p.city, b.height
       FROM board b JOIN players p ON p.id = b.player_id
      WHERE p.flagged = false AND ($2::text IS NULL OR p.city = $2)
      ORDER BY b.height DESC, p.id ASC
      LIMIT $3`,
    [periodStart, city, limit],
  )
  const entries: LeaderboardEntry[] = rows.map((r, i) => ({
    rank: i + 1,
    playerId: r.id,
    name: r.name,
    city: r.city,
    height: Number(r.height),
  }))

  // Позиция запросившего: его рекорд за период + сколько игроков строго выше.
  let me: LeaderboardResult['me'] = null
  if (opts.playerId) {
    const mine = await db.query<{ height: number | null }>(
      `SELECT MAX(height) AS height FROM sessions
        WHERE player_id = $1 AND valid = true AND created_at >= $2`,
      [opts.playerId, periodStart],
    )
    const myHeight = mine[0]?.height
    if (myHeight != null) {
      const higher = await db.query<{ n: number }>(
        `WITH board AS (
            SELECT player_id, MAX(height) AS height
              FROM sessions
             WHERE valid = true AND created_at >= $1
             GROUP BY player_id
         )
         SELECT COUNT(*)::int AS n
           FROM board b JOIN players p ON p.id = b.player_id
          WHERE p.flagged = false AND ($2::text IS NULL OR p.city = $2) AND b.height > $3`,
        [periodStart, city, Number(myHeight)],
      )
      me = { rank: Number(higher[0].n) + 1, height: Number(myHeight) }
    }
  }

  return { scope, period, periodStart, periodEnd, entries, me, supported: true }
}
