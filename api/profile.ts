import { getDb } from './_lib/db'
import { getProfile, setPlayerName } from './_lib/players'
import { body, json, query, requireMethod, withErrors } from './_lib/http'

/**
 * /api/profile — профиль и баланс кристаллов (конспект 4.6).
 *  GET  ?playerId=…            — прочитать (новый анонимный id создаётся на лету).
 *  POST { playerId, name }     — сменить ник (валидация на сервере, 400 если кривой).
 * Регистрации нет — вход по T2 SSO на Этапе 7. Приватные данные — не кэшируем.
 */
export default withErrors(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'POST') {
    const b = body(req)
    const playerId = typeof b.playerId === 'string' ? b.playerId : ''
    if (!playerId) {
      json(res, 400, { error: 'playerId required' })
      return
    }
    const db = await getDb()
    const profile = await setPlayerName(db, playerId, b.name)
    if (!profile) {
      json(res, 400, { error: 'invalid name' })
      return
    }
    json(res, 200, profile)
    return
  }

  if (!requireMethod(req, res, 'GET')) return
  const playerId = query(req, 'playerId')
  if (!playerId) {
    json(res, 400, { error: 'playerId required' })
    return
  }
  const db = await getDb()
  const profile = await getProfile(db, playerId)
  json(res, 200, profile)
})
