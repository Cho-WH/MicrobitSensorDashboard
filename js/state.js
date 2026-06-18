import { normalizeConfig } from './config.js'
import { sensorConfig as defaultSensorConfig } from './sensor-config.js'

const makeInitialState = (config = defaultSensorConfig) => {
  const normalizedConfig = normalizeConfig(config)

  return {
    config: normalizedConfig,
    connectionStatus: 'disconnected',
    device: undefined,
    service: undefined,
    characteristic: undefined,
    latestSample: undefined,
    history: [],
    selectedFields: [...normalizedConfig.defaultVisibleFields],
    samplingIntervalMs: normalizedConfig.sampleIntervalMs,
    lastUpdatedAt: undefined,
    errorMessage: undefined,
    noticeMessage: undefined,
    noticeTone: 'info',
  }
}

let currentState = makeInitialState()
const listeners = new Set()

const appendSample = (history, sample, limit) => {
  const next = history.concat(sample)
  if (next.length > limit) {
    return next.slice(next.length - limit)
  }
  return next
}

const reducer = (state, action) => {
  switch (action.type) {
    case 'setStatus':
      return { ...state, connectionStatus: action.status }
    case 'setDevice':
      return { ...state, device: action.payload?.device, service: action.payload?.service, characteristic: action.payload?.characteristic }
    case 'setSample':
      return {
        ...state,
        connectionStatus: state.connectionStatus === 'waiting-data' ? 'connected' : state.connectionStatus,
        latestSample: action.sample,
        history: appendSample(state.history, action.sample, state.config.historyLimit),
        lastUpdatedAt: action.sample.timestamp,
        errorMessage: action.options?.preserveError ? state.errorMessage : undefined,
        noticeMessage: undefined,
      }
    case 'setFields': {
      if (!Array.isArray(action.fields) || action.fields.length === 0) {
        return state
      }
      return { ...state, selectedFields: action.fields }
    }
    case 'setError':
      return { ...state, errorMessage: action.message }
    case 'setNotice':
      return { ...state, noticeMessage: action.message, noticeTone: action.tone || 'info' }
    case 'applyConfig': {
      const nextConfig = normalizeConfig(action.config)
      return {
        ...makeInitialState(nextConfig),
        connectionStatus: state.connectionStatus,
      }
    }
    case 'reset':
      return {
        ...makeInitialState(state.config),
        samplingIntervalMs: state.samplingIntervalMs,
      }
    default:
      return state
  }
}

const notify = () => {
  for (const listener of listeners) {
    listener(currentState)
  }
}

export const store = {
  getState() {
    return currentState
  },
  init(config) {
    currentState = makeInitialState(config)
    notify()
  },
  dispatch(action) {
    if (!action || typeof action.type !== 'string') {
      return
    }
    const nextState = reducer(currentState, action)
    if (nextState !== currentState) {
      currentState = nextState
      notify()
    }
  },
  subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {}
    }
    listeners.add(listener)
    listener(currentState)
    return () => {
      listeners.delete(listener)
    }
  },
}

export const constants = {
  get HISTORY_LIMIT() {
    return currentState.config.historyLimit
  },
  get INITIAL_SELECTED_FIELDS() {
    return [...currentState.config.defaultVisibleFields]
  },
}

export const actions = {
  setStatus: (status) => ({ type: 'setStatus', status }),
  setDevice: (payload) => ({ type: 'setDevice', payload }),
  setSample: (sample, options = {}) => ({ type: 'setSample', sample, options }),
  setFields: (fields) => ({ type: 'setFields', fields }),
  setError: (message) => ({ type: 'setError', message }),
  setNotice: (message, tone = 'info') => ({ type: 'setNotice', message, tone }),
  applyConfig: (config) => ({ type: 'applyConfig', config }),
  reset: () => ({ type: 'reset' }),
}
