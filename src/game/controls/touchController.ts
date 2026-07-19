import { balance } from '../config/balance'
import type { Controller, ControlMode } from './types'

/**
 * Тач/мышь. Два варианта (конспект 2.4):
 *  - 'follow': персонаж плавно едет к X пальца (следование, не телепорт)
 *  - 'zones':  левая половина экрана = влево, правая = вправо
 */
export class TouchController implements Controller {
  readonly mode: ControlMode
  private pointerX: number | null = null
  private down = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    variant: 'follow' | 'zones',
  ) {
    this.mode = variant
    canvas.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
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
      return this.pointerX < screenW / 2 ? -maxSpeed : maxSpeed
    }
    // follow
    const vx = (this.pointerX - playerX) * balance.input.followFactor
    return Math.max(-maxSpeed, Math.min(maxSpeed, vx))
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
  }
}
