import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/800.css'
import '@fontsource/big-shoulders-stencil/700.css' // стенсил — счётчик высоты (фишка T2)
import { App } from './app/App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
