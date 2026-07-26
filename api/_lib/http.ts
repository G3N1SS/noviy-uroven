import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Тонкая HTTP-обвязка для роут-хендлеров (Этап 6). Вся содержательная логика живёт
 * в репозиториях/чистых модулях (тестируется юнит-тестами против pglite), а `api/*.ts` —
 * только парсинг запроса, вызов логики и JSON-ответ. Ошибки не роняют функцию 500-кой
 * без тела — отдаём аккуратный `{ error }`.
 */

export type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void

/** Единая точка ответа JSON'ом с кодом. */
export function json(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body)
}

/** Guard метода: не тот глагол → 405. Возвращает true, если можно продолжать. */
export function requireMethod(req: VercelRequest, res: VercelResponse, method: string): boolean {
  if (req.method !== method) {
    json(res, 405, { error: `Method ${req.method} not allowed, use ${method}` })
    return false
  }
  return true
}

/** Тело запроса объектом (Vercel парсит JSON сам, но подстрахуемся от строки/пустого). */
export function body(req: VercelRequest): Record<string, unknown> {
  const b = req.body
  if (b == null) return {}
  if (typeof b === 'string') {
    try {
      return JSON.parse(b) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return b as Record<string, unknown>
}

/** Первое значение query-параметра (Vercel даёт string | string[]). */
export function query(req: VercelRequest, key: string): string | undefined {
  const v = req.query[key]
  return Array.isArray(v) ? v[0] : v
}

/** Обёртка: ловит исключения хендлера и отдаёт 500 с телом, а не голый краш функции. */
export function withErrors(handler: Handler): Handler {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'internal error'
      json(res, 500, { error: message })
    }
  }
}
