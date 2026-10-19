# USB bundle reproduction

This is the upstream Gay-Lussac build at
`Cho-WH/bme280@59c5c149450f970bace2deaa183857c275595853`, with output paths changed
to `public/vendor/`. The browser uses only the two official exports in `entry.js`.

From this directory, with the repository's Node version:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
```

The checked-in `.npmrc` keeps the upstream lockfile's browser-only dependency
graph. Native Capacitor peer dependencies are not used by this bundle.
The build checks every bundled dependency against its license allowlist and
emits the full license texts and exact hashes. The local rebuild reproduced
the original 53,931-byte JavaScript exactly:
`04971f020a074892ba6fee6438683ef811270b29ae9f79a6389781cd4381726c`.

`microbit-usb-1.0.0.d.ts` is a manually maintained subset of the official 1.0.0
declarations for the APIs used by this app; it is not part of the generated code.
