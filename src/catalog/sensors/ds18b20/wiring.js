import { sensorbitSpec } from '../../../../public/assets/devices/sensorbit/spec.js';
import { requireInterface, validateAssembly } from '../../../../public/assets/devices/wiring/assembly.js';
import { terminalSpec } from '../../../../public/assets/devices/terminal-3p/spec.js';
import { probeSpec } from '../../../../public/assets/devices/ds18b20/spec.js';
export const wiring = [
  { id: 'vcc', board: '3V · 3.3V', sensor: 'VDD · VCC', role: '전원',
    description: 'USB와 배터리를 분리하세요. 프로브의 전원선을 터미널 모듈 VCC에 고정하고, 모듈의 VCC 핀을 확장 보드의 V(3V)에 연결하세요. 전압 선택이 가능하다면 3.3V로 맞추세요.' },
  { id: 'gnd', board: 'GND · G', sensor: 'GND', role: '접지',
    description: '프로브의 접지선을 터미널 모듈 GND에 고정하고, 모듈의 GND 핀을 확장 보드의 G에 연결하세요. 전원선과 접지선이 뒤바뀌지 않았는지 확인하세요.' },
  { id: 'dq1', board: 'P1 · 1', sensor: '프로브 1 DQ', role: '온도 1',
    description: '프로브 1의 데이터선(DQ·DATA)을 모듈 DAT에 고정하고, 모듈 DAT 핀을 P1의 신호(S) 단자에 연결하세요. CL·SCL은 연결하지 않아요.' },
  { id: 'dq2', board: 'P2 · 2', sensor: '프로브 2 DQ', role: '온도 2',
    description: '두 번째 키트의 DAT 핀은 P2의 신호(S)에 연결하세요. 전원과 접지는 P2의 V·G를 사용합니다. P1과 P2 데이터선을 서로 묶지 마세요. 하나만 쓸 때는 P2를 비워두고 넘어가세요.' },
];

export const wiringSetup = {
  id: 'ds18b20', title: 'DS18B20 배선', wiring,
  defaults: { probes: '2' },
  choices: [
    { id: 'probes', label: '프로브', values: [{ id: '1', label: '1개' }, { id: '2', label: '2개' }] },
  ],
  /** @param {Record<string,string>} options @param {any} board */
  create(options = {}, board = sensorbitSpec) {
    const probes = options.probes ?? this.defaults.probes;
    if (!['1', '2'].includes(probes)) throw new Error('지원하지 않는 프로브 구성입니다.');
    const signals = wiring.map((wire, i) => ({ ...wire, color: ['#db4854', '#344052', '#d29a18', '#168eac'][i] }));
    /** @type {any[]} */ const parts = [
      { id: 'board', spec: board, position: [-55, 0, 0] },
      { id: 'microbit', spec: { id: 'microbit-v2' }, position: board.microbitPose.position.map((value, i) => value + (i === 0 ? -55 : 0)), rotation: board.microbitPose.rotation },
    ];
    const cables = [];
    for (let index = 1; index <= Number(probes); index++) {
      const pin = `P${index}`, pins = requireInterface(board, pin, ['signal', 'power', 'ground']);
      const adapter = `terminal${index}`, probe = `probe${index}`, y = index === 1 ? -24 : -64;
      parts.push({ id: adapter, spec: terminalSpec, position: [4, y, 0] });
      parts.push({ id: probe, spec: probeSpec, position: [37, y, 3.5], requires: { DQ: pin, VCC: '3V', GND: 'GND' }, caption: { text: pin, position: [65, -9, 1] } });
      const names = [['signal', 'DAT', 'DQ', `dq${index}`], ['power', 'VCC', 'VCC', 'vcc'], ['ground', 'GND', 'GND', 'gnd']];
      // Order is physical: S/V/G at the board and DAT/VCC/GND at the adapter.
      cables.push({ id: `lead${index}`, kind: 'individual', leads: names.map(([role, name, , signal]) => ({ signal, color: signals.find(item => item.id === signal).color,
        from: { part: 'board', port: pins[role] }, to: { part: adapter, port: `header.${name}` } })) });
      cables.push({ id: `probe-cable${index}`, kind: 'sheathed', leads: names.map(([, name, target, signal]) => ({ signal,
        color: { DAT: '#d7c7a1', VCC: '#db4854', GND: '#344052' }[name],
        from: { part: adapter, port: `screw.${name}` }, to: { part: probe, port: target } })) });
    }
    return validateAssembly({ parts, cables, signals });
  },
};
