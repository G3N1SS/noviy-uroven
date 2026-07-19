import { Application, Container, Graphics } from 'pixi.js'
import { balance } from '../config/balance'

export interface GameHandle {
  app: Application
  destroy: () => void
}

/**
 * Этап 0 — фундамент рендера.
 * Поднимаем PixiJS Application, ticker и resize. На сцене — плейсхолдер «сигнала»
 * (маджента-сгусток со свечением), парящий в idle. Цель этапа: проверить, что
 * pipeline рендера и игровой цикл живут стабильно. Физику/прыжок вешаем на Этапе 1.
 */
export async function createGame(parent: HTMLElement): Promise<GameHandle> {
  const app = new Application()

  await app.init({
    background: '#000000',
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  })

  parent.appendChild(app.canvas)

  // Страховка: принудительно подгоняем рендер под окно сразу после монтирования
  // (resizeTo сам слушает window 'resize', но первый замер до layout бывает мимо).
  app.renderer.resize(window.innerWidth, window.innerHeight)

  // Игровой мир — отдельный контейнер (позже: камера двигает именно его).
  const world = new Container()
  app.stage.addChild(world)

  const player = createSignal()
  world.addChild(player)

  const centerPlayer = () => {
    player.x = app.screen.width / 2
    player.y = app.screen.height / 2
  }
  centerPlayer()

  // Игровой цикл. Пока — только idle-парение, чтобы видеть живой кадр.
  let t = 0
  const tick = () => {
    t += app.ticker.deltaMS / 1000
    player.x = app.screen.width / 2
    player.y =
      app.screen.height / 2 +
      Math.sin(t * balance.player.idleBobSpeed) * balance.player.idleBobAmplitude
  }
  app.ticker.add(tick)

  const destroy = () => {
    app.ticker.remove(tick)
    app.destroy(true, { children: true })
  }

  return { app, destroy }
}

/** Плейсхолдер персонажа-«сигнала»: ядро маджента + белая сердцевина + мягкое свечение. */
function createSignal(): Graphics {
  const r = balance.player.radius
  const g = new Graphics()
  g.circle(0, 0, r * 1.8).fill({ color: 0xff3495, alpha: 0.12 })
  g.circle(0, 0, r * 1.3).fill({ color: 0xff3495, alpha: 0.25 })
  g.circle(0, 0, r).fill({ color: 0xff3495 })
  g.circle(0, 0, r * 0.45).fill({ color: 0xffffff, alpha: 0.95 })
  return g
}
