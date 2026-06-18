const buildHeader = (fields) => ['timestamp', ...fields.map((field) => field.key)].join(',')

export const buildCsv = (samples, fields = []) => {
  const header = buildHeader(fields)
  if (!Array.isArray(samples)) return header
  const rows = samples.map((sample) =>
    [
      new Date(sample.timestamp).toISOString(),
      ...fields.map((field) => sample[field.key]),
    ].join(',')
  )
  return [header, ...rows].join('\n')
}

export const downloadCsv = (samples, fields = [], filename = 'sensor-log.csv') => {
  if (!Array.isArray(samples) || samples.length === 0) {
    return
  }

  const csvContent = buildCsv(samples, fields)
  const blob = new Blob(['\ufeff', csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  URL.revokeObjectURL(url)
}
