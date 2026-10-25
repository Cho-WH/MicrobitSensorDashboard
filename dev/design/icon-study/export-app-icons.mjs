import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import './build-icons.mjs';

// Use an installed Sharp module; no image tool is needed in the production build.
const { default: sharp } = await import(process.env.ICON_SHARP_MODULE || 'sharp');
const source = new URL('./', import.meta.url);
const output = new URL('../../../public/assets/branding/', import.meta.url);
await mkdir(output, { recursive:true });
await copyFile(new URL('sensor-lab-monochrome-24.svg',source),new URL('sensor-lab-mark-24.svg',output));
for (const size of [16,32]) {
  const svg = await readFile(new URL(`sensor-lab-primary-${size}.svg`,source));
  await sharp(svg).resize(size,size).png().toFile(fileURLToPath(new URL(`sensor-lab-favicon-${size}.png`,output)));
}
// Home-screen platforms supply the outer mask. Keep the background square/opaque.
const primary = (await readFile(new URL('sensor-lab-primary.svg',source),'utf8')).replaceAll('rx="30"','rx="0"');
for (const size of [180,192,512]) {
  await sharp(Buffer.from(primary)).resize(size,size).flatten({ background:'#0b1f3b' }).png()
    .toFile(fileURLToPath(new URL(`sensor-lab-home-${size}.png`,output)));
}
// The social card uses the app's browser-rendered Pretendard font and real UI capture.
// Render social-card.html at 1200 x 630 and pass the captured file to export it.
if (process.env.SOCIAL_CAPTURE_PATH) {
  const capture = sharp(process.env.SOCIAL_CAPTURE_PATH);
  const { width,height } = await capture.metadata();
  // Fractional Windows display scaling can omit the final pixel row or column.
  if (![1199,1200].includes(width) || ![629,630].includes(height)) throw new Error('Social capture must use a 1200 x 630 viewport.');
  if (width < 1200 || height < 630) capture.extend({right:1200-width,bottom:630-height,extendWith:'copy'});
  await capture.png()
    .toFile(fileURLToPath(new URL('sensor-lab-social.png',output)));
}
console.log('Exported application icons' + (process.env.SOCIAL_CAPTURE_PATH ? ' and social preview.' : '. Social preview kept.'));
