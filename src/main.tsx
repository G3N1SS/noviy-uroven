import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/800.css'
import '@fontsource/big-shoulders-stencil/700.css' // стенсил — счётчик высоты (фишка T2)
import { App } from './app/App'
import { installUiSounds } from './shared/audio/uiSounds'
import { initStorage } from './shared/storage/db'
import { startSync } from './shared/net/sync'
import { applyCachedConfig, refreshConfig } from './shared/net/config'
import { registerPwa } from './pwa/register'
import './index.css'

// OTA-баланс (Этап 6): синхронно применяем кэшированный оверрайд ДО рендера/createGame,
// иначе производные gravity/jumpVel возьмутся из встроенного balance.json.
applyCachedConfig()
installUiSounds()
// Поднять IndexedDB, запросить persistent storage и свести профиль с LS-зеркалом.
// Не блокирует рендер: игра читает горячее зеркало (localStorage) синхронно.
void initStorage()
// Синк с бэкендом (Этап 6): триггеры на старт/online/возврат вкладки. Офлайн-безопасно.
startSync()
// Свежий OTA-конфиг в кэш (подхватится при следующем запуске). Офлайн-безопасно.
void refreshConfig()
// Service worker: precache для офлайна + тост при новой версии (в dev — no-op).
registerPwa()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
