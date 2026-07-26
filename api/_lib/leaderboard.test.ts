import { describe, it, expect, beforeEach } from 'vitest'
import { createMemoryDb, type Db } from './db'
import { syncSessions } from './sessions'
import { setPlayerName } from './players'
import { getLeaderboard, weekStartUtc } from './leaderboard'

/**
 * Тесты лидерборда (Этап 6, Инкремент 3). Данные заводим через syncSessions (как в проде).
 * `created_at` партии = timestamp с клиента — так тестируем недельное окно точным временем.
 */

let seq = 0
function run(_player: string, height: number, ts: number, crystals = 0) {
  seq += 1
  return { id: `s-${seq}`, height, crystals, epoch: 1, boostersUsed: [], timestamp: ts }
}

describe('лидерборд', () => {
  let db: Db
  beforeEach(async () => {
    db = await createMemoryDb()
  })

  it('глобальный за всё время: ранжирует по рекорду, тай-брейк стабилен', async () => {
    const now = Date.now()
    await syncSessions(db, 'a', [run('a', 500, now)], { name: 'Альфа' })
    await syncSessions(db, 'b', [run('b', 900, now)], { name: 'Браво' })
    await syncSessions(db, 'c', [run('c', 700, now)], { name: 'Чарли' })
    const lb = await getLeaderboard(db, { period: 'all' })
    expect(lb.entries.map((e) => e.name)).toEqual(['Браво', 'Чарли', 'Альфа'])
    expect(lb.entries.map((e) => e.rank)).toEqual([1, 2, 3])
    expect(lb.entries[0].height).toBe(900)
  })

  it('своя позиция: rank и рекорд, даже вне выборки limit', async () => {
    const now = Date.now()
    await syncSessions(db, 'top', [run('top', 1000, now)])
    await syncSessions(db, 'mid', [run('mid', 600, now)])
    await syncSessions(db, 'me', [run('me', 300, now)])
    const lb = await getLeaderboard(db, { period: 'all', playerId: 'me', limit: 1 })
    expect(lb.entries).toHaveLength(1) // топ обрезан
    expect(lb.me).toEqual({ rank: 3, height: 300 })
  })

  it('недельный сброс: прошлая неделя не считается', async () => {
    const now = Date.now()
    const lastWeek = weekStartUtc(now) - 24 * 60 * 60 * 1000 // сутки до начала недели
    await syncSessions(db, 'old', [run('old', 5000, lastWeek)]) // огромный, но прошлая неделя
    await syncSessions(db, 'fresh', [run('fresh', 400, now)])
    const week = await getLeaderboard(db, { period: 'week' })
    expect(week.entries.map((e) => e.playerId)).toEqual(['fresh']) // old отфильтрован
    const all = await getLeaderboard(db, { period: 'all' })
    expect(all.entries.map((e) => e.playerId)).toEqual(['old', 'fresh']) // за всё время — оба
  })

  it('флагнутый игрок (anti-cheat) не попадает в топ', async () => {
    const now = Date.now()
    await syncSessions(db, 'cheater', [run('cheater', 99999, now)])
    await syncSessions(db, 'honest', [run('honest', 500, now)])
    await db.query('UPDATE players SET flagged = true WHERE id = $1', ['cheater'])
    const lb = await getLeaderboard(db, { period: 'all' })
    expect(lb.entries.map((e) => e.playerId)).toEqual(['honest'])
  })

  it('друзья без SSO — supported:false, пусто', async () => {
    const lb = await getLeaderboard(db, { scope: 'friends' })
    expect(lb.supported).toBe(false)
    expect(lb.entries).toEqual([])
  })

  it('ник из профиля отражается в записи топа', async () => {
    const now = Date.now()
    await syncSessions(db, 'x', [run('x', 200, now)])
    await setPlayerName(db, 'x', 'Гроза Эфира')
    const lb = await getLeaderboard(db, { period: 'all' })
    expect(lb.entries[0].name).toBe('Гроза Эфира')
  })
})
