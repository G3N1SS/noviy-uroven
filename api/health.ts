import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Диагностический пинг (Этап 6). Без `?db=1` — ничего не импортит в рантайме и не трогает БД.
 * С `?db=1` — динамически поднимает БД и делает пробный запрос в try/catch, возвращая стек
 * ошибки JSON'ом. Если и это крашится (FUNCTION_INVOCATION_FAILED) — значит зависание/таймаут,
 * а не обычное исключение. Секреты не раскрывает.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const out: Record<string, unknown> = {
    ok: true,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasPostgresUrl: Boolean(process.env.POSTGRES_URL),
    vercel: Boolean(process.env.VERCEL),
    region: process.env.VERCEL_REGION ?? null,
    node: process.version,
  }

  // Чек связи с БД: возвращаем только ok/ms — без стека (не светим внутренние пути наружу).
  if (req.query.db) {
    const started = Date.now()
    try {
      const { getDb } = await import('./_lib/db.js')
      const db = await getDb()
      await db.query('SELECT 1 AS one')
      out.db = { ok: true, ms: Date.now() - started }
    } catch {
      out.db = { ok: false, ms: Date.now() - started }
    }
  }

  res.status(200).json(out)
}
