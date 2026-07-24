import { openDB, type IDBPDatabase, type DBSchema } from 'idb'
import { getBestHeight, setBestHeight, getCrystalTotal, setCrystalTotal } from './local'

/**
 * Долговременное хранилище (Этап 5, конспект 4.4). IndexedDB — источник правды:
 * журнал партий (`sessions`) + профиль (`profile`). Переживает закрытие вкладки,
 * перезагрузку телефона и недели офлайна; на Этапе 6 отсюда же уедет синк на бэкенд
 * (у каждой сессии свой UUID и флаг `synced` — дедупликация на сервере по id).
 *
 * Почему localStorage остаётся: игра читает кошелёк/рекорд СИНХРОННО (инициализация
 * createGame, рендер меню), а IndexedDB асинхронна. Поэтому LS работает горячим
 * зеркалом (мгновенное чтение, запись на каждый пикап), а IDB — ledger'ом. При старте
 * `initStorage()` сверяет обе стороны и выравнивает их по максимуму: LS мог уйти вперёд
 * (кристаллы пишутся в него по ходу партии), IDB — пережить очистку LS.
 *
 * Всё обёрнуто в try/catch и НИКОГДА не роняет игру: Safari private mode, отключённый
 * IDB, исчерпанная квота — деградируем до localStorage-only и играем дальше.
 */

/** Партия — одна запись журнала. `synced` = уехала ли на бэкенд (Этап 6). */
export interface GameSession {
  id: string
  height: number
  crystals: number
  epoch: number
  boostersUsed: string[]
  timestamp: number
  synced: boolean
}

/** Профиль игрока. Единственная запись с id='me'. */
export interface Profile {
  id: 'me'
  bestHeight: number
  totalCrystals: number
  crystalsSpent: number
  gamesPlayed: number
}

interface GameDb extends DBSchema {
  sessions: {
    key: string
    value: GameSession
    indexes: { 'by-timestamp': number }
  }
  profile: {
    key: string
    value: Profile
  }
}

const DB_NAME = 'novy-uroven'
const DB_VERSION = 1
const PROFILE_ID = 'me'
/** Потолок журнала: чистим самые старые синхронизированные партии, чтобы не пухнуть вечно. */
const SESSIONS_CAP = 500

const EMPTY_PROFILE: Profile = {
  id: PROFILE_ID,
  bestHeight: 0,
  totalCrystals: 0,
  crystalsSpent: 0,
  gamesPlayed: 0,
}

let dbPromise: Promise<IDBPDatabase<GameDb> | null> | null = null

/** Ленивое открытие БД. Ошибка (нет IDB / private mode) → null, дальше живём на localStorage. */
function getDb(): Promise<IDBPDatabase<GameDb> | null> {
  if (!dbPromise) {
    dbPromise =
      typeof indexedDB === 'undefined'
        ? Promise.resolve(null)
        : openDB<GameDb>(DB_NAME, DB_VERSION, {
            upgrade(db) {
              if (!db.objectStoreNames.contains('sessions')) {
                const s = db.createObjectStore('sessions', { keyPath: 'id' })
                // Индекс только по времени: boolean в IndexedDB — невалидный ключ, поэтому
                // несинхронизированные отбираем фильтром (журнал заведомо короткий, cap ниже).
                s.createIndex('by-timestamp', 'timestamp')
              }
              if (!db.objectStoreNames.contains('profile')) {
                db.createObjectStore('profile', { keyPath: 'id' })
              }
            },
          }).catch(() => null)
  }
  return dbPromise
}

