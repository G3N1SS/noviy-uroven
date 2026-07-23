import { Graphics } from 'pixi.js'
import { balance } from '../config/balance'

interface TrailPoint {
  x: number
  y: number
  age: number
}

interface Vec {
  x: number
  y: number
}

/**
 * Шлейф «сигнала» (конспект 2.2): едва заметная лента цвета персонажа, тает за ~0.3 сек.
 *
 * Гладкость: нормаль в каждой точке берётся ЦЕНТРАЛЬНОЙ РАЗНОСТЬЮ (по соседям), и соседние
 * квады делят одни и те же вершины — поэтому на дуге прыжка нет зазубрин и щелей в стыках
 * (наивный вариант «нормаль на сегмент» их даёт). Ширина гаснет по smoothstep, альфа — квадратично.
 * Разрывы (wrap через край / телепорт батута) режут ленту на независимые куски.
 */
export class Trail {
  readonly view = new Graphics()
  private points: TrailPoint[] = []

  update(x: number, y: number, dtSec: number, screenW: number): void {
    const cfg = balance.player.trail
    for (const p of this.points) p.age += dtSec
    while (this.points.length > 0 && this.points[0].age > cfg.durationSec) this.points.shift()
    this.points.push({ x, y, age: 0 })

    const g = this.view.clear()
    // Режем на непрерывные куски по разрывам, каждый рисуем отдельной лентой.
    let run: TrailPoint[] = []
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i]
      if (i > 0) {
        const prev = this.points[i - 1]
        const broken = Math.abs(p.x - prev.x) > screenW / 2 || Math.abs(p.y - prev.y) > 120
        if (broken) {
          this.drawRibbon(g, run)
          run = []
        }
      }
      run.push(p)
    }
    this.drawRibbon(g, run)
  }

  /** Плавное затухание ширины: smoothstep — округлая голова, мягко сходящий хвост. */
  private taper(t: number): number {
    return t * t * (3 - 2 * t)
  }

  private drawRibbon(g: Graphics, pts: TrailPoint[]): void {
    if (pts.length < 2) return
    const cfg = balance.player.trail
    const color = parseInt(cfg.color.slice(1), 16)
    const n = pts.length
    const left: Vec[] = []
    const right: Vec[] = []
    const fade: number[] = []

    for (let i = 0; i < n; i++) {
      // Направление по соседям (центральная разность) → нормаль общая для стыка.
      const prev = pts[Math.max(0, i - 1)]
      const next = pts[Math.min(n - 1, i + 1)]
      const dx = next.x - prev.x
      const dy = next.y - prev.y
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len
      const ny = dx / len
      const t = Math.max(0, 1 - pts[i].age / cfg.durationSec) // 1 у головы → 0 в хвосте
      const w = cfg.widthPx * this.taper(t)
      left.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w })
      right.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w })
      fade.push(t)
    }

    for (let i = 1; i < n; i++) {
      const a = i - 1
      g.poly([
        left[a].x, left[a].y,
        left[i].x, left[i].y,
        right[i].x, right[i].y,
        right[a].x, right[a].y,
      ]).fill({ color, alpha: cfg.maxAlpha * fade[i] * fade[i] })
    }
  }

  clear(): void {
    this.points.length = 0
    this.view.clear()
  }
}
