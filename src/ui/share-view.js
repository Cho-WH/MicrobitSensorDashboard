import { element, findElement } from './dom.js';
import { downloadUrl } from './download.js';
import { createToolLink } from '../sharing/tool-link.js';
import { createQr, qrPng } from '../sharing/qr-adapter.js';

/** Preview-only UI. Owns display/async work, never experiment or device state.
 * @param {HTMLElement} preview
 */
export function createShareView(preview) {
  const abort = new AbortController(), { signal } = abort;
  const mobile = element('button', 'tool-share-mobile', '도구 공유'); mobile.type = 'button';
  mobile.setAttribute('aria-haspopup', 'dialog'); mobile.setAttribute('aria-controls', 'tool-share-dialog');
  findElement(preview, 'div', '.preview-heading').append(mobile);
  const inline = findElement(preview, 'aside', '#tool-share-inline');
  const dialog = element('dialog', 'tool-share-dialog'); dialog.id = 'tool-share-dialog';
  const heading = element('h2'); heading.id = 'tool-share-title';
  const close = element('button', 'tool-share-close', '닫기'); close.type = 'button'; close.dataset.uiAction = 'quiet';
  const header = element('div', 'tool-share-dialog-heading'); header.append(heading, close); dialog.append(header);
  dialog.setAttribute('aria-labelledby', heading.id); preview.append(dialog);
  let url = '', title = '', filename = '', revision = 0, qr = null, anchor = null;
  function panel(host, expandable) {
    const note = element('p', 'tool-share-note', '실험 소개 화면으로 연결됩니다.');
    const image = element('div', 'tool-share-qr');
    const actions = element('div', 'tool-share-actions');
    const copy = element('button', '', '링크 복사'); copy.type = 'button'; copy.dataset.uiAction = 'primary';
    const save = element('button', '', 'QR 저장'); save.type = 'button';
    const status = element('p', 'tool-share-status'); status.setAttribute('role', 'status');
    const fallback = element('input', 'tool-share-url'); fallback.readOnly = true; fallback.hidden = true;
    fallback.setAttribute('aria-label', '직접 복사할 실험 소개 주소');
    actions.append(copy);
    let expand = null;
    if (expandable) {
      expand = element('button', '', '크게 보기'); expand.type = 'button';
      expand.setAttribute('aria-haspopup', 'dialog'); expand.setAttribute('aria-controls', dialog.id);
      expand.addEventListener('click', () => open(expand), {signal}); actions.append(expand);
    }
    actions.append(save); host.append(note, image, actions, fallback, status);
    copy.addEventListener('click', async () => {
      if (!url) return;
      const current = revision, value = url;
      try {
        await navigator.clipboard.writeText(value);
        if (current === revision) { status.textContent = '복사했어요.'; fallback.hidden = true; }
      } catch {
        if (current !== revision) return;
        status.textContent = '주소를 선택해 직접 복사해 주세요.';
        fallback.value = value; fallback.hidden = false; fallback.focus(); fallback.select();
      }
    }, {signal});
    save.addEventListener('click', async () => {
      if (!qr || save.disabled) return;
      const current = revision, name = filename, source = qr;
      save.disabled = true; save.setAttribute('aria-busy', 'true'); status.textContent = '';
      try {
        const blob = await qrPng(source);
        if (current !== revision) return;
        const objectUrl = URL.createObjectURL(blob);
        try { downloadUrl(objectUrl, name); } finally { setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); }
      } catch (error) { if (current === revision) status.textContent = error.message; }
      finally { if (current === revision) { save.disabled = !qr; save.removeAttribute('aria-busy'); } }
    }, {signal});
    return { image, copy, save, expand, status, fallback };
  }
  const label = element('h3', 'tool-share-label', '도구 공유'); inline.append(label);
  const panels = [panel(inline, true), panel(dialog, false)];
  function open(button) {
    anchor = button; heading.textContent = title; dialog.showModal();
  }
  mobile.addEventListener('click', () => open(mobile), {signal});
  close.addEventListener('click', () => dialog.close(), {signal});
  dialog.addEventListener('close', () => {
    if (!preview.hidden && anchor?.getClientRects().length) anchor.focus({preventScroll:true});
  }, {signal});
  return {
    /** @param {import('../domain/contracts.js').ExperimentContext} context */
    setTarget(context) {
      const current = ++revision; if (dialog.open) dialog.close();
      title = context.activity?.name ?? context.sensor.name;
      filename = (context.activity?.id ?? context.sensor.id) + '-qr.png';
      qr = null; url = '';
      for (const ui of panels) {
        ui.image.replaceChildren(); ui.image.setAttribute('aria-busy', 'true');
        ui.status.textContent = ''; ui.fallback.hidden = true; ui.fallback.value = '';
        ui.save.disabled = true; ui.save.removeAttribute('aria-busy');
        ui.copy.disabled = false; if (ui.expand) ui.expand.disabled = false;
      }
      try { url = createToolLink(context); }
      catch (error) {
        for (const ui of panels) { ui.copy.disabled = true; ui.image.removeAttribute('aria-busy'); ui.status.textContent = error.message; }
        return;
      }
      void createQr(url, title).then(svg => {
        if (current !== revision || signal.aborted) return;
        qr = svg;
        for (const ui of panels) { ui.image.replaceChildren(svg.cloneNode(true)); ui.image.removeAttribute('aria-busy'); ui.save.disabled = false; }
      }).catch(error => {
        if (current !== revision || signal.aborted) return;
        for (const ui of panels) { ui.image.removeAttribute('aria-busy'); ui.status.textContent = error.message; }
      });
    },
    dispose() { revision++; abort.abort(); dialog.remove(); mobile.remove(); inline.replaceChildren(); }
  };
}
