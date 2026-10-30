# Validation

This file records the checks performed for the initial implementation. Compilation is not proof of recognition accuracy or of camera behavior on physical devices.

## Automated checks

- TypeScript and production Vite build.
- Unit/regression checks for resistor values, RGB classification, band extraction from raster pixels, project validation, and pin/photo identity.
- Android release compilation and APK signature verification are recorded after the build completes.

## Required physical-device acceptance checks

No Android device was attached during initial development. Before treating this as a fully validated release, exercise:

1. Fresh install, first launch in airplane mode, camera capture and native camera return.
2. Supported camera focus, exposure, flash controls in the camera activity; capture close-ups.
3. Photo picker, pinch zoom, crop, OpenCV processing and OCR with airplane mode enabled.
4. Body orientation, lighting and color variation using real four/five-band resistors.
5. Hidden traces, crossing wires and ambiguous regions; confirm that manual corrections are necessary and that suggestions remain unverified.
6. Save/close/reopen multiple projects and recover from Android killing the activity while the camera is open.
7. Export SVG/JSON through the share sheet; import a previously exported project.
8. Install a higher-version APK signed with the same key over the old one, keeping projects intact.

There is no measured accuracy claim for arbitrary PCB or breadboard photographs. No real circuit test dataset was supplied. The implementation intentionally labels ambiguous regions and inferred wires for review.
