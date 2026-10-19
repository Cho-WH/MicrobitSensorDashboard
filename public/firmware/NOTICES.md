# Firmware sources and licenses

`bmp280-uart-v1.hex` is an unmodified copy of `firmware/bme_1.2.hex` from
[Cho-WH/bme280 at 59c5c149450f970bace2deaa183857c275595853](https://github.com/Cho-WH/bme280/tree/59c5c149450f970bace2deaa183857c275595853).
The upstream application snapshot has no repository-wide license; copying
this artifact under the user's reuse instruction does not relicense it under
this repository's MIT license. The original build inputs were not reproduced.

`magnetometer-uart-v2.hex` is compiled from this repository's
`firmware/examples/magnetometer.js` (MIT, see the repository `LICENSE`).
The downloadable `.ts` is an exact LF-normalized source copy. Build commands,
fixed versions, runtime-cache explanation and validation limits are documented
in `dev/firmware/README.md`; hashes are in `magnetometer-uart-v2.build.json`.

`temperature-uart-v1.hex`, `light-level-uart-v1.hex` and
`accelerometer-uart-v1.hex` are compiled from this repository's corresponding
`firmware/examples/{temperature,light-level,accelerometer}.js` sources (MIT).
Each downloadable `.ts` is an exact LF-normalized source copy; its matching
`.build.json` records the pinned toolchain, protocol and verified digest.
They use the same runtime components and preserved notices listed below.

Compiled runtimes retain their own licenses; the local application license
does not replace them. Upstream notice texts are preserved alongside the HEX:

| Component selected by the fixed MakeCode target | Source | Notice |
|---|---|---|
| Microsoft PXT target 9.1.1 / core 13.0.1 / common packages 14.0.2 | [pxt-microbit](https://github.com/microsoft/pxt-microbit/tree/v9.1.1), [pxt](https://github.com/microsoft/pxt), [pxt-common-packages](https://github.com/microsoft/pxt-common-packages) | `MakeCode-LICENSE` (MIT) |
| CODAL micro:bit V2 v0.3.5 | [fixed source](https://github.com/lancaster-university/codal-microbit-v2/tree/v0.3.5) | `CODAL-microbit-v2-LICENSE` (MIT) |
| CODAL core e6b061f2a6d8977811e3025da387d3007e5796f2 | [fixed source](https://github.com/lancaster-university/codal-core/tree/e6b061f2a6d8977811e3025da387d3007e5796f2) | `CODAL-core-LICENSE` (MIT) |
| CODAL nRF52 1fbb7240290fe36a55c61378f5cdeb7640f3ec4a | [fixed source](https://github.com/lancaster-university/codal-nrf52/tree/1fbb7240290fe36a55c61378f5cdeb7640f3ec4a) | `CODAL-nrf52-LICENSE` (MIT) |
| CODAL micro:bit Nordic SDK 4b8abc690f6c9fca6132e6db5ee13a795a263f88 | [fixed source](https://github.com/microbit-foundation/codal-microbit-nrf5sdk/tree/4b8abc690f6c9fca6132e6db5ee13a795a263f88) | `Nordic-SDK-LICENSE` (Nordic and included component notices) |
| Classic micro:bit DAL v2.2.0-rc6 | [fixed source](https://github.com/lancaster-university/microbit-dal/tree/v2.2.0-rc6) | `microbit-dal-LICENSE` (MIT) |
| mbed classic microbit_hfclk+mb6; BLE API v2.5.0+mb3 | [mbed](https://github.com/lancaster-university/mbed-classic/tree/microbit_hfclk%2Bmb6), [BLE](https://github.com/lancaster-university/BLE_API/tree/v2.5.0%2Bmb3) | `BLE-API-LICENSE`, `apache-2.0.txt` |
| nrf51822 v2.5.0+mb7 | [fixed source](https://github.com/lancaster-university/nrf51822/tree/v2.5.0%2Bmb7) | `nrf51822-LICENSE`, `softdevice_nrf51822_licence_agreement.txt`, `apache-2.0.txt` |
| nrf51 SDK v2.2.0+mb4 | [fixed source](https://github.com/lancaster-university/nrf51-sdk/tree/v2.2.0%2Bmb4) | `nrf51-sdk-LICENSE`, `BSD-3clause-Nordic.txt`, `apache-2.0.txt` |

The Nordic binaries and SDK code are for Nordic integrated circuits under
their preserved terms. These images target micro:bit hardware, and the app
restricts USB installation to micro:bit V2. The universal file also contains
the target's V1 section; that section is not used by the installer.
