import { assetUrl } from '../../../app/asset-url.js';
import { element } from '../../../ui/dom.js';
import { setText } from '../../../ui/text.js';
import { createCalibrationDemo } from './calibration-demo.js';

const copy = {
  disconnected: ['connection','micro:bit를 연결해요','연결한 뒤 나침반 보정 방법을 선택할 수 있어요.'],
  connecting: ['connection','micro:bit에 연결하고 있어요','장치 선택 창에서 사용할 micro:bit를 선택하세요.'],
  handshake: ['connection','자기장 프로그램을 확인하고 있어요','장치가 응답하면 보정을 시작하거나 이번 보정을 생략할 수 있어요.'],
  choice: ['calibration','나침반 보정을 준비해요','주변의 자석과 금속 물체를 치우세요. 처음 사용하는 장소에서는 보정을 권장해요.'],
  starting: ['calibration','보정 시작을 요청했어요','micro:bit의 응답을 기다리고 있어요.'],
  calibrating: ['calibration','보드를 천천히 기울여요','micro:bit LED 화면의 점을 채워 주세요. 보정이 끝나면 자동으로 측정값을 확인해요.'],
  skipping: ['calibration','보정 생략을 요청했어요','장치가 선택을 확인하면 측정값을 받아요.'],
  receiving: ['reception','새 측정값을 확인해요','보정이 끝났어요. 자기장값이 계속 들어오면 측정으로 넘어갈 수 있어요.'],
};

/** Compass-specific content and actions. The guide only provides a panel and navigation slot. */
export function createPreparationView(host, { onAction }) {
  const abort = new AbortController();
  const style = element('link'); style.rel='stylesheet'; style.href=assetUrl('./preparation.css',import.meta.url).href;
  const panel=element('div','magnetic-preparation');
  const demo=createCalibrationDemo(panel);
  const heading=element('h4'), detail=element('p'), status=element('p','magnetic-state');
  const video=element('a','magnetic-video','영상으로 보기');
  video.href='https://support.microbit.org/helpdesk/attachments/19031012156';video.target='_blank';video.rel='noopener noreferrer';
  video.setAttribute('aria-label','micro:bit 공식 보정 영상으로 보기 (새 창)');
  heading.tabIndex=-1; status.setAttribute('role','status');
  const actions=element('div','magnetic-actions'), start=element('button','primary','보정 시작'), skip=element('button','','이번 보정 생략');
  const hint=element('p','magnetic-hint','보정을 생략하면 측정값에 영향을 줄 수 있어요. 선택은 실험과 함께 남아요.');
  for (const [button,action] of /** @type {[HTMLButtonElement,string][]} */ ([[start,'calibrate'],[skip,'skip']])) {
    button.type='button'; button.dataset.deviceAction=action;
    button.addEventListener('click',()=>onAction(action),{signal:abort.signal});
  }
  actions.append(start,skip); panel.append(heading,detail,video,status,actions,hint); host.replaceChildren(style,panel);
  function describe(facts) {
    const phase=facts.connected?facts.devicePreparation?.phase??'handshake':facts.connecting?'connecting':'disconnected';
    const [stepId,title,description]=copy[phase]??copy.handshake;
    return {phase,stepId,title,description,hideValues:phase!=='receiving'};
  }
  return {
    supports: step => ['connection','calibration','reception'].includes(step?.id),
    handlesProgression: id => ['connection','calibration'].includes(id),
    describe(facts) {
      const result=describe(facts);
      if(result.phase==='receiving'&&facts.calibration==='skipped')result.description='이번 보정은 생략했어요. 자기장값이 계속 들어오면 측정으로 넘어갈 수 있어요.';
      return result;
    },
    render(facts, visible) {
      const state=describe(facts), choice=state.phase==='choice';
      const hadFocus=actions.contains(document.activeElement);
      host.hidden=!visible||!state.hideValues; panel.dataset.phase=state.phase;
      setText(heading,state.phase==='calibrating'?'LED 화면의 점을 채워 주세요':state.phase==='choice'?'준비되면 보정을 시작하세요':'장치와 함께 준비해요');
      setText(detail,state.phase==='calibrating'?'LED 면을 위로 두고, 여러 방향으로 천천히 기울여 주세요.':'연결과 보정을 마친 뒤 이곳에 자기장값이 나타나요.');
      video.hidden=!['choice','starting','calibrating'].includes(state.phase);
      demo.setActive(!host.hidden&&state.phase==='calibrating');
      setText(status,({handshake:'프로그램 응답 대기',starting:'시작 요청 중',calibrating:facts.mock?'모의 보정 진행 중':'보정 진행 중',skipping:'생략 확인 중',connecting:'연결 중',disconnected:'연결 대기'})[state.phase]??'');
      status.hidden=!status.textContent;
      actions.hidden=!choice; hint.hidden=!choice;
      start.disabled=skip.disabled=Boolean(facts.busy||facts.recording||facts.programmerState?.busy);
      if(hadFocus&&!choice&&!host.hidden)heading.focus({preventScroll:true});
    },
    dispose(){abort.abort();demo.dispose();host.replaceChildren();},
  };
}
