/**
 * Проверка прод-пути Этапа 6 против реального Neon (драйвер @neondatabase/serverless, не pglite).
 * Гоняет полный цикл — схема, синк, anti-cheat, лидерборд, redeem, OTA — и УБИРАЕТ за собой
 * все тестовые данные (префикс __verify_), чтобы не засорять реальный лидерборд.
 *
 * Запуск: DATABASE_URL=… npx tsx scripts/verify-neon.ts
 */
import { getDb } from '../api/_lib/db'
import { syncSessions } from '../api/_lib/sessions'
import { getLeaderboard } from '../api/_lib/leaderboard'
import { redeem, getReward } from '../api/_lib/rewards'
import { getServerConfig, setServerConfig } from '../api/_lib/config'

const P = (s: string) => `__verify_${s}`

async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    throw new Error('нет DATABASE_URL — прогон против Neon невозможен')
  }
  const db = await getDb() // ensureSchema создаст таблицы в Neon (идемпотентно)
  const out: Record<string, unknown> = {}
  const now = Date.now()

  // 1) Синк честной партии + накрутки
  const honest = P('honest')
  const cheat = P('cheat')
  const s1 = await syncSessions(
    db,
    honest,
    [{ id: P('s1'), height: 850, crystals: 40, epoch: 2, boostersUsed: [], timestamp: now, durationMs: 42000, jumps: 60 }],
    { name: 'Проверка Neon' },
  )
  out.syncHonest = { best: s1.profile.bestHeight, earned: s1.profile.crystalsEarned, games: s1.profile.gamesPlayed, name: s1.profile.name }

  const s2 = await syncSessions(db, cheat, [
    { id: P('s2'), height: 100000, crystals: 9999, epoch: 5, boostersUsed: [], timestamp: now, durationMs: 4000, jumps: 3 },
  ])
  out.syncCheat = { best: s2.profile.bestHeight, earned: s2.profile.crystalsEarned } // ждём 0/0

  // 2) Дедуп: повтор того же батча не задваивает
  const s1again = await syncSessions(db, honest, [
    { id: P('s1'), height: 850, crystals: 40, epoch: 2, boostersUsed: [], timestamp: now, durationMs: 42000, jumps: 60 },
  ])
  out.dedup = { accepted: s1again.accepted.length, earned: s1again.profile.crystalsEarned } // 0 / 40

  // 3) Лидерборд: честный в топе, читер — нет
  const lb = await getLeaderboard(db, { period: 'all', playerId: honest })
  out.leaderboard = {
    honestIn: lb.entries.some((e) => e.playerId === honest),
    cheatIn: lb.entries.some((e) => e.playerId === cheat),
    myRank: lb.me?.rank,
  }

  // 4) Redeem: заработать и купить (идемпотентно)
  const buyer = P('buyer')
  await syncSessions(db, buyer, [
    { id: P('s3'), height: 900, crystals: 600, epoch: 2, boostersUsed: [], timestamp: now, durationMs: 60000, jumps: 90 },
  ])
  const gb1 = getReward('gb1')!
  const r1 = await redeem(db, buyer, 'gb1', P('rd1'))
  const r2 = await redeem(db, buyer, 'gb1', P('rd1')) // повтор
  out.redeem = { status: r1.status, spent: r1.profile.crystalsSpent, balance: r1.profile.crystals, price: gb1.price, replaySpent: r2.profile.crystalsSpent }

  // 5) OTA: задать оверрайд, прочитать, снять
  await setServerConfig(db, { jump: { heightPx: 777 } })
  const cfgSet = await getServerConfig(db)
  await setServerConfig(db, null)
  const cfgClear = await getServerConfig(db)
  out.ota = { set: cfgSet.balance, clearedNull: cfgClear.balance === null }

  // 6) ОЧИСТКА тестовых данных (иначе засорим реальный лидерборд)
  await db.query(`DELETE FROM redemptions WHERE player_id LIKE '__verify_%'`)
  await db.query(`DELETE FROM sessions WHERE player_id LIKE '__verify_%'`)
  await db.query(`DELETE FROM players WHERE id LIKE '__verify_%'`)
  const leftover = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM players WHERE id LIKE '__verify_%'`,
  )
  out.cleanup = { leftoverPlayers: Number(leftover[0].n) } // ждём 0

  console.log(JSON.stringify(out, null, 2))
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('FAIL:', e)
    process.exit(1)
  },
)
