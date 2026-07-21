import { Container } from 'pixi.js'
import { balance } from '../config/balance'
import { createCrystal, drawCrystal, type Crystal } from '../entities/crystal'
import { isLandable, jumpKinematics, timeToLand, type PlatformPlanner, type Placement } from './generation'

/**
 * Спавн и сбор кристаллов (конспект 2.10). Кладём цепочки ВДОЛЬ ДУГ ПРЫЖКА между
 * соседними опорами (у любой цепочки есть допустимый vx, при котором игрок проходит
 * сквозь все точки — по факту вычисляем этот vx через кинематику). Крупные — тоже на
 * дуге, но у пика (сложнее достать: нужно вложиться в правильную боковую скорость).
 *
 * Object pooling. Собираются пролётом (окружность-окружность).
 */
export class CrystalManager {
  readonly crystals: Crystal[] = []
  private pool: Crystal[] = []
  /** Индекс «прыжка» (пары соседних опор), обработанного последним. */
  private pairIdx = 0
  /** y самой верхней (последней увиденной) опоры — курсор истории планировщика. */
  private lastTopY: number | null = null

  constructor(
    private readonly layer: Container,
    private readonly planner: PlatformPlanner,
  ) {}

  reset(_startY: number): void {
    for (const c of this.crystals) this.recycle(c)
    this.crystals.length = 0
    this.pairIdx = 0
    this.lastTopY = null
  }

  update(cameraOffset: number, screenW: number, screenH: number): void {
    // Разбираем НОВЫЕ пары опор (по одной уникальной опоре на уровень) и решаем, класть ли
    // на этот прыжок цепочку / крупный. Пары идут снизу вверх (y уменьшается).
    const uniq = new Map<number, Placement>()
    for (const p of this.planner.history) if (isLandable(p.type) && !uniq.has(p.y)) uniq.set(p.y, p)
    const sorted = [...uniq.values()].sort((a, b) => b.y - a.y) // низ → верх

    for (const top of sorted) {
      if (this.lastTopY === null) {
        this.lastTopY = top.y
        continue
      }
      if (top.y >= this.lastTopY) continue // не новое (в пределах истории или дубль)
      const from = uniq.get(this.lastTopY)
      if (from) {
        this.pairIdx++
        this.considerPair(from, top, screenW)
      }
      this.lastTopY = top.y
    }

    // Чистка ушедших вниз
    const cullY = screenH + balance.spawn.cullBelowScreens * screenH
    for (let i = this.crystals.length - 1; i >= 0; i--) {
      const c = this.crystals[i]
      if (!c.active || c.y + cameraOffset > cullY) {
        this.recycle(c)
        this.crystals.splice(i, 1)
      }
    }
  }

  /** Пара «нижняя → верхняя» опора — раскладываем цепочку / крупный, если пришёл черёд. */
  private considerPair(from: Placement, to: Placement, screenW: number): void {
    const { small, large } = balance.crystals
    if (this.pairIdx % small.everyPlatforms === 0) this.spawnChainOnArc(from, to, screenW)
    if (this.pairIdx % large.everyPlatforms === 0) this.spawnLargeAtApex(from, to, screenW)
  }

  /**
   * Цепочка вдоль дуги прыжка A→B. Ищем прямую линейную траекторию с постоянным vx.
   * Если |vx| > maxV — пара недостижима прямым прыжком (нужен wrap): в таком случае
   * НЕ спавним ничего. Лучше пропустить цепочку, чем повесить в воздухе несобираемый
   * столбик, оторванный от опор.
   */
  private spawnChainOnArc(from: Placement, to: Placement, screenW: number): void {
    const arc = solveArc(from, to)
    if (!arc) return
    const { chainMin, chainMax, value } = balance.crystals.small
    const n = chainMin + Math.floor(Math.random() * (chainMax - chainMin + 1))
    const { gravity: g, jumpVel } = jumpKinematics()
    const r = balance.crystals.smallRadius
    for (let i = 0; i < n; i++) {
      // t в [0.18, 0.82] — не жмёмся к самим платформам (иначе кристалл будет «в» опоре).
      const t = arc.tLand * (0.18 + (0.64 * i) / Math.max(1, n - 1))
      const x = from.x + arc.vx * t
      const y = from.y - jumpVel * t + 0.5 * g * t * t
      // Кристалл может уйти за край при широком arc + большом t; клампим в поле.
      const xc = Math.max(r + 2, Math.min(screenW - r - 2, x))
      this.spawnOne(xc, y, value, r, false)
    }
  }

  /**
   * Крупный — у пика прыжка A→B (t = riseSec). Кладём с боковым крюком в сторону цели,
   * чтобы «труднодоступно, но обязательно достижимо». Если прямая арка не достижима
   * (|vx| > maxV) — пропускаем: крупный без пары A→B висел бы в воздухе.
   */
  private spawnLargeAtApex(from: Placement, to: Placement, screenW: number): void {
    const arc = solveArc(from, to)
    if (!arc) return
    const { gravity: g, jumpVel, maxV } = jumpKinematics()
    const tApex = jumpVel / g
    const yApex = from.y - jumpVel * tApex + 0.5 * g * tApex * tApex // = from.y - heightPx
    const dir = to.x >= from.x ? 1 : -1
    const detourFrac = 0.55
    const detourVx = dir * Math.min(maxV, Math.abs(arc.vx) + (maxV - Math.abs(arc.vx)) * detourFrac)
    const rawX = from.x + detourVx * tApex
    // Клампим в поле (маржа = радиус). Если крюк упирается в стену — крупный сядет у края.
    const r = balance.crystals.largeRadius
    const x = Math.max(r + 4, Math.min(screenW - r - 4, rawX))
    this.spawnOne(x, yApex, balance.crystals.large.value, r, true)
  }

  /** Сбор пролётом. Возвращает сумму собранного за кадр. */
  collect(px: number, py: number, pr: number): number {
    let got = 0
    for (const c of this.crystals) {
      if (!c.active) continue
      const dx = px - c.x
      const dy = py - c.y
      const rr = pr + c.radius
      if (dx * dx + dy * dy <= rr * rr) {
        got += c.value
        c.active = false
        c.view.visible = false
      }
    }
    return got
  }

  private spawnOne(x: number, y: number, value: number, radius: number, large: boolean): Crystal {
    const c = this.pool.pop() ?? createCrystal()
    if (!c.view.parent) this.layer.addChild(c.view)
    c.x = x
    c.y = y
    c.value = value
    c.radius = radius
    c.active = true
    c.view.visible = true
    c.view.x = x
    c.view.y = y
    drawCrystal(c, large)
    this.crystals.push(c)
    return c
  }

  private recycle(c: Crystal): void {
    c.active = false
    c.view.visible = false
    this.pool.push(c)
  }
}

/**
 * Ищет постоянную горизонтальную скорость vx, которая ведёт из опоры A в опору B за
 * время полёта до посадки. Если |vx| ≤ maxV — прыжок физически проходит через
 * ЛЮБУЮ точку этой параболы, и кристаллы, положенные на неё, гарантированно собираемы.
 * null — если прямая траектория недостижима (нужен wrap/маневр — тогда fallback).
 */
function solveArc(from: Placement, to: Placement): { vx: number; tLand: number } | null {
  const tLand = timeToLand(from.y, to.y)
  if (tLand === null || tLand <= 0) return null
  const vx = (to.x - from.x) / tLand
  const { maxV } = jumpKinematics()
  if (Math.abs(vx) > maxV) return null
  return { vx, tLand }
}
