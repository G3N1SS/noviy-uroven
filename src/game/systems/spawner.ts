import { Container } from 'pixi.js'
import { balance } from '../config/balance'
import { createPlatform, drawPlatform, type Platform, type PlatformType } from '../entities/platform'

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
  /** y самой верхней (последней сгенерированной) платформы. */
  private lastY = 0
  /** сколько платформ прошло с последней ВОЛС (для гарантии). */
  private sinceVols = 0

  constructor(private readonly world: Container) {}

  reset(startPlatformY: number, screenW: number): void {
    for (const p of this.platforms) this.recycle(p)
    this.platforms.length = 0
    this.lastY = startPlatformY
    this.sinceVols = 0
    this.spawnAt(screenW / 2, startPlatformY, 'vols') // старт всегда ВОЛС
  }

  update(cameraOffset: number, screenW: number, screenH: number, dtSec: number): void {
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
      } else if (p.type === 'rrl' && p.collapseTimer >= 0) {
        p.collapseTimer -= dtSec
        const full = balance.platforms.types.rrl.collapseMs / 1000
        p.view.alpha = Math.max(0.15, p.collapseTimer / full) // угасание
        if (p.collapseTimer <= 0) {
          p.active = false
          p.view.visible = false
        }
      }
    }

    // 2) Генерация вверх
    const topVisibleWorldY = -cameraOffset
    const spawnUntilY = topVisibleWorldY - balance.spawn.spawnAheadScreens * screenH
    const { gapMin, gapMax, widthBase } = balance.platforms
    const halfW = widthBase / 2
    while (this.lastY > spawnUntilY) {
      const gap = gapMin + Math.random() * (gapMax - gapMin)
      this.lastY -= gap
      const meters = -this.lastY / balance.score.pxPerMeter
      const type = this.pickType(meters)
      if (type === 'fake') {
        // Фейк — ДЕКОЙ рядом с настоящей платформой на том же уровне. Так реальная опора
        // есть всегда → фейк не создаёт недостижимых разрывов (честность), но ловушка живёт.
        const [realX, fakeX] = this.decoyPositions(screenW)
        this.spawnAt(realX, this.lastY, 'vols')
        this.spawnAt(fakeX, this.lastY, 'fake')
        this.sinceVols = 0 // настоящая ВОЛС на уровне поставлена
      } else {
        const x = halfW + Math.random() * (screenW - 2 * halfW)
        this.spawnAt(x, this.lastY, type)
      }
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

  /** Позиции пары «настоящая / фейк» в разных половинах экрана. Возвращает [realX, fakeX]. */
  private decoyPositions(screenW: number): [number, number] {
    const halfW = balance.platforms.widthBase / 2
    const leftX = halfW + Math.random() * (screenW * 0.32 - halfW)
    const rightX = screenW * 0.68 + Math.random() * (screenW - halfW - screenW * 0.68)
    return Math.random() < 0.5 ? [leftX, rightX] : [rightX, leftX]
  }

  private pickType(meters: number): PlatformType {
    // Гарантия: не более (N-1) не-ВОЛС подряд (страховка от нечестной смерти)
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
    let roll = Math.random() * total
    let type: PlatformType
    if ((roll -= vols) < 0) type = 'vols'
    else if ((roll -= rrl) < 0) type = 'rrl'
    else if ((roll -= moving) < 0) type = 'moving'
    else type = 'fake'

    if (type === 'vols') this.sinceVols = 0
    else this.sinceVols++
    return type
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
    p.view.visible = true
    p.view.alpha = 1
    p.view.x = x
    p.view.y = y
    if (type === 'moving') {
      const m = balance.platforms.types.moving
      const sp = m.speedMinPerSec + Math.random() * (m.speedMaxPerSec - m.speedMinPerSec)
      p.vx = Math.random() < 0.5 ? -sp : sp
    }
    drawPlatform(p)
    this.platforms.push(p)
    return p
  }

  private recycle(p: Platform): void {
    p.active = false
    p.view.visible = false
    p.view.alpha = 1
    this.pool.push(p)
  }
}
