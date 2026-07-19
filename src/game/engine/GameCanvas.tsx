import { useEffect, useRef } from 'react'
import { createGame, type GameHandle } from './createGame'

/**
 * React-обёртка над PixiJS. Монтирует канвас один раз, чистит при размонтировании.
 * Устойчива к двойному монтированию React.StrictMode: если init завершился уже
 * после отмены — сразу уничтожаем инстанс.
 */
export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let handle: GameHandle | null = null
    let cancelled = false

    createGame(el).then((h) => {
      if (cancelled) {
        h.destroy()
        return
      }
      handle = h
      if (import.meta.env.DEV) Reflect.set(globalThis, '__game', h.debug)
    })

    return () => {
      cancelled = true
      if (import.meta.env.DEV && handle && Reflect.get(globalThis, '__game') === handle.debug) {
        Reflect.deleteProperty(globalThis, '__game')
      }
      handle?.destroy()
      handle = null
    }
  }, [])

  return <div ref={containerRef} style={{ position: 'fixed', inset: 0 }} />
}
