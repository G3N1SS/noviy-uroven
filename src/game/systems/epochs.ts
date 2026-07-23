import type { Application, Text } from 'pixi.js'
import { balance } from '../config/balance'

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]: Rgb): number {
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

/**
 * Эпохи (конспект 2.7): по высоте определяем эпоху, при переходе — кроссфейд фоновой
 * заливки (renderer.background) + баннер дерзким тоном (2.13). Настоящие палитры,
 * инверсия LTE, параллакс-слои — Этап 3 (визуал). Сейчас фон — тёмный тинт-плейсхолдер.
 */
export class EpochManager {
  current = 0
  private bg: Rgb = [0, 0, 0]
  private targetBg: Rgb = [0, 0, 0]
  private bannerTimer = 0

  constructor(
    private readonly app: Application,
    private readonly banner: Text,
  ) {}

  reset(): void {
    this.current = 0 // следующий update мгновенно поставит фон эпохи 1 без баннера
    this.bannerTimer = 0
    this.banner.visible = false
  }

  private epochFor(meters: number) {
    const eps = balance.epochs
    for (const e of eps) {
      if (meters >= e.fromMeters && (e.toMeters === null || meters < e.toMeters)) return e
    }
    return eps[eps.length - 1]
  }

  update(heightMeters: number, dtSec: number): void {
    const e = this.epochFor(heightMeters)
    if (e.id !== this.current) {
      const prev = this.current
      this.current = e.id
      this.targetBg = hexToRgb(e.bg)
      if (prev === 0) {
        // старт партии — фон мгновенно, без баннера
        this.bg = [...this.targetBg]
      } else {
        this.banner.text = e.banner
        this.banner.visible = true
        this.banner.alpha = 1
        this.bannerTimer = balance.epochTransition.bannerSec
      }
    }

    // кроссфейд фона
    const rate = Math.min(1, dtSec / balance.epochTransition.crossfadeSec)
    for (let i = 0; i < 3; i++) this.bg[i] += (this.targetBg[i] - this.bg[i]) * rate
    this.app.renderer.background.color = rgbToHex(this.bg)

    // баннер: висит, последние 0.6с гаснет
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dtSec
      this.banner.alpha = Math.min(1, this.bannerTimer / 0.6)
      if (this.bannerTimer <= 0) this.banner.visible = false
    }
  }

  /**
   * Прогресс внутри текущей эпохи, 0..1 — для полоски в HUD (конспект 3.5).
   * null — финальная эпоха (следующей нет, полоску не показываем).
   */
  progress(heightMeters: number): number | null {
    const e = this.epochFor(heightMeters)
    if (e.toMeters === null) return null
    const span = e.toMeters - e.fromMeters
    if (span <= 0) return null
    return Math.min(1, Math.max(0, (heightMeters - e.fromMeters) / span))
  }

  /** Дерзкий нарратив для экрана Game Over по достигнутой высоте (конспект 2.13). */
  deathBanner(heightMeters: number): string {
    const e = this.epochFor(heightMeters)
    switch (e.id) {
      case 1:
        return 'Застрял на 2G. Даже обидно'
      case 2:
        return 'Застрял на 3G. Даже обидно'
      case 3:
        return 'LTE и стоп. Бывает'
      case 4:
        return '5G оказался коварнее'
      case 5:
      default:
        return 'Будущее подождёт следующей попытки'
    }
  }
}
