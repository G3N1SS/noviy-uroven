import { describe, it, expect } from 'vitest'
import { validateRun } from './anticheat'

/**
 * Anti-cheat (Этап 6, Инкремент 4). Проверяем: честная игра проходит, грубая накрутка — нет,
 * старый клиент без журнала не наказывается.
 */
describe('validateRun', () => {
  const legit = { height: 900, crystals: 60, boostersUsed: [], durationMs: 40_000, jumps: 60 }

  it('честный забег валиден', () => {
    expect(validateRun(legit).valid).toBe(true)
  })

  it('height за 5с — невозможная скороподъёмность', () => {
    const v = validateRun({ ...legit, height: 100_000, durationMs: 5_000, jumps: 5_000 })
    expect(v.valid).toBe(false)
    expect(v.reasons).toContain('climb-rate')
  })

  it('height при мизере прыжков — превышен апекс на прыжок', () => {
    const v = validateRun({ height: 5_000, crystals: 0, boostersUsed: [], durationMs: 300_000, jumps: 3 })
    expect(v.valid).toBe(false)
    expect(v.reasons).toContain('per-jump')
  })

  it('кристаллов кратно больше высоты — аномалия', () => {
    const v = validateRun({ ...legit, crystals: 100_000 })
    expect(v.valid).toBe(false)
    expect(v.reasons).toContain('crystals')
  })

  it('партия длиннее 6ч — подделка часов', () => {
    const v = validateRun({ ...legit, durationMs: 7 * 60 * 60 * 1000, height: 10 })
    expect(v.valid).toBe(false)
    expect(v.reasons).toContain('duration')
  })

  it('старый клиент без durationMs/jumps — не наказываем', () => {
    const v = validateRun({ height: 3000, crystals: 200, boostersUsed: [] })
    expect(v.valid).toBe(true)
  })

  it('нулевая высота — тривиально валидна', () => {
    expect(validateRun({ height: 0, crystals: 0, boostersUsed: [], durationMs: 100, jumps: 0 }).valid).toBe(true)
  })
})
