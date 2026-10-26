import { writeFile } from 'node:fs/promises';

// Selected open-orbit primary. All four variants share the same geometry.
// Original frame curvature and line weights are retained.
const root = new URL('./', import.meta.url);
const number = value => Number(value.toFixed(3));
const center = { x:64, y:63.5 };
const point = (radius, angle) => {
  const radians = angle * Math.PI / 180;
  return `${number(center.x + radius * Math.cos(radians))} ${number(center.y + radius * Math.sin(radians))}`;
};

// Frame thickness 5.35; outside corner radius 13.5, inside 8.15.
// Cut ends have a 2.65-unit flat face with 1.35-unit corner rounds.
// Reflection is baked into coordinates so the paint gradient stays global.
function frameCorner(reflectX, reflectY) {
  const x = value => number(reflectX ? 128 - value : value);
  const y = value => number(reflectY ? 127.25 - value : value);
  const p = (a,b) => `${x(a)} ${y(b)}`;
  const clockwise = reflectX === reflectY ? 1 : 0;
  return `M${p(33.5,20.25)}H${x(56.1)}Q${p(57.45,20.25)} ${p(57.45,21.6)}V${y(24.25)}Q${p(57.45,25.6)} ${p(56.1,25.6)}H${x(33.5)}A8.15 8.15 0 0 ${1-clockwise} ${p(25.35,33.75)}V${y(54.7)}Q${p(25.35,56.05)} ${p(24,56.05)}H${x(21.35)}Q${p(20,56.05)} ${p(20,54.7)}V${y(33.75)}A13.5 13.5 0 0 ${clockwise} ${p(33.5,20.25)}Z`;
}

// Annular bands use short, nearly flat end faces with small corner rounds.
// The ring remains circular; no ellipse or four-way segmentation is used.
function band(start, end, width, corner) {
  const outer = 28 + width / 2, inner = 28 - width / 2;
  const outerInset = Math.asin(corner / outer) * 180 / Math.PI;
  const innerInset = Math.asin(corner / inner) * 180 / Math.PI;
  const large = end - start > 180 ? 1 : 0;
  return `M${point(outer,start+outerInset)}A${outer} ${outer} 0 ${large} 1 ${point(outer,end-outerInset)}Q${point(outer,end)} ${point(outer-corner,end)}L${point(inner+corner,end)}Q${point(inner,end)} ${point(inner,end-innerInset)}A${inner} ${inner} 0 ${large} 0 ${point(inner,start+innerInset)}Q${point(inner,start)} ${point(inner+corner,start)}L${point(outer-corner,start)}Q${point(outer,start)} ${point(outer,start+outerInset)}Z`;
}

const frame = [[false,false],[true,false],[true,true],[false,true]]
  .map(([x,y], i) => `    <path id="frame-${i+1}" d="${frameCorner(x,y)}"/>`).join('\n');
const orbit = {
  open:band(42,264,3.2,.18),
  brightLeft:band(95.3,210.5,3.6,.55),
  signal:band(290,334.5,3.1,.45),
};
const [signalX,signalY] = point(28,334.5).split(' ');
const [signalStartX,signalStartY] = point(28,290).split(' ');

