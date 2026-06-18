import { actions, store } from '../state.js'
import { buildConfigUrl, colorPalette, normalizeConfig, updateConfigUrl } from '../config.js'
import { sensorConfig as defaultSensorConfig } from '../sensor-config.js'

const clone = (value) => JSON.parse(JSON.stringify(value))
const SHARE_UPDATE_DELAY_MS = 250

const registerDialog = (dialog) => {
  if (!dialog) return
  if (dialog.open !== undefined && typeof dialog.showModal === 'function') {
    return
  }
  const polyfill = window.dialogPolyfill
  if (polyfill && typeof polyfill.registerDialog === 'function') {
    polyfill.registerDialog(dialog)
  }
}

const makeField = (index) => ({
  key: `value${index + 1}`,
  label: `값 ${index + 1}`,
  unit: '',
  digits: 1,
  color: colorPalette[index % colorPalette.length],
})

const getFieldExampleValue = (field, index) => {
  const number = index + 1
  const digits = Number(field.digits)
  const safeDigits = Number.isFinite(digits) ? Math.min(6, Math.max(0, Math.round(digits))) : 0
  return Number(number.toFixed(safeDigits)).toString()
}

const setButtonPressed = (button, pressed) => {
  button.setAttribute('aria-pressed', String(pressed))
  button.dataset.active = String(pressed)
}

const getDraftErrors = (draft) => {
  const errors = []
  const keys = new Set()

  if (!draft.appTitle.trim()) errors.push('앱 제목을 입력하세요.')
  if (!draft.startCommand.trim()) errors.push('시작 명령을 입력하세요.')
  if (!draft.csvFilename.trim()) errors.push('CSV 파일명을 입력하세요.')
  if (!Array.isArray(draft.fields) || draft.fields.length === 0) errors.push('필드는 최소 1개 이상 필요합니다.')

  const fields = Array.isArray(draft.fields) ? draft.fields : []
  fields.forEach((field, index) => {
    const row = index + 1
    const key = field.key.trim()
    if (!key) errors.push(`${row}번째 필드의 CSV 키를 입력하세요.`)
    if (key === 'timestamp') errors.push('CSV 키 timestamp는 예약어입니다.')
    if (keys.has(key)) errors.push(`CSV 키 "${key}"가 중복되었습니다.`)
    keys.add(key)
    if (!field.label.trim()) errors.push(`${row}번째 필드의 화면 이름을 입력하세요.`)
    const digits = Number(field.digits)
    if (!Number.isInteger(digits) || digits < 0 || digits > 6) {
      errors.push(`${row}번째 필드의 소수점 자릿수는 0부터 6 사이여야 합니다.`)
    }
  })

  return errors
}

