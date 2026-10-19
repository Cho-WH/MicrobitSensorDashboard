/** Find a required, typed element at the application's DOM boundary.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {ParentNode} root @param {K} tag @param {string} selector
 * @returns {HTMLElementTagNameMap[K]}
 */
export function findElement(root, tag, selector) {
  const node = root.querySelector(selector);
  if (!node || node.localName !== tag) throw new Error('화면 요소를 찾을 수 없습니다: ' + selector);
  return /** @type {HTMLElementTagNameMap[K]} */ (node);
}
/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} [className] @param {string} [text] */
export function element(tag, className = '', text = '') {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
