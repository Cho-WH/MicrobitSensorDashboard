// Metadata only: retired pre-V1 firmware has no downloadable or installable artifact.
// Preserve historical identities for saved-data compatibility; never alias them to V1.
export const staleFirmware = Object.freeze([
  Object.freeze({"id":"temperature-uart","version":1,"sha256":"b0a9f224fe4d72a18de1b16372b1f2614c9ac8dd70ae479ec9fc16f919d33f3f","codecId":"temperature-csv-v1","startCommand":"start","sampleIntervalMs":1000,"stale":true}),
  Object.freeze({"id":"temperature-uart","version":2,"sha256":"cc80091a1d612acf540150c45a19eaf43663fab18f167c348fd64b7fdd7be09c","codecId":"temperature-csv-v1","startCommand":"start","sampleIntervalMs":1000,"stale":true}),
  Object.freeze({"id":"light-level-uart","version":1,"sha256":"d6621b414903e0e64ce5a5f9b85bad54549dd35ade5baf99301820e6051641a5","codecId":"light-level-csv-v1","startCommand":"start","sampleIntervalMs":100,"stale":true}),
  Object.freeze({"id":"light-level-uart","version":2,"sha256":"96b80c58d7b5d21c96aa419b0eddbbacfb78c67f23b0b2cac61bd774328b7825","codecId":"light-level-csv-v1","startCommand":"start","sampleIntervalMs":100,"stale":true}),
  Object.freeze({"id":"accelerometer-uart","version":1,"sha256":"5a790f86da1bd3d38fcebe4439a6a79f137491a4fe6663de8d2da15bee58ecaf","codecId":"accelerometer-csv-v1","startCommand":"start","sampleIntervalMs":100,"stale":true}),
  Object.freeze({"id":"accelerometer-uart","version":2,"sha256":"f11b72c01f8e8b602bb32cdc8e4491c2e6be682996e2a7a4741835e1d507b927","codecId":"accelerometer-csv-v1","startCommand":"start","sampleIntervalMs":100,"stale":true}),
  Object.freeze({"id":"bmp280-uart","version":1,"sha256":"481d3136ae9db5747066be9ef7f21604cb060799ab62ed3206bc9e78e1fb55ea","codecId":"bmp280-csv-v1","startCommand":"bme","sampleIntervalMs":100,"stale":true}),
  Object.freeze({"id":"bmp280-uart","version":2,"sha256":"bb78552c38756f1ea84f177f205346928f88fd1c450e1019d44b132693644380","codecId":"bmp280-csv-v1","startCommand":"bme","sampleIntervalMs":100,"stale":true}),
  Object.freeze({"id":"magnetometer-uart","version":2,"sha256":"d683634aa1b7ecaa18ab1578f5e20bd3ddf637eb1ba0c4c546b51e8a13c76b56","codecId":"magnetometer-csv-v2","startCommand":"prepare","sampleIntervalMs":100,"stale":true}),
  Object.freeze({"id":"magnetometer-uart","version":5,"sha256":"d30a8e969dd0e940a2ef465c94421c56a50660030321b8e14f3eaf5cbcb95570","codecId":"magnetometer-csv-v2","startCommand":"prepare","sampleIntervalMs":100,"stale":true}),
]);
