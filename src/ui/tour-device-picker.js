import { element } from './dom.js';

// An app dialog, not a copy of the browser's Bluetooth permission prompt.
// The mock BLE boundary awaits selection and shares normal connection/reception handling.
export function createTourDevicePicker(host) {
  let active = null;
  function cancel() { active?.close(); }
  return {
    cancel,
    choose(device, { purpose = 'connect', mode = 'wireless' } = {}) {
      const installing = purpose === 'install';
      cancel();
      const anchor = document.activeElement;
      const dialog = element('dialog','ui-dialog tour-device-dialog');
      dialog.setAttribute('aria-labelledby','tour-device-title');
      const header = element('header','ui-dialog-header'), title = element('h2','ui-dialog-title',installing ? '설치할 micro:bit 선택' : '연결할 micro:bit 선택');
      title.id='tour-device-title';header.append(title);
      const body = element('div','ui-dialog-body'), status = element('p','lab-note',mode === 'usb' ? 'USB 장치를 찾고 있어요…' : '주변 장치를 찾고 있어요…');
      status.setAttribute('role','status');
      const row = element('label','tour-device-option'), radio = element('input');
      radio.type='radio';radio.name='tour-device';radio.value='microbit';
      row.append(radio,element('span','',device.name));row.hidden=true;
      const note=element('p','lab-note','둘러보기용 예시 장치입니다. 실제 장치 권한은 요청하지 않아요.');
      body.append(status,row,note);
      const footer=element('footer','ui-dialog-footer'),actions=element('div','ui-dialog-actions');
      const back=element('button','','취소'),connect=element('button','primary',installing ? '선택' : '연결');
      back.type=connect.type='button';connect.disabled=true;
      back.onclick=()=>dialog.close();radio.onchange=()=>{connect.disabled=!radio.checked;};
      connect.onclick=()=>{if(radio.checked)dialog.close('connect');};
      actions.append(back,connect);footer.append(actions);dialog.append(header,body,footer);host.append(dialog);active=dialog;
      const timer=setTimeout(()=>{row.hidden=false;status.textContent=installing ? '설치할 장치를 선택하세요.' : '장치를 선택한 뒤 연결하세요.';},450);
      return new Promise((resolve,reject)=>{
        dialog.addEventListener('close',()=>{
          clearTimeout(timer);if(active===dialog)active=null;dialog.remove();
          if(anchor instanceof HTMLElement&&anchor.isConnected)anchor.focus({preventScroll:true});
          if(dialog.returnValue==='connect')resolve(device);
          else reject(new DOMException('장치 선택을 취소했어요.','NotFoundError'));
        },{once:true});
        dialog.showModal();back.focus();
      });
    },
  };
}
