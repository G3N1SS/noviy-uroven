import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Dev-only Vite-плагин (Этап 6): поднимает те же `/api`-хендлеры локально, чтобы синк
 * работал в `npm run dev` (и на телефоне по LAN) БЕЗ прод-БД — драйвер БД сам падает
 * на pglite (Postgres в WASM) при отсутствии `DATABASE_URL`. Никакого дублирования
 * логики: хендлеры грузятся `ssrLoadModule` (та же TS, что уедет на Vercel), только
 * адаптируем Node req/res к сигнатуре Vercel-функции.
 *
 * В прод не попадает (`apply: 'serve'`): там `/api/*` — настоящие serverless-функции.
 */

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve(undefined)
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve(undefined)
      }
    })
    req.on('error', () => resolve(undefined))
  })
}

/** Обёртка Node-ответа под интерфейс VercelResponse, которым пользуются хендлеры. */
function adaptRes(res: ServerResponse): unknown {
  let status = 200
  return {
    status(code: number) {
      status = code
      return this
    },
    json(payload: unknown) {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(payload))
    },
    setHeader(k: string, v: string) {
      res.setHeader(k, v)
    },
  }
}

export function viteDevApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/')) return next()
        void (async () => {
          const [path, qs = ''] = url.split('?')
          try {
            const mod = await server.ssrLoadModule(`${path}.ts`)
            const handler = mod.default as (rq: unknown, rs: unknown) => Promise<void> | void
            const query = Object.fromEntries(new URLSearchParams(qs))
            const method = req.method ?? 'GET'
            const body = method === 'POST' || method === 'PUT' ? await readJsonBody(req) : undefined
            await handler({ method, query, body }, adaptRes(res))
          } catch (e) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'dev-api error' }))
          }
        })()
      })
    },
  }
}
