import { Scene, PerspectiveCamera, WebGLRenderer, HemisphereLight, DirectionalLight, OrbitControls, Vector3, Ks as Raycaster, nt as Vector2, SRGBColorSpace, ACESFilmicToneMapping } from '../../vendor/three-r180.js';
import { modelBounds } from '../../assets/devices/shared/bounds.js';
import { createWiringScene } from '../../assets/devices/wiring/scene.js';
import { WIRING_CHANNEL, WIRING_VERSION, validateViewerState } from '../../assets/devices/wiring/protocol.js';
import { wiringSetup as bmp280 } from '../../../src/catalog/sensors/bmp280/wiring.js';
import { wiringSetup as ds18b20 } from '../../../src/catalog/sensors/ds18b20/wiring.js';

// Only registered local definitions can supply models or connection information.
const setups = { bmp280, ds18b20 }, params = new URLSearchParams(location.search);
const setup = setups[params.get('sensor') ?? 'bmp280'];
const embedded = params.get('embed') === '1' && parent !== window;
document.body.dataset.embed = String(embedded);
const $ = id => document.getElementById(id), stage = $('stage');
let renderer, scene, camera, controls, resize, current, ready = false;
let state, optionsKey = '', signalButtons = [];
const raycaster = new Raycaster(), pointer = new Vector2();
function render() { if (renderer && scene && camera) renderer.render(scene, camera); }
function fail(error) { ready = false; document.body.dataset.ready = 'error'; $('loading').hidden = true; $('error').hidden = false; console.error(error); }
function frameView(view) {
  if (!current) return;
  const { center, size } = modelBounds(current.root);
  const detail = view === 'connector';
  const target = detail ? current.focus(state.wire) : center;
  const distance = Math.max(size.y, size.x / camera.aspect) / (2 * Math.tan(camera.fov * Math.PI / 360)) * 1.22 + size.z;
  const direction = view === 'front' ? new Vector3(0, 0, 1) : view === 'back' ? new Vector3(0, 0, -1) : new Vector3(-.18, .32, 1).normalize();
  controls.target.copy(target); camera.position.copy(target).addScaledVector(direction, Math.max(45, distance * (detail ? .56 : 1)));
  camera.lookAt(target); controls.update(); render();
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === view));
  $('detail').setAttribute('aria-pressed', String(detail));
}
function apply(next) {
  const normalized = validateViewerState(setup, next);
  const options = normalized.options;
  const signature = JSON.stringify(options);
  if (signature !== optionsKey) {
    const replacement = createWiringScene(setup.create(options));
    if (current) { scene.remove(current.root); current.dispose(); }
    current = replacement; scene.add(current.root); optionsKey = signature;
  }
  state = { ...normalized, options };
  current.select(current.availableSignals.has(state.wire) ? state.wire : null); current.setSeparation(state.explosion / 3);
  for (const select of $('options').querySelectorAll('select')) select.value = state.options[select.name];
  for (const button of signalButtons) {
    button.setAttribute('aria-pressed', String((button.dataset.signal || null) === state.wire));
    button.disabled = Boolean(button.dataset.signal) && !current.availableSignals.has(button.dataset.signal);
  }
  $('description').textContent = setup.wiring.find(wire => wire.id === state.wire)?.description ?? '연결부를 선택하면 해당 선을 강조해서 보여 줍니다.';
  frameView(state.view);
}
try {
  if (!setup) throw new Error('등록되지 않은 센서입니다.');
  $('title').textContent = setup.title; document.title = setup.title;
  state = { view: 'iso', wire: null, explosion: 0, options: { ...setup.defaults } };
  renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25; renderer.setClearColor('#edf1eb', 0);
  stage.append(renderer.domElement); renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('role', 'img'); renderer.domElement.setAttribute('aria-label', '배선 3D 그림. 방향키로 회전, 더하기와 빼기로 확대·축소, Home으로 전체 보기');
  scene = new Scene(); scene.add(new HemisphereLight('#ffffff', '#a2aea4', 2.6));
  for (const [x, y, z, color, power] of [[-70, 100, 130, '#ffffff', 3.3], [80, 10, -110, '#d7eaff', 2.4], [-20, -80, -40, '#ffe2bb', .9]]) {
    const light = new DirectionalLight(color, power); light.position.set(x, y, z); scene.add(light);
  }
  camera = new PerspectiveCamera(32, 1, 2, 1500); controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false; controls.minDistance = 25; controls.maxDistance = 1200; controls.addEventListener('change', render);
  function fit() { const { width, height } = stage.getBoundingClientRect(); if (!width || !height) return; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); frameView(state.view); }
  fit(); apply(state); resize = new ResizeObserver(fit); resize.observe(stage);
  for (const choice of setup.choices) {
    const label = document.createElement('label'), select = document.createElement('select');
    label.textContent = choice.label; select.name = choice.id;
    for (const value of choice.values) { const option = document.createElement('option'); option.value = value.id; option.textContent = value.label; select.append(option); }
    select.value = state.options[choice.id]; select.addEventListener('change', () => apply({ ...state, wire: null, options: { ...state.options, [choice.id]: select.value } }));
    label.append(select); $('options').append(label);
  }
  for (const wire of [{ id: '', role: '전체 연결' }, ...setup.wiring]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.signal = wire.id; button.textContent = wire.role;
    button.addEventListener('click', () => apply({ ...state, wire: wire.id || null })); $('connections').append(button); signalButtons.push(button);
  }
  for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => apply({ ...state, view: button.dataset.view, explosion: 0 }));
  $('detail').addEventListener('click', () => apply({ ...state, view: state.view === 'connector' ? 'iso' : 'connector', explosion: state.view === 'connector' ? 0 : 60 }));
  const zoom = factor => { camera.position.sub(controls.target).multiplyScalar(factor).clampLength(25, 1200).add(controls.target); controls.update(); render(); };
  $('zoom-in').addEventListener('click', () => zoom(.85)); $('zoom-out').addEventListener('click', () => zoom(1.18));
  renderer.domElement.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') apply({ ...state, view: 'iso', explosion: 0 });
    else if (['+', '=', '-'].includes(event.key)) zoom(event.key === '-' ? 1.15 : .87);
    else {
      const axis = new Vector3(...(['ArrowLeft', 'ArrowRight'].includes(event.key) ? [0, 1, 0] : [1, 0, 0]));
      camera.position.sub(controls.target).applyAxisAngle(axis, ['ArrowLeft', 'ArrowUp'].includes(event.key) ? .12 : -.12).add(controls.target); controls.update(); render();
    }
  });
  let down;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || embedded) return;
    const bounds = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - bounds.left) / bounds.width * 2 - 1, -(e.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(current.root, true).find(item => item.object.userData.signal);
    if (hit) apply({ ...state, wire: hit.object.userData.signal });
  });
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(new Error('WebGL context lost')); if (embedded) parent.postMessage({ channel: WIRING_CHANNEL, version: WIRING_VERSION, type: 'unavailable' }, location.origin); });
  ready = true; $('loading').hidden = true; document.body.dataset.ready = 'true'; apply(state);
} catch (error) { fail(error); }

if (embedded) window.addEventListener('message', event => {
  const data = event.data;
  if (event.source !== parent || event.origin !== location.origin || data?.channel !== WIRING_CHANNEL || data.version !== WIRING_VERSION
    || typeof data.requestId !== 'string' || data.requestId.length > 100 || !['prepare', 'apply-state'].includes(data.type)) return;
  const reply = type => parent.postMessage({ channel: WIRING_CHANNEL, version: WIRING_VERSION, requestId: data.requestId, type }, location.origin);
  if (!ready) { reply('error'); return; }
  try { if (data.type === 'prepare') reply('ready'); else { apply(data.state); reply('applied'); } } catch { reply('error'); }
});
if (embedded) parent.postMessage({ channel: WIRING_CHANNEL, version: WIRING_VERSION, type: ready ? 'scene-loaded' : 'unavailable' }, location.origin);
window.addEventListener('pagehide', event => { if (event.persisted) return; ready = false; resize?.disconnect(); controls?.dispose(); current?.dispose(); renderer?.dispose(); });
