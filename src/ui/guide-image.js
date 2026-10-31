import { guideImageSources } from '../app/asset-url.js';

/** Keep image selection identical for visible guides and their next-page preload.
 * @param {HTMLImageElement} image @param {string} src @param {string} [sizes] */
export function setGuideImage(image, src, sizes = '(max-width: 700px) calc(100vw - 64px), 560px') {
  const source = guideImageSources(src);
  image.decoding = 'async';
  image.sizes = sizes;
  image.srcset = source.srcset ?? '';
  if (source.width) { image.width = source.width; image.height = source.height; }
  if (image.getAttribute('src') !== source.src) image.src = source.src;
}
