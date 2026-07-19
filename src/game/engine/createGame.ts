import { Application, Container, Graphics, Text } from 'pixi.js'
import { balance } from '../config/balance'
import { createPlayer } from '../entities/player'
import { Spawner } from '../systems/spawner'
import { CrystalManager } from '../systems/crystals'
import { ObstacleManager } from '../systems/obstacles'
import { EpochManager } from '../systems/epochs'
import { drawCrystal } from '../entities/crystal'
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

  // Кристаллы и помехи — над платформами, под игроком.
  const crystalLayer = new Container()
  world.addChild(crystalLayer)
  const obstacleLayer = new Container()
  world.addChild(obstacleLayer)

  const player = createPlayer()
  world.addChild(player.view)

  const spawner = new Spawner(platformLayer)
  const crystals = new CrystalManager(crystalLayer)
  const obstacles = new ObstacleManager(obstacleLayer)
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

  // Счётчик кристаллов справа-сверху (ромб-иконка + число). Число right-anchored.
  const crystalIcon = new Graphics()
  drawCrystal({ view: crystalIcon, x: 0, y: 0, value: 0, radius: 10, active: true }, false)
  const crystalHud = new Text({
    text: '0',
    style: { fill: 0xffffff, fontFamily: 'Manrope, sans-serif', fontSize: 30, fontWeight: '800' },
  })
  crystalHud.anchor.set(1, 0)
  app.stage.addChild(crystalIcon, crystalHud)

  // Баннер перехода эпохи (по центру сверху), дерзким тоном. Скрыт по умолчанию.
  const banner = new Text({
    text: '',
    style: {
      fill: 0xffffff,
      fontFamily: 'Manrope, sans-serif',
      fontSize: 26,
      fontWeight: '800',
      align: 'center',
      wordWrap: true,
      wordWrapWidth: 320,
    },
  })
  banner.anchor.set(0.5)
  banner.visible = false
  app.stage.addChild(banner)
  const epochs = new EpochManager(app, banner)

  // --- состояние партии ---
  let cameraOffset = 0
  let minY = 0 // самая большая высота (наименьший y) за партию — для счёта
  let crystalTotal = 0 // кошелёк: НЕ обнуляется при смерти (кристаллы сохраняются)
  let controlLockSec = 0 // потеря управления после помехи (сек)

  const { radius: r } = balance.player
  const { maxHorizontalSpeed, horizontalDampingPerSec } = balance.physics

  // Физика в реальном времени: скорости px/сек, ускорение px/сек². Симуляция фиксированным
  // шагом dtSec — поэтому скорость игры не зависит НИ от FPS экрана, НИ от simHz.
  // Два независимых рычага: высота прыжка (heightPx) и темп (riseSec — время до апекса).
  const dtSec = 1 / balance.loop.simHz
  const gravity = (2 * balance.jump.heightPx) / (balance.jump.riseSec * balance.jump.riseSec)
  const jumpVel = (2 * balance.jump.heightPx) / balance.jump.riseSec // величина импульса вверх, px/сек
  const dampingStep = Math.pow(horizontalDampingPerSec, dtSec)

  function reset() {
    const w = app.screen.width
    const h = app.screen.height
    player.x = w / 2
    player.y = 0
    player.prevY = 0
    player.vx = 0
    player.vy = -jumpVel // стартовый «пинок» вверх (px/сек)
    cameraOffset = h * balance.camera.followRatio
    minY = 0
    spawner.reset(balance.start.platformOffsetY, w)
    crystals.reset(balance.start.platformOffsetY) // кошелёк crystalTotal НЕ трогаем
    obstacles.reset(balance.start.platformOffsetY)
    epochs.reset() // фон вернётся к эпохе 1 на первом апдейте
    controlLockSec = 0
    controls.reset() // калибровка нуля наклона на старте партии
  }

  reset()

  // Один фиксированный шаг симуляции (1/60 c). Все прибавки скорости — «на шаг»,
  // поэтому скорость игры одинакова при любом FPS экрана (см. frame ниже).
  const simulate = () => {
    const w = app.screen.width
    const h = app.screen.height

    // 1) Ввод → горизонтальная скорость. Приоритет: клавиши (dev) → активная схема.
    //    null от контроллера = ввода нет → инерция. При потере контроля (помеха) — только инерция.
    if (controlLockSec > 0) {
      controlLockSec -= dtSec
      player.vx *= dampingStep
    } else {
      const keyDir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
      let vx: number | null = keyDir !== 0 ? keyDir * maxHorizontalSpeed : null
      if (vx === null) vx = controls.update(player.x, w, maxHorizontalSpeed)
      if (vx === null) player.vx *= dampingStep
      else player.vx = vx
    }

    // 2) Интегрирование (semi-implicit Euler в реальном времени)
    player.prevY = player.y
    player.vy += gravity * dtSec
    player.x += player.vx * dtSec
    player.y += player.vy * dtSec

    // 3) Горизонтальный wrap
    if (player.x < -r) player.x = w + r
    else if (player.x > w + r) player.x = -r

    // 4) One-way коллизия: только при падении и только сверху
    if (player.vy > 0) {
      const prevBottom = player.prevY + r
      const currBottom = player.y + r
      for (const p of spawner.platforms) {
        if (!p.active) continue
        const top = p.y
        const crossedTop = prevBottom <= top && currBottom >= top
        const withinX = Math.abs(player.x - p.x) <= p.width / 2 + r * 0.4
        if (crossedTop && withinX) {
          if (p.type === 'fake') {
            // фейк-платформа: растворяется без отскока — проваливаемся дальше
            p.active = false
            p.view.visible = false
            continue
          }
          player.y = top - r
          player.vy = -jumpVel // автопрыжок
          if (p.type === 'rrl' && p.collapseTimer < 0) {
            p.collapseTimer = balance.platforms.types.rrl.collapseMs / 1000 // старт разрушения
          }
          break
        }
      }
    }

    // 4b) Помеха: касание = отброс вниз + потеря контроля (не убивает напрямую)
    if (obstacles.hit(player.x, player.y, r)) {
      player.vy = balance.obstacles.interference.knockbackVy
      controlLockSec = balance.obstacles.interference.controlLockSec
    }

    // 5) Камера — только вверх
    const targetOffset = h * balance.camera.followRatio - player.y
    if (targetOffset > cameraOffset) cameraOffset = targetOffset
    world.y = cameraOffset

    // 6) Генерация/чистка платформ + кристаллов + помех
    spawner.update(cameraOffset, w, h, dtSec)
    crystals.update(cameraOffset, w, h)
    obstacles.update(cameraOffset, w, h)

    // 7) Сбор кристаллов пролётом
    const got = crystals.collect(player.x, player.y, r)
    if (got > 0) {
      crystalTotal += got
      crystalHud.text = `${crystalTotal}`
    }

    // 8) Счёт (высота в метрах)
    if (player.y < minY) minY = player.y
    const heightMeters = -minY / balance.score.pxPerMeter
    hud.text = `${Math.floor(heightMeters)} m`

    // 8b) Эпохи: смена фона + баннер перехода по высоте
    epochs.update(heightMeters, dtSec)

    // 9) HUD-позиции: кристаллы справа-сверху, баннер по центру
    crystalHud.x = w - 16
    crystalHud.y = 12
    crystalIcon.x = w - 16 - crystalHud.width - 14
    crystalIcon.y = 26
    banner.x = w / 2
    banner.y = h * 0.26

    // 10) Смерть: ушёл за нижний край → рестарт (камера вниз не едет)
    if (player.y + cameraOffset > h + r) reset()

    // 11) Синхронизация вью
    player.view.x = player.x
    player.view.y = player.y
  }

  // Фиксированный шаг симуляции (частота — balance.loop.simHz). Копим реальное время
  // и прогоняем simulate() ровно по 1/simHz c, поэтому скорость игры не зависит от FPS
  // экрана. Частота задаёт и темп: 90 Гц = в 1.5× быстрее 60 Гц при той же высоте прыжка.
  // MAX_STEPS — защита от «спирали смерти» при больших лагах (просадка/возврат из фона).
  const FIXED_DT = 1000 / balance.loop.simHz
  const MAX_STEPS = balance.loop.maxStepsPerFrame
  let accumulator = 0

  const advance = (deltaMS: number): number => {
    accumulator += deltaMS
    let steps = 0
    while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
      simulate()
      accumulator -= FIXED_DT
      steps++
    }
    if (steps >= MAX_STEPS) accumulator = 0
    return steps
  }

  // Время берём из performance.now() (стенные часы), а не из ticker.deltaMS — надёжнее
  // и не зависит от того, как Pixi считает дельту на разных экранах.
  let lastTime = performance.now()
  const frame = () => {
    const now = performance.now()
    let delta = now - lastTime
    lastTime = now
    if (delta > 100) delta = 100 // клампим большие провалы (сворачивание вкладки/лаг)
    return advance(delta)
  }

  app.ticker.add(frame)

  // DEV-объект для отладки/тюнинга. На window.__game его вешает GameCanvas — и только
  // для живого инстанса (StrictMode монтирует дважды и один инстанс уничтожается).
  const debug = {
    app,
    player,
    spawner,
    crystals,
    obstacles,
    controls,
    keys,
    state: () => ({
      x: Math.round(player.x),
      y: Math.round(player.y),
      vy: Math.round(player.vy * 100) / 100,
      cameraOffset: Math.round(cameraOffset),
      platforms: spawner.platforms.length,
      height: Math.floor(-minY / balance.score.pxPerMeter),
      crystalTotal,
      crystalsOnField: crystals.crystals.length,
      epoch: epochs.current,
      bgColor: app.renderer.background.color.toHex(),
      banner: banner.visible ? banner.text : null,
      obstaclesOnField: obstacles.obstacles.length,
      controlLocked: controlLockSec > 0,
    }),
    pause: () => app.ticker.stop(),
    resume: () => app.ticker.start(),
    /** Прогнать N фиксированных шагов симуляции вручную (для проверки логики без rAF). */
    step: (n = 1) => {
      for (let i = 0; i < n; i++) simulate()
    },
    /** Прогнать драйвер кадра с заданным deltaMS (для проверки независимости от FPS). */
    advance,
    /** Полный кадр (время из performance.now()); возвращает число шагов симуляции. */
    frame,
  }

  const destroy = () => {
    app.ticker.remove(frame)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    controls.destroy()
    pauseMenu.destroy()
    app.destroy(true, { children: true })
  }

  return { app, destroy, debug }
}
