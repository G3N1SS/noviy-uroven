import type { Db } from './db'
import { getOrCreatePlayer, getProfile, type Profile } from './players'
import balanceJson from '../../src/game/config/balance.json'

/**
 * Обмен кристаллов на награду (Этап 6, конспект 4.6: «POST /api/rewards/redeem»).
 *
 * Цены — АВТОРИТЕТНО с сервера (из balance.json, единый источник правды): клиент не может
 * назначить свою цену. Списание атомарно и идемпотентно ОДНИМ SQL-запросом (CTE), без
 * мультистейтмент-транзакции — то же работает и на Neon HTTP:
 *  - `redemptionId` (UUID с клиента) — ключ идемпотентности: повтор не спишет второй раз
 *    (`ON CONFLICT DO NOTHING`).
 *  - Списываем только если хватает баланса (гвард в INSERT и в UPDATE) — не уходим в минус.
 *
 * NB: физическая доставка награды (ГБ на тариф) — Этап 7 (биллинг T2). Здесь — учёт баланса
 * и запись факта обмена; на Этапе 7 redemptions станут очередью на начисление.
 */

interface RewardDef {
  id: string
  title: string
  price: number
}

const REWARDS: Map<string, RewardDef> = new Map(
  balanceJson.economy.rewards.map((r) => [r.id, { id: r.id, title: r.title, price: r.price }]),
)

export function getReward(id: string): RewardDef | null {
  return REWARDS.get(id) ?? null
}

export type RedeemStatus = 'ok' | 'insufficient' | 'unknown_reward'

export interface RedeemResult {
  status: RedeemStatus
  profile: Profile
  reward?: RewardDef
}

export async function redeem(
  db: Db,
  playerId: string,
  rewardId: string,
  redemptionId: string,
): Promise<RedeemResult> {
  const reward = getReward(rewardId)
  if (!reward) {
    return { status: 'unknown_reward', profile: await getProfile(db, playerId) }
  }
  await getOrCreatePlayer(db, playerId)
  const now = Date.now()

  // Идемпотентная атомарная трата: запись факта обмена и списание — в одном CTE.
  // `upd` срабатывает, только если `ins` реально вставил новую запись (не дубль) и баланса
  // хватает. RETURNING из upd → списание состоялось.
  const rows = await db.query<{ id: string }>(
    `WITH ins AS (
        INSERT INTO redemptions (id, player_id, reward_id, cost, created_at)
        SELECT $1, $2, $3, $4, $5
          FROM players p
         WHERE p.id = $2 AND (p.crystals_earned - p.crystals_spent) >= $4
        ON CONFLICT (id) DO NOTHING
        RETURNING id
     ),
     upd AS (
        UPDATE players
           SET crystals_spent = crystals_spent + $4,
               crystals = crystals_earned - (crystals_spent + $4),
               updated_at = $5
         WHERE id = $2
           AND EXISTS (SELECT 1 FROM ins)
           AND (crystals_earned - crystals_spent) >= $4
        RETURNING id
     )
     SELECT id FROM upd`,
    [redemptionId, playerId, rewardId, reward.price, now],
  )

  const profile = await getProfile(db, playerId)
  if (rows.length === 1) return { status: 'ok', profile, reward }

  // 0 строк: либо идемпотентный повтор (запись уже была), либо не хватило баланса.
  const existed = await db.query(`SELECT 1 FROM redemptions WHERE id = $1`, [redemptionId])
  if (existed.length > 0) return { status: 'ok', profile, reward } // повтор — уже обменяно
  return { status: 'insufficient', profile, reward }
}
