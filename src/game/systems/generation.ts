import { balance } from '../config/balance'
import type { PlatformType } from '../entities/platform'

export interface Placement {
  x: number
  y: number
  type: PlatformType
}

/** Опорная (landable) — на неё можно приземлиться. Фейк — не опора. */
export function isLandable(t: PlatformType): boolean {
  return t !== 'fake'
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

/** Кинематика прыжка: gravity (px/сек²) и стартовая |vy| (px/сек). Выводятся из balance. */
export function jumpKinematics(): { gravity: number; jumpVel: number; maxV: number; apexPx: number } {
  const gravity = (2 * balance.jump.heightPx) / (balance.jump.riseSec * balance.jump.riseSec)
  const jumpVel = (2 * balance.jump.heightPx) / balance.jump.riseSec
  return { gravity, jumpVel, maxV: balance.physics.maxHorizontalSpeed, apexPx: balance.jump.heightPx }
}

/**
 * Времена пересечения альтитуды `oy` при прыжке с опоры `sy` (sy > oy: цель выше).
 * Возвращает { tUp, tDn } — восхождение и нисхождение через oy; null если недостижимо.
 */
export function crossingTimes(sy: number, oy: number): { tUp: number; tDn: number } | null {
  const dh = sy - oy
  if (dh <= 0) return null
  const { gravity: g, jumpVel } = jumpKinematics()
  const disc = jumpVel * jumpVel - 2 * g * dh
  if (disc < 0) return null
  const sq = Math.sqrt(disc)
  return { tUp: (jumpVel - sq) / g, tDn: (jumpVel + sq) / g }
}

/** Полное время полёта до посадки на альтитуду topY (topY < sy). null — недостижимо. */
export function timeToLand(sy: number, topY: number): number | null {
  const dh = sy - topY
  if (dh < 0) return null
  const { gravity: g, jumpVel } = jumpKinematics()
  const disc = jumpVel * jumpVel - 2 * g * dh
  if (disc < 0) return null
  return (jumpVel + Math.sqrt(disc)) / g
}

/**
 * Пересечение двух интервалов [a1,b1] и [a2,b2] → [max(a1,a2), min(b1,b2)]. Пустое → null.
 */
function intersect(a1: number, b1: number, a2: number, b2: number): [number, number] | null {
  const lo = Math.max(a1, a2)
  const hi = Math.min(b1, b2)
  return hi >= lo ? [lo, hi] : null
}

/** Существует ли в интервале [lo,hi] точка вне «дыры» [holeLo, holeHi]. */
function intervalHasPointOutsideHole(
  lo: number,
  hi: number,
  holeLo: number,
  holeHi: number,
): boolean {
  return lo < holeLo || hi > holeHi
}

/**
 * Проходимость обстакла (ox, oy) на прыжке от опоры (sx, sy) к опоре (tx, ty).
 * Игрок пересекает альтитуду oy дважды (вверх и вниз). Мы проверяем, что при
 * какой-то стратегии vx(t) он может обойти облако сбоку И при этом приземлиться на tx.
 *
 * safetyR — радиус запрета (player.r + obstacle.r + запас).
 *
 * Модель: игрок в момент t может быть в любой точке [sx-maxV·t, sx+maxV·t] по X
 * (горизонталка задаётся напрямую, ax=0). На спуске к посадке — дополнительно
 * ограничение «дотянуться до tx к t_land»: |x - tx| ≤ maxV·(t_land - t).
 */
export function isPassableFromTo(
  ox: number,
  oy: number,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  safetyR: number,
  screenW: number,
): boolean {
  const times = crossingTimes(sy, oy)
  if (!times) return true // альтитуда oy не пересекается прыжком с sy — не помеха
  const tLand = timeToLand(sy, ty)
  if (tLand === null) return false // цель недостижима по высоте с этой опоры
  const { maxV } = jumpKinematics()

  // Восхождение: диапазон x при пересечении oy — вокруг sx.
  const upLo = sx - maxV * times.tUp
  const upHi = sx + maxV * times.tUp
  const holeLo = ox - safetyR
  const holeHi = ox + safetyR
  const wrapMargin = balance.physics.wrapHorizontal ? Math.max(0, maxV * times.tUp - screenW / 2) : 0
  // С учётом wrap: если tUp достаточно большой, чтобы обежать пол-экрана — все x доступны.
  const passUp = wrapMargin > 0 || intervalHasPointOutsideHole(upLo, upHi, holeLo, holeHi)
  if (!passUp) return false

  // Спуск: если игрок садится (ty) ВЫШЕ облака — до oy он не долетит, спуск не крутим.
  // (Т.е. посадка происходит раньше повторного пересечения альтитуды oy: tLand ≤ tDn.)
  if (tLand <= times.tDn) return true
  const dnFromLo = sx - maxV * times.tDn
  const dnFromHi = sx + maxV * times.tDn
  const dnRemain = tLand - times.tDn
  const dnToLo = tx - maxV * dnRemain
  const dnToHi = tx + maxV * dnRemain
  const dn = intersect(dnFromLo, dnFromHi, dnToLo, dnToHi)
  if (!dn) return false
  const passDn = intervalHasPointOutsideHole(dn[0], dn[1], holeLo, holeHi)
  return passDn
}

/**
 * Не пересекает ли облако визуально/физически бокс какой-либо платформы (ВСЕХ типов).
 * Даже фейк — облако на нём выглядит уродством и физически мешает игроку взлетать
 * (окружность-окружность контактирует прямо у поверхности). Возвращает true, если
 * облако свободно висит в воздухе — не касается ни одной платформы.
 */
export function obstacleClearOfPlatforms(
  ox: number,
  oy: number,
  platforms: readonly Placement[],
): boolean {
  const or = balance.obstacles.interference.radius
  const ph = balance.platforms.height
  const halfW = balance.platforms.widthBase / 2
  const margin = 8 // «воздушный» зазор — облако не должно облизывать край платформы
  for (const p of platforms) {
    // Горизонтальный overlap центра облака с боксом платформы + радиус
    const dx = Math.abs(ox - p.x)
    if (dx > halfW + or + margin) continue
    // Вертикальный overlap: платформа [p.y, p.y + ph], облако центр oy, радиус or
    // (p.y это ВЕРХНЯЯ грань платформы). Дистанция от центра облака до бокса:
    const topDy = p.y - oy // >0 если облако выше платформы
    const botDy = oy - (p.y + ph) // >0 если облако ниже платформы
    if (topDy > or + margin) continue // облако намного выше — не касается
    if (botDy > or + margin) continue // облако намного ниже — не касается
    return false
  }
  return true
}

/**
 * Обстакл проходим, если (а) не наложен на платформу, и (б) существует ХОТЯ БЫ ОДНА
 * пара (опора ниже → опора выше), для которой прыжок обходит облако. Опоры сгруппированы
 * по уровням: у каждого уровня 1+ опор (декой vols+fake — 1 опора; обычный — 1 опора).
 */
export function isObstaclePassable(
  ox: number,
  oy: number,
  landables: readonly Placement[],
  screenW: number,
  allPlatforms: readonly Placement[] = landables,
): boolean {
  if (!obstacleClearOfPlatforms(ox, oy, allPlatforms)) return false
  const safetyR = balance.player.radius + balance.obstacles.interference.radius + 10
  const apex = balance.jump.heightPx

  // Опоры ниже облака (sy > oy) в пределах прыжка (sy - oy ≤ apex)
  const below = landables.filter((p) => p.y > oy && p.y - oy <= apex)
  if (below.length === 0) return true // ещё нечем валидировать (в самом начале)

  // Ближайшая нижняя (обычно и единственная в этом коридоре) — от неё стартует прыжок.
  // Если их несколько на разных y, тестируем каждую: игроку достаточно ОДНОЙ рабочей.
  for (const s of below) {
    // Кандидаты «куда приземлиться»: опоры выше oy, достижимые с s (sy - ty ≤ apex, ty > apex внизу).
    const targets = landables.filter((t) => t.y < oy && s.y - t.y <= apex && s.y - t.y > 0)
    if (targets.length === 0) continue
    for (const t of targets) {
      if (isPassableFromTo(ox, oy, s.x, s.y, t.x, t.y, safetyR, screenW)) return true
    }
  }
  return false
}

/**
 * Чистый планировщик размещения платформ (без PixiJS) — ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ
 * генерации. Владеет `lastY`, счётчиком `sinceVols` и КРАТКОЙ ИСТОРИЕЙ placements
 * (для проверки проходимости обстаклов и раскладки кристаллов по дугам прыжка).
 *
 * Спавнер потребляет placements и рисует; валидатор проверяет проходимость ровно
 * на этих же решениях. RNG инъектируется → детерминированные тесты.
 */
export class PlatformPlanner {
  lastY = 0
  private sinceVols = 0
  /** История placements (последние ~N), y убывает вверх мира. Нужна для запросов проходимости. */
  readonly history: Placement[] = []
  private readonly maxHistory = 400

  constructor(private readonly rng: () => number = Math.random) {}

  reset(startY: number, startX?: number): void {
    this.lastY = startY
    this.sinceVols = 0
    this.history.length = 0
    // Стартовая ВОЛС спавнится в Spawner отдельно (screenW/2), но с точки зрения планировщика
    // это первая опора мира — регистрируем её в истории, чтобы валидатор проходимости
    // (обстаклы/кристаллы) с самого начала видел точку старта.
    if (startX !== undefined) this.history.push({ x: startX, y: startY, type: 'vols' })
  }

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
        const [realX, fakeX] = this.decoyPositions(screenW)
        out.push({ x: realX, y: this.lastY, type: 'vols' })
        out.push({ x: fakeX, y: this.lastY, type: 'fake' })
        this.sinceVols = 0
      } else {
        const x = halfW + this.rng() * (screenW - 2 * halfW)
        out.push({ x, y: this.lastY, type })
      }
    }
    // Пополняем историю и подрезаем.
    for (const p of out) this.history.push(p)
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory)
    }
    return out
  }

  /** Все опорные placements из истории (vols/rrl/moving). */
  landables(): Placement[] {
    return this.history.filter((p) => isLandable(p.type))
  }

  /** Опорные placements в вертикальной полосе (loY < p.y ≤ hiY). */
  landablesInY(loY: number, hiY: number): Placement[] {
    return this.history.filter((p) => isLandable(p.type) && p.y > loY && p.y <= hiY)
  }

  /** Пары соседних опор (по уникальному y снизу вверх): [низ, верх] — «прыжки». */
  jumpPairs(): Array<[Placement, Placement]> {
    const uniq = new Map<number, Placement>() // y → любой landable на этом уровне
    for (const p of this.history) if (isLandable(p.type) && !uniq.has(p.y)) uniq.set(p.y, p)
    const sorted = [...uniq.values()].sort((a, b) => b.y - a.y) // низ → верх (y убывает вверх)
    const out: Array<[Placement, Placement]> = []
    for (let i = 1; i < sorted.length; i++) out.push([sorted[i - 1], sorted[i]])
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
    if (this.sinceVols + 1 >= balance.spawn.guaranteedVolsEveryN) {
      this.sinceVols = 0
      return 'vols'
    }
    const { hazardStartMeters, hazardFullMeters } = balance.spawn
    const difficulty = Math.min(
      1,
      Math.max(0, (meters - hazardStartMeters) / (hazardFullMeters - hazardStartMeters)),
    )
    const w = balance.platforms.typeWeights
    const vols = w.vols
    const rrl = w.rrl * difficulty
    const moving = w.moving * difficulty
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
