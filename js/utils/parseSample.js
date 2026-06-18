const CONTROL_PREFIXES = ['HELLO,', 'ACK,', 'STATUS,', 'ERR,']

const toNumber = (value) => {
  const normalized = value.trim()
  if (normalized === '') {
    return null
  }

  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

const buildErrorMessage = ({ receivedCount, expectedCount, invalidFields }) => {
  const messages = []
  if (receivedCount < expectedCount) {
    messages.push(
      `CSV 값 개수가 실험 설정과 다릅니다. 받은 값 ${receivedCount}개, 설정 필드 ${expectedCount}개. 부족한 필드는 —로 표시됩니다.`
    )
  }
  if (receivedCount > expectedCount) {
    messages.push(
      `CSV 값 개수가 실험 설정과 다릅니다. 받은 값 ${receivedCount}개, 설정 필드 ${expectedCount}개. 초과 값은 무시했습니다.`
    )
  }
  if (invalidFields.length > 0) {
    messages.push(`CSV 값에 숫자가 아닌 항목이 있습니다. ${invalidFields.join(', ')} 필드는 —로 표시됩니다.`)
  }
  return messages.join('\n')
}

export const parseSample = (raw, fields = []) => {
  if (typeof raw !== 'string') {
    return null
  }

  if (CONTROL_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
    return null
  }

  const segments = raw.split(',').map((part) => part.trim())
  if (!Array.isArray(fields) || fields.length === 0) {
    return null
  }

  const sample = {
    timestamp: Date.now(),
  }
  const invalidFields = []

  fields.forEach((field, index) => {
    if (index >= segments.length) {
      return
    }

    const value = toNumber(segments[index])
    if (value === null) {
      invalidFields.push(field.label || field.key || `필드 ${index + 1}`)
      return
    }

    sample[field.key] = value
  })

  const errorMessage = buildErrorMessage({
    receivedCount: segments.length,
    expectedCount: fields.length,
    invalidFields,
  })

  return {
    sample,
    errorMessage: errorMessage || undefined,
  }
}