/** UUID сессии. `crypto.randomUUID` есть не везде (старый Safari) — отсюда фолбэк. */
function uuid(): string {
  const c = globalThis.crypto
  if (c && 'randomUUID' in c) return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Попросить у браузера «постоянное» хранилище: без этого ОС вправе вычистить IDB при
 * нехватке места, а с ним прогресс переживает и неделю офлайна. Android/Chrome обычно
 * выдаёт молча (особенно установленной PWA), iOS — по своим эвристикам.
 */
async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Прочитать профиль из IDB (или пустой, если БД нет). */
export async function getProfile(): Promise<Profile> {
  try {
    const db = await getDb()
    if (!db) return { ...EMPTY_PROFILE }
    return (await db.get('profile', PROFILE_ID)) ?? { ...EMPTY_PROFILE }
  } catch {
    return { ...EMPTY_PROFILE }
  }
}

/**
 * Старт приложения: поднять БД, попросить persist и свести профиль с горячим зеркалом.
 * Правило слияния — как у синка (4.5): рекорд и кошелёк берём по максимуму, потерять
 * прогресс нельзя ни в какую сторону.
 */
export async function initStorage(): Promise<{ persisted: boolean; profile: Profile }> {
  const persisted = await requestPersistence()
  const stored = await getProfile()
  const merged: Profile = {
    ...stored,
    bestHeight: Math.max(stored.bestHeight, getBestHeight()),
    totalCrystals: Math.max(stored.totalCrystals, getCrystalTotal()),
  }
  // Зеркало вперёд: LS видит то, что уцелело в IDB (и наоборот).
  setBestHeight(merged.bestHeight)
  setCrystalTotal(merged.totalCrystals)
  await putProfile(merged)
  return { persisted, profile: merged }
}

async function putProfile(p: Profile): Promise<void> {
  try {
    const db = await getDb()
    await db?.put('profile', p)
  } catch {
    /* квота/private mode — молча, LS-зеркало всё ещё живо */
  }
}

/**
 * Записать партию на Game Over: строка в журнал + обновление профиля.
 * `walletTotal` — кошелёк после партии (он же истина по кристаллам: ×2 Гигабэка уже учтён).
 */
export async function recordSession(run: {
  height: number
  crystals: number
  epoch: number
  boostersUsed: string[]
  walletTotal: number
}): Promise<void> {
  const session: GameSession = {
    id: uuid(),
    height: run.height,
    crystals: run.crystals,
    epoch: run.epoch,
    boostersUsed: run.boostersUsed,
    timestamp: Date.now(),
    synced: false,
  }
  try {
    const db = await getDb()
    if (!db) return
    // Одна транзакция на запись партии и правку профиля: read-modify-write профиля вне
    // транзакции терял бы инкременты при двух близких Game Over (гонка «прочитал-записал»).
    const tx = db.transaction(['sessions', 'profile'], 'readwrite')
    const profiles = tx.objectStore('profile')
    const prev = (await profiles.get(PROFILE_ID)) ?? { ...EMPTY_PROFILE }
    await Promise.all([
      tx.objectStore('sessions').add(session),
      profiles.put({
        ...prev,
        bestHeight: Math.max(prev.bestHeight, run.height),
        totalCrystals: Math.max(prev.totalCrystals, run.walletTotal),
        gamesPlayed: prev.gamesPlayed + 1,
      }),
      tx.done,
    ])
    await pruneSessions(db)
  } catch {
    /* журнал — не критичный путь: рекорд и кошелёк уже в LS-зеркале */
  }
}

/** Партии, ещё не уехавшие на бэкенд (Этап 6: синк по связи, дедуп по id). */
export async function getUnsyncedSessions(): Promise<GameSession[]> {
  try {
    const db = await getDb()
    if (!db) return []
    const all = await db.getAllFromIndex('sessions', 'by-timestamp')
    return all.filter((s) => !s.synced)
  } catch {
    return []
  }
}

/** Обрезать журнал до SESSIONS_CAP, выкидывая самые старые УЖЕ синхронизированные партии. */
async function pruneSessions(db: IDBPDatabase<GameDb>): Promise<void> {
  const count = await db.count('sessions')
  if (count <= SESSIONS_CAP) return
  const oldest = await db.getAllFromIndex('sessions', 'by-timestamp')
  let excess = count - SESSIONS_CAP
  for (const s of oldest) {
    if (excess <= 0) break
    if (!s.synced) continue // несинхронизированное не теряем — оно ещё нужно бэкенду
    await db.delete('sessions', s.id)
    excess--
  }
}

if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>
  w.__db = { getProfile, getUnsyncedSessions, recordSession, initStorage }
}
