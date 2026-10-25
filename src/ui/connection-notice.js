import { findElement } from './dom.js';
import { isAppleMobile } from '../device/browser-support.js';

const messages = {
  unsupported: {
    title: '이 브라우저에서는 실시간 측정을 할 수 없어요.',
    message: '측정하려면 Bluetooth 연결을 지원하는 브라우저에서 열어 주세요.',
    help: 'Windows·macOS·ChromeOS의 Chrome 또는 Android의 Chrome에서 열어 보세요. 기기의 Bluetooth와 브라우저 권한도 확인해 주세요.',
  },
  insecure: {
    title: '실시간 측정은 보안 연결에서 사용할 수 있어요.',
    message: '주소가 https://로 시작하는 센서 실험실에서 다시 열어 주세요.',
    help: '일반 HTTP 주소에서는 Bluetooth 연결 기능이 제한돼요. 선생님이나 사이트 관리자에게 HTTPS 주소를 확인해 주세요.',
  },
  blocked: {
    title: '이 페이지에서는 Bluetooth 연결이 제한되어 있어요.',
    message: '실험실을 별도 탭에서 직접 열거나 학교·브라우저의 접근 설정을 확인해 주세요.',
    help: '다른 사이트 안에 삽입된 화면이나 관리 설정에서 연결을 제한할 수 있어요. 실험실 주소를 직접 열어도 같다면 관리자에게 문의해 주세요.',
  },
};

/** One notice follows the active device-related screen. No modal, focus move or permission request.
 * @param {Document} root @param {{signal:AbortSignal}} options
 */
export function createConnectionNotice(root, { signal }) {
  const notice = findElement(root, 'aside', '#connection-notice');
  const title = findElement(notice, 'strong', '#connection-notice-title');
  const message = findElement(notice, 'p', '#connection-notice-message');
  const help = findElement(notice, 'details', '#connection-help');
  const helpMessage = findElement(notice, 'p', '#connection-help-message');
  const bluefy = findElement(notice, 'a', '#connection-bluefy');
  const iosHelp = findElement(notice, 'div', '#connection-ios-help');
  const copyAddress = findElement(notice, 'button', '#connection-copy-address');
  const copyStatus = findElement(notice, 'p', '#connection-copy-status');
  const fallback = findElement(notice, 'label', '#connection-copy-fallback');
  const addressInput = findElement(notice, 'input', '#connection-address');
  const win = notice.ownerDocument.defaultView;
  const ios = isAppleMobile();
  const anchors = {
    home: root.querySelector('.home-intro'),
    preview: root.querySelector('.preview-equipment'),
    prepare: root.querySelector('.preparation-heading'),
    measure: root.querySelector('.luminous-heading'),
  };
  let previous = '';
  copyAddress.addEventListener('click', async () => {
    const address = win.location.href, screenKey = previous;
    const current = () => !signal.aborted && !notice.hidden && previous === screenKey && win.location.href === address;
    try {
      if (!win.navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await win.navigator.clipboard.writeText(address);
      if (!current()) return;
      fallback.hidden = true;
      copyStatus.textContent = '주소를 복사했어요. 사용할 브라우저의 주소창에 붙여 넣어 주세요.';
    } catch {
      if (!current()) return;
      copyStatus.textContent = '자동으로 복사하지 못했어요. 아래 주소를 선택해 복사해 주세요.';
      addressInput.value = address;
      fallback.hidden = false;
      addressInput.focus(); addressInput.select();
    }
  }, { signal });
  return { render({ screen, support, busy = false }) {
    copyAddress.disabled = busy;
    const anchor = anchors[screen], text = messages[support];
    notice.hidden = !anchor || !text;
    if (notice.hidden) return;
    const key = screen + ':' + support;
    if (key === previous) return;
    previous = key;
    copyStatus.textContent = ''; fallback.hidden = true; addressInput.value = '';
    // Move the existing node only on navigation, keeping a single help disclosure.
    anchor.after(notice);
    notice.dataset.screenContext = screen;
    notice.dataset.support = support;
    title.textContent = text.title;
    const offerBluefy = ios && support === 'unsupported';
    message.textContent = offerBluefy
      ? '현재 주소를 복사하고 Bluefy 앱을 설치한 뒤, Bluefy의 주소창에 붙여 넣어 다시 접속해 주세요.' : text.message;
    helpMessage.textContent = text.help;
    bluefy.hidden = iosHelp.hidden = !offerBluefy;
    help.open = false;
  } };
}
