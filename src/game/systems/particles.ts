import { Container, Graphics, Text } from 'pixi.js'
import { balance } from '../config/balance'

type Kind = 'shard' | 'ring' | 'confetti'

interface P {
  kind: Kind
  x: number
  y: number
  vx: number
  vy: number
  life: number // сек, растёт
  max: number
  color: number
  size: number
  rot: number
  vr: number // скорость вращения (конфетти)
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

/**
 * Частицы (конспект 3.6): вспышка осколков + «+N» при сборе кристалла, радиальная
 * волна при сборе бустера, конфетти при побитии рекорда. Один Graphics на систему,
 * перерисовка per-frame; пул Text для флоатов. Капы количества — чтобы цепочка
 * кристаллов за кадр не раздувала сцену (перф-бюджет конспекта 4.8).
 */
export class ParticleFx {
  readonly view = new Container()
  private readonly g = new Graphics()
  private parts: P[] = []
  private readonly floats: Array<{ t: Text; life: number }> = []
  private readonly floatPool: Text[] = []
  private readonly maxParts = 90

  constructor() {
    this.view.addChild(this.g)
  }

  /** Вспышка осколков (сбор кристалла): ромбики разлетаются веером и гаснут. */
  burst(x: number, y: number, colors: readonly number[]): void {
    const cfg = balance.particles.crystal
    for (let i = 0; i < cfg.count; i++) {
      const a = rnd(0, Math.PI * 2)
      const sp = rnd(cfg.speed * 0.4, cfg.speed)
      this.push({
        kind: 'shard',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40, // лёгкий подброс вверх
        life: 0,
        max: rnd(cfg.lifeSec * 0.7, cfg.lifeSec),
        color: colors[i % colors.length],
        size: rnd(2.5, 4.5),
        rot: rnd(0, Math.PI),
        vr: rnd(-6, 6),
      })
    }
  }

  /** Радиальная волна (сбор бустера): кольцо цвета бустера расширяется и тает. */
  ring(x: number, y: number, color: number): void {
    this.push({
      kind: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0,
      max: balance.particles.ring.lifeSec,
      color,
      size: 0,
      rot: 0,
      vr: 0,
    })
  }

  /** Конфетти рекорда: сыплется сверху экрана (координаты — экранные). */
  confetti(screenW: number): void {
    const cfg = balance.particles.confetti
    const colors = [0xff3495, 0xffffff, 0xc4f500, 0x1f3fff]
    for (let i = 0; i < cfg.count; i++) {
      this.push({
        kind: 'confetti',
        x: rnd(0, screenW),
        y: rnd(-60, -8),
        vx: rnd(-45, 45),
        vy: rnd(50, 140),
        life: 0,
        max: rnd(cfg.lifeSec * 0.7, cfg.lifeSec),
        color: colors[i % colors.length],
        size: rnd(3, 5.5),
        rot: rnd(0, Math.PI),
        vr: rnd(-8, 8),
      })
    }
  }

  /** Флоат-текст «+N» (сбор кристаллов): всплывает и тает. Текст — белый (не маджента!). */
  float(s: string, x: number, y: number): void {
    const t =
      this.floatPool.pop() ??
      new Text({
        text: '',
        style: { fill: 0xffffff, fontFamily: 'Manrope, sans-serif', fontSize: 15, fontWeight: '800' },
      })
    t.text = s
    t.anchor.set(0.5, 1)
    t.x = x
    t.y = y - 14
    t.alpha = 1
    this.view.addChild(t)
    this.floats.push({ t, life: 0 })
  }

  update(dtSec: number): void {
    const g = this.g.clear()
    const grav = 320
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]
      p.life += dtSec
      if (p.life >= p.max) {
        this.parts.splice(i, 1)
        continue
      }
      const t = p.life / p.max // 0..1
      if (p.kind === 'ring') {
        const r = 12 + t * 64
        g.circle(p.x, p.y, r).stroke({ color: p.color, width: 2.5 * (1 - t) + 0.5, alpha: 0.7 * (1 - t) })
        continue
      }
      if (p.kind === 'confetti') p.vy += grav * dtSec * 0.25
      p.x += p.vx * dtSec
      p.y += p.vy * dtSec
      p.rot += p.vr * dtSec
      const alpha = p.kind === 'confetti' ? Math.min(1, (1 - t) * 2) : 1 - t
      const s = p.size * (p.kind === 'shard' ? 1 - t * 0.5 : 1)
      // ромбик с вращением (осколок/конфетти)
      const c = Math.cos(p.rot)
      const sn = Math.sin(p.rot)
      g.poly([
        p.x + c * s, p.y + sn * s,
        p.x - sn * s * 0.7, p.y + c * s * 0.7,
        p.x - c * s, p.y - sn * s,
        p.x + sn * s * 0.7, p.y - c * s * 0.7,
      ]).fill({ color: p.color, alpha })
    }

    const fl = balance.particles.floatSec
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]
      f.life += dtSec
      const t = f.life / fl
      if (t >= 1) {
        this.view.removeChild(f.t)
        this.floatPool.push(f.t)
        this.floats.splice(i, 1)
        continue
      }
      f.t.y -= 42 * dtSec
      f.t.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
    }
  }

  clear(): void {
    this.parts.length = 0
    this.g.clear()
    for (const f of this.floats) {
      this.view.removeChild(f.t)
      this.floatPool.push(f.t)
    }
    this.floats.length = 0
  }

  private push(p: P): void {
    if (this.parts.length >= this.maxParts) this.parts.shift() // кап: гасим старейшую
    this.parts.push(p)
  }
}
