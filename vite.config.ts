import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// host: true — чтобы открывать превью с телефона по локальной сети (game feel тюним на устройстве)
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
})
