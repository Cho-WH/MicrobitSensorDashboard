import { sensorbitSpec } from '../../../../public/assets/devices/sensorbit/spec.js';
import { requireInterface, validateAssembly } from '../../../../public/assets/devices/wiring/assembly.js';
import { bmp280Spec } from '../../../../public/assets/devices/bmp280/spec.js';
export const wiring = [
  { id: 'vcc', board: 'V · 3.3V', sensor: 'VCC', role: '전원', description: 'USB와 배터리를 분리한 상태에서 연결하세요. 확장 보드의 V와 센서의 VCC를 연결합니다. 전압을 선택할 수 있다면 3.3V로 맞추세요.' },
  { id: 'gnd', board: 'G · GND', sensor: 'GND', role: '접지', description: '확장 보드의 G와 센서의 GND를 연결하세요. 전원 선과 접지 선이 서로 바뀌지 않았는지 확인합니다.' },
  { id: 'scl', board: 'CL · SCL · P19', sensor: 'SCL', role: '클록', description: '확장 보드의 CL과 센서의 SCL을 연결하세요. 보드에 따라 SCL 또는 P19로 표시됩니다. 정보를 주고받는 시점을 맞추는 선이에요.' },
  { id: 'sda', board: 'DA · SDA · P20', sensor: 'SDA', role: '데이터', description: '확장 보드의 DA와 센서의 SDA를 연결하세요. 보드에 따라 SDA 또는 P20으로 표시됩니다. 네 선의 양 끝이 올바른 단자에 꽂혔는지 확인하세요.' },
];

export const wiringSetup = {
  id: 'bmp280', title: 'BMP280 배선', wiring,
  defaults: { connector: 'socket' },
  choices: [{ id: 'connector', label: '연결선', values: [{ id: 'socket', label: '수–암' }, { id: 'pin', label: '암–암' }] }],
  /** @param {Record<string,string>} options @param {any} board */
  create(options = {}, board = sensorbitSpec) {
    const connector = options.connector ?? this.defaults.connector;
    if (!['socket', 'pin'].includes(connector)) throw new Error('지원하지 않는 연결선입니다.');
    const pins = requireInterface(board, `i2c-${connector}`, ['3V', 'GND', 'P19', 'P20']);
    // Restore the original row alignment under the selected header. Clock/data
    // line up vertically; V/G cross because the sensor's power pin order differs.
    const sensorX = board.ports[pins.P19].point[0] - bmp280Spec.ports.SCL.point[0];
    const signals = wiring.map((wire, i) => ({ ...wire, color: ['#db4854', '#344052', '#d29a18', '#168eac'][i] }));
    const targets = { vcc: ['3V', 'VCC'], gnd: ['GND', 'GND'], scl: ['P19', 'SCL'], sda: ['P20', 'SDA'] };
    return validateAssembly({ signals,
      parts: [
        { id: 'board', spec: board, position: [0, 0, 0] },
        { id: 'microbit', spec: { id: 'microbit-v2' }, ...board.microbitPose },
        { id: 'sensor', spec: bmp280Spec, position: [sensorX, -55, 1.8], requires: { VCC: '3V', GND: 'GND', SCL: 'P19', SDA: 'P20' } },
      ],
      cables: signals.map(signal => ({ id: signal.id, kind: 'individual', leads: [{ signal: signal.id, color: signal.color,
        from: { part: 'board', port: pins[targets[signal.id][0]] }, to: { part: 'sensor', port: targets[signal.id][1] } }] })),
    });
  },
};
