import { SCHEMA_SQL } from './schema'

/**
 * Слой доступа к БД (Этап 6). Один интерфейс `Db` над двумя драйверами — тот же SQL,
 * что в проде выполняет Neon, в dev/тестах гоняет pglite (PostgreSQL в WASM, в процессе,
 * без сервера). Драйвер выбирается по наличию `DATABASE_URL`; загружается динамически,
 * чтобы прод-функция не тянула pglite, а локальные тесты — сетевой драйвер.
 *
 * Репозитории принимают `Db` параметром (инъекция зависимости, как RNG в PlatformPlanner) —
 * тесты крутят изолированную in-memory БД, роут-хендлеры дают общий синглтон `getDb()`.
 */

export type Row = Record<string, unknown>

export interface Db {
  /** Параметризованный запрос ($1,$2… — плейсхолдеры Postgres). Возвращает строки. */
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>
}

/** Прод-драйвер: Neon serverless (HTTP). Строку подключения даёт интеграция Vercel↔Neon. */
async function createNeonDb(url: string): Promise<Db> {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await sql.query(text, params)) as T[]
    },
  }
}

/** Dev/тест-драйвер: pglite. Возвращает `{ rows }`, нормализуем к массиву строк. */
async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  const pg = new PGlite(dataDir)
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const res = await pg.query<T>(text, params)
      return res.rows
    },
  }
}

/** Один раз на инстанс БД прогоняем DDL: `ensureSchema` идемпотентна (всё IF NOT EXISTS). */
const schemaReady = new WeakSet<Db>()
export async function ensureSchema(db: Db): Promise<void> {
  if (schemaReady.has(db)) return
  // И pglite, и Neon исполняют по ОДНОЙ команде на запрос (extended protocol / HTTP),
  // мультистейтмент в prepared statement запрещён — поэтому бьём схему на инструкции.
  // В DDL нет строк/тел функций с `;`, наивный split безопасен.
  for (const stmt of SCHEMA_SQL.split(';')) {
    const sql = stmt.trim()
    if (sql) await db.query(sql)
  }
  schemaReady.add(db)
}

let singleton: Promise<Db> | null = null

/**
 * Общий инстанс для роут-хендлеров. В проде — Neon по `DATABASE_URL`/`POSTGRES_URL`
 * (Neon-интеграция Vercel кладёт оба). Без строки подключения (локальный запуск функций)
 * — pglite на диск в `.pglite/`, чтобы данные переживали перезапуск dev-сервера.
 * Схема гарантирована до первого запроса.
 */
export function getDb(): Promise<Db> {
  if (!singleton) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
    singleton = (url ? createNeonDb(url) : createPgliteDb('.pglite')).then(async (db) => {
      await ensureSchema(db)
      return db
    })
  }
  return singleton
}

/** Свежая изолированная in-memory БД со схемой — для тестов (каждый файл свою). */
export async function createMemoryDb(): Promise<Db> {
  const db = await createPgliteDb() // без dataDir → memory://
  await ensureSchema(db)
  return db
}
