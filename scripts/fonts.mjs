import { readFile } from 'node:fs/promises';

// Generated, versioned assets are checked in. No font tools or CDN in app builds.
const manifest = JSON.parse(await readFile(new URL('../public/vendor/lab-fonts/manifest.json', import.meta.url), 'utf8'));
export const coreFontPath = 'public/vendor/lab-fonts/' + manifest.files.find(file => file.role === 'core').file;
export const renderFontPreload = source => source.replace('<!-- app-font-preload -->',
  `<link data-app-font rel="preload" href="${coreFontPath}" as="font" type="font/woff2" crossorigin>`);
