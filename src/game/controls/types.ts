export type ControlMode = 'tilt' | 'follow' | 'zones'

/**
 * Единый интерфейс управления. Контроллер на каждый кадр возвращает желаемую
 * горизонтальную скорость (px/frame), либо null — если ввода нет (тогда игровой
 * цикл применяет инерцию/затухание).
 */
export interface Controller {
  readonly mode: ControlMode
  update(playerX: number, screenW: number, maxSpeed: number): number | null
  /** Старт партии: калибровка нуля (для наклона) и т.п. */
  reset?(): void
  destroy(): void
}
