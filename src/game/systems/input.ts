/**
 * Ввод для Этапа 1: тач/мышь в режиме «следование за пальцем» (вариант A конспекта 2.4).
 * Палец/курсор на экране → цель по X; персонаж плавно едет к ней (не телепорт).
 * Плюс клавиши ←/→ (A/D) как удобство для теста на десктопе.
 *
 * Акселерометр, зоны (вариант B) и переключатель управлений — следующий инкремент.
 */
export class InputSystem {
  /** Целевой X в координатах канваса, либо null если ввода нет. */
  pointerX: number | null = null
  /** Направление с клавиатуры: -1 влево, 1 вправо, 0 нет. */
  keyDir = 0

  private left = false
  private right = false
  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    canvas.addEventListener('pointerdown', this.onPointer)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  private clientToCanvasX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect()
    return clientX - rect.left
  }

  private onPointer = (e: PointerEvent) => {
    this.pointerX = this.clientToCanvasX(e.clientX)
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.pointerX === null) return // следуем только пока палец прижат
    this.pointerX = this.clientToCanvasX(e.clientX)
  }

  private onPointerUp = () => {
    this.pointerX = null
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.left = true
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.right = true
    this.updateKeyDir()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.left = false
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.right = false
    this.updateKeyDir()
  }

  private updateKeyDir() {
    this.keyDir = (this.right ? 1 : 0) - (this.left ? 1 : 0)
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this.onPointer)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }
}
