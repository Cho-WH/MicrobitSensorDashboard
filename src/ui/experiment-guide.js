import { createUuid } from '../domain/uuid.js';
// Adapted from G/ui/experiment-guide.js: page navigation, motion preference and focus return.
import { getGuideContent } from '../guide/steps.js';
import { createExperimentGuidePreferences } from '../guide/experiment-guide-preferences.js';
import { element, findElement } from './dom.js';
import { createPanelTransition } from './panel-transition.js';

/** @param {HTMLElement} host */
export function createExperimentGuide(host) {
  const dialog=element('dialog','ui-dialog experiment-guide'); dialog.dataset.dialogSize='wide'; host.append(dialog);
  const transition=createPanelTransition(dialog);
  const preferenceCache=new Map();
  let guide=null, pageIndex=0, preferences=null, recording=false, controller=new AbortController();
  /** @type {HTMLElement|null} */ let returnFocus=null;
  /** @type {HTMLElement[]} */ let pages=[];
  /** @type {HTMLButtonElement[]} */ let pageButtons=[];
  function showPage(index, animate=true) {
    const target=Math.max(0,Math.min(pages.length-1,index)), direction=target<pageIndex?-1:1;
    pages.forEach((page,i)=>{page.hidden=i!==target;});
    pageButtons.forEach((button,i)=>{if(i===target)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
    findElement(dialog,'button','[data-guide-previous]').disabled=target===0;
    findElement(dialog,'button','[data-guide-next]').textContent=target===pages.length-1?'측정하러 가기':'다음 →';
    findElement(dialog,'span','[data-guide-count]').textContent=`${target+1} / ${pages.length}`;
    findElement(dialog,'div','.experiment-guide-body').scrollTop=0;
    if (animate&&target!==pageIndex) transition.play([pages[target]], {
      frames:[{opacity:0,transform:`translateX(${direction*10}px)`},{opacity:1,transform:'translateX(0)'}],
    });
    else transition.cancel();
    pageIndex=target;
  }
  function build(next) {
    controller.abort(); controller=new AbortController(); const signal=controller.signal;
    guide=next;
    const key=`${next.id}@${next.version}`;
    if(!preferenceCache.has(key))preferenceCache.set(key,createExperimentGuidePreferences(next.id,next.version));
    preferences=preferenceCache.get(key);
    dialog.innerHTML=`<header class="ui-dialog-header"><div><p class="ui-dialog-label">실험 방법</p><h2 class="ui-dialog-title" tabindex="-1"></h2></div><button type="button" class="ui-dialog-close experiment-guide-close" aria-label="실험 방법 닫기">✕</button></header><nav class="experiment-guide-pages" aria-label="실험 방법 단계"></nav><div class="ui-dialog-body experiment-guide-body"></div><footer class="ui-dialog-footer"><div class="experiment-guide-paging"><button type="button" data-guide-previous>이전</button><span class="experiment-guide-count" data-guide-count></span><button type="button" class="primary" data-guide-next>다음 →</button></div><div class="experiment-guide-options"><label class="experiment-guide-preference"><input type="checkbox" data-suppress-guide>자동으로 열지 않기</label><p class="experiment-guide-recording" data-guide-recording>안내를 보는 동안에도 측정값은 기록돼요.</p></div></footer>`;
    const heading=findElement(dialog,'h2','h2'); heading.id='experiment-guide-'+createUuid(); heading.textContent=next.title; dialog.setAttribute('aria-labelledby',heading.id);
    const single=next.pages.length===1, label=next.label??'실험 방법';
    dialog.classList.toggle('experiment-guide-single',single);
    findElement(dialog,'p','.ui-dialog-label').textContent=label;
    findElement(dialog,'button','.experiment-guide-close').setAttribute('aria-label',`${label} 닫기`);
    findElement(dialog,'button','[data-guide-previous]').hidden=single;
    findElement(dialog,'span','[data-guide-count]').hidden=single;
    const body=findElement(dialog,'div','.experiment-guide-body'), nav=findElement(dialog,'nav','nav');
    nav.hidden=single;
    pages=[]; pageButtons=[];
    next.pages.forEach((page,index)=>{
      const button=element('button','ui-tab',`${index+1} ${page.label}`); button.type='button'; nav.append(button); pageButtons.push(button);
      const section=element('section','experiment-guide-page');
      const hasVisual=Boolean(page.image || page.flow?.length);
      section.classList.toggle('experiment-guide-text',!hasVisual);
      if (hasVisual) {
        const visual=element('figure','experiment-guide-visual');
        if (page.image) { const img=element('img','experiment-guide-image'); img.src=page.image; img.alt=page.alt; img.loading='lazy'; visual.append(img); }
        else {
          const flow=element('ol','experiment-recording-flow');
          for(const [name,text] of page.flow) {const li=element('li');li.append(element('strong','',name),element('span','',text));flow.append(li);}
          visual.append(flow);
        }
        if(page.caption)visual.append(element('figcaption','',page.caption));
        section.append(visual);
      }
      const copy=element('div','experiment-guide-copy');
      if(!single)copy.append(element('p','eyebrow',`STEP ${String(index+1).padStart(2,'0')}`));
      copy.append(element('h3','',page.title));
      if(!hasVisual&&page.caption)copy.append(element('p','experiment-guide-intro',page.caption));
      const list=element('ol','experiment-guide-instructions');
      for(const [title,text] of page.instructions){const li=element('li');li.append(element('h4','',title),element('p','',text));list.append(li);}
      copy.append(list);section.append(copy);if(page.caution)section.append(element('p','experiment-guide-caution',page.caution));
      body.append(section);pages.push(section);
      button.addEventListener('click',()=>showPage(index),{signal});
      button.addEventListener('keydown',event=>{
        const target=event.key==='ArrowRight'?(index+1)%pages.length:event.key==='ArrowLeft'?(index-1+pages.length)%pages.length:event.key==='Home'?0:event.key==='End'?pages.length-1:null;
        if(target===null)return;event.preventDefault();showPage(target);pageButtons[target].focus();
      },{signal});
    });
    findElement(dialog,'button','[data-guide-previous]').addEventListener('click',()=>showPage(pageIndex-1),{signal});
    findElement(dialog,'button','[data-guide-next]').addEventListener('click',()=>{if(pageIndex===pages.length-1)dialog.close();else showPage(pageIndex+1);},{signal});
    findElement(dialog,'button','.experiment-guide-close').addEventListener('click',()=>dialog.close(),{signal});
    const checkbox=findElement(dialog,'input','[data-suppress-guide]'); checkbox.addEventListener('change',()=>preferences.setSuppressed(checkbox.checked),{signal});
    dialog.addEventListener('close',()=>{transition.cancel();if(returnFocus?.isConnected&&returnFocus.getClientRects().length)returnFocus.focus({preventScroll:true});returnFocus=null;},{signal});
  }
  return {
    show(context,{automatic=false,anchor=document.activeElement}={}) {
      const next=getGuideContent(context).experimentGuide;if(!next||dialog.open)return false;
      if(!guide||guide.id!==next.id||guide.version!==next.version)build(next);
      if(automatic&&!preferences.shouldShow())return false;
      returnFocus=anchor instanceof HTMLElement?anchor:null;
      findElement(dialog,'input','[data-suppress-guide]').checked=preferences.isSuppressed();
      findElement(dialog,'p','[data-guide-recording]').hidden=!recording;
      showPage(0,false);dialog.showModal();preferences.markSeen();findElement(dialog,'h2','h2').focus({preventScroll:true});return true;
    },
    setRecording(active){recording=active;if(guide)findElement(dialog,'p','[data-guide-recording]').hidden=!active;},
    close(){returnFocus=null;recording=false;if(dialog.open)dialog.close();},
    dispose(){returnFocus=null;controller.abort();transition.dispose();if(dialog.open)dialog.close();dialog.remove();},
  };
}
