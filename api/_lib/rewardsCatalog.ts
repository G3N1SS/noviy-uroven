/**
 * Каталог наград — АВТОРИТЕТНЫЙ источник цен на сервере (Этап 6). Зеркалит
 * `src/game/config/balance.json` → `economy.rewards`, но живёт отдельным модулем: серверная
 * функция на Vercel — ESM, а импорт JSON из `src/` требует import-attributes и хрупок при
 * бандлинге. Цены — на сервере (клиент не может назначить свою). Держать в синхроне с balance.json
 * (на Этапе 7 витрина/биллинг T2 сделают это единым каналом).
 */
export interface RewardDef {
  id: string
  title: string
  price: number
}

export const REWARD_CATALOG: RewardDef[] = [
  { id: 'gb1', title: '1 ГБ на тариф', price: 500 },
  { id: 'gb10', title: '10 ГБ на тариф', price: 3000 },
  { id: 'disc20', title: 'Скидка 20% на тариф', price: 2500 },
  { id: 'mixx3', title: 'MiXX на 3 дня', price: 1500 },
  { id: 'mixx30', title: 'MiXX на месяц', price: 4000 },
  { id: 'safewall30', title: 'SafeWall на месяц', price: 2000 },
  { id: 'kaspersky', title: 'Kaspersky на 30 дней', price: 3500 },
  { id: 'kids', title: '«Где мои дети» на месяц', price: 3000 },
]