export const initExperimentSettings = () => {
  const openButton = document.querySelector('[data-action="open-experiment-settings"]')
  const dialog = document.getElementById('experiment-settings-dialog')
  const root = dialog?.querySelector('[data-component="experiment-settings"]')
  if (!openButton || !dialog || !root) {
    return
  }

  registerDialog(dialog)

  const closeButton = root.querySelector('[data-action="close-experiment-settings"]')
  const applyButton = root.querySelector('[data-action="apply-config"]')
  const resetButton = root.querySelector('[data-action="reset-config"]')
  const addFieldButton = root.querySelector('[data-action="add-field"]')
  const errorEl = root.querySelector('[data-bind="settings-error"]')
  const fieldListEl = root.querySelector('[data-bind="field-editor-list"]')
  const commandEl = root.querySelector('[data-bind="firmware-command"]')
  const orderEl = root.querySelector('[data-bind="firmware-order"]')
  const sampleEl = root.querySelector('[data-bind="firmware-sample"]')
  const shareUrlInput = root.querySelector('[data-bind="share-url"]')
  const shareUrlLengthEl = root.querySelector('[data-bind="share-url-length"]')
  const shareStatusEl = root.querySelector('[data-bind="share-status"]')
  const shareQrPanel = root.querySelector('[data-bind="share-qr-panel"]')
  const shareQrOutput = root.querySelector('[data-bind="share-qr-output"]')
  const copyShareUrlButton = root.querySelector('[data-action="copy-share-url"]')
  const toggleShareQrButton = root.querySelector('[data-action="toggle-share-qr"]')
  const topInputs = Array.from(root.querySelectorAll('[data-setting]'))

  let draft = clone(store.getState().config)
  let shareUrl = ''
  let shareUpdateTimer = null
  let shareGeneration = 0
  let qrVisible = false
  let isApplying = false

  const showError = (message) => {
    if (!errorEl) return
    if (!message) {
      errorEl.textContent = ''
      errorEl.hidden = true
      return
    }
    errorEl.textContent = message
    errorEl.hidden = false
  }

  const showShareStatus = (message, tone = 'info') => {
    if (!shareStatusEl) return
    shareStatusEl.textContent = message || ''
    shareStatusEl.dataset.tone = tone
  }

  const setShareControlsEnabled = (enabled) => {
    if (copyShareUrlButton) copyShareUrlButton.disabled = !enabled
    if (toggleShareQrButton) toggleShareQrButton.disabled = !enabled
  }

  const syncTopInputsToDraft = () => {
    topInputs.forEach((input) => {
      draft[input.dataset.setting] = input.value
    })
  }

  const renderTopInputs = () => {
    topInputs.forEach((input) => {
      input.value = draft[input.dataset.setting] ?? ''
    })
  }

  const renderFirmwareCheck = () => {
    if (commandEl) commandEl.textContent = `${draft.startCommand || 'start'}\\n`
    if (orderEl) orderEl.textContent = draft.fields.map((field) => field.key || 'value').join(', ')
    if (sampleEl) sampleEl.textContent = draft.fields.map(getFieldExampleValue).join(',')
  }

  const getNormalizedDraftConfig = () => {
    const errors = getDraftErrors(draft)
    if (errors.length > 0) {
      throw new Error(errors[0])
    }

    return normalizeConfig({
      ...draft,
      fields: draft.fields.map((field) => ({
        ...field,
        key: field.key.trim(),
        label: field.label.trim(),
        unit: field.unit.trim(),
        digits: Number(field.digits),
      })),
      defaultVisibleFields: draft.defaultVisibleFields,
    })
  }

  const renderQr = () => {
    if (!shareQrOutput || !shareUrl) return
    const qr = window.SimpleQRCode
    if (!qr || typeof qr.toSvg !== 'function') {
      shareQrOutput.replaceChildren()
      showShareStatus('QR 생성기를 불러오지 못했습니다.', 'warning')
      return
    }

    try {
      shareQrOutput.innerHTML = qr.toSvg(shareUrl)
    } catch (error) {
      shareQrOutput.replaceChildren()
      showShareStatus(error?.message || 'QR 코드를 만들지 못했습니다.', 'warning')
    }
  }

  const updateSharePreview = async () => {
    const generation = ++shareGeneration
    syncTopInputsToDraft()
    setShareControlsEnabled(false)
    if (shareUrlInput) shareUrlInput.value = ''
    if (shareUrlLengthEl) shareUrlLengthEl.textContent = 'URL 생성 중'
    showShareStatus('공유 링크를 만드는 중입니다.')

    try {
      const nextConfig = getNormalizedDraftConfig()
      const nextUrl = await buildConfigUrl(nextConfig)
      if (generation !== shareGeneration) return

      shareUrl = nextUrl
      if (shareUrlInput) shareUrlInput.value = shareUrl
      if (shareUrlLengthEl) shareUrlLengthEl.textContent = `URL ${shareUrl.length.toLocaleString('ko-KR')}자`
      setShareControlsEnabled(true)
      showShareStatus('이 링크를 공유하면 같은 실험 설정으로 열립니다.', 'success')

      if (qrVisible) {
        renderQr()
      }
    } catch (error) {
      if (generation !== shareGeneration) return
      shareUrl = ''
      if (shareUrlLengthEl) shareUrlLengthEl.textContent = 'URL 0자'
      if (shareQrOutput) shareQrOutput.replaceChildren()
      setShareControlsEnabled(false)
      showShareStatus(error?.message || '공유 링크를 만들지 못했습니다.', 'warning')
    }
  }

  const scheduleShareUpdate = () => {
    if (shareUpdateTimer) {
      window.clearTimeout(shareUpdateTimer)
    }
    shareUpdateTimer = window.setTimeout(() => {
      shareUpdateTimer = null
      updateSharePreview()
    }, SHARE_UPDATE_DELAY_MS)
  }

  const updateRowSwatches = (row, color) => {
    row.querySelectorAll('[data-color]').forEach((button) => {
      setButtonPressed(button, button.dataset.color === color)
    })
  }

  const renderFields = () => {
    if (!fieldListEl) return

    const rows = draft.fields.map((field, index) => {
      const row = document.createElement('div')
      row.className = 'field-editor-row'
      row.dataset.index = String(index)
      row.dataset.fieldKey = field.key

      const header = document.createElement('div')
      header.className = 'field-editor-row__header'

      const title = document.createElement('span')
      title.textContent = `필드 ${index + 1}`

      const controls = document.createElement('div')
      controls.className = 'field-editor-row__controls'

      const upButton = document.createElement('button')
      upButton.type = 'button'
      upButton.className = 'button small secondary'
      upButton.dataset.action = 'move-up'
      upButton.textContent = '위'
      upButton.disabled = index === 0

      const downButton = document.createElement('button')
      downButton.type = 'button'
      downButton.className = 'button small secondary'
      downButton.dataset.action = 'move-down'
      downButton.textContent = '아래'
      downButton.disabled = index === draft.fields.length - 1

      const deleteButton = document.createElement('button')
      deleteButton.type = 'button'
      deleteButton.className = 'button small secondary danger'
      deleteButton.dataset.action = 'delete-field'
      deleteButton.textContent = '삭제'
      deleteButton.disabled = draft.fields.length === 1

      controls.append(upButton, downButton, deleteButton)
      header.append(title, controls)

      const grid = document.createElement('div')
      grid.className = 'field-editor-row__grid'

      const keyLabel = document.createElement('label')
      keyLabel.innerHTML = '<span>CSV 키</span>'
      const keyInput = document.createElement('input')
      keyInput.type = 'text'
      keyInput.dataset.prop = 'key'
      keyInput.value = field.key
      keyInput.autocomplete = 'off'
      keyLabel.append(keyInput)

      const labelLabel = document.createElement('label')
      labelLabel.innerHTML = '<span>화면 이름</span>'
      const labelInput = document.createElement('input')
      labelInput.type = 'text'
      labelInput.dataset.prop = 'label'
      labelInput.value = field.label
      labelInput.autocomplete = 'off'
      labelLabel.append(labelInput)

      const unitLabel = document.createElement('label')
      unitLabel.innerHTML = '<span>단위</span>'
      const unitInput = document.createElement('input')
      unitInput.type = 'text'
      unitInput.dataset.prop = 'unit'
      unitInput.value = field.unit || ''
      unitInput.autocomplete = 'off'
      unitLabel.append(unitInput)

      const digitsLabel = document.createElement('label')
      digitsLabel.innerHTML = '<span>소수점</span>'
      const digitsInput = document.createElement('input')
      digitsInput.type = 'number'
      digitsInput.min = '0'
      digitsInput.max = '6'
      digitsInput.step = '1'
      digitsInput.dataset.prop = 'digits'
      digitsInput.value = String(field.digits)
      digitsLabel.append(digitsInput)

      const visibleLabel = document.createElement('label')
      visibleLabel.className = 'field-editor-row__visible'
      const visibleInput = document.createElement('input')
      visibleInput.type = 'checkbox'
      visibleInput.dataset.prop = 'defaultVisible'
      visibleInput.checked = draft.defaultVisibleFields.includes(field.key)
      visibleLabel.append(visibleInput, ' 기본 표시')

      grid.append(keyLabel, labelLabel, unitLabel, digitsLabel, visibleLabel)

      const colorWrap = document.createElement('div')
      colorWrap.className = 'field-editor-row__colors'

      const colorLabel = document.createElement('span')
      colorLabel.textContent = '색상'

      const swatches = document.createElement('div')
      swatches.className = 'color-swatches'

      colorPalette.forEach((color) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'color-swatch'
        button.dataset.action = 'set-color'
        button.dataset.color = color
        button.style.backgroundColor = color
        button.title = color
        button.setAttribute('aria-label', `${color} 색상`)
        setButtonPressed(button, field.color === color)
        swatches.append(button)
      })

      const customColor = document.createElement('input')
      customColor.type = 'color'
      customColor.dataset.prop = 'color'
      customColor.value = field.color
      customColor.title = '직접 선택'

      colorWrap.append(colorLabel, swatches, customColor)
      row.append(header, grid, colorWrap)
      return row
    })

    fieldListEl.replaceChildren(...rows)
    renderFirmwareCheck()
  }

  const renderDraft = () => {
    renderTopInputs()
    renderFields()
    renderFirmwareCheck()
    showError(undefined)
    scheduleShareUpdate()
  }

  const openDialog = () => {
    draft = clone(store.getState().config)
    renderDraft()
    if (typeof dialog.showModal === 'function' && !dialog.open) {
      dialog.showModal()
    }
  }

  const closeDialog = () => {
    if (dialog.open) {
      dialog.close()
    }
  }

  const applyDraft = async () => {
    if (isApplying) return
    syncTopInputsToDraft()

    const state = store.getState()
    if (state.connectionStatus !== 'disconnected') {
      showError('설정을 바꾸려면 먼저 micro:bit 연결을 해제하세요.')
      return
    }

    try {
      isApplying = true
      if (applyButton) applyButton.disabled = true
      showShareStatus('설정을 적용하는 중입니다.')
      const nextConfig = getNormalizedDraftConfig()
      await updateConfigUrl(nextConfig)
      store.dispatch(actions.applyConfig(nextConfig))
      closeDialog()
    } catch (error) {
      showError(error?.message || '설정을 적용하지 못했습니다.')
    } finally {
      isApplying = false
      if (applyButton) applyButton.disabled = false
    }
  }

  const resetDraft = () => {
    draft = clone(defaultSensorConfig)
    renderDraft()
  }

  const handleTopInput = () => {
    syncTopInputsToDraft()
    renderFirmwareCheck()
    scheduleShareUpdate()
  }

  const handleFieldInput = (event) => {
    const target = event.target
    const row = target.closest?.('.field-editor-row')
    if (!row || !target.dataset.prop) return

    const index = Number(row.dataset.index)
    const field = draft.fields[index]
    if (!field) return

    if (target.dataset.prop === 'defaultVisible') {
      const nextVisible = target.checked
        ? [...new Set([...draft.defaultVisibleFields, field.key])]
        : draft.defaultVisibleFields.filter((key) => key !== field.key)

      if (nextVisible.length === 0) {
        target.checked = true
        return
      }
      draft.defaultVisibleFields = nextVisible
      scheduleShareUpdate()
      return
    }

    if (target.dataset.prop === 'digits') {
      field.digits = Number(target.value)
    } else {
      const oldKey = row.dataset.fieldKey
      field[target.dataset.prop] = target.value
      if (target.dataset.prop === 'key') {
        draft.defaultVisibleFields = draft.defaultVisibleFields.map((key) => (key === oldKey ? field.key : key))
        row.dataset.fieldKey = field.key
      }
    }

    if (target.dataset.prop === 'color') {
      updateRowSwatches(row, target.value)
    }

    renderFirmwareCheck()
    scheduleShareUpdate()
  }

  const handleFieldClick = (event) => {
    const button = event.target.closest?.('button[data-action]')
    if (!button) return

    const row = button.closest('.field-editor-row')
    const index = Number(row?.dataset.index)
    const action = button.dataset.action

    if (action === 'set-color') {
      const field = draft.fields[index]
      if (!field) return
      field.color = button.dataset.color
      const colorInput = row.querySelector('input[type="color"]')
      if (colorInput) colorInput.value = field.color
      updateRowSwatches(row, field.color)
      scheduleShareUpdate()
      return
    }

    if (action === 'move-up' && index > 0) {
      const [field] = draft.fields.splice(index, 1)
      draft.fields.splice(index - 1, 0, field)
      renderFields()
      scheduleShareUpdate()
      return
    }

    if (action === 'move-down' && index < draft.fields.length - 1) {
      const [field] = draft.fields.splice(index, 1)
      draft.fields.splice(index + 1, 0, field)
      renderFields()
      scheduleShareUpdate()
      return
    }

    if (action === 'delete-field' && draft.fields.length > 1) {
      const [field] = draft.fields.splice(index, 1)
      draft.defaultVisibleFields = draft.defaultVisibleFields.filter((key) => key !== field.key)
      if (draft.defaultVisibleFields.length === 0) {
        draft.defaultVisibleFields = [draft.fields[0].key]
      }
      renderFields()
      scheduleShareUpdate()
    }
  }

  const addField = () => {
    syncTopInputsToDraft()
    const field = makeField(draft.fields.length)
    draft.fields.push(field)
    draft.defaultVisibleFields.push(field.key)
    renderFields()
    scheduleShareUpdate()
  }

  const copyShareUrl = async () => {
    if (!shareUrl) {
      await updateSharePreview()
    }

    if (!shareUrl) return

    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard API를 사용할 수 없습니다.')
      }
      await navigator.clipboard.writeText(shareUrl)
      showShareStatus('공유 링크를 복사했습니다.', 'success')
    } catch (_) {
      shareUrlInput?.focus()
      shareUrlInput?.select()
      showShareStatus('자동 복사가 막혔습니다. 선택된 링크를 직접 복사하세요.', 'warning')
    }
  }

  const toggleShareQr = () => {
    qrVisible = !qrVisible
    if (shareQrPanel) shareQrPanel.hidden = !qrVisible
    if (toggleShareQrButton) toggleShareQrButton.textContent = qrVisible ? 'QR 숨기기' : 'QR 표시'
    if (qrVisible) {
      renderQr()
    }
  }

  openButton.addEventListener('click', openDialog)
  closeButton?.addEventListener('click', closeDialog)
  applyButton?.addEventListener('click', applyDraft)
  resetButton?.addEventListener('click', resetDraft)
  addFieldButton?.addEventListener('click', addField)
  copyShareUrlButton?.addEventListener('click', copyShareUrl)
  toggleShareQrButton?.addEventListener('click', toggleShareQr)
  topInputs.forEach((input) => input.addEventListener('input', handleTopInput))
  fieldListEl?.addEventListener('input', handleFieldInput)
  fieldListEl?.addEventListener('change', handleFieldInput)
  fieldListEl?.addEventListener('click', handleFieldClick)

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      closeDialog()
    }
  })
  dialog.addEventListener('close', () => {
    if (typeof openButton.focus === 'function') {
      openButton.focus()
    }
  })

  return () => {
    openButton.removeEventListener('click', openDialog)
    closeButton?.removeEventListener('click', closeDialog)
    applyButton?.removeEventListener('click', applyDraft)
    resetButton?.removeEventListener('click', resetDraft)
    addFieldButton?.removeEventListener('click', addField)
    copyShareUrlButton?.removeEventListener('click', copyShareUrl)
    toggleShareQrButton?.removeEventListener('click', toggleShareQr)
    topInputs.forEach((input) => input.removeEventListener('input', handleTopInput))
    fieldListEl?.removeEventListener('input', handleFieldInput)
    fieldListEl?.removeEventListener('change', handleFieldInput)
    fieldListEl?.removeEventListener('click', handleFieldClick)
    if (shareUpdateTimer) {
      window.clearTimeout(shareUpdateTimer)
    }
  }
}
