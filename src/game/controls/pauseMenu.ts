import type { ControlsManager } from './controlsManager'
import type { ControlMode } from './types'

interface PauseMenuOptions {
  controls: ControlsManager
  onPause: () => void
  onResume: () => void
  onRestart: () => void
}

/**
 * ВРЕМЕННЫЙ экран паузы (DOM). По ТЗ (2.4 / 3.5-#4) выбор управления живёт на паузе:
 * кнопка «пауза» → блюр-оверлей с бенто-карточкой (Продолжить / Рестарт + переключатель
 * управления). Полноценный UI паузы по фирстилю T2 (звук, Меню) — Этап 3, тогда заменяем.
 *
 * Стиль по фирстилю: PRIMARY = маджента + чёрный текст, SECONDARY = прозрачная + белая
 * обводка 2px, карточка — бенто (surface-1, скругление 24px), без теней/градиентов.
 */
export function createPauseMenu(opts: PauseMenuOptions): { destroy: () => void } {
  const { controls } = opts

  // --- Кнопка «Пауза» (две белые полосы, tap-target 44×44) ---
  const pauseBtn = document.createElement('button')
  pauseBtn.setAttribute('aria-label', 'Пауза')
  pauseBtn.style.cssText =
    'position:fixed;top:10px;right:10px;width:44px;height:44px;border-radius:14px;' +
    'border:2px solid #fff;background:transparent;display:flex;align-items:center;' +
    'justify-content:center;gap:5px;cursor:pointer;z-index:15;-webkit-tap-highlight-color:transparent;'
  for (let i = 0; i < 2; i++) {
    const bar = document.createElement('span')
    bar.style.cssText = 'width:5px;height:16px;background:#fff;border-radius:2px;'
    pauseBtn.appendChild(bar)
  }

  // --- Оверлей паузы ---
  const overlay = document.createElement('div')
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:20;display:none;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
    "font-family:Manrope,system-ui,sans-serif;"

  const card = document.createElement('div')
  card.style.cssText =
    'width:min(360px,86vw);background:#0E0E0E;border:1px solid #1A1A1A;border-radius:24px;' +
    'padding:24px;display:flex;flex-direction:column;gap:18px;'
  overlay.appendChild(card)

  const title = document.createElement('div')
  title.textContent = 'Пауза'
  title.style.cssText = 'font-size:28px;font-weight:800;color:#fff;letter-spacing:0.5px;'
  card.appendChild(title)

  // Секция управления
  const ctrlLabel = document.createElement('div')
  ctrlLabel.textContent = 'УПРАВЛЕНИЕ'
  ctrlLabel.style.cssText =
    'font-size:12px;font-weight:800;color:#fff;opacity:0.5;letter-spacing:1.5px;'
  card.appendChild(ctrlLabel)

  const pills = document.createElement('div')
  pills.style.cssText = 'display:flex;gap:8px;'
  card.appendChild(pills)

  const items: Array<[ControlMode, string]> = [
    ['tilt', 'Наклон'],
    ['follow', 'Свайп'],
    ['zones', 'Зоны'],
  ]
  const pillButtons: Array<[ControlMode, HTMLButtonElement, string]> = []

  const renderPills = () => {
    for (const [mode, btn, label] of pillButtons) {
      const active = controls.current === mode
      btn.textContent = label
      btn.style.background = active ? '#FF3495' : 'transparent'
      btn.style.color = active ? '#000' : '#fff'
      btn.style.borderColor = active ? '#FF3495' : '#fff'
    }
  }

  for (const [mode, label] of items) {
    const btn = document.createElement('button')
    btn.style.cssText =
      'flex:1;padding:12px 8px;border-radius:16px;border:2px solid #fff;background:transparent;' +
      'color:#fff;font-weight:800;font-size:14px;cursor:pointer;-webkit-tap-highlight-color:transparent;'
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
  resumeBtn.textContent = 'Продолжить'
  resumeBtn.style.cssText =
    'padding:14px;border-radius:16px;border:none;background:#FF3495;color:#000;' +
    'font-weight:800;font-size:16px;cursor:pointer;-webkit-tap-highlight-color:transparent;'
  card.appendChild(resumeBtn)

  const restartBtn = document.createElement('button')
  restartBtn.textContent = 'Рестарт'
  restartBtn.style.cssText =
    'padding:14px;border-radius:16px;border:2px solid #fff;background:transparent;color:#fff;' +
    'font-weight:800;font-size:16px;cursor:pointer;-webkit-tap-highlight-color:transparent;'
  card.appendChild(restartBtn)

  // --- Логика показа/скрытия ---
  const open = () => {
    renderPills()
    overlay.style.display = 'flex'
    pauseBtn.style.display = 'none'
    opts.onPause()
  }
  const close = () => {
    overlay.style.display = 'none'
    pauseBtn.style.display = 'flex'
    opts.onResume()
  }

  pauseBtn.addEventListener('click', open)
  resumeBtn.addEventListener('click', close)
  restartBtn.addEventListener('click', () => {
    opts.onRestart()
    close()
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
