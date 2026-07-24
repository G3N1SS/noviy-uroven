import './rules.css'
import { useUi } from '../../shared/store/ui'

/**
 * Экран правил (ТЗ 3.5). Коротко и дерзко (2.13): цель, вышки, бустеры, опасности,
 * кристаллы, эпохи — по одной строке с глифом. Без длинных туториалов.
 */
export function Rules() {
  const backToMenu = useUi((s) => s.backToMenu)

  return (
    <div className="rules">
      <div className="rules__header">
        <button className="rules__back" aria-label="Назад" onClick={backToMenu}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 className="rules__title">Правила</h1>
      </div>

      <p className="rules__goal">
        Прыгай <b>вверх</b> по вышкам связи. Выше — круче. Упал за нижний край — начинаешь
        сначала.
      </p>

      <div className="rules__section">
        <div className="rules__label">УПРАВЛЕНИЕ</div>
        <div className="rules__row">
          <span className="rules__glyph" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 12h14M5 12l4-4M5 12l4 4M19 12l-4-4M19 12l-4 4" />
            </svg>
          </span>
          <span className="rules__text">
            <span className="rules__row-title">Только влево-вправо</span>
            <span className="rules__row-desc">Прыжок автоматический. Схему выбрал в настройках</span>
          </span>
        </div>
      </div>

      <div className="rules__section">
        <div className="rules__label">ВЫШКИ</div>
        <div className="rules__row">
          <span className="rules__glyph"><span className="rules__bar rules__bar--vols" /></span>
          <span className="rules__text">
            <span className="rules__row-title">ВОЛС</span>
            <span className="rules__row-desc">Надёжная, вечная. Твоя опора</span>
          </span>
        </div>
        <div className="rules__row">
          <span className="rules__glyph"><span className="rules__bar rules__bar--rrl" /></span>
          <span className="rules__text">
            <span className="rules__row-title">РРЛ</span>
            <span className="rules__row-desc">Развалится сразу после прыжка. Не задерживайся</span>
          </span>
        </div>
        <div className="rules__row">
          <span className="rules__glyph"><span className="rules__bar rules__bar--moving" /></span>
          <span className="rules__text">
            <span className="rules__row-title">Движущаяся</span>
            <span className="rules__row-desc">Ездит по горизонтали. Лови момент</span>
          </span>
        </div>
        <div className="rules__row">
          <span className="rules__glyph"><span className="rules__bar rules__bar--fake" /></span>
          <span className="rules__text">
            <span className="rules__row-title">Фейк</span>
            <span className="rules__row-desc">Притворяется ВОЛС и растворяется под ногами. Ловушка</span>
          </span>
        </div>
      </div>

      <div className="rules__section">
        <div className="rules__label">БУСТЕРЫ = ПРОДУКТЫ T2</div>
        <div className="rules__row">
          <span className="rules__glyph"><span className="rules__dot rules__dot--gigaback">×2</span></span>
          <span className="rules__text">
            <span className="rules__row-title">Гигабэк</span>
            <span className="rules__row-desc">Удваивает кристаллы на 10 секунд</span>
          </span>
        </div>
        <div className="rules__row">
          <span className="rules__glyph"><span className="rules__dot rules__dot--shield" /></span>
          <span className="rules__text">
            <span className="rules__row-title">MiXX-щит</span>
            <span className="rules__row-desc">Спасает от одного падения — подбросит вверх</span>
          </span>
        </div>
        <div className="rules__row">
          <span className="rules__glyph"><span className="rules__dot rules__dot--safewall" /></span>
          <span className="rules__text">
            <span className="rules__row-title">SafeWall</span>
            <span className="rules__row-desc">Иммунитет к помехам и подсветка фейков</span>
          </span>
        </div>
      </div>

      <div className="rules__section">
        <div className="rules__label">ОПАСНОСТИ И ДОБЫЧА</div>
        <div className="rules__row">
          <span className="rules__glyph"><span className="rules__glitch" /></span>
          <span className="rules__text">
            <span className="rules__row-title">Помеха</span>
            <span className="rules__row-desc">Глитч-облако. Заденешь — отбросит вниз и заглушит управление</span>
          </span>
        </div>
        <div className="rules__row">
          <span className="rules__glyph"><span className="rules__diamond" /></span>
          <span className="rules__text">
            <span className="rules__row-title">Кристаллы</span>
            <span className="rules__row-desc">Собирай на награды. При смерти не сгорают</span>
          </span>
        </div>
      </div>

      <div className="rules__section">
        <div className="rules__label">ЭПОХИ</div>
        <div className="rules__row">
          <span className="rules__glyph" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF3495" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 20V9M12 20V5M18 20v-8" />
            </svg>
          </span>
          <span className="rules__text">
            <span className="rules__row-title">2G → 3G → LTE → 5G → Будущее</span>
            <span className="rules__row-desc">Каждые сотни метров — новый мир и новый вайб</span>
          </span>
        </div>
      </div>
    </div>
  )
}
