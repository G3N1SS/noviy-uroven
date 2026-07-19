import { Graphics } from 'pixi.js'
import { balance } from '../config/balance'

export type PlatformType = 'vols' | 'rrl' | 'moving' | 'fake'

/**
 * Платформа (вышка связи), типы (конспект 2.5 / 2.9):
 *  - vols    — ВОЛС, стабильная, вечная (белая заливка)
 *  - rrl     — РРЛ, шаткая: через collapseMs после касания разрушается (маджента-контур)
 *  - moving  — движущаяся по горизонтали (белая со стрелками)
 *  - fake    — фейк-платформа (препятствие): выглядит как ВОЛС, но растворяется без
 *              отскока (проваливаешься). С SafeWall будет подсвечена — Этап бустеров.
 *
 * `y` — координата ВЕРХНЕЙ грани в мире (по ней one-way коллизия).
 */
export interface Platform {
  view: Graphics
  x: number
  y: number
  width: number
  type: PlatformType
  active: boolean
  /** moving: горизонтальная скорость, px/сек */
  vx: number
  /** rrl: сек до разрушения после касания; <0 — ещё не тронута */
  collapseTimer: number
  /** fake: фаза анимации-голограммы (сек), у каждой платформы свой сдвиг */
  animT: number
}

export function createPlatform(): Platform {
  return {
    view: new Graphics(),
    x: 0,
    y: 0,
    width: balance.platforms.widthBase,
    type: 'vols',
    active: false,
    vx: 0,
    collapseTimer: -1,
    animT: 0,
  }
}

export function drawPlatform(p: Platform): void {
  const h = balance.platforms.height
  const w = p.width
  const g = p.view.clear()

  switch (p.type) {
    case 'rrl':
      // шаткая — маджента-контур + еле заметная заливка. Дрожь/мерцание idle и разлёт
      // осколков — в спавнере (per-frame); тут рисуем базовый вид.
      g.roundRect(-w / 2, 0, w, h, 4).fill({ color: 0xff3495, alpha: 0.1 })
      g.roundRect(-w / 2, 0, w, h, 4).stroke({ color: 0xff3495, width: 2.5 })
      break
    case 'moving':
      // белая со «стрелками» по краям (плейсхолдер)
      g.roundRect(-w / 2, 0, w, h, 4).fill({ color: 0xffffff })
      g.rect(-w / 2 + 6, h / 2 - 2, 7, 4).fill({ color: 0x000000 })
      g.rect(w / 2 - 13, h / 2 - 2, 7, 4).fill({ color: 0x000000 })
      break
    case 'fake':
      drawFakeHologram(p)
      break
    case 'vols':
    default:
      g.roundRect(-w / 2, 0, w, h, 4).fill({ color: 0xffffff })
      break
  }
}

/**
 * Разрушение РРЛ: контур распадается на 3 маджента-осколка, которые за `progress` 0→1
 * разлетаются вниз-в стороны и гаснут. Перерисовывается каждый кадр во время коллапса.
 */
export function drawRrlShatter(p: Platform, progress: number): void {
  const h = balance.platforms.height
  const w = p.width
  const pieces = 3
  const pw = w / pieces
  const g = p.view.clear()
  const alpha = (1 - progress) * 0.9
  for (let i = 0; i < pieces; i++) {
    const x0 = -w / 2 + i * pw
    const drift = (i - 1) * progress * 16 // разлёт в стороны
    const fall = progress * progress * 34 * (0.6 + 0.3 * i) // падение (ускорение)
    g.roundRect(x0 + drift, fall, pw - 3, h, 3).stroke({
      color: 0xff3495,
      width: 2.5,
      alpha,
    })
  }
}

/**
 * Фейк-«голограмма»: большую часть цикла — цельная белая (не отличить от ВОЛС),
 * затем на миг контур двоится (маджента-призрак ↖, белый ↘ — анаглиф) и схлопывается
 * назад. Перерисовывается каждый кадр по `p.animT`. Форма-намёк «это проекция, не опора».
 */
export function drawFakeHologram(p: Platform): void {
  const h = balance.platforms.height
  const w = p.width
  const cycle = balance.obstacles.fake.shimmerSec
  const t = (p.animT % cycle) / cycle
  // split 0..1: 0 бо́льшую часть цикла, плавный пик в окне [0.5, 0.9]
  const split = t > 0.5 && t < 0.9 ? Math.sin(((t - 0.5) / 0.4) * Math.PI) : 0

  const g = p.view.clear()
  if (split > 0.01) {
    const ox = 4 * split
    const oy = 2.5 * split
    g.roundRect(-w / 2 - ox, -oy, w, h, 4).stroke({ color: 0xff3495, width: 2, alpha: 0.85 * split })
    g.roundRect(-w / 2 + ox, oy, w, h, 4).stroke({ color: 0xffffff, width: 1.5, alpha: 0.6 * split })
  }
  g.roundRect(-w / 2, 0, w, h, 4).fill({ color: 0xffffff, alpha: 1 - 0.28 * split })
}
