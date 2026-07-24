import { test, expect, type Page } from '@playwright/test'

/**
 * Офлайн-сценарий (Этап 5, DoD): первый заход онлайн кэширует всё → дальше игра
 * открывается, играется и сохраняет прогресс без сети. Автоматизация ровно того,
 * что проверялось руками (остановленный сервер + перезагрузка).
 *
 * Почему не dev-сервер: service worker есть только в прод-сборке, см. playwright.config.ts.
 */

/**
 * Дождаться, пока SW встанет и возьмёт страницу под контроль (иначе офлайн нечем отдавать).
 * Благодаря `clientsClaim` это происходит на первом же заходе, без перезагрузки; страховочный
 * reload оставлен на случай, если браузер не успел передать управление.
 */
async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  for (let i = 0; i < 3; i++) {
    const controlled = await page
      .waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    if (controlled) return
    await page.reload()
  }
  throw new Error('service worker так и не взял страницу под контроль')
}

/** Пройти онбординг (первый запуск) и оказаться в главном меню. */
async function passOnboarding(page: Page): Promise<void> {
  const card = page.locator('.onb__card').first()
  if (await card.isVisible().catch(() => false)) await card.click()
  await expect(page.locator('.menu__play')).toBeVisible()
}

test.describe('Офлайн (PWA)', () => {
  test('игра открывается и играется без сети', async ({ page, context }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto('/')
    await waitForServiceWorker(page)

    // Сеть выключена — дальше всё должно приезжать из precache.
    await context.setOffline(true)
    await page.reload()

    // Оболочка поднялась: канвас Pixi на месте, заголовок наш.
    await expect(page).toHaveTitle('Новый уровень')
    await expect(page.locator('canvas')).toBeVisible()

    // Доходим до игры. Канвас висит на экране с самого старта (игра ждёт на паузе),
    // поэтому его наличие ничего не доказывает — ждём именно РАЗМОНТИРОВАНИЯ меню.
    await passOnboarding(page)
    await page.locator('.menu__play').click()
    await expect(page.locator('.menu')).toHaveCount(0, { timeout: 15_000 })

    // И это не застывшая картинка: два кадра с интервалом должны отличаться —
    // персонаж падает/прыгает, фон живёт. Так проверяется, что цикл крутится офлайн.
    const frame1 = await page.locator('canvas').screenshot()
    await page.waitForTimeout(700)
    const frame2 = await page.locator('canvas').screenshot()
    expect(frame1.equals(frame2)).toBe(false)

    expect(errors).toEqual([])
    await context.setOffline(false)
  })

  test('весь precache отдаётся из кэша, а не из сети', async ({ page, context }) => {
    await page.goto('/')
    await waitForServiceWorker(page)
    await context.setOffline(true)
    await page.reload()

    const cached = await page.evaluate(async () => {
      const names = await caches.keys()
      const precache = names.find((n) => n.includes('workbox-precache'))
      if (!precache) return null
      const keys = await (await caches.open(precache)).keys()
      const urls = keys.map((k) => k.url)
      return {
        total: urls.length,
        shell: urls.some((u) => u.includes('index.html')),
        icons: urls.filter((u) => u.includes('/icons/')).length,
        fonts: urls.filter((u) => u.includes('woff2')).length,
      }
    })

    expect(cached).not.toBeNull()
    expect(cached!.shell).toBe(true) // без оболочки офлайн-заход невозможен
    expect(cached!.icons).toBeGreaterThanOrEqual(3) // 192 + 512 + maskable
    expect(cached!.fonts).toBeGreaterThan(0) // иначе офлайн поедет системный шрифт

    await context.setOffline(false)
  })

  test('прогресс переживает офлайн и очистку localStorage', async ({ page, context }) => {
    await page.goto('/')
    await waitForServiceWorker(page)

    // Кладём рекорд в горячее зеркало и перезагружаем: initStorage перельёт его в IndexedDB.
    await page.evaluate(() => {
      localStorage.setItem('novy-uroven:best-height', '1234')
      localStorage.setItem('novy-uroven:crystal-total', '77')
    })
    await page.reload()
    await page.waitForFunction(async () => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('novy-uroven')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const p = await new Promise<{ bestHeight: number } | undefined>((res) => {
        const r = db.transaction('profile').objectStore('profile').get('me')
        r.onsuccess = () => res(r.result)
      })
      return p?.bestHeight === 1234
    }, null, { timeout: 15_000 })

    // Уходим в офлайн и стираем localStorage — как будто браузер вычистил лёгкое хранилище.
    await context.setOffline(true)
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    // Профиль восстановлен из IndexedDB — без сети, из ledger'а.
    await page.waitForFunction(() => localStorage.getItem('novy-uroven:best-height') === '1234', null, {
      timeout: 15_000,
    })
    expect(await page.evaluate(() => localStorage.getItem('novy-uroven:crystal-total'))).toBe('77')

    // И игрок это видит: рекорд в меню, кристаллы на счётчике.
    await passOnboarding(page)
    await expect(page.locator('.menu__record-value')).toHaveText('1234')
    await expect(page.locator('.menu__crystal-count')).toHaveText('77')

    await context.setOffline(false)
  })
})
