import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// host: true — чтобы открывать превью с телефона по локальной сети (game feel тюним на устройстве)
export default defineConfig({
  plugins: [
    react(),
    // PWA (Этап 5, конспект 4.5): первый заход онлайн → всё в precache → игра работает
    // в авиарежиме. Ассетов у проекта почти нет (графика и звук процедурные), поэтому
    // precache — это JS/CSS/HTML, шрифты и иконки: сотни килобайт, кэшируется мгновенно.
    VitePWA({
      registerType: 'prompt', // не обновляемся молча: по DoD новая версия предлагается тостом
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Новый уровень',
        short_name: 'Новый уровень',
        description: 'Другие правила. Новый уровень.',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#FF3495',
        categories: ['games'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: '/index.html', // офлайн-заход по любому пути отдаёт приложение
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { host: true, port: 5173 },
})
