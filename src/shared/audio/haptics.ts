import { getVibro } from '../storage/local'

/**
 * Хаптика (Этап 4, конспект: 10/30/80мс). Vibration API — Android/Chrome; iOS Safari
 * API не поддерживает (веб-вибрации у Apple нет вовсе) — там тихо no-op, это норма.
 *
 * Раскладка по силе (DoD «ничего не бесит на 10-й минуте»):
 *  - 10мс tap    — сбор кристалла (частый, еле ощутимый тик)
 *  - 30мс hit    — заметное событие: РРЛ-разрушение, помеха, бустер, спасение
 *  - 80мс heavy  — редкая драма: смерть, переход эпохи
 * Обычный прыжок НЕ вибрирует: 2-3 раза/сек задолбает и съест батарею.
 *
 * Синглтон, зеркалит audio: живой тумблер «Вибрация» в настройках → haptics.setEnabled().
 */
class Haptics {
  private on = getVibro()

  /** Живое переключение из настроек. */
  setEnabled(v: boolean): void {
    this.on = v
  }

  private buzz(ms: number): void {
    if (!this.on) return
    navigator.vibrate?.(ms)
  }

  /** 10мс — еле ощутимый тик (кристалл). */
  tap(): void {
    this.buzz(10)
  }

  /** 30мс — заметный толчок (РРЛ, помеха, бустер, спасение). */
  hit(): void {
    this.buzz(30)
  }

  /** 80мс — тяжёлое событие (смерть, переход эпохи). */
  heavy(): void {
    this.buzz(80)
  }
}

/** Единый экземпляр вибро на приложение. */
export const haptics = new Haptics()

if (import.meta.env.DEV) {
  ;(window as unknown as { __haptics: Haptics }).__haptics = haptics
}
