import type { VercelRequest } from '@vercel/node'
import { getDb } from './_lib/db'
import { getServerConfig, setServerConfig } from './_lib/config'
import { body, json, requireMethod, withErrors } from './_lib/http'

/**
 * /api/config — OTA-конфиг баланса (конспект 4.6: «баланс меняется с сервера без релиза»).
 *   GET  — прочитать оверрайд (клиент кэширует и падёт на встроенный balance.json, если null).
 *   POST — задать/снять оверрайд (АДМИН). Тело: { balance } или { balance: null } (снять).
 *
 * Админ-гейт: в проде — Bearer-токен `ADMIN_TOKEN` (иначе админка выключена); локально
 * (pglite, без `DATABASE_URL`) — открыто, чтобы тюнить в dev.
 */
function adminOk(req: VercelRequest): boolean {
  if (!process.env.DATABASE_URL) return true // локальный dev — открыто
  const token = process.env.ADMIN_TOKEN
  if (!token) return false // прод без токена — админка выключена
  return req.headers['authorization'] === `Bearer ${token}`
}

export default withErrors(async (req, res) => {
  const db = await getDb()

  if (req.method === 'POST') {
    if (!adminOk(req)) {
      json(res, 403, { error: 'admin only' })
      return
    }
    const b = body(req)
    await setServerConfig(db, b.balance ?? null)
    res.setHeader('Cache-Control', 'no-store')
    json(res, 200, await getServerConfig(db))
    return
  }

  if (!requireMethod(req, res, 'GET')) return
  const config = await getServerConfig(db)
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60')
  json(res, 200, config)
})
