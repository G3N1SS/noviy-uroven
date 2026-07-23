import { Application, Container, Graphics } from 'pixi.js'
import { balance } from '../config/balance'

/**
 * Параллакс-фоны эпох (Этап 3, конспект 2.7 + 3.6). Принцип дизайна — плакат:
 * один крупный образ на эпоху + воздух, ничего мелкого (мелочь на телефоне за
 * геймплеем превращается в шум). Выбранные концепты:
 *   1. 2G  — столбы и провисшие провода, маджента-лампы (улица 90-х)
 *   2. 3G  — крыша-плакат: парапет + решётчатая мачта с маячком (нулевые)
 *   3. LTE — «можно ускоряться»: штрихи ветра проносятся мимо (скорость)
 *   4. 5G  — стратосфера: маджента-горизонт + неон-шпили
 *   5. 6G  — космос: звёзды, орбиты, частицы кода
 *
 * Структура сцены: backdrop (статичный плакат, «бесконечно далеко» → без параллакса)
 * + слои частиц far/mid/near (факторы в balance.background.parallax), скроллятся от
 * камеры с вертикальным wrap'ом + собственный дрейф. Смена эпохи — кроссфейд сцен
 * за epochTransition.crossfadeSec. Всё рисуется процедурно (Graphics, без ассетов).
 */

const MARGIN = 110 // запас wrap-полосы сверху/снизу (длиннейший штрих + свечение)

interface Particle {
  x: number
  y: number
  type: 'dot' | 'streak' | 'bit'
  color: number
  alpha: number
  /** dot: радиус */
  r?: number
  /** streak: длина */
  len?: number
  /** streak: наклон (dx на единицу длины); 0 — вертикальный (взлёт), 0.07 — ветер LTE */
  tilt?: number
  /** мигание: частота (рад/сек); нет — статичная альфа */
  blinkFreq?: number
  blinkPhase?: number
}

/** Слой частиц: один Graphics, перерисовка per-frame с wrap'ом по вертикали. */
class ParticleLayer {
  readonly g = new Graphics()

  constructor(
    private readonly factor: number,
    private readonly drift: number, // собственная скорость, px/сек (+вниз)
    private readonly items: Particle[],
  ) {}

  update(t: number, cameraOffset: number, h: number): void {
    const period = h + 2 * MARGIN
    const shift = cameraOffset * this.factor + t * this.drift
    const g = this.g.clear()
    for (const p of this.items) {
      const y = ((((p.y + shift) % period) + period) % period) - MARGIN
      const alpha = p.blinkFreq
        ? p.alpha * (0.55 + 0.45 * Math.sin(t * p.blinkFreq + (p.blinkPhase ?? 0)))
        : p.alpha
      if (p.type === 'dot') {
        g.circle(p.x, y, p.r ?? 1).fill({ color: p.color, alpha })
      } else if (p.type === 'streak') {
        const len = p.len ?? 40
        g.moveTo(p.x, y)
          .lineTo(p.x + len * (p.tilt ?? 0), y + len)
          .stroke({ color: p.color, alpha, width: 1.4, cap: 'round' })
      } else {
        g.rect(p.x, y, 3, 3).fill({ color: p.color, alpha })
      }
    }
  }
}

/** Мигающий элемент подложки (лампа/маячок/неон): альфа пульсирует синусом. */
interface Blinker {
  g: Graphics
  base: number
  amp: number
  freq: number
  phase: number
}

/** Вращающийся элемент (блик по ободу портала, спутник на орбите — 6G). */
interface Rotator {
  g: Graphics
  speed: number // рад/сек
  phase: number
}

interface Scene {
  root: Container
  layers: ParticleLayer[]
  blinkers: Blinker[]
  rotators: Rotator[]
}

// ---------- утилиты ----------

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

function dots(
  n: number,
  w: number,
  h: number,
  color: number,
  aMin: number,
  aMax: number,
  rMin = 0.7,
  rMax = 1.2,
  blink = false,
): Particle[] {
  const out: Particle[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      x: rnd(0, w),
      y: rnd(0, h),
      type: 'dot',
      color,
      alpha: rnd(aMin, aMax),
      r: rnd(rMin, rMax),
      ...(blink && Math.random() < 0.4
        ? { blinkFreq: rnd(0.8, 1.8), blinkPhase: rnd(0, Math.PI * 2) }
        : {}),
    })
  }
  return out
}

