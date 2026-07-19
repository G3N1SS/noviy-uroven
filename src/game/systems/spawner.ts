import { Container } from 'pixi.js'
import { balance } from '../config/balance'
import { createPlatform, drawPlatform, type Platform } from '../entities/platform'

/**
 * Генерация платформ Этапа 1: простая (случайный X, зазор 60–140px по вертикали).
 * Спавн — на 2 экрана выше камеры, чистка — на экран ниже. Object pooling.
 * Паттерны + гарантированная ВОЛС + валидатор проходимости — Этап 2.
 */
export class Spawner {
  readonly platforms: Platform[] = []
  private pool: Platform[] = []
  /** y самой верхней (последней сгенерированной) платформы. */
  private lastY = 0

  constructor(private readonly world: Container) {}

  /** Сброс партии: убрать все платформы, поставить стартовую под игроком. */
  reset(startPlatformY: number, screenW: number): void {
    for (const p of this.platforms) this.recycle(p)
    this.platforms.length = 0
    this.lastY = startPlatformY
    this.spawnAt(screenW / 2, startPlatformY)
  }

  update(cameraOffset: number, screenW: number, screenH: number): void {
    const topVisibleWorldY = -cameraOffset
    const spawnUntilY = topVisibleWorldY - balance.spawn.spawnAheadScreens * screenH
    const { gapMin, gapMax, widthBase } = balance.platforms
    const halfW = widthBase / 2

    // Генерируем вверх, пока не заполнили запас над экраном
    while (this.lastY > spawnUntilY) {
      const gap = gapMin + Math.random() * (gapMax - gapMin)
      this.lastY -= gap
      const x = halfW + Math.random() * (screenW - 2 * halfW)
      this.spawnAt(x, this.lastY)
    }

    // Чистим то, что ушло ниже экрана
    const cullY = screenH + balance.spawn.cullBelowScreens * screenH
    for (let i = this.platforms.length - 1; i >= 0; i--) {
      const p = this.platforms[i]
      if (p.y + cameraOffset > cullY) {
        this.recycle(p)
        this.platforms.splice(i, 1)
      }
    }
  }

  private spawnAt(x: number, y: number): Platform {
    const p = this.pool.pop() ?? createPlatform()
    if (!p.view.parent) this.world.addChild(p.view)
    p.x = x
    p.y = y
    p.width = balance.platforms.widthBase
    p.active = true
    p.view.visible = true
    p.view.x = x
    p.view.y = y
    drawPlatform(p)
    this.platforms.push(p)
    return p
  }

  private recycle(p: Platform): void {
    p.active = false
    p.view.visible = false
    this.pool.push(p)
  }
}
