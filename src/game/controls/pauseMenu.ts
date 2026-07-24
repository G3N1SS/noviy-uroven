import './pauseMenu.css'
import type { ControlsManager } from './controlsManager'
import type { ControlMode } from './types'

interface PauseMenuOptions {
  controls: ControlsManager
  onPause: () => void
  onResume: () => void
  onRestart: () => void
  onMenu: () => void
}

/**
 * ВРЕМЕННЫЙ экран паузы (DOM, блок `pause` по БЭМ). По ТЗ (2.4 / 3.5-#4) выбор управления
 * живёт на паузе: кнопка «пауза» → блюр-оверлей с бенто-карточкой (Продолжить / Рестарт +
 * переключатель управления). Полноценный UI паузы по фирстилю T2 — Этап 3, тогда заменяем.
 *
 * Стили — в pauseMenu.css (block__element--modifier). Состояния (открыт / активная пилюля)
 * переключаются модификаторами-классами, не инлайном.
 */
export function createPauseMenu(opts: PauseMenuOptions): { destroy: () => void } {
  const { controls } = opts

  // --- Кнопка «Пауза» (две белые полосы, tap-target 44×44) ---
  const pauseBtn = document.createElement('button')
  pauseBtn.className = 'pause__toggle'
  pauseBtn.setAttribute('aria-label', 'Пауза')
  for (let i = 0; i < 2; i++) {
    const bar = document.createElement('span')
    bar.className = 'pause__bar'
    pauseBtn.appendChild(bar)
  }

  // --- Оверлей паузы ---
  const overlay = document.createElement('div')
  overlay.className = 'pause__overlay'

  const card = document.createElement('div')
  card.className = 'pause__card'
  overlay.appendChild(card)

  const title = document.createElement('div')
  title.className = 'pause__title'
  title.textContent = 'Пауза'
  card.appendChild(title)

  // Секция управления
  const ctrlLabel = document.createElement('div')
  ctrlLabel.className = 'pause__section-label'
  ctrlLabel.textContent = 'УПРАВЛЕНИЕ'
  card.appendChild(ctrlLabel)

  const pills = document.createElement('div')
  pills.className = 'pause__pills'
  card.appendChild(pills)

  const items: Array<[ControlMode, string]> = [
    ['tilt', 'Наклон'],
    ['follow', 'Свайп'],
    ['zones', 'Зоны'],
  ]
  const pillButtons: Array<[ControlMode, HTMLButtonElement, string]> = []

  const renderPills = () => {
    for (const [mode, btn, label] of pillButtons) {
      btn.textContent = label
      btn.classList.toggle('pause__pill--active', controls.current === mode)
    }
  }

  for (const [mode, label] of items) {
    const btn = document.createElement('button')
    btn.className = 'pause__pill'
    btn.addEventListener('click', async () => {
      const ok = await controls.setMode(mode)
      if (!ok) {
        btn.textContent = label + ' ✕' // разрешение на наклон отклонено (iOS)
        return
      }
      renderPills()
    })
    pills.appendChild(btn)
    pillButtons.push([mode, btn, label])
  }

  // Кнопки действий
  const resumeBtn = document.createElement('button')
  resumeBtn.className = 'pause__btn pause__btn--primary'
  resumeBtn.textContent = 'Продолжить'
  card.appendChild(resumeBtn)

  const restartBtn = document.createElement('button')
  restartBtn.className = 'pause__btn pause__btn--secondary'
  restartBtn.textContent = 'Рестарт'
  card.appendChild(restartBtn)

  const menuBtn = document.createElement('button')
  menuBtn.className = 'pause__btn pause__btn--secondary'
  menuBtn.textContent = 'В меню'
  card.appendChild(menuBtn)

  // --- Логика показа/скрытия (через модификаторы) ---
  const open = () => {
    renderPills()
    overlay.classList.add('pause__overlay--open')
    pauseBtn.classList.add('pause__toggle--hidden')
    opts.onPause()
  }
  const close = () => {
    overlay.classList.remove('pause__overlay--open')
    pauseBtn.classList.remove('pause__toggle--hidden')
    opts.onResume()
  }

  pauseBtn.addEventListener('click', open)
  resumeBtn.addEventListener('click', close)
  restartBtn.addEventListener('click', () => {
    opts.onRestart()
    close()
  })
  menuBtn.addEventListener('click', () => {
    // уходим в меню: НЕ возобновляем игру (тикер уже стоит), только прячем оверлей
    overlay.classList.remove('pause__overlay--open')
    pauseBtn.classList.remove('pause__toggle--hidden') // вернётся видимой, когда меню закроется
    opts.onMenu()
  })
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close() // тап по фону = продолжить
  })

  document.body.appendChild(pauseBtn)
  document.body.appendChild(overlay)

  return {
    destroy: () => {
      pauseBtn.remove()
      overlay.remove()
    },
  }
}