function streaks(
  n: number,
  w: number,
  h: number,
  lenMin: number,
  lenMax: number,
  aMin: number,
  aMax: number,
  color = 0xffffff,
  tilt = 0,
): Particle[] {
  const out: Particle[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      x: rnd(0, w),
      y: rnd(0, h),
      type: 'streak',
      color,
      alpha: rnd(aMin, aMax),
      len: rnd(lenMin, lenMax),
      tilt,
    })
  }
  return out
}

function blinkG(
  scene: Scene,
  parent: Container,
  draw: (g: Graphics) => void,
  base: number,
  amp: number,
  freq: number,
): Graphics {
  const g = new Graphics()
  draw(g)
  g.alpha = base
  parent.addChild(g)
  scene.blinkers.push({ g, base, amp, freq, phase: rnd(0, Math.PI * 2) })
  return g
}

// ---------- сцены эпох ----------

function buildScene(epochId: number, w: number, h: number): Scene {
  const scene: Scene = { root: new Container(), layers: [], blinkers: [], rotators: [] }
  const P = balance.background.parallax
  const bd = new Graphics()

  const addLayer = (factor: number, drift: number, items: Particle[]) => {
    const l = new ParticleLayer(factor, drift, items)
    scene.root.addChild(l.g)
    scene.layers.push(l)
  }

  switch (epochId) {
    // ---- 1: 2G — столбы и провода ----
    case 1: {
      // 3 слоя пыли эфира — единственное, что параллаксит (образ-плакат статичен).
      // Альфы подняты: на 0.03–0.06 пыль не читалась и параллакса не было видно.
      addLayer(P.far, 0, dots(16, w, h, 0xffffff, 0.12, 0.2))
      addLayer(P.mid, 0, dots(10, w, h, 0xffffff, 0.18, 0.28, 0.9, 1.4))
      addLayer(P.near, 0, dots(6, w, h, 0xffffff, 0.26, 0.38, 1.2, 1.9))
      // здания по краям
      bd.rect(0, h * 0.62, w * 0.2, h * 0.38).fill({ color: 0x1a1a1a, alpha: 0.22 })
      bd.rect(w * 0.79, h * 0.58, w * 0.21, h * 0.42).fill({ color: 0x1a1a1a, alpha: 0.22 })
      // окна на зданиях (тёплые, статичные)
      for (const [wx, wy] of [
        [w * 0.05, h * 0.68],
        [w * 0.12, h * 0.75],
        [w * 0.85, h * 0.66],
        [w * 0.93, h * 0.73],
      ] as const) {
        bd.rect(wx, wy, 4, 5).fill({ color: 0xff3495, alpha: 0.45 })
      }
      // столбы с траверсами
      const xA = w * 0.24
      const xB = w * 0.76
      const topA = h * 0.57
      const topB = h * 0.5
      bd.moveTo(xA, h).lineTo(xA, topA).stroke({ color: 0x2e2e2e, width: 4, cap: 'round' })
      bd.moveTo(xA - 15, topA + 12).lineTo(xA + 15, topA + 12).stroke({ color: 0x2e2e2e, width: 2.5 })
      bd.moveTo(xA - 12, topA + 24).lineTo(xA + 12, topA + 24).stroke({ color: 0x2e2e2e, width: 2.5 })
      bd.moveTo(xB, h).lineTo(xB, topB).stroke({ color: 0x2e2e2e, width: 4, cap: 'round' })
      bd.moveTo(xB - 15, topB + 12).lineTo(xB + 15, topB + 12).stroke({ color: 0x2e2e2e, width: 2.5 })
      bd.moveTo(xB - 12, topB + 24).lineTo(xB + 12, topB + 24).stroke({ color: 0x2e2e2e, width: 2.5 })
      // провисшие провода (между столбами и за край)
      bd.moveTo(xA + 15, topA + 12)
        .quadraticCurveTo((xA + xB) / 2, topA + 60, xB - 15, topB + 12)
        .stroke({ color: 0x252525, width: 1.3 })
      bd.moveTo(xA + 12, topA + 24)
        .quadraticCurveTo((xA + xB) / 2, topA + 74, xB - 12, topB + 24)
        .stroke({ color: 0x252525, width: 1.3 })
      bd.moveTo(-10, topA + 40).quadraticCurveTo(xA / 2, topA + 26, xA - 15, topA + 12)
        .stroke({ color: 0x252525, width: 1.3 })
      bd.moveTo(xB + 15, topB + 12).quadraticCurveTo(w - (w - xB) / 2, topB, w + 10, topB - 8)
        .stroke({ color: 0x252525, width: 1.3 })
      scene.root.addChild(bd)
      // маджента-лампы на верхушках
      blinkG(scene, scene.root, (g) => g.circle(xA, topA - 4, 2.4).fill(0xff3495), 0.6, 0.35, 1.1)
      blinkG(scene, scene.root, (g) => g.circle(xB, topB - 4, 2.4).fill(0xff3495), 0.5, 0.3, 0.8)
      break
    }

    // ---- 2: 3G — крыша-плакат с мачтой ----
    case 2: {
      addLayer(P.far, 0, dots(12, w, h, 0xffffff, 0.15, 0.4))
      addLayer(P.mid, 0, dots(6, w, h, 0x1f3fff, 0.2, 0.45, 1.2, 1.8, true))
      addLayer(P.near, 0, dots(4, w, h, 0xffffff, 0.12, 0.2, 1.4, 2))
      const rY = h * 0.85
      // парапет со ступенями
      bd.moveTo(0, rY)
        .lineTo(w * 0.22, rY).lineTo(w * 0.22, rY - 12).lineTo(w * 0.34, rY - 12).lineTo(w * 0.34, rY)
        .lineTo(w * 0.6, rY).lineTo(w * 0.6, rY - 8).lineTo(w * 0.9, rY - 8).lineTo(w * 0.9, rY)
        .lineTo(w, rY).lineTo(w, h).lineTo(0, h).closePath()
        .fill(0x0a141f)
      // окна на парапете
      bd.rect(w * 0.12, rY + 14, 3, 3).fill({ color: 0x1f3fff, alpha: 0.5 })
      bd.rect(w * 0.42, rY + 20, 3, 3).fill({ color: 0x1f3fff, alpha: 0.35 })
      bd.rect(w * 0.74, rY + 14, 3, 3).fill({ color: 0x1f3fff, alpha: 0.45 })
      // решётчатая мачта: две сходящиеся ноги + зигзаг-раскосы
      const mx = w * 0.76
      const mTop = h * 0.5
      const legBottomY = rY - 8
      bd.moveTo(mx - 8, legBottomY).lineTo(mx - 2, mTop).stroke({ color: 0x101d2c, width: 2.2 })
      bd.moveTo(mx + 8, legBottomY).lineTo(mx + 2, mTop).stroke({ color: 0x101d2c, width: 2.2 })
      const segs = 7
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs
        const t1 = (i + 1) / segs
        const y0 = legBottomY + (mTop - legBottomY) * t0
        const y1 = legBottomY + (mTop - legBottomY) * t1
        const half0 = 8 - 6 * t0
        const half1 = 8 - 6 * t1
        const from = i % 2 === 0 ? mx - half0 : mx + half0
        const to = i % 2 === 0 ? mx + half1 : mx - half1
        bd.moveTo(from, y0).lineTo(to, y1).stroke({ color: 0x101d2c, width: 1.6 })
      }
      bd.moveTo(mx, mTop).lineTo(mx, mTop - 14).stroke({ color: 0x101d2c, width: 2.6 })
      scene.root.addChild(bd)
      // маячок на мачте
      blinkG(scene, scene.root, (g) => g.circle(mx, mTop - 18, 3).fill(0x1f3fff), 0.65, 0.35, 1.6)
      break
    }

    // ---- 3: LTE — скорость (штрихи ветра) ----
    case 3: {
      const WIND = 0.07 // наклон ~4°
      addLayer(P.far, 26, [
        ...streaks(8, w, h, 16, 26, 0.04, 0.07, 0xffffff, WIND),
        ...dots(3, w, h, 0xffffff, 0.2, 0.32),
      ])
      addLayer(P.mid, 58, streaks(6, w, h, 40, 60, 0.08, 0.12, 0xffffff, WIND))
      addLayer(P.near, 96, [
        ...streaks(5, w, h, 60, 90, 0.14, 0.2, 0xffffff, WIND),
        ...streaks(1, w, h, 66, 82, 0.4, 0.5, 0xff3495, WIND),
      ])
      break
    }

    // ---- 4: 5G — стратосфера ----
    case 4: {
      // линии энергии ЛЕТЯТ ВВЕРХ (отрицательный дрейф; wrap держит их в полосе экрана)
      addLayer(P.far, -42, [
        ...streaks(6, w, h, 18, 30, 0.05, 0.09),
        ...dots(8, w, h, 0xffffff, 0.2, 0.5, 0.7, 1.2, true),
      ])
      addLayer(P.mid, -78, [
        ...streaks(5, w, h, 30, 48, 0.1, 0.15),
        ...streaks(1, w, h, 34, 46, 0.2, 0.28, 0xc4f500),
      ])
      addLayer(P.near, -118, [
        ...streaks(4, w, h, 44, 66, 0.16, 0.24),
        ...streaks(1, w, h, 50, 64, 0.28, 0.36, 0xc4f500),
        ...streaks(1, w, h, 46, 60, 0.24, 0.32, 0xff3495),
      ])
      // свечение горизонта планеты
      bd.ellipse(w / 2, h + h * 0.1, w * 0.95, h * 0.2).fill({ color: 0xff3495, alpha: 0.08 })
      bd.ellipse(w / 2, h + h * 0.15, w * 0.95, h * 0.18).fill({ color: 0xff3495, alpha: 0.12 })
      // дальние шпили
      bd.poly([w * 0.12 - 6, h, w * 0.12, h * 0.57, w * 0.12 + 6, h]).fill({ color: 0x2b0d20, alpha: 0.4 })
      bd.poly([w * 0.88 - 6, h, w * 0.88, h * 0.63, w * 0.88 + 6, h]).fill({ color: 0x2b0d20, alpha: 0.4 })
      // главные шпили
      const s1 = w * 0.38
      const s1Top = h * 0.43
      const s2 = w * 0.63
      const s2Top = h * 0.53
      bd.poly([s1 - 9, h, s1, s1Top, s1 + 9, h]).fill(0x120510)
      bd.poly([s2 - 7, h, s2, s2Top, s2 + 7, h]).fill(0x120510)
      scene.root.addChild(bd)
      // неон-грани + огни (лайм и маджента)
      blinkG(scene, scene.root, (g) => {
        g.moveTo(s1, s1Top).lineTo(s1, h).stroke({ color: 0xc4f500, width: 1.2 })
        g.circle(s1, s1Top - 4, 2.4).fill(0xc4f500)
      }, 0.6, 0.25, 0.9)
      blinkG(scene, scene.root, (g) => {
        g.moveTo(s2, s2Top).lineTo(s2, h).stroke({ color: 0xff3495, width: 1.2 })
        g.circle(s2, s2Top - 4, 2).fill(0xff3495)
      }, 0.55, 0.25, 1.3)
      break
    }

    // ---- 5: 6G — портал: горизонт событий (концепт F) ----
    case 5:
    default: {
      // 3 слоя звёзд — параллакс-глубина космоса
      addLayer(P.far, 0, dots(12, w, h, 0xffffff, 0.25, 0.55, 0.7, 1.2, true))
      addLayer(P.mid, 0, dots(6, w, h, 0xffffff, 0.28, 0.45, 0.9, 1.4))
      addLayer(P.near, 0, dots(3, w, h, 0xffffff, 0.35, 0.5, 1.2, 1.8))
      const cx = w / 2
      const cy = h * 0.36
      const R = Math.min(w, h) * 0.29
      // чёрный диск-портал + маджента-обод + внешние кольца
      bd.circle(cx, cy, R).fill(0x000000)
      bd.circle(cx, cy, R).stroke({ color: 0xff3495, width: 1.8, alpha: 0.7 })
      bd.circle(cx, cy, R * 1.13).stroke({ color: 0xff3495, width: 0.8, alpha: 0.2 })
      bd.circle(cx, cy, R * 1.3).stroke({ color: 0x1f3fff, width: 0.7, alpha: 0.12 })
      scene.root.addChild(bd)
      // бегущий белый блик по ободу (четверть дуги). ВАЖНО: moveTo до arc —
      // иначе Pixi тянет линию от (0,0) к началу дуги.
      const glint = new Graphics()
      glint.moveTo(0, -R).arc(0, 0, R, -Math.PI / 2, 0)
        .stroke({ color: 0xffffff, width: 2, alpha: 0.55, cap: 'round' })
      glint.position.set(cx, cy)
      scene.root.addChild(glint)
      scene.rotators.push({ g: glint, speed: (Math.PI * 2) / 7, phase: rnd(0, Math.PI * 2) })
      // спутник на внешней орбите (встречное вращение)
      const sat = new Graphics()
      sat.circle(0, -R * 1.3, 1.8).fill({ color: 0x1f3fff, alpha: 0.85 })
      sat.position.set(cx, cy)
      scene.root.addChild(sat)
      scene.rotators.push({ g: sat, speed: -(Math.PI * 2) / 11, phase: rnd(0, Math.PI * 2) })
      break
    }
  }

  return scene
}

