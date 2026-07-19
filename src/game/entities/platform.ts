import { Graphics } from 'pixi.js'
import { balance } from '../config/balance'

/**
 * Платформа (вышка связи). Пока один тип — ВОЛС (белая, надёжная).
 * `y` — координата ВЕРХНЕЙ грани в мире (по ней проверяем one-way коллизию).
 */
export interface Platform {
  view: Graphics
  x: number
  y: number
  width: number
  active: boolean
}

export function createPlatform(): Platform {
  const view = new Graphics()
  const p: Platform = { view, x: 0, y: 0, width: balance.platforms.widthBase, active: false }
  drawPlatform(p)
  return p
}

export function drawPlatform(p: Platform): void {
  const h = balance.platforms.height
  p.view
    .clear()
    .roundRect(-p.width / 2, 0, p.width, h, 4)
    .fill({ color: 0xffffff })
}
