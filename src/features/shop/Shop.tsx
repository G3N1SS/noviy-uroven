import { useRef, useState } from 'react'
import './shop.css'
import { useUi } from '../../shared/store/ui'
import { balance } from '../../game/config/balance'
import { getCrystalTotal } from '../../shared/storage/local'

/**
 * Магазин (ТЗ 3.5). Витрина наград T2: бенто-грид, фильтры по категориям, цены в
 * кристаллах. Реальный обмен подключим с бэкендом/биллингом T2 (Этап 7) — сейчас
 * честно: хватает кристаллов → «Забрать» показывает «обмен скоро»; не хватает → «Не хватает N».
 */
const CAT_LABEL: Record<string, string> = {
  tariff: 'Тариф',
  mixx: 'MiXX',
  safewall: 'SafeWall',
  partners: 'Партнёры',
}
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'tariff', label: 'Тариф' },
  { key: 'mixx', label: 'MiXX' },
  { key: 'safewall', label: 'SafeWall' },
  { key: 'partners', label: 'Партнёры' },
]

export function Shop() {
  const backToMenu = useUi((s) => s.backToMenu)
  const [filter, setFilter] = useState('all')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number>()
  const crystals = getCrystalTotal()

  const rewards = balance.economy.rewards
  const items = filter === 'all' ? rewards : rewards.filter((r) => r.cat === filter)

  const flashToast = (msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 1800)
  }

  const take = (price: number, affordable: boolean) => {
    flashToast(
      affordable
        ? 'Обмен на награды T2 — совсем скоро'
        : `Не хватает ${price - crystals} кристаллов`,
    )
  }

  return (
    <div className="shop">
      <div className="shop__header">
        <button className="shop__back" aria-label="Назад" onClick={backToMenu}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 className="shop__title">Магазин</h1>
        <div className="shop__balance">
          <span className="shop__balance-icon" aria-hidden="true" />
          <span className="shop__balance-count">{crystals}</span>
        </div>
      </div>

      <div className="shop__banner">
        <span className="shop__banner-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8h.01M11 12h1v4h1" />
          </svg>
        </span>
        <span className="shop__banner-text">
          Концепт. Обмен на награды подключим с интеграцией T2 — пока это витрина.
        </span>
      </div>

      <div className="shop__filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`shop__filter${filter === f.key ? ' shop__filter--active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="shop__grid">
        {items.map((r) => {
          const affordable = crystals >= r.price
          return (
            <div className="shop__card" key={r.id}>
              <span className="shop__cat">{CAT_LABEL[r.cat] ?? r.cat}</span>
              <span className="shop__card-title">{r.title}</span>
              <div className="shop__price">
                <span className="shop__price-icon" aria-hidden="true" />
                <span className="shop__price-count">{r.price}</span>
              </div>
              <button
                className={`shop__take${affordable ? '' : ' shop__take--locked'}`}
                onClick={() => take(r.price, affordable)}
              >
                {affordable ? 'Забрать' : 'Не хватает'}
              </button>
            </div>
          )
        })}
      </div>

      <div className={`shop__toast${toast ? ' shop__toast--show' : ''}`}>{toast}</div>
    </div>
  )
}
