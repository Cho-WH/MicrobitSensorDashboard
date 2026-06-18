import { initConnectionPanel } from './ui/connection-panel.js'
import { initAxisSelector } from './ui/axis-selector.js'
import { initLiveStats } from './ui/live-stats.js'
import { initSensorChart } from './ui/sensor-chart.js'
import { initDataLog } from './ui/data-log.js'
import { initBanner } from './ui/banner.js'
import { initMockTelemetry } from './mockTelemetry.js'
import { initUsageGuide } from './ui/usage-guide.js'
import { sensorConfig } from './sensor-config.js'

const cleanupTasks = []
const registerCleanup = (fn) => {
  if (typeof fn === 'function') {
    cleanupTasks.push(fn)
  }
}

const boot = () => {
  const params = new URLSearchParams(window.location.search)
  const mockEnabled = ['1', 'true', 'yes'].includes((params.get('mock') || '').toLowerCase())

  document.title = sensorConfig.appTitle
  const titleEl = document.querySelector('[data-bind="app-title"]')
  const badgeEl = document.querySelector('[data-bind="app-badge"]')
  if (titleEl) titleEl.textContent = sensorConfig.appTitle
  if (badgeEl) badgeEl.textContent = sensorConfig.appBadge

  initBanner({ mockEnabled })

  registerCleanup(initUsageGuide())

  registerCleanup(initConnectionPanel())
  registerCleanup(initAxisSelector())
  registerCleanup(initLiveStats())
  registerCleanup(initSensorChart())
  registerCleanup(initDataLog())

  let disposeMock
  if (mockEnabled) {
    disposeMock = initMockTelemetry()
    registerCleanup(disposeMock)
  }

  window.addEventListener('beforeunload', () => {
    cleanupTasks.splice(0).forEach((fn) => {
      try {
        fn()
      } catch (error) {
        console.warn('Cleanup failed', error)
      }
    })
  })
}

document.addEventListener('DOMContentLoaded', boot)
