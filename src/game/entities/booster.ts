import { Graphics } from 'pixi.js'
import { balance } from '../config/balance'

export type BoosterType = 'gigaback' | 'mixxShield' | 'eternal' | 'safewall'

/**
 * Бустер = продукт T2 (конспект 2.8). Собирается пролётом сквозь иконку.
 * Визуалы — плейсхолдеры по описанию (кольцевая стрелка / гексагон M / ∞ / щит),
 * анимация парения — через view.transform в менеджере (иконка рисуется один раз).
 */
export interface Booster {
  view: Graphics
  x: number
  y: number
  type: BoosterType
  radius: number
  active: boolean
  animT: number
}

const COLORS: Record<BoosterType, number> = {
  gigaback: parseInt(balance.boosters.gigaback.color.slice(1), 16),
  mixxShield: parseInt(balance.boosters.mixxShield.color.slice(1), 16),
  eternal: parseInt(balance.boosters.eternalMinutes.color.slice(1), 16),
  safewall: parseInt(balance.boosters.safeWall.color.slice(1), 16),
}

export function boosterColor(type: BoosterType): number {
  return COLORS[type]
}

export function createBooster(): Booster {
  return {
    view: new Graphics(),
    x: 0,
    y: 0,
    type: 'gigaback',
    radius: balance.boosters.radius,
    active: false,
    animT: 0,
  }
}

export function drawBooster(b: Booster): void {
  const r = b.radius
  const c = COLORS[b.type]
  const g = b.view.clear()

  switch (b.type) {
    case 'gigaback': {
      // кольцевая стрелка (возврат трафика)
      g.circle(0, 0, r * 0.72).stroke({ color: c, width: 3 })
      const rr = r * 0.72
      g.moveTo(rr - 4, -r * 0.72 + 2)
        .lineTo(rr + 3, -r * 0.55)
        .lineTo(rr - 5, -r * 0.5)
      g.stroke({ color: c, width: 3, cap: 'round', join: 'round' })
      break
    }
    case 'mixxShield': {
      // гексагон + M
      const hex: number[] = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2
        hex.push(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8)
      }
      g.poly(hex).stroke({ color: c, width: 3 })
      g.moveTo(-r * 0.35, r * 0.28)
        .lineTo(-r * 0.35, -r * 0.28)
        .lineTo(0, r * 0.05)
        .lineTo(r * 0.35, -r * 0.28)
        .lineTo(r * 0.35, r * 0.28)
      g.stroke({ color: c, width: 2.5, cap: 'round', join: 'round' })
      break
    }
    case 'eternal': {
      // ∞ (не сгорающие пакеты)
      g.circle(-r * 0.4, 0, r * 0.4).stroke({ color: c, width: 3 })
      g.circle(r * 0.4, 0, r * 0.4).stroke({ color: c, width: 3 })
      break
    }
    case 'safewall': {
      // щит (кибербезопасность)
      g.moveTo(0, -r * 0.85)
        .lineTo(r * 0.75, -r * 0.45)
        .lineTo(r * 0.75, r * 0.15)
        .lineTo(0, r * 0.85)
        .lineTo(-r * 0.75, r * 0.15)
        .lineTo(-r * 0.75, -r * 0.45)
        .closePath()
      g.fill({ color: c, alpha: 0.18 }).stroke({ color: c, width: 3 })
      break
    }
  }
}
