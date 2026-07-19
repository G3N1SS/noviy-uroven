import { Graphics } from 'pixi.js'
import { balance } from '../config/balance'

export type PlatformType = 'vols' | 'rrl' | 'moving' | 'oneshot'

/**
 * Платформа (вышка связи), 4 типа (конспект 2.5):
 *  - vols    — ВОЛС, стабильная, вечная (белая заливка)
 *  - rrl     — РРЛ, шаткая: через collapseMs после касания разрушается (маджента-контур)
 *  - moving  — движущаяся по горизонтали (белая со стрелками)
 *  - oneshot — разовая: исчезает после одного прыжка (полупрозрачная)
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
  /** oneshot: использована, убрать на ближайшем апдейте */
  triggered: boolean
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
    triggered: false,
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
    case 'oneshot':
      // разовая — полупрозрачная
      g.roundRect(-w / 2, 0, w, h, 4).fill({ color: 0xffffff, alpha: 0.4 })
      break
    case 'vols':
    default:
      g.roundRect(-w / 2, 0, w, h, 4).fill({ color: 0xffffff })
      break
  }
}
