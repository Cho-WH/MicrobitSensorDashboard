# Source and third-party notices

Official micro:bit brand reference assets are archived under
`dev/design/reference/microbit-brand/`. Only the unmodified V2 compatibility
PNG is included in the app at `public/assets/branding/microbit-v2-compatible.png`;
the remaining archive is not included in the app build.
They belong to the Micro:bit Educational Foundation and are governed by its
[brand guidelines](https://www.microbit.org/brand-guidelines/), not this
repository's MIT license. The archive README and manifest preserve usage
boundaries, original download URLs, retrieval date and SHA-256 hashes.

M1 ports code from `Cho-WH/bme280`, fixed commit
`59c5c149450f970bace2deaa183857c275595853` (2026-10-19 review),
under the user's explicit instruction to reuse the Gay-Lussac implementation.
This app does not import a remote repository at runtime.

The retired dashboard source and its manual MakeCode guide were removed from
the working tree. The historical implementation remains at
[MicrobitSensorDashboard 5d80407](https://github.com/Cho-WH/MicrobitSensorDashboard/tree/5d804071108bc61056c1eaf15d143acfc3bf135a).
Adapted Bluetooth code, shared vendor assets and legacy CSV compatibility
fixtures retain their source references.

The common device assets in `public/assets/devices/` reuse the pinned BMP280
viewer's geometry, text and connector helpers. Its bundled Three.js r180 and
OrbitControls now live in one shared `public/vendor/three-r180.js` ES module;
BMP280 and DS18B20 use the shared `public/viewers/wiring/` viewer. The old
BMP280-specific scene and bridge have been replaced; provenance remains in
`public/viewers/bmp280/README.md`.
Three.js notices are preserved in `public/vendor/three-r180-LICENSE.txt`.
The micro:bit rear details, USB cable and open 2×AAA battery holder are local
additions/adaptations. Asset versions, source links and the upstream
application-code license qualification are recorded in
`public/assets/devices/README.md` and `manifest.json`.

| Original `gay-lussac/` paths | Local paths | Adaptation |
|---|---|---|
| `data/contracts.js` | `src/domain/` | Supply channels from saved sensor context; preserve validation of calculations and graphs |
| `data/run-store.js`, `repository.js` | `src/data/` | New database; generic immutable samples; preserve locks, revision acknowledgements, retries and atomic transactions |
| `measurement/session.js`, reception and continuity rules | `src/measurement/` | Explicit recording gate; activity rules injected from catalog |
| `analysis/*.js` | `src/analysis/` | Preserve algorithms, scopes, undo, evidence; remove fixed sensor columns and thermal presets |
| `data/files.js`, `import-validation.js`, `csv-import.js`, `compact-samples.js` | `src/data/files/` | New generic format; legacy validation and compact decoding retained at import boundary |
| `ui/analysis-*`, table, calculation, graph, reflection, range, help components and CSS | `src/ui/`, analysis section in `lab.html` | Preserve original interaction and virtualization; pass generic channels and activity content |
| `tests/*.test.mjs`, browser contracts | `tests/unit/`, `tests/browser/`, `tests/fixtures/` | Retain behavioral cases; real original exports provide compatibility expectations |

The upstream snapshot has no repository-wide LICENSE file. Its application
source provenance is recorded here; this notice does not assert an upstream
license or relicense that source under the local project's MIT license.
Before an external redistribution, the repository owner should explicitly
settle the application-source license. No upstream 3D assets or generated
illustrations are included in M1.

Third-party files retain their upstream headers and license texts:

- Chart.js 4.5.0: MIT; the app uses the pinned `vendor/chart.umd.js` bundle.
- idb 8.0.4: ISC; `public/vendor/idb-LICENSE`.
- Papa Parse 5.7.0: MIT; `public/vendor/papaparse-LICENSE`.
- Lucide SVG 0.468.0: ISC; `public/vendor/lucide-LICENSE`.
- Project Nayuki QR generator: MIT header in `vendor/qrcodegen.js`.
- MathJax source and MathJax TeX font 4.1.3: Apache-2.0;
  `public/vendor/mathjax-LICENSE`. The local SVG bundle is generated from
  `@mathjax/src` and `@mathjax/mathjax-tex-font`, pinned in `package-lock.json`.
  Sources: [MathJax-src](https://github.com/mathjax/MathJax-src/tree/4.1.3)
  and [MathJax-fonts](https://github.com/mathjax/MathJax-fonts).
  The app-specific build selects TeX input, SVG output and the TeX glyphs;
  see `dev/math/README.md` for modifications and reproduction.

Exact local hashes, source URLs and modification flags are in `vendor/manifest.json`.
TypeScript 5.9.3 is a development-only dependency pinned in `package-lock.json`.

M2 also adapts the same fixed snapshot's `guide/programmer-adapter.js` and
`program-config.js` into `src/device/programmer.js` and `firmware.js`. The
installer retains the official full-flash implementation, hash normalization,
V2 checks, progress semantics and cleanup, and adds the recording/save guard
and a local firmware allowlist. The upstream application-license qualification
above also applies to these adapted sources and the copied BMP280 HEX.

The USB bundle is reused byte-for-byte and was reproduced with the original
lockfile: `@microbit/microbit-connection` 1.0.0 (MIT),
`@microbit/microbit-universal-hex` 0.2.2 (MIT), and `nrf-intel-hex` 1.4.0
(BSD-3-Clause). Complete texts and package integrity values are in
`public/vendor/microbit-usb-LICENSES.md` and `microbit-usb-manifest.json`.
Rebuild commands are in `dev/usb-library/README.md`; only output paths and npm
peer-resolution configuration differ from the upstream build project.

The new magnetic-field HEX is a real Microsoft MakeCode compilation of this
repository's `firmware/examples/magnetometer.js`, with pinned compiler packages
and frozen official native runtime images. Rebuild commands and the distinction
between source compilation, cached native runtimes and physical validation are
in `dev/firmware/README.md`. Runtime sources and their preserved MIT, Apache,
Nordic and other component notices are listed in `public/firmware/NOTICES.md`.
`hardwareVerified` remains false for both sensors; automated HEX/source checks
do not establish successful installation or measurements on hardware.

M2's UX revision additionally ports/adapts the same pinned Gay-Lussac sources:

| Original `gay-lussac/` paths | Local paths | Adaptation |
|---|---|---|
| `ui/guide-view.js`, `guide.css`, preparation DOM | `src/ui/guide-view.js`, `guide.css`, archived `dev/design/archive/preparation-base.css` | Grouped steps, visual/instruction columns, previous/confirm navigation; sensor/activity content and typed controller facts |
| `ui/guide-layout.js` | `src/ui/guide-layout.js` | Stable wiring text height, reduced motion, observers and cleanup retained; typed parameters |
| `ui/action-help-content.js`, preparation lists | `src/catalog/sensors/*/content.js`, `src/catalog/activities/gay-lussac/content.js` | Contextual equipment and cable help through the already ported common help component |
| `ui/experiment-guide.js`, `experiment-guide.css`, guide DOM | `src/ui/experiment-guide.js`, `experiment-guide.css`, activity content | Four pages, keyboard navigation, focus return, recording note; content matches explicit recording gate |
| `guide/experiment-guide-preferences.js` | `src/guide/experiment-guide-preferences.js` | Suppression keyed by activity and guide version; no preparation proof stored |
| `assets/setup.svg`, `experiment-preparation.png`, `experiment-heating.png`, `experiment-analysis.png` | `public/activities/gay-lussac/` | Unmodified bytes; SHA-256 values in `vendor/manifest.json` |

The upstream application-license qualification also applies to these sources
and images. `public/activities/gay-lussac/README.md` records asset choices,
including the recording illustration replaced by an HTML instruction flow.
The channel selection/live value presentation follows the existing
MicrobitSensorDashboard `303a0bb957472d3a762ab05c6a2a043bedd29e8d` UI; it
uses the shared chart adapter and RunStore, with no second collection engine.

## Luminous V1 design preview assets

The app uses the unmodified Pretendard Variable 1.3.9 dynamic subsets by
Kil Hyung-jin, licensed under SIL OFL 1.1, from
https://github.com/orioncactus/pretendard/tree/v1.3.9/dist/web/variable.
The `pretendard` npm package version and integrity are pinned in `package-lock.json`.
The build copies the upstream CSS and WOFF2 subsets into `dist/public/vendor/pretendard/`,
alongside the existing LICENSE. The original full font's provenance remains in
`vendor/manifest.json`. No runtime CDN request is made.

esbuild 0.28.2 (MIT, https://github.com/evanw/esbuild) is a build-time development
dependency. JavaScript output retains linked third-party license comments.

The navigation and recording icons in `public/vendor/lucide/` are unmodified
Lucide 0.468.0 SVGs, using the existing `public/vendor/lucide-LICENSE`.
Each file's upstream source and hash are recorded in the same manifest.

The transparent PNGs in `public/assets/design/` are locally rendered derivatives
of the existing shared device models. Their staging source and provenance are
documented in `public/assets/design/README.md`; the existing model notices apply.
