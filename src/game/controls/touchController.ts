import { balance } from '../config/balance'
import { getControlSensitivity } from '../../shared/storage/local'
import type { Controller, ControlMode } from './types'

/**
 * Тач/мышь. Два варианта (конспект 2.4):
 *  - 'follow': персонаж плавно едет к X пальца (следование, не телепорт)
 *  - 'zones':  левая половина экрана = влево, правая = вправо
 * Чувствительность (0..1, своя на режим): follow → потолок скорости слежения (gain
 * фиксирован и snappy; чувствительность масштабирует max — иначе разницу съедает кламп),
 * zones → множитель скорости толчка. Перечитывается на reset() (старт партии), как наклон.
 */
export class TouchController implements Controller {
  readonly mode: ControlMode
  private pointerX: number | null = null
  private down = false
  private gain = balance.controls.follow.gain
  private followFactor = 1
  private zoneFactor = 1

  constructor(
    private readonly canvas: HTMLCanvasElement,
    variant: 'follow' | 'zones',
  ) {
    this.mode = variant
    this.applySensitivity()
    canvas.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
  }

  private applySensitivity(): void {
    const s = getControlSensitivity(this.mode) // 0..1
    if (this.mode === 'follow') {
      const f = balance.controls.follow
      this.followFactor = f.speedFactorMin + (f.speedFactorMax - f.speedFactorMin) * s
    } else {
      const z = balance.controls.zones
      this.zoneFactor = z.speedFactorMin + (z.speedFactorMax - z.speedFactorMin) * s
    }
  }

  /** Старт партии: перечитываем чувствительность (могли поменять в настройках). */
  reset(): void {
    this.applySensitivity()
  }

  private toCanvasX(clientX: number): number {
    return clientX - this.canvas.getBoundingClientRect().left
  }

  private onDown = (e: PointerEvent) => {
    this.down = true
    this.pointerX = this.toCanvasX(e.clientX)
  }
  private onMove = (e: PointerEvent) => {
    if (this.down) this.pointerX = this.toCanvasX(e.clientX)
  }
  private onUp = () => {
    this.down = false
    this.pointerX = null
  }

  update(playerX: number, screenW: number, maxSpeed: number): number | null {
    if (!this.down || this.pointerX === null) return null
    if (this.mode === 'zones') {
      const dir = this.pointerX < screenW / 2 ? -1 : 1
      return dir * maxSpeed * this.zoneFactor
    }
    // follow (vx в px/сек): чувствительность масштабирует ВСЮ кривую разом — и темп
    // слежения (gain), и потолок. Иначе слепой угол: только gain незаметен вдали (кламп),
    // только потолок — незаметен вблизи (не доезжаешь). Так реагирует на любом движении.
    const cap = maxSpeed * this.followFactor
    const vx = (this.pointerX - playerX) * this.gain * this.followFactor
    return Math.max(-cap, Math.min(cap, vx))
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
  }
}
