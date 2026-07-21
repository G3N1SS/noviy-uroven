import { describe, it, expect } from 'vitest'
import { balance } from '../config/balance'
import {
  PlatformPlanner,
  makeRng,
  isObstaclePassable,
  isPassableFromTo,
  obstacleClearOfPlatforms,
  type Placement,
} from './generation'
import type { PlatformType } from '../entities/platform'

/**
 * Валидатор проходимости (Этап 2). Ключевой принцип конспекта: «смерть только по вине
 * игрока, никогда из-за генератора». Тест гоняет чистый планировщик на множестве сидов
 * и проверяет: (1) поток платформ честно проходим (нет разрывов больше прыжка); (2) при
 * генерации помех НЕТ ситуаций, когда облако перекрывает единственный маршрут к следующей
 * опоре — «unfair-death» невозможна и с помехами. Это автомат-версия ручного playtesting.
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
  planner.reset(0, SCREEN_W / 2) // регистрируем стартовую ВОЛС в истории планировщика
  const generated = planner.plan(-DEPTH_PX, SCREEN_W)
  const start: Placement = { x: SCREEN_W / 2, y: 0, type: 'vols' }
  return [start, ...generated]
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

describe('помехи — проходимость', () => {
  it('облако точно над единственной опорой между узкими уровнями = НЕ проходимо', () => {
    // Небольшой gap 120px, опоры прямо над/под облаком, обойти сбоку невозможно.
    const landables: Placement[] = [
      { x: 200, y: 0, type: 'vols' }, // низ
      { x: 200, y: -120, type: 'vols' }, // верх — прямо над облаком
    ]
    // Облако ровно между ними по X и в середине по Y
    expect(isObstaclePassable(200, -60, landables, SCREEN_W)).toBe(false)
  })

  it('облако сбоку от единственной опоры при большом gap = проходимо (есть коридор обхода)', () => {
    const landables: Placement[] = [
      { x: 200, y: 0, type: 'vols' },
      { x: 200, y: -150, type: 'vols' },
    ]
    // Облако далеко в сторону — обойти легко.
    expect(isObstaclePassable(60, -75, landables, SCREEN_W)).toBe(true)
  })

  it('isPassableFromTo: пустая точка сбоку — тривиально проходимо', () => {
    const safetyR = balance.player.radius + balance.obstacles.interference.radius + 10
    // Прыжок с (200, 0) на (220, -150), облако далеко влево
    expect(isPassableFromTo(20, -75, 200, 0, 220, -150, safetyR, SCREEN_W)).toBe(true)
  })

  it('облако, наложенное на платформу = НЕ проходимо (визуальный/физический overlap)', () => {
    const platforms: Placement[] = [
      { x: 300, y: 0, type: 'vols' },
      { x: 300, y: -140, type: 'vols' },
    ]
    // Облако прямо на верхней грани нижней платформы (y=0)
    expect(obstacleClearOfPlatforms(310, -10, platforms)).toBe(false)
    expect(isObstaclePassable(310, -10, platforms, SCREEN_W, platforms)).toBe(false)
    // Облако далеко в стороне на той же высоте — не пересекает
    expect(obstacleClearOfPlatforms(80, -10, platforms)).toBe(true)
  })

  it('живой планировщик: все спавн-помехи проходимы через isObstaclePassable', () => {
    // Прогоняем реальную траекторию спавна помех (каждые spawnEveryPx выше startMeters),
    // но X выбираем алгоритмом ObstacleManager: до K случайных попыток. Если ни одна не проходит,
    // помеха НЕ должна попасть в мир — этот тест гарантирует, что «всегда есть кандидат» либо
    // облако честно пропускается. Проверяем, что для каждого y планировщик находит либо
    // проходимую позицию, либо пропускает; а если находит — проверяем повторно.
    const { spawnEveryPx, startMeters } = balance.obstacles.interference
    for (const seed of SEEDS.slice(0, 20)) {
      const planner = new PlatformPlanner(makeRng(seed))
      planner.reset(0, SCREEN_W / 2)
      planner.plan(-DEPTH_PX, SCREEN_W)
      const rng = makeRng(seed ^ 0x1234)
      const yStart = -startMeters * balance.score.pxPerMeter
      for (let y = yStart; y > -DEPTH_PX; y -= spawnEveryPx) {
        // Симулируем алгоритм ObstacleManager.trySpawnPassable
        const margin = balance.obstacles.interference.radius + 10
        let placed: number | null = null
        for (let i = 0; i < 12; i++) {
          const x = margin + rng() * (SCREEN_W - 2 * margin)
          if (isObstaclePassable(x, y, planner.landables(), SCREEN_W, planner.history)) {
            placed = x
            break
          }
        }
        if (placed !== null) {
          // Повторная проверка: то, что попало в мир, действительно проходимо И
          // не пересекает ни одну платформу.
          expect(
            isObstaclePassable(placed, y, planner.landables(), SCREEN_W, planner.history),
            `seed ${seed}, y=${y}: помеха в мире, но валидатор не пропускает`,
          ).toBe(true)
          expect(
            obstacleClearOfPlatforms(placed, y, planner.history),
            `seed ${seed}, y=${y}: помеха накрывает платформу`,
          ).toBe(true)
        }
        // placed === null означает «пропустили» — нормально; лучше без облака, чем ловушка.
      }
    }
  })
})
