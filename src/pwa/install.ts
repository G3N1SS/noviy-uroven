/**
 * Установка на домашний экран (Этап 5, конспект 4.5). Свой UI вместо браузерной плашки:
 * ловим `beforeinstallprompt`, гасим системный баннер и показываем СВОЮ кнопку там, где
 * она уместна (главное меню).
 *
 * Событие прилетает один раз и только когда браузер счёл сайт устанавливаемым (Chrome /
 * Android). Safari его не шлёт вовсе — на iOS установка идёт через «Поделиться → На экран
 * «Домой»», поэтому кнопки там просто не будет (врать про несуществующую установку хуже,
 * чем её отсутствие).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<(can: boolean) => void>()

function emit(): void {
  for (const l of listeners) l(deferred !== null)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // системный баннер гасим — покажем свою кнопку
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null // установили — кнопка больше не нужна
    emit()
  })
}

/** Можно ли предложить установку прямо сейчас. */
export function canInstall(): boolean {
  return deferred !== null
}

/** iOS-устройство (iPhone/iPad/iPod, включая iPadOS, маскирующийся под Mac). */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iP(hone|ad|od)/.test(ua)) return true
  // iPadOS 13+ отдаёт UA как Mac — ловим по тач-точкам.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** Приложение уже запущено с домашнего экрана (standalone) — установка не нужна. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

/**
 * На iOS нет API установки (Safari не шлёт beforeinstallprompt) — ставят вручную через
 * «Поделиться → На экран „Домой"». Поэтому вместо системного диалога показываем свою
 * кнопку с инструкцией-шторкой. true — если это iOS и игра ещё не установлена.
 */
export function canShowIosHint(): boolean {
  return isIos() && !isStandalone()
}

/** Подписка на появление/исчезновение возможности установить. Возвращает отписку. */
export function onInstallAvailability(cb: (can: boolean) => void): () => void {
  listeners.add(cb)
  cb(canInstall())
  return () => listeners.delete(cb)
}

/** Показать системный диалог установки. true — пользователь согласился. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const e = deferred
  deferred = null // событие одноразовое: второй prompt() по нему браузер отвергнет
  emit()
  try {
    await e.prompt()
    const { outcome } = await e.userChoice
    return outcome === 'accepted'
  } catch {
    return false
  }
}
