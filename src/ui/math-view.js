import { escapeHtml } from './scientific-notation.js';

let loader;
const cache=new Map(),requests=new WeakMap();
const load=()=>loader??=(import('../../public/vendor/mathjax-svg.js').catch(error=>{loader=null;throw error;}));
export async function mathSvg(tex,{display=false,size=18,description='수식'}={}) {
  const key=(display?'D:':'I:')+tex;
  let result=cache.get(key);
  if(!result){result=(await load()).typeset(tex,display);cache.set(key,result);if(cache.size>128)cache.delete(cache.keys().next().value);}
  const [x,y,w,h]=result.box,scale=size/1000,width=w*scale,height=h*scale,depth=Math.max(0,y+h)*scale;
  const svg=result.markup.replace(/<svg([^>]*)>/g,(_,attrs,offset)=>offset===0
    ?`<svg${attrs.replace(/ (?:width|height|style|role|focusable)="[^"]*"/g,'')} role="img" aria-label="${escapeHtml(description)}" width="${width}" height="${height}" style="vertical-align:-${depth}px">`
    :`<svg${attrs} aria-hidden="true">`);
  return {svg,width,height,depth};
}
// The current request owns each target: an older async render may not replace newer text.
export function setMath(target,tex,description,{display=false}={}) {
  const key=JSON.stringify([tex,description,display]);
  if(requests.get(target)?.key===key)return requests.get(target).promise;
  const request={key,promise:null};requests.set(target,request);
  target.classList.add('science-math');target.textContent=description;
  if(!tex){request.promise=Promise.resolve();return request.promise;}
  request.promise=mathSvg(tex,{description,display}).then(result=>{
    if(requests.get(target)!==request)return;
    target.innerHTML=result.svg;
  }).catch(()=>{if(requests.get(target)===request){target.textContent=description;requests.delete(target);}});
  return request.promise;
}
