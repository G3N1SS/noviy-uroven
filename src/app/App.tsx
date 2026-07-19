import { GameCanvas } from '../game/engine/GameCanvas'

// React отвечает только за UI-оболочку и роутинг экранов.
// Игровой мир целиком рендерит PixiJS внутри GameCanvas — без re-render на кадр.
export function App() {
  return <GameCanvas />
}
