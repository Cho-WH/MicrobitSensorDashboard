import { createDeviceScene } from '../../public/assets/devices/scenes.js';
const check=(condition,message)=>{if(!condition)throw new Error(message);};
async function waitFor(predicate){const deadline=performance.now()+10000;while(!predicate()&&performance.now()<deadline)await new Promise(r=>setTimeout(r,40));check(predicate(),'장치 뷰어 로드 시간 초과');}

export async function runDeviceTests(report) {
  const usb=createDeviceScene('usb'),battery=createDeviceScene('battery');
  try {
    const boardPosition=usb.board.position.clone(),inserted=usb.connector.position.clone(),batteryPosition=battery.connector.position.clone();
    usb.setSeparation(12);
    check(usb.connector.position.x===inserted.x&&usb.connector.position.z===inserted.z&&usb.connector.position.y===inserted.y+12,'USB 삽입축과 분리축 불일치');
    check(usb.board.position.equals(boardPosition),'커넥터 분리가 본체를 움직임');
    check(battery.connector.position.equals(batteryPosition),'다른 장면의 연결 상태를 함께 변경함');
    usb.setSeparation(0);check(usb.connector.position.equals(inserted),'USB 연결 위치 복원 실패');
    const cells=battery.pack.getObjectByName('aaa-cells').children;
    check(cells.length===2&&cells[0].userData.positiveEnd===-cells[1].userData.positiveEnd,'AAA 두 개의 직렬 배치 오류');
    check(cells.reduce((sum,c)=>sum+c.userData.voltage,0)===battery.pack.userData.nominalVoltage,'명목 전압과 전지 구성 불일치');
    battery.setCellsVisible(false);check(!battery.pack.getObjectByName('aaa-cells').visible&&battery.pack.getObjectByName('series-bridge').visible,'전지를 숨길 때 케이스 접점도 사라짐');
    report('공통 장치 · 독립 장면, 커넥터 삽입축, AAA 두 개의 극성과 직렬 연결');
  } finally {
    // Materials/textures are shared; dispose only the temporary instance geometry here.
    for(const asset of [usb,battery])asset.root.traverse(o=>o.geometry?.dispose());
  }
  const frame=document.createElement('iframe');frame.style.cssText='width:900px;height:700px';frame.src='/public/viewers/devices/';document.body.append(frame);
  try {
    await waitFor(()=>!!frame.contentDocument?.body?.dataset.ready);
    const doc=frame.contentDocument;
    check(doc.body.dataset.ready==='true','3D 장치 초기화 실패');
    const canvas=doc.querySelector('canvas');check(canvas.width>0&&canvas.height>0,'장치 캔버스 누락');
    for(const kind of ['usb','battery','board']){
      doc.querySelector(`[data-scene="${kind}"]`).click();
      check(doc.querySelector(`[data-scene="${kind}"]`).getAttribute('aria-pressed')==='true','장면 선택 표시 누락');
      check(doc.getElementById('connection').hidden===(kind==='board'),'연결 조작 경계 오류');
      check(doc.getElementById('cells-control').hidden===(kind!=='battery'),'배터리 전용 조작 경계 오류');
    }
    doc.querySelector('[data-part="motion"]').click();check(doc.getElementById('view-label').textContent.includes('자기장'),'부품 초점 안내 누락');
    doc.querySelector('[data-view="front"]').click();check(doc.querySelector('[data-part="motion"]').getAttribute('aria-pressed')==='false','시점 전환 후 부품 초점 상태가 남음');
    report('장치 뷰어 · 세 장면, 부품 초점·시점 전환과 전용 조작');
  } finally {frame.remove();}
}