const gradients = `
    <linearGradient id="background" x1="12" y1="5" x2="106" y2="122" gradientUnits="userSpaceOnUse">
      <stop stop-color="#17365c"/><stop offset=".5" stop-color="#0b1f3b"/><stop offset="1" stop-color="#081829"/>
    </linearGradient>
    <radialGradient id="upper-light" cx="4" cy="2" r="120" gradientUnits="userSpaceOnUse">
      <stop stop-color="#8eaff0" stop-opacity=".16"/><stop offset=".85" stop-color="#8eaff0" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lower-light" cx="130" cy="132" r="65" gradientUnits="userSpaceOnUse">
      <stop stop-color="#8eaff0" stop-opacity=".1"/><stop offset="1" stop-color="#8eaff0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="frame-paint" x1="22" y1="20" x2="107" y2="108" gradientUnits="userSpaceOnUse">
      <stop stop-color="#d2e3ff"/><stop offset=".48" stop-color="#b7d2ff"/><stop offset="1" stop-color="#8eaff0"/>
    </linearGradient>
    <linearGradient id="bright-left-paint" x1="39" y1="49" x2="61" y2="92" gradientUnits="userSpaceOnUse">
      <stop stop-color="#dceaff"/><stop offset=".58" stop-color="#c7ddff"/><stop offset="1" stop-color="#9bbcff"/>
    </linearGradient>
    <linearGradient id="upper-signal-paint" x1="${signalStartX}" y1="${signalStartY}" x2="${signalX}" y2="${signalY}" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ff934f"/><stop offset=".55" stop-color="#ffb45f"/><stop offset="1" stop-color="#ffd36b"/>
    </linearGradient>
    <linearGradient id="sphere-paint" x1="55" y1="53" x2="74" y2="75" gradientUnits="userSpaceOnUse">
      <stop stop-color="#eef4ff"/><stop offset=".24" stop-color="#d4e4ff"/><stop offset=".5" stop-color="#b7d2ff"/><stop offset=".8" stop-color="#91b2e8"/><stop offset="1" stop-color="#789bd4"/>
    </linearGradient>
    <linearGradient id="top-tick" x1="64" y1="29.8" x2="64" y2="43" gradientUnits="userSpaceOnUse">
      <stop stop-color="#9bd3ff"/><stop offset="1" stop-color="#82b5f0"/>
    </linearGradient>
    <linearGradient id="bottom-tick" x1="64" y1="82.8" x2="64" y2="97" gradientUnits="userSpaceOnUse">
      <stop stop-color="#8eaff0"/><stop offset=".48" stop-color="#587fe0"/><stop offset="1" stop-color="#244a91"/>
    </linearGradient>
    <linearGradient id="left-tick" x1="27.4" y1="63.5" x2="45.5" y2="63.5" gradientUnits="userSpaceOnUse">
      <stop stop-color="#78a6f6"/><stop offset="1" stop-color="#8fb5fb"/>
    </linearGradient>
    <linearGradient id="right-tick" x1="82.5" y1="63.5" x2="98" y2="63.5" gradientUnits="userSpaceOnUse">
      <stop stop-color="#b7bfff"/><stop offset="1" stop-color="#82b4ff"/>
    </linearGradient>
    <radialGradient id="signal-glow" cx="${signalX}" cy="${signalY}" r="9.5" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffd36b" stop-opacity=".52"/><stop offset=".28" stop-color="#ffb344" stop-opacity=".32"/><stop offset=".6" stop-color="#ff7a45" stop-opacity=".11"/><stop offset="1" stop-color="#ff7a45" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="signal-paint" cx="${number(Number(signalX)-.85)}" cy="${number(Number(signalY)-1.15)}" r="4.8" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fff4b8"/><stop offset=".22" stop-color="#ffe078"/><stop offset=".56" stop-color="#ffb344"/><stop offset="1" stop-color="#ff7a45"/>
    </radialGradient>`;

// Bright palette: selected image-study A, with the app's #dbe6ff pastel blue.
// Only stop colors/opacity change; gradient geometry is shared.
const lightStops = {
  background:[[0,'#f7fbff'],[.5,'#edf5ff'],[1,'#dbe6ff']],
  'upper-light':[[0,'#ffffff',.65],[.85,'#ffffff',0]],
  'lower-light':[[0,'#c7d9f5',.16],[1,'#c7d9f5',0]],
  'frame-paint':[[0,'#7e9ac2'],[.48,'#607fae'],[1,'#4c6792']],
  'bright-left-paint':[[0,'#adc6e9'],[.58,'#9bb7de'],[1,'#7897c5']],
  'upper-signal-paint':[[0,'#ef8b4e'],[.55,'#f5aa5e'],[1,'#ffd078']],
  'sphere-paint':[[0,'#f7fbff'],[.24,'#dceaff'],[.5,'#b7d2ff'],[.8,'#7899da'],[1,'#536fb1']],
  'top-tick':[[0,'#8eaad2'],[1,'#607fae']],
  'bottom-tick':[[0,'#7897c5'],[.48,'#607fae'],[1,'#49678f']],
  'left-tick':[[0,'#607fae'],[1,'#7897c5']],
  'right-tick':[[0,'#8eaad2'],[1,'#607fae']],
  'signal-glow':[[0,'#ffd36b',.24],[.28,'#ffb344',.15],[.6,'#f08043',.06],[1,'#f08043',0]],
  'signal-paint':[[0,'#fff1b3'],[.22,'#ffdc7a'],[.56,'#ffb45f'],[1,'#ed8245']],
};
const lightGradients = gradients.replace(/(<(?:linear|radial)Gradient id="([^"]+)"[^>]*>)[\s\S]*?(<\/(?:linear|radial)Gradient>)/g,
  (_, open, id, close) => `${open}\n      ${lightStops[id].map(([offset,color,opacity]) => `<stop offset="${offset}" stop-color="${color}"${opacity === undefined ? '' : ` stop-opacity="${opacity}"`}/>`).join('')}\n    ${close}`);

