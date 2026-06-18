import { store } from '../state.js'
import { sensorConfig } from '../sensor-config.js'
import { formatNumber, formatTimestamp } from '../utils/format.js'
import { downloadCsv } from '../utils/csv.js'

const ROW_LIMIT = 12

export const initDataLog = () => {
  const root = document.querySelector('[data-component="data-log"]')
  if (!root) return

  const button = root.querySelector('[data-action="download"]')
  const thead = root.querySelector('[data-bind="table-head"]')
  const tbody = root.querySelector('[data-bind="rows"]')
  const columnCount = sensorConfig.fields.length + 1

  if (thead) {
    const headerRow = document.createElement('tr')
    const timeTh = document.createElement('th')
    timeTh.scope = 'col'
    timeTh.textContent = '시각'
    headerRow.append(timeTh)

    sensorConfig.fields.forEach((field) => {
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

      sensorConfig.fields.forEach((field) => {
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
      downloadCsv(state.history, sensorConfig.fields, sensorConfig.csvFilename)
    })
  }

  const unsubscribe = store.subscribe(render)
  return () => unsubscribe?.()
}
