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
  /** fake: фаза голограммы (сек) / moving: накопленная дистанция для марша шевронов */
  animT: number
  /** moving: плавное «визуальное направление» −1..1 (для мягкого разворота стрелок) */
  dirVisual: number
  /** маска-скругление для клипа марширующих шевронов (moving). */
  maskG: Graphics
}

export function createPlatform(): Platform {
  const view = new Graphics()
  const maskG = new Graphics()
  maskG.visible = false
  view.addChild(maskG) // маска-ребёнок для клипа шевронов у moving
  return {
    view,
    x: 0,
    y: 0,
    width: balance.platforms.widthBase,
    type: 'vols',
    active: false,
    vx: 0,
    collapseTimer: -1,
    animT: 0,
    dirVisual: 1,
    maskG,
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
      drawMovingChevrons(p)
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
 * Движущаяся: белая база + марширующие чёрные шевроны. Бесшовный конвейер — паттерн
 * рисуется от −step до width+step и клипается маской платформы (p.maskG), сдвиг = дистанция
 * платформы (p.animT) по модулю шага. Направление шевронов = знак vx. Перерисовка per-frame.
 */
export function drawMovingChevrons(p: Platform): void {
  const h = balance.platforms.height
  const w = p.width
  const step = balance.platforms.types.moving.chevronStepPx
  // animT уже несёт знак направления (через dirVisual), поэтому phase — без множителя dir.
  const phase = ((p.animT % step) + step) % step
  const cw = 5
  const cy = h / 2
  const ch = h * 0.34
  const tip = cw * p.dirVisual // раскрытие шеврона: >0 вправо, <0 влево, ≈0 — вертикаль (момент разворота)

  const g = p.view.clear()
  g.roundRect(-w / 2, 0, w, h, 4).fill({ color: 0xffffff })
  const count = Math.ceil(w / step) + 3
  for (let k = 0; k < count; k++) {
    const cx = -w / 2 - step + k * step + phase
    g.moveTo(cx, cy - ch).lineTo(cx + tip, cy).lineTo(cx, cy + ch)
  }
  g.stroke({ color: 0x111111, width: 2.5, cap: 'round', join: 'round' })
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
