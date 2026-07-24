import { create } from 'zustand'

/** Императивные ручки управления игрой (регистрирует GameCanvas, когда движок готов). */
export interface GameControls {
  /** Свежая партия: reset + запуск тикера. */
  start: () => void
  /** Уйти в меню: остановить тикер (игра замирает под оверлеем меню). */
  toMenu: () => void
}

export type Screen = 'menu' | 'playing'

interface UiState {
  screen: Screen
  /** true до первого старта игры → меню играет полную интро-хореографию (иначе лёгкий фейд). */
  firstMenu: boolean
  controls: GameControls | null
  registerGame: (c: GameControls) => void
  /** Меню → игра: стартуем свежую партию (мгновенно, без анимации). */
  play: () => void
  /** Прогруз, фаза 1: запускаем игру ПОД меню (экран ещё 'menu' → меню на месте для кросс-фейда). */
  beginGame: () => void
  /** Прогруз, фаза 2: размонтируем меню (игра уже видна за прозрачным фоном). */
  enterGame: () => void
  /** Пауза/Game Over → меню. */
  openMenu: () => void
}

/**
 * Роутер экранов (Zustand). React отвечает за оболочку и переходы экранов; игровой
 * мир — на канвасе. Мост React↔движок: GameCanvas регистрирует `controls`, а экраны
 * (меню, пауза, game over) дёргают play()/openMenu().
 */
export const useUi = create<UiState>((set, get) => ({
  screen: 'menu',
  firstMenu: true,
  controls: null,
  registerGame: (controls) => set({ controls }),
  play: () => {
    get().controls?.start()
    set({ screen: 'playing', firstMenu: false })
  },
  beginGame: () => {
    get().controls?.start()
    set({ firstMenu: false })
  },
  enterGame: () => set({ screen: 'playing' }),
  openMenu: () => {
    get().controls?.toMenu()
    set({ screen: 'menu' })
  },
}))

if (import.meta.env.DEV) (window as unknown as { __ui: typeof useUi }).__ui = useUi
