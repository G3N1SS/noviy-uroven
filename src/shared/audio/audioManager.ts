import { getSound } from '../storage/local'

/**
 * Аудио-движок (Этап 4, конспект 4.5 + Этап 4). ПРОЦЕДУРНЫЙ синтез на Web Audio API —
 * ни одного файла-сэмпла: весь SFX генерируется на лету осцилляторами/шумом. Это в духе
 * всего проекта (графика — процедурные Graphics, ноль ассетов) и даёт офлайн-чистоту:
 * ничего не грузить, не кэшировать, работает мгновенно и без сети.
 *
 * Политика автоплей: AudioContext создаётся/возобновляется только после первого жеста
 * пользователя (глобальный слушатель pointerdown/keydown ниже) — иначе браузер молчит.
 *
 * Микс (DoD «ничего не бесит на 10-й минуте»): звук прыжка звучит на КАЖДОМ касании
 * (~2-3 раза/сек), поэтому он тихий, короткий и со слегка рандомной высотой — не робот.
 * Громкие/богатые звуки (аккорд эпохи) — редкие события.
 *
 * Синглтон: одна звуковая шина на приложение. Игра дёргает audio.jumpVols() и т.п.,
 * настройки — audio.setSound(). Музыка (петли эпох) — отдельный инкремент, шина под неё
 * (musicBus) заложена заранее.
 */

type OscType = 'sine' | 'triangle' | 'square' | 'sawtooth'

interface ToneOpts {
  type: OscType
  /** старт частоты, Гц (>0 — для экспоненциального рампа) */
  f0: number
  /** конечная частота (глайд); нет — держим f0 */
  f1?: number
  /** длительность, сек */
  dur: number
  /** пиковая громкость (0..1 относительно шины) */
  gain: number
  /** атака, сек (по умолчанию мгновенно-мягко) */
  attack?: number
  /** лоупасс-срез, Гц — смягчить резкие пилы */
  lowpass?: number
}

class AudioManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private musicBus: GainNode | null = null // задел под музыку эпох
  private soundOn = getSound()

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => this.ensure()
      // Первый жест где угодно (онбординг/меню/тап по игре) разблокирует контекст.
      window.addEventListener('pointerdown', unlock)
      window.addEventListener('keydown', unlock)
    }
  }

  /** Создать (лениво) и возобновить контекст. Идемпотентно; безопасно звать на каждый жест. */
  private ensure(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.5
      this.master.connect(this.ctx.destination)
      this.sfxBus = this.ctx.createGain()
      this.sfxBus.connect(this.master)
      this.musicBus = this.ctx.createGain()
      this.musicBus.connect(this.master)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  /** Живое переключение из настроек (тумблер «Звуки»). */
  setSound(on: boolean): void {
    this.soundOn = on
  }

  /** Контекст, готовый играть SFX (звук включён и контекст запущен), либо null. */
  private get out(): { ctx: AudioContext; bus: GainNode } | null {
    if (!this.soundOn || !this.ctx || !this.sfxBus || this.ctx.state !== 'running') return null
    return { ctx: this.ctx, bus: this.sfxBus }
  }

  // ---------- примитивы синтеза ----------

  /** Тон с ADSR-огибающей (attack → экспоненциальный спад). Осн. кирпич SFX. */
  private tone(o: ToneOpts): void {
    const out = this.out
    if (!out) return
    const { ctx, bus } = out
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = o.type
    osc.frequency.setValueAtTime(o.f0, t0)
    if (o.f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur)

    const g = ctx.createGain()
    const attack = o.attack ?? 0.004
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(o.gain, t0 + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)

    let node: AudioNode = osc
    if (o.lowpass != null) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = o.lowpass
      osc.connect(lp)
      node = lp
    }
    node.connect(g).connect(bus)
    osc.start(t0)
    osc.stop(t0 + o.dur + 0.03)
  }

  /** Полосовой шумовой всплеск (удары/крошево/глитч). */
  private noise(dur: number, gain: number, freq: number, q = 1): void {
    const out = this.out
    if (!out) return
    const { ctx, bus } = out
    const t0 = ctx.currentTime
    const n = Math.floor(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = freq
    bp.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(bp).connect(g).connect(bus)
    src.start(t0)
    src.stop(t0 + dur + 0.02)
  }

  // ---------- SFX ----------

  /** Прыжок с ВОЛС/движущейся: мягкий яркий блип вверх. Частый звук → тихий + рандом высоты. */
  jumpVols(): void {
    const r = 1 + (Math.random() * 0.06 - 0.03)
    this.tone({ type: 'triangle', f0: 430 * r, f1: 560 * r, dur: 0.1, gain: 0.13 })
  }

  /** Прыжок с РРЛ: ниже и «шаткий» блип-отскок (крошево разрушения — отдельно в shatter). */
  jumpRrl(): void {
    this.tone({ type: 'triangle', f0: 300, f1: 360, dur: 0.1, gain: 0.1 })
  }

  /** Полное разрушение РРЛ: крошево (шум) + низкий провал. */
  shatter(): void {
    this.noise(0.2, 0.09, 850, 0.6)
    this.tone({ type: 'triangle', f0: 180, f1: 80, dur: 0.16, gain: 0.07 })
  }

  /** Сбор кристалла: яркий колокольчик; в цепочке высота растёт (step 0,1,2… — арпеджио). */
  crystal(step = 0): void {
    const f = 880 * Math.pow(2, Math.min(step, 10) / 12)
    this.tone({ type: 'sine', f0: f, dur: 0.14, attack: 0.002, gain: 0.13 })
    this.tone({ type: 'sine', f0: f * 2, dur: 0.09, attack: 0.002, gain: 0.045 }) // октава-искра
  }

  /** Сбор бустера: восходящий свелл + высокая искра. base — оттенок под тип. */
  booster(base = 240): void {
    this.tone({ type: 'sawtooth', f0: base, f1: base * 3, dur: 0.22, attack: 0.01, gain: 0.1, lowpass: 1600 })
    this.tone({ type: 'sine', f0: base * 6, dur: 0.18, attack: 0.01, gain: 0.05 })
  }

  /** Спасение MiXX-щитом (батут от края): яркий «boing» вверх — заметнее обычного прыжка. */
  rescue(): void {
    this.tone({ type: 'triangle', f0: 400, f1: 900, dur: 0.26, gain: 0.14 })
    this.tone({ type: 'sine', f0: 1200, f1: 1900, dur: 0.2, attack: 0.01, gain: 0.05 })
  }

  /** Касание помехи (глитч): резкий короткий шумовой удар + провал вниз. */
  glitch(): void {
    this.noise(0.14, 0.1, 700, 0.5)
    this.tone({ type: 'square', f0: 220, f1: 90, dur: 0.12, gain: 0.05, lowpass: 900 })
  }

  /** Провал сквозь фейк: тихий нисходящий «растворяющийся» блип (обман). */
  fake(): void {
    this.tone({ type: 'triangle', f0: 520, f1: 180, dur: 0.16, gain: 0.07, lowpass: 1400 })
  }

  /** Падение за край / смерть: нисходящий power-down. Мягкий (лоупасс), не резкий. */
  death(): void {
    this.tone({ type: 'sawtooth', f0: 340, f1: 70, dur: 0.5, gain: 0.12, lowpass: 1200 })
    this.noise(0.4, 0.05, 480, 0.4)
  }

  /**
   * Переход эпохи — «вау-момент» (DoD). Аккорд-стаб со свеллом: мажорное трезвучие +
   * октава, корень поднимается с номером эпохи (выше = грандиознее) + высокая искра.
   */
  epochChord(id: number): void {
    const roots = [196, 220, 262, 294, 330] // G3 A3 C4 D4 E4 — восходящий строй эпох
    const root = roots[Math.min(Math.max(id, 1), 5) - 1]
    const chord = [1, 1.25, 1.5, 2] // мажор + октава
    chord.forEach((m, i) =>
      this.tone({ type: 'triangle', f0: root * m, dur: 1.1, attack: 0.06, gain: 0.085 - i * 0.012, lowpass: 3200 }),
    )
    this.tone({ type: 'sine', f0: root * 4, dur: 0.55, attack: 0.03, gain: 0.04 })
  }
}

/** Единый экземпляр звука на приложение. */
export const audio = new AudioManager()

if (import.meta.env.DEV) {
  ;(window as unknown as { __audio: AudioManager }).__audio = audio
}
