import { GameCanvas } from '../game/engine/GameCanvas'
import { MainMenu } from '../features/menu/MainMenu'
import { Onboarding } from '../features/onboarding/Onboarding'
import { Settings } from '../features/settings/Settings'
import { Rules } from '../features/rules/Rules'
import { Shop } from '../features/shop/Shop'
import { useUi } from '../shared/store/ui'

// React отвечает за оболочку и роутинг экранов. Игровой мир целиком рендерит PixiJS
// внутри GameCanvas (без re-render на кадр). Экраны (онбординг, меню, настройки) — DOM поверх.
export function App() {
  const screen = useUi((s) => s.screen)
  return (
    <>
      <GameCanvas />
      {screen === 'onboarding' && <Onboarding />}
      {screen === 'menu' && <MainMenu />}
      {screen === 'settings' && <Settings />}
      {screen === 'rules' && <Rules />}
      {screen === 'shop' && <Shop />}
    </>
  )
}
