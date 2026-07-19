import type { ControlsManager } from './controlsManager'
import type { ControlMode } from './types'

/**
 * ВРЕМЕННЫЙ переключатель управления (DOM), чтобы тестить наклон/свайп/зоны
 * на телефоне уже на Этапе 1. Полноценный UI (пауза, настройки, онбординг)
 * по фирстилю T2 — Этап 3, тогда это удаляем.
 *
 * Кнопки-пилюли: активная = маджента + чёрный текст (PRIMARY T2),
 * неактивная = прозрачная + белая обводка (SECONDARY T2).
 */
export function createControlSwitch(manager: ControlsManager): { destroy: () => void } {
  const bar = document.createElement('div')
  bar.style.cssText =
    'position:fixed;top:10px;right:10px;display:flex;gap:6px;z-index:10;' +
    "font-family:Manrope,system-ui,sans-serif;"

  const items: Array<[ControlMode, string]> = [
    ['tilt', 'Наклон'],
    ['follow', 'Свайп'],
    ['zones', 'Зоны'],
  ]

  const buttons: Array<[ControlMode, HTMLButtonElement, string]> = []

  const render = () => {
    for (const [mode, btn, label] of buttons) {
      const active = manager.current === mode
      btn.textContent = label
      btn.style.background = active ? '#FF3495' : 'transparent'
      btn.style.color = active ? '#000' : '#fff'
      btn.style.borderColor = active ? '#FF3495' : '#fff'
    }
  }

  for (const [mode, label] of items) {
    const btn = document.createElement('button')
    btn.style.cssText =
      'padding:8px 12px;border-radius:16px;border:2px solid #fff;background:transparent;' +
      'color:#fff;font-weight:800;font-size:13px;cursor:pointer;-webkit-tap-highlight-color:transparent;'
    btn.addEventListener('click', async () => {
      const ok = await manager.setMode(mode)
      if (!ok) {
        btn.textContent = label + ' ✕' // разрешение на наклон отклонено (iOS)
        return
      }
      render()
    })
    bar.appendChild(btn)
    buttons.push([mode, btn, label])
  }

  render()
  document.body.appendChild(bar)

  return { destroy: () => bar.remove() }
}
