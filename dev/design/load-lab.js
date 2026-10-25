// Shared review entry: use the real app markup and its bundled dependencies.
export async function loadLabDocument({ preparationStyle } = {}) {
  const appUrl = new URL('../../lab.html', import.meta.url);
  const source = new DOMParser().parseFromString(await (await fetch(appUrl)).text(), 'text/html');
  // Imported markup keeps the app entry's resource base, including static images.
  for (const node of source.body.querySelectorAll('[src],[href]')) for (const name of ['src','href']) {
    const value = node.getAttribute(name);
    if (value && !value.startsWith('#')) node.setAttribute(name, new URL(value, appUrl).href);
  }
  document.documentElement.dataset.visualTheme = source.documentElement.dataset.visualTheme;
  document.documentElement.dataset.appState = 'loading';
  document.head.append(source.querySelector('[data-startup-style]').cloneNode(true));
  const resources = [...source.head.querySelectorAll('link[rel=stylesheet],script[src]')]
    .filter(node => !node.getAttribute('src')?.endsWith('src/app/bootstrap.js'));
  await Promise.all(resources.map(node => new Promise((resolve, reject) => {
    const copy = document.createElement(node.localName);
    for (const attr of node.attributes) copy.setAttribute(attr.name, attr.value);
    if (node.hasAttribute('src')) copy.src = new URL(node.getAttribute('src'), appUrl).href;
    if (node.hasAttribute('href')) copy.href = preparationStyle && node.getAttribute('href') === 'src/ui/guide.css'
      ? preparationStyle : new URL(node.getAttribute('href'), appUrl).href;
    copy.onload = resolve; copy.onerror = reject; document.head.append(copy);
  })));
  document.body.replaceChildren(...[...source.body.children].map(node => document.importNode(node, true)));
}
