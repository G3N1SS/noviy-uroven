import { useState } from 'react'
import './settings.css'
import { useUi } from '../../shared/store/ui'
import type { ControlMode } from '../../game/controls/types'
import {
  getSound,
  setSound,
  getMusic,
  setMusic,
  getVibro,
  setVibro,
  getControlSensitivity,
  setControlSensitivity,
  getDisplayName,
  setCustomName,
} from '../../shared/storage/local'
import { audio } from '../../shared/audio/audioManager'
import { haptics } from '../../shared/audio/haptics'
import { sanitizeName, NAME_MAX } from '../../shared/net/name'
import { ensurePlayerId } from '../../shared/net/identity'
import { updateName } from '../../shared/net/api'
import { syncNow } from '../../shared/net/sync'

/**
 * Экран настроек (ТЗ 3.5, вариант A). Управление (пилюли + чувствительность наклона) —
 * рабочее сразу и применяется к живому ControlsManager. Тумблеры звука — задел под
 * Этап 4: состояние сохраняется, но управлять пока нечем (аудио-слоя нет).
 */
const CONTROLS: Array<{ mode: ControlMode; label: string; sensLabel: string }> = [
  { mode: 'tilt', label: 'Наклон', sensLabel: 'ЧУВСТВИТЕЛЬНОСТЬ НАКЛОНА' },
  { mode: 'follow', label: 'Свайп', sensLabel: 'ЧУВСТВИТЕЛЬНОСТЬ СВАЙПА' },
  { mode: 'zones', label: 'Зоны', sensLabel: 'ЧУВСТВИТЕЛЬНОСТЬ ЗОН' },
]

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      className={`set__switch${on ? ' set__switch--on' : ''}`}
      role="switch"
      aria-checked={on}
      onClick={onToggle}
    >
      <span className="set__knob" />
    </button>
  )
}

export function Settings() {
  const controls = useUi((s) => s.controls)
  const backToMenu = useUi((s) => s.backToMenu)

  const initialMode = controls?.currentControl() ?? 'follow'
  const [mode, setMode] = useState<ControlMode>(initialMode)
  // Чувствительность — СВОЯ на каждый режим; при смене пилюли слайдер показывает её.
  const [sens, setSens] = useState(() => getControlSensitivity(initialMode))
  const [sound, setSoundS] = useState(getSound)
  const [music, setMusicS] = useState(getMusic)
  const [vibro, setVibroS] = useState(getVibro)

  // Позывной (Этап 6): показывается в лидерборде. Пусто — покажем плейсхолдер.
  const [nick, setNick] = useState(getDisplayName)
  const [hint, setHint] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null)
  const [saving, setSaving] = useState(false)

  const saveNick = async () => {
    const clean = sanitizeName(nick)
    if (!clean) {
      setHint({ text: `Минимум 2 символа, до ${NAME_MAX}`, kind: 'error' })
      return
    }
    setSaving(true)
    setCustomName(clean) // сохранён локально сразу — не потеряется даже офлайн
    setNick(clean)
    const online = navigator.onLine !== false
    try {
      if (online) await updateName(ensurePlayerId(), clean) // мгновенно на сервер
      void syncNow(true)
      setHint({ text: online ? 'Сохранено' : 'Сохранится при подключении', kind: 'ok' })
    } catch {
      // сервер недоступен — ник уже локально, синк дошлёт его позже
      setHint({ text: 'Сохранится при подключении', kind: 'ok' })
    } finally {
      setSaving(false)
    }
  }

  const nickDirty = sanitizeName(nick) !== null && nick.trim() !== getDisplayName()

  const pickMode = async (m: ControlMode) => {
    if (m === mode) return
    const ok = await controls?.setControl(m)
    if (ok) {
      setMode(m) // false = iOS отклонил наклон → пилюля не переключается
      setSens(getControlSensitivity(m)) // слайдер под новый режим
    }
  }

  const changeSens = (v: number) => {
    setSens(v)
    setControlSensitivity(mode, v) // применится при старте партии (контроллер перечитывает на reset)
  }

  const sensLabel = CONTROLS.find((c) => c.mode === mode)?.sensLabel ?? 'ЧУВСТВИТЕЛЬНОСТЬ'

  const toggle = (
    val: boolean,
    setLocal: (v: boolean) => void,
    persist: (v: boolean) => void,
    haptic = false,
  ) => {
    const next = !val
    setLocal(next)
    persist(next)
    if (haptic && next && 'vibrate' in navigator) navigator.vibrate?.(30)
  }

  const fill = Math.round(sens * 100)

  return (
    <div className="set">
      <div className="set__header">
        <button className="set__back" aria-label="Назад" onClick={backToMenu}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 className="set__title">Настройки</h1>
      </div>

      <div className="set__card">
        <div className="set__label">НИКНЕЙМ</div>
        <div className="set__nick">
          <input
            className={`set__input${hint?.kind === 'error' ? ' set__input--error' : ''}`}
            type="text"
            inputMode="text"
            maxLength={NAME_MAX}
            placeholder="Твой никнейм"
            value={nick}
            onChange={(e) => {
              setNick(e.target.value)
              if (hint) setHint(null)
            }}
            aria-label="Никнейм"
          />
          <button className="set__save" onClick={saveNick} disabled={saving || !nickDirty}>
            Сохранить
          </button>
        </div>
        {hint && (
          <p className={`set__hint set__hint--${hint.kind}`}>{hint.text}</p>
        )}
        {!hint && (
          <p className="set__hint">Так тебя увидят в лидерборде</p>
        )}
      </div>

      <div className="set__card">
        <div className="set__label">УПРАВЛЕНИЕ</div>
        <div className="set__pills">
          {CONTROLS.map((c) => (
            <button
              key={c.mode}
              className={`set__pill${mode === c.mode ? ' set__pill--active' : ''}`}
              onClick={() => pickMode(c.mode)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="set__sens">
          <div className="set__label">{sensLabel}</div>
          <input
            className="set__range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={fill}
            onChange={(e) => changeSens(Number(e.target.value) / 100)}
            style={{
              background: `linear-gradient(to right, var(--t2-magenta) ${fill}%, rgba(255,255,255,0.16) ${fill}%)`,
            }}
          />
        </div>
      </div>

      <div className="set__card">
        <div className="set__label">ЗВУК И ВИБРАЦИЯ</div>
        <div className="set__row">
          <span className="set__row-label">Звуки</span>
          <Switch
            on={sound}
            onToggle={() =>
              toggle(sound, setSoundS, (v) => {
                setSound(v)
                audio.setSound(v) // живое применение — движок сразу замолкает/оживает
              })
            }
          />
        </div>
        <div className="set__row">
          <span className="set__row-label">Музыка</span>
          <Switch on={music} onToggle={() => toggle(music, setMusicS, setMusic)} />
        </div>
        <div className="set__row">
          <span className="set__row-label">Вибрация</span>
          <Switch
            on={vibro}
            onToggle={() =>
              toggle(
                vibro,
                setVibroS,
                (v) => {
                  setVibro(v)
                  haptics.setEnabled(v) // живое применение
                },
                true,
              )
            }
          />
        </div>
      </div>

      <p className="set__note">Звук появится в одном из ближайших обновлений</p>
    </div>
  )
}
