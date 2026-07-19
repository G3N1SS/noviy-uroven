import { Container } from 'pixi.js'
import { balance } from '../config/balance'
import { createCrystal, drawCrystal, type Crystal } from '../entities/crystal'

/**
 * Спавн и сбор кристаллов (конспект 2.10). Обычные — цепочками (3–5) примерно каждые
 * `small.everyPlatforms` платформ по высоте; крупные — редко (`large.everyPlatforms`).
 * Собираются при пролёте сквозь иконку (окружность-окружность). Object pooling.
 *
 * Пока размещение по X случайное; «умная» раскладка вдоль дуг прыжка — рефайн позже.
 */
export class CrystalManager {
  readonly crystals: Crystal[] = []
  private pool: Crystal[] = []
  private nextSmallY = 0
  private nextLargeY = 0
  private chainEveryPx = 0
  private largeEveryPx = 0

  constructor(private readonly layer: Container) {}

  reset(startY: number): void {
    for (const c of this.crystals) this.recycle(c)
    this.crystals.length = 0
    const avgGap = (balance.platforms.gapMin + balance.platforms.gapMax) / 2
    this.chainEveryPx = balance.crystals.small.everyPlatforms * avgGap
    this.largeEveryPx = balance.crystals.large.everyPlatforms * avgGap
    this.nextSmallY = startY - this.chainEveryPx
    this.nextLargeY = startY - this.largeEveryPx
  }

  update(cameraOffset: number, screenW: number, screenH: number): void {
    const spawnUntilY = -cameraOffset - balance.spawn.spawnAheadScreens * screenH

    while (this.nextSmallY > spawnUntilY) {
      this.spawnChain(this.nextSmallY, screenW)
      this.nextSmallY -= this.chainEveryPx
    }
    while (this.nextLargeY > spawnUntilY) {
      this.spawnOne(
        this.edgeX(screenW),
        this.nextLargeY,
        balance.crystals.large.value,
        balance.crystals.largeRadius,
        true,
      )
      this.nextLargeY -= this.largeEveryPx
    }

    // чистка ушедших вниз
    const cullY = screenH + balance.spawn.cullBelowScreens * screenH
    for (let i = this.crystals.length - 1; i >= 0; i--) {
      const c = this.crystals[i]
      if (!c.active || c.y + cameraOffset > cullY) {
        this.recycle(c)
        this.crystals.splice(i, 1)
      }
    }
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

  private spawnChain(y: number, screenW: number): void {
    const { chainMin, chainMax, value } = balance.crystals.small
    const n = chainMin + Math.floor(Math.random() * (chainMax - chainMin + 1))
    const margin = 30
    const x = margin + Math.random() * (screenW - 2 * margin)
    for (let i = 0; i < n; i++) {
      this.spawnOne(x, y - i * balance.crystals.chainGapPx, value, balance.crystals.smallRadius, false)
    }
  }

  private edgeX(screenW: number): number {
    // крупные — ближе к краю (труднодоступнее)
    const margin = 24
    return Math.random() < 0.5 ? margin : screenW - margin
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
