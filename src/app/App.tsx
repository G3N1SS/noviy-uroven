import { GameCanvas } from '../game/engine/GameCanvas'
import { MainMenu } from '../features/menu/MainMenu'
import { useUi } from '../shared/store/ui'

// React отвечает за оболочку и роутинг экранов. Игровой мир целиком рендерит PixiJS
// внутри GameCanvas (без re-render на кадр). Экраны (меню и т.д.) — DOM-оверлеи поверх.
export function App() {
  const screen = useUi((s) => s.screen)
  return (
    <>
      <GameCanvas />
      {screen === 'menu' && <MainMenu />}
    </>
  )
}
