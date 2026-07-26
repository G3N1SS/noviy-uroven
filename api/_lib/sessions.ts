import type { Db } from './db'
import { getOrCreatePlayer, setPlayerName, type Profile } from './players'
import { validateRun, RATE_MAX_PER_MIN } from './anticheat'

/**
 * Синк партий (Этап 6, конспект 4.6: «POST /api/sessions/sync — батч с дедупликацией по UUID»).
 *
 * Модель конфликтов (4.5) под мультидевайс (игрок на 3 устройствах):
 *  - Кристаллы — СУММА по сессиям. Каждая партия со своим UUID вносит вклад РОВНО один раз
 *    (`ON CONFLICT (id) DO NOTHING`), поэтому повторная отправка того же батча не задваивает,
 *    а два устройства, набравшие офлайн по отдельности, корректно складываются.
 *  - Рекорд — MAX высоты по всем партиям.
 *  - Агрегаты пересчитываются из таблицы `sessions` целиком (идемпотентно, без дрейфа),
 *    только по `valid = true` — задел под anti-cheat (Инкремент 4): аномалии не идут ни в
 *    баланс, ни в рекорд.
 */

export interface IncomingSession {
  id: string
  height: number
  crystals: number
  epoch: number
  boostersUsed: string[]
  timestamp: number
  /** (anti-cheat) журнал: длительность/прыжки — для валидации физической возможности. */
  durationMs?: number
  jumps?: number
}

export interface SyncResult {
  profile: Profile
  /** id партий, впервые принятых сервером (не дубли) — клиент пометит их synced. */
  accepted: string[]
}

/** Санитария входа: кривую партию пропускаем, но не роняем весь батч. */
function sanitize(s: unknown): IncomingSession | null {
  if (!s || typeof s !== 'object') return null
  const o = s as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id) return null
  const height = Number(o.height)
  const crystals = Number(o.crystals)
  const epoch = Number(o.epoch)
  const timestamp = Number(o.timestamp)
  if (![height, crystals, epoch, timestamp].every(Number.isFinite)) return null
  if (height < 0 || crystals < 0) return null
  const boostersUsed = Array.isArray(o.boostersUsed)
    ? o.boostersUsed.filter((b): b is string => typeof b === 'string')
    : []
  const durationMs = Number(o.durationMs)
  const jumps = Number(o.jumps)
  return {
    id: o.id,
    height: Math.floor(height),
    crystals: Math.floor(crystals),
    epoch: Math.max(1, Math.min(5, Math.floor(epoch))),
    boostersUsed,
    timestamp: Math.floor(timestamp),
    durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? Math.floor(durationMs) : undefined,
    jumps: Number.isFinite(jumps) && jumps >= 0 ? Math.floor(jumps) : undefined,
  }
}

/** Партия, прошедшая валидацию: с вердиктом `valid` и журналом `events` для аудита. */
interface PreparedSession {
  s: IncomingSession
  valid: boolean
  events: Record<string, unknown>
}

/** Одним multi-row INSERT (экономим round-trip'ы к Neon по HTTP). RETURNING даёт принятые id. */
async function insertSessions(
  db: Db,
  playerId: string,
  prepared: PreparedSession[],
  now: number,
): Promise<string[]> {
  if (prepared.length === 0) return []
  const cols = 10 // id,player_id,height,crystals,epoch,boosters_used,events,valid,created_at,synced_at
  const values: string[] = []
  const params: unknown[] = []
  prepared.forEach(({ s, valid, events }, i) => {
    const b = i * cols
    values.push(
      `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6}::jsonb,$${b + 7}::jsonb,$${b + 8},$${b + 9},$${b + 10})`,
    )
    params.push(
      s.id,
      playerId,
      s.height,
      s.crystals,
      s.epoch,
      JSON.stringify(s.boostersUsed),
      JSON.stringify(events),
      valid,
      s.timestamp,
      now,
    )
  })
  const rows = await db.query<{ id: string }>(
    `INSERT INTO sessions (id, player_id, height, crystals, epoch, boosters_used, events, valid, created_at, synced_at)
     VALUES ${values.join(',')}
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    params,
  )
  return rows.map((r) => r.id)
}

/**
 * Принять батч партий игрока: дедуп по UUID, пересчёт агрегатов, возврат авторитетного
 * профиля. Пустой батч допустим — тогда это просто «подтяни мой профиль».
 */
export async function syncSessions(
  db: Db,
  playerId: string,
  rawSessions: unknown[],
  opts?: { city?: string; name?: string },
): Promise<SyncResult> {
  await getOrCreatePlayer(db, playerId, { city: opts?.city })
  // Ник, заданный на клиенте (в т.ч. офлайн), долетает синком; кривой — тихо игнорим.
  if (opts?.name != null) await setPlayerName(db, playerId, opts.name)
  const now = Date.now()
  const clean = rawSessions.map(sanitize).filter((s): s is IncomingSession => s !== null)

  // Rate-limit начислений: сколько зачётных партий игрок уже прислал за последнюю минуту.
  // Свежие сверх лимита пишутся, но valid=false — в кошелёк/лидерборд не идут.
  const recent = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM sessions
      WHERE player_id = $1 AND valid = true AND synced_at > $2`,
    [playerId, now - 60_000],
  )
  let creditedSoFar = Number(recent[0]?.n ?? 0)

  // Валидация каждой партии (физическая возможность) + rate-limit → вердикт и журнал.
  const prepared: PreparedSession[] = clean.map((s) => {
    const verdict = validateRun(s)
    const rateOk = creditedSoFar < RATE_MAX_PER_MIN
    const valid = verdict.valid && rateOk
    if (valid) creditedSoFar += 1
    const reasons = [...verdict.reasons]
    if (!rateOk) reasons.push('rate-limit')
    return {
      s,
      valid,
      events: { durationMs: s.durationMs, jumps: s.jumps, reasons },
    }
  })
  const accepted = await insertSessions(db, playerId, prepared, now)

  // Пересчёт из таблицы целиком — идемпотентно, только валидные партии.
  const agg = await db.query<{ best: number; earned: number; games: number }>(
    `SELECT COALESCE(MAX(height),0)::int AS best,
            COALESCE(SUM(crystals),0)::int AS earned,
            COUNT(*)::int AS games
       FROM sessions WHERE player_id = $1 AND valid = true`,
    [playerId],
  )
  const { best, earned, games } = agg[0]
  const rows = await db.query(
    `UPDATE players
        SET best_height   = GREATEST(best_height, $2),
            crystals_earned = $3,
            games_played  = $4,
            crystals      = $3 - crystals_spent,
            updated_at    = $5
      WHERE id = $1
      RETURNING id, name, city, best_height, crystals, crystals_earned, crystals_spent, games_played, flagged`,
    [playerId, best, earned, games, now],
  )
  const r = rows[0] as Record<string, unknown>
  const profile: Profile = {
    id: r.id as string,
    name: r.name as string,
    city: (r.city as string | null) ?? null,
    bestHeight: Number(r.best_height),
    crystals: Number(r.crystals),
    crystalsEarned: Number(r.crystals_earned),
    crystalsSpent: Number(r.crystals_spent),
    gamesPlayed: Number(r.games_played),
    flagged: r.flagged as boolean,
  }
  return { profile, accepted }
}