// Alpha-based tone keeps a single ink color and also survives CSS mask usage.
// Apply the overall tone after compositing paths to avoid dark overlap seams.
const monochromeDefs = `  <defs>
    <linearGradient id="mono-tone" x1="22" y1="20" x2="107" y2="108" gradientUnits="userSpaceOnUse">
      <stop stop-color="white" stop-opacity=".68"/><stop offset=".48" stop-color="white" stop-opacity=".84"/><stop offset="1" stop-color="white"/>
    </linearGradient>
    <linearGradient id="mono-sphere-tone" x1="55" y1="53" x2="74" y2="75" gradientUnits="userSpaceOnUse">
      <stop stop-color="white" stop-opacity=".55"/><stop offset=".5" stop-color="white" stop-opacity=".8"/><stop offset="1" stop-color="white"/>
    </linearGradient>
    <mask id="mono-tone-mask" x="0" y="0" width="128" height="128" maskUnits="userSpaceOnUse" style="mask-type:alpha">
      <rect width="128" height="128" fill="url(#mono-tone)"/>
    </mask>
    <mask id="mono-sphere-mask" x="0" y="0" width="128" height="128" maskUnits="userSpaceOnUse" style="mask-type:alpha">
      <rect width="128" height="128" fill="url(#mono-sphere-tone)"/>
    </mask>
  </defs>
  <g mask="url(#mono-tone-mask)">
`;

