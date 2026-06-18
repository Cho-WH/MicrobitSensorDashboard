const CONTROL_PREFIXES = ['HELLO,', 'ACK,', 'STATUS,', 'ERR,']

const toNumber = (value) => {
  const normalized = value.trim()
  if (normalized === '') {
    return null
  }

  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

export const parseSample = (raw, fields = []) => {
  if (typeof raw !== 'string') {
    return null
  }

  if (CONTROL_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
    return null
  }

  const segments = raw.split(',').map((part) => part.trim())
  if (!Array.isArray(fields) || segments.length !== fields.length) {
    return null
  }

  const values = segments.map(toNumber)
  if (values.some((value) => value === null)) {
    return null
  }

  const sample = {
    timestamp: Date.now(),
  }

  fields.forEach((field, index) => {
    sample[field.key] = values[index]
  })

  return sample
}
