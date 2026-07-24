import { defineConfig, devices } from '@playwright/test'

/**
 * E2E (Этап 5, DoD «авиарежим → игра открывается, играется, сохраняет»).
 *
 * Тесты гоняются ТОЛЬКО по прод-сборке: service worker существует лишь там (в dev
 * плагин отдаёт no-op), а офлайн без SW проверять нечего. Отсюда `webServer` с
 * build+preview вместо `npm run dev`.
 *
 * Файлы называются `*.e2e.ts`, чтобы их не подобрал Vitest (`npm test` — юнит-тесты
 * генерации, они не должны поднимать браузер).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false, // офлайн-сценарий трогает SW и хранилище — параллелить нечего
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
