// Adapted from Cho-WH/bme280 gay-lussac/ui/text.js at 59c5c149450f970bace2deaa183857c275595853.
// Preserve the existing text node (and browser selection) during routine refreshes.
export function setText(element, value) {
  const text = String(value ?? '');
  if (element.textContent !== text) element.textContent = text;
}
