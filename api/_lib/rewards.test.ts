import { describe, it, expect, beforeEach } from 'vitest'
import { createMemoryDb, type Db } from './db'
import { syncSessions } from './sessions'
import { redeem, getReward } from './rewards'

/**
 * Тесты обмена кристаллов (Этап 6, Инкремент 5). Кристаллы заводим честными партиями
 * через syncSessions (проходят anti-cheat), потом тратим.
 */

// Награда с известной ценой из каталога.
const gb1 = getReward('gb1')! // «1 ГБ на тариф» — 500

async function giveCrystals(db: Db, player: string, amount: number) {
  // Партия, валидная по всем границам anti-cheat: высота ≥ кристаллов (плотность),
  // прыжки/длительность с запасом под высоту.
  const height = Math.max(amount, 500)
  await syncSessions(db, player, [
    {
      id: `earn-${player}-${amount}`,
      height,
      crystals: amount,
      epoch: 2,
      boostersUsed: [],
      timestamp: Date.now(),
      durationMs: Math.min(height * 1000, 5 * 3600 * 1000),
      jumps: height,
    },
  ])
}

describe('redeem', () => {
  let db: Db
  beforeEach(async () => {
    db = await createMemoryDb()
  })

  it('успешный обмен списывает цену и оставляет earned нетронутым', async () => {
    await giveCrystals(db, 'p1', 800)
    const res = await redeem(db, 'p1', 'gb1', 'r-1')
    expect(res.status).toBe('ok')
    expect(res.profile.crystalsSpent).toBe(gb1.price)
    expect(res.profile.crystals).toBe(800 - gb1.price) // баланс = earned - spent
    expect(res.profile.crystalsEarned).toBe(800)
  })

  it('идемпотентность: повтор с тем же redemptionId не списывает второй раз', async () => {
    await giveCrystals(db, 'p1', 800)
    await redeem(db, 'p1', 'gb1', 'r-dup')
    const again = await redeem(db, 'p1', 'gb1', 'r-dup')
    expect(again.status).toBe('ok')
    expect(again.profile.crystalsSpent).toBe(gb1.price) // не 1000
    expect(again.profile.crystals).toBe(800 - gb1.price)
  })

  it('не хватает кристаллов — отказ, ничего не списано', async () => {
    await giveCrystals(db, 'p1', 300) // < 500
    const res = await redeem(db, 'p1', 'gb1', 'r-2')
    expect(res.status).toBe('insufficient')
    expect(res.profile.crystalsSpent).toBe(0)
    expect(res.profile.crystals).toBe(300)
  })

  it('неизвестная награда — отказ', async () => {
    await giveCrystals(db, 'p1', 9999)
    const res = await redeem(db, 'p1', 'no-such-reward', 'r-3')
    expect(res.status).toBe('unknown_reward')
    expect(res.profile.crystalsSpent).toBe(0)
  })

  it('две разные покупки списывают суммарно', async () => {
    await giveCrystals(db, 'p1', 5000)
    await redeem(db, 'p1', 'gb1', 'r-a') // 500
    const res = await redeem(db, 'p1', 'mixx3', 'r-b') // 1500
    expect(res.status).toBe('ok')
    expect(res.profile.crystalsSpent).toBe(500 + 1500)
    expect(res.profile.crystals).toBe(5000 - 2000)
  })
})
