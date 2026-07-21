import './gameOver.css'

/**
 * Экран Game Over (конспект 2.5). Блок `over` по БЭМ. По ТЗ:
 *  - высота крупным стенсилом (фишка T2);
 *  - нарратив эпохи дерзким тоном;
 *  - собранные кристаллы (за партию + текущий баланс);
 *  - личный рекорд, если побит — маджента-плашка;
 *  - кнопки: ЕЩЁ РАЗ (маджента, большая) / Меню (пока-заглушка — Этап 3, не создаём мёртвые ссылки).
 *
 * Полноценный экран (Halvar Stencil 96pt, конфетти, шаринг) — Этап 3. Здесь честный
 * MVP на текущей палитре токенов, без импорта визуалов, которых ещё нет.
 */
export interface GameOverPayload {
  height: number
  best: number
  crystalsGained: number
  crystalTotal: number
  beaten: boolean
  epochBanner: string
}

interface GameOverOptions {
  onRestart: () => void
}

export function createGameOver(opts: GameOverOptions): {
  show: (p: GameOverPayload) => void
  hide: () => void
  destroy: () => void
} {
  const overlay = document.createElement('div')
  overlay.className = 'over__overlay'

  const card = document.createElement('div')
  card.className = 'over__card'
  overlay.appendChild(card)

  const badge = document.createElement('div')
  badge.className = 'over__badge'
  badge.textContent = 'РЕКОРД'
  card.appendChild(badge)

  const heightRow = document.createElement('div')
  heightRow.className = 'over__height'
  const heightNum = document.createElement('span')
  heightNum.className = 'over__height-num'
  const heightUnit = document.createElement('span')
  heightUnit.className = 'over__height-unit'
  heightUnit.textContent = 'м'
  heightRow.append(heightNum, heightUnit)
  card.appendChild(heightRow)

  const narrative = document.createElement('div')
  narrative.className = 'over__narrative'
  card.appendChild(narrative)

  const stats = document.createElement('div')
  stats.className = 'over__stats'
  card.appendChild(stats)

  const bestBox = document.createElement('div')
  bestBox.className = 'over__stat'
  const bestLabel = document.createElement('span')
  bestLabel.className = 'over__stat-label'
  bestLabel.textContent = 'ЛУЧШИЙ'
  const bestVal = document.createElement('span')
  bestVal.className = 'over__stat-val'
  bestBox.append(bestLabel, bestVal)
  stats.appendChild(bestBox)

  const crystalsBox = document.createElement('div')
  crystalsBox.className = 'over__stat'
  const crystalsLabel = document.createElement('span')
  crystalsLabel.className = 'over__stat-label'
  crystalsLabel.textContent = 'КРИСТАЛЛОВ'
  const crystalsVal = document.createElement('span')
  crystalsVal.className = 'over__stat-val'
  crystalsBox.append(crystalsLabel, crystalsVal)
  stats.appendChild(crystalsBox)

  const restartBtn = document.createElement('button')
  restartBtn.className = 'over__btn over__btn--primary'
  restartBtn.textContent = 'ЕЩЁ РАЗ'
  card.appendChild(restartBtn)

  restartBtn.addEventListener('click', () => {
    hide()
    opts.onRestart()
  })

  document.body.appendChild(overlay)

  function show(p: GameOverPayload): void {
    heightNum.textContent = String(p.height)
    narrative.textContent = p.epochBanner
    bestVal.textContent = `${p.best} м`
    crystalsVal.textContent =
      p.crystalsGained > 0 ? `+${p.crystalsGained}  (${p.crystalTotal})` : `${p.crystalTotal}`
    badge.classList.toggle('over__badge--visible', p.beaten)
    card.classList.toggle('over__card--beaten', p.beaten)
    overlay.classList.add('over__overlay--open')
  }

  function hide(): void {
    overlay.classList.remove('over__overlay--open')
  }

  return {
    show,
    hide,
    destroy: () => overlay.remove(),
  }
}
