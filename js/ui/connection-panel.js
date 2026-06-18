import { store, actions } from '../state.js'
import { sensorConfig } from '../sensor-config.js'
import { formatRelative, formatTimestamp } from '../utils/format.js'
import { parseSample } from '../utils/parseSample.js'
import {
  isSupported,
  requestDevice,
  connect as connectDevice,
  startNotifications,
  sendStartCommand,
  stopNotifications,
  disconnect as disconnectDevice,
  setDisconnectedListener,
} from '../bluetooth.js'

const statusLabelMap = {
  disconnected: '연결 안 됨',
  connecting: '연결 중',
  reconnecting: '재연결 중',
  'waiting-data': '데이터 대기 중',
  connected: '연결됨',
}

const FIRST_SAMPLE_TIMEOUT_MS = 7000
const RECONNECT_DELAY_MS = 3000

const calibrationNotice = sensorConfig.connectionText?.waitingForFirstSample || '첫 데이터 수신을 기다리는 중입니다.'

const reconnectNotice =
  '연결이 예기치 않게 끊어졌습니다.\n' +
  'micro:bit가 재부팅될 수 있어 잠시 기다린 뒤 자동으로 한 번 다시 연결합니다.'

const firstSampleTimeoutNotice =
  sensorConfig.connectionText?.firstSampleTimeout ||
  '아직 측정 데이터가 도착하지 않았습니다.\n펌웨어가 실행 중인지 확인하고, 필요하면 연결 해제 후 다시 연결하세요.'

const getBluetoothErrorMessage = (error) => {
  const name = error?.name
  const message = error instanceof Error ? error.message : ''

  if (name === 'NotFoundError') {
    return '장치를 선택하지 않았거나 주변에서 micro:bit를 찾지 못했습니다.\n조치: micro:bit 전원을 켜고 다른 기기와 연결되어 있지 않은지 확인한 뒤 다시 검색하세요.'
  }
  if (name === 'NotAllowedError') {
    return 'Bluetooth 사용 권한이 허용되지 않았습니다.\n조치: 브라우저의 Bluetooth 권한을 허용하고 Android에서는 위치 권한도 켠 뒤 다시 시도하세요.'
  }
  if (name === 'SecurityError') {
    return '현재 주소에서는 Web Bluetooth를 사용할 수 없습니다.\n조치: https:// 주소 또는 http://localhost 에서 웹앱을 여세요.'
  }
  if (name === 'NetworkError') {
    return 'micro:bit와 GATT 연결을 안정적으로 만들지 못했습니다.\n조치: micro:bit가 재부팅 중이거나 너무 멀리 있을 수 있습니다. 몇 초 뒤 다시 연결하세요.'
  }
  if (message.includes('User cancelled')) {
    return '장치 선택이 취소되었습니다.\n조치: 디바이스 연결을 다시 누르고 목록에서 BBC micro:bit를 선택하세요.'
  }
  if (message.includes('getPrimaryService') || message.includes('service') || message.includes('서비스')) {
    return 'micro:bit에서 필요한 UART 서비스를 찾지 못했습니다.\n조치: 이 프로젝트용 펌웨어가 올라갔는지 확인하고, 플래시 직후라면 LED 표시가 다시 시작된 뒤 연결하세요.'
  }
  if (message.includes('특성') || message.includes('characteristic')) {
    return 'micro:bit의 UART 통신 채널을 찾지 못했습니다.\n조치: 펌웨어를 다시 플래시하고 micro:bit가 재부팅된 뒤 다시 연결하세요.'
  }

  return message || '디바이스 연결 중 오류가 발생했습니다.\n조치: micro:bit 전원과 브라우저 Bluetooth 권한을 확인한 뒤 다시 시도하세요.'
}

