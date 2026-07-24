import { useState } from 'react'
import './onboarding.css'
import { useUi } from '../../shared/store/ui'
import type { ControlMode } from '../../game/controls/types'

/**
 * Онбординг выбора управления (ТЗ 3.5): «Как удобнее играть?» → 2 карточки → в меню.
 * Наклон запрашивает доступ к датчику движения (iOS 13+) прямо по тапу; при отказе —
 * подсказка и остаёмся на экране (можно выбрать Свайп). Зоны — тонкая настройка на паузе.
 */
const TiltIcon = (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="8.5" y="3.5" width="11" height="17" rx="2.5" transform="rotate(14 14 12)" />
    <path d="M4 9c-1 1.2-1 3.6 0 4.8M2.6 7.4c-1.7 2-1.7 6 0 8" opacity="0.7" />
  </svg>
)
const SwipeIcon = (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v4.5a5 5 0 0 1-5 5h-1.6a4 4 0 0 1-3-1.4L5 15.2a1.6 1.6 0 0 1 2.3-2.2l1.7 1.5" />
    <path d="M4 8h4M4 8l1.6-1.6M4 8l1.6 1.6" opacity="0.7" />
  </svg>
)

const CARDS: Array<{ mode: ControlMode; label: string; desc: string; icon: JSX.Element }> = [
  { mode: 'tilt', label: 'Наклон', desc: 'Наклоняй телефон влево-вправо', icon: TiltIcon },
  { mode: 'follow', label: 'Свайп', desc: 'Веди пальцем по экрану', icon: SwipeIcon },
]

export function Onboarding() {
  const chooseControl = useUi((s) => s.chooseControl)
  const ready = useUi((s) => s.controls !== null)
  const [busy, setBusy] = useState<ControlMode | null>(null)
  const [denied, setDenied] = useState(false)

  const choose = async (mode: ControlMode) => {
    if (!ready || busy) return
    setBusy(mode)
    setDenied(false)
    const ok = await chooseControl(mode)
    // ok → стор переключил экран на 'menu' → Onboarding размонтируется.
    if (!ok) {
      setDenied(true) // наклон отклонён на iOS — остаёмся, предлагаем Свайп
      setBusy(null)
    }
  }

  return (
    <div className="onb">
      <h1 className="onb__title">Как удобнее играть?</h1>
      <p className="onb__sub">Поменять можно в любой момент на паузе</p>

      <div className="onb__cards">
        {CARDS.map((c) => (
          <button
            key={c.mode}
            className={`onb__card${busy && busy !== c.mode ? ' onb__card--busy' : ''}`}
            onClick={() => choose(c.mode)}
            disabled={!ready}
          >
            <span className="onb__icon">{c.icon}</span>
            <span className="onb__card-label">{c.label}</span>
            <span className="onb__card-desc">{c.desc}</span>
          </button>
        ))}
      </div>

      <div className={`onb__hint${denied ? ' onb__hint--show' : ''}`}>
        Нужен доступ к датчику движения. Выбери «Свайп» или разреши в настройках
      </div>
    </div>
  )
}
