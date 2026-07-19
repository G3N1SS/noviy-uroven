import { Application, Container, Text } from 'pixi.js'
import { balance } from '../config/balance'
import { createPlayer } from '../entities/player'
import { Spawner } from '../systems/spawner'
import { ControlsManager } from '../controls/controlsManager'
import { createPauseMenu } from '../controls/pauseMenu'

export interface GameHandle {
  app: Application
  destroy: () => void
  /** DEV-объект для отладки/тюнинга. GameCanvas вешает его на window.__game (только живой инстанс). */
  debug: unknown
}

/**
 * Этап 1 — ядро прыжка. Чистая математика (без Matter.js):
 * гравитация, one-way платформы (velocity.y > 0 + AABB), автопрыжок, wrap,
 * камера только вверх, простая генерация, смерть/рестарт, счётчик высоты.
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
  app.renderer.resize(window.innerWidth, window.innerHeight)

  // Мир двигает камера (только по вертикали). HUD — отдельно, поверх, не двигается.
  const world = new Container()
  app.stage.addChild(world)

  // Слой платформ — ПОД игроком. Игрок добавляется в world после слоя,
  // поэтому «сигнал» всегда рисуется поверх любых платформ (сколько бы их ни доспавнилось).
  const platformLayer = new Container()
  world.addChild(platformLayer)

  const player = createPlayer()
  world.addChild(player.view)

  const spawner = new Spawner(platformLayer)
  const controls = new ControlsManager(app.canvas)
  // Меню паузы (по ТЗ выбор управления живёт на паузе). reset() — hoisted-функция ниже.
  const pauseMenu = createPauseMenu({
    controls,
    onPause: () => app.ticker.stop(),
    onResume: () => app.ticker.start(),
    onRestart: () => {
      reset()
      app.ticker.start()
    },
  })

  // Клавиши ←/→ (A/D) — удобство для теста на десктопе, поверх выбранной схемы.
  const keys = { left: false, right: false }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  const hud = new Text({
    text: '0 m',
    style: { fill: 0xffffff, fontFamily: 'Manrope, sans-serif', fontSize: 34, fontWeight: '800' },
  })
  hud.x = 16
  hud.y = 12
  app.stage.addChild(hud)

  // --- состояние партии ---
  let cameraOffset = 0
  let minY = 0 // самая большая высота (наименьший y) за партию — для счёта

  const { radius: r } = balance.player
  const { gravity, jumpImpulse, maxHorizontalSpeed, horizontalDamping } = balance.physics

  function reset() {
    const w = app.screen.width
    const h = app.screen.height
    player.x = w / 2
    player.y = 0
    player.prevY = 0
    player.vx = 0
    player.vy = jumpImpulse // стартовый «пинок» вверх, чтобы сразу было живо
    cameraOffset = h * balance.camera.followRatio
    minY = 0
    spawner.reset(balance.start.platformOffsetY, w)
    controls.reset() // калибровка нуля наклона на старте партии
  }

  reset()

  const tick = () => {
    const w = app.screen.width
    const h = app.screen.height

    // 1) Ввод → горизонтальная скорость. Приоритет: клавиши (dev) → активная схема.
    //    null от контроллера = ввода нет → применяем инерцию/затухание.
    const keyDir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
    let vx: number | null = keyDir !== 0 ? keyDir * maxHorizontalSpeed : null
    if (vx === null) vx = controls.update(player.x, w, maxHorizontalSpeed)
    if (vx === null) player.vx *= horizontalDamping
    else player.vx = vx

    // 2) Интегрирование
    player.prevY = player.y
    player.vy += gravity
    player.x += player.vx
    player.y += player.vy

    // 3) Горизонтальный wrap
    if (player.x < -r) player.x = w + r
    else if (player.x > w + r) player.x = -r

    // 4) One-way коллизия: только при падении и только сверху
    if (player.vy > 0) {
      const prevBottom = player.prevY + r
      const currBottom = player.y + r
      for (const p of spawner.platforms) {
        const top = p.y
        const crossedTop = prevBottom <= top && currBottom >= top
        const withinX = Math.abs(player.x - p.x) <= p.width / 2 + r * 0.4
        if (crossedTop && withinX) {
          player.y = top - r
          player.vy = jumpImpulse // автопрыжок
          break
        }
      }
    }

    // 5) Камера — только вверх
    const targetOffset = h * balance.camera.followRatio - player.y
    if (targetOffset > cameraOffset) cameraOffset = targetOffset
    world.y = cameraOffset

    // 6) Генерация/чистка
    spawner.update(cameraOffset, w, h)

    // 7) Счёт (высота в метрах)
    if (player.y < minY) minY = player.y
    hud.text = `${Math.floor(-minY / balance.score.pxPerMeter)} m`

    // 8) Смерть: ушёл за нижний край → рестарт (камера вниз не едет)
    if (player.y + cameraOffset > h + r) reset()

    // 9) Синхронизация вью
    player.view.x = player.x
    player.view.y = player.y
  }

  app.ticker.add(tick)

  // DEV-объект для отладки/тюнинга. На window.__game его вешает GameCanvas — и только
  // для живого инстанса (StrictMode монтирует дважды и один инстанс уничтожается).
  const debug = {
    app,
    player,
    spawner,
    controls,
    keys,
    state: () => ({
      x: Math.round(player.x),
      y: Math.round(player.y),
      vy: Math.round(player.vy * 100) / 100,
      cameraOffset: Math.round(cameraOffset),
      platforms: spawner.platforms.length,
      height: Math.floor(-minY / balance.score.pxPerMeter),
    }),
    pause: () => app.ticker.stop(),
    resume: () => app.ticker.start(),
    /** Прогнать N игровых кадров вручную (для проверки логики без rAF). */
    step: (n = 1) => {
      for (let i = 0; i < n; i++) tick()
    },
  }

  const destroy = () => {
    app.ticker.remove(tick)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    controls.destroy()
    pauseMenu.destroy()
    app.destroy(true, { children: true })
  }

  return { app, destroy, debug }
}
