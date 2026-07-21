/**
 * Локальное хранилище (localStorage) — минимум, переживающий перезагрузку/офлайн.
 * По конспекту (4.4) полноценный слой профиля/сессий живёт в IndexedDB и синкается
 * с бэкендом — это Этап 5/6. Здесь только «лёгкий» кошелёк и рекорд, чтобы игрок
 * видел прогресс уже сейчас.
 *
 * Все ключи в едином неймспейсе `novy-uroven:*`. Отсутствующие/повреждённые значения
 * трактуем как «нуля не было». Все операции обёрнуты в try/catch — не роняем игру,
 * если LS недоступен (Safari private mode, квота, iframe без storage-permission).
 */

const K_BEST = 'novy-uroven:best-height'
const K_CRYSTAL = 'novy-uroven:crystal-total'

function readNumber(key: string): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return 0
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(Math.max(0, Math.floor(value))))
  } catch {
    // квота/private mode — молча. Рекорд можно потерять, игра не роняется.
  }
}

export function getBestHeight(): number {
  return readNumber(K_BEST)
}

export function setBestHeight(meters: number): void {
  writeNumber(K_BEST, meters)
}

export function getCrystalTotal(): number {
  return readNumber(K_CRYSTAL)
}

export function setCrystalTotal(n: number): void {
  writeNumber(K_CRYSTAL, n)
}
