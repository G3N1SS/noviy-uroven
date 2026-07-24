import { GameCanvas } from '../game/engine/GameCanvas'
import { MainMenu } from '../features/menu/MainMenu'
import { Onboarding } from '../features/onboarding/Onboarding'
import { useUi } from '../shared/store/ui'

// React отвечает за оболочку и роутинг экранов. Игровой мир целиком рендерит PixiJS
// внутри GameCanvas (без re-render на кадр). Экраны (онбординг, меню) — DOM-оверлеи поверх.
export function App() {
  const screen = useUi((s) => s.screen)
  return (
    <>
      <GameCanvas />
      {screen === 'onboarding' && <Onboarding />}
      {screen === 'menu' && <MainMenu />}
    </>
  )
}
