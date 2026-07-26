import './iosInstallSheet.css'

/**
 * Шторка-инструкция установки на iOS (Этап 5). На айфоне нет API установки — ставят вручную
 * через «Поделиться → На экран „Домой"». Показываем шаги в фирстиле T2. Открывается по тапу
 * на кнопку «Поставить на домашний экран» (только на iOS; на Android там системный диалог).
 */
export function IosInstallSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="ish" onClick={onClose}>
      <div
        className="ish__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Установка на домашний экран"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ish__grip" aria-hidden="true" />
        <h2 className="ish__title">На домашний экран</h2>
        <p className="ish__sub">Три шага — и игра запускается с иконки, как приложение. И работает офлайн.</p>

        <ol className="ish__steps">
          <li className="ish__step">
            <span className="ish__num">1</span>
            <span className="ish__text">
              Нажми
              <span className="ish__share" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 15V3m0 0l-4 4m4-4l4 4" />
                  <path d="M8 11H6a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2v-6a2 2 0 00-2-2h-2" />
                </svg>
              </span>
              «Поделиться» внизу экрана
            </span>
          </li>
          <li className="ish__step">
            <span className="ish__num">2</span>
            <span className="ish__text">
              Пролистай и выбери <b>«На экран „Домой"»</b>
            </span>
          </li>
          <li className="ish__step">
            <span className="ish__num">3</span>
            <span className="ish__text">
              Нажми <b>«Добавить»</b> — готово
            </span>
          </li>
        </ol>

        <button className="ish__ok" onClick={onClose}>
          Понятно
        </button>
      </div>
    </div>
  )
}
