import { audio } from './audioManager'

/**
 * Звук нажатия кнопок UI (Этап 4). Один делегированный слушатель на документ вместо
 * onClick-обвязки в каждом экране: все контролы проекта — настоящие <button> (меню,
 * настройки, правила, магазин, лидерборд, онбординг, пауза, Game Over), поэтому
 * делегат покрывает их разом и автоматом подхватывает любые новые.
 *
 * Слушаем pointerdown в фазе ЗАХВАТА: отклик по нажатию (а не по отпусканию) ощущается
 * мгновенным, а capture не даст потерять звук, если экран остановит всплытие.
 *
 * Вариант звука выбирается по семантике кнопки:
 *   role="switch"  → uiToggle(целевое состояние)   — тумблеры настроек
 *   *__back / aria-label «Назад» / data-sfx="back" → uiBack()
 *   остальное      → uiTap()
 * Отписаться от звука точечно: data-sfx="none".
 *
 * Прим.: самый первый жест в сессии молчит — именно он разблокирует AudioContext
 * (автоплей-политика), и resume() резолвится уже после этого нажатия.
 */

type Variant = 'tap' | 'back' | 'toggle' | 'none'

function variantOf(el: HTMLElement): Variant {
  const explicit = el.dataset.sfx
  if (explicit === 'none' || explicit === 'tap' || explicit === 'back') return explicit
  if (el.getAttribute('role') === 'switch') return 'toggle'
  const back = /(^|[^a-z])back($|[^a-z])/i
  if (back.test(el.className) || el.getAttribute('aria-label') === 'Назад') return 'back'
  return 'tap'
}

function onPointerDown(e: PointerEvent): void {
  const target = e.target
  if (!(target instanceof Element)) return
  const btn = target.closest('button')
  if (!btn || btn.disabled) return

  switch (variantOf(btn)) {
    case 'none':
      return
    case 'toggle':
      // aria-checked ещё старое (нажатие его перевернёт) — озвучиваем состояние ПОСЛЕ клика.
      audio.uiToggle(btn.getAttribute('aria-checked') !== 'true')
      return
    case 'back':
      audio.uiBack()
      return
    default:
      audio.uiTap()
  }
}

/** Повесить звук нажатий на всё приложение. Идемпотентно (StrictMode монтит дважды). */
export function installUiSounds(): void {
  if (typeof document === 'undefined') return
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('pointerdown', onPointerDown, true)
}
