import { useEffect, useRef, useState } from 'react'
import './mainMenu.css'
import { useUi } from '../../shared/store/ui'
import { getBestHeight, getCrystalTotal } from '../../shared/storage/local'

/**
 * Главное меню (Этап 3, вариант H). Показывается на старте и по выходу из игры.
 * PLAY стартует свежую партию через роутер (`useUi.play`). Разделы магазин/лидерборд/
 * настройки/правила ещё не готовы — вместо мёртвых ссылок показываем честный тост «Скоро».
 */
// Минимальные инлайн-SVG (без иконочного шрифта — офлайн-first, ноль зависимостей).
const ICON: Record<string, JSX.Element> = {
  store: (
    <path d="M4 8h16l-1 4H5L4 8Zm0 0-1-3H2m4 9v6h12v-6M9 20v-5h6v5" />
  ),
  trophy: <path d="M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4v1a3 3 0 0 0 3 3m10-4h3v1a3 3 0 0 1-3 3M9 18h6m-3-4v4" />,
  settings: (
    <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 3-2-.4-.5-1.3 1.1-1.7-1.5-1.5L15.4 7l-1.3-.5L13.7 4h-2l-.4 2.1-1.3.5-1.7-1.1-1.5 1.5L7 8.7l-.5 1.3L4 10.4v2l2.1.4.5 1.3-1.1 1.7 1.5 1.5 1.7-1.1 1.3.5.4 2.1h2l.4-2.1 1.3-.5 1.7 1.1 1.5-1.5-1.1-1.7.5-1.3L20 12.4Z" />
  ),
  help: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-2 6a2 2 0 1 1 3 1.7c-.7.5-1 .8-1 1.8m0 3v0" />,
}
const NAV: Array<{ key: string; label: string }> = [
  { key: 'store', label: 'Магазин' },
  { key: 'trophy', label: 'Лидерборд' },
  { key: 'settings', label: 'Настройки' },
  { key: 'help', label: 'Правила' },
]

export function MainMenu() {
  const beginGame = useUi((s) => s.beginGame)
  const enterGame = useUi((s) => s.enterGame)
  const [hint, setHint] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)
  const [handoff, setHandoff] = useState(false)
  // Первый показ меню (до старта игры) → полная интро; возврат из игры → лёгкий фейд.
  // Флаг в сторе, а не в модуле: переживает двойной монтаж React.StrictMode.
  const [entrance, setEntrance] = useState<'intro' | 'enter' | null>(
    useUi.getState().firstMenu ? 'intro' : 'enter',
  )
  const hintTimer = useRef<number>()

  // Снимаем класс входа после проигрыша — чтобы `animation` не конфликтовал с
  // transition'ами запуска (PLAY трогают обе фазы).
  useEffect(() => {
    const d = entrance === 'intro' ? 1350 : 400
    const t = window.setTimeout(() => setEntrance(null), d)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Значения читаем при рендере: меню монтируется на входе в экран → всегда свежие.
  const best = getBestHeight()
  const crystals = getCrystalTotal()

  // «Прогруз» (AAA-хореография): контент меню разлетается → орб-сигнал с хвостом и
  // squash&stretch взлетает к 58vh → бёрст (кольца+искры). Конец — БЕЗ жёсткого реза:
  //  ~0.85с игра стартует ПОД меню (фон чёрный совпадает) → фон меню плавно уходит в
  //  прозрачность (кросс-диссолв: орб растворяется прямо в персонаже) → размонтирование.
  const launch = () => {
    if (launching) return
    setLaunching(true)
    window.setTimeout(() => beginGame(), 850) // игра появляется под чёрным фоном меню
    window.setTimeout(() => setHandoff(true), 960) // фон меню → прозрачность (кросс-фейд)
    window.setTimeout(() => enterGame(), 1360) // меню уже прозрачно → незаметный демонтаж
  }

  // Искры бёрста: направления фиксированные (не рандом) — одинаково красиво каждый запуск.
  const SPARKS: Array<{ dx: number; dy: number; white?: boolean }> = [
    { dx: 46, dy: -30 },
    { dx: -44, dy: -34, white: true },
    { dx: 56, dy: 12 },
    { dx: -58, dy: 8 },
    { dx: 24, dy: -52, white: true },
    { dx: -20, dy: -56 },
  ]

  const soon = (label: string) => {
    setHint(`${label} — скоро`)
    window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(null), 1400)
  }

  return (
    <div
      className={`menu${entrance ? ` menu--${entrance}` : ''}${
        launching ? ' menu--launching' : ''
      }${handoff ? ' menu--handoff' : ''}`}
    >
      <div className="menu__top">
        <div>
          <h1 className="menu__title">
            НОВЫЙ
            <br />
            УРОВЕНЬ
          </h1>
          <div className="menu__tagline">ДРУГИЕ ПРАВИЛА</div>
        </div>
        <div className="menu__record">
          <div className="menu__record-label">РЕКОРД</div>
          <div className="menu__record-value">{best}</div>
          <div className="menu__record-crystals">
            <span className="menu__crystal" aria-hidden="true" />
            <span className="menu__crystal-count">{crystals}</span>
          </div>
        </div>
      </div>

      <button className="menu__play" onClick={launch} disabled={launching}>
        <span className="menu__play-label">ИГРАТЬ</span>
        <span className="menu__play-sub">вперёд и вверх</span>
        <span className="menu__signal" aria-hidden="true" />
      </button>

      <nav className="menu__nav">
        {NAV.map((n) => (
          <button
            key={n.key}
            className="menu__nav-btn"
            aria-label={n.label}
            onClick={() => soon(n.label)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {ICON[n.key]}
            </svg>
          </button>
        ))}
      </nav>

      <div className={`menu__hint${hint ? ' menu__hint--show' : ''}`}>{hint}</div>

      {launching && (
        <div className="menu__launch" aria-hidden="true">
          <div className="menu__launch-tail" />
          <div className="menu__launch-orb" />
          <div className="menu__launch-ring" />
          <div className="menu__launch-ring menu__launch-ring--2" />
          {SPARKS.map((s, i) => (
            <span
              key={i}
              className={`menu__launch-spark${s.white ? ' menu__launch-spark--white' : ''}`}
              style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px` } as React.CSSProperties}
            />
          ))}
        </div>
      )}
    </div>
  )
}
