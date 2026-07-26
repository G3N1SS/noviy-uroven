import './developers.css'
import { useUi } from '../../shared/store/ui'

/**
 * Экран «Разработчики» — команда проекта. Имя + ник в Telegram (тапабельно). Фирстиль T2:
 * бенто-карточки, текст только Ч/Б, магента — акцент бейджа-инициала.
 */
const TEAM: Array<{ name: string; handle: string }> = [
  { name: 'Саркисян А.С.', handle: 'g3n1ss' },
  { name: 'Кузнецов И.Р.', handle: 'shxdw' },
  { name: 'Полошков Я.В.', handle: 'wexul' },
]

export function Developers() {
  const backToMenu = useUi((s) => s.backToMenu)

  return (
    <div className="devs">
      <div className="devs__header">
        <button className="devs__back" aria-label="Назад" onClick={backToMenu}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 className="devs__title">Разработчики</h1>
      </div>

      <p className="devs__intro">Другие правила. Собрано этой командой.</p>

      <div className="devs__list">
        {TEAM.map((d) => (
          <a
            key={d.handle}
            className="devs__card"
            href={`https://t.me/${d.handle}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="devs__badge" aria-hidden="true">
              {d.name[0]}
            </span>
            <span className="devs__main">
              <span className="devs__name">{d.name}</span>
              <span className="devs__handle">@{d.handle}</span>
            </span>
            <svg className="devs__tg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </a>
        ))}
      </div>
    </div>
  )
}
