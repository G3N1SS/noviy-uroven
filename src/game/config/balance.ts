import balanceJson from './balance.json'

// Единая типизированная точка доступа к балансу.
// ПРАВИЛО: все числа игры — только тут (в balance.json). Не хардкодить в логике.
export type Balance = typeof balanceJson
export const balance: Balance = balanceJson
