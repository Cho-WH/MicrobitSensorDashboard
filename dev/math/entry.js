import { mathjax } from '@mathjax/src/mjs/mathjax.js';
import { TeX } from '@mathjax/src/mjs/input/tex.js';
import { SVG } from '@mathjax/src/mjs/output/svg.js';
import { liteAdaptor } from '@mathjax/src/mjs/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/mjs/handlers/html.js';
import '@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/mjs/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/mjs/input/tex/textmacros/TextMacrosConfiguration.js';
import '@mathjax/src/mjs/input/tex/unicode/UnicodeConfiguration.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document('', {
  InputJax: new TeX({packages:['base','ams','newcommand','textmacros','unicode'], maxBuffer:12000, maxMacros:1000}),
  // The app embeds a whole equation as one SVG, including inline equations.
  OutputJax: new SVG({fontCache:'none',linebreaks:{inline:false}}),
});
export function typeset(tex, display = false) {
  const node = document.convert(tex, {display, em:16, ex:8, containerWidth:100000});
  const svg = adaptor.firstChild(node);
  const markup = adaptor.outerHTML(svg).replace(/ data-latex="[^"]*"/g,'');
  if (markup.includes('data-mml-node="merror"')) throw new Error('수식 형식을 확인하세요.');
  return {markup, box:adaptor.getAttribute(svg,'viewBox').split(/\s+/).map(Number)};
}
