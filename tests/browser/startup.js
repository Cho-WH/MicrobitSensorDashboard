const check=(value,message)=>{if(!value)throw new Error(message);};
const url=path=>new URL('../../'+path,import.meta.url).href;
// Layout is reserved while loading; check actual visibility, not just a layout box.
const visible=node=>node.checkVisibility({visibilityProperty:true});
async function until(predicate,message) {
  const deadline=performance.now()+12000;
  while(!predicate()) {
    if(performance.now()>deadline)throw new Error(message);
    await new Promise(resolve=>setTimeout(resolve,40));
  }
}

// Exercise the shipped HTML, resource declarations and bootstrap in their own
// document. Only route/history are isolated; no production records are opened.
async function mount({failure=null,noScript=false}={}) {
  const response=await fetch(url('lab.html'));
  const source=new DOMParser().parseFromString(await response.text(),'text/html');
  const base=source.createElement('base');base.href=url('');source.head.prepend(base);
  const bootstrap=source.querySelector('script[src="src/app/bootstrap.js"]');bootstrap.remove();
  const mapping=source.createElement('script');mapping.type='importmap';
  const wrapper=`import {startApp as start} from ${JSON.stringify(url('src/app/startup.js?startup-test'))};
    export function startApp(root) {return start(root,{historyEnabled:false,initialUrl:${JSON.stringify(url('lab.html'))}});}`;
  mapping.textContent=JSON.stringify({imports:{[url('src/app/startup.js')]:failure==='module'
    ?url('tests/fixtures/missing-startup.js'):'data:text/javascript,'+encodeURIComponent(wrapper)}});
  source.head.prepend(mapping);
  if(failure==='style')source.querySelector('link[href="src/ui/luminous.css"]').setAttribute('href','tests/fixtures/missing-style.css');
  if(failure==='font') {
    const style=source.createElement('style');
    style.textContent="@font-face{font-family:StartupMissing;src:url('tests/fixtures/missing-font.woff2')}html[data-visual-theme]{--sl-font:StartupMissing,sans-serif}";
    source.head.append(style);
  }
  const frame=document.createElement('iframe');frame.title='기본 화면 시작 검사';
  frame.style.cssText='display:block;border:0;width:1100px;height:760px;max-width:none';
  if(noScript)frame.sandbox='allow-same-origin';
  const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
  frame.srcdoc='<!doctype html>'+source.documentElement.outerHTML;document.body.append(frame);
  await loaded;
  return {frame,doc:frame.contentDocument,win:frame.contentWindow,start(){
    const script=frame.contentDocument.createElement('script');script.src=url('src/app/bootstrap.js');
    frame.contentDocument.head.append(script);
  },dispose(){frame.remove();}};
}

export async function runStartupTests(report=()=>{}) {
  const initial=await mount();
  try {
    const {doc}=initial;
    const regions=[...doc.querySelectorAll('[data-app-region]')];
    const ids=[...doc.querySelectorAll('[id]')].map(node=>node.id);
    check(new Set(ids).size===ids.length,'정적 화면에 중복된 조작 ID가 있습니다.');
    check(regions.every(node=>node.inert)&&visible(doc.querySelector('#app-startup')),'초기화 전에 조작이 열리거나 로딩 안내가 없습니다.');
    check(!visible(doc.querySelector('[data-screen=home]')),'내용이 준비되기 전에 홈이 노출됩니다.');
    initial.start();
    await until(()=>doc.documentElement.dataset.appState==='ready','기본 화면 시작 실패');
    check(regions.every(node=>!node.inert)&&doc.querySelector('#app-startup').hidden,'준비 완료 후 조작이 잠겨 있습니다.');
    check(doc.querySelector('[data-screen=home]').checkVisibility()&&doc.querySelector('#lab-error').hidden,'초기 경로가 준비되지 않았습니다.');
    report('첫 접속 · 정적 기본 화면·중복 ID 없음·준비 전 조작 잠금·첫 경로 완료 후 공개');
  } finally {initial.dispose();}

  for(const failure of ['style','module']) {
    const fixture=await mount({failure});
    try {
      fixture.start();
      await until(()=>fixture.doc.documentElement.dataset.appState==='error',failure+' 실패 안내 누락');
      const notice=fixture.doc.querySelector('#app-startup');
      check(notice.checkVisibility()&&notice.getAttribute('role')==='alert'&&notice.textContent.includes('새로고침'),'자원 실패 복구 안내가 보이지 않습니다.');
      check([...fixture.doc.querySelectorAll('[data-app-region]')].every(node=>node.inert&&!node.checkVisibility()),'자원 실패 후 불완전한 조작이 열립니다.');
      report((failure==='style'?'스타일':'시작 모듈')+' 로딩 실패 · 복구 안내와 조작 잠금');
    } finally {fixture.dispose();}
  }
  const fallback=await mount({failure:'font'});
  try {
    fallback.start();
    await until(()=>fallback.doc.documentElement.dataset.appState==='ready','글꼴 실패가 앱 시작을 막았습니다.');
    report('글꼴 실패 · 대체 서체로 앱 시작');
  } finally {fallback.dispose();}
  const disabled=await mount({noScript:true});
  try {
    check(disabled.doc.querySelector('#app-startup').checkVisibility()&&disabled.doc.querySelector('#app-startup').textContent.includes('새로고침'),'스크립트가 실행되지 않으면 복구 안내도 사라집니다.');
    check([...disabled.doc.querySelectorAll('[data-app-region]')].every(node=>node.inert),'스크립트가 실행되지 않았는데 조작이 열립니다.');
    report('스크립트 미실행 · 정적 복구 안내 보존');
  } finally {disabled.dispose();}
}
