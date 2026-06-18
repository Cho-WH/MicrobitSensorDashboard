import { store, actions } from '../state.js'
import { sensorConfig } from '../sensor-config.js'

const sortFields = (fields) => {
  return sensorConfig.fields.map((field) => field.key).filter((key) => fields.includes(key))
}

export const initAxisSelector = () => {
  const root = document.querySelector('[data-component="axis-selector"]')
  if (!root) return

  const titleEl = root.querySelector('[data-bind="field-selector-title"]')
  const helpEl = root.querySelector('[data-bind="field-selector-help"]')
  const optionsEl = root.querySelector('[data-bind="field-options"]')

  if (titleEl) titleEl.textContent = sensorConfig.fieldSelectorTitle
  if (helpEl) helpEl.textContent = sensorConfig.fieldSelectorHelp
  if (!optionsEl) return

  const fieldMap = new Map()

  sensorConfig.fields.forEach((field) => {
    const fieldKey = field.key
    const label = document.createElement('label')
    const input = document.createElement('input')

    label.className = 'option'
    label.setAttribute('data-field', fieldKey)
    label.setAttribute('data-active', 'false')

    input.type = 'checkbox'
    input.value = fieldKey

    label.append(input, ` ${field.label}`)
    optionsEl.append(label)

    fieldMap.set(fieldKey, { label, input })

    input.addEventListener('change', () => {
      const state = store.getState()
      const hasField = state.selectedFields.includes(fieldKey)
      let nextFields
      if (hasField) {
        nextFields = state.selectedFields.filter((value) => value !== fieldKey)
      } else {
        nextFields = [...state.selectedFields, fieldKey]
      }

      nextFields = sortFields(nextFields)

      if (nextFields.length === 0) {
        input.checked = true
        return
      }

      store.dispatch(actions.setFields(nextFields))
    })
  })

  const render = (state) => {
    fieldMap.forEach(({ label, input }, fieldKey) => {
      const active = state.selectedFields.includes(fieldKey)
      if (input) input.checked = active
      if (label) label.setAttribute('data-active', String(active))
    })
  }

  const unsubscribe = store.subscribe(render)

  return () => unsubscribe?.()
}
