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
    <path d="M6.29977 5H21L19 12H7.37671M20 16H8L6 3H3M9 20C9 20.5523 8.55228 21 8 21C7.44772 21 7 20.5523 7 20C7 19.4477 7.44772 19 8 19C8.55228 19 9 19.4477 9 20ZM20 20C20 20.5523 19.5523 21 19 21C18.4477 21 18 20.5523 18 20C18 19.4477 18.4477 19 19 19C19.5523 19 20 19.4477 20 20Z" />
  ),
  trophy: <path d="M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4v1a3 3 0 0 0 3 3m10-4h3v1a3 3 0 0 1-3 3M9 18h6m-3-4v4" />,
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
  const openSettings = useUi((s) => s.openSettings)
  const openRules = useUi((s) => s.openRules)
  const openShop = useUi((s) => s.openShop)
  // Полная интро один раз (первый показ меню); возврат из игры/настроек → лёгкий фейд.
  // Флаг в сторе (переживает двойной монтаж StrictMode и remount при навигации).
  const [entrance, setEntrance] = useState<'intro' | 'enter' | null>(
    useUi.getState().menuIntroDone ? 'enter' : 'intro',
  )
  const hintTimer = useRef<number>()

  // Снимаем класс входа после проигрыша — чтобы `animation` не конфликтовал с
  // transition'ами запуска (PLAY трогают обе фазы). После интро помечаем его сыгранным.
  useEffect(() => {
    if (entrance === 'intro') useUi.getState().markMenuIntroDone()
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
            onClick={() =>
              n.key === 'settings'
                ? openSettings()
                : n.key === 'help'
                  ? openRules()
                  : n.key === 'store'
                    ? openShop()
                    : soon(n.label)
            }
          >
            {n.key === 'settings' ? (
              <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M11.2 1.646a2.03 2.03 0 00-2.4 0c-.736.54-1.942 1.398-2.796 1.886-.794.453-1.894.935-2.635 1.242a2.046 2.046 0 00-1.244 2.161c.115.849.264 2.142.264 3.065 0 .906-.144 2.171-.258 3.021a2.05 2.05 0 001.34 2.199c.86.307 2.132.797 2.922 1.248.762.436 1.699 1.193 2.327 1.733a2.051 2.051 0 002.544.106c.743-.543 1.904-1.365 2.732-1.839.794-.453 1.894-.935 2.635-1.242a2.046 2.046 0 001.244-2.161c-.114-.848-.264-2.142-.264-3.065s.15-2.216.264-3.065a2.046 2.046 0 00-1.244-2.161c-.741-.307-1.841-.789-2.635-1.242-.854-.488-2.06-1.347-2.796-1.886zM9.983 3.259A.028.028 0 0110 3.253c.007 0 .013.002.017.006.732.536 2.022 1.458 2.987 2.01.911.52 2.112 1.042 2.861 1.352.008.004.016.01.022.02a.04.04 0 01.006.027c-.115.85-.282 2.262-.282 3.332 0 1.07.167 2.483.282 3.332a.04.04 0 01-.006.027.045.045 0 01-.022.02c-.75.31-1.95.832-2.861 1.353-.938.535-2.181 1.42-2.92 1.96a.036.036 0 01-.024.007.059.059 0 01-.036-.014c-.635-.546-1.697-1.415-2.639-1.953-.96-.55-2.387-1.09-3.24-1.396a.046.046 0 01-.025-.02.044.044 0 01-.007-.03c.114-.852.276-2.234.276-3.286 0-1.07-.167-2.483-.282-3.332a.04.04 0 01.006-.027.045.045 0 01.022-.02c.75-.31 1.95-.832 2.861-1.353.965-.551 2.255-1.473 2.987-2.01zM9 10a1 1 0 112 0 1 1 0 01-2 0zm1-3a3 3 0 100 6 3 3 0 000-6z"
                />
              </svg>
            ) : (
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
            )}
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
