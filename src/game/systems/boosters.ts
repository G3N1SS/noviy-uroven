import { Container } from 'pixi.js'
import { balance } from '../config/balance'
import { createBooster, drawBooster, type Booster, type BoosterType } from '../entities/booster'

/**
 * Спавн и сбор бустеров (конспект 2.8). Каждый тип — со своим кадансом (spawnEvery платформ).
 * Сбор пролётом. Иконки парят (bob) + слегка вращаются/пульсируют — анимация через view.
 *
 * Инкремент B: включены Гигабэк, MiXX-щит, Вечные минуты. SafeWall — C.
 */
const ENABLED: BoosterType[] = ['gigaback', 'mixxShield', 'eternal']

const SPAWN_EVERY: Record<BoosterType, number> = {
  gigaback: balance.boosters.gigaback.spawnEvery,
  mixxShield: balance.boosters.mixxShield.spawnEvery,
  eternal: balance.boosters.eternalMinutes.spawnEvery,
  safewall: balance.boosters.safeWall.spawnEvery,
}

export class BoosterManager {
  readonly boosters: Booster[] = []
  private pool: Booster[] = []
  private nextY: Record<string, number> = {}

  constructor(private readonly layer: Container) {}

  reset(startY: number): void {
    for (const b of this.boosters) this.recycle(b)
    this.boosters.length = 0
    const avgGap = (balance.platforms.gapMin + balance.platforms.gapMax) / 2
    for (const type of ENABLED) {
      this.nextY[type] = startY - SPAWN_EVERY[type] * avgGap
    }
  }

  update(cameraOffset: number, screenW: number, screenH: number, dtSec: number): void {
    const spawnUntilY = -cameraOffset - balance.spawn.spawnAheadScreens * screenH
    const avgGap = (balance.platforms.gapMin + balance.platforms.gapMax) / 2
    const margin = balance.boosters.radius + 16

    for (const type of ENABLED) {
      while (this.nextY[type] > spawnUntilY) {
        const x = margin + Math.random() * (screenW - 2 * margin)
        this.spawnAt(x, this.nextY[type], type)
        this.nextY[type] -= SPAWN_EVERY[type] * avgGap
      }
    }

    // анимация: парение (bob) + пульс. Гигабэк — перерисовка per-frame (пульс двух ромбов).
    for (const b of this.boosters) {
      if (!b.active) continue
      b.animT += dtSec
      b.view.y = b.y + Math.sin(b.animT * 2.2) * balance.boosters.floatAmp
      if (b.type === 'gigaback') {
        b.view.rotation = 0
        b.view.scale.set(1)
        drawBooster(b)
      } else {
        b.view.scale.set(1 + Math.sin(b.animT * 3) * 0.06)
      }
    }

    const cullY = screenH + balance.spawn.cullBelowScreens * screenH
    for (let i = this.boosters.length - 1; i >= 0; i--) {
      const b = this.boosters[i]
      if (!b.active || b.y + cameraOffset > cullY) {
        this.recycle(b)
        this.boosters.splice(i, 1)
      }
    }
  }

  /** Сбор пролётом. Возвращает типы собранных за кадр бустеров. */
  collect(px: number, py: number, pr: number): BoosterType[] {
    const got: BoosterType[] = []
    for (const b of this.boosters) {
      if (!b.active) continue
      const dx = px - b.x
      const dy = py - b.y
      const rr = pr + b.radius
      if (dx * dx + dy * dy <= rr * rr) {
        got.push(b.type)
        b.active = false
        b.view.visible = false
      }
    }
    return got
  }

  private spawnAt(x: number, y: number, type: BoosterType): Booster {
    const b = this.pool.pop() ?? createBooster()
    if (!b.view.parent) this.layer.addChild(b.view)
    b.x = x
    b.y = y
    b.type = type
    b.radius = balance.boosters.radius
    b.active = true
    b.animT = Math.random() * 6
    b.view.visible = true
    b.view.x = x
    b.view.y = y
    b.view.rotation = 0
    b.view.scale.set(1)
    drawBooster(b)
    this.boosters.push(b)
    return b
  }

  private recycle(b: Booster): void {
    b.active = false
    b.view.visible = false
    b.view.rotation = 0
    b.view.scale.set(1)
    this.pool.push(b)
  }
}
