import { useEffect, useRef } from 'react'
import { createGame, type GameHandle } from './createGame'
import { useUi } from '../../shared/store/ui'

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

    createGame(el, { onMenu: () => useUi.getState().openMenu() }).then((h) => {
      if (cancelled) {
        h.destroy()
        return
      }
      handle = h
      // Мост React↔движок: экраны дёргают start()/toMenu() через стор.
      useUi.getState().registerGame({ start: h.start, toMenu: h.toMenu })
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

  return <div ref={containerRef} className="game-canvas" />
}
