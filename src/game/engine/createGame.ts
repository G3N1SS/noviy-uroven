import { Application, Container, Graphics, Text } from 'pixi.js'
import { balance } from '../config/balance'
import { createPlayer } from '../entities/player'
import { Trail } from '../entities/trail'
import { Spawner } from '../systems/spawner'
import { CrystalManager } from '../systems/crystals'
import { ObstacleManager } from '../systems/obstacles'
import { BoosterManager } from '../systems/boosters'
import { EpochManager } from '../systems/epochs'
import { BackgroundManager } from '../systems/background'
import { ParticleFx } from '../systems/particles'
import { drawCrystal } from '../entities/crystal'
import { boosterColor } from '../entities/booster'
import { ControlsManager } from '../controls/controlsManager'
import { createPauseMenu } from '../controls/pauseMenu'
import { createGameOver } from '../../features/gameOver/gameOver'
import { getBestHeight, setBestHeight, getCrystalTotal, setCrystalTotal } from '../../shared/storage/local'

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

  // Параллакс-фон эпохи — самый нижний слой сцены (за миром).
  const background = new BackgroundManager(app)
  app.stage.addChild(background.root)

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
  const boosterLayer = new Container()
  world.addChild(boosterLayer)

  const player = createPlayer()
  // Ауры бустеров — независимые слои, могут гореть одновременно (стакуются):
  // Гигабэк — мягкая маджента-заливка (внутренний слой)
  const aura = new Graphics()
  aura.circle(0, 0, balance.player.radius * 2.1).fill({ color: 0xffffff })
  aura.tint = boosterColor('gigaback')
  aura.visible = false
  player.view.addChildAt(aura, 0)
  // SafeWall — электрик-блю кольцо снаружи заливки Гигабэка
  const safewallAura = new Graphics()
  safewallAura
    .circle(0, 0, balance.player.radius * 2.45)
    .stroke({ color: 0xffffff, width: 2 })
    .circle(0, 0, balance.player.radius * 2.45)
    .fill({ color: 0xffffff, alpha: 0.06 })
  safewallAura.tint = boosterColor('safewall')
  safewallAura.visible = false
  player.view.addChildAt(safewallAura, 1)
  // Щит — вращающийся белый гекс-«пузырь» (силовое поле), контур
  const shieldAura = new Graphics()
  {
    const R = balance.player.radius * 1.7
    const hex: number[] = []
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k - Math.PI / 2
      hex.push(Math.cos(a) * R, Math.sin(a) * R)
    }
    shieldAura.poly(hex).fill({ color: 0xffffff, alpha: 0.05 }).stroke({ color: 0xffffff, width: 2 })
  }
  shieldAura.visible = false
  player.view.addChildAt(shieldAura, 2)
  // Шлейф — в мировых координатах, СРАЗУ под игроком (поверх платформ/кристаллов)
  const trail = new Trail()
  world.addChild(trail.view)
  world.addChild(player.view)
  // Частицы мира (вспышки кристаллов, волны бустеров, «+N») — поверх игрока
  const fx = new ParticleFx()
  world.addChild(fx.view)
  // Конфетти рекорда — в ЭКРАННЫХ координатах, поверх мира, под HUD
  const screenFx = new ParticleFx()
  app.stage.addChild(screenFx.view)

  const spawner = new Spawner(platformLayer)
  // Кристаллы и помехи консультируются с планировщиком спавнера (единый источник правды):
  // помехи гейтят себя через isObstaclePassable, кристаллы кладутся на дуги прыжка.
  const crystals = new CrystalManager(crystalLayer, spawner.planner)
  const obstacles = new ObstacleManager(obstacleLayer, spawner.planner)
  const boosters = new BoosterManager(boosterLayer)
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

  // HUD (вариант B — бенто-карточка): слева-сверху одна карточка с тонкой рамкой:
  // высота (стенсил — фишка T2), кристаллы, а полоска прогресса эпохи — НИЖНЯЯ КРОМКА
  // карточки во всю ширину. Правый верхний угол — только кнопка паузы (DOM, призрак в тон).
  const STENCIL = 'Big Shoulders Stencil, Manrope, sans-serif'
  const hudCard = new Container()
  hudCard.x = 10
  hudCard.y = 10
  const cardBg = new Graphics()
  const cardMask = new Graphics()
  hudCard.addChild(cardBg, cardMask)
  hudCard.mask = cardMask // полоска-кромка клипается скруглениями карточки

  const hud = new Text({
    text: '0',
    style: { fill: 0xffffff, fontFamily: STENCIL, fontSize: 38, fontWeight: '700' },
  })
  const hudUnit = new Text({
    text: 'м',
    style: { fill: 0xffffff, fontFamily: STENCIL, fontSize: 19, fontWeight: '700' },
  })
  const crystalIcon = new Graphics()
  drawCrystal({ view: crystalIcon, x: 0, y: 0, value: 0, radius: 7, active: true }, false)
  const crystalHud = new Text({
    text: '0',
    style: { fill: 0xffffff, fontFamily: 'Manrope, sans-serif', fontSize: 15, fontWeight: '800' },
  })
  const epochBar = new Graphics() // прогресс эпохи — нижняя кромка карточки
  hudCard.addChild(hud, hudUnit, crystalIcon, crystalHud, epochBar)
  app.stage.addChild(hudCard)

  // Canvas/Pixi НЕ триггерит подгрузку @font-face (в отличие от DOM), поэтому шрифты
  // грузим явно, затем перерисовываем HUD-тексты (иначе «м»/«0» застынут в fallback).
  void Promise.all([
    document.fonts.load('700 44px "Big Shoulders Stencil"'),
    document.fonts.load('800 18px "Manrope"'),
    document.fonts.load('800 26px "Manrope"'),
  ]).then(() => {
    for (const t of [hud, hudUnit, crystalHud, banner]) {
      const s = t.text
      t.text = ''
      t.text = s
    }
  })

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

  // HUD активного (временно́го) бустера — справа-внизу, кольцевой таймер (конспект 3.3)
  const boosterHud = new Graphics()
  app.stage.addChild(boosterHud)

  // --- состояние партии ---
  let cameraOffset = 0
  let lastScreenH = app.screen.height // для переякоривания камеры при ресайзе вьюпорта
  let minY = 0 // самая большая высота (наименьший y) за партию — для счёта
  let crystalsThisRun = 0 // кристаллы, собранные ЗА ТЕКУЩУЮ партию (для экрана Game Over)
  // Кошелёк и рекорд переживают перезагрузку (localStorage; полноценный IndexedDB — Этап 5).
  let crystalTotal = getCrystalTotal()
  let bestHeight = getBestHeight()
  let controlLockSec = 0 // потеря управления после помехи (сек)
  let gigabackSec = 0 // остаток действия Гигабэка (×2 кристаллы), сек
  let rescueCharges = 0 // заряды спасения (MiXX-щит) — батут от нижнего края
  let shieldT = 0 // фаза анимации ауры щита
  let safewallSec = 0 // SafeWall: иммунитет к помехам + подсветка фейков, сек
  let recordCelebrated = false // конфетти рекорда — один раз за партию

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
    crystalsThisRun = 0
    spawner.reset(balance.start.platformOffsetY, w)
    crystals.reset(balance.start.platformOffsetY) // кошелёк crystalTotal НЕ трогаем
    obstacles.reset(balance.start.platformOffsetY)
    boosters.reset(balance.start.platformOffsetY)
    epochs.reset() // фон вернётся к эпохе 1 на первом апдейте
    background.reset() // сцена эпохи 1 мгновенно
    controlLockSec = 0
    gigabackSec = 0
    rescueCharges = 0
    safewallSec = 0
    trail.clear()
    fx.clear()
    screenFx.clear()
    recordCelebrated = false
    controls.reset() // калибровка нуля наклона на старте партии
  }

  // Экран Game Over (DOM-оверлей, БЭМ). Открывается на смерть и держит паузу.
  const gameOver = createGameOver({
    onRestart: () => {
      reset()
      app.ticker.start()
    },
  })
  function die() {
    app.ticker.stop()
    const heightMeters = Math.floor(-minY / balance.score.pxPerMeter)
    const beaten = heightMeters > bestHeight
    if (beaten) {
      bestHeight = heightMeters
      setBestHeight(heightMeters)
    }
    // Кошелёк уже в crystalTotal (пишем на каждый пикап); дублируем в LS на смерть — надёжнее.
    setCrystalTotal(crystalTotal)
    gameOver.show({
      height: heightMeters,
      best: bestHeight,
      crystalsGained: crystalsThisRun,
      crystalTotal,
      beaten,
      epochBanner: epochs.deathBanner(heightMeters),
    })
  }

  reset()

  // Один фиксированный шаг симуляции (1/60 c). Все прибавки скорости — «на шаг»,
  // поэтому скорость игры одинакова при любом FPS экрана (см. frame ниже).
  const simulate = () => {
    const w = app.screen.width
    const h = app.screen.height

    // 0) Ресайз вьюпорта (моб. адресная строка появляется/скрывается, поворот): переякориваем
    //    камеру, чтобы игрок остался на followRatio. Иначе cameraOffset выставлен под старую
    //    высоту, и при уменьшении h игрок оказывается за нижним краем → мгновенная смерть (баг).
    if (h !== lastScreenH) {
      cameraOffset = h * balance.camera.followRatio - player.y
      world.y = cameraOffset
      lastScreenH = h
    }

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
        if (p.type === 'rrl' && p.collapseTimer >= 0) continue // уже разрушается — не опора
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
          } else if (p.type === 'vols' || p.type === 'moving') {
            p.bounceT = 0 // landing-bounce (пружина проседания)
          }
          break
        }
      }
    }

    // 4b) Помеха: касание = отброс вниз + потеря контроля. SafeWall = иммунитет (проходим сквозь)
    if (safewallSec === 0 && obstacles.hit(player.x, player.y, r)) {
      player.vy = balance.obstacles.interference.knockbackVy
      controlLockSec = balance.obstacles.interference.controlLockSec
    }

    // 5) Камера — только вверх
    const targetOffset = h * balance.camera.followRatio - player.y
    if (targetOffset > cameraOffset) cameraOffset = targetOffset
    world.y = cameraOffset

    // 6) Генерация/чистка платформ + кристаллов + помех + бустеров
    spawner.update(cameraOffset, w, h, dtSec, safewallSec > 0) // подсветка фейков при SafeWall
    crystals.update(cameraOffset, w, h)
    obstacles.update(cameraOffset, w, h, dtSec)
    boosters.update(cameraOffset, w, h, dtSec)

    // 6b) Сбор бустеров пролётом (+ радиальная волна цвета бустера)
    for (const type of boosters.collect(player.x, player.y, r)) {
      fx.ring(player.x, player.y, boosterColor(type))
      if (type === 'gigaback') {
        gigabackSec = balance.boosters.gigaback.durationMs / 1000
      } else if (type === 'mixxShield') {
        rescueCharges = Math.min(balance.boosters.rescueMax, rescueCharges + 1)
      } else if (type === 'safewall') {
        safewallSec = balance.boosters.safeWall.durationMs / 1000
      }
    }
    // тики таймеров бустеров
    if (gigabackSec > 0) gigabackSec = Math.max(0, gigabackSec - dtSec)
    if (safewallSec > 0) safewallSec = Math.max(0, safewallSec - dtSec)

    // 7) Сбор кристаллов пролётом (Гигабэк ×2) + вспышка осколков и флоат «+N»
    const got = crystals.collect(player.x, player.y, r)
    if (got > 0) {
      const gained = got * (gigabackSec > 0 ? 2 : 1)
      crystalTotal += gained
      crystalsThisRun += gained
      crystalHud.text = `${crystalTotal}`
      setCrystalTotal(crystalTotal) // копим на диск инкрементально — на случай крэша вкладки
      fx.burst(player.x, player.y, [0xff3495, 0xffffff, 0xff3495])
      fx.float(`+${gained}`, player.x, player.y)
    }

    // 8) Счёт (высота в метрах)
    if (player.y < minY) minY = player.y
    const heightMeters = -minY / balance.score.pxPerMeter
    hud.text = `${Math.floor(heightMeters)}`

    // 8a) Побитие рекорда — конфетти (один раз за партию; первые метры не празднуем)
    if (
      !recordCelebrated &&
      bestHeight >= balance.particles.recordMinMeters &&
      heightMeters > bestHeight
    ) {
      recordCelebrated = true
      screenFx.confetti(w)
    }

    // 8b) Эпохи: смена фона + баннер перехода по высоте; параллакс-сцена фона; частицы
    epochs.update(heightMeters, dtSec)
    background.update(dtSec, cameraOffset, epochs.current)
    fx.update(dtSec)
    screenFx.update(dtSec)

    // 9) HUD-карточка (вариант B): раскладка контента → размер карточки → фон/маска →
    // полоска прогресса эпохи нижней кромкой во всю ширину. Баннер — по центру.
    const padX = 12
    hud.x = padX
    hud.y = 6
    hudUnit.x = hud.x + hud.width + 4
    hudUnit.y = hud.y + hud.height - hudUnit.height - 3 // прижать к низу цифр
    const rowY = hud.y + hud.height + 5
    crystalIcon.x = padX + 7
    crystalIcon.y = rowY + 8
    crystalHud.x = padX + 18
    crystalHud.y = rowY
    const eb = balance.hud.epochBar
    const cardW = Math.max(hudUnit.x + hudUnit.width, 96) + padX
    const cardH = rowY + crystalHud.height + 8 + eb.heightPx
    cardBg.clear()
    cardBg.roundRect(0, 0, cardW, cardH, 14).fill({ color: 0xffffff, alpha: 0.04 })
    cardBg.roundRect(0, 0, cardW, cardH, 14).stroke({ color: 0xffffff, alpha: 0.12, width: 1 })
    cardMask.clear().roundRect(0, 0, cardW, cardH, 14).fill(0xffffff)
    // прогресс эпохи — кромка. null = финальная эпоха: кромку не рисуем.
    const prog = epochs.progress(heightMeters)
    epochBar.clear()
    if (prog !== null) {
      const by = cardH - eb.heightPx
      epochBar.rect(0, by, cardW, eb.heightPx).fill({ color: 0xffffff, alpha: 0.12 })
      if (prog > 0) {
        epochBar.rect(0, by, cardW * prog, eb.heightPx).fill({ color: 0xff3495 })
      }
    }
    banner.x = w / 2
    banner.y = h * 0.26

    // 9b) Ауры героя — независимые, стакуются: Гигабэк (маджента-заливка) +
    // SafeWall (электрик-блю кольцо) + щит (белый гекс-пузырь)
    aura.visible = gigabackSec > 0
    if (aura.visible) aura.alpha = 0.14 + 0.07 * Math.sin(gigabackSec * 6)
    safewallAura.visible = safewallSec > 0
    if (safewallAura.visible) safewallAura.alpha = 0.55 + 0.25 * Math.sin(safewallSec * 6)
    shieldAura.visible = rescueCharges > 0
    if (shieldAura.visible) {
      shieldT += dtSec
      shieldAura.rotation = shieldT * 0.7 // медленное вращение
      shieldAura.alpha = 0.7 + 0.3 * Math.sin(shieldT * 3.5) // мягкий пульс
    }

    // 9c) HUD справа-внизу: кольцевые таймеры активных timed-бустеров (стопкой) + заряды щита
    boosterHud.clear()
    const gigaDur = balance.boosters.gigaback.durationMs / 1000
    const swDur = balance.boosters.safeWall.durationMs / 1000
    const timers: Array<{ frac: number; type: 'gigaback' | 'safewall' }> = []
    if (gigabackSec > 0) timers.push({ frac: gigabackSec / gigaDur, type: 'gigaback' })
    if (safewallSec > 0) timers.push({ frac: safewallSec / swDur, type: 'safewall' })

    for (let s = 0; s < timers.length; s++) {
      const { frac, type } = timers[s]
      const cx = w - 38
      const cy = h - 38 - s * 52
      const rad = 20
      const col = boosterColor(type)
      boosterHud.circle(cx, cy, rad).fill({ color: 0x1a1a1a })
      if (type === 'gigaback') {
        const dv = 7
        const dh = 5
        const off = 6
        boosterHud
          .poly([cx - off, cy - dv, cx - off + dh, cy, cx - off, cy + dv, cx - off - dh, cy])
          .fill({ color: col })
        boosterHud
          .poly([cx + off, cy - dv, cx + off + dh, cy, cx + off, cy + dv, cx + off - dh, cy])
          .stroke({ color: col, width: 1.5 })
      } else {
        // мини-щит
        boosterHud
          .poly([cx, cy - 9, cx + 8, cy - 4, cx + 8, cy + 3, cx, cy + 9, cx - 8, cy + 3, cx - 8, cy - 4])
          .stroke({ color: col, width: 2 })
      }
      const a0 = -Math.PI / 2
      const a1 = a0 + frac * Math.PI * 2
      boosterHud.moveTo(cx + rad * Math.cos(a0), cy + rad * Math.sin(a0))
      boosterHud.arc(cx, cy, rad, a0, a1)
      boosterHud.stroke({ color: col, width: 3.5, cap: 'round' })
    }
    // заряды спасения (щит/вечные) — гексагоны над кольцами
    for (let i = 0; i < rescueCharges; i++) {
      const ix = w - 38
      const iy = h - 38 - timers.length * 52 - 14 - i * 26
      const hex: number[] = []
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k - Math.PI / 2
        hex.push(ix + Math.cos(a) * 9, iy + Math.sin(a) * 9)
      }
      boosterHud.poly(hex).fill({ color: 0x1a1a1a }).stroke({ color: 0xffffff, width: 2 })
    }

    // 10) Нижний край: спасение батутом (заряд щита/вечных) → иначе экран Game Over
    if (player.y + cameraOffset > h + r) {
      if (rescueCharges > 0) {
        rescueCharges--
        player.y = h - r - cameraOffset // возвращаем на нижний край
        player.vy = -jumpVel * balance.boosters.rescueBounceFactor // мощный отскок вверх
        controlLockSec = 0
      } else {
        die()
      }
    }

    // 11) Синхронизация вью + шлейф. Якорь шлейфа — точка КАСАНИЯ (низ перса, y+r),
    // а не центр: тогда разворот на приземлении садится на платформу, а не висит над ней.
    player.view.x = player.x
    player.view.y = player.y
    trail.update(player.x, player.y + r, dtSec, w)
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
    boosters,
    boosterHud,
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
      boostersOnField: boosters.boosters.length,
      gigabackSec: Math.round(gigabackSec * 100) / 100,
      rescueCharges,
      safewallSec: Math.round(safewallSec * 100) / 100,
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
    gameOver.destroy()
    app.destroy(true, { children: true })
  }

  return { app, destroy, debug }
}
