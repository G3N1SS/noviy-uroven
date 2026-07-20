import { describe, it, expect } from 'vitest'
import { balance } from '../config/balance'
import { PlatformPlanner, makeRng, type Placement } from './generation'
import type { PlatformType } from '../entities/platform'

/**
 * Валидатор проходимости (Этап 2). Ключевой принцип конспекта: «смерть только по вине
 * игрока, никогда из-за генератора». Тест гоняет чистый планировщик на множестве сидов
 * и проверяет, что сгенерированный поток платформ ВСЕГДА честно проходим — нет разрывов
 * между опорами больше высоты прыжка. Это автомат-версия ручного «perfect-x автопилота»;
 * поймал бы регресс вроде «фейк без декой-пары» (недостижимый двойной зазор).
 */

// Опорные платформы (с которых можно прыгать). Фейк — НЕ опора (проваливаешься).
// РРЛ разрушается ПОСЛЕ касания, но одного прыжка хватает → опора. Движущаяся — опора.
const LANDABLE = new Set<PlatformType>(['vols', 'rrl', 'moving'])

// Макс достижимый вертикальный зазор = высота прыжка (физический потолок). Горизонталь
// не ограничивает: wrap + полная дуга прыжка позволяют довести x до любой позиции.
const MAX_REACH_V = balance.jump.heightPx

const SCREEN_W = 400
const DEPTH_PX = 30000 // ~3000 м — прогоняет весь ramp сложности + гейт фейков (эпоха 3)

function planRange(seed: number): Placement[] {
  const planner = new PlatformPlanner(makeRng(seed))
  planner.reset(0)
  // Спавнер ставит стартовую ВОЛС отдельно — добавляем её вручную для полноты картины.
  const start: Placement = { x: SCREEN_W / 2, y: 0, type: 'vols' }
  return [start, ...planner.plan(-DEPTH_PX, SCREEN_W)]
}

/** Уникальные y с ≥1 опорной платформой, отсортированы снизу вверх (y убывает). */
function landableLevels(pls: Placement[]): number[] {
  const ys = new Set<number>()
  for (const p of pls) if (LANDABLE.has(p.type)) ys.add(p.y)
  return [...ys].sort((a, b) => b - a)
}

/** Максимальный вертикальный разрыв между соседними опорными уровнями. */
function maxLandableGap(pls: Placement[]): number {
  const lv = landableLevels(pls)
  let max = 0
  for (let i = 1; i < lv.length; i++) max = Math.max(max, lv[i - 1] - lv[i])
  return max
}

const SEEDS = Array.from({ length: 50 }, (_, i) => i * 1013 + 7)

describe('генерация — валидатор проходимости', () => {
  it('на каждом уровне есть опора (фейк никогда не спавнится один)', () => {
    for (const seed of SEEDS) {
      const pls = planRange(seed)
      const byY = new Map<number, PlatformType[]>()
      for (const p of pls) {
        const arr = byY.get(p.y) ?? []
        arr.push(p.type)
        byY.set(p.y, arr)
      }
      for (const [y, types] of byY) {
        const hasLandable = types.some((t) => LANDABLE.has(t))
        expect(hasLandable, `seed ${seed}, y=${y}: уровень без опоры (${types.join(',')})`).toBe(
          true,
        )
      }
    }
  })

  it('нет недостижимых разрывов: макс зазор между опорами ≤ высоты прыжка', () => {
    let worst = 0
    for (const seed of SEEDS) {
      const gap = maxLandableGap(planRange(seed))
      worst = Math.max(worst, gap)
      expect(gap, `seed ${seed}: разрыв ${gap.toFixed(0)}px > прыжок ${MAX_REACH_V}px`).toBeLessThanOrEqual(
        MAX_REACH_V,
      )
    }
    // Информативно: реальный максимум должен быть близок к gapMax, далеко от потолка.
    expect(worst).toBeLessThanOrEqual(balance.platforms.gapMax + 1)
  })

  it('гарантия ВОЛС: разрыв между соседними ВОЛС-уровнями ограничен', () => {
    const limit = balance.spawn.guaranteedVolsEveryN * balance.platforms.gapMax + 1
    for (const seed of SEEDS) {
      const volsY = [...new Set(planRange(seed).filter((p) => p.type === 'vols').map((p) => p.y))].sort(
        (a, b) => b - a,
      )
      for (let i = 1; i < volsY.length; i++) {
        const gap = volsY[i - 1] - volsY[i]
        expect(gap, `seed ${seed}: ${gap.toFixed(0)}px между ВОЛС > лимита ${limit}`).toBeLessThanOrEqual(
          limit,
        )
      }
    }
  })

  it('симуляция подъёма: жадный климб достигает вершины без тупиков', () => {
    for (const seed of SEEDS) {
      const pls = planRange(seed)
      const lv = landableLevels(pls)
      let y = 0 // старт
      let idx = 0
      while (idx < lv.length) {
        // следующий опорный уровень выше текущего
        while (idx < lv.length && lv[idx] >= y) idx++
        if (idx >= lv.length) break
        const next = lv[idx]
        expect(y - next, `seed ${seed}: тупик на y=${y}`).toBeLessThanOrEqual(MAX_REACH_V)
        y = next
      }
      // добрались почти до самого верха запланированного
      const top = Math.min(...lv)
      expect(y - top).toBeLessThanOrEqual(MAX_REACH_V)
    }
  })
})

describe('генерация — валидатор не вакуумный (ловит нечестность)', () => {
  it('детектит недостижимый разрыв (фейк без декой-пары)', () => {
    const bad: Placement[] = [
      { x: 200, y: 0, type: 'vols' },
      { x: 200, y: -300, type: 'fake' }, // фейк один — не опора
      { x: 200, y: -600, type: 'vols' }, // 600px между настоящими опорами
    ]
    expect(maxLandableGap(bad)).toBeGreaterThan(MAX_REACH_V)
  })
})
