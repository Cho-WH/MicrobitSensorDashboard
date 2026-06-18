import { store, actions } from './state.js'
import { sensorConfig } from './sensor-config.js'

const randomBetween = (min, max) => Math.random() * (max - min) + min

export const initMockTelemetry = () => {
  let timerId = null

  const pushSample = () => {
    const sample = { timestamp: Date.now() }

    sensorConfig.fields.forEach((field) => {
      sample[field.key] = randomBetween(field.mock?.min ?? 0, field.mock?.max ?? 100)
    })

    store.dispatch(actions.setSample(sample))
  }

  const start = () => {
    if (timerId) return
    timerId = window.setInterval(pushSample, 1000)
  }

  const stop = () => {
    if (!timerId) return
    window.clearInterval(timerId)
    timerId = null
  }

  const handleState = (state) => {
    if (state.connectionStatus === 'connected') {
      stop()
    } else {
      start()
    }
  }

  const unsubscribe = store.subscribe(handleState)

  start()

  return () => {
    stop()
    unsubscribe?.()
  }
}
