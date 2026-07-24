import './leaderboard.css'
import { useUi } from '../../shared/store/ui'
import { getBestHeight, getCrystalTotal } from '../../shared/storage/local'

/**
 * Лидерборд (ТЗ 3.5) — пока ЗАГЛУШКА. Мировой топ требует бэкенда и синка (Этап 6),
 * поэтому честно: показываем реальный ЛОКАЛЬНЫЙ рекорд игрока + честный статус
 * «глобальный топ подключим с сетью». Никаких выдуманных соперников — врать не будем.
 */
export function Leaderboard() {
  const backToMenu = useUi((s) => s.backToMenu)
  const best = getBestHeight()
  const crystals = getCrystalTotal()

  return (
    <div className="lb">
      <div className="lb__header">
        <button className="lb__back" aria-label="Назад" onClick={backToMenu}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 className="lb__title">Лидерборд</h1>
      </div>

      {/* Реальный локальный рекорд — единственные честные данные без сети */}
      <div className="lb__card lb__card--you">
        <div className="lb__you-badge">ТЫ</div>
        <div className="lb__you-main">
          <div className="lb__label">ЛУЧШИЙ ЗАБЕГ</div>
          <div className="lb__height">
            <span className="lb__height-value">{best}</span>
            <span className="lb__height-unit">м</span>
          </div>
        </div>
        <div className="lb__you-crystals">
          <span className="lb__crystal" aria-hidden="true" />
          <span className="lb__crystal-count">{crystals}</span>
        </div>
      </div>

      {/* Честный статус: мировой топ — с бэкендом (Этап 6) */}
      <div className="lb__world">
        <div className="lb__world-icon" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
          </svg>
        </div>
        <div className="lb__world-title">Мировой топ на подходе</div>
        <div className="lb__world-desc">
          Подключим, когда появится сеть. Тогда узнаешь, кто выше — ты или вся страна.
        </div>
        <div className="lb__world-status">
          <span className="lb__pulse" aria-hidden="true" />
          Ждёт подключения
        </div>
      </div>
    </div>
  )
}
