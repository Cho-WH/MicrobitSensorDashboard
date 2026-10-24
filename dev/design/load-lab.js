// Shared review entry: use the real app markup and its bundled dependencies.
export async function loadLabDocument() {
  const source = new DOMParser().parseFromString(await (await fetch(new URL('../../lab.html', import.meta.url))).text(), 'text/html');
  const resources = [...source.head.querySelectorAll('link[rel=stylesheet],script[src]')].filter(node => node.getAttribute('type') !== 'module');
  await Promise.all(resources.map(node => new Promise((resolve, reject) => {
    const copy = document.createElement(node.localName);
    for (const attr of node.attributes) copy.setAttribute(attr.name, attr.value);
    copy.onload = resolve; copy.onerror = reject; document.head.append(copy);
  })));
  document.body.replaceChildren(...[...source.body.children].map(node => document.importNode(node, true)));
}
