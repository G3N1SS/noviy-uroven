import { getDb } from '../_lib/db.js'
import { syncSessions } from '../_lib/sessions.js'
import { body, json, requireMethod, withErrors } from '../_lib/http.js'

/**
 * POST /api/sessions/sync — батч партий игрока с дедупликацией по UUID (конспект 4.6).
 * Тело: { playerId, sessions: GameSession[], city? }. Ответ: { profile, accepted }.
 * Идемпотентно: повторная отправка того же батча не задваивает кристаллы.
 */
export default withErrors(async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return
  const b = body(req)
  const playerId = typeof b.playerId === 'string' ? b.playerId : ''
  if (!playerId) {
    json(res, 400, { error: 'playerId required' })
    return
  }
  const sessions = Array.isArray(b.sessions) ? b.sessions : []
  const city = typeof b.city === 'string' ? b.city : undefined
  const name = typeof b.name === 'string' ? b.name : undefined
  const db = await getDb()
  const result = await syncSessions(db, playerId, sessions, { city, name })
  res.setHeader('Cache-Control', 'no-store')
  json(res, 200, result)
})
