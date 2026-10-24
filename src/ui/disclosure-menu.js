// Shared by file export and graph shape. Native details supplies keyboard
// opening; selection, Escape and outside clicks close and restore focus.
/** @param {HTMLDetailsElement} menu @param {{signal?:AbortSignal}} options */
export function bindDisclosureMenu(menu,{signal}={}) {
  const summary=menu.querySelector('summary'),doc=menu.ownerDocument;
  menu.addEventListener('click',event=>{
    if(event.target instanceof Element&&event.target.closest('button:not(:disabled)')){menu.open=false;summary.focus();}
  },{signal});
  menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&menu.open){event.preventDefault();event.stopPropagation();menu.open=false;summary.focus();}
  },{signal});
  doc.addEventListener('click',event=>{if(event.target instanceof Node&&!menu.contains(event.target))menu.open=false;},{signal});
}
