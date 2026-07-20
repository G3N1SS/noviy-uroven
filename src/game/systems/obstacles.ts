import { Container } from 'pixi.js'
import { balance } from '../config/balance'
import { createObstacle, drawObstacle, type Obstacle } from '../entities/obstacle'

/**
 * Помехи (конспект 2.9). Спавнятся в воздухе выше `startMeters` (эпоха 2) с шагом
 * `spawnEveryPx`, случайный X. Object pooling + чистка вниз. Сбор столкновением
 * (окружность-окружность); попадание одноразовое (облако «разряжается»).
 */
export class ObstacleManager {
  readonly obstacles: Obstacle[] = []
  private pool: Obstacle[] = []
  private nextY = 0

  constructor(private readonly layer: Container) {}

  reset(startY: number): void {
    for (const o of this.obstacles) this.recycle(o)
    this.obstacles.length = 0
    this.nextY = startY - balance.obstacles.interference.spawnEveryPx
  }

  update(cameraOffset: number, screenW: number, screenH: number, dtSec: number): void {
    // per-frame анимация глитча
    for (const o of this.obstacles) {
      if (!o.active) continue
      o.animT += dtSec
      drawObstacle(o)
    }

    const spawnUntilY = -cameraOffset - balance.spawn.spawnAheadScreens * screenH
    const { spawnEveryPx, startMeters, radius } = balance.obstacles.interference

    while (this.nextY > spawnUntilY) {
      const meters = -this.nextY / balance.score.pxPerMeter
      if (meters >= startMeters) {
        const margin = radius + 10
        const x = margin + Math.random() * (screenW - 2 * margin)
        this.spawnAt(x, this.nextY)
      }
      this.nextY -= spawnEveryPx
    }

    const cullY = screenH + balance.spawn.cullBelowScreens * screenH
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i]
      if (!o.active || o.y + cameraOffset > cullY) {
        this.recycle(o)
        this.obstacles.splice(i, 1)
      }
    }
  }

  /** Столкновение с игроком. Возвращает true, если попал (облако при этом «разряжается»). */
  hit(px: number, py: number, pr: number): boolean {
    for (const o of this.obstacles) {
      if (!o.active) continue
      const dx = px - o.x
      const dy = py - o.y
      const rr = pr + o.radius
      if (dx * dx + dy * dy <= rr * rr) {
        o.active = false
        o.view.visible = false
        return true
      }
    }
    return false
  }

  private spawnAt(x: number, y: number): Obstacle {
    const o = this.pool.pop() ?? createObstacle()
    if (!o.view.parent) this.layer.addChild(o.view)
    o.x = x
    o.y = y
    o.radius = balance.obstacles.interference.radius
    o.active = true
    o.animT = Math.random() * balance.obstacles.interference.glitchCycleSec // десинхрон
    o.view.visible = true
    o.view.x = x
    o.view.y = y
    drawObstacle(o)
    this.obstacles.push(o)
    return o
  }

  private recycle(o: Obstacle): void {
    o.active = false
    o.view.visible = false
    this.pool.push(o)
  }
}
