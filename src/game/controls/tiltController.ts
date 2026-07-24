import { balance } from '../config/balance'
import { getControlSensitivity } from '../../shared/storage/local'
import type { Controller } from './types'

/** iOS 13+ прячет requestPermission на конструкторе DeviceOrientationEvent. */
interface DeviceOrientationEventiOS {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

/**
 * Акселерометр: DeviceOrientationEvent.gamma (наклон влево/вправо).
 * - Мёртвая зона ±deadZoneDeg (защита от дрожи рук)
 * - Пропорционально до fullSpeedDeg
 * - Калибровка «нуля» при старте партии (телефон уже наклонён = ноль)
 */
export class TiltController implements Controller {
  readonly mode = 'tilt' as const
  private gamma: number | null = null
  private gamma0 = 0
  private hasData = false
  private fullSpeedDeg: number

  constructor() {
    this.fullSpeedDeg = this.computeFullSpeed()
    window.addEventListener('deviceorientation', this.onOrient)
  }

  /** Угол полной скорости из чувствительности 0..1: 0 → low (спокойнее), 1 → high (резче). */
  private computeFullSpeed(): number {
    const s = balance.controls.tilt.sensitivity
    return s.low + (s.high - s.low) * getControlSensitivity('tilt')
  }

  private onOrient = (e: DeviceOrientationEvent) => {
    if (e.gamma !== null) {
      this.gamma = e.gamma
      this.hasData = true
    }
  }

  /** Старт партии: калибровка нуля + перечитываем чувствительность (могли поменять в настройках). */
  reset() {
    this.fullSpeedDeg = this.computeFullSpeed()
    if (this.gamma !== null) this.gamma0 = this.gamma
  }

  update(_playerX: number, _screenW: number, maxSpeed: number): number | null {
    if (!this.hasData || this.gamma === null) return null
    const { deadZoneDeg } = balance.controls.tilt
    const g = this.gamma - this.gamma0
    const mag = Math.abs(g)
    if (mag <= deadZoneDeg) return 0
    const t = Math.min((mag - deadZoneDeg) / (this.fullSpeedDeg - deadZoneDeg), 1)
    return Math.sign(g) * t * maxSpeed
  }

  destroy() {
    window.removeEventListener('deviceorientation', this.onOrient)
  }

  /** Нужен ли явный запрос разрешения (iOS 13+). */
  static needsPermission(): boolean {
    if (typeof DeviceOrientationEvent === 'undefined') return false
    const DOE = DeviceOrientationEvent as unknown as DeviceOrientationEventiOS
    return typeof DOE.requestPermission === 'function'
  }

  /** Запрос разрешения. Вызывать ТОЛЬКО из обработчика тапа (жест пользователя). */
  static async requestPermission(): Promise<boolean> {
    if (typeof DeviceOrientationEvent === 'undefined') return false
    const DOE = DeviceOrientationEvent as unknown as DeviceOrientationEventiOS
    if (typeof DOE.requestPermission !== 'function') return true // не iOS — разрешение не требуется
    try {
      return (await DOE.requestPermission()) === 'granted'
    } catch {
      return false
    }
  }
}
