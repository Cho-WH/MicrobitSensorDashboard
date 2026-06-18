import { store } from '../state.js'
import { formatNumber } from '../utils/format.js'

export const initLiveStats = () => {
  const root = document.querySelector('[data-component="live-stats"]')
  if (!root) return

  const grid = root.querySelector('[data-bind="stats-grid"]')
  if (!grid) return

  const cards = new Map()
  let currentConfig = null

  const buildCards = (config) => {
    currentConfig = config
    cards.clear()
    grid.replaceChildren()

    config.fields.forEach((field) => {
      const card = document.createElement('div')
      const labelEl = document.createElement('span')
      const valueEl = document.createElement('span')
      const unitEl = document.createElement('span')

      card.className = 'stat-card'
      card.dataset.field = field.key
      labelEl.className = 'label'
      labelEl.textContent = field.label
      valueEl.className = 'value'
      valueEl.dataset.role = 'value'
      valueEl.textContent = '—'
      unitEl.className = 'unit'
      unitEl.textContent = field.unit || ''

      card.append(labelEl, valueEl, unitEl)
      grid.append(card)

      cards.set(field.key, valueEl)
    })
  }

  const render = (state) => {
    if (state.config !== currentConfig) {
      buildCards(state.config)
    }

    state.config.fields.forEach((field) => {
      const valueEl = cards.get(field.key)
      if (!valueEl) return
      const value = state.latestSample ? state.latestSample[field.key] : undefined
      valueEl.textContent = formatNumber(value, field.digits)
    })
  }

  const unsubscribe = store.subscribe(render)
  return () => unsubscribe?.()
}
