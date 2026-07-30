/**
 * ПОЛНЫЙ СБРОС игровых данных в проде (Neon): очищает `sessions` и `players` — рейтинг
 * пустеет, анонимные профили (UUID/ник/кошелёк/агрегаты) удаляются. Таблицу `config`
 * (OTA-баланс) НЕ трогает. Данные анонимные (нет персоналки), но операция НЕОБРАТИМА.
 *
 * Безопасность:
 *  - без `--yes` — сухой прогон: только показывает, сколько строк удалилось бы;
 *  - с `--yes` — реально удаляет (sessions → players, порядок по внешнему ключу).
 *
 * Запуск (на устройстве с доступом к Neon):
 *   сухой прогон:  DATABASE_URL="…" npx tsx scripts/wipe-prod.ts
 *   удаление:      DATABASE_URL="…" npx tsx scripts/wipe-prod.ts --yes
 */
import { getDb } from '../api/_lib/db'

async function count(db: Awaited<ReturnType<typeof getDb>>, table: string): Promise<number> {
  const rows = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`)
  return Number(rows[0].n)
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    throw new Error('нет DATABASE_URL — прогон против Neon невозможен')
  }
  const apply = process.argv.includes('--yes')
  const db = await getDb() // ensureSchema идемпотентна — таблицы точно есть

  const before = { sessions: await count(db, 'sessions'), players: await count(db, 'players') }
  console.log('Сейчас в проде:', before)

  if (!apply) {
    console.log('\nСУХОЙ ПРОГОН — ничего не удалено. Для реального сброса добавьте флаг --yes:')
    console.log('  DATABASE_URL="…" npx tsx scripts/wipe-prod.ts --yes')
    return
  }

  // Порядок важен: sessions.player_id → players(id) (внешний ключ), сначала sessions.
  await db.query('DELETE FROM sessions')
  await db.query('DELETE FROM players')

  const after = { sessions: await count(db, 'sessions'), players: await count(db, 'players') }
  console.log('После сброса:', after)
  console.log(after.sessions === 0 && after.players === 0 ? '\n✓ Прод обнулён.' : '\n⚠ Остались строки — проверьте.')
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('FAIL:', e)
    process.exit(1)
  },
)
