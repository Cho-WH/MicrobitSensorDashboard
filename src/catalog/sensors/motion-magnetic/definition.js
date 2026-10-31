import { accelerometer } from '../accelerometer/definition.js';
import { magnetometer } from '../magnetometer/definition.js';
import { getFirmwareArtifact } from '../../../device/firmware.js';

const artifact = getFirmwareArtifact('sensor-lab-motion-magnetic');
const channels = [...accelerometer.channels.map(channel => ({ ...channel })),
  { ...magnetometer.channels.find(channel => channel.id === 'magneticStrength'), color: '#197f88' }];

export const motionMagnetic = {
  id: 'motion-magnetic', version: 1, name: '내장 가속도·자기장 센서', releaseStage: 'beta', showOnHome: false,
  boards: ['micro:bit-v2'], codecId: artifact.codecId,
  channels, readout: accelerometer.readout, timeAxis: accelerometer.timeAxis,
  defaultVisibleChannelIds: ['accelerationStrength', 'magneticStrength'],
  firmware: { id: artifact.id, version: artifact.version, sha256: artifact.sha256, digestMode: artifact.digestMode,
    codecId: artifact.codecId, startCommand: artifact.startCommand, sampleIntervalMs: artifact.sampleIntervalMs,
    validation: 'hardware-unverified' },
  connectionPolicy: { ...magnetometer.connectionPolicy, requiredChannelIds: channels.map(channel => channel.id),
    waitingMessage: '새 가속도·자기장값을 기다리고 있어요.',
    timeoutMessage: '새 가속도·자기장값을 받지 못했어요. 전원과 프로그램을 확인하고 다시 연결하세요.' },
  defaultGraph: { ...accelerometer.defaultGraph,
    right: { yColumnId: 'magneticStrength', view: 'measured', trendEnabled: false } },
  preparation: ['micro:bit V2의 내장 가속도와 자기장 센서를 함께 사용합니다. 외부 배선은 필요하지 않습니다.',
    '가속도 X·Y·Z·크기와 자기장 크기를 함께 기록합니다. 가속도에는 중력의 영향이 포함됩니다.',
    '연결 후 자기장 보정을 시작하거나 이번 보정을 생략하세요. 보정할 때는 자석과 금속 물체를 멀리 두세요.'],
};
