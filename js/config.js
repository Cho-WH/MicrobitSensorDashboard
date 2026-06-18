import { colorPalette, sensorConfig as defaultSensorConfig } from './sensor-config.js'

const CONFIG_PARAM = 'cfg'
const CONFIG_VERSION = 1
const MAX_DIGITS = 6
const COLOR_RE = /^#[0-9a-f]{6}$/i
const COMPRESSION_FORMAT = 'deflate-raw'
const COMPRESSION_UNSUPPORTED_MESSAGE = '이 브라우저는 압축 설정 링크를 지원하지 않습니다.'

const clone = (value) => JSON.parse(JSON.stringify(value))

const normalizeString = (value, fallback) => {
  if (typeof value !== 'string') {
    return fallback
  }
  const trimmed = value.trim()
  return trimmed || fallback
}

const normalizeOptionalString = (value) => (typeof value === 'string' ? value.trim() : '')

const normalizeDigits = (value, fallback = 2) => {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return fallback
  }
  return Math.min(MAX_DIGITS, Math.max(0, Math.round(number)))
}

const normalizeColor = (value, fallback = colorPalette[0]) => {
  if (typeof value !== 'string') {
    return fallback
  }
  const color = value.trim()
  return COLOR_RE.test(color) ? color.toLowerCase() : fallback
}

const dedupeKey = (baseKey, usedKeys) => {
  let key = baseKey
  let index = 2
  while (usedKeys.has(key) || key === 'timestamp') {
    key = `${baseKey}_${index}`
    index += 1
  }
  usedKeys.add(key)
  return key
}

const normalizeFields = (fields, fallbackFields = defaultSensorConfig.fields) => {
  const source = Array.isArray(fields) && fields.length > 0 ? fields : fallbackFields
  const usedKeys = new Set()
  const usingFallbackFields = source === fallbackFields

  return source.map((field, index) => {
    const fallback = fallbackFields[index] || fallbackFields[0] || {}
    const fallbackKey = fallback.key || `value${index + 1}`
    const rawKey = normalizeString(field?.key, fallbackKey)
    const key = dedupeKey(rawKey, usedKeys)

    return {
      key,
      label: normalizeString(field?.label, key),
      unit: normalizeOptionalString(field?.unit),
      digits: normalizeDigits(field?.digits, fallback.digits ?? 2),
      color: normalizeColor(field?.color, colorPalette[index % colorPalette.length]),
      mock: field?.mock || (usingFallbackFields ? fallback.mock : undefined) || { min: 0, max: 100 },
    }
  })
}

const normalizeVisibleFields = (visibleFields, fields) => {
  const fieldKeys = fields.map((field) => field.key)
  const requested = new Set(Array.isArray(visibleFields) ? visibleFields : [])
  const visible = fieldKeys.filter((key) => requested.has(key))

  return visible.length > 0 ? visible : [fieldKeys[0]]
}

export const normalizeConfig = (config = {}) => {
  const fallback = defaultSensorConfig
  const fields = normalizeFields(config.fields, fallback.fields)

  return {
    ...clone(fallback),
    ...config,
    appTitle: normalizeString(config.appTitle, fallback.appTitle),
    appBadge: normalizeString(config.appBadge, fallback.appBadge),
    startCommand: normalizeString(config.startCommand, fallback.startCommand),
    csvFilename: normalizeString(config.csvFilename, fallback.csvFilename),
    chartTitle: normalizeString(config.chartTitle, fallback.chartTitle),
    fields,
    defaultVisibleFields: normalizeVisibleFields(config.defaultVisibleFields, fields),
  }
}

export const getFieldConfig = (config, key) => {
  return config?.fields?.find((field) => field.key === key)
}

const fieldToCompact = (field) => ({
  k: field.key,
  l: field.label,
  u: field.unit,
  d: field.digits,
  c: field.color,
})

