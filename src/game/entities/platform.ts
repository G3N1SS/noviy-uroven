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
  }
}

export function drawPlatform(p: Platform): void {
  const h = balance.platforms.height
  const w = p.width
  const g = p.view.clear()

  switch (p.type) {
    case 'rrl':
      // шаткая — маджента-контур
      g.roundRect(-w / 2, 0, w, h, 4).stroke({ color: 0xff3495, width: 3 })
      break
    case 'moving':
      // белая со «стрелками» по краям (плейсхолдер)
      g.roundRect(-w / 2, 0, w, h, 4).fill({ color: 0xffffff })
      g.rect(-w / 2 + 6, h / 2 - 2, 7, 4).fill({ color: 0x000000 })
      g.rect(w / 2 - 13, h / 2 - 2, 7, 4).fill({ color: 0x000000 })
      break
    case 'fake': {
      // «почти как ВОЛС», но пунктирная и чуть тусклее — тонкая подсказка о ненадёжности.
      // Явную подсветку даст SafeWall (бустер).
      const seg = 12
      const gap = 5
      for (let sx = -w / 2; sx < w / 2; sx += seg + gap) {
        const sw = Math.min(seg, w / 2 - sx)
        g.roundRect(sx, 0, sw, h, 3).fill({ color: 0xffffff, alpha: 0.7 })
      }
      break
    }
    case 'vols':
    default:
      g.roundRect(-w / 2, 0, w, h, 4).fill({ color: 0xffffff })
      break
  }
}
