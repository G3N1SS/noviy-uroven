import { Container, Graphics } from 'pixi.js'
import { balance } from '../config/balance'

/**
 * Персонаж-«сигнал». Состояние в мировых координатах (y растёт вниз;
 * вверх по игре = уменьшение y). Физика — чистая математика, без Matter.js.
 */
export interface Player {
  view: Container
  x: number
  y: number
  vx: number
  vy: number
  /** y в предыдущем кадре — нужен для one-way коллизии без туннелирования */
  prevY: number
}

export function createPlayer(): Player {
  const view = new Container()
  view.addChild(drawSignal())
  return { view, x: 0, y: 0, vx: 0, vy: 0, prevY: 0 }
}

/** Плейсхолдер: ядро маджента + белая сердцевина + мягкое свечение. Спрайт — на Этапе 3. */
function drawSignal(): Graphics {
  const r = balance.player.radius
  const g = new Graphics()
  g.circle(0, 0, r * 1.8).fill({ color: 0xff3495, alpha: 0.12 })
  g.circle(0, 0, r * 1.3).fill({ color: 0xff3495, alpha: 0.25 })
  g.circle(0, 0, r).fill({ color: 0xff3495 })
  g.circle(0, 0, r * 0.45).fill({ color: 0xffffff, alpha: 0.95 })
  return g
}
