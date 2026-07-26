import { getDb } from './_lib/db.js'
import { getLeaderboard, type Period, type Scope } from './_lib/leaderboard.js'
import { json, query, requireMethod, withErrors } from './_lib/http.js'

/**
 * GET /api/leaderboard — топ-100 (конспект 4.6). Параметры:
 *   scope=global|city|friends (по умолч. global), period=week|all (week),
 *   playerId (для своей позиции), city, limit.
 * Короткий public-кэш: топ обновляется секундами, но не бьём в БД на каждый рендер.
 */
export default withErrors(async (req, res) => {
  if (!requireMethod(req, res, 'GET')) return
  const scope = (query(req, 'scope') as Scope) || 'global'
  const period = (query(req, 'period') as Period) || 'week'
  const playerId = query(req, 'playerId')
  const city = query(req, 'city')
  const limitRaw = Number(query(req, 'limit'))
  const db = await getDb()
  const result = await getLeaderboard(db, {
    scope,
    period,
    playerId,
    city,
    limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
  })
  res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=15')
  json(res, 200, result)
})
