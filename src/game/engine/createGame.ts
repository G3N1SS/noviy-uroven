import { Application, Container, Text } from 'pixi.js'
import { balance } from '../config/balance'
import { createPlayer } from '../entities/player'
import { Spawner } from '../systems/spawner'
import { InputSystem } from '../systems/input'

export interface GameHandle {
  app: Application
  destroy: () => void
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

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

  const player = createPlayer()
  world.addChild(player.view)

  const spawner = new Spawner(world)
  const input = new InputSystem(app.canvas)

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
  }

  reset()

  const tick = () => {
    const w = app.screen.width
    const h = app.screen.height

    // 1) Ввод → горизонтальная скорость (следование за пальцем / клавиши)
    let targetX: number | null = null
    if (input.keyDir !== 0) targetX = player.x + input.keyDir * w
    else if (input.pointerX !== null) targetX = input.pointerX

    if (targetX !== null) {
      player.vx = clamp(
        (targetX - player.x) * balance.input.followFactor,
        -maxHorizontalSpeed,
        maxHorizontalSpeed,
      )
    } else {
      player.vx *= horizontalDamping
    }

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

  // DEV-хук для отладки и цикла тюнинга физики (в прод-сборку не попадает).
  if (import.meta.env.DEV) {
    Object.assign(globalThis, {
      __game: {
        app,
        player,
        spawner,
        input,
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
      },
    })
  }

  const destroy = () => {
    app.ticker.remove(tick)
    input.destroy()
    app.destroy(true, { children: true })
  }

  return { app, destroy }
}
