import type { Db } from './db.js'

/**
 * Профиль игрока на сервере (Этап 6). Кошелёк кристаллов — это истина бэкенда:
 * `crystals = crystals_earned − crystals_spent`. Рекорд и заработок сводятся синком
 * по максимуму/сумме (конспект 4.5). `crystals_spent` пока всегда 0 (магазин убран) —
 * колонка сохранена под будущую трату, чтобы не менять формулу кошелька и синк.
 */
export interface Profile {
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

interface PlayerRow {
  id: string
  name: string
  city: string | null
  best_height: number
  crystals: number
  crystals_earned: number
  crystals_spent: number
  games_played: number
  flagged: boolean
}

function toProfile(r: PlayerRow): Profile {
  return {
    id: r.id,
    name: r.name,
    city: r.city,
    bestHeight: Number(r.best_height),
    crystals: Number(r.crystals),
    crystalsEarned: Number(r.crystals_earned),
    crystalsSpent: Number(r.crystals_spent),
    gamesPlayed: Number(r.games_played),
    flagged: r.flagged,
  }
}

/** Анонимный позывной по умолчанию: «Сигнал A3F2» — короткий, дерзкий, в тоне бренда. */
function defaultName(id: string): string {
  const tail = id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || 'XXXX'
  return `Сигнал ${tail}`
}

/** Границы ника (лидерборд): читаемый, без простыней. */
export const NAME_MIN = 2
export const NAME_MAX = 16

/**
 * Нормализовать ник: убрать управляющие символы, схлопнуть пробелы, обрезать по длине.
 * Возвращает валидное имя или null (слишком коротко/пусто) — вызывающий решает, что делать
 * (роут — ошибка 400, синк — тихо игнорирует, оставив прежнее).
 */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim()
  if (cleaned.length < NAME_MIN) return null
  return cleaned.slice(0, NAME_MAX)
}

/**
 * Найти игрока или создать при первом обращении (профиль/синк на анонимном id).
 * Гонка двух первых запросов безопасна: `ON CONFLICT DO NOTHING` + повторное чтение.
 */
export async function getOrCreatePlayer(
  db: Db,
  id: string,
  opts?: { name?: string; city?: string },
): Promise<Profile> {
  const now = Date.now()
  await db.query(
    `INSERT INTO players (id, name, city, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT (id) DO NOTHING`,
    [id, opts?.name?.trim() || defaultName(id), opts?.city ?? null, now],
  )
  const rows = await db.query<PlayerRow>('SELECT * FROM players WHERE id = $1', [id])
  return toProfile(rows[0])
}

/** Чтение профиля (или создание пустого, если игрок новый). */
export async function getProfile(db: Db, id: string): Promise<Profile> {
  return getOrCreatePlayer(db, id)
}

/**
 * Сменить ник игрока (Этап 6). Валидирует имя; невалидное → null (роут вернёт 400).
 * Игрок создаётся при необходимости — сменить ник можно и до первого синка.
 */
export async function setPlayerName(db: Db, id: string, rawName: unknown): Promise<Profile | null> {
  const name = sanitizeName(rawName)
  if (name === null) return null
  await getOrCreatePlayer(db, id)
  const rows = await db.query<PlayerRow>(
    `UPDATE players SET name = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
    [id, name, Date.now()],
  )
  return toProfile(rows[0])
}
