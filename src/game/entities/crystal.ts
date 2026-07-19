import { Graphics } from 'pixi.js'
import { balance } from '../config/balance'

/**
 * Кристалл — валюта. Обычный (+1) и крупный (+5). Собирается при пролёте сквозь
 * иконку (окружность-окружность, в любом направлении). Визуал — маджента-ромб
 * с белой сердцевиной (плейсхолдер; частицы сбора — Этап 3).
 */
export interface Crystal {
  view: Graphics
  x: number
  y: number
  value: number
  radius: number
  active: boolean
}

export function createCrystal(): Crystal {
  return {
    view: new Graphics(),
    x: 0,
    y: 0,
    value: balance.crystals.small.value,
    radius: balance.crystals.smallRadius,
    active: false,
  }
}

export function drawCrystal(c: Crystal, large: boolean): void {
  const r = c.radius
  const g = c.view.clear()
  // ромб
  g.poly([0, -r, r * 0.72, 0, 0, r, -r * 0.72, 0]).fill({ color: 0xff3495 })
  // белая сердцевина
  g.poly([0, -r * 0.5, r * 0.36, 0, 0, r * 0.5, -r * 0.36, 0]).fill({
    color: 0xffffff,
    alpha: 0.9,
  })
  if (large) {
    // тонкая белая обводка у крупного
    g.poly([0, -r, r * 0.72, 0, 0, r, -r * 0.72, 0]).stroke({ color: 0xffffff, width: 2 })
  }
}
