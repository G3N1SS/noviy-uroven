import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Диагностический пинг (Этап 6). НИЧЕГО не импортит в рантайме (типы стираются) и не трогает
 * БД — если и он крашится, проблема в рантайме/сборке функций, а не в нашем коде. Показывает,
 * видит ли функция строку подключения и в каком регионе крутится. Секреты не раскрывает —
 * только факт наличия.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasPostgresUrl: Boolean(process.env.POSTGRES_URL),
    vercel: Boolean(process.env.VERCEL),
    region: process.env.VERCEL_REGION ?? null,
    node: process.version,
  })
}
