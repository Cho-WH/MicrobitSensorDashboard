import { prepareLuminousShell } from '../../src/ui/luminous-shell.js';

// The same template and composition as bootstrap.js, with injected data/device effects only.
// Restore document-wide presentation so running a suite alone and after another suite agree.
export async function mountLabFixture() {
  const url=new URL('../../lab.html',import.meta.url), response=await fetch(url);
  if(!response.ok)throw new Error('앱 HTML을 불러오지 못했습니다.');
  const template=new DOMParser().parseFromString(await response.text(),'text/html');
  const theme=document.documentElement.dataset.visualTheme, styles=new Set(document.head.querySelectorAll('link[rel=stylesheet]'));
  const host=document.createElement('div');host.className='browser-lab-fixture';document.body.append(host);
  host.getElementById=id=>host.querySelector('#'+CSS.escape(id));
  const dispose=()=>{
    host.remove();
    for(const style of document.head.querySelectorAll('link[rel=stylesheet]'))if(!styles.has(style))style.remove();
    if(theme===undefined)delete document.documentElement.dataset.visualTheme;else document.documentElement.dataset.visualTheme=theme;
  };
  async function reset() {
    host.replaceChildren(...[...template.body.children].filter(node=>!['SCRIPT','NOSCRIPT'].includes(node.tagName)).map(node=>document.importNode(node,true)));
    await prepareLuminousShell(host);
    if(!host.querySelector('.luminous-sidebar')||!host.querySelector('.luminous-overview')||!host.querySelector('#measurement-settings'))
      throw new Error('기본 앱 화면 구성을 거치지 않았습니다.');
  }
  try { await reset(); } catch(error) {dispose();throw error;}
  return {host,reset,dispose,showScreen(name) {
    for(const screen of host.querySelectorAll('[data-screen]'))screen.hidden=screen.dataset.screen!==name;
  }};
}

export function clickVisible(target) {
  if(!target?.isConnected||!target.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||target.disabled||target.closest('[inert]'))
    throw new Error('사용자가 누를 수 없는 조작: '+(target?.id||target?.textContent||'요소 없음'));
  const modal=[...target.ownerDocument.querySelectorAll('dialog[open]')].at(-1);
  if(modal&&!modal.contains(target))throw new Error('대화상자 뒤의 조작을 직접 눌렀습니다: '+(target.id||target.textContent));
  target.click();
}

// Only open real, visible UI entry points. Never remove hidden/inert or enable a control.
export function clickLabControl(root,selector) {
  const target=typeof selector==='string'?root.querySelector(selector):selector;
  if(!target)throw new Error('화면 조작 없음: '+selector);
  const settings=root.querySelector('#measurement-settings');
  if(settings?.contains(target)&&!settings.open)clickVisible(root.querySelector('.luminous-settings'));
  else if(settings?.open&&!settings.contains(target))clickVisible(settings.querySelector('.luminous-close'));
  const details=[];
  for(let node=target.parentElement;node&&node!==root;node=node.parentElement)
    if(node.tagName==='DETAILS'&&!node.open&&!node.querySelector('summary')?.contains(target))details.unshift(node);
  for(const node of details)clickVisible(node.querySelector('summary'));
  clickVisible(target);
}
