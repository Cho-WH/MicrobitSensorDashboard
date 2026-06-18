import { MAKECODE_SHARE_URL } from '../makecode-share.js'

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

export const initUsageGuide = () => {
  if (typeof document === 'undefined') {
    return
  }

  const openButton = document.querySelector('[data-action="open-usage-guide"]')
  const makeCodeButton = document.querySelector('[data-action="open-makecode-share"]')
  const dialog = document.getElementById('usage-guide-dialog')

  if (!openButton || !dialog) {
    return
  }

  registerDialog(dialog)

  const handleOpen = () => {
    if (dialog.open) {
      return
    }
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    }
  }

  const handleOpenMakeCode = () => {
    window.open(MAKECODE_SHARE_URL, '_blank', 'noopener')
  }

  const handleBackdropClick = (event) => {
    if (event.target === dialog) {
      dialog.close()
    }
  }

  const handleClose = () => {
    if (typeof openButton.focus === 'function') {
      openButton.focus()
    }
  }

  openButton.addEventListener('click', handleOpen)
  if (makeCodeButton) {
    makeCodeButton.addEventListener('click', handleOpenMakeCode)
  }
  dialog.addEventListener('click', handleBackdropClick)
  dialog.addEventListener('close', handleClose)

  return () => {
    openButton.removeEventListener('click', handleOpen)
    if (makeCodeButton) {
      makeCodeButton.removeEventListener('click', handleOpenMakeCode)
    }
    dialog.removeEventListener('click', handleBackdropClick)
    dialog.removeEventListener('close', handleClose)
  }
}
