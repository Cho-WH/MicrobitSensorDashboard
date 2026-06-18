import { initConnectionPanel } from './ui/connection-panel.js'
import { initAxisSelector } from './ui/axis-selector.js'
import { initLiveStats } from './ui/live-stats.js'
import { initSensorChart } from './ui/sensor-chart.js'
import { initDataLog } from './ui/data-log.js'
import { initBanner } from './ui/banner.js'
import { initMockTelemetry } from './mockTelemetry.js'
import { initUsageGuide } from './ui/usage-guide.js'
import { initExperimentSettings } from './ui/experiment-settings.js'
import { loadConfigFromUrl } from './config.js'
import { store } from './state.js'

const cleanupTasks = []
const registerCleanup = (fn) => {
  if (typeof fn === 'function') {
    cleanupTasks.push(fn)
  }
}

const boot = async () => {
  const params = new URLSearchParams(window.location.search)
  const mockEnabled = ['1', 'true', 'yes'].includes((params.get('mock') || '').toLowerCase())
  const { config, error } = await loadConfigFromUrl()

  store.init(config)

  const titleEl = document.querySelector('[data-bind="app-title"]')
  registerCleanup(
    store.subscribe((state) => {
      document.title = state.config.appTitle
      if (titleEl) titleEl.textContent = state.config.appTitle
    })
  )

  initBanner({ mockEnabled, configError: error })

  registerCleanup(initUsageGuide())
  registerCleanup(initExperimentSettings())

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

document.addEventListener('DOMContentLoaded', () => {
  boot().catch((error) => {
    console.error('App boot failed', error)
  })
})
