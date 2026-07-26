import { getDb } from '../_lib/db'
import { redeem } from '../_lib/rewards'
import { body, json, requireMethod, withErrors } from '../_lib/http'

/**
 * POST /api/rewards/redeem — обмен кристаллов на награду (конспект 4.6).
 * Тело: { playerId, rewardId, redemptionId }. Ответ: { status, profile, reward }.
 * Идемпотентно по redemptionId: повтор не спишет дважды. Цена — с сервера.
 */
export default withErrors(async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return
  const b = body(req)
  const playerId = typeof b.playerId === 'string' ? b.playerId : ''
  const rewardId = typeof b.rewardId === 'string' ? b.rewardId : ''
  const redemptionId = typeof b.redemptionId === 'string' ? b.redemptionId : ''
  if (!playerId || !rewardId || !redemptionId) {
    json(res, 400, { error: 'playerId, rewardId, redemptionId required' })
    return
  }
  const db = await getDb()
  const result = await redeem(db, playerId, rewardId, redemptionId)
  res.setHeader('Cache-Control', 'no-store')
  json(res, result.status === 'ok' ? 200 : 409, result)
})
