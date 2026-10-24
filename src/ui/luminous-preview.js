// V1 opt-in composition. Move the real controls before controller binding;
// recording, connection, persistence and navigation still have their existing owners.
import { element } from './dom.js';

export async function prepareLuminousPreview(root = document) {
  if (root.querySelector('.luminous-sidebar')) return;
  const doc = root.ownerDocument ?? root;
  doc.documentElement.dataset.visualTheme = 'luminous';
  const style = doc.createElement('link');
  style.rel = 'stylesheet'; style.href = new URL('./luminous-preview.css', import.meta.url).href;
  const loaded = new Promise((resolve, reject) => {
    style.onload = resolve; style.onerror = () => reject(new Error('디자인 미리보기 스타일을 불러오지 못했어요.'));
  });
  doc.head.append(style);
  const $ = selector => root.querySelector(selector);
  const rail = element('aside', 'luminous-sidebar');
  const logo = element('div', 'luminous-logo');
  const mark = element('span', 'luminous-mark'); mark.setAttribute('aria-hidden', 'true');
  logo.append(mark, $('.lab-brand h1'));
  const atmosphere = element('div', 'luminous-orbit'); atmosphere.setAttribute('aria-hidden', 'true');
  atmosphere.append(element('span'), element('i'));
  rail.append(logo, $('.lab-nav'), atmosphere, element('small', 'luminous-signature', 'micro:bit · 센서로 만나는 과학'));
  $('.lab-identity').before(rail);
  $('.lab-identity').append($('#file-tools'));
  $('.lab-toolbar').remove();

  const measure = $('[data-screen="measure"]');
  const panel = $('.measurement-panel');
  const heading = element('div', 'luminous-heading');
  const headingText = element('div');
  headingText.append(element('h2', '', '측정·기록'));
  const settings = element('button', 'luminous-settings', '장치·실험 설정');
  settings.type = 'button'; settings.setAttribute('aria-haspopup', 'dialog'); settings.setAttribute('aria-controls', 'measurement-settings');
  heading.append(headingText);
  $('.lab-identity').append(settings);

  const dialog = element('dialog', 'luminous-settings-dialog'); dialog.id = 'measurement-settings';
  dialog.setAttribute('aria-labelledby', 'measurement-settings-title');
  const preparation = $('.preparation-panel');
  preparation.querySelector('h2').id = 'measurement-settings-title';
  const close = element('button', 'luminous-close', '닫기'); close.type = 'button';
  dialog.append(preparation, close);
  measure.append(dialog);
  settings.addEventListener('click', () => dialog.showModal());
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if(settings.getClientRects().length) settings.focus({preventScroll:true}); });
  $('#prepare-device').addEventListener('click', () => dialog.close());

  const overview = element('div', 'luminous-overview');
  const device = element('div', 'luminous-device');
  const deviceImage = element('img');
  deviceImage.src = new URL('../../public/assets/design/luminous-board.png', import.meta.url).href;
  deviceImage.alt = 'micro:bit V2 앞면'; deviceImage.width = 1200; deviceImage.height = 1000;
  const connection = $('#connection-status').parentElement;
  connection.classList.add('luminous-connection');
  device.append(deviceImage, connection);
  const record = element('div', 'luminous-record');
  const recording = $('#recording-status').parentElement;
  recording.classList.add('luminous-record-state');
  record.append(recording, $('.recording-controls'), $('#sample-count'));
  overview.append(device, $('#live-cards'), record);

  const graph = element('div', 'luminous-graph');
  const graphHeading = $('.live-chart-heading');
  const channels = $('#display-channels');
  channels.setAttribute('role', 'group'); channels.setAttribute('aria-label', '그래프에 표시할 항목');
  graphHeading.querySelector('h3').after(channels);
  const graphFoot = element('div', 'luminous-graph-foot');
  graphFoot.append($('#measurement-reception'), $('#live-chart-summary'));
  graph.append(graphHeading, $('.lab-chart'), graphFoot);
  const notes = element('div', 'luminous-notes');
  const events = $('.measurement-events');
  events.open = true;
  notes.append(events, $('.note-controls'));
  const actions = element('div', 'luminous-activity');
  actions.append($('#activity-actions'), $('#show-experiment-guide'));
  const channelNote = $('.display-options > p');
  channelNote.classList.add('luminous-channel-note');
  preparation.append(channelNote);
  $('.display-options').remove();
  measure.replaceChildren(heading, overview, actions, graph, notes, dialog);
  panel.remove();
  await loaded;
}
