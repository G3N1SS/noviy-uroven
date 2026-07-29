import { useRef, useState } from 'react'
import './iosInstallSheet.css'

/**
 * Шторка-инструкция установки на iOS (Этап 5). На айфоне нет API установки — ставят вручную
 * через «Поделиться → На экран „Домой"». Показываем шаги в фирстиле T2. Открывается по тапу
 * на кнопку «Поставить на домашний экран» (только на iOS; на Android там системный диалог).
 *
 * Закрывается тапом «Понятно», тапом по фону ИЛИ свайпом вниз (естественный жест bottom-sheet):
 * панель едет за пальцем, отпустил за порогом — закрылась, иначе пружинит назад.
 */
const CLOSE_THRESHOLD_PX = 90

export function IosInstallSheet({ onClose }: { onClose: () => void }) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [free, setFree] = useState(false) // после первого касания — выезд-анимацию гасим, рулит драг
  const startY = useRef(0)
  // Активность драга — в ref (не state): pointermove может прийти в том же тике, что и
  // pointerdown, а setState ещё не закоммичен. Ref обновляется синхронно.
  const active = useRef(false)
  const dy = useRef(0)

  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY
    active.current = true
    setFree(true)
    setDragging(true)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* нет активного указателя (редкий кейс) — драг работает и без капчи */
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!active.current) return
    dy.current = Math.max(0, e.clientY - startY.current) // только вниз
    setDragY(dy.current)
  }
  const onPointerUp = () => {
    if (!active.current) return
    active.current = false
    setDragging(false)
    if (dy.current > CLOSE_THRESHOLD_PX) onClose()
    else setDragY(0) // не дотянул — пружиним назад
    dy.current = 0
  }

  return (
    <div className="ish" onClick={onClose}>
      <div
        className={`ish__panel${free ? ' ish__panel--free' : ''}${dragging ? ' ish__panel--dragging' : ''}`}
        style={{ '--drag': `${dragY}px` } as React.CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label="Установка на домашний экран"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="ish__grip" aria-hidden="true" />
        <h2 className="ish__title">На домашний экран</h2>
        <p className="ish__sub">Три шага — и игра запускается с иконки, как приложение. И работает офлайн.</p>

        <ol className="ish__steps">
          <li className="ish__step">
            <span className="ish__num">1</span>
            <span className="ish__text">
              Нажмите
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
              Пролистайте и выберите <b>«На экран „Домой"»</b>
            </span>
          </li>
          <li className="ish__step">
            <span className="ish__num">3</span>
            <span className="ish__text">
              Нажмите <b>«Добавить»</b> — готово
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
