import { sensorConfig } from './sensor-config.js'

const HISTORY_LIMIT = sensorConfig.historyLimit
const INITIAL_SELECTED_FIELDS = [...sensorConfig.defaultVisibleFields]

const INITIAL_STATE = {
  connectionStatus: 'disconnected',
  device: undefined,
  service: undefined,
  characteristic: undefined,
  latestSample: undefined,
  history: [],
  selectedFields: [...INITIAL_SELECTED_FIELDS],
  samplingIntervalMs: sensorConfig.sampleIntervalMs,
  lastUpdatedAt: undefined,
  errorMessage: undefined,
  noticeMessage: undefined,
  noticeTone: 'info',
}

let currentState = { ...INITIAL_STATE }
const listeners = new Set()

const appendSample = (history, sample) => {
  const next = history.concat(sample)
  if (next.length > HISTORY_LIMIT) {
    return next.slice(next.length - HISTORY_LIMIT)
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
        history: appendSample(state.history, action.sample),
        lastUpdatedAt: action.sample.timestamp,
        errorMessage: undefined,
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
    case 'reset':
      return {
        ...INITIAL_STATE,
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
  HISTORY_LIMIT,
  INITIAL_SELECTED_FIELDS,
}

export const actions = {
  setStatus: (status) => ({ type: 'setStatus', status }),
  setDevice: (payload) => ({ type: 'setDevice', payload }),
  setSample: (sample) => ({ type: 'setSample', sample }),
  setFields: (fields) => ({ type: 'setFields', fields }),
  setError: (message) => ({ type: 'setError', message }),
  setNotice: (message, tone = 'info') => ({ type: 'setNotice', message, tone }),
  reset: () => ({ type: 'reset' }),
}
