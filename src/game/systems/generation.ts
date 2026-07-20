import { balance } from '../config/balance'
import type { PlatformType } from '../entities/platform'

export interface Placement {
  x: number
  y: number
  type: PlatformType
}

/**
 * Детерминированный RNG (mulberry32) — для тестов проходимости (валидатор гоняет
 * фиксированные сиды). В живой игре планировщик берёт Math.random по умолчанию.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Чистый планировщик размещения платформ (без PixiJS) — ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ
 * генерации. Владеет `lastY` и счётчиком `sinceVols`. Спавнер (systems/spawner.ts)
 * потребляет placements и рисует; валидатор (generation.test.ts) проверяет
 * проходимость ровно на этих же решениях. RNG инъектируется → детерминированные тесты.
 *
 * Правила (перенесены из спавнера дословно):
 *  - зазор gapMin..gapMax между уровнями;
 *  - тип по весам с ramp сложности по высоте + гарантированная ВОЛС каждые N;
 *  - фейк спавнится ДЕКОЙ-парой с настоящей ВОЛС на том же уровне (честность).
 */
export class PlatformPlanner {
  /** y самой верхней (последней запланированной) платформы. */
  lastY = 0
  private sinceVols = 0

  constructor(private readonly rng: () => number = Math.random) {}

  reset(startY: number): void {
    this.lastY = startY
    this.sinceVols = 0
  }

  /** Запланировать все уровни выше lastY вплоть до untilY (в мире «выше» = меньше y). */
  plan(untilY: number, screenW: number): Placement[] {
    const out: Placement[] = []
    const { gapMin, gapMax, widthBase } = balance.platforms
    const halfW = widthBase / 2
    while (this.lastY > untilY) {
      const gap = gapMin + this.rng() * (gapMax - gapMin)
      this.lastY -= gap
      const meters = -this.lastY / balance.score.pxPerMeter
      const type = this.pickType(meters)
      if (type === 'fake') {
        // Фейк — ДЕКОЙ рядом с настоящей ВОЛС на том же уровне: реальная опора есть всегда,
        // фейк не создаёт недостижимых разрывов (честность), но ловушка живёт.
        const [realX, fakeX] = this.decoyPositions(screenW)
        out.push({ x: realX, y: this.lastY, type: 'vols' })
        out.push({ x: fakeX, y: this.lastY, type: 'fake' })
        this.sinceVols = 0
      } else {
        const x = halfW + this.rng() * (screenW - 2 * halfW)
        out.push({ x, y: this.lastY, type })
      }
    }
    return out
  }

  /** Позиции пары «настоящая / фейк» в разных половинах экрана. Возвращает [realX, fakeX]. */
  private decoyPositions(screenW: number): [number, number] {
    const halfW = balance.platforms.widthBase / 2
    const leftX = halfW + this.rng() * (screenW * 0.32 - halfW)
    const rightX = screenW * 0.68 + this.rng() * (screenW - halfW - screenW * 0.68)
    return this.rng() < 0.5 ? [leftX, rightX] : [rightX, leftX]
  }

  private pickType(meters: number): PlatformType {
    // Гарантия: не более (N-1) не-ВОЛС подряд (страховка от нечестной смерти).
    if (this.sinceVols + 1 >= balance.spawn.guaranteedVolsEveryN) {
      this.sinceVols = 0
      return 'vols'
    }
    // Сложность 0..1 по высоте: внизу только ВОЛС, к hazardFullMeters — полные веса.
    const { hazardStartMeters, hazardFullMeters } = balance.spawn
    const difficulty = Math.min(
      1,
      Math.max(0, (meters - hazardStartMeters) / (hazardFullMeters - hazardStartMeters)),
    )
    const w = balance.platforms.typeWeights
    const vols = w.vols
    const rrl = w.rrl * difficulty
    const moving = w.moving * difficulty
    // фейк — только с эпохи 3 (по высоте)
    const fake = meters >= balance.obstacles.fake.startMeters ? w.fake * difficulty : 0
    const total = vols + rrl + moving + fake
    let roll = this.rng() * total
    let type: PlatformType
    if ((roll -= vols) < 0) type = 'vols'
    else if ((roll -= rrl) < 0) type = 'rrl'
    else if ((roll -= moving) < 0) type = 'moving'
    else type = 'fake'

    if (type === 'vols') this.sinceVols = 0
    else this.sinceVols++
    return type
  }
}
