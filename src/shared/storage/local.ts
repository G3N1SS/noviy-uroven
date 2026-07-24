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
const K_SOUND = 'novy-uroven:sound'
const K_MUSIC = 'novy-uroven:music'
const K_VIBRO = 'novy-uroven:vibro'
const K_SENS = 'novy-uroven:sens-' // + режим (tilt/follow/zones)

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

// --- Настройки (Этап 3). Тумблеры звука — задел под Этап 4 (аудио-слоя пока нет). ---

function readBool(key: string, def: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? def : raw === '1'
  } catch {
    return def
  }
}

function writeBool(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, v ? '1' : '0')
  } catch {
    /* private mode/квота — молча */
  }
}

export const getSound = (): boolean => readBool(K_SOUND, true)
export const setSound = (v: boolean): void => writeBool(K_SOUND, v)
export const getMusic = (): boolean => readBool(K_MUSIC, true)
export const setMusic = (v: boolean): void => writeBool(K_MUSIC, v)
export const getVibro = (): boolean => readBool(K_VIBRO, true)
export const setVibro = (v: boolean): void => writeBool(K_VIBRO, v)

/**
 * Чувствительность управления 0..1 (0 — спокойнее, 1 — резче), СВОЯ на каждый режим:
 * наклон — угол полной скорости, свайп — gain следования, зоны — множитель скорости.
 * По умолчанию 0.5. `mode` — 'tilt' | 'follow' | 'zones'.
 */
export function getControlSensitivity(mode: string): number {
  try {
    const raw = localStorage.getItem(K_SENS + mode)
    if (raw === null) return 0.5
    const n = Number(raw)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5
  } catch {
    return 0.5
  }
}

export function setControlSensitivity(mode: string, v: number): void {
  try {
    localStorage.setItem(K_SENS + mode, String(Math.min(1, Math.max(0, v))))
  } catch {
    /* молча */
  }
}
