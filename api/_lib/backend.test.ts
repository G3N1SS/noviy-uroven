import { describe, it, expect, beforeEach } from 'vitest'
import { createMemoryDb, type Db } from './db'
import { getOrCreatePlayer, getProfile, setPlayerName, sanitizeName } from './players'
import { getServerConfig, setServerConfig } from './config'
import { syncSessions } from './sessions'

/**
 * Тесты бэкенда Этапа 6 против pglite (реальный Postgres в WASM, в памяти). Тот же SQL,
 * что уедет в Neon, — юнит-тесты проверяют логику без сети и без прод-БД.
 */

describe('players', () => {
  let db: Db
  beforeEach(async () => {
    db = await createMemoryDb()
  })

  it('создаёт игрока при первом обращении и даёт дефолты', async () => {
    const p = await getOrCreatePlayer(db, 'player-abc-1234')
    expect(p.id).toBe('player-abc-1234')
    expect(p.bestHeight).toBe(0)
    expect(p.crystals).toBe(0)
    expect(p.gamesPlayed).toBe(0)
    expect(p.flagged).toBe(false)
    // Позывной по умолчанию — из хвоста id, в тоне бренда.
    expect(p.name).toBe('Сигнал 1234')
  })

  it('идемпотентен: повторный вызов возвращает того же игрока, не плодит дублей', async () => {
    const a = await getOrCreatePlayer(db, 'dup-id-0001', { name: 'Первый' })
    const b = await getOrCreatePlayer(db, 'dup-id-0001', { name: 'Второй' })
    expect(a.name).toBe('Первый')
    expect(b.name).toBe('Первый') // ON CONFLICT DO NOTHING — имя не перезаписалось
    const count = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM players')
    expect(Number(count[0].n)).toBe(1)
  })

  it('getProfile для нового id создаёт пустой профиль', async () => {
    const p = await getProfile(db, 'fresh-id-9999')
    expect(p.gamesPlayed).toBe(0)
    expect(p.crystals).toBe(0)
  })
})

describe('ник', () => {
  let db: Db
  beforeEach(async () => {
    db = await createMemoryDb()
  })

  it('sanitizeName: схлопывает пробелы, режет по длине, отбраковывает короткое', () => {
    expect(sanitizeName('  Вышка   Босс  ')).toBe('Вышка Босс')
    expect(sanitizeName('a')).toBeNull() // < 2
    expect(sanitizeName('   ')).toBeNull()
    expect(sanitizeName(42 as unknown as string)).toBeNull()
    expect(sanitizeName('x'.repeat(40))).toHaveLength(16) // потолок
    expect(sanitizeName('Ню' + String.fromCharCode(9) + 'ник')).toBe('Нюник') // таб (control) вычищен
  })

  it('setPlayerName меняет имя и возвращает профиль; кривое → null', async () => {
    const bad = await setPlayerName(db, 'p1', 'a')
    expect(bad).toBeNull()
    const ok = await setPlayerName(db, 'p1', 'Гроза Эфира')
    expect(ok?.name).toBe('Гроза Эфира')
    const read = await getProfile(db, 'p1')
    expect(read.name).toBe('Гроза Эфира')
  })

  it('синк с opts.name прописывает ник (смена офлайн долетает)', async () => {
    const res = await syncSessions(db, 'p1', [], { name: 'Сетевой Шторм' })
    expect(res.profile.name).toBe('Сетевой Шторм')
  })

  it('синк без name не трогает уже заданный ник', async () => {
    await setPlayerName(db, 'p1', 'Мой Ник')
    const res = await syncSessions(db, 'p1', [])
    expect(res.profile.name).toBe('Мой Ник')
  })
})

describe('config (OTA)', () => {
  let db: Db
  beforeEach(async () => {
    db = await createMemoryDb()
  })

  it('без оверрайда — balance null (клиент падёт на встроенный)', async () => {
    const c = await getServerConfig(db)
    expect(c.balance).toBeNull()
    expect(c.updatedAt).toBe(0)
  })

  it('setServerConfig сохраняет и апсертит оверрайд', async () => {
    await setServerConfig(db, { jump: { heightPx: 999 } })
    const c1 = await getServerConfig(db)
    expect(c1.balance).toEqual({ jump: { heightPx: 999 } })
    expect(c1.updatedAt).toBeGreaterThan(0)

    await setServerConfig(db, { jump: { heightPx: 111 } })
    const c2 = await getServerConfig(db)
    expect(c2.balance).toEqual({ jump: { heightPx: 111 } }) // апсерт, не дубль
    const rows = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM config')
    expect(Number(rows[0].n)).toBe(1)
  })
})
