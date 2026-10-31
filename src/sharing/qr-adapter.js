import { assetUrl } from '../app/asset-url.js';
// Keep the existing MIT encoder and local SVG wrapper unchanged and load them only on demand.
let loading;
async function encoder() {
  if (window.SimpleQRCode) return window.SimpleQRCode;
  if (!loading) loading = (async () => {
    for (const file of ['qrcodegen.js', 'simple-qrcode.js']) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = assetUrl('../../vendor/' + file, import.meta.url).href;
        script.onload = () => { script.remove(); resolve(undefined); };
        script.onerror = () => { script.remove(); reject(new Error('QR을 만들지 못했어요. 링크 복사를 이용해 주세요.')); };
        document.head.append(script);
      });
    }
    if (!window.SimpleQRCode) throw new Error('QR을 만들지 못했어요. 링크 복사를 이용해 주세요.');
    return window.SimpleQRCode;
  })().catch(error => { loading = null; throw error; });
  return loading;
}

/** @param {string} url @param {string} title @returns {Promise<SVGSVGElement>} */
export async function createQr(url, title) {
  const source = (await encoder()).toSvg(url, { border:4, ariaLabel:title + ' 소개 링크 QR' });
  const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
  if (svg.localName !== 'svg') throw new Error('QR을 만들지 못했어요.');
  svg.setAttribute('shape-rendering', 'crispEdges');
  return /** @type {SVGSVGElement} */ (/** @type {unknown} */ (document.importNode(svg, true)));
}

/** Rasterize the same SVG on an integer module grid, including its white quiet zone.
 * @param {SVGSVGElement} qr @returns {Promise<Blob>}
 */
export async function qrPng(qr) {
  const svg = /** @type {SVGSVGElement} */ (qr.cloneNode(true));
  const modules = svg.viewBox.baseVal.width, size = modules * Math.ceil(1024 / modules);
  svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], {type:'image/svg+xml'}));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = () => resolve(undefined);
      image.onerror = () => reject(new Error('QR 이미지를 저장하지 못했어요. 다시 눌러 주세요.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('이 브라우저에서는 QR 이미지를 저장할 수 없어요.');
    context.imageSmoothingEnabled = false; context.drawImage(image, 0, 0, size, size);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob)
      : reject(new Error('QR 이미지를 저장하지 못했어요. 다시 눌러 주세요.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
