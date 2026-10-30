# CircuitVision

An offline Android and React web workspace for turning **visible circuit features into a reviewed, editable schematic**. No Windows application or cloud AI service is used.

[Download Android APK](https://github.com/vikramaharshith/CircuitVision/releases/latest/download/CircuitVision.apk) · [Open web app](https://vikramaharshith.github.io/CircuitVision/)

## Install on Android

1. Open this repository's **Releases** page and download `CircuitVision.apk`.
2. Open the downloaded file. If Android asks, allow your browser or file manager to install this application.
3. Install and open CircuitVision. No Android Studio, account, or developer tools are needed.
4. For updates, install the newer APK over the old installation. Do not uninstall first if you want to retain local projects. Releases must use the same signing certificate and application ID.

Requires Android 6+ with a modern, WebAssembly-capable Android System WebView. Android 10+ is recommended. The core app needs no internet after installation. External pinout searches need internet. Web offline use requires a successful first load and completion of the service-worker asset cache; browser storage eviction can remove that cache.

## What the app does

- Capture circuit photographs with the Android camera through Capacitor; import existing images and attach individual component close-ups.
- Inspect with pinch zoom and pan. Crop by tapping two opposite corners. Cropping creates a new photograph and preserves the original.
- Run actual OpenCV grayscale/edge/contour analysis to propose component regions. Mark, edit, or remove regions manually.
- Read markings locally using Tesseract.js, a bundled worker, WASM cores, and English trained data.
- Estimate resistor color bands from RGB pixels; review orientation and color assignments and decode four- or five-band resistance values.
- Generate symbols for components and infer candidate connections from visible foreground continuity between two-pin component regions. Adjust threshold and light/dark foreground polarity.
- Select components in photos, schematics, or the component list. Selections share their photo-region identity across views.
- Edit type, value, marking, pin count and schematic position. Tap two numbered pins to connect them. Verify or remove inferred connections.
- Save multiple projects on device, export/import project JSON, and export SVG schematics. Android exports use the native share sheet.
- Open datasheet/pinout searches for the exact marking. Search results are not verified package pin assignments.

## Recognition scope — please read

This is an **assisted reconstruction tool**, not a validated general-purpose circuit reverse-engineering system. The algorithms process the supplied pixels; they do not return a hard-coded circuit. However, region detection is a contour heuristic, not a trained component classifier. Unknown regions stay unknown until identified. It can miss parts and include board markings or other shapes.

Visible-wire tracing only proposes connections for two-pin regions and assumes leads leave opposite ends of the longer side. It cannot see hidden PCB layers, reliably distinguish every crossing from a junction, or infer connections inside ICs. Inferred connections are dashed amber until reviewed. Multi-pin parts require manual pin assignment and connections. Never use inferred connectivity as proof of an electrical connection.

Resistor recognition depends on a tight, axis-aligned, well-lit crop. Metallic gold/silver bands are not reliably distinguishable from RGB alone and require correction. OCR confidence is not a guarantee. No real-board recognition accuracy benchmark is claimed.

Focus, exposure, flash, and camera zoom are provided by the installed Android camera application's supported interface. CircuitVision does not display nonfunctional custom camera controls or promise controls that a device camera does not expose.

## Development

Node 22+, Java 21, Android SDK platform 35 and build-tools 35 are used. SDK installation and license acceptance are developer requirements only.

```sh
npm ci
npm test
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

On Windows use `gradlew.bat`. Set `JAVA_HOME` and `ANDROID_HOME` for your installations. `npm run dev` starts the local React application. `npm run build` copies runtime assets from installed packages into `public/vendor` before building; no CDN is contacted by the application for OpenCV or OCR.

The OpenCV distribution and OCR assets dominate download size. Images are reduced to a maximum 1600-pixel long edge before processing to bound memory use. This is not a minimal custom OpenCV WASM build.

## Automated releases

Set these **repository Actions secrets** once, using a permanent signing key:

| Secret                      | Value                               |
| --------------------------- | ----------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64 of the release JKS keystore  |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                   |
| `ANDROID_KEY_ALIAS`         | Key alias, normally `circuitvision` |
| `ANDROID_KEY_PASSWORD`      | Private-key password                |

Never commit keys or passwords. Preserve an independent secure backup; GitHub does not allow retrieving secret values later. Do not generate a replacement key for each build. Release signing is a separate identity from your GitHub login.

Push a tag such as `v1.0.1`. The Android release workflow installs locked dependencies, tests, builds React, synchronizes Capacitor, decodes secrets into a temporary runner file, builds and verifies a signed APK, and publishes `CircuitVision.apk` and its SHA-256 checksum to Releases. The key is removed from the runner even on failure. Missing signing secrets fail the build rather than silently publishing an unsigned or debug APK.

Tags follow `vMAJOR.MINOR.PATCH`, with minor/patch less than 1000. Version codes are `major*1000000 + minor*1000 + patch`, so updates increase monotonically when semantic versions do. Rebuilding the same tag intentionally retains its version code.

In **Settings → Pages**, select **GitHub Actions** as the source. The web workflow validates tests, web compilation, and Android debug compilation before deploying Pages. Pull requests run checks without deploying. `VITE_GITHUB_REPOSITORY` sets the APK download destination when built in another repository.

## Privacy and storage

Photos and project data stay in app-private files on Android and IndexedDB in the browser. Android cloud backup is disabled. **Save project** explicitly saves the current project; export JSON for a portable backup. Clearing app/browser storage or uninstalling removes local projects. Opening a datasheet search sends the selected marking as a query to the external search provider.

## Source layout

- `src/App.tsx`: shared mobile/web interface and project editing.
- `src/vision.ts`: OpenCV region/connection inference and offline OCR.
- `src/resistors.ts`: band pixel analysis and electrical-value decoding.
- `src/model.ts`, `src/storage.ts`: project validation, persistence, exports.
- `android/`: complete Capacitor Android project and Gradle wrapper.
- `.github/workflows/`: web deployment, compilation checks and signed releases.
- `tests/`: algorithm and project-format regression checks.

See [VALIDATION.md](VALIDATION.md) for what has actually been tested and remaining device checks.
