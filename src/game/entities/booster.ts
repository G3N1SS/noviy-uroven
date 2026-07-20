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
      // двойной кристалл (×2): два ромба пульсируют попеременно
      const cycle = balance.boosters.gigaback.pulseSec
      const tt = (b.animT % cycle) / cycle
      const pulse = (a: number, bb: number) =>
        tt >= a && tt <= bb ? Math.sin(((tt - a) / (bb - a)) * Math.PI) : 0
      const dv = r * 0.6
      const dh = r * 0.44
      const off = r * 0.42
      const s1 = 1 + 0.2 * pulse(0, 0.3)
      const s2 = 1 + 0.2 * pulse(0.35, 0.65)
      const a2 = 0.45 + 0.55 * pulse(0.35, 0.65)
      // ромб 1 — заполненный + белое ядро
      g.poly([-off, -dv * s1, -off + dh * s1, 0, -off, dv * s1, -off - dh * s1, 0]).fill({ color: c })
      g.poly([
        -off,
        -dv * 0.55 * s1,
        -off + dh * 0.55 * s1,
        0,
        -off,
        dv * 0.55 * s1,
        -off - dh * 0.55 * s1,
        0,
      ]).fill({ color: 0xffffff, alpha: 0.9 })
      // ромб 2 — контурный
      g.poly([off, -dv * s2, off + dh * s2, 0, off, dv * s2, off - dh * s2, 0]).stroke({
        color: c,
        width: 2.5,
        alpha: a2,
      })
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
