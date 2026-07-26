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

  if (req.query.db) {
    const started = Date.now()
    try {
      const { getDb } = await import('./_lib/db.js')
      const db = await getDb()
      const rows = await db.query<{ one: number }>('SELECT 1 AS one')
      out.db = { ok: true, rows, ms: Date.now() - started }
    } catch (e) {
      out.db = {
        ok: false,
        ms: Date.now() - started,
        error: e instanceof Error ? (e.stack ?? e.message) : String(e),
      }
    }
  }

  res.status(200).json(out)
}
