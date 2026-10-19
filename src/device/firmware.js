// The installer resolves this checked-in allowlist; files and share links cannot add URLs.
const freeze = value => { Object.values(value).forEach(child => { if (child && typeof child === 'object') freeze(child); }); return Object.freeze(value); };
export const firmwareManifest = freeze({
  'temperature-uart': {
    id: 'temperature-uart', version: 1, name: '내장 온도 센서 프로그램', fileName: 'temperature-uart-v1.hex',
    url: new URL('../../public/firmware/temperature-uart-v1.hex', import.meta.url).href,
    boards: ['micro:bit-v2'], sha256: 'b0a9f224fe4d72a18de1b16372b1f2614c9ac8dd70ae479ec9fc16f919d33f3f',
    digestMode: 'utf8-crlf-to-lf', codecId: 'temperature-csv-v1', startCommand: 'start', sampleIntervalMs: 1000,
    hardwareVerified: false,
    verification: { hexReader: 'official-v2-reader', embeddedSource: 'exact-normalized-match', embeddedConfig: 'matched', hardware: 'pending' },
    source: { repository: 'https://github.com/Cho-WH/MicrobitSensorDashboard', path: 'firmware/examples/temperature.js',
      build: 'dev/firmware/build.mjs', buildRecord: 'public/firmware/temperature-uart-v1.build.json', target: 'pxt-microbit@9.1.1', compiler: 'pxt-core@13.0.1' },
  },
  'light-level-uart': {
    id: 'light-level-uart', version: 1, name: '내장 밝기(조도) 센서 프로그램', fileName: 'light-level-uart-v1.hex',
    url: new URL('../../public/firmware/light-level-uart-v1.hex', import.meta.url).href,
    boards: ['micro:bit-v2'], sha256: 'd6621b414903e0e64ce5a5f9b85bad54549dd35ade5baf99301820e6051641a5',
    digestMode: 'utf8-crlf-to-lf', codecId: 'light-level-csv-v1', startCommand: 'start', sampleIntervalMs: 100,
    hardwareVerified: false,
    verification: { hexReader: 'official-v2-reader', embeddedSource: 'exact-normalized-match', embeddedConfig: 'matched', hardware: 'pending' },
    source: { repository: 'https://github.com/Cho-WH/MicrobitSensorDashboard', path: 'firmware/examples/light-level.js',
      build: 'dev/firmware/build.mjs', buildRecord: 'public/firmware/light-level-uart-v1.build.json', target: 'pxt-microbit@9.1.1', compiler: 'pxt-core@13.0.1' },
  },
  'accelerometer-uart': {
    id: 'accelerometer-uart', version: 1, name: '내장 가속도 센서 프로그램', fileName: 'accelerometer-uart-v1.hex',
    url: new URL('../../public/firmware/accelerometer-uart-v1.hex', import.meta.url).href,
    boards: ['micro:bit-v2'], sha256: '5a790f86da1bd3d38fcebe4439a6a79f137491a4fe6663de8d2da15bee58ecaf',
    digestMode: 'utf8-crlf-to-lf', codecId: 'accelerometer-csv-v1', startCommand: 'start', sampleIntervalMs: 100,
    hardwareVerified: false,
    verification: { hexReader: 'official-v2-reader', embeddedSource: 'exact-normalized-match', embeddedConfig: 'matched', hardware: 'pending' },
    source: { repository: 'https://github.com/Cho-WH/MicrobitSensorDashboard', path: 'firmware/examples/accelerometer.js',
      build: 'dev/firmware/build.mjs', buildRecord: 'public/firmware/accelerometer-uart-v1.build.json', target: 'pxt-microbit@9.1.1', compiler: 'pxt-core@13.0.1' },
  },
  'bmp280-uart': {
    id: 'bmp280-uart', version: 1, name: 'BMP280 센서 프로그램', fileName: 'bmp280-uart-v1.hex',
    url: new URL('../../public/firmware/bmp280-uart-v1.hex', import.meta.url).href,
    boards: ['micro:bit-v2'], sha256: '481d3136ae9db5747066be9ef7f21604cb060799ab62ed3206bc9e78e1fb55ea',
    digestMode: 'utf8-crlf-to-lf', codecId: 'bmp280-csv-v1', startCommand: 'bme', sampleIntervalMs: 100,
    hardwareVerified: false,
    verification: { hexReader: 'official-v2-reader', hardware: 'pending',
      upstream: 'communication-verified in source repository; not repeated on this app' },
    source: { repository: 'https://github.com/Cho-WH/bme280', commit: '59c5c149450f970bace2deaa183857c275595853',
      path: 'firmware/bme_1.2.hex', programVersion: 'bme 1.2' },
  },
  'magnetometer-uart': {
    id: 'magnetometer-uart', version: 2, name: '내장 자기장 센서 프로그램', fileName: 'magnetometer-uart-v2.hex',
    url: new URL('../../public/firmware/magnetometer-uart-v2.hex', import.meta.url).href,
    boards: ['micro:bit-v2'], sha256: 'd683634aa1b7ecaa18ab1578f5e20bd3ddf637eb1ba0c4c546b51e8a13c76b56',
    digestMode: 'utf8-crlf-to-lf', codecId: 'magnetometer-csv-v2', startCommand: 'prepare', sampleIntervalMs: 100,
    hardwareVerified: false,
    verification: { hexReader: 'official-v2-reader', embeddedSource: 'exact-normalized-match', hardware: 'pending',
      embeddedConfig: 'matched' },
    source: { repository: 'https://github.com/Cho-WH/MicrobitSensorDashboard',
      path: 'firmware/examples/magnetometer.js', build: 'dev/firmware/build.mjs', buildRecord: 'public/firmware/magnetometer-uart-v2.build.json',
      target: 'pxt-microbit@9.1.1', compiler: 'pxt-core@13.0.1' },
  },
});

export function getFirmwareArtifact(id, version = null) {
  if (typeof id !== 'string' || !Object.hasOwn(firmwareManifest, id) || (version !== null && firmwareManifest[id].version !== version))
    throw Object.assign(new Error('선택한 센서의 프로그램 버전을 찾지 못했어요.'), { code: 'unknown-firmware' });
  return firmwareManifest[id];
}