function svg(mode) {
  const primary = mode === 'primary' || mode === 'light', mono = mode === 'monochrome';
  const light = mode === 'light';
  const tile = primary || mode === 'compact';
  const paint = (solid, gradient) => mono ? 'currentColor' : primary && gradient ? `url(#${gradient})` : solid;
  const names = { primary:'열린 궤도 기본형', light:'파스텔 블루 팔레트', compact:'기본형의 평면 표현', monochrome:'명암을 보정한 단색 심벌' };
  const tickPaint = which => paint('#8eaff0', `${which}-tick`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${primary ? 512 : 128}" height="${primary ? 512 : 128}" viewBox="${tile ? '0 0 128 128' : '12 12 104 104'}" fill="none"${mono ? ' color="#0b1f3b"' : ''} role="img" aria-labelledby="title desc">
  <title id="title">센서 실험실 — ${names[mode]}</title>
  <desc id="desc">큰 곡률의 프레임과 네 방향 초점 눈금 안에 오른쪽이 열린 궤도를 배치했다. 아래쪽 궤도는 이어지고 위쪽 주황 호 끝에는 신호점이 연결된다. 오른쪽 눈금의 바깥 끝은 짧게 조정했다.</desc>
  <!-- Generated by build-icons.mjs. Edit the shared geometry there. -->
${primary ? `  <defs>${light ? lightGradients : gradients}\n  </defs>\n` : mono ? monochromeDefs : ''}${tile ? `  <g id="tile"><rect width="128" height="128" rx="30" fill="${primary ? 'url(#background)' : '#0b1f3b'}"/>${primary ? '<rect width="128" height="128" rx="30" fill="url(#upper-light)"/><rect width="128" height="128" rx="30" fill="url(#lower-light)"/>' : ''}</g>\n` : ''}${primary ? `  <circle id="signal-aura" cx="${signalX}" cy="${signalY}" r="9.5" fill="url(#signal-glow)"/>\n` : ''}  <g id="observation-frame" fill="${paint('#b7d2ff','frame-paint')}">
${frame}
  </g>
  <g id="orbit-ring">
    <path id="orbit-open" d="${orbit.open}" fill="${paint(light ? '#49678f' : '#244a91')}"/>
    <path id="orbit-signal" d="${orbit.signal}" fill="${paint('#ff934f','upper-signal-paint')}"/>
  </g>
  <path id="orbit-bright-left" d="${orbit.brightLeft}" fill="${paint('#b7d2ff','bright-left-paint')}"/>
  <g id="focus-ticks" stroke-width="1.2" stroke-linecap="round">
    <path d="M64 29.8V43" stroke="${tickPaint('top')}"/>
    <path d="M64 82.8V97" stroke="${tickPaint('bottom')}"/>
    <path d="M27.4 63.5H45.5" stroke="${tickPaint('left')}"/>
    <path d="M82.5 63.5H98" stroke="${tickPaint('right')}"/>
  </g>
  <circle id="observation-subject" cx="64" cy="63.5" r="12.7" fill="${paint('#b7d2ff','sphere-paint')}"${mono ? ' mask="url(#mono-sphere-mask)"' : ''}/>
  <circle id="signal-point" cx="${signalX}" cy="${signalY}" r="3.25" fill="${paint('#ffb344','signal-paint')}"/>
${mono ? '  </g>\n' : ''}</svg>
`;
}

// Optical-size variants: preserve the frame, subject and orbit openings.
// Widths are in the original 128-unit coordinate space.
function smallSvg(mode, size) {
  const small = size === 24;
  const tiny = size === 16;
  const mono = mode === 'monochrome', light = mode === 'light';
  let result = svg(mode);
  result = result.replace(/width="(?:512|128)" height="(?:512|128)"/, `width="${size}" height="${size}"`)
    .replace('열린 궤도 기본형</title>', `${size}px 축소 보정형</title>`)
    .replace(/<desc id="desc">.*?<\/desc>/, `<desc id="desc">${size}px 표시용 관측 아이콘. 기본형의 프레임과 중심 구체, 열린 궤도를 바탕으로 네 방향 눈금과 신호점의 가독성을 높였다.</desc>`);
  const widths = tiny ? [5.6,5.8,5.2] : small ? [4.8,5,4.5] : [4,4.2,3.9];
  for (const [id,path] of [
    ['orbit-open',band(42,264,widths[0],.18)],
    ['orbit-bright-left',band(95.3,210.5,widths[1],.55)],
    ['orbit-signal',band(290,334.5,widths[2],.45)],
  ]) result = result.replace(new RegExp(`(<path id="${id}" d=")[^"]+`), `$1${path}`);
  const orbitColor = mono ? 'currentColor' : light ? '#49678f' : tiny ? '#6687b9' : small ? '#5676ad' : '#4265a0';
  result = result.replace(/(<path id="orbit-open"[^>]*fill=")[^"]+/, `$1${orbitColor}`);
  const ticks = small
    ? ['M64 32.8V41','M64 84.5V94','M29.7 63.5H43.5','M84.5 63.5H96.5']
    : ['M64 29.8V43','M64 82.8V97','M27.4 63.5H45.5','M82.5 63.5H98'];
  result = result.replace(/<g id="focus-ticks"[\s\S]*?<\/g>/,
    `<g id="focus-ticks" stroke-width="${small ? 2.7 : 2}" stroke-linecap="round" stroke="${mono ? 'currentColor' : light ? '#607fae' : '#9fbff5'}">\n${ticks.map(d=>`    <path d="${d}"/>`).join('\n')}\n  </g>`);
  result = result.replace(/(<circle id="signal-point"[^>]*r=")[^"]+/, `$1${small ? 4.6 : 4}`);
  // A compact glow keeps the warm dot distinct from the frame at small sizes.
  result = result.replace(/(<radialGradient id="signal-glow"[^>]*r=")[^"]+/, `$1${small ? 6 : 7}`)
    .replace(/(<circle id="signal-aura"[^>]*r=")[^"]+/, `$1${small ? 6 : 7}`)
    .replace(/(<circle id="signal-aura"[^>]*)(\/>)/, `$1 opacity="${small ? .45 : .7}"$2`);
  if (tiny) {
    // At 16px the open track and solid warm dot carry the identity without ticks.
    result = result.replace(/<desc id="desc">.*?<\/desc>/, '<desc id="desc">16px 표시용 관측 아이콘. 네 방향이 끊긴 프레임 안에 오른쪽이 열린 궤도와 중심 구체, 금빛 신호점을 배치했다. 눈금과 주변 발광은 생략했다.</desc>')
      .replace(/  <g id="focus-ticks"[\s\S]*?<\/g>\n/, '')
      .replace(/  <circle id="signal-aura"[^>]*\/>\n/, '')
      .replace(/<circle id="signal-point"[^>]*\/>/, `<circle id="signal-point" cx="${signalX}" cy="${signalY}" r="5.2" fill="${mono ? 'currentColor' : light ? '#cf7934' : '#ffd36b'}"/>`)
      .replace(/    <linearGradient id="(?:top|bottom|left|right)-tick"[\s\S]*?<\/linearGradient>\n/g, '')
      .replace(/    <radialGradient id="signal-(?:glow|paint)"[\s\S]*?<\/radialGradient>\n?/g, '');
  }
  if (light) {
    // Darken the light palette's pale arc and warm edge without changing hue families.
    const stops = {
      'bright-left-paint':['#7897c5','#6f8fbd','#607fae'],
      'upper-signal-paint':['#db7e3e','#e89a46','#efb557'],
      'signal-paint':['#ffe6a5','#ffd078','#f0a34f','#d47532'],
    };
    for (const [id,colors] of Object.entries(stops)) {
      result = result.replace(new RegExp(`<(?:linear|radial)Gradient id="${id}"[\\s\\S]*?</(?:linear|radial)Gradient>`), gradient => {
        let index = 0;
        return gradient.replace(/stop-color="[^"]+"/g, () => `stop-color="${colors[index++]}"`);
      });
    }
  }
  if (mono) {
    // Keep one ink and alpha shading, with less fading at small sizes.
    result = result.replace('stop-opacity=".68"','stop-opacity=".78"')
      .replace('stop-opacity=".84"','stop-opacity=".92"')
      .replace('stop-opacity=".55"','stop-opacity=".7"')
      .replace('stop-opacity=".8"','stop-opacity=".9"');
  }
  if (mode !== 'primary') {
    const name = {light:'파스텔 블루',compact:'평면형',monochrome:'단색형'}[mode];
    result = result.replace(/<title id="title">.*?<\/title>/, `<title id="title">센서 실험실 — ${name} ${size}px 축소형</title>`);
    if (tiny) result = result.replace('금빛 신호점', mono ? '단색 신호점' : light ? '주황 신호점' : '금빛 신호점');
  }
  return result;
}

// A browser tab is about 16 CSS px even when its bitmap is 32 device pixels.
// Keep one tick-free optical shape at every density; do not use the 32px UI icon.
function faviconSvg() {
  let result = smallSvg('primary',16);
  const corners = [[false,false],[true,false],[true,true],[false,true]].map(([reflectX,reflectY]) => {
    const x = value => reflectX ? 128-value : value;
    const y = value => reflectY ? 128-value : value;
    const p = (a,b) => `${x(a)} ${y(b)}`;
    const clockwise = reflectX === reflectY ? 1 : 0;
    return `M${p(32,16)}H${x(55)}Q${p(56,16)} ${p(56,17)}V${y(23)}Q${p(56,24)} ${p(55,24)}H${x(32)}A8 8 0 0 ${1-clockwise} ${p(24,32)}V${y(55)}Q${p(24,56)} ${p(23,56)}H${x(17)}Q${p(16,56)} ${p(16,55)}V${y(32)}A16 16 0 0 ${clockwise} ${p(32,16)}Z`;
  });
  result = result.replace(/<g id="observation-frame"[\s\S]*?<\/g>/,
    `<g id="observation-frame" fill="url(#frame-paint)">\n${corners.map(d => `    <path d="${d}"/>`).join('\n')}\n  </g>`);
  for (const [id,path] of [
    ['orbit-open',band(42,264,8,.18)],
    ['orbit-bright-left',band(95.3,210.5,8,.55)],
    ['orbit-signal',band(290,334.5,7,.45)],
  ]) result = result.replace(new RegExp(`(<path id="${id}" d=")[^"]+`), `$1${path}`);
  return result.replace('16px 축소 보정형</title>', '브라우저 탭 전용</title>')
    .replace(/<desc id="desc">.*?<\/desc>/, '<desc id="desc">16 CSS px 탭 전용. 픽셀 경계에 맞춘 프레임과 대비를 높인 열린 궤도, 중심 구체와 금빛 신호점. 모든 화면 배율에서 눈금과 발광을 생략한다.</desc>')
    .replace('fill="#6687b9"','fill="#7c9bd0"');
}

await writeFile(new URL('sensor-lab-favicon.svg',root),faviconSvg());
for (const mode of ['primary','compact','light','monochrome']) {
  await writeFile(new URL(`sensor-lab-${mode}.svg`,root),svg(mode));
  for (const size of [32,24,16]) {
    await writeFile(new URL(`sensor-lab-${mode}-${size}.svg`,root),smallSvg(mode,size));
  }
}
console.log('Generated four SVG variants and twelve optical-size variants.');