const compactToField = (field) => ({
  key: field?.k,
  label: field?.l,
  unit: field?.u,
  digits: field?.d,
  color: field?.c,
})

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export const toCompactConfig = (config) => {
  const normalized = normalizeConfig(config)
  const defaults = normalizeConfig(defaultSensorConfig)
  const compact = { v: CONFIG_VERSION }

  if (normalized.appTitle !== defaults.appTitle) compact.t = normalized.appTitle
  if (normalized.appBadge !== defaults.appBadge) compact.b = normalized.appBadge
  if (normalized.startCommand !== defaults.startCommand) compact.cmd = normalized.startCommand
  if (normalized.csvFilename !== defaults.csvFilename) compact.csv = normalized.csvFilename
  if (normalized.chartTitle !== defaults.chartTitle) compact.ct = normalized.chartTitle

  if (!sameJson(normalized.defaultVisibleFields, defaults.defaultVisibleFields)) {
    compact.dv = normalized.defaultVisibleFields
  }

  if (!sameJson(normalized.fields.map(fieldToCompact), defaults.fields.map(fieldToCompact))) {
    compact.f = normalized.fields.map(fieldToCompact)
  }

  return compact
}

export const fromCompactConfig = (compact) => {
  if (!compact || typeof compact !== 'object' || compact.v !== CONFIG_VERSION) {
    throw new Error('지원하지 않는 설정 링크입니다.')
  }

  return normalizeConfig({
    appTitle: compact.t,
    appBadge: compact.b,
    startCommand: compact.cmd,
    csvFilename: compact.csv,
    chartTitle: compact.ct,
    defaultVisibleFields: compact.dv,
    fields: Array.isArray(compact.f) ? compact.f.map(compactToField) : undefined,
  })
}

const bytesToBase64Url = (bytes) => {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const base64UrlToBytes = (value) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

const assertCompressionSupport = () => {
  if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function') {
    throw new Error(COMPRESSION_UNSUPPORTED_MESSAGE)
  }
}

const compressBytes = async (bytes) => {
  assertCompressionSupport()
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(COMPRESSION_FORMAT))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const decompressBytes = async (bytes) => {
  assertCompressionSupport()
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(COMPRESSION_FORMAT))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export const encodeConfig = async (config) => {
  const compact = toCompactConfig(config)
  if (Object.keys(compact).length === 1) {
    return ''
  }
  const bytes = new TextEncoder().encode(JSON.stringify(compact))
  const compressed = await compressBytes(bytes)
  return bytesToBase64Url(compressed)
}

export const decodeConfigParam = async (value) => {
  const compressed = base64UrlToBytes(value)
  const bytes = await decompressBytes(compressed)
  const json = new TextDecoder().decode(bytes)
  return fromCompactConfig(JSON.parse(json))
}

export const loadConfigFromUrl = async (url = window.location.href) => {
  const parsedUrl = new URL(url)
  const encoded = parsedUrl.searchParams.get(CONFIG_PARAM)
  if (!encoded) {
    return {
      config: normalizeConfig(defaultSensorConfig),
      error: undefined,
    }
  }

  try {
    return {
      config: await decodeConfigParam(encoded),
      error: undefined,
    }
  } catch (error) {
    console.warn('Failed to load shared config', error)
    const message =
      error?.message === COMPRESSION_UNSUPPORTED_MESSAGE
        ? COMPRESSION_UNSUPPORTED_MESSAGE
        : '설정 링크를 읽지 못해 기본 Magnetometer 설정으로 열었습니다.'
    return {
      config: normalizeConfig(defaultSensorConfig),
      error: message,
    }
  }
}

export const buildConfigUrl = async (config, currentUrl = window.location.href) => {
  const url = new URL(currentUrl)
  const encoded = await encodeConfig(config)

  if (encoded) {
    url.searchParams.set(CONFIG_PARAM, encoded)
  } else {
    url.searchParams.delete(CONFIG_PARAM)
  }

  return url.toString()
}

export const updateConfigUrl = async (config, { replace = true } = {}) => {
  const nextUrl = await buildConfigUrl(config)
  const method = replace ? 'replaceState' : 'pushState'
  window.history[method]({}, '', nextUrl)
  return nextUrl
}

export { colorPalette }
