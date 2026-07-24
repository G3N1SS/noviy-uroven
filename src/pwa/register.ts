import { registerSW } from 'virtual:pwa-register'
import { createUpdateToast } from './updateToast'

/**
 * Регистрация service worker'а (Этап 5). Precache собирает Workbox на сборке (см.
 * vite.config.ts): первый заход онлайн кладёт JS/CSS/HTML, шрифты и иконки в Cache
 * Storage — дальше игра открывается в авиарежиме.
 *
 * Стратегия обновления — 'prompt': новая версия не подменяет игру молча (это убило бы
 * текущий забег), а предлагается тостом. `updateSW(true)` активирует свежий SW и
 * перезагружает страницу.
 *
 * В dev SW не регистрируется (плагин отдаёт no-op) — отладке он только мешает.
 */
export function registerPwa(): void {
  let toast: ReturnType<typeof createUpdateToast> | null = null

  const updateSW = registerSW({
    onNeedRefresh() {
      toast ??= createUpdateToast(() => void updateSW(true))
      toast.show()
    },
  })
}
