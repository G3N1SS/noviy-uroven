import { create } from 'zustand'
import { hasChosenControl } from '../../game/controls/controlsManager'
import type { ControlMode } from '../../game/controls/types'

/** Императивные ручки управления игрой (регистрирует GameCanvas, когда движок готов). */
export interface GameControls {
  /** Свежая партия: reset + запуск тикера. */
  start: () => void
  /** Уйти в меню: остановить тикер (игра замирает под оверлеем меню). */
  toMenu: () => void
  /** Выбрать схему управления (промис false = iOS отклонил доступ к наклону). */
  setControl: (mode: ControlMode) => Promise<boolean>
  /** Текущая схема управления. */
  currentControl: () => ControlMode
}

export type Screen = 'onboarding' | 'menu' | 'settings' | 'playing'

interface UiState {
  screen: Screen
  /** Интро меню (полная хореография) проигрывается один раз; дальше — лёгкий фейд. */
  menuIntroDone: boolean
  controls: GameControls | null
  registerGame: (c: GameControls) => void
  markMenuIntroDone: () => void
  /** Онбординг: выбрать управление → в меню. Промис false = iOS отклонил доступ к наклону. */
  chooseControl: (mode: ControlMode) => Promise<boolean>
  /** Меню → игра: стартуем свежую партию (мгновенно, без анимации). */
  play: () => void
  /** Прогруз, фаза 1: запускаем игру ПОД меню (экран ещё 'menu' → меню на месте для кросс-фейда). */
  beginGame: () => void
  /** Прогруз, фаза 2: размонтируем меню (игра уже видна за прозрачным фоном). */
  enterGame: () => void
  /** Пауза/Game Over → меню. */
  openMenu: () => void
  /** Меню → настройки и обратно. */
  openSettings: () => void
  closeSettings: () => void
}

/**
 * Роутер экранов (Zustand). React отвечает за оболочку и переходы экранов; игровой
 * мир — на канвасе. Мост React↔движок: GameCanvas регистрирует `controls`, а экраны
 * (меню, пауза, game over) дёргают play()/openMenu().
 */
export const useUi = create<UiState>((set, get) => ({
  // Первый запуск без выбранного управления → сразу онбординг (ТЗ 3.5), иначе меню.
  screen: hasChosenControl() ? 'menu' : 'onboarding',
  menuIntroDone: false,
  controls: null,
  registerGame: (controls) => set({ controls }),
  markMenuIntroDone: () => set({ menuIntroDone: true }),
  chooseControl: async (mode) => {
    const ok = (await get().controls?.setControl(mode)) ?? false
    if (ok) set({ screen: 'menu' })
    return ok
  },
  play: () => {
    get().controls?.start()
    set({ screen: 'playing' })
  },
  beginGame: () => get().controls?.start(),
  enterGame: () => set({ screen: 'playing' }),
  openMenu: () => {
    get().controls?.toMenu()
    set({ screen: 'menu' })
  },
  openSettings: () => set({ screen: 'settings' }),
  closeSettings: () => set({ screen: 'menu' }),
}))

if (import.meta.env.DEV) (window as unknown as { __ui: typeof useUi }).__ui = useUi
