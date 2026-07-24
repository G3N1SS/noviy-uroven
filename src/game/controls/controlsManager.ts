import type { Controller, ControlMode } from './types'
import { TouchController } from './touchController'
import { TiltController } from './tiltController'

const STORAGE_KEY = 'novy-uroven:controls'
const DEFAULT_MODE: ControlMode = 'follow'

function loadMode(): ControlMode {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'tilt' || v === 'follow' || v === 'zones' ? v : DEFAULT_MODE
}

/** Сделал ли игрок явный выбор управления. false → показываем онбординг (ТЗ 3.5). */
export function hasChosenControl(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Держит активный контроллер, переключает схемы, сохраняет выбор в localStorage.
 * Для наклона на iOS запрашивает разрешение (setMode должен вызываться из тапа).
 */
export class ControlsManager {
  private controller: Controller
  private _mode: ControlMode

  constructor(private readonly canvas: HTMLCanvasElement) {
    this._mode = loadMode()
    this.controller = this.make(this._mode)
  }

  get current(): ControlMode {
    return this._mode
  }

  update(playerX: number, screenW: number, maxSpeed: number): number | null {
    return this.controller.update(playerX, screenW, maxSpeed)
  }

  /** Старт партии — калибровка нуля наклона и пр. */
  reset(): void {
    this.controller.reset?.()
  }

  /** Возвращает false, если пользователь отклонил разрешение на наклон (iOS). */
  async setMode(mode: ControlMode): Promise<boolean> {
    if (mode === this._mode) {
      localStorage.setItem(STORAGE_KEY, mode) // персист даже если режим совпал (важно для онбординга)
      return true
    }
    if (mode === 'tilt' && TiltController.needsPermission()) {
      const granted = await TiltController.requestPermission()
      if (!granted) return false
    }
    this.controller.destroy()
    this.controller = this.make(mode)
    this.controller.reset?.()
    this._mode = mode
    localStorage.setItem(STORAGE_KEY, mode)
    return true
  }

  private make(mode: ControlMode): Controller {
    switch (mode) {
      case 'tilt':
        return new TiltController()
      case 'zones':
        return new TouchController(this.canvas, 'zones')
      case 'follow':
      default:
        return new TouchController(this.canvas, 'follow')
    }
  }

  destroy(): void {
    this.controller.destroy()
  }
}