// ---------- менеджер ----------

export class BackgroundManager {
  readonly root = new Container()
  private scene: Scene | null = null
  private prev: Scene | null = null
  private fadeT = 0
  private epochId = 0
  private animT = 0
  private builtW = 0
  private builtH = 0

  constructor(private readonly app: Application) {}

  /** Мгновенно поставить сцену эпохи 1 (старт/рестарт партии). */
  reset(): void {
    this.destroyScene(this.prev)
    this.destroyScene(this.scene)
    this.prev = null
    this.epochId = 1
    this.scene = this.build(1)
    this.scene.root.alpha = 1
  }

  update(dtSec: number, cameraOffset: number, epochId: number): void {
    const id = epochId === 0 ? 1 : epochId
    const w = this.app.screen.width
    const h = this.app.screen.height
    if (w !== this.builtW || h !== this.builtH) {
      // ресайз — пересобираем текущую сцену мгновенно
      this.destroyScene(this.prev)
      this.prev = null
      this.destroyScene(this.scene)
      this.scene = this.build(id)
      this.scene.root.alpha = 1
      this.epochId = id
    } else if (id !== this.epochId) {
      // смена эпохи — кроссфейд сцен
      this.destroyScene(this.prev)
      this.prev = this.scene
      this.scene = this.build(id)
      this.scene.root.alpha = 0
      this.fadeT = balance.epochTransition.crossfadeSec
      this.epochId = id
    }

    this.animT += dtSec

    if (this.prev) {
      this.fadeT -= dtSec
      const k = Math.max(0, this.fadeT / balance.epochTransition.crossfadeSec)
      this.prev.root.alpha = k
      if (this.scene) this.scene.root.alpha = 1 - k
      if (this.fadeT <= 0) {
        this.destroyScene(this.prev)
        this.prev = null
        if (this.scene) this.scene.root.alpha = 1
      }
    }

    for (const s of [this.scene, this.prev]) {
      if (!s) continue
      for (const l of s.layers) l.update(this.animT, cameraOffset, h)
      for (const b of s.blinkers) {
        b.g.alpha = b.base + b.amp * Math.sin(this.animT * b.freq * Math.PI * 2 + b.phase)
      }
      for (const r of s.rotators) r.g.rotation = r.phase + this.animT * r.speed
    }
  }

  private build(id: number): Scene {
    this.builtW = this.app.screen.width
    this.builtH = this.app.screen.height
    const s = buildScene(id, this.builtW, this.builtH)
    this.root.addChild(s.root)
    return s
  }

  private destroyScene(s: Scene | null): void {
    if (!s) return
    this.root.removeChild(s.root)
    s.root.destroy({ children: true })
  }
}
