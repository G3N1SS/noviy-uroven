import { Container } from 'pixi.js'
import { balance } from '../config/balance'
import { PlatformPlanner } from './generation'
import {
  createPlatform,
  drawPlatform,
  drawFakeHologram,
  drawRrlShatter,
  drawMovingChevrons,
  bounceOffset,
  type Platform,
  type PlatformType,
} from '../entities/platform'

/**
 * Генерация платформ (Этап 2, инкремент 1): 4 типа с весами + гарантированная ВОЛС
 * каждые N платформ (страховка от нечестной смерти). Спавн на 2 экрана выше камеры,
 * чистка — на экран ниже. Object pooling. Per-step динамика: движущиеся ездят,
 * РРЛ разрушается по таймеру, разовая исчезает после касания.
 *
 * Паттерны (5 базовых) + валидатор проходимости в Vitest + эпохальные веса — след. инкременты.
 */
export class Spawner {
  readonly platforms: Platform[] = []
  private pool: Platform[] = []
  /** Чистый планировщик решений (что/где спавнить). Спавнер только рисует и анимирует. */
  private readonly planner = new PlatformPlanner()

  constructor(private readonly world: Container) {}

  reset(startPlatformY: number, screenW: number): void {
    for (const p of this.platforms) this.recycle(p)
    this.platforms.length = 0
    this.planner.reset(startPlatformY)
    this.spawnAt(screenW / 2, startPlatformY, 'vols') // старт всегда ВОЛС
  }

  update(
    cameraOffset: number,
    screenW: number,
    screenH: number,
    dtSec: number,
    revealFakes = false,
  ): void {
    // 1) Per-step динамика типов
    for (const p of this.platforms) {
      if (!p.active) continue
      if (p.type === 'moving') {
        p.x += p.vx * dtSec
        const half = p.width / 2
        if (p.x < half) {
          p.x = half
          p.vx = Math.abs(p.vx)
        } else if (p.x > screenW - half) {
          p.x = screenW - half
          p.vx = -Math.abs(p.vx)
        }
        p.view.x = p.x
        // плавный разворот: dirVisual едет к знаку vx за chevronFlipSec (стрелки складываются)
        const m = balance.platforms.types.moving
        const targetDir = p.vx >= 0 ? 1 : -1
        p.dirVisual += (targetDir - p.dirVisual) * Math.min(1, dtSec / m.chevronFlipSec)
        // марш ∝ дистанции, но через dirVisual → на развороте замедляется до нуля и реверсится
        p.animT += Math.abs(p.vx) * dtSec * m.chevronSpeedFactor * p.dirVisual
        drawMovingChevrons(p)
      } else if (p.type === 'rrl') {
        if (p.collapseTimer >= 0) {
          // разрушение: осколки разлетаются за collapseMs
          p.collapseTimer -= dtSec
          const total = balance.platforms.types.rrl.collapseMs / 1000
          const progress = Math.min(1, 1 - p.collapseTimer / total)
          p.view.x = p.x
          p.view.y = p.y
          p.view.alpha = 1
          drawRrlShatter(p, progress)
          if (p.collapseTimer <= 0) {
            p.active = false
            p.view.visible = false
          }
        } else {
          // idle: тонкая дрожь (косметика, коллизия по p.x) + лёгкое мерцание
          p.animT += dtSec
          const amp = balance.platforms.types.rrl.trembleAmp
          p.view.x = p.x + Math.sin(p.animT * 47) * amp + Math.sin(p.animT * 31) * amp * 0.4
          p.view.y = p.y + Math.cos(p.animT * 53) * amp * 0.6
          p.view.alpha = 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(p.animT * 9))
        }
      } else if (p.type === 'fake') {
        // голограмма: переливание цельная ↔ двоящийся контур (+ подсветка при SafeWall)
        p.animT += dtSec
        drawFakeHologram(p, revealFakes)
      }

      // Landing-bounce (ВОЛС/движущаяся): проседание view.y при касании, коллизия не трогается
      if (p.bounceT >= 0) {
        p.bounceT += dtSec
        if (p.bounceT >= balance.platforms.bounce.durationSec) {
          p.bounceT = -1
          p.view.y = p.y
        } else {
          p.view.y = p.y + bounceOffset(p.bounceT)
        }
      }
    }

    // 2) Генерация вверх — решения принимает планировщик, спавнер их отрисовывает
    const topVisibleWorldY = -cameraOffset
    const spawnUntilY = topVisibleWorldY - balance.spawn.spawnAheadScreens * screenH
    for (const pl of this.planner.plan(spawnUntilY, screenW)) {
      this.spawnAt(pl.x, pl.y, pl.type)
    }

    // 3) Чистка: неактивные (разрушенные/использованные) и ушедшие ниже экрана
    const cullY = screenH + balance.spawn.cullBelowScreens * screenH
    for (let i = this.platforms.length - 1; i >= 0; i--) {
      const p = this.platforms[i]
      if (!p.active || p.y + cameraOffset > cullY) {
        this.recycle(p)
        this.platforms.splice(i, 1)
      }
    }
  }

  private spawnAt(x: number, y: number, type: PlatformType): Platform {
    const p = this.pool.pop() ?? createPlatform()
    if (!p.view.parent) this.world.addChild(p.view)
    p.x = x
    p.y = y
    p.width = balance.platforms.widthBase
    p.type = type
    p.active = true
    p.collapseTimer = -1
    p.vx = 0
    p.bounceT = -1
    p.animT = Math.random() * balance.obstacles.fake.shimmerSec // десинхрон голограмм
    p.view.visible = true
    p.view.alpha = 1
    p.view.x = x
    p.view.y = y
    if (type === 'moving') {
      const m = balance.platforms.types.moving
      const sp = m.speedMinPerSec + Math.random() * (m.speedMaxPerSec - m.speedMinPerSec)
      p.vx = Math.random() < 0.5 ? -sp : sp
      p.dirVisual = p.vx >= 0 ? 1 : -1 // старт без складывания
      // маска для клипа шевронов по силуэту платформы
      p.maskG.clear().roundRect(-p.width / 2, 0, p.width, balance.platforms.height, 4).fill(0xffffff)
      p.maskG.visible = true
      p.view.mask = p.maskG
    } else {
      p.view.mask = null
      p.maskG.visible = false
      p.maskG.clear()
    }
    drawPlatform(p)
    this.platforms.push(p)
    return p
  }

  private recycle(p: Platform): void {
    p.active = false
    p.view.visible = false
    p.view.alpha = 1
    p.view.mask = null
    p.maskG.visible = false
    this.pool.push(p)
  }
}
