/**
 * Anti-cheat: серверная валидация физической возможности партии (Этап 6, конспект 4.6).
 *
 * Полная реиграция физики на сервере (по сид + вводу) — неоправданно тяжела для PWA такого
 * масштаба. Вместо этого проверяем ЗАВЕДОМО НЕВОЗМОЖНОЕ по консервативным верхним границам,
 * выведенным из balance.json с большим запасом. Принцип: никогда не бить честного игрока —
 * границы много выше реальной игры, но ловят грубую накрутку (height=100000 за 5с).
 *
 * Границы (balance: heightPx=205, riseSec=0.37, pxPerMeter=10):
 *  - пик скорости прыжка jumpVel = 2·205/0.37 ≈ 1108 px/с ≈ 110 м/с. Быстрее по вертикали
 *    игрок не движется НИКОГДА → MAX_CLIMB_MPS=130 (запас). Реальный средний темп ~25 м/с.
 *  - один прыжок поднимает максимум на апекс; батут-спасение (×1.5) ≈ 46 м → MAX_M_PER_JUMP=60.
 *
 * Невалидная партия не роняет запрос: она пишется в журнал (аудит), но `valid=false` —
 * значит не идёт ни в лидерборд, ни в кошелёк (агрегаты считаются только по valid).
 */

export interface RunFacts {
  height: number
  crystals: number
  boostersUsed: string[]
  durationMs?: number
  jumps?: number
}

export interface Verdict {
  valid: boolean
  reasons: string[]
}

// Консервативные потолки (заведомо выше честной игры).
const MAX_CLIMB_MPS = 130 // пик подъёма ~110 м/с + запас
const MAX_M_PER_JUMP = 60 // апекс батута ~46 м + запас
const BASE_SLACK_M = 40 // стартовый пинок + округления
const MAX_SESSION_MS = 6 * 60 * 60 * 1000 // партия длиннее 6ч — подделка часов
const MAX_CRYSTAL_FACTOR = 3 // кристаллов не больше ~высота×3 (плотность спавна много ниже)
const MAX_CRYSTAL_BASE = 100
const MAX_BOOSTERS = 500

/**
 * Вердикт по партии. Если `durationMs`/`jumps` отсутствуют (старый клиент), физические
 * границы по этому измерению пропускаются — легаси не наказываем.
 */
export function validateRun(run: RunFacts): Verdict {
  const reasons: string[] = []
  const height = run.height
  const crystals = run.crystals

  if (height > 0) {
    if (run.durationMs != null && run.durationMs > 0) {
      const maxByTime = MAX_CLIMB_MPS * (run.durationMs / 1000) + BASE_SLACK_M
      if (height > maxByTime) reasons.push('climb-rate')
    }
    if (run.jumps != null && run.jumps >= 0) {
      const maxByJumps = run.jumps * MAX_M_PER_JUMP + BASE_SLACK_M
      if (height > maxByJumps) reasons.push('per-jump')
    }
  }
  if (run.durationMs != null && run.durationMs > MAX_SESSION_MS) reasons.push('duration')
  if (crystals > height * MAX_CRYSTAL_FACTOR + MAX_CRYSTAL_BASE) reasons.push('crystals')
  if (run.boostersUsed.length > MAX_BOOSTERS) reasons.push('boosters')

  return { valid: reasons.length === 0, reasons }
}

/** Rate-limit начислений: не больше стольких зачётных партий на игрока в минуту. */
export const RATE_MAX_PER_MIN = 60
