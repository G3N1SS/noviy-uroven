import balanceJson from './balance.json'

// Единая типизированная точка доступа к балансу.
// ПРАВИЛО: все числа игры — только тут (в balance.json). Не хардкодить в логике.
export type Balance = typeof balanceJson
export const balance: Balance = balanceJson

/**
 * OTA-оверрайд баланса (Этап 6, конспект 4.6: «баланс меняется с сервера без релиза»).
 * Глубоко сливает частичный конфиг с сервера в singleton `balance` — все потребители держат
 * ту же ссылку, поэтому изменение видно всем. Применяется на СТАРТЕ (до createGame читает
 * производные gravity/jumpVel), офлайн-фолбэк — на встроенный balance.json (пустой оверрайд).
 */
function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    const prev = target[key]
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      prev &&
      typeof prev === 'object' &&
      !Array.isArray(prev)
    ) {
      deepMerge(prev as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      target[key] = value
    }
  }
}

export function applyBalanceOverride(override: unknown): void {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return
  deepMerge(balance as unknown as Record<string, unknown>, override as Record<string, unknown>)
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__balance = balance
}
