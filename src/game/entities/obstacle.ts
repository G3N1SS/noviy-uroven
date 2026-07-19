import { Graphics } from 'pixi.js'
import { balance } from '../config/balance'

/**
 * Помеха (глитч-облако, конспект 2.9) — висит в воздухе между платформами.
 * Касание = отброс вниз + потеря контроля на время (обрабатывает игровой цикл).
 * Визуал — рваное облако из полупрозрачных пятен (плейсхолдер; глитч-шейдер — Этап 3).
 */
export interface Obstacle {
  view: Graphics
  x: number
  y: number
  radius: number
  active: boolean
}

export function createObstacle(): Obstacle {
  return {
    view: new Graphics(),
    x: 0,
    y: 0,
    radius: balance.obstacles.interference.radius,
    active: false,
  }
}

export function drawObstacle(o: Obstacle): void {
  const r = o.radius
  const g = o.view.clear()
  // рваное облако: несколько смещённых пятен
  const blobs: Array<[number, number, number, number]> = [
    [0, 0, r, 0.28],
    [-r * 0.5, -r * 0.3, r * 0.7, 0.22],
    [r * 0.55, -r * 0.15, r * 0.65, 0.22],
    [r * 0.15, r * 0.45, r * 0.6, 0.2],
  ]
  for (const [dx, dy, br, a] of blobs) {
    g.circle(dx, dy, br).fill({ color: 0xff3495, alpha: a })
  }
  // белые «искры» глитча
  g.rect(-r * 0.6, -2, r * 0.5, 3).fill({ color: 0xffffff, alpha: 0.6 })
  g.rect(r * 0.1, r * 0.2, r * 0.4, 3).fill({ color: 0xffffff, alpha: 0.5 })
}