export const initConnectionPanel = () => {
  const root = document.querySelector('[data-component="connection-panel"]')
  if (!root) return

  const statusEl = root.querySelector('[data-bind="status"]')
  const lastUpdatedEl = root.querySelector('[data-bind="last-updated"]')
  const relativeEl = root.querySelector('[data-bind="relative-time"]')
  const noticeEl = root.querySelector('[data-bind="notice"]')
  const errorEl = root.querySelector('[data-bind="error"]')
  const connectBtn = root.querySelector('[data-action="connect"]')
  const disconnectBtn = root.querySelector('[data-action="disconnect"]')
  const helperEl = root.querySelector('[data-bind="helper"]')
  const supportedButton = root.querySelector('[data-action="show-supported"]')
  const supportedDialogEl = document.getElementById('supported-browsers-dialog')

  if (supportedDialogEl && window.dialogPolyfill && typeof window.dialogPolyfill.registerDialog === 'function') {
    window.dialogPolyfill.registerDialog(supportedDialogEl)
  }

  const supportedDialog =
    supportedDialogEl && typeof supportedDialogEl.showModal === 'function' ? supportedDialogEl : null

  if (supportedButton && supportedDialog) {
    supportedButton.addEventListener('click', () => {
      if (!supportedDialog.open) {
        supportedDialog.showModal()
      }
    })
    supportedDialog.addEventListener('click', (event) => {
      if (event.target === supportedDialog) {
        supportedDialog.close()
      }
    })
    supportedDialog.addEventListener('close', () => {
      supportedButton.focus()
    })
  }

  let isBusy = false
  let manualDisconnect = false
  let suppressDisconnectNotice = false
  let lastSelectedDevice = null
  let firstSampleTimer = null
  let reconnectTimer = null
  let lastState = store.getState()

  const setBusy = (busy) => {
    isBusy = busy
    if (connectBtn) connectBtn.disabled = busy || lastState.connectionStatus !== 'disconnected' || !isSupported()
    if (disconnectBtn) disconnectBtn.disabled = busy || lastState.connectionStatus === 'disconnected'
  }

  const clearFirstSampleTimer = () => {
    if (firstSampleTimer) {
      window.clearTimeout(firstSampleTimer)
      firstSampleTimer = null
    }
  }

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const updateError = (message) => {
    if (!errorEl) return
    if (!message) {
      errorEl.textContent = ''
      errorEl.hidden = true
      return
    }
    errorEl.textContent = message
    errorEl.hidden = false
  }

  const updateNotice = (message, tone = 'info') => {
    if (!noticeEl) return
    noticeEl.classList.remove('warning', 'success')
    if (tone === 'warning' || tone === 'success') {
      noticeEl.classList.add(tone)
    }
    if (!message) {
      noticeEl.textContent = ''
      noticeEl.hidden = true
      return
    }
    noticeEl.textContent = message
    noticeEl.hidden = false
  }

  const updateRelative = () => {
    if (!relativeEl) return
    relativeEl.textContent = formatRelative(lastState.lastUpdatedAt)
  }

  const render = (state) => {
    lastState = state

    if (statusEl) {
      statusEl.textContent = statusLabelMap[state.connectionStatus] ?? '—'
    }

    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = formatTimestamp(state.lastUpdatedAt)
    }

    updateRelative()
    updateNotice(state.noticeMessage, state.noticeTone)
    updateError(state.errorMessage)

    if (connectBtn) {
      connectBtn.disabled = isBusy || state.connectionStatus !== 'disconnected' || !isSupported()
    }

    if (disconnectBtn) {
      disconnectBtn.disabled = isBusy || state.connectionStatus === 'disconnected'
    }
  }

  const supported = isSupported()
  if (!supported && helperEl) {
    helperEl.textContent = '이 환경은 Web Bluetooth 를 지원하지 않습니다. Chrome 또는 Edge에서 https:// 또는 http://localhost 주소로 접속해 주세요.'
  }

  const runConnection = async ({ reuseLastDevice = false } = {}) => {
    try {
      setBusy(true)
      clearFirstSampleTimer()
      store.dispatch(actions.setError(undefined))
      store.dispatch(actions.setNotice(undefined))
      store.dispatch(actions.setStatus(reuseLastDevice ? 'reconnecting' : 'connecting'))

      const device = reuseLastDevice && lastSelectedDevice ? lastSelectedDevice : await requestDevice()
      lastSelectedDevice = device

      const { service, txCharacteristic } = await connectDevice(device)
      store.dispatch(actions.setDevice({ device, service, characteristic: txCharacteristic }))

      await startNotifications((value) => {
        const sample = parseSample(value, sensorConfig.fields)
        if (sample) {
          clearFirstSampleTimer()
          store.dispatch(actions.setSample(sample))
        }
      })

      await sendStartCommand(sensorConfig.startCommand)
      store.dispatch(actions.setStatus('waiting-data'))
      store.dispatch(actions.setNotice(calibrationNotice, 'info'))

      firstSampleTimer = window.setTimeout(() => {
        if (!store.getState().latestSample) {
          store.dispatch(actions.setNotice(firstSampleTimeoutNotice, 'warning'))
        }
      }, FIRST_SAMPLE_TIMEOUT_MS)
    } catch (error) {
      console.error(error)
      clearFirstSampleTimer()
      suppressDisconnectNotice = true
      try {
        await stopNotifications()
      } catch (_) {
        /* noop */
      }
      try {
        await disconnectDevice()
      } catch (_) {
        /* noop */
      } finally {
        suppressDisconnectNotice = false
      }
      store.dispatch(actions.setStatus('disconnected'))
      store.dispatch(actions.setNotice(undefined))
      store.dispatch(actions.setError(getBluetoothErrorMessage(error)))
    } finally {
      setBusy(false)
    }
  }

  setDisconnectedListener(() => {
    clearFirstSampleTimer()
    store.dispatch(actions.reset())
    if (manualDisconnect || suppressDisconnectNotice) {
      store.dispatch(actions.setStatus('disconnected'))
      manualDisconnect = false
      return
    }

    store.dispatch(actions.setStatus('reconnecting'))
    store.dispatch(actions.setNotice(reconnectNotice, 'warning'))
    clearReconnectTimer()
    reconnectTimer = window.setTimeout(async () => {
      if (!lastSelectedDevice || store.getState().connectionStatus !== 'reconnecting') {
        store.dispatch(actions.setStatus('disconnected'))
        return
      }
      await runConnection({ reuseLastDevice: true })
    }, RECONNECT_DELAY_MS)

    if (!lastSelectedDevice) {
      clearReconnectTimer()
      store.dispatch(actions.setStatus('disconnected'))
      store.dispatch(actions.setNotice(undefined))
      store.dispatch(actions.setError('디바이스 연결이 종료되었습니다.\n조치: micro:bit가 재부팅된 뒤 디바이스 연결을 다시 누르세요.'))
    }
    manualDisconnect = false
  })

  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      const state = store.getState()
      if (state.connectionStatus !== 'disconnected' || isBusy || !isSupported()) {
        return
      }

      clearReconnectTimer()
      await runConnection()
    })
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async () => {
      const state = store.getState()
      if (state.connectionStatus === 'disconnected' || isBusy) {
        return
      }

      try {
        manualDisconnect = true
        setBusy(true)
        clearFirstSampleTimer()
        clearReconnectTimer()
        await stopNotifications()
        await disconnectDevice()
      } finally {
        store.dispatch(actions.reset())
        store.dispatch(actions.setStatus('disconnected'))
        setBusy(false)
      }
    })
  }

  const unsubscribe = store.subscribe(render)
  const interval = window.setInterval(updateRelative, 1000)

  return () => {
    unsubscribe?.()
    window.clearInterval(interval)
    clearFirstSampleTimer()
    clearReconnectTimer()
  }
}
