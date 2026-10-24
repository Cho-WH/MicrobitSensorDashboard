export { labDefaults, getLabCopy, getPreviewCopy, previewDefaults } from '../catalog/ui-copy.js';

// A small, plain-text binding for the shared markup. Never inserts HTML or changes inputs.
export function applyLabCopy(root, copy) {
  for (const attribute of ['text', 'placeholder', 'aria-label', 'title']) {
    const binding = attribute === 'text' ? 'data-copy' : 'data-copy-' + attribute;
    for (const node of root.querySelectorAll('[' + binding + ']')) {
      const [section, key] = node.getAttribute(binding).split('.');
      const value = copy[section]?.[key];
      if (typeof value !== 'string') continue;
      if (attribute === 'text') { if (node.textContent !== value) node.textContent = value; }
      else if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
    }
  }
}

/** Values are substituted as text; templates cannot execute code or markup. */
export function formatCopy(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
