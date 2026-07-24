import './updateToast.css'

/**
 * Тост «вышла новая версия» (Этап 5, DoD). Блок `toast` по БЭМ.
 *
 * Обновляемся только по кнопке (registerType: 'prompt'): молча перезагрузить игру
 * посреди партии — потерять забег. Тост ждёт столько, сколько нужно; отказ прячет его
 * до следующего захода.
 */
export function createUpdateToast(onUpdate: () => void): { show: () => void; hide: () => void } {
  const root = document.createElement('div')
  root.className = 'toast'

  const text = document.createElement('div')
  text.className = 'toast__text'
  text.textContent = 'Есть версия посвежее'
  root.appendChild(text)

  const actions = document.createElement('div')
  actions.className = 'toast__actions'
  root.appendChild(actions)

  const later = document.createElement('button')
  later.className = 'toast__btn'
  later.textContent = 'Потом'
  later.addEventListener('click', () => hide())
  actions.appendChild(later)

  const now = document.createElement('button')
  now.className = 'toast__btn toast__btn--primary'
  now.textContent = 'Обновить'
  now.addEventListener('click', () => {
    hide()
    onUpdate()
  })
  actions.appendChild(now)

  document.body.appendChild(root)

  const show = () => root.classList.add('toast--open')
  const hide = () => root.classList.remove('toast--open')
  return { show, hide }
}
