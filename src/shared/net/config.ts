import { applyBalanceOverride } from '../../game/config/balance'
import { fetchConfig } from './api'

/**
 * OTA-конфиг баланса на клиенте (Этап 6, конспект 4.6). Паттерн «применяется на следующем
 * запуске» — так избегаем смены физики посреди сессии и гонки с конструктором createGame:
 *
 *  1. На СТАРТЕ синхронно применяем последний кэшированный оверрайд из localStorage
 *     (`applyCachedConfig`) — ДО рендера и createGame. Первый заход без кэша → встроенный
 *     balance.json (честный фолбэк, в т.ч. офлайн).
 *  2. Асинхронно тянем свежий конфиг с сервера (`refreshConfig`) и кладём в кэш — он
 *     подхватится при следующем запуске.
 */

const K_OTA = 'novy-uroven:ota-balance'

/** Синхронно применить кэшированный оверрайд. Зовётся в main.tsx ДО createRoot. */
export function applyCachedConfig(): void {
  try {
    const raw = localStorage.getItem(K_OTA)
    if (!raw) return
    applyBalanceOverride(JSON.parse(raw))
  } catch {
    /* нет кэша / битый JSON — играем на встроенном балансе */
  }
}

/** Асинхронно обновить кэш с сервера (подхватится при следующем запуске). Офлайн-безопасно. */
export async function refreshConfig(): Promise<void> {
  try {
    const cfg = await fetchConfig()
    if (cfg.balance && typeof cfg.balance === 'object') {
      localStorage.setItem(K_OTA, JSON.stringify(cfg.balance))
    } else {
      localStorage.removeItem(K_OTA) // оверрайд сняли на сервере → вернёмся к встроенному
    }
  } catch {
    /* офлайн/бэкенд недоступен — оставляем прежний кэш */
  }
}
