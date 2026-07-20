import { Graphics } from 'pixi.js'
import { balance } from '../config/balance'

/**
 * Помеха (глитч-облако, конспект 2.9) — висит в воздухе между платформами.
 * Касание = отброс вниз + потеря контроля (обрабатывает игровой цикл).
 * Визуал — датамош из вертикальных полос (сбитая развёртка), анимируется per-frame по `animT`.
 */
export interface Obstacle {
  view: Graphics
  x: number
  y: number
  radius: number
  active: boolean
  /** фаза глитч-анимации (сек), у каждой помехи свой сдвиг */
  animT: number
}

export function createObstacle(): Obstacle {
  return {
    view: new Graphics(),
    x: 0,
    y: 0,
    radius: balance.obstacles.interference.radius,
    active: false,
    animT: 0,
  }
}

// Фиксированная раскладка вертикальных полос (dx, ширина, высота, alpha, фаза bob, направление сбоя)
const COLS = [
  { dx: -18, w: 5, h: 28, a: 0.8, ph: 0.0, gd: -1 },
  { dx: -11, w: 6, h: 42, a: 1.0, ph: 1.3, gd: 1 },
  { dx: -4, w: 5, h: 34, a: 0.9, ph: 2.1, gd: -1 },
  { dx: 4, w: 7, h: 44, a: 1.0, ph: 0.6, gd: 1 },
  { dx: 12, w: 5, h: 36, a: 0.85, ph: 2.8, gd: -1 },
  { dx: 18, w: 6, h: 26, a: 0.75, ph: 1.7, gd: 1 },
]

/**
 * Датамош-помеха (концепт A2): вертикальные полосы ездят вверх-вниз внапопад, всё облако
 * микро-дрожит, раз в цикл — «жёсткий сбой» (полосы резко разъезжаются), + мигающие белые
 * sync-линии. Детерминировано по `o.animT`.
 */
export function drawObstacle(o: Obstacle): void {
  const t = o.animT
  const cyc = balance.obstacles.interference.glitchCycleSec
  const phase = (t % cyc) / cyc
  const hard = phase < 0.14 ? Math.sin((phase / 0.14) * Math.PI) : 0 // краткий сбой в начале цикла
  const jx = Math.sin(t * 47) * 0.9 + Math.sin(t * 31) * 0.5 // микро-дрожь облака
  const jy = Math.cos(t * 53) * 0.7

  const g = o.view.clear()
  for (const c of COLS) {
    const bob = Math.sin(t * 8 + c.ph) * 3
    const glitch = hard * c.gd * 13
    const cx = c.dx + jx
    const cy = -c.h / 2 + bob + glitch + jy
    g.rect(cx - c.w / 2, cy, c.w, c.h).fill({ color: 0xff3495, alpha: c.a })
  }
  // белые sync-линии, мигают невпопад
  const f1 = Math.sin(t * 13) > 0.2 ? 0.9 : 0.1
  const f2 = Math.sin(t * 9 + 1.5) > 0.4 ? 0.6 : 0
  g.rect(-20 + jx, -3 + Math.sin(t * 5) * 4, 40, 2.5).fill({ color: 0xffffff, alpha: f1 })
  g.rect(-14 + jx, 8, 28, 2).fill({ color: 0xffffff, alpha: f2 })
}
