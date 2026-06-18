import { store } from '../state.js'
import { getFieldConfig, sensorConfig } from '../sensor-config.js'
import { formatTimestamp } from '../utils/format.js'

const HISTORY_WINDOW = 120

export const initSensorChart = () => {
  const root = document.querySelector('[data-component="sensor-chart"]')
  if (!root) return

  const canvas = root.querySelector('canvas')
  const emptyEl = root.querySelector('[data-bind="empty"]')
  const fieldsEl = root.querySelector('[data-bind="fields"]')
  const titleEl = root.querySelector('[data-bind="chart-title"]')

  if (titleEl) titleEl.textContent = sensorConfig.chartTitle
  if (emptyEl) emptyEl.textContent = sensorConfig.emptyMessage

  if (!canvas) return

  const Chart = window.Chart
  if (!Chart) {
    if (emptyEl) {
      emptyEl.textContent = 'Chart.js 로드를 실패했습니다.'
      emptyEl.style.display = 'flex'
    }
    return
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6,
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.1)',
          },
        },
        y: {
          ticks: {
            color: '#94a3b8',
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.1)',
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: '#e2e8f0',
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.parsed.y
              if (typeof value !== 'number') {
                return `${context.dataset.label}`
              }
              const field = getFieldConfig(context.dataset.fieldKey)
              const unit = field?.unit ? ` ${field.unit}` : ''
              return `${context.dataset.label}: ${value.toFixed(field?.digits ?? 2)}${unit}`
            },
          },
        },
      },
    },
  })

  const render = (state) => {
    const samples = state.history.slice(-HISTORY_WINDOW)
    const hasData = samples.length > 0

    if (fieldsEl) {
      const fieldsLabel = state.selectedFields.map((fieldKey) => getFieldConfig(fieldKey)?.label ?? fieldKey).join(', ')
      fieldsEl.textContent = `표시 항목: ${fieldsLabel || '—'}`
    }

    if (!hasData) {
      chart.data.labels = []
      chart.data.datasets = []
      chart.update('none')
      if (emptyEl) {
        emptyEl.hidden = false
      }
      return
    }

    const labels = samples.map((sample) => formatTimestamp(sample.timestamp))
    const datasets = state.selectedFields.map((fieldKey) => {
      const config = getFieldConfig(fieldKey)
      return {
        label: config?.label ?? fieldKey,
        fieldKey,
        data: samples.map((sample) => sample[fieldKey]),
        borderColor: config?.color ?? '#38bdf8',
        backgroundColor: `${config?.color ?? '#38bdf8'}33`,
        tension: 0.25,
        fill: false,
        pointRadius: 0,
        borderWidth: 2,
      }
    })

    chart.data.labels = labels
    chart.data.datasets = datasets
    chart.update('none')

    if (emptyEl) {
      emptyEl.hidden = true
    }
  }

  const unsubscribe = store.subscribe(render)

  return () => {
    unsubscribe?.()
    chart.destroy()
  }
}
