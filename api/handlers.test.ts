import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMemoryDb, type Db } from './_lib/db'

/**
 * Смоук-тесты HTTP-слоя роут-хендлеров (Этап 6): guard метода, валидация входа, happy-path.
 * Содержательная логика покрыта в _lib/backend.test.ts — здесь только обвязка `api/*.ts`.
 * `getDb` замокан на изолированную in-memory БД, чтобы не писать на диск/в прод.
 */

let memDb: Db
vi.mock('./_lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_lib/db')>()
  return { ...actual, getDb: () => Promise.resolve(memDb) }
})

// Минимальные заглушки Vercel req/res.
function mockReq(method: string, opts: { query?: Record<string, string>; body?: unknown } = {}) {
  return { method, query: opts.query ?? {}, body: opts.body } as never
}
function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v
    },
  }
  return res
}

beforeEach(async () => {
  memDb = await createMemoryDb()
})

describe('GET /api/profile', () => {
  it('чужой метод → 405', async () => {
    const { default: handler } = await import('./profile')
    const res = mockRes()
    await handler(mockReq('DELETE'), res as never)
    expect(res.statusCode).toBe(405)
  })

  it('без playerId → 400', async () => {
    const { default: handler } = await import('./profile')
    const res = mockRes()
    await handler(mockReq('GET'), res as never)
    expect(res.statusCode).toBe(400)
  })

  it('POST меняет ник → 200 с новым именем', async () => {
    const { default: handler } = await import('./profile')
    const res = mockRes()
    await handler(
      mockReq('POST', { body: { playerId: 'nick-smoke-1', name: 'Радиоволк' } }),
      res as never,
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ id: 'nick-smoke-1', name: 'Радиоволк' })
  })

  it('POST с кривым ником → 400', async () => {
    const { default: handler } = await import('./profile')
    const res = mockRes()
    await handler(mockReq('POST', { body: { playerId: 'nick-smoke-2', name: 'a' } }), res as never)
    expect(res.statusCode).toBe(400)
  })

  it('happy-path → 200 и профиль с дефолтами', async () => {
    const { default: handler } = await import('./profile')
    const res = mockRes()
    await handler(mockReq('GET', { query: { playerId: 'smoke-id-4242' } }), res as never)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ id: 'smoke-id-4242', bestHeight: 0, crystals: 0 })
    expect(res.headers['Cache-Control']).toBe('no-store')
  })
})

describe('GET /api/config', () => {
  it('без оверрайда → 200 balance null', async () => {
    const { default: handler } = await import('./config')
    const res = mockRes()
    await handler(mockReq('GET'), res as never)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ balance: null, updatedAt: 0 })
  })
})
