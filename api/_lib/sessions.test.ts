import { describe, it, expect, beforeEach } from 'vitest'
import { createMemoryDb, type Db } from './db'
import { syncSessions, type IncomingSession } from './sessions'

/**
 * Тесты синка (Этап 6, Инкремент 2). Проверяют инварианты конфликтов 4.5:
 * дедуп по UUID, кристаллы = сумма (не задваиваются), рекорд = max, идемпотентность.
 */

let id = 0
function mkSession(over: Partial<IncomingSession> = {}): IncomingSession {
  id += 1
  return {
    id: `s-${id}-${Math.random().toString(36).slice(2, 8)}`,
    height: 100,
    crystals: 10,
    epoch: 1,
    boostersUsed: [],
    timestamp: Date.now() + id,
    ...over,
  }
}

describe('syncSessions', () => {
  let db: Db
  beforeEach(async () => {
    db = await createMemoryDb()
  })

  it('первый батч: принимает все, агрегаты = сумма/макс/счёт', async () => {
    const a = mkSession({ height: 300, crystals: 5 })
    const b = mkSession({ height: 900, crystals: 15 })
    const res = await syncSessions(db, 'p1', [a, b])
    expect(res.accepted.sort()).toEqual([a.id, b.id].sort())
    expect(res.profile.bestHeight).toBe(900)
    expect(res.profile.crystalsEarned).toBe(20)
    expect(res.profile.crystals).toBe(20)
    expect(res.profile.gamesPlayed).toBe(2)
  })

  it('дедуп: повторная отправка того же батча ничего не добавляет (кристаллы не задваиваются)', async () => {
    const a = mkSession({ height: 300, crystals: 5 })
    const b = mkSession({ height: 500, crystals: 7 })
    await syncSessions(db, 'p1', [a, b])
    const again = await syncSessions(db, 'p1', [a, b])
    expect(again.accepted).toEqual([]) // всё уже принято
    expect(again.profile.crystalsEarned).toBe(12) // 5+7, не 24
    expect(again.profile.gamesPlayed).toBe(2)
    expect(again.profile.bestHeight).toBe(500)
  })

  it('частичное пересечение: принимаются только новые', async () => {
    const a = mkSession({ crystals: 3 })
    await syncSessions(db, 'p1', [a])
    const b = mkSession({ crystals: 4 })
    const res = await syncSessions(db, 'p1', [a, b]) // a — дубль, b — новая
    expect(res.accepted).toEqual([b.id])
    expect(res.profile.crystalsEarned).toBe(7)
    expect(res.profile.gamesPlayed).toBe(2)
  })

  it('мультидевайс: два независимых батча складываются суммой', async () => {
    const deviceA = [mkSession({ height: 400, crystals: 30 })]
    const deviceB = [mkSession({ height: 250, crystals: 20 })]
    await syncSessions(db, 'p1', deviceA)
    const res = await syncSessions(db, 'p1', deviceB)
    expect(res.profile.crystalsEarned).toBe(50) // сумма, не max(30,20)
    expect(res.profile.bestHeight).toBe(400) // рекорд — max
  })

  it('пустой батч = «подтяни профиль», не падает', async () => {
    await syncSessions(db, 'p1', [mkSession({ height: 111, crystals: 9 })])
    const res = await syncSessions(db, 'p1', [])
    expect(res.accepted).toEqual([])
    expect(res.profile.bestHeight).toBe(111)
    expect(res.profile.crystalsEarned).toBe(9)
  })

  it('anti-cheat: невозможная партия принята в журнал, но не в агрегаты', async () => {
    const cheat = mkSession({ height: 100_000, crystals: 5, durationMs: 5_000, jumps: 5 })
    const res = await syncSessions(db, 'p1', [cheat])
    expect(res.accepted).toEqual([cheat.id]) // записана (аудит)
    expect(res.profile.bestHeight).toBe(0) // но не в рекорд
    expect(res.profile.gamesPlayed).toBe(0) // и не в счёт партий
  })

  it('anti-cheat: честная партия рядом с накруткой засчитывается', async () => {
    const honest = mkSession({ height: 800, crystals: 10, durationMs: 40_000, jumps: 60 })
    const cheat = mkSession({ height: 999_999, crystals: 9, durationMs: 3_000, jumps: 2 })
    const res = await syncSessions(db, 'p1', [honest, cheat])
    expect(res.profile.bestHeight).toBe(800)
    expect(res.profile.crystalsEarned).toBe(10)
    expect(res.profile.gamesPlayed).toBe(1)
  })

  it('rate-limit: свыше 60 зачётных партий в минуту не начисляются', async () => {
    const batch = Array.from({ length: 65 }, () =>
      mkSession({ height: 100, crystals: 1, durationMs: 5_000, jumps: 10 }),
    )
    const res = await syncSessions(db, 'p1', batch)
    expect(res.accepted).toHaveLength(65) // все записаны
    expect(res.profile.gamesPlayed).toBe(60) // но зачтено ровно 60
    expect(res.profile.crystalsEarned).toBe(60)
  })

  it('кривые записи пропускаются, валидные из того же батча принимаются', async () => {
    const good = mkSession({ crystals: 8 })
    const batch: unknown[] = [
      good,
      { id: '', height: 1, crystals: 1, epoch: 1, timestamp: 1 }, // пустой id
      { id: 'x', height: -5, crystals: 1, epoch: 1, timestamp: 1 }, // отрицательная высота
      { id: 'y', height: 1, crystals: 'nan', epoch: 1, timestamp: 1 }, // не число
      null,
    ]
    const res = await syncSessions(db, 'p1', batch)
    expect(res.accepted).toEqual([good.id])
    expect(res.profile.gamesPlayed).toBe(1)
    expect(res.profile.crystalsEarned).toBe(8)
  })
})
