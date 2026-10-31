import { symbolSvg } from '../scientific-notation.js';
export const format = value => Number.isFinite(value) ? Math.abs(value)>=1e6 || (value!==0&&Math.abs(value)<.001) ? value.toExponential(3)
  : value.toLocaleString('ko-KR',{maximumFractionDigits:3}) : '—';
const valid = value => Number.isFinite(value) && value>=0;
// Component geometry follows the measured magnitude; the orbit diagram stays schematic.
const arrowMarker = (id,color) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${color}"/></marker>`;
export function componentRatios(mean) {
  if(!Number.isFinite(mean)||mean<9.8)return null;
  const diagonal=mean/9.8;
  return {vertical:1,horizontal:Math.sqrt(diagonal-1)*Math.sqrt(diagonal+1),diagonal};
}
export function componentSvg(mean, colors, width=420) {
  const context=document.createElement('canvas').getContext('2d');
  const textWidth=(text,size=13)=>{context.font=size+'px sans-serif';return context.measureText(text).width;};
  const ratios=componentRatios(mean),ready=ratios!==null;
  width=Math.max(280,width);
  const x=100,y=42,dy=108,bottom=y+dy;
  // One scale preserves vector ratios; fit the complete drawing inside the shared diagram height.
  const dx=ratios?dy*ratios.horizontal:0,right=x+dx;
  const corner=Math.min(13,dx/3);
  const description=ready?'센서 측정 평균에 비례한 성분 벡터. 중력가속도 g는 아래로, 구심가속도 a는 수평으로, 센서 가속도 Ā는 대각선으로 향합니다.':mean===null?'평균값을 구하면 성분 관계가 표시돼요.':'센서 가속도가 g보다 작아 성분을 나타낼 수 없어요.';
  const labelHalf=Math.max(textWidth('구심가속도 a'),textWidth('센서 가속도 Ā'))/2;
  const left=Math.min(x-26,x-30-textWidth('센서'),x-15-textWidth('중력가속도 g'),ready?right-labelHalf:12);
  const edge=ready?Math.max(x+26,right+labelHalf):Math.max(x+26,12+textWidth(description,12));
  const contentWidth=edge-left,height=124+Math.min(70,Math.max(48,(width-144)/2));
  const scale=Math.min(1,(width-24)/contentWidth);
  const offset=(width-contentWidth*scale)/2-left*scale,top=(height-184*scale)/2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${description}" style="font:13px sans-serif">
  <defs>${arrowMarker('cp-component-g',colors.text)}${arrowMarker('cp-component-a',colors.result)}${arrowMarker('cp-component-A',colors.sensor)}</defs><g transform="translate(${offset} ${top}) scale(${scale})">
  ${ready&&dx>0?`<path d="M${x} ${bottom}H${right}V${y}" stroke="${colors.text}" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="5 5" fill="none"/>
  <path d="M${x+corner} ${y}v${corner}h-${corner}M${right-corner} ${y}v${corner}h${corner}M${x} ${bottom-corner}h${corner}v${corner}" stroke="${colors.text}" stroke-opacity=".45" stroke-width="1.2" fill="none"/>`:''}
  <rect x="${x-26}" y="${y-8}" width="52" height="16" rx="2" fill="${colors.muted}" fill-opacity=".5" stroke="${colors.text}" stroke-width="1.5"/>
  <path d="M${x} ${y}V${bottom}" stroke="${colors.text}" stroke-width="2.5" fill="none" marker-end="url(#cp-component-g)"/>
  ${ready?`${dx>0?`<path d="M${x} ${y}H${right}" stroke="${colors.result}" stroke-width="2.5" fill="none" marker-end="url(#cp-component-a)"/>`:''}
  <path d="M${x} ${y}L${right} ${bottom}" stroke="${colors.sensor}" stroke-width="3" fill="none" marker-end="url(#cp-component-A)"/>`:''}
  <circle cx="${x}" cy="${y}" r="3" fill="${colors.text}"/>
  <g fill="${colors.text}">
  <text x="${x-30}" y="${y+24}" text-anchor="end">센서</text>
  <text x="${x-15}" y="${y+dy/2+5}" text-anchor="end">중력가속도 ${symbolSvg('g')}</text>
  ${ready?`<text x="${right}" y="${y-17}" text-anchor="middle">구심가속도 ${symbolSvg('a')}</text>
  <text x="${right}" y="${bottom+22}" text-anchor="middle" fill="${colors.sensor}">센서 가속도 ${symbolSvg('Ā')}</text>`: `<text x="12" y="${bottom+30}" font-size="12">${description}</text>`}
  </g></g></svg>`;
}
export function orbitSvg(radius,acceleration,colors,width=420,formulae=null) {
  const r=valid(radius)&&radius>0?radius:null,a=valid(acceleration)?acceleration:null;
  const R=Math.min(70,Math.max(48,(width-144)/2)),turn=R+15;
  const formulaWidth=formulae?Math.max(...formulae.slice(0,2).map(f=>f.width)):84;
  const contentWidth=2*turn+30+formulaWidth,left=(width-contentWidth)/2;
  const cx=left+turn,cy=112,formulaX=cx+R+35,height=cy+R+12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="원운동을 위에서 본 개념도. 중심에서 물체까지 반지름 r ${format(r)} m. 물체에서 중심을 향하는 구심가속도 a ${format(a)} m/s². 각속도 ω = 2π/T, 구심가속도 a = rω²." style="font:13px sans-serif">
  <defs>${arrowMarker('cp-inward',colors.result)}${arrowMarker('cp-rotation',colors.orbit)}</defs>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${colors.text}" stroke-opacity=".3" stroke-width="1.5"/>
  <path d="M${cx-turn*.866} ${cy-turn*.5}A${turn} ${turn} 0 0 1 ${cx+turn*.5} ${cy-turn*.866}" stroke="${colors.orbit}" stroke-width="2" fill="none" marker-end="url(#cp-rotation)"/>
  <path d="M${cx} ${cy}L${cx-R*.707} ${cy+R*.707}" stroke="${colors.text}" stroke-opacity=".6" stroke-width="1.5" stroke-dasharray="4 4"/>
  <path d="M${cx+R} ${cy}H${cx+15}" stroke="${colors.result}" stroke-width="3" fill="none" marker-end="url(#cp-inward)"/>
  <circle cx="${cx}" cy="${cy}" r="3" fill="${colors.text}"/><circle cx="${cx+R}" cy="${cy}" r="6" fill="${colors.orbit}"/>
  <g fill="${colors.text}" text-anchor="middle">
  <text x="${cx}" y="${cy-turn-12}" fill="${colors.orbit}">회전 방향</text>
  <text x="${cx-12}" y="${cy-13}">중심</text><text x="${cx+R+12}" y="${cy+5}" text-anchor="start">물체</text>
  <text x="${cx-R*.3535-10}" y="${cy+R*.3535-6}">${symbolSvg('r')}</text>
  <text x="${cx+(R+15)/2}" y="${cy+20}">${symbolSvg('a')}</text>
  </g>
  <g fill="${colors.text}" color="${colors.text}">
  ${formulae?formulae.map((f,i)=>`<g transform="translate(${formulaX} ${i?137:57})">${f.svg}</g>`).join(''): `<text x="${formulaX}" y="78">ω = 2π/T</text><text x="${formulaX}" y="151">a = rω²</text>`}
  </g></svg>`;
}
export function compareSvg(a,b,colors,vertical=false) {
  const width=vertical?96:320,height=vertical?180:84,max=Math.max(a,b),length=vertical?144:288;
  const guides=[],bars=[[a,colors.sensor],[b,colors.orbit]].map(([value,color],index)=>{
    const size=max>0?value/max*length:0;
    const end=vertical?162-size:16+size;
    if(size===0)return '';
    guides.push(`<path d="${vertical?`M16 ${end}H80`:`M${end} 12V72`}"/>`);
    return vertical?`<rect x="${22+36*index}" y="${end}" width="16" height="${size}" fill="${color}"/>`:`<rect x="16" y="${18+36*index}" width="${size}" height="12" fill="${color}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="0에서 시작하는 같은 축척의 막대 비교. 센서로 구한 구심가속도 ${format(a)}, 주기로 구한 구심가속도 ${format(b)} m/s²"><g fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="1">${guides.join('')}<path d="${vertical?'M16 162H80':'M16 12V72'}"/></g>${bars}</svg>`;
}
