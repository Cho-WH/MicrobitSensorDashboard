/*
 * Project-local SVG wrapper for Project Nayuki's QR Code generator library.
 * The QR encoder is provided by vendor/qrcodegen.js (MIT License).
 */
(function (global) {
  'use strict'

  const DEFAULT_BORDER = 4

  const escapeAttribute = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  const getEncoder = () => {
    const qrcodegen = global.qrcodegen
    if (!qrcodegen?.QrCode?.encodeText || !qrcodegen.QrCode.Ecc?.MEDIUM) {
      throw new Error('Project Nayuki QR generator is not loaded.')
    }
    return qrcodegen
  }

  const toSvg = (text, options = {}) => {
    const qrcodegen = getEncoder()
    const border = Number.isFinite(options.border) ? Math.max(0, Math.trunc(options.border)) : DEFAULT_BORDER
    const qr = qrcodegen.QrCode.encodeText(String(text), qrcodegen.QrCode.Ecc.MEDIUM)
    const size = qr.size + border * 2
    const title = options.title ? `<title>${escapeAttribute(options.title)}</title>` : ''
    const darkModules = []

    for (let y = 0; y < qr.size; y += 1) {
      for (let x = 0; x < qr.size; x += 1) {
        if (qr.getModule(x, y)) {
          darkModules.push(`M${x + border},${y + border}h1v1h-1z`)
        }
      }
    }

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeAttribute(
        options.ariaLabel || 'QR code',
      )}">`,
      title,
      '<rect width="100%" height="100%" fill="#ffffff"/>',
      `<path d="${darkModules.join(' ')}" fill="#0f172a"/>`,
      '</svg>',
    ].join('')
  }

  global.SimpleQRCode = { toSvg }
})(window)
