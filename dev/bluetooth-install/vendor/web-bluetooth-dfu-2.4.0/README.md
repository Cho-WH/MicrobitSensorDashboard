# Upstream browser bundle

- Package: `@thib3113/web-bluetooth-dfu@2.4.0`
- Repository: https://github.com/thib3113/web-bluetooth-dfu
- Download: https://registry.npmjs.org/@thib3113/web-bluetooth-dfu/-/web-bluetooth-dfu-2.4.0.tgz
- `secure-dfu.js` SHA-256: `ba9a281414de0bb98090db04bc4b6598294fd954bb1db29b011c9494dcba6f12`
- License: MIT; see LICENSE. Bundled dependency notices remain in the unmodified JS; original source map is retained.

The browser bundle and map are copied unchanged from the published package. Only the C development experiment loads this bundle. No npm install, application dependency, local protocol fork, or production integration is needed.

The caller uses `new SecureDfu()` with no transfer configuration overrides. Published v2.4.0 defaults are 100-byte packets, zero artificial delay, `forceRestart=true`, `enableSmartSpeed=false`, and PRN=0. The earlier caller-imposed 20-byte / 10 ms limits have been removed. One hardware temperature self-reinstall passed on Windows Chrome / micro:bit V2 [gugav]: 188,640 bytes, 25.502 seconds from bootloader selection to update completion (24.030 seconds for firmware phase), followed by matching program identity and three fresh 26°C samples. A later CLI light→temperature round trip completed with separate verification recovery after each immediate reconnect failed (about 33 seconds per transfer). Uninterrupted automatic reconnection and repeated reliability remain unresolved.

Source review note: the published PRN handler recognizes a leading `03`, whereas Nordic Secure DFU sends `60 03 01 <offset> <CRC>`. Its PRN wait also continues after a 3-second timeout. This observation does not add caller-side restrictions; PRN remains at the library default. The unmodified library uses explicit object CRC checks. Application glue requires full validated byte count and a resolved update before recording transfer completion, and stops on inactivity. Installation still requires independent board/program/sample checks.
