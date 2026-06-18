import { store } from '../state.js'
import { formatNumber, formatTimestamp } from '../utils/format.js'
import { downloadCsv } from '../utils/csv.js'

const ROW_LIMIT = 12

export const initDataLog = () => {
  const root = document.querySelector('[data-component="data-log"]')
  if (!root) return

  const button = root.querySelector('[data-action="download"]')
  const thead = root.querySelector('[data-bind="table-head"]')
  const tbody = root.querySelector('[data-bind="rows"]')
  let currentConfig = null
  let columnCount = 1

  const renderHead = (config) => {
    currentConfig = config
    columnCount = config.fields.length + 1
    if (!thead) return

    const headerRow = document.createElement('tr')
    const timeTh = document.createElement('th')
    timeTh.scope = 'col'
    timeTh.textContent = '시각'
    headerRow.append(timeTh)

    config.fields.forEach((field) => {
      const th = document.createElement('th')
      th.scope = 'col'
      th.textContent = field.label
      headerRow.append(th)
    })

    thead.replaceChildren(headerRow)
  }

  const renderEmpty = () => {
    if (!tbody) return
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.colSpan = columnCount
    cell.textContent = '데이터를 수신하면 로그가 표시됩니다.'
    row.append(cell)
    tbody.replaceChildren(row)
  }

  const render = (state) => {
    if (state.config !== currentConfig) {
      renderHead(state.config)
    }

    const history = state.history ?? []
    const hasData = history.length > 0
    if (button) {
      button.disabled = !hasData
    }

    if (!tbody) return

    if (!hasData) {
      renderEmpty()
      return
    }

    const recent = history.slice(-ROW_LIMIT).reverse()
    const rows = recent.map((sample) => {
      const row = document.createElement('tr')
      const timeCell = document.createElement('td')
      timeCell.textContent = formatTimestamp(sample.timestamp)
      row.append(timeCell)

      state.config.fields.forEach((field) => {
        const cell = document.createElement('td')
        cell.textContent = formatNumber(sample[field.key], field.digits)
        row.append(cell)
      })

      return row
    })

    tbody.replaceChildren(...rows)
  }

  if (button) {
    button.addEventListener('click', () => {
      const state = store.getState()
      downloadCsv(state.history, state.config.fields, state.config.csvFilename)
    })
  }

  const unsubscribe = store.subscribe(render)
  return () => unsubscribe?.()
}
