# Firmware sources and licenses

The current official V1 releases are `sensor-lab-temperature-v1`,
`sensor-lab-light-level-v1`, `sensor-lab-accelerometer-v1`,
`sensor-lab-magnetometer-v1`, and `sensor-lab-bmp280-v1`.
They are built from this repository's matching `firmware/examples/` sources
and shared `firmware/common/sensor-display.ts` (MIT). BMP280 also includes
`firmware/drivers/bmp280.ts` (MIT). Each downloadable `.ts` combines its
inputs; each release includes a build record and a partial-installation
`.bin` extracted from the same HEX. All five share the verified B runtime.
Pre-V1 `*-uart` artifacts have been retired and removed. Only historical
identity and protocol metadata remain for saved-record compatibility.
Build and publication commands are documented in `dev/firmware/README.md`.

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
