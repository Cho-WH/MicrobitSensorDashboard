import { prepareReportAssets, renderReportPages, PAGE_WIDTH, PAGE_HEIGHT } from './report-layout.js';

const download=(blob,name)=>{const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const svgImage=svg=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('보고서 그림을 불러오지 못했어요. 다시 시도해 주세요.'));image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
export async function exportWorksheet(kind,options) {
  if(!['png','print','preview'].includes(kind))throw new Error('지원하지 않는 활동지 출력 형식입니다.');
  options={...options,model:structuredClone(options.model)};
  // The standalone report uses system fonts in both Canvas and SVG; app web
  // fonts are not dependencies and must not delay preview or image export.
  const assets=await prepareReportAssets(options);
  let report,saveTimer,noticeTimer;
  const dialog=document.createElement('dialog');dialog.className='ui-dialog cp-print-dialog';dialog.setAttribute('aria-label','구심가속도 활동지');
  const heading=document.createElement('h2');heading.textContent='결과 보고서';heading.className='ui-dialog-title';heading.tabIndex=-1;
  const header=document.createElement('header');header.className='ui-dialog-header';header.append(heading);
  const body=document.createElement('div');body.className='ui-dialog-body';
  const author=document.createElement('aside');author.className='cp-report-author';author.setAttribute('aria-label','작성자 정보');
  const inputs=new Map(),pending=new Map();
  const status=document.createElement('p');status.className='cp-report-status';status.id='cp-report-status';status.setAttribute('role','status');
  const flush=()=>{clearTimeout(saveTimer);if(!pending.size)return;try{options.onAuthorChange?.(Object.fromEntries(pending));pending.clear();}catch(error){status.textContent=error.message;}};
  const pages=document.createElement('div');pages.className='cp-report-pages';
  const note=document.createElement('p');note.className='lab-note cp-report-note';
  function render(){
    report=renderReportPages(options,assets);pages.replaceChildren();
    for(const svg of report.pages){const page=document.createElement('section');page.className='cp-report-page';page.innerHTML=svg;pages.append(page);}
    note.textContent=report.smallest<9?'긴 답변은 글자가 작게 인쇄될 수 있으니 미리보기를 확인해 주세요.':'';
  }
  for(const [key,labelText] of [['reportClass','학급'],['reportNumber','학번'],['reportName','이름']]){
    const label=document.createElement('label'),input=document.createElement('input');label.textContent=labelText;
    input.type='text';input.maxLength=80;input.required=true;input.value=options.model.sheet.inputs[key]||'';input.setAttribute('aria-describedby',status.id);
    input.addEventListener('input',()=>{
      options.model.sheet.inputs[key]=input.value;pending.set(key,input.value);input.removeAttribute('aria-invalid');status.textContent='';
      clearTimeout(saveTimer);saveTimer=setTimeout(flush,400);render();
    });
    input.addEventListener('blur',flush);label.append(input);author.append(label);inputs.set(key,input);
  }
  author.append(status);
  function validate(){
    flush();const missing=[...inputs.values()].filter(input=>!input.value.trim());
    if(!missing.length)return true;
    for(const input of missing)input.setAttribute('aria-invalid','true');
    clearTimeout(noticeTimer);status.textContent='작성자 정보를 입력해주세요';
    missing[0].focus();missing[0].scrollIntoView({block:'nearest',behavior:'smooth'});
    noticeTimer=setTimeout(()=>{status.textContent='';},3500);return false;
  }
  const close=document.createElement('button');close.textContent='닫기';close.onclick=()=>dialog.close();
  const print=document.createElement('button');print.textContent='인쇄';print.onclick=()=>{
    if(!validate())return;
    body.scrollTop=0;dialog.scrollTop=0;document.body.classList.add('cp-printing');
    try{window.print();}finally{document.body.classList.remove('cp-printing');}
  };
  const save=document.createElement('button');save.textContent='이미지로 저장';save.className='primary';
  save.onclick=async()=>{
    if(!validate())return;
    save.disabled=true;status.textContent='';
    try {
      const pictures=await Promise.all(report.pages.map(svgImage));
      const canvas=document.createElement('canvas');canvas.width=PAGE_WIDTH*3;canvas.height=PAGE_HEIGHT*3*pictures.length;
      const context=canvas.getContext('2d');pictures.forEach((picture,index)=>context.drawImage(picture,0,index*PAGE_HEIGHT*3,canvas.width,PAGE_HEIGHT*3));
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('이미지를 만들지 못했어요. 다시 시도해 주세요.');
      download(blob,'구심가속도-보고서-'+options.model.sheet.id+'.png');
    }catch(error){status.textContent=error.message;}finally{save.disabled=false;}
  };
  const preview=document.createElement('div');preview.className='cp-report-preview';preview.append(note,pages);
  const actions=document.createElement('div');actions.className='ui-dialog-actions';actions.append(save,print,close);
  const footer=document.createElement('footer');footer.className='ui-dialog-footer cp-report-footer';footer.append(author,actions);
  render();body.append(preview);dialog.append(header,body,footer);document.body.append(dialog);
  dialog.addEventListener('close',()=>{flush();clearTimeout(noticeTimer);dialog.remove();},{once:true});dialog.showModal();heading.focus({preventScroll:true});body.scrollTop=0;
}
